import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  bullJobId,
  DEFAULT_JOB_OPTS,
  JOB_CALC,
  JOB_PARSE,
  QUEUE_CALC,
  QUEUE_PARSE,
} from '../common/constants';
import { findTemplate } from './templates';
import { suggestMapping, applyMapping } from './column-mapping';
import { parseWorkbook, detectSheets } from './xlsx-parser';

const ALLOWED_EXT = ['.xlsx', '.csv'];
const MAX_BYTES = 20 * 1024 * 1024; // 20MB

/**
 * UploadService (DataConnector) — PRD §3.3.
 * 파일 수신 → SHA-256 봉인 → UploadBatch 생성 → parse 잡 enqueue.
 * 파싱/매핑/검증 투영은 BullMQ 잡(parse → calc)으로 비동기 처리.
 */
@Injectable()
export class UploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUE_PARSE) private readonly parseQueue: Queue,
    @InjectQueue(QUEUE_CALC) private readonly calcQueue: Queue,
  ) {}

  /** 파일 업로드 → 배치 생성 + parse enqueue. 중복 해시는 409. */
  async receiveFile(
    file: Express.Multer.File,
    meta: { templateKey: string; domain: 'cash' | 'closing' | 'payroll'; period?: string },
    actor: { userId: string; tenantId: string },
  ) {
    if (!file?.buffer) throw new BadRequestException('파일이 없습니다.');
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (!ALLOWED_EXT.includes(ext)) {
      throw new BadRequestException(`허용되지 않은 확장자입니다(${ALLOWED_EXT.join(', ')}).`);
    }
    if (file.size > MAX_BYTES) throw new BadRequestException('파일이 너무 큽니다(최대 20MB).');

    const template = findTemplate(meta.templateKey);
    if (!template) throw new BadRequestException(`알 수 없는 templateKey: ${meta.templateKey}`);

    // SHA-256 원본 스냅샷 해시(불변·중복차단).
    const sourceHash = createHash('sha256').update(file.buffer).digest('hex');

    const dup = await this.prisma.uploadBatch.findUnique({
      where: { tenantId_sourceHash: { tenantId: actor.tenantId, sourceHash } },
    });
    if (dup) {
      throw new ConflictException({
        message: '동일한 파일이 이미 업로드되었습니다(중복 차단).',
        existingBatchId: dup.id,
      });
    }

    // path traversal 방지: 원본 파일명은 basename만 보관, 저장명은 서버 UUID.
    const safeName = file.originalname.split(/[\\/]/).pop() ?? 'upload';
    const storageKey = `uploads/${actor.tenantId}/${randomUUID()}${ext}`;

    let detectedSheets: string[] = [];
    try {
      detectedSheets = detectSheets(file.buffer);
    } catch {
      detectedSheets = [];
    }

    const batch = await this.prisma.uploadBatch.create({
      data: {
        tenantId: actor.tenantId,
        uploadedById: actor.userId,
        templateKey: template.templateKey as never,
        domain: meta.domain as never,
        fileName: safeName,
        sourceHash,
        storageKey,
        period: meta.period ?? null,
        status: 'RECEIVED',
        lifecycle: 'PENDING',
        progress: 0,
      },
    });

    await this.audit.log({
      action: AuditAction.UPLOAD_RECEIVED,
      targetType: 'UploadBatch',
      targetId: batch.id,
      croHash: sourceHash,
      metadata: { fileName: safeName, templateKey: template.templateKey, sourceHash },
    });

    // parse 잡 enqueue. 파일 버퍼는 base64로 전달(MVP — 객체스토리지 대체).
    await this.parseQueue.add(
      JOB_PARSE,
      {
        batchId: batch.id,
        tenantId: actor.tenantId,
        datasetKind: template.datasetKind,
        fileBase64: file.buffer.toString('base64'),
      },
      { ...DEFAULT_JOB_OPTS, jobId: bullJobId(JOB_PARSE, batch.id) },
    );

    return { batchId: batch.id, status: 'PARSING', detectedSheets };
  }

  /** 매핑 후보 조회(파싱 후). */
  async getMappingCandidates(batchId: string) {
    const batch = await this.getBatchOwned(batchId);
    const dataset = await this.prisma.rawDataset.findUnique({ where: { batchId: batch.id } });
    if (!dataset) throw new NotFoundException('아직 파싱되지 않았습니다.');
    const firstRow = await this.prisma.rawRow.findFirst({
      where: { datasetId: dataset.id },
      orderBy: { rowIndex: 'asc' },
    });
    const headers = firstRow ? Object.keys((firstRow.raw ?? {}) as object) : [];
    return { batchId: batch.id, candidates: suggestMapping(headers, dataset.kind) };
  }

  /**
   * 매핑 확정 → RawRow.normalized 갱신 + calc 잡 enqueue.
   * (PRD §6.2: POST /upload/batches/:id/mapping → status CALCULATING)
   */
  async confirmMapping(
    batchId: string,
    mapping: Record<string, string>,
    actorId: string,
  ) {
    const batch = await this.getBatchOwned(batchId);
    const dataset = await this.prisma.rawDataset.findUnique({ where: { batchId: batch.id } });
    if (!dataset) throw new BadRequestException('파싱 완료 후 매핑을 확정할 수 있습니다.');

    const rows = await this.prisma.rawRow.findMany({ where: { datasetId: dataset.id } });
    // 각 행을 표준필드키 형태로 정규화 투영.
    await this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.rawRow.update({
          where: { id: r.id },
          data: { normalized: applyMapping((r.raw ?? {}) as Record<string, string>, mapping) },
        }),
      ),
    );

    // ColumnMapping 영속화(재사용).
    await this.prisma.$transaction(
      Object.entries(mapping).map(([sourceHeader, targetField]) =>
        this.prisma.columnMapping.create({
          data: { batchId: batch.id, sourceHeader, targetField, confidence: 1, confirmedBy: actorId },
        }),
      ),
    );

    await this.prisma.uploadBatch.update({
      where: { id: batch.id },
      data: { status: 'MAPPED', progress: 50 },
    });

    await this.audit.log({
      action: AuditAction.MAPPING_CONFIRMED,
      targetType: 'UploadBatch',
      targetId: batch.id,
      metadata: { fields: Object.values(mapping) },
    });

    // calc 잡 enqueue(결정론 계산 + 검증).
    await this.calcQueue.add(
      JOB_CALC,
      { batchId: batch.id, tenantId: batch.tenantId },
      { ...DEFAULT_JOB_OPTS, jobId: bullJobId(JOB_CALC, batch.id) },
    );

    return { batchId: batch.id, status: 'CALCULATING' };
  }

  /** 배치 상태/진행률 스냅샷(SSE 폴백 폴링). */
  async getBatchStatus(batchId: string) {
    const batch = await this.getBatchOwned(batchId);
    return {
      batchId: batch.id,
      status: batch.status,
      lifecycle: batch.lifecycle,
      progress: batch.progress,
      error: batch.error ?? undefined,
      period: batch.period ?? undefined,
    };
  }

  /** 테넌트 격리 + 존재 확인. */
  private async getBatchOwned(batchId: string) {
    const batch = await this.prisma.uploadBatch.findFirst({
      where: { id: batchId, tenantId: this.tenant.tenantId },
    });
    if (!batch) throw new NotFoundException('배치를 찾을 수 없습니다.');
    return batch;
  }

  // ── parse 잡에서 호출하는 적재 헬퍼(프로세서가 위임) ───────────────
  async persistParsedRows(
    batchId: string,
    datasetKind: string,
    parsed: { sheetName: string; rows: { rowIndex: number; raw: Record<string, string> }[] },
  ) {
    const dataset = await this.prisma.rawDataset.upsert({
      where: { batchId },
      create: { batchId, sheetName: parsed.sheetName, kind: datasetKind },
      update: { sheetName: parsed.sheetName, kind: datasetKind },
    });

    // 멱등: 기존 rows 제거 후 재적재(재시도 안전).
    await this.prisma.rawRow.deleteMany({ where: { datasetId: dataset.id } });
    if (parsed.rows.length > 0) {
      await this.prisma.rawRow.createMany({
        data: parsed.rows.map((r) => ({
          datasetId: dataset.id,
          rowIndex: r.rowIndex,
          raw: r.raw as object,
        })),
      });
    }

    await this.prisma.uploadBatch.update({
      where: { id: batchId },
      data: { status: 'PARSED', progress: 25, rowCount: parsed.rows.length, parsedAt: new Date() },
    });
  }
}
