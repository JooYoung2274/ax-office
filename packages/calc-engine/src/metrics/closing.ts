/**
 * metrics/closing.ts — 월결산 metric 정의(PRD §4.1-B, 슬라이스 B).
 *
 * 시산표 차/대 합계, 정형 결산분개(정액·정률 감가상각, 선급비용 안분, 정기 미지급 계상),
 * 시산표→BS/IS 매핑 합계, 간접법 현금흐름 수치, YoY/MoM 증감액·증감률.
 */
import { abs, dec, Decimal, div, mul, ratioString, moneyString, sub, sum } from '../decimal.js';
import { numOr0, num, str } from '../parse.js';
import { MetricDef, MetricResult } from '../registry.js';
import { CalcContext, DatasetKind, RawRow } from '../types.js';

/** tb.debit_total — 시산표 차변 합계. */
export const debitTotal: MetricDef = {
  name: 'tb.debit_total',
  label: '시산표 차변 합계',
  unit: 'KRW',
  compute(ctx) {
    const rows = ctx.rows(DatasetKind.TRIAL_BALANCE);
    if (rows.length === 0) return null;
    return {
      value: moneyString(sum(rows.map((r) => numOr0(r, 'debitTotal')))),
      unit: 'KRW',
      formula: 'Σ 모든계정.차변',
      sourceRowIds: rows.map((r) => r.id),
    };
  },
};

/** tb.credit_total — 시산표 대변 합계. */
export const creditTotal: MetricDef = {
  name: 'tb.credit_total',
  label: '시산표 대변 합계',
  unit: 'KRW',
  compute(ctx) {
    const rows = ctx.rows(DatasetKind.TRIAL_BALANCE);
    if (rows.length === 0) return null;
    return {
      value: moneyString(sum(rows.map((r) => numOr0(r, 'creditTotal')))),
      unit: 'KRW',
      formula: 'Σ 모든계정.대변',
      sourceRowIds: rows.map((r) => r.id),
    };
  },
};

/** tb.balance_check — 차대 일치 검증값(=0이어야 함). */
export const balanceCheck: MetricDef = {
  name: 'tb.balance_check',
  label: '차대 일치 검증값',
  unit: 'KRW',
  compute(ctx) {
    const rows = ctx.rows(DatasetKind.TRIAL_BALANCE);
    if (rows.length === 0) return null;
    const d = sum(rows.map((r) => numOr0(r, 'debitTotal')));
    const c = sum(rows.map((r) => numOr0(r, 'creditTotal')));
    return {
      value: moneyString(sub(d, c)),
      unit: 'KRW',
      formula: 'debitTotal − creditTotal (=0)',
      sourceRowIds: rows.map((r) => r.id),
    };
  },
};

/**
 * je.depreciation.sl — 정액 감가상각(자산별, 다중).
 * (취득가 − 잔존가) / 내용연수(월) × 당월귀속월수(기본 1).
 * 잔존가 미제공 시 0. 누계 ≤ (취득가−잔존) 캡.
 */
export const depreciationSL: MetricDef = {
  name: 'je.depreciation.sl',
  label: '감가상각(정액)',
  unit: 'KRW',
  compute(ctx) {
    const out: MetricResult[] = [];
    for (const r of ctx.rows(DatasetKind.FIXED_ASSET)) {
      if (str(r, 'method') !== '정액') continue;
      const cost = numOr0(r, 'acquisitionCost');
      const salvage = numOr0(r, 'salvageValue');
      const life = numOr0(r, 'usefulLifeMonths');
      if (life.isZero()) continue;
      const months = num(r, 'attributableMonths') ?? dec(1);
      const perMonth = div(sub(cost, salvage), life);
      if (!perMonth) continue;
      let dep = mul(perMonth, months);
      // 누계 캡: accumDepOpening + dep ≤ cost − salvage
      const accum = numOr0(r, 'accumDepOpening');
      const cap = sub(sub(cost, salvage), accum);
      if (dep.greaterThan(cap)) dep = cap.isNegative() ? dec(0) : cap;
      out.push({
        nameOverride: `je.depreciation.sl.${slug(str(r, 'assetCode'))}`,
        value: moneyString(dep),
        unit: 'KRW',
        formula: '(취득가−잔존)/내용연수(월) × 귀속월수',
        sourceRowIds: [r.id],
      });
    }
    return out.length ? out : null;
  },
};

/**
 * je.depreciation.db — 정률 감가상각(자산별, 다중).
 * 기초장부가 × 정률 ÷ 12 × 귀속월수. 누계 ≤ 취득가−잔존 캡.
 */
export const depreciationDB: MetricDef = {
  name: 'je.depreciation.db',
  label: '감가상각(정률)',
  unit: 'KRW',
  compute(ctx) {
    const out: MetricResult[] = [];
    for (const r of ctx.rows(DatasetKind.FIXED_ASSET)) {
      if (str(r, 'method') !== '정률') continue;
      const cost = numOr0(r, 'acquisitionCost');
      const salvage = numOr0(r, 'salvageValue');
      const accum = numOr0(r, 'accumDepOpening');
      const rate = num(r, 'decliningRate'); // 연 정률(예: 0.45)
      if (!rate) continue;
      const months = num(r, 'attributableMonths') ?? dec(1);
      const bookValue = sub(cost, accum);
      let dep = mul(mul(bookValue, rate).dividedBy(12), months);
      const cap = sub(sub(cost, salvage), accum);
      if (dep.greaterThan(cap)) dep = cap.isNegative() ? dec(0) : cap;
      out.push({
        nameOverride: `je.depreciation.db.${slug(str(r, 'assetCode'))}`,
        value: moneyString(dep),
        unit: 'KRW',
        formula: '기초장부가 × 정률 ÷ 12 × 귀속월수 (누계 캡)',
        sourceRowIds: [r.id],
      });
    }
    return out.length ? out : null;
  },
};

/**
 * je.prepaid.amort — 선급비용 안분(다중).
 * 선급총액 × (당월일수 / 약정총일수).
 * fixed_asset 외 별도 'prepaid' 데이터셋이 없으므로 cashflow_schedule의 itemType='선급'은 미사용;
 * caller가 'prepaid' kind를 줄 수 있도록 일반화.
 */
export const prepaidAmort: MetricDef = {
  name: 'je.prepaid.amort',
  label: '선급비용 안분',
  unit: 'KRW',
  compute(ctx) {
    const rows = ctx.rows('prepaid');
    const out: MetricResult[] = [];
    for (const r of rows) {
      const total = numOr0(r, 'prepaidTotal');
      const monthDays = num(r, 'periodDays');
      const totalDays = num(r, 'contractDays');
      if (!monthDays || !totalDays || totalDays.isZero()) continue;
      const amort = mul(total, div(monthDays, totalDays) ?? dec(0));
      out.push({
        nameOverride: `je.prepaid.amort.${slug(str(r, 'prepaidCode') || r.id)}`,
        value: moneyString(amort),
        unit: 'KRW',
        formula: '선급총액 × (당월일수/약정총일수)',
        sourceRowIds: [r.id],
      });
    }
    return out.length ? out : null;
  },
};

/**
 * je.accrual.recurring — 정기 미지급 계상(다중).
 * 약정 정기금액 × 당월 미계상분(기본 1기).
 */
export const accrualRecurring: MetricDef = {
  name: 'je.accrual.recurring',
  label: '정기 미지급 계상',
  unit: 'KRW',
  compute(ctx) {
    const rows = ctx.rows('accrual');
    const out: MetricResult[] = [];
    for (const r of rows) {
      const periodic = numOr0(r, 'periodicAmount');
      const periods = num(r, 'unaccruedPeriods') ?? dec(1);
      out.push({
        nameOverride: `je.accrual.recurring.${slug(str(r, 'accrualCode') || r.id)}`,
        value: moneyString(mul(periodic, periods)),
        unit: 'KRW',
        formula: '약정정기금액 × 당월미계상분',
        sourceRowIds: [r.id],
      });
    }
    return out.length ? out : null;
  },
};

/** 시산표 행의 statement(BS/IS) 별 기말잔액 합계. */
function statementTotal(rows: RawRow[], stmt: 'BS' | 'IS'): { total: Decimal; rowIds: string[] } {
  const matched = rows.filter((r) => str(r, 'statement').toUpperCase() === stmt);
  const total = sum(
    matched.map((r) => {
      const close = num(r, 'closingBalance');
      if (close !== null) return close;
      // 기말 미제공 시 기초 ± (차−대).
      return numOr0(r, 'openingBalance').plus(sub(numOr0(r, 'debitTotal'), numOr0(r, 'creditTotal')));
    }),
  );
  return { total, rowIds: matched.map((r) => r.id) };
}

/** fs.bs.total — 재무상태표 매핑 합계(BS 귀속 계정 잔액 합). */
export const bsTotal: MetricDef = {
  name: 'fs.bs.total',
  label: '재무상태표 매핑 합계',
  unit: 'KRW',
  compute(ctx) {
    const rows = ctx.rows(DatasetKind.TRIAL_BALANCE);
    if (rows.length === 0) return null;
    const { total, rowIds } = statementTotal(rows, 'BS');
    return {
      value: moneyString(total),
      unit: 'KRW',
      formula: 'Σ BS귀속 계정잔액',
      sourceRowIds: rowIds,
    };
  },
};

/** fs.is.total — 손익계산서 매핑 합계(IS 귀속 계정 잔액 합). */
export const isTotal: MetricDef = {
  name: 'fs.is.total',
  label: '손익계산서 매핑 합계',
  unit: 'KRW',
  compute(ctx) {
    const rows = ctx.rows(DatasetKind.TRIAL_BALANCE);
    if (rows.length === 0) return null;
    const { total, rowIds } = statementTotal(rows, 'IS');
    return {
      value: moneyString(total),
      unit: 'KRW',
      formula: 'Σ IS귀속 계정잔액',
      sourceRowIds: rowIds,
    };
  },
};

/**
 * fs.cf.indirect — 간접법 현금흐름 수치.
 * 당기순이익 + 비현금비용(감가상각 합) ± 운전자본증감.
 * caller가 별도 'cf_indirect' kind에 netIncome/nonCashExpense/workingCapitalDelta를 줄 수 있다.
 * 없으면 감가상각 metric을 비현금비용으로 사용 가능하나, 결정론 단순화를 위해 입력 우선.
 */
export const cfIndirect: MetricDef = {
  name: 'fs.cf.indirect',
  label: '현금흐름표(간접법)',
  unit: 'KRW',
  compute(ctx) {
    const rows = ctx.rows('cf_indirect');
    if (rows.length === 0) return null;
    const r = rows[0]!;
    const netIncome = numOr0(r, 'netIncome');
    const nonCash = numOr0(r, 'nonCashExpense');
    const wcDelta = numOr0(r, 'workingCapitalDelta');
    const invFin = numOr0(r, 'investingFinancing');
    const value = netIncome.plus(nonCash).plus(wcDelta).plus(invFin);
    return {
      value: moneyString(value),
      unit: 'KRW',
      formula: '당기순이익 + 비현금비용 ± 운전자본증감 ± 투자·재무',
      sourceRowIds: [r.id],
    };
  },
};

/**
 * var.yoy — 전기대비 증감액·증감률(다중: comparative_fs 라인별).
 * 증감액 = 당기 − 전기. 증감률 = (당기−전기)/|전기|×100 (전기=0이면 률은 null).
 */
export const yoyVariance: MetricDef = {
  name: 'var.yoy',
  label: '전기대비 증감',
  unit: 'KRW',
  compute(ctx) {
    const rows = ctx.rows(DatasetKind.COMPARATIVE_FS);
    const out: MetricResult[] = [];
    for (const r of rows) {
      const curr = numOr0(r, 'currentAmt');
      const prior = numOr0(r, 'priorAmt');
      const line = slug(str(r, 'lineItem') || r.id);
      const amount = sub(curr, prior);
      out.push({
        nameOverride: `var.yoy.amount.${line}`,
        value: moneyString(amount),
        unit: 'KRW',
        formula: '당기 − 전기',
        sourceRowIds: [r.id],
      });
      if (!prior.isZero()) {
        const pct = mul(div(amount, abs(prior)) ?? dec(0), 100);
        out.push({
          nameOverride: `var.yoy.pct.${line}`,
          value: ratioString(pct),
          unit: 'PERCENT',
          formula: '(당기−전기)/|전기|×100',
          sourceRowIds: [r.id],
        });
      }
      // 전기=0이면 률 metric 미생성(PRD: null+플래그). info.zeroPriorBase는 별도 룰로.
    }
    return out.length ? out : null;
  },
};

function slug(s: string): string {
  return s.replace(/\s+/g, '_').replace(/[^0-9A-Za-z가-힣_.-]/g, '');
}

/** 결산 도메인 metric 집합. */
export const CLOSING_METRICS: MetricDef[] = [
  debitTotal,
  creditTotal,
  balanceCheck,
  depreciationSL,
  depreciationDB,
  prepaidAmort,
  accrualRecurring,
  bsTotal,
  isTotal,
  cfIndirect,
  yoyVariance,
];
