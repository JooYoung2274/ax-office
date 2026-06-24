/**
 * parse.ts — RawRow 필드 접근 헬퍼.
 *
 * RawRow.data는 표준필드키 → 원문 문자열. caller가 NORMALIZE까지 끝냈다는 가정이지만,
 * 콤마·괄호음수·통화기호 등 잔여 변형은 여기서 한 번 더 흡수한다(원본은 RawRow가 보존).
 */
import { dec, Decimal } from './decimal.js';
import { RawRow } from './types.js';

/** 문자열 필드(트림). 없으면 ''. */
export function str(row: RawRow, key: string): string {
  return (row.data[key] ?? '').trim();
}

/**
 * 금액/숫자 파싱. `1,000원`·`(1,000)`·`₩1,000`·`△1,000`·`▲1,000`을 음수/정수로 흡수.
 * 파싱 불가 시 null(검증 규칙이 dateParse/typeError로 별도 처리).
 */
export function num(row: RawRow, key: string): Decimal | null {
  const raw = str(row, key);
  if (raw === '') return null;
  let s = raw;
  let negative = false;

  // 괄호 음수 (1,000)
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  // 선행 음수 기호 변형
  if (/^[△▲−-]/.test(s)) {
    if (/^[△▲−-]/.test(s)) negative = true;
    s = s.replace(/^[△▲−-]/, '');
  }
  // 통화기호·콤마·공백·'원' 제거
  s = s.replace(/[₩,\s]/g, '').replace(/원$/, '');

  if (s === '' || !/^[0-9]*\.?[0-9]+$/.test(s)) return null;
  const d = dec(s);
  return negative ? d.negated() : d;
}

/** 숫자 파싱, 실패 시 0(필수합산용). */
export function numOr0(row: RawRow, key: string): Decimal {
  return num(row, key) ?? dec(0);
}

/**
 * 날짜 파싱 → 'YYYY-MM-DD'. `2024.01.05`·`24/1/5`·`2024-01-05` 흡수.
 * 파싱 불가 시 null.
 */
export function dateISO(row: RawRow, key: string): string | null {
  const raw = str(row, key);
  if (raw === '') return null;
  const norm = raw.replace(/[./]/g, '-');
  const m = norm.match(/^(\d{2,4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  let [, y, mo, d] = m as unknown as [string, string, string, string];
  if (y.length === 2) y = `20${y}`;
  const yy = Number(y);
  const mm = Number(mo);
  const dd = Number(d);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yy.toString().padStart(4, '0')}-${mm.toString().padStart(2, '0')}-${dd
    .toString()
    .padStart(2, '0')}`;
}

/** 헤더(컬럼키) 존재 여부 — 데이터셋 전체에서 한 행이라도 해당 키를 가지면 존재로 본다. */
export function hasColumn(rows: RawRow[], key: string): boolean {
  return rows.some((r) => key in r.data);
}
