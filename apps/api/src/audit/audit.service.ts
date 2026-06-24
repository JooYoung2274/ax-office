import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId: string;
  actorId?: string | null;
  tenantId?: string;
  croHash?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * AuditService — EvidenceLedger의 append-only writer. PRD §3, §6.5.
 * 수정/삭제 메서드는 의도적으로 제공하지 않는다(불변).
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  /** 감사 로그 1건 기록. tenantId/actorId는 미지정 시 현재 컨텍스트에서 채운다. */
  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId ?? this.tenant.tenantId,
        actorId: entry.actorId === undefined ? (this.tenant.userId ?? null) : entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        croHash: entry.croHash ?? null,
        before: (entry.before ?? null) as object,
        after: (entry.after ?? null) as object,
        metadata: (entry.metadata ?? null) as object,
      },
    });
  }

  /** 감사 로그 조회(필터·페이지네이션). ADMIN/APPROVER 컨트롤러에서 호출. */
  async query(params: {
    targetType?: string;
    targetId?: string;
    action?: string;
    from?: Date;
    to?: Date;
    take?: number;
    skip?: number;
  }) {
    const where: Record<string, unknown> = { tenantId: this.tenant.tenantId };
    if (params.targetType) where.targetType = params.targetType;
    if (params.targetId) where.targetId = params.targetId;
    if (params.action) where.action = params.action;
    if (params.from || params.to) {
      where.createdAt = {
        ...(params.from ? { gte: params.from } : {}),
        ...(params.to ? { lte: params.to } : {}),
      };
    }
    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(params.take ?? 50, 200),
      skip: params.skip ?? 0,
    });
  }
}
