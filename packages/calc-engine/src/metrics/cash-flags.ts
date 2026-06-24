/**
 * metrics/cash-flags.ts — 자금 도메인 Flag(PRD §4.3, 슬라이스 A 유동성 경보).
 *
 * 코드는 '플래그(사실)'만 만든다 — 왜/권고는 AI 영역. value/expected는 그대로 인용된다.
 */
import { dec, gt, lt, moneyString } from '../decimal.js';
import { metricId } from '../ids.js';
import { Flag } from '@axaxax/shared';
import { FlagDef } from '../registry.js';
import { FORECAST_MIN_BALANCE_NAME } from './cash.js';
import { AR_FLAGS } from './cash-ar.js';

/**
 * flag.min_balance_below_threshold — 예측 최저잔액 < 안전선.
 * threshold는 thresholds.liquiditySafetyBalance(기본 0원).
 */
export const minBalanceBelowThreshold: FlagDef = {
  name: 'min_balance_below_threshold',
  type: 'min_balance_below_threshold',
  compute(ctx, metrics) {
    const minId = metricId(ctx.domain, ctx.period, FORECAST_MIN_BALANCE_NAME);
    const m = metrics.find((x) => x.id === minId);
    if (!m) return null;
    const threshold = dec(ctx.thresholds.liquiditySafetyBalance);
    const observed = dec(m.value);
    if (!lt(observed, threshold)) return null;
    return [
      {
        type: 'min_balance_below_threshold',
        severity: 'WARN',
        message: `예측 최저잔액 ${moneyString(observed)}원이 안전선 ${moneyString(
          threshold,
        )}원 미만`,
        value: moneyString(observed),
        expected: moneyString(threshold),
        evidenceCells: [],
        sourceRowIds: m.sourceRowIds ?? [],
      },
    ];
  },
};

/**
 * flag.shortfall_exceeds_credit — 차입여력(당좌·마이너스 한도)으로도 못 메우는 순부족.
 * 안전선 하회(WARN)보다 심각 → FATAL(위험). 단, flag severity는 AI 차단과 무관(검증 게이트는 별도).
 */
export const shortfallExceedsCredit: FlagDef = {
  name: 'shortfall_exceeds_credit',
  type: 'shortfall_exceeds_credit',
  compute(ctx, metrics) {
    const net = metrics.find((x) => x.id === metricId(ctx.domain, ctx.period, 'shortfall.after_credit'));
    if (!net || !gt(dec(net.value), 0)) return null;
    const headroom = metrics.find((x) => x.id === metricId(ctx.domain, ctx.period, 'credit.headroom'))?.value ?? '0';
    const out: Omit<Flag, 'id'>[] = [
      {
        type: 'shortfall_exceeds_credit',
        severity: 'FATAL',
        message: `예측 자금부족이 차입여력(당좌·마이너스 한도 ${headroom}원)을 초과 — 한도 차감 후 순부족 ${net.value}원. 추가 차입·수금 독촉·지급 연기 등 대응 필요`,
        value: net.value,
        expected: headroom,
        evidenceCells: [],
        sourceRowIds: [],
      },
    ];
    return out;
  },
};

export const CASH_FLAGS: FlagDef[] = [minBalanceBelowThreshold, shortfallExceedsCredit, ...AR_FLAGS];
