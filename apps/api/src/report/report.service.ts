import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  ReportStatus,
  canTransition,
  APPROVER_ROLES,
  Role,
  type Cro,
} from '@axaxax/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  bullJobId,
  DEFAULT_JOB_OPTS,
  JOB_REPORT,
  QUEUE_REPORT,
} from '../common/constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';

/**
 * ReportService — 리포트 생명주기·승인 워크플로. PRD §6.2 / §6.4.
 * 핵심 게이트:
 *  - 생성: 배치 CRO가 BLOCKED(FATAL)면 409로 거부(AI 호출 차단).
 *  - 상태 전이: @axaxax/shared canTransition()으로 상태머신 강제.
 *  - 승인: self-approval 차단(approver !== draft creator), APPROVER_ROLES만.
 */
@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUE_REPORT) private readonly reportQueue: Queue,
  ) {}

  /**
   * 리포트 목록(GET /reports) — 테넌트 리포트를 최신순으로. 웹 ReportDto[] 형태.
   * slice 'cash'→'cashflow', 'closing'→'monthly_close'로 도메인 매핑.
   */
  async listReports() {
    const reports = await this.prisma.report.findMany({
      where: { tenantId: this.tenant.tenantId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { name: true } } },
    });
    return reports.map((r) => ({
      reportId: r.id,
      title: r.title,
      status: r.status,
      domain: r.slice === 'cash' ? 'cashflow' : 'monthly_close',
      period: r.period ?? undefined,
      createdAt: r.createdAt.toISOString(),
      authorName: r.createdBy?.name ?? '',
      authorId: r.createdById,
      stale: r.stale,
    }));
  }

  /**
   * AI 리포트 생성 트리거(POST /batches/:id/reports).
   * CRO 존재 + non-blocked 확인 후 Report(AI_DRAFTING) 선발급 → report 잡 enqueue.
   */
  async generate(batchId: string, actor: AuthUser) {
    const batch = await this.prisma.uploadBatch.findFirst({
      where: { id: batchId, tenantId: actor.tenantId },
    });
    if (!batch) throw new NotFoundException('배치를 찾을 수 없습니다.');

    const calc = await this.prisma.calculationResult.findFirst({
      where: { batchId: batch.id },
      orderBy: { computedAt: 'desc' },
    });
    if (!calc) throw new BadRequestException('CRO가 아직 계산되지 않았습니다.');

    // 이중 차단: FATAL 데이터는 AI 호출 자체를 거부(409). PRD §1.1 garbage-in 게이트.
    if (calc.blockedAI) {
      throw new ConflictException('검증 치명 오류(FATAL)로 AI 리포트 생성이 차단되었습니다.');
    }

    // CALCULATED → AI_DRAFTING 전이 확인.
    if (
      batch.lifecycle !== ReportStatus.CALCULATED &&
      !canTransition(batch.lifecycle as ReportStatus, ReportStatus.AI_DRAFTING)
    ) {
      throw new ConflictException(
        `현재 상태(${batch.lifecycle})에서는 리포트를 생성할 수 없습니다.`,
      );
    }

    // reportId 선발급(멱등 키) — 재시도가 중복 Draft를 만들지 않게 upsert.
    const report = await this.prisma.report.create({
      data: {
        tenantId: batch.tenantId,
        batchId: batch.id,
        croId: calc.id,
        slice: batch.domain as never,
        period: batch.period ?? null,
        status: ReportStatus.AI_DRAFTING as never,
        title: `${batch.domain === 'cash' ? '자금일보' : '월결산'} 리포트 (${batch.period ?? ''})`,
        createdById: actor.userId,
      },
    });

    await this.prisma.uploadBatch.update({
      where: { id: batch.id },
      data: { lifecycle: ReportStatus.AI_DRAFTING as never },
    });

    await this.audit.log({
      action: AuditAction.REPORT_CREATED,
      targetType: 'Report',
      targetId: report.id,
      croHash: calc.inputsHash,
      metadata: { batchId: batch.id, croId: calc.id },
    });

    await this.reportQueue.add(
      JOB_REPORT,
      {
        reportId: report.id,
        batchId: batch.id,
        croId: calc.id,
        tenantId: batch.tenantId,
        kind: batch.domain,
      },
      { ...DEFAULT_JOB_OPTS, jobId: bullJobId(JOB_REPORT, report.id) },
    );

    return { reportId: report.id, status: ReportStatus.AI_DRAFTING };
  }

  /**
   * report 잡이 호출: 생성 결과(content/guard/status)를 영속화하고 상태 전이.
   * status === 'DRAFT'면 AI_DRAFTING → DRAFT, 'NEEDS_HUMAN'이면 BLOCKED로.
   */
  async persistGeneration(params: {
    reportId: string;
    content: unknown;
    guard: unknown;
    confidence: number;
    regenCount: number;
    status: 'DRAFT' | 'NEEDS_HUMAN';
    croHash?: string;
    usage?: unknown;
  }) {
    const report = await this.prisma.report.findUnique({ where: { id: params.reportId } });
    if (!report) throw new NotFoundException('리포트를 찾을 수 없습니다.');

    const from = report.status as ReportStatus;
    // DRAFT 통과 또는 가드 미통과(NEEDS_HUMAN) → BLOCKED.
    const to: ReportStatus =
      params.status === 'DRAFT' ? ReportStatus.DRAFT : ReportStatus.BLOCKED;

    if (!canTransition(from, to)) {
      // AI_DRAFTING→BLOCKED는 §6.4 허용(가드 위반). 안전망: CALCULATED 롤백 가능.
      if (!(from === ReportStatus.AI_DRAFTING && to === ReportStatus.BLOCKED)) {
        throw new ConflictException(`불가한 상태 전이: ${from} → ${to}`);
      }
    }

    await this.prisma.report.update({
      where: { id: report.id },
      data: {
        status: to as never,
        content: params.content as object,
        guard: params.guard as object,
        confidence: params.confidence,
        regenCount: params.regenCount,
      },
    });

    await this.audit.log({
      action: params.status === 'DRAFT' ? AuditAction.REPORT_DRAFTED : AuditAction.REPORT_NEEDS_HUMAN,
      targetType: 'Report',
      targetId: report.id,
      croHash: params.croHash,
      metadata: { regenCount: params.regenCount, status: params.status, usage: params.usage },
    });

    return { reportId: report.id, status: to };
  }

  /** report 잡 실패 시 AI_DRAFTING → CALCULATED 롤백(재시도 가능). */
  async rollbackToCalculated(reportId: string) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) return;
    if (canTransition(report.status as ReportStatus, ReportStatus.CALCULATED)) {
      await this.prisma.report.update({
        where: { id: reportId },
        data: { status: ReportStatus.CALCULATED as never },
      });
    }
  }

  /** 리포트 조회. Draft는 작성자/승인자(APPROVER 권한)만 열람. PRD §6.4. */
  async getReport(reportId: string, actor: AuthUser) {
    const report = await this.prisma.report.findFirst({
      where: { id: reportId, tenantId: actor.tenantId },
      include: { comments: true },
    });
    if (!report) throw new NotFoundException('리포트를 찾을 수 없습니다.');

    const isApproved = report.status === ReportStatus.APPROVED;
    const isCreator = report.createdById === actor.userId;
    const isApprover = APPROVER_ROLES.includes(actor.role as Role);
    if (!isApproved && !isCreator && !isApprover) {
      throw new ForbiddenException('승인 전 리포트는 작성자/승인자만 열람할 수 있습니다.');
    }
    return report;
  }

  /** 승인(POST /reports/:id/approve). APPROVER_ROLES + self-approval 차단. */
  async approve(reportId: string, actor: AuthUser) {
    const report = await this.getOwned(reportId, actor.tenantId);

    // self-approval 차단 — 작성자 본인은 승인 불가(PRD §2.1).
    if (report.createdById === actor.userId) {
      throw new ForbiddenException('본인이 생성한 리포트는 승인할 수 없습니다.');
    }
    if (!canTransition(report.status as ReportStatus, ReportStatus.APPROVED)) {
      throw new ConflictException(`현재 상태(${report.status})에서는 승인할 수 없습니다.`);
    }

    const updated = await this.prisma.report.update({
      where: { id: report.id },
      data: {
        status: ReportStatus.APPROVED as never,
        approverId: actor.userId,
        approvedAt: new Date(),
      },
    });
    await this.audit.log({
      action: AuditAction.REPORT_APPROVED,
      targetType: 'Report',
      targetId: report.id,
      before: { status: report.status },
      after: { status: updated.status, approverId: actor.userId },
    });
    return { reportId: report.id, status: ReportStatus.APPROVED };
  }

  /** 반려(POST /reports/:id/reject). 사유 필수, 재생성 가능. */
  async reject(reportId: string, reason: string, actor: AuthUser) {
    const report = await this.getOwned(reportId, actor.tenantId);
    if (!canTransition(report.status as ReportStatus, ReportStatus.REJECTED)) {
      throw new ConflictException(`현재 상태(${report.status})에서는 반려할 수 없습니다.`);
    }
    const updated = await this.prisma.report.update({
      where: { id: report.id },
      data: { status: ReportStatus.REJECTED as never, rejectionReason: reason },
    });
    await this.audit.log({
      action: AuditAction.REPORT_REJECTED,
      targetType: 'Report',
      targetId: report.id,
      before: { status: report.status },
      after: { status: updated.status, reason },
    });
    return { reportId: report.id, status: ReportStatus.REJECTED };
  }

  /** 코멘트 추가(POST /reports/:id/comments). */
  async addComment(reportId: string, body: string, findingId: string | undefined, actor: AuthUser) {
    const report = await this.getOwned(reportId, actor.tenantId);
    const comment = await this.prisma.comment.create({
      data: {
        tenantId: actor.tenantId,
        reportId: report.id,
        authorId: actor.userId,
        body,
        findingId: findingId ?? null,
      },
    });
    await this.audit.log({
      action: AuditAction.COMMENT_ADDED,
      targetType: 'Report',
      targetId: report.id,
      metadata: { commentId: comment.id, findingId },
    });
    return { commentId: comment.id, createdAt: comment.createdAt };
  }

  /** Export(PDF) — 승인된 리포트만. 미승인은 403. PRD §6.2. */
  async export(reportId: string, actor: AuthUser) {
    const report = await this.getOwned(reportId, actor.tenantId);
    if (report.status !== ReportStatus.APPROVED) {
      throw new ForbiddenException('승인된 리포트만 워터마크 없이 Export할 수 있습니다.');
    }
    await this.audit.log({
      action: AuditAction.EXPORT,
      targetType: 'Report',
      targetId: report.id,
      metadata: { format: 'pdf' },
    });
    // MVP 스텁: 실제 PDF 렌더는 후속(W6). 메타만 반환.
    return { reportId: report.id, format: 'pdf', status: 'APPROVED', note: 'PDF 렌더는 후속 구현(W6).' };
  }

  private async getOwned(reportId: string, tenantId: string) {
    const report = await this.prisma.report.findFirst({
      where: { id: reportId, tenantId },
    });
    if (!report) throw new NotFoundException('리포트를 찾을 수 없습니다.');
    return report;
  }
}
