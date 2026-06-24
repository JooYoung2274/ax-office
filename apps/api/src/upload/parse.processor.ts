import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_PARSE, QUEUE_PARSE } from '../common/constants';
import { parseWorkbook } from './xlsx-parser';
import { UploadService } from './upload.service';

interface ParseJobData {
  batchId: string;
  tenantId: string;
  datasetKind: string;
  fileBase64: string;
}

/**
 * parse-queue 프로세서 — PRD §6.3 [1].
 * 파일 버퍼를 파싱하여 RawRow로 무손실 적재한다. 멱등(재시도 안전).
 */
@Processor(QUEUE_PARSE)
export class ParseProcessor extends WorkerHost {
  private readonly logger = new Logger(ParseProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
  ) {
    super();
  }

  async process(job: Job<ParseJobData>): Promise<{ rowCount: number }> {
    if (job.name !== JOB_PARSE) return { rowCount: 0 };
    const { batchId, datasetKind, fileBase64 } = job.data;
    this.logger.log(`parse 시작 batch=${batchId}`);

    try {
      const buffer = Buffer.from(fileBase64, 'base64');
      const parsed = parseWorkbook(buffer);
      await this.upload.persistParsedRows(batchId, datasetKind, {
        sheetName: parsed.sheetName,
        rows: parsed.rows,
      });
      await job.updateProgress(100);
      this.logger.log(`parse 완료 batch=${batchId} rows=${parsed.rows.length}`);
      return { rowCount: parsed.rows.length };
    } catch (err) {
      await this.prisma.uploadBatch.update({
        where: { id: batchId },
        data: { status: 'FAILED', error: (err as Error).message },
      });
      throw err;
    }
  }
}
