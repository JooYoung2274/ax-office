/**
 * metrics/closing-flags.ts — 월결산 도메인 Flag(PRD §4.3, 슬라이스 B 이상 탐지).
 *
 * 코드는 '플래그(사실)'만 — 해석/우선순위/권고는 AI. 차대불균형은 ValidationEngine FATAL이
 * 이미 처리하므로(AI 차단), 여기서는 통과 가능한 이상 variance만 플래그한다.
 */
import { abs, dec, gt, ratioString } from '../decimal.js';
import { FlagDef } from '../registry.js';

/**
 * flag.abnormal_account_variance — YoY 증감률 metric이 임계 초과한 계정.
 * 이미 산출된 var.yoy.pct.* metric을 참조(재계산 없음).
 */
export const abnormalAccountVariance: FlagDef = {
  name: 'abnormal_account_variance',
  type: 'abnormal_account_variance',
  compute(ctx, metrics) {
    const theta = dec(ctx.thresholds.momChangePct); // 증감률 임계(% 절대값)
    const flags = [];
    for (const m of metrics) {
      // var.yoy.pct.<line> 형태만.
      if (!m.id.includes('.var.yoy.pct.')) continue;
      const pct = dec(m.value);
      if (gt(abs(pct), theta)) {
        flags.push({
          type: 'abnormal_account_variance',
          severity: 'WARN' as const,
          message: `전기대비 증감률 이상: ${m.name} ${ratioString(pct)}% (임계 ±${theta.toFixed(
            0,
          )}%)`,
          value: ratioString(pct),
          expected: theta.toFixed(0),
          evidenceCells: [],
          sourceRowIds: m.sourceRowIds ?? [],
        });
      }
    }
    return flags.length ? flags : null;
  },
};

export const CLOSING_FLAGS: FlagDef[] = [abnormalAccountVariance];
