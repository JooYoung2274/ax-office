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

  /**
   * 자금일보(슬라이스 A) 요약 — 최신 cash CRO에서 KPI·예측·경보를 조립.
   * 모든 금액은 CRO metric value(문자열) 그대로 통과(decimal-safe).
   */
  async cashDaily(asOfDate?: string) {
    const tenantId = this.tenant.tenantId;
    const latest = await this.prisma.calculationResult.findFirst({
      where: {
        tenantId,
        slice: 'cash' as never,
        ...(asOfDate ? { period: asOfDate } : {}),
      },
      orderBy: { computedAt: 'desc' },
    });
    // asOfDate 지정 시 해당 기간 우선, 없으면 최신 cash로 폴백.
    const result =
      latest ??
      (asOfDate
        ? await this.prisma.calculationResult.findFirst({
            where: { tenantId, slice: 'cash' as never },
            orderBy: { computedAt: 'desc' },
          })
        : null);

    if (!result) {
      return {
        asOfDate: asOfDate ?? '',
        kpis: [],
        forecast: [],
        safetyLine: '0',
        alerts: [],
        dailyRows: [],
      };
    }

    const cro = result.cro as unknown as Cro;
    const metrics = cro.metrics ?? [];
    // CRO metric의 짧은 이름은 id(`{domain}.{period}.{name}`)에서 추출. (name 필드는 라벨)
    const prefix = `${cro.domain}.${cro.period}.`;
    const shortName = (m: { id: string }) =>
      m.id.startsWith(prefix) ? m.id.slice(prefix.length) : m.id;
    const byName = (name: string) => metrics.find((m) => shortName(m) === name);

    // KPI — metric이 없으면 해당 카드 생략.
    const kpis: Array<{ label: string; value: string; unit?: string }> = [];
    const total = byName('bank_balance.total');
    if (total) kpis.push({ label: '총 가용잔액', value: total.value, unit: 'KRW' });

    // 일일 자금수지 — asOfDate의 daily_net, 없으면 첫 daily_net.
    const dailyNets = metrics.filter((m) => shortName(m).startsWith('daily_net.'));
    const dailyNet =
      (asOfDate && dailyNets.find((m) => shortName(m) === `daily_net.${asOfDate}`)) ||
      dailyNets[0];
    if (dailyNet) kpis.push({ label: '일일 자금수지', value: dailyNet.value, unit: 'KRW' });

    const minBalance = byName('forecast.min_balance');
    if (minBalance) kpis.push({ label: '예측 최저잔액', value: minBalance.value, unit: 'KRW' });

    // 예측 시계열 — forecast.confirmed.{date} → {date, balance}, 날짜순.
    const forecast = metrics
      .filter((m) => shortName(m).startsWith('forecast.confirmed.'))
      .map((m) => ({
        date: shortName(m).slice('forecast.confirmed.'.length),
        balance: m.value,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 안전선 — min_balance_below_threshold flag의 expected(임계값).
    const thresholdFlag = (cro.flags ?? []).find(
      (f) => f.type === 'min_balance_below_threshold',
    );
    const safetyLine = thresholdFlag?.expected ?? '0';

    const alerts = this.toLiquidityAlerts(cro);

    // 일일 행 — daily_net.{date}에서 best-effort(입출금/누계 미산출 → 빈 문자열).
    const dailyRows = dailyNets
      .map((m) => ({
        date: shortName(m).slice('daily_net.'.length),
        deposit: '',
        withdrawal: '',
        cumulative: '',
        flag: undefined as string | undefined,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      asOfDate: cro.period,
      kpis,
      forecast,
      safetyLine,
      alerts,
      dailyRows,
    };
  }

  /**
   * 월결산(슬라이스 B) 요약 — 최신 closing CRO에서 차/대변 합계·이상징후를 조립.
   * 대차일치(balanced)는 validationSummary.counts.fatal===0 기준.
   */
  async monthlyClosing(period?: string) {
    const tenantId = this.tenant.tenantId;
    const result = await this.prisma.calculationResult.findFirst({
      where: {
        tenantId,
        slice: 'closing' as never,
        ...(period ? { period } : {}),
      },
      orderBy: { computedAt: 'desc' },
    });
    const fallback =
      result ??
      (period
        ? await this.prisma.calculationResult.findFirst({
            where: { tenantId, slice: 'closing' as never },
            orderBy: { computedAt: 'desc' },
          })
        : null);

    if (!fallback) {
      return {
        period: period ?? '',
        balanced: true,
        debitTotal: '0',
        creditTotal: '0',
        anomalies: [],
        reconciliations: [],
      };
    }

    const cro = fallback.cro as unknown as Cro;
    const metrics = cro.metrics ?? [];
    const prefix = `${cro.domain}.${cro.period}.`;
    const shortName = (m: { id: string }) =>
      m.id.startsWith(prefix) ? m.id.slice(prefix.length) : m.id;
    const byName = (name: string) => metrics.find((m) => shortName(m) === name);

    const debitTotal = byName('tb.debit_total')?.value ?? '0';
    const creditTotal = byName('tb.credit_total')?.value ?? '0';
    const balanced = (cro.validationSummary?.counts?.fatal ?? 0) === 0;

    const anomalies = (cro.flags ?? []).map((f: Flag) => ({
      type: f.type,
      journalId: '',
      description: f.message,
      rule: f.type,
      severity: f.severity,
    }));

    return {
      period: cro.period,
      balanced,
      debitTotal,
      creditTotal,
      anomalies,
      // 장부 vs 대상 대사는 아직 CRO에서 도출 불가(후속).
      reconciliations: [],
    };
  }

  /** CRO flags → 웹 LiquidityAlert(severity FATAL→high/WARN→medium/그 외→low). */
  private toLiquidityAlerts(cro: Cro): Array<{
    id: string;
    severity: 'high' | 'medium' | 'low';
    title: string;
    amount?: string;
  }> {
    return (cro.flags ?? []).map((f: Flag) => ({
      id: f.id,
      severity: f.severity === 'FATAL' ? 'high' : f.severity === 'WARN' ? 'medium' : 'low',
      title: f.message,
      amount: f.value,
    }));
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
