import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_CALC, QUEUE_CALC } from '../common/constants';
import { CalcService } from './calc.service';

interface CalcJobData {
  batchId: string;
  tenantId: string;
}

/**
 * calc-queue 프로세서 — PRD §6.3 [2].
 * runCalcEngine 실행 → CRO 봉인 → FATAL이면 BLOCKED(report 미진입), 아니면 CALCULATED.
 * 결정론이라 재시도 안전. report 잡은 여기서 enqueue하지 않는다(사용자 트리거 §6.2).
 */
@Processor(QUEUE_CALC)
export class CalcProcessor extends WorkerHost {
  private readonly logger = new Logger(CalcProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calc: CalcService,
  ) {
    super();
  }

  async process(job: Job<CalcJobData>): Promise<{ croId: string; blockedAI: boolean }> {
    if (job.name !== JOB_CALC) return { croId: '', blockedAI: false };
    const { batchId } = job.data;
    this.logger.log(`calc 시작 batch=${batchId}`);

    try {
      const out = await this.calc.runForBatch(batchId);
      await job.updateProgress(100);
      this.logger.log(`calc 완료 batch=${batchId} blockedAI=${out.blockedAI}`);
      return out;
    } catch (err) {
      await this.prisma.uploadBatch.update({
        where: { id: batchId },
        data: { status: 'FAILED', error: (err as Error).message },
      });
      throw err;
    }
  }
}
