import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  runCalcEngine,
  ENGINE_VERSION,
  type CalcEngineInput,
  type RawDataset,
  type RawRow,
  type Cro,
} from '@axaxax/calc-engine';
import { assembleDatasets, type BatchRows } from './assemble';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  bullJobId,
  DEFAULT_JOB_OPTS,
  JOB_CALC,
  QUEUE_CALC,
} from '../common/constants';

/**
 * CalcService — 결정론 엔진(@axaxax/calc-engine) 래핑. PRD §6.1 CalcModule.
 * ⚠️ 이 모듈은 절대 Claude를 호출하지 않는다(계산은 AI 없이 독립 완결).
 */
@Injectable()
export class CalcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUE_CALC) private readonly calcQueue: Queue,
  ) {}

  /** 계산·검증 재실행 트리거(POST /batches/:id/calculate). */
  async triggerCalc(batchId: string) {
    const batch = await this.getBatchOwned(batchId);
    await this.calcQueue.add(
      JOB_CALC,
      { batchId: batch.id, tenantId: batch.tenantId },
      { ...DEFAULT_JOB_OPTS, jobId: bullJobId(JOB_CALC, batch.id) },
    );
    return { batchId: batch.id, status: 'CALCULATING' };
  }

  /**
   * 기간 단위 계산 — 같은 (tenant, domain, period)의 매핑 완료 배치들을 모아
   * assembleDatasets로 kind별 병합 후 runCalcEngine 1회 실행.
   * cash CRO는 계좌마스터+거래내역+스케줄 3종이 한 번에 필요하므로 단일 배치로는 부족(W2).
   * 결과 CRO를 (트리거 배치에 링크된) CalculationResult로 봉인하고 lifecycle 전이. (멱등)
   */
  async runForBatch(batchId: string): Promise<{ croId: string; blockedAI: boolean }> {
    const batch = await this.prisma.uploadBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('배치를 찾을 수 없습니다.');

    // 같은 (tenant, domain, period)의 모든 배치(기간 단위 스냅샷).
    const periodBatches = await this.prisma.uploadBatch.findMany({
      where: { tenantId: batch.tenantId, domain: batch.domain, period: batch.period },
      orderBy: { createdAt: 'asc' },
    });

    const batchRows: BatchRows[] = [];
    const hashes: string[] = [];
    for (const b of periodBatches) {
      const dataset = await this.prisma.rawDataset.findUnique({ where: { batchId: b.id } });
      if (!dataset) continue;
      const rows = await this.prisma.rawRow.findMany({
        where: { datasetId: dataset.id, isExcluded: false },
        orderBy: { rowIndex: 'asc' },
      });
      // 매핑(normalized) 완료된 행만 — 표준필드키가 있어야 엔진이 해석.
      const engineRows: RawRow[] = rows
        .filter((r) => r.normalized && Object.keys(r.normalized as object).length > 0)
        .map((r) => ({ id: r.id, data: r.normalized as Record<string, string> }));
      if (engineRows.length === 0) continue;
      batchRows.push({ kind: dataset.kind, rows: engineRows });
      hashes.push(b.sourceHash);
    }

    const datasets: RawDataset[] = assembleDatasets(batchRows);
    // 기간 스냅샷 해시 = 참여 배치 sourceHash 정렬 결합(결정론).
    const inputsHash = createHash('sha256').update(hashes.sort().join('|')).digest('hex');

    const input: CalcEngineInput = {
      tenantId: batch.tenantId,
      domain: batch.domain as 'cash' | 'closing',
      period: batch.period ?? new Date().toISOString().slice(0, 10),
      inputsHash,
      datasets,
    };

    const cro: Cro = runCalcEngine(input);
    const blockedAI = cro.validationSummary.blockedAI === true;

    // CRO 봉인(JSON 전체) — AI는 이 밖의 숫자 생성 금지.
    const calcResult = await this.prisma.calculationResult.create({
      data: {
        tenantId: batch.tenantId,
        batchId: batch.id,
        slice: batch.domain as never,
        period: batch.period ?? null,
        engineVersion: cro.engineVersion ?? ENGINE_VERSION,
        inputsHash: cro.inputsHash,
        cro: cro as unknown as object,
        blockedAI,
      },
    });

    // ValidationReport 영속화(§4.2 직렬화 표현).
    const counts = cro.validationSummary.counts;
    const severity = counts.fatal > 0 ? 'FATAL' : counts.warn > 0 ? 'WARN' : 'INFO';
    await this.prisma.validationReport.upsert({
      where: { batchId: batch.id },
      create: {
        tenantId: batch.tenantId,
        batchId: batch.id,
        severity: severity as never,
        fatalCount: counts.fatal,
        warnCount: counts.warn,
        infoCount: counts.info,
        blockedAI,
        findings: cro.validationSummary.issues as unknown as object,
      },
      update: {
        severity: severity as never,
        fatalCount: counts.fatal,
        warnCount: counts.warn,
        infoCount: counts.info,
        blockedAI,
        findings: cro.validationSummary.issues as unknown as object,
      },
    });

    // 배치 상태 전이: FATAL이면 BLOCKED, 아니면 CALCULATED. (state machine §6.4)
    await this.prisma.uploadBatch.update({
      where: { id: batch.id },
      data: {
        status: blockedAI ? 'BLOCKED' : 'VALIDATED',
        lifecycle: blockedAI ? 'BLOCKED' : 'CALCULATED',
        progress: 75,
      },
    });

    await this.audit.log({
      action: blockedAI ? AuditAction.VALIDATION_BLOCKED : AuditAction.CALC_COMPLETED,
      targetType: 'CalculationResult',
      targetId: calcResult.id,
      croHash: cro.inputsHash,
      metadata: {
        batchId: batch.id,
        engineVersion: cro.engineVersion,
        fatal: counts.fatal,
        warn: counts.warn,
        blockedAI,
      },
    });

    return { croId: calcResult.id, blockedAI };
  }

  /** 최신 CRO 조회(GET /batches/:id/cro). */
  async getCro(batchId: string) {
    const batch = await this.getBatchOwned(batchId);
    const result = await this.prisma.calculationResult.findFirst({
      where: { batchId: batch.id },
      orderBy: { computedAt: 'desc' },
    });
    if (!result) throw new NotFoundException('아직 계산된 CRO가 없습니다.');
    return {
      croId: result.id,
      batchId: result.batchId,
      engineVersion: result.engineVersion,
      blockedAI: result.blockedAI,
      cro: result.cro,
    };
  }

  /** 검증 리포트 조회(GET /batches/:id/validation). */
  async getValidation(batchId: string) {
    const batch = await this.getBatchOwned(batchId);
    const report = await this.prisma.validationReport.findUnique({
      where: { batchId: batch.id },
    });
    if (!report) throw new NotFoundException('아직 검증 리포트가 없습니다.');
    return {
      batchId: report.batchId,
      severity: report.severity,
      blockedAI: report.blockedAI,
      fatalCount: report.fatalCount,
      warnCount: report.warnCount,
      infoCount: report.infoCount,
      findings: report.findings,
    };
  }

  private async getBatchOwned(batchId: string) {
    const batch = await this.prisma.uploadBatch.findFirst({
      where: { id: batchId, tenantId: this.tenant.tenantId },
    });
    if (!batch) throw new NotFoundException('배치를 찾을 수 없습니다.');
    return batch;
  }
}
