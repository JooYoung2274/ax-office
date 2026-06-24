/**
 * metrics/cash.ts — 자금일보·현금흐름 metric 정의(PRD §4.1-A, 슬라이스 A).
 *
 * 은행별 잔액 집계, 일일 순자금수지, 가용자금, N일 확정 현금흐름 예측,
 * 예측 최저잔액. 모두 순수함수 + Decimal 연산.
 */
import { add, dec, Decimal, max, moneyString, sub, sum } from '../decimal.js';
import { dateISO, numOr0, str } from '../parse.js';
import { MetricDef, MetricResult } from '../registry.js';
import { CalcContext, DatasetKind, RawRow } from '../types.js';
import { AR_METRICS } from './cash-ar.js';

/** 계좌별 (입금합−출금합). 명시 거래후잔액이 마지막에 있으면 그것을 우선. */
function bankBalances(ctx: CalcContext): Map<string, { balance: Decimal; rowIds: string[] }> {
  const rows = ctx.rows(DatasetKind.BANK_TRANSACTIONS);
  const byAlias = new Map<string, RawRow[]>();
  for (const r of rows) {
    const alias = str(r, 'accountAlias') || '(미지정)';
    const arr = byAlias.get(alias) ?? [];
    arr.push(r);
    byAlias.set(alias, arr);
  }
  // 계좌 마스터 기초잔액. 거래가 없는 계좌도 기초잔액으로 포함한다.
  const masterOpening = new Map<string, Decimal>();
  for (const m of ctx.rows(DatasetKind.BANK_ACCOUNT_MASTER)) {
    masterOpening.set(str(m, 'accountAlias') || str(m, 'alias'), numOr0(m, 'openingBalance'));
  }

  const result = new Map<string, { balance: Decimal; rowIds: string[] }>();
  // 마스터 계좌 ∪ 거래 발생 계좌. 결정론: alias 정렬 후 처리.
  const allAliases = new Set<string>([...masterOpening.keys(), ...byAlias.keys()]);
  for (const alias of [...allAliases].sort()) {
    const txns = byAlias.get(alias) ?? [];
    const opening = masterOpening.get(alias) ?? dec(0);
    const net = sum(txns.map((t) => sub(numOr0(t, 'depositAmt'), numOr0(t, 'withdrawalAmt'))));
    const balance = add(opening, net);
    result.set(alias, { balance, rowIds: txns.map((t) => t.id) });
  }
  return result;
}

/** cash.bank_balance.by_bank — 은행(계좌)별 잔액(다중 metric). */
export const bankBalanceByBank: MetricDef = {
  name: 'bank_balance.by_bank',
  label: '은행별 잔액',
  unit: 'KRW',
  compute(ctx) {
    const balances = bankBalances(ctx);
    const out: MetricResult[] = [];
    for (const [alias, { balance, rowIds }] of balances) {
      out.push({
        nameOverride: `bank_balance.by_bank.${slug(alias)}`,
        value: moneyString(balance),
        unit: 'KRW',
        formula: 'opening + Σ(deposit − withdrawal) per account',
        sourceRowIds: rowIds,
      });
    }
    return out;
  },
};

/** cash.bank_balance.total — 총 가용잔액(전 계좌 합). */
export const bankBalanceTotal: MetricDef = {
  name: 'bank_balance.total',
  label: '총 가용잔액',
  unit: 'KRW',
  compute(ctx) {
    const balances = bankBalances(ctx);
    const total = sum([...balances.values()].map((b) => b.balance));
    const rowIds = [...balances.values()].flatMap((b) => b.rowIds);
    return {
      value: moneyString(total),
      unit: 'KRW',
      formula: 'Σ by_bank',
      sourceRowIds: rowIds,
    };
  },
};

/** cash.daily_net — 일일 순자금수지(다중: 일자별). */
export const dailyNet: MetricDef = {
  name: 'daily_net',
  label: '일일 자금수지',
  unit: 'KRW',
  compute(ctx) {
    const rows = ctx.rows(DatasetKind.BANK_TRANSACTIONS);
    const byDate = new Map<string, RawRow[]>();
    for (const r of rows) {
      const d = dateISO(r, 'txnDate');
      if (!d) continue;
      const arr = byDate.get(d) ?? [];
      arr.push(r);
      byDate.set(d, arr);
    }
    const out: MetricResult[] = [];
    for (const d of [...byDate.keys()].sort()) {
      const txns = byDate.get(d)!;
      const net = sum(txns.map((t) => sub(numOr0(t, 'depositAmt'), numOr0(t, 'withdrawalAmt'))));
      out.push({
        nameOverride: `daily_net.${d}`,
        value: moneyString(net),
        unit: 'KRW',
        formula: 'Σ당일입금 − Σ당일출금',
        sourceRowIds: txns.map((t) => t.id),
      });
    }
    return out;
  },
};

/** cash.available — 가용자금 = 총가용잔액 + 약정한도 − 당일확정지급. */
export const available: MetricDef = {
  name: 'available',
  label: '가용자금',
  unit: 'KRW',
  compute(ctx) {
    const balances = bankBalances(ctx);
    const total = sum([...balances.values()].map((b) => b.balance));
    // 약정한도(마이너스/당좌) 합.
    const overdraft = sum(
      ctx.rows(DatasetKind.BANK_ACCOUNT_MASTER).map((m) => numOr0(m, 'overdraftLimit')),
    );
    // 당일 확정 지급(스케줄 중 direction=지급 & certainty=확정 & scheduledDate=period 단일일자).
    const todayPayments = sum(
      ctx
        .rows(DatasetKind.CASHFLOW_SCHEDULE)
        .filter(
          (r) =>
            str(r, 'direction') === '지급' &&
            str(r, 'certainty') === '확정' &&
            dateISO(r, 'scheduledDate') === ctx.period,
        )
        .map((r) => numOr0(r, 'amount')),
    );
    const value = sub(add(total, overdraft), todayPayments);
    return {
      value: moneyString(value),
      unit: 'KRW',
      formula: 'total + overdraftLimit − 당일확정지급',
    };
  },
};

/**
 * confirmed 항목만 일자별 누적해 N일 예측 잔액 시계열을 만든다(PRD §4.1-A).
 * 확정(certainty=확정)인 수금/지급만 포함. 미확정은 ar.expectedCollections로 분리(여기 미포함).
 */
function projection(ctx: CalcContext): {
  series: Array<{ date: string; balance: Decimal }>;
  rowIds: string[];
} {
  const balances = bankBalances(ctx);
  let running = sum([...balances.values()].map((b) => b.balance));
  const startRowIds = [...balances.values()].flatMap((b) => b.rowIds);

  const startDate = ctx.period.length === 10 ? ctx.period : `${ctx.period}-01`;
  const days = ctx.thresholds.forecastDays;

  // 확정 스케줄을 일자별 순증감으로 집계.
  const byDate = new Map<string, Decimal>();
  const usedRowIds: string[] = [];
  for (const r of ctx.rows(DatasetKind.CASHFLOW_SCHEDULE)) {
    if (str(r, 'certainty') !== '확정') continue;
    const d = dateISO(r, 'scheduledDate');
    if (!d) continue;
    const amt = numOr0(r, 'amount');
    const signed = str(r, 'direction') === '수금' ? amt : amt.negated();
    byDate.set(d, add(byDate.get(d) ?? dec(0), signed));
    usedRowIds.push(r.id);
  }

  const series: Array<{ date: string; balance: Decimal }> = [];
  const startT = Date.parse(`${startDate}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    const iso = new Date(startT + i * 86_400_000).toISOString().slice(0, 10);
    const delta = byDate.get(iso) ?? dec(0);
    running = add(running, delta);
    series.push({ date: iso, balance: running });
  }
  return { series, rowIds: [...startRowIds, ...usedRowIds] };
}

/** cash.forecast.confirmed — N일 확정 현금흐름 예측 잔액 시계열(다중). */
export const forecastConfirmed: MetricDef = {
  name: 'forecast.confirmed',
  label: '향후 N일 확정 현금흐름(예측 잔액)',
  unit: 'KRW',
  compute(ctx) {
    const { series, rowIds } = projection(ctx);
    return series.map((p) => ({
      nameOverride: `forecast.confirmed.${p.date}`,
      value: moneyString(p.balance),
      unit: 'KRW' as const,
      formula: '잔액_d = 잔액_{d-1} + 확정수금_d − 확정지급_d',
      sourceRowIds: rowIds,
    }));
  },
};

/** cash.forecast.min_balance — 예측구간 최저잔액(+ 발생일). */
export const forecastMinBalance: MetricDef = {
  name: 'forecast.min_balance',
  label: '예측 최저잔액',
  unit: 'KRW',
  compute(ctx) {
    const { series, rowIds } = projection(ctx);
    if (series.length === 0) return null;
    let minP = series[0]!;
    for (const p of series) {
      if (p.balance.lessThan(minP.balance)) minP = p;
    }
    return {
      value: moneyString(minP.balance),
      unit: 'KRW',
      formula: `min_d 잔액_d (발생일 ${minP.date})`,
      sourceRowIds: rowIds,
    };
  },
};

/** 차입여력 = 당좌·마이너스 한도 총합(MVP: 미사용 가정). */
function creditHeadroom(ctx: CalcContext): Decimal {
  return sum(ctx.rows(DatasetKind.BANK_ACCOUNT_MASTER).map((m) => numOr0(m, 'overdraftLimit')));
}

/** 자금 데이터(계좌·거래·스케줄) 존재 여부 — 없으면 부족 분석 생략. */
function hasCashData(ctx: CalcContext): boolean {
  return (
    ctx.rows(DatasetKind.BANK_ACCOUNT_MASTER).length > 0 ||
    ctx.rows(DatasetKind.BANK_TRANSACTIONS).length > 0 ||
    ctx.rows(DatasetKind.CASHFLOW_SCHEDULE).length > 0
  );
}

/** 예측 구간 최저 잔액(부족분 산정용). */
function minBalanceOf(ctx: CalcContext): Decimal | null {
  const { series } = projection(ctx);
  if (series.length === 0) return null;
  return series.reduce<Decimal>((m, p) => (p.balance.lessThan(m) ? p.balance : m), series[0]!.balance);
}

/** cash.credit.headroom — 차입여력(당좌·마이너스 한도). */
export const creditHeadroomMetric: MetricDef = {
  name: 'credit.headroom',
  label: '차입여력(당좌·마이너스 한도)',
  unit: 'KRW',
  compute(ctx) {
    if (!hasCashData(ctx)) return null;
    return { value: moneyString(creditHeadroom(ctx)), unit: 'KRW', formula: 'Σ overdraftLimit' };
  },
};

/** cash.shortfall.amount — 안전선 대비 예측 자금부족분. */
export const shortfallAmount: MetricDef = {
  name: 'shortfall.amount',
  label: '예측 자금부족분(안전선 대비)',
  unit: 'KRW',
  compute(ctx) {
    const min = minBalanceOf(ctx);
    if (min === null || !hasCashData(ctx)) return null;
    const safety = dec(ctx.thresholds.liquiditySafetyBalance);
    const sf = max([sub(safety, min), 0]) ?? dec(0);
    return { value: moneyString(sf), unit: 'KRW', formula: 'max(안전선 − 예측최저, 0)' };
  },
};

/** cash.shortfall.after_credit — 차입여력 차감 후 순부족. */
export const shortfallAfterCredit: MetricDef = {
  name: 'shortfall.after_credit',
  label: '한도 차감 후 순부족',
  unit: 'KRW',
  compute(ctx) {
    const min = minBalanceOf(ctx);
    if (min === null || !hasCashData(ctx)) return null;
    const safety = dec(ctx.thresholds.liquiditySafetyBalance);
    const sf = max([sub(safety, min), 0]) ?? dec(0);
    const net = max([sub(sf, creditHeadroom(ctx)), 0]) ?? dec(0);
    return { value: moneyString(net), unit: 'KRW', formula: 'max(부족분 − 차입여력, 0)' };
  },
};

/** alias/날짜를 metricId-안전 슬러그로. 한글 보존, 공백/특수문자만 치환. */
function slug(s: string): string {
  return s.replace(/\s+/g, '_').replace(/[^0-9A-Za-z가-힣_.-]/g, '');
}

/** 자금 도메인 metric 집합(등록 순서 = 계산 순서). */
export const CASH_METRICS: MetricDef[] = [
  bankBalanceByBank,
  bankBalanceTotal,
  dailyNet,
  available,
  forecastConfirmed,
  forecastMinBalance,
  creditHeadroomMetric,
  shortfallAmount,
  shortfallAfterCredit,
  ...AR_METRICS,
];

/** 예측 최저잔액 metricId(플래그가 참조). 외부 노출용. */
export const FORECAST_MIN_BALANCE_NAME = 'forecast.min_balance';
