/**
 * ids.ts — 결정론적 ID 생성 헬퍼.
 *
 * PRD §0.6/§5.1: metricId 규칙 `{domain}.{period}.{name}` (예: cf.2026-06.net_change),
 * flagId 규칙 `{domain}.{period}.flag.{name}`.
 * 같은 입력 → 같은 ID(프롬프트 캐시 친화·멱등).
 */

/** metricId: `{domain}.{period}.{name}`. */
export function metricId(domain: string, period: string, name: string): string {
  return `${domain}.${period}.${name}`;
}

/** flagId: `{domain}.{period}.flag.{name}`. */
export function flagId(domain: string, period: string, name: string): string {
  return `${domain}.${period}.flag.${name}`;
}
