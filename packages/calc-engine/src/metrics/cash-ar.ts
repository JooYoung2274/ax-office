/**
 * metrics/cash-ar.ts — 매출채권 회수(AR aging). 자금일보(cash) 도메인 확장.
 *
 * 거래처별 미수금을 기준일(period=asOf) 대비 연령구간으로 분류하고,
 * 연체 합계·거래처 집중도를 산출 + 장기연체(대손위험)·집중도 초과를 플래그.
 * 코드는 '사실'만; '왜 회수가 지연되나'의 해석은 AI.
 */
import { add, dec, Decimal, div, gt, moneyString, mul, ratioString, sum } from '../decimal.js';
import { dateISO, numOr0, str } from '../parse.js';
import { Flag } from '@axaxax/shared';
import { MetricDef, MetricResult, FlagDef } from '../registry.js';
import { CalcContext, DatasetKind, RawRow } from '../types.js';

const BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90plus'] as const;
type Bucket = (typeof BUCKETS)[number];

interface ArRow {
  rowId: string;
  counterparty: string;
  amount: Decimal;
  overdueDays: number;
  bucket: Bucket;
}

/** 두 ISO 일자 사이의 일수(to − from). 파싱 실패 시 0. */
function daysBetween(fromISO: string, toISO: string): number {
  const f = Date.parse(`${fromISO}T00:00:00Z`);
  const t = Date.parse(`${toISO}T00:00:00Z`);
  if (Number.isNaN(f) || Number.isNaN(t)) return 0;
  return Math.round((t - f) / 86_400_000);
}

function bucketOf(overdueDays: number): Bucket {
  if (overdueDays <= 0) return 'current';
  if (overdueDays <= 30) return 'd1_30';
  if (overdueDays <= 60) return 'd31_60';
  if (overdueDays <= 90) return 'd61_90';
  return 'd90plus';
}

/** 기준일(asOf): period가 YYYY-MM이면 1일로 보정. */
function asOfDate(ctx: CalcContext): string {
  return ctx.period.length === 10 ? ctx.period : `${ctx.period}-01`;
}

/** AR 데이터를 거래처별 미수금·연령구간으로 정규화(결정론). */
export function arRows(ctx: CalcContext): ArRow[] {
  const asOf = asOfDate(ctx);
  return ctx.rows(DatasetKind.AR_AGING).map((r: RawRow) => {
    const due = dateISO(r, 'dueDate') ?? asOf; // 만기 없으면 미도래 취급
    const overdueDays = daysBetween(due, asOf);
    return {
      rowId: r.id,
      counterparty: str(r, 'counterparty') || '(미지정)',
      amount: numOr0(r, 'amount'),
      overdueDays,
      bucket: bucketOf(overdueDays),
    };
  });
}

/** 거래처별 합계(집중도·장기연체용). 결정론: 이름 정렬. */
function byCounterparty(rows: ArRow[]): Array<{ name: string; amount: Decimal; worstOverdue: number; rowIds: string[] }> {
  const map = new Map<string, { amount: Decimal; worstOverdue: number; rowIds: string[] }>();
  for (const r of rows) {
    const g = map.get(r.counterparty) ?? { amount: dec(0), worstOverdue: 0, rowIds: [] };
    g.amount = add(g.amount, r.amount);
    g.worstOverdue = Math.max(g.worstOverdue, r.overdueDays);
    g.rowIds.push(r.rowId);
    map.set(r.counterparty, g);
  }
  return [...map.keys()].sort().map((name) => ({ name, ...map.get(name)! }));
}

function slug(s: string): string {
  return (s || '').replace(/\s+/g, '_').replace(/[^0-9A-Za-z가-힣_.-]/g, '') || 'X';
}

// ── Metrics ──────────────────────────────────────────────────

export const arTotal: MetricDef = {
  name: 'ar.total',
  label: '총 미수금',
  unit: 'KRW',
  compute(ctx) {
    const rows = arRows(ctx);
    if (rows.length === 0) return null;
    return { value: moneyString(sum(rows.map((r) => r.amount))), unit: 'KRW', formula: 'Σ미수금', sourceRowIds: rows.map((r) => r.rowId) };
  },
};

export const arBuckets: MetricDef = {
  name: 'ar.bucket',
  label: '연령구간별 미수금',
  unit: 'KRW',
  compute(ctx) {
    const rows = arRows(ctx);
    if (rows.length === 0) return null;
    return BUCKETS.map((b): MetricResult => {
      const inBucket = rows.filter((r) => r.bucket === b);
      return {
        nameOverride: `ar.bucket.${b}`,
        value: moneyString(sum(inBucket.map((r) => r.amount))),
        unit: 'KRW',
        formula: `연령구간 ${b}`,
        sourceRowIds: inBucket.map((r) => r.rowId),
      };
    });
  },
};

export const arOverdueTotal: MetricDef = {
  name: 'ar.overdue.total',
  label: '연체 미수금 합계',
  unit: 'KRW',
  compute(ctx) {
    const rows = arRows(ctx);
    if (rows.length === 0) return null;
    const overdue = rows.filter((r) => r.overdueDays > 0);
    return { value: moneyString(sum(overdue.map((r) => r.amount))), unit: 'KRW', formula: 'Σ연체 미수금', sourceRowIds: overdue.map((r) => r.rowId) };
  },
};

export const arConcentration: MetricDef = {
  name: 'ar.concentration',
  label: '최대 거래처 집중도',
  unit: 'PERCENT',
  compute(ctx) {
    const rows = arRows(ctx);
    if (rows.length === 0) return null;
    const total = sum(rows.map((r) => r.amount));
    if (!gt(total, 0)) return { value: '0.00', unit: 'PERCENT' };
    const cps = byCounterparty(rows);
    const top = cps.reduce((m, c) => (gt(c.amount, m.amount) ? c : m), cps[0]!);
    const pct = mul(div(top.amount, total) ?? dec(0), 100);
    return { value: ratioString(pct), unit: 'PERCENT', formula: '최대거래처/총미수금', sourceRowIds: top.rowIds };
  },
};

export const arByCounterparty: MetricDef = {
  name: 'ar.by_counterparty',
  label: '거래처별 미수금',
  unit: 'KRW',
  compute(ctx) {
    const rows = arRows(ctx);
    if (rows.length === 0) return null;
    return byCounterparty(rows).map((c): MetricResult => ({
      nameOverride: `ar.by_counterparty.${slug(c.name)}`,
      value: moneyString(c.amount),
      unit: 'KRW',
      formula: `${c.name} 미수금(최장연체 ${c.worstOverdue}일)`,
      sourceRowIds: c.rowIds,
    }));
  },
};

export const AR_METRICS: MetricDef[] = [arTotal, arBuckets, arOverdueTotal, arConcentration, arByCounterparty];

// ── Flags ────────────────────────────────────────────────────

/** flag.ar_long_overdue — 거래처별 장기 연체(대손 위험). */
export const arLongOverdue: FlagDef = {
  name: 'ar_long_overdue',
  type: 'ar_long_overdue',
  compute(ctx) {
    const limit = ctx.thresholds.arLongOverdueDays;
    const out: Omit<Flag, 'id'>[] = [];
    for (const c of byCounterparty(arRows(ctx))) {
      if (c.worstOverdue > limit && gt(c.amount, 0)) {
        out.push({
          type: 'ar_long_overdue',
          severity: 'WARN',
          message: `${c.name} 미수금 ${moneyString(c.amount)}원이 ${c.worstOverdue}일 연체(대손 위험, 임계 ${limit}일 초과)`,
          accountId: c.name,
          value: moneyString(c.amount),
          expected: String(limit),
          evidenceCells: [],
          sourceRowIds: c.rowIds,
        });
      }
    }
    return out.length ? out : null;
  },
};

/** flag.ar_concentration — 최대 거래처 매출채권 집중도 초과. */
export const arConcentrationFlag: FlagDef = {
  name: 'ar_concentration',
  type: 'ar_concentration',
  compute(ctx) {
    const rows = arRows(ctx);
    if (rows.length === 0) return null;
    const total = sum(rows.map((r) => r.amount));
    if (!gt(total, 0)) return null;
    const cps = byCounterparty(rows);
    const top = cps.reduce((m, c) => (gt(c.amount, m.amount) ? c : m), cps[0]!);
    const pct = mul(div(top.amount, total) ?? dec(0), 100);
    if (!gt(pct, ctx.thresholds.arConcentrationPct)) return null;
    return [
      {
        type: 'ar_concentration',
        severity: 'WARN',
        message: `${top.name} 매출채권 집중도 ${ratioString(pct)}%가 내부 한도 ${ctx.thresholds.arConcentrationPct}%를 초과`,
        accountId: top.name,
        value: ratioString(pct),
        expected: String(ctx.thresholds.arConcentrationPct),
        evidenceCells: [],
        sourceRowIds: top.rowIds,
      },
    ];
  },
};

export const AR_FLAGS: FlagDef[] = [arLongOverdue, arConcentrationFlag];
