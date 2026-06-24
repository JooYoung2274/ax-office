/**
 * 환각 차단의 기계적 게이트(후처리 검증기) — PRD §5.6.
 *
 * runGuard는 순수 함수다(부수효과·네트워크·시각 참조 없음 → 완전 단위 테스트 가능).
 * 검증 항목:
 *  (b) UNKNOWN_EVIDENCE_REF : 모든 finding.evidence_ref ∈ collectEvidenceIds(cro)
 *  (e) MISSING_EVIDENCE     : 각 finding은 evidence_ref ≥ 1개 (스키마가 1차 보장, 방어적 재검사)
 *  (c) UNGROUNDED_NUMBER    : summary + 각 observation의 숫자 토큰이 CRO 수치집합과 근사 일치
 *
 * (c)가 핵심: "숫자를 지어냈는가"를 CRO 값 집합과의 차집합으로 기계적으로 잡는다.
 * 표기 차이(1,850,000,000 vs 18.5억, 12% 등)를 흡수하되 CRO에 없는 새 값은 반드시 걸린다.
 */

import type { Cro, ReportContent, GuardResult, GuardViolation } from '@axaxax/shared';
import { collectEvidenceIds } from '@axaxax/shared';

/** 근사 일치 허용 상대오차(반올림·표기 차이 흡수용). */
const REL_EPSILON = 0.01; // 1%
/** 0 근방 비교용 절대 허용오차. */
const ABS_EPSILON = 0.5;

/**
 * CRO의 모든 인용 가능한 숫자값을 모은다.
 * - metric.value (문자열 decimal)
 * - flag.value / flag.expected (선택적 문자열 decimal)
 * 단위/배수 변형(억·만·%)을 함께 등록해 표기 차이 오탐을 줄인다.
 */
function buildCroNumberSet(cro: Cro): number[] {
  const raw: string[] = [];
  for (const m of cro.metrics) raw.push(m.value);
  for (const f of cro.flags) {
    if (f.value != null) raw.push(f.value);
    if (f.expected != null) raw.push(f.expected);
  }

  const set: number[] = [];
  for (const s of raw) {
    const n = parseDecimal(s);
    if (n == null) continue;
    set.push(n);
    // 억/만 단위로 축약 인용될 수 있으므로 동치 표현을 함께 등록.
    // 예) 1,850,000,000(원) ↔ "18.5억" 의 18.5
    if (Math.abs(n) >= 1) {
      set.push(n / 1e8); // 억
      set.push(n / 1e4); // 만
    }
  }
  return set;
}

/** 문자열에서 콤마/통화기호/괄호음수/△▲ 등을 제거하고 number로. 실패 시 null. */
function parseDecimal(s: string): number | null {
  if (s == null) return null;
  let t = String(s).trim();
  if (t === '') return null;

  // 괄호 음수: (1,000) → -1000
  let sign = 1;
  if (/^\(.*\)$/.test(t)) {
    sign = -1;
    t = t.slice(1, -1);
  }
  // 회계식 음수 기호
  if (/^[△▲-]/.test(t)) {
    sign = -1;
    t = t.replace(/^[△▲-]/, '');
  }
  // 통화기호·콤마·공백·퍼센트·원/% 라벨 제거
  t = t.replace(/[₩$,\s%]/g, '');
  t = t.replace(/원$/, '');
  if (t === '' || !/^[0-9]*\.?[0-9]+$/.test(t)) return null;

  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return sign * n;
}

/**
 * 자연어 텍스트에서 숫자 토큰을 추출한다.
 * 한국어 금액 관용표현(억·만·천)과 %·콤마·소수를 흡수해 "정규화된 숫자"로 변환.
 * 반환은 "텍스트에 등장한 의미상의 수치" 목록(= 그라운딩 대상).
 */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  if (!text) return out;

  // 1) 한국어 단위 결합 표현: "320억", "18.5억", "280만", "1,200억원" 등
  //    숫자 + (억|만|천) 조합을 우선 처리.
  const unitRe = /(\d[\d,]*\.?\d*)\s*(억|만|천)/g;
  const consumed: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = unitRe.exec(text)) != null) {
    const digits = m[1];
    const unit = m[2];
    if (digits == null || unit == null) continue;
    const base = parseDecimal(digits);
    if (base == null) continue;
    const mult = unit === '억' ? 1e8 : unit === '만' ? 1e4 : 1e3;
    // 절대값(원)과 단위 표기 숫자(억/만 단위) 둘 다 등록 → 양쪽 표기와 매칭 가능.
    out.push(base * mult);
    out.push(base);
    consumed.push([m.index, m.index + m[0].length]);
  }

  // 2) 나머지 일반 숫자(퍼센트·일수·건수·원 금액). 이미 단위표현으로 소비된 구간은 제외.
  const numRe = /-?\(?\d[\d,]*\.?\d*\)?%?/g;
  while ((m = numRe.exec(text)) != null) {
    const start = m.index;
    const end = m.index + m[0].length;
    if (consumed.some(([a, b]) => start >= a && start < b)) continue;
    const n = parseDecimal(m[0]);
    if (n == null) continue;
    out.push(n);
  }
  return out;
}

/** target이 CRO 수치집합 중 하나와 근사 일치하는가(상대 epsilon + 0근방 절대 epsilon). */
function hasApprox(croNumbers: number[], target: number): boolean {
  for (const c of croNumbers) {
    const diff = Math.abs(c - target);
    if (diff <= ABS_EPSILON) return true;
    const scale = Math.max(Math.abs(c), Math.abs(target));
    if (scale > 0 && diff / scale <= REL_EPSILON) return true;
  }
  return false;
}

/**
 * 환각 차단 가드 — 순수 함수. ok === (violations.length === 0).
 * NestJS api 패키지는 이 시그니처에 정확히 의존한다.
 */
export function runGuard(cro: Cro, content: ReportContent): GuardResult {
  const violations: GuardViolation[] = [];
  const allowedIds = collectEvidenceIds(cro);
  const croNumbers = buildCroNumberSet(cro);

  // (b) evidence_ref 유효성 + (e) finding당 근거 ≥ 1
  for (const f of content.findings) {
    if (!f.evidence_refs || f.evidence_refs.length === 0) {
      violations.push({
        kind: 'MISSING_EVIDENCE',
        findingId: f.id,
        detail: 'finding에 evidence_ref가 하나도 없다. 최소 1개의 CRO 항목ID가 필요하다.',
      });
    }
    for (const ref of f.evidence_refs ?? []) {
      if (!allowedIds.has(ref)) {
        violations.push({
          kind: 'UNKNOWN_EVIDENCE_REF',
          findingId: f.id,
          detail: `CRO에 존재하지 않는 evidence_ref "${ref}". (CRO의 metricId/flagId만 허용)`,
        });
      }
    }
  }

  // (c) 숫자 그라운딩: summary + 각 observation의 숫자 토큰이 CRO 수치와 근사 일치?
  const texts: Array<{ where: string; findingId?: string; text: string }> = [
    { where: 'summary', text: content.summary },
    ...content.findings.map((f) => ({
      where: `finding ${f.id} observation`,
      findingId: f.id,
      text: f.observation,
    })),
  ];

  for (const t of texts) {
    for (const num of extractNumbers(t.text)) {
      if (!hasApprox(croNumbers, num)) {
        violations.push({
          kind: 'UNGROUNDED_NUMBER',
          findingId: t.findingId,
          detail: `${t.where}에 CRO에 없는 수치 "${num}"가 등장했다. CRO의 metric/flag value만 인용하라.`,
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
