/**
 * decimal.ts — decimal.js 래퍼.
 *
 * PRD §4.0/§4.4: 모든 금액·비율 연산은 raw JS float를 절대 쓰지 않고
 * Decimal로만 수행한다(`.plus/.minus/.times/.dividedBy`). 내부 정밀도는
 * DECIMAL_PLACES=10으로 누적하고, 표시 직전에만 ROUND_HALF_UP으로 반올림한다.
 *
 * Metric.value 는 decimal-safe 직렬화를 위해 항상 "문자열"로 보관한다.
 */
import Decimal from 'decimal.js';

// 전역 결정론 설정: 동일 입력 → 동일 출력.
// 내부 정밀도 10자리, 반올림 ROUND_HALF_UP, 지수표기 억제(항상 일반표기 직렬화).
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -1_000_000,
  toExpPos: 1_000_000,
});

/** 내부 누적 정밀도(소수 자릿수). PRD §4.4 DECIMAL_PLACES=10. */
export const DECIMAL_PLACES = 10;

/** 표시용 통화 소수 자릿수(원 단위 정수). */
export const MONEY_SCALE = 0;
/** 표시용 비율/퍼센트 소수 자릿수. */
export const RATIO_SCALE = 2;

export type Numeric = Decimal.Value;

/** 안전 생성자. 빈 문자열·null·undefined·NaN은 0으로 흡수(원본 보존은 RawRow가 담당). */
export function dec(v: Numeric | null | undefined): Decimal {
  if (v === null || v === undefined || v === '') return new Decimal(0);
  try {
    const d = new Decimal(v);
    return d.isNaN() ? new Decimal(0) : d;
  } catch {
    return new Decimal(0);
  }
}

export const ZERO = new Decimal(0);

export function add(a: Numeric, b: Numeric): Decimal {
  return dec(a).plus(dec(b));
}

export function sub(a: Numeric, b: Numeric): Decimal {
  return dec(a).minus(dec(b));
}

export function mul(a: Numeric, b: Numeric): Decimal {
  return dec(a).times(dec(b));
}

/**
 * 안전 나눗셈. 분모 ≤ 0 가드(PRD §4.1-C). 분모가 0이거나 음수면 null 반환 —
 * 호출부가 info 플래그를 발화하거나 metric value를 비운다.
 */
export function div(a: Numeric, b: Numeric, allowNegativeDenominator = false): Decimal | null {
  const denom = dec(b);
  if (denom.isZero()) return null;
  if (!allowNegativeDenominator && denom.isNegative()) return null;
  return dec(a).dividedBy(denom);
}

/** 합계. 빈 배열은 0. */
export function sum(values: Numeric[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), new Decimal(0));
}

/** 평균. 빈 배열·n=0이면 null. */
export function avg(values: Numeric[]): Decimal | null {
  if (values.length === 0) return null;
  return sum(values).dividedBy(values.length);
}

/** 비교: a<b → -1, a==b → 0, a>b → 1. */
export function compare(a: Numeric, b: Numeric): -1 | 0 | 1 {
  return dec(a).comparedTo(dec(b)) as -1 | 0 | 1;
}

export function eq(a: Numeric, b: Numeric): boolean {
  return dec(a).equals(dec(b));
}

export function lt(a: Numeric, b: Numeric): boolean {
  return dec(a).lessThan(dec(b));
}

export function gt(a: Numeric, b: Numeric): boolean {
  return dec(a).greaterThan(dec(b));
}

export function abs(a: Numeric): Decimal {
  return dec(a).abs();
}

export function min(values: Numeric[]): Decimal | null {
  if (values.length === 0) return null;
  return values.reduce<Decimal>((m, v) => (dec(v).lessThan(m) ? dec(v) : m), dec(values[0]));
}

/**
 * 표시용 문자열. ROUND_HALF_UP으로 scale 자리 반올림한 일반표기 문자열.
 * Metric.value 직렬화의 종착점.
 */
export function toFixedString(v: Numeric, scale: number = MONEY_SCALE): string {
  return dec(v).toFixed(scale, Decimal.ROUND_HALF_UP);
}

/** 금액(원, 정수) 문자열. */
export function moneyString(v: Numeric): string {
  return toFixedString(v, MONEY_SCALE);
}

/** 비율/퍼센트 문자열(소수 둘째). */
export function ratioString(v: Numeric): string {
  return toFixedString(v, RATIO_SCALE);
}

export { Decimal };
