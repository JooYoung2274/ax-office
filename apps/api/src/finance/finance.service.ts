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
  async listPeriods(domain: 'cash' | 'closing' | 'payroll') {
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

    // 일일 거래 — 원시 bank_transactions를 일자별로 집계(입금/출금/누계 잔액).
    const dailyRows = await this.buildDailyRows(cro.tenantId, cro.period);

    // 매출채권 회수(AR aging) — 있으면 섹션 추가.
    const ar = await this.buildAr(cro);

    return {
      asOfDate: cro.period,
      kpis,
      forecast,
      safetyLine,
      alerts,
      dailyRows,
      ar,
    };
  }

  /** 매출채권 회수 섹션 — 집계는 CRO metric, 거래처별 표는 원시행 aging. AR 없으면 undefined. */
  private async buildAr(cro: Cro) {
    const metrics = cro.metrics ?? [];
    const prefix = `${cro.domain}.${cro.period}.`;
    const short = (m: { id: string }) => (m.id.startsWith(prefix) ? m.id.slice(prefix.length) : m.id);
    const get = (name: string) => metrics.find((m) => short(m) === name)?.value;

    const total = get('ar.total');
    if (total == null) return undefined; // 매출채권 데이터 미업로드

    const BUCKETS: Array<[string, string]> = [
      ['current', '미도래'],
      ['d1_30', '1~30일'],
      ['d31_60', '31~60일'],
      ['d61_90', '61~90일'],
      ['d90plus', '90일+'],
    ];
    const buckets = BUCKETS.map(([key, label]) => ({ key, label, amount: get(`ar.bucket.${key}`) ?? '0' }));

    // 거래처별 — 원시행에서 기준일(asOf) 대비 연체일수·구간 산출.
    const rows = await this.collectNormalized(cro.tenantId, cro.period, 'accounts_receivable');
    const asOf = cro.period.length === 10 ? cro.period : `${cro.period}-01`;
    const num = (s: string | undefined) => Number(String(s ?? '').replace(/[^0-9.-]/g, '')) || 0;
    const overdueDays = (due: string) => {
      const d = Date.parse(`${due}T00:00:00Z`);
      const a = Date.parse(`${asOf}T00:00:00Z`);
      return Number.isNaN(d) || Number.isNaN(a) ? 0 : Math.round((a - d) / 86_400_000);
    };
    const bucketOf = (od: number) =>
      od <= 0 ? '미도래' : od <= 30 ? '1~30일' : od <= 60 ? '31~60일' : od <= 90 ? '61~90일' : '90일+';

    const byCp = new Map<string, { amount: number; worst: number }>();
    for (const r of rows) {
      const name = r.counterparty || '(미지정)';
      const od = overdueDays((r.dueDate ?? '').slice(0, 10));
      const g = byCp.get(name) ?? { amount: 0, worst: 0 };
      g.amount += num(r.amount);
      g.worst = Math.max(g.worst, od);
      byCp.set(name, g);
    }
    const byCounterparty = [...byCp.entries()]
      .map(([name, g]) => ({ name, amount: String(g.amount), overdueDays: g.worst, bucket: bucketOf(g.worst) }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));

    return {
      total,
      overdueTotal: get('ar.overdue.total') ?? '0',
      concentration: get('ar.concentration') ?? '0',
      buckets,
      byCounterparty,
    };
  }

  /** 기간 내 특정 도메인 배치의 normalized RawRow를 kind별로 수집. */
  private async collectNormalized(
    tenantId: string,
    period: string,
    kind: string,
    domain: 'cash' | 'closing' | 'payroll' = 'cash',
  ): Promise<Record<string, string>[]> {
    const batches = await this.prisma.uploadBatch.findMany({
      where: { tenantId, domain: domain as never, period },
      select: { id: true },
    });
    if (batches.length === 0) return [];
    const datasets = await this.prisma.rawDataset.findMany({
      where: { batchId: { in: batches.map((b) => b.id) }, kind },
      select: { id: true },
    });
    if (datasets.length === 0) return [];
    const rows = await this.prisma.rawRow.findMany({
      where: { datasetId: { in: datasets.map((d) => d.id) }, isExcluded: false },
      orderBy: { rowIndex: 'asc' },
    });
    return rows
      .map((r) => (r.normalized ?? {}) as Record<string, string>)
      .filter((d) => Object.keys(d).length > 0);
  }

  /** bank_transactions를 거래별 행으로 변환(적요 포함) + 기초잔액 기준 누계 잔액. */
  private async buildDailyRows(tenantId: string, period: string) {
    type Row = {
      date: string;
      description?: string;
      deposit: string;
      withdrawal: string;
      cumulative: string;
      flag?: string;
    };
    const txns = await this.collectNormalized(tenantId, period, 'bank_transactions');
    if (txns.length === 0) return [] as Row[];
    const masters = await this.collectNormalized(tenantId, period, 'bank_account_master');
    const num = (s: string | undefined) =>
      Number(String(s ?? '').replace(/[^0-9.-]/g, '')) || 0;
    const opening = masters.reduce((sum, m) => sum + num(m.openingBalance), 0);

    // 날짜 오름차순(같은 날짜는 입력 순서 유지) → 누계 잔액 계산.
    const ordered = txns
      .map((r, i) => ({ r, i, date: (r.txnDate ?? '').slice(0, 10) }))
      .filter((x) => x.date)
      .sort((a, b) => (a.date === b.date ? a.i - b.i : a.date.localeCompare(b.date)));

    let running = opening;
    const rows: Row[] = ordered.map(({ r, date }) => {
      const dep = num(r.depositAmt);
      const wd = num(r.withdrawalAmt);
      running += dep - wd;
      return {
        date,
        description: r.description || undefined,
        deposit: String(dep),
        withdrawal: String(wd),
        cumulative: String(running),
        flag: undefined,
      };
    });
    // 최근 거래 위주(역순 50건) — 표는 최신이 위로.
    return rows.reverse().slice(0, 50);
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

  /**
   * 급여(슬라이스 C) 요약 — 최신 payroll CRO에서 직원별 공제·실수령액 + 집계를 조립.
   * 직원별 수치는 emp.* metric(코드 계산), 이름·부서는 급여대장 원시행에서 조인.
   */
  async payroll(period?: string) {
    const tenantId = this.tenant.tenantId;
    const result =
      (await this.prisma.calculationResult.findFirst({
        where: { tenantId, slice: 'payroll' as never, ...(period ? { period } : {}) },
        orderBy: { computedAt: 'desc' },
      })) ??
      (period
        ? await this.prisma.calculationResult.findFirst({
            where: { tenantId, slice: 'payroll' as never },
            orderBy: { computedAt: 'desc' },
          })
        : null);

    if (!result) {
      return {
        period: period ?? '',
        headcount: 0,
        grossTotal: '0',
        insuranceTotal: '0',
        incomeTaxTotal: '0',
        deductionTotal: '0',
        netpayTotal: '0',
        employees: [],
        alerts: [],
      };
    }

    const cro = result.cro as unknown as Cro;
    const prefix = `${cro.domain}.${cro.period}.`;
    const mv = new Map<string, string>();
    for (const m of cro.metrics ?? []) mv.set(m.id, m.value);
    const agg = (name: string) => mv.get(`${prefix}${name}`) ?? '0';
    const slug = (s: string) =>
      (s || '').replace(/\s+/g, '_').replace(/[^0-9A-Za-z가-힣_.-]/g, '') || 'X';
    const num = (s: string) => Number(String(s).replace(/[^0-9.-]/g, '')) || 0;

    // 이름·부서는 급여대장 원시행에서(코드 계산값과 사번 slug로 조인).
    const regRows = await this.collectNormalized(tenantId, cro.period, 'payroll_register', 'payroll');

    const employees = regRows.map((r) => {
      const empId = r.empId ?? '';
      const sl = slug(empId);
      const emp = (field: string) => agg(`emp.${field}.${sl}`);
      const insuranceTotal = emp('deduction.insurance_total');
      const deductionTotal = emp('deduction.total');
      const incomeTax = String(num(deductionTotal) - num(insuranceTotal));
      return {
        empId,
        name: r.name ?? '',
        dept: r.dept ?? '',
        gross: emp('gross'),
        taxable: emp('taxable'),
        pension: emp('deduction.pension'),
        health: emp('deduction.health'),
        ltcare: emp('deduction.ltcare'),
        employment: emp('deduction.employment'),
        insuranceTotal,
        incomeTax,
        deductionTotal,
        netpay: emp('netpay'),
      };
    });

    return {
      period: cro.period,
      headcount: Math.round(num(agg('payroll.headcount'))),
      grossTotal: agg('payroll.gross.total'),
      insuranceTotal: agg('payroll.insurance.total'),
      incomeTaxTotal: agg('payroll.income_tax.total'),
      deductionTotal: agg('payroll.deduction.total'),
      netpayTotal: agg('payroll.netpay.total'),
      employees,
      alerts: this.toLiquidityAlerts(cro),
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
