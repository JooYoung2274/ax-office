import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { ReportEngine, AnthropicLlmClient } from '@axaxax/report-engine';
import type { ReportKind } from '@axaxax/report-engine';
import type { Cro } from '@axaxax/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, JOB_REPORT, QUEUE_REPORT } from '../common/constants';
import { ReportService } from './report.service';

interface ReportJobData {
  reportId: string;
  batchId: string;
  croId: string;
  tenantId: string;
  kind: 'cash' | 'closing';
}

/**
 * report-queue 프로세서 — PRD §6.3 [3] / §5.3.
 * 검증 통과(CALCULATED) 배치만 진입(생성 서비스가 BLOCKED 차단).
 * CRO를 컨텍스트로 ReportEngine(Claude) 호출 → Draft 또는 사람 큐(NEEDS_HUMAN).
 *
 * 재시도 정책:
 *  - CRO 부재/blockedAI = UnrecoverableError(즉시 fail).
 *  - LLM 일시 오류(키 누락 포함)는 BullMQ 재시도에 맡긴다.
 */
@Processor(QUEUE_REPORT, { concurrency: 4 })
export class ReportProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportProcessor.name);
  private readonly engine: ReportEngine;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reports: ReportService,
  ) {
    super();
    // ANTHROPIC_API_KEY/ANTHROPIC_MODEL은 env에서 읽는다. 키 없으면 generate() 호출 시 throw.
    this.engine = new ReportEngine(new AnthropicLlmClient());
  }

  async process(job: Job<ReportJobData>): Promise<{ status: string }> {
    if (job.name !== JOB_REPORT) return { status: 'skip' };
    const { reportId, croId, kind } = job.data;
    this.logger.log(`report 시작 report=${reportId}`);

    const calc = await this.prisma.calculationResult.findUnique({ where: { id: croId } });
    if (!calc) {
      throw new UnrecoverableError('CRO 부재 — 리포트 생성 불가.');
    }
    if (calc.blockedAI) {
      throw new UnrecoverableError('FATAL 검증 — AI 호출 차단(BLOCKED).');
    }

    const cro = calc.cro as unknown as Cro;

    // 감사: AI 호출 메타(모델·CRO 해시)는 ReportEngine 호출 전 기록.
    await this.audit.log({
      action: AuditAction.AI_INVOKED,
      targetType: 'Report',
      targetId: reportId,
      croHash: calc.inputsHash,
      metadata: { model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8', croId },
    });

    try {
      const outcome = await this.engine.generate(cro, kind as ReportKind);
      await this.reports.persistGeneration({
        reportId,
        content: outcome.content,
        guard: outcome.guard,
        confidence: outcome.content.confidence,
        regenCount: outcome.regenCount,
        status: outcome.status,
        croHash: calc.inputsHash,
        usage: outcome.usage,
      });
      await job.updateProgress(100);
      this.logger.log(`report 완료 report=${reportId} status=${outcome.status}`);
      return { status: outcome.status };
    } catch (err) {
      // 일시 오류는 재시도. 마지막 시도까지 실패하면 CALCULATED로 롤백(재생성 가능).
      this.logger.error(`report 실패 report=${reportId}: ${(err as Error).message}`);
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.reports.rollbackToCalculated(reportId);
      }
      throw err;
    }
  }
}
