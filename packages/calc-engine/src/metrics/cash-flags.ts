/**
 * metrics/cash-flags.ts — 자금 도메인 Flag(PRD §4.3, 슬라이스 A 유동성 경보).
 *
 * 코드는 '플래그(사실)'만 만든다 — 왜/권고는 AI 영역. value/expected는 그대로 인용된다.
 */
import { dec, lt, moneyString } from '../decimal.js';
import { metricId } from '../ids.js';
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

export const CASH_FLAGS: FlagDef[] = [minBalanceBelowThreshold, ...AR_FLAGS];
