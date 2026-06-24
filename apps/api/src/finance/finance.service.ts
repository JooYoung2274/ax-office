import { Injectable } from '@nestjs/common';
import type { Cro, Flag } from '@axaxax/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

/**
 * FinanceService — 슬라이스 A/B 도메인 오케스트레이션(thin). PRD §6.1 FinanceModule.
 * Upload/Calc/Report 결과를 조합해 기간 목록·대시보드 요약(유동성 경보)을 제공.
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  /** 도메인별 기간 목록(업로드 배치 기준). */
  async listPeriods(domain: 'cash' | 'closing') {
    const batches = await this.prisma.uploadBatch.findMany({
      where: { tenantId: this.tenant.tenantId, domain: domain as never },
      orderBy: { createdAt: 'desc' },
      select: { id: true, period: true, status: true, lifecycle: true, createdAt: true },
    });
    return { domain, periods: batches };
  }

  /**
   * 대시보드 요약 — 처리 큐 카운트 + 최신 CRO의 유동성 경보(flags).
   * 경보는 모두 결정론 엔진 산출(CRO flags)이며 AI 생성이 아니다(PRD §2.3-a "계산값").
   */
  async dashboard() {
    const tenantId = this.tenant.tenantId;

    // 처리 현황(My Queue) 카운트.
    const [uploading, blocked, drafts, pendingApproval] = await Promise.all([
      this.prisma.uploadBatch.count({
        where: { tenantId, status: { in: ['RECEIVED', 'PARSED', 'MAPPED'] } },
      }),
      this.prisma.uploadBatch.count({ where: { tenantId, status: 'BLOCKED' } }),
      this.prisma.report.count({ where: { tenantId, status: 'DRAFT' } }),
      this.prisma.report.count({ where: { tenantId, status: 'DRAFT' } }),
    ]);

    // 최신 cash CRO의 경보 flags 추출.
    const latestCash = await this.prisma.calculationResult.findFirst({
      where: { tenantId, slice: 'cash' as never },
      orderBy: { computedAt: 'desc' },
    });
    const liquidityAlerts = latestCash ? this.extractAlerts(latestCash.cro as unknown as Cro) : [];

    // 최근 활동(AuditLog 요약).
    const recent = await this.prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { action: true, targetType: true, targetId: true, createdAt: true },
    });

    return {
      queue: { uploading, blocked, drafts, pendingApproval },
      liquidityAlerts,
      recentActivity: recent,
    };
  }

  /** CRO의 high/medium severity flags를 유동성 경보 카드로. */
  private extractAlerts(cro: Cro): Array<{ id: string; severity: string; message: string; value?: string }> {
    return (cro.flags ?? [])
      .filter((f: Flag) => f.severity === 'FATAL' || f.severity === 'WARN')
      .map((f: Flag) => ({
        id: f.id,
        severity: f.severity,
        message: f.message,
        value: f.value,
      }));
  }
}
