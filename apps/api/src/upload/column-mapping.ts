import { DatasetKind } from '@axaxax/calc-engine';

/**
 * 컬럼 매핑 — PRD §3.3 MAP 단계.
 * 한글 헤더(동의어) → 표준 필드키 자동 매핑 제안. 신뢰도 포함.
 * calc-engine의 RawRow.data는 "표준필드키 → 셀값"이므로 이 사전이 정규화의 핵심.
 *
 * ⚠️ 매핑은 반드시 datasetKind로 스코프된다. 동일 헤더('구분')가 데이터셋에 따라
 * 다른 표준필드로 매핑되기 때문(자금스케줄=direction, 은행거래=txnType).
 * 스코프가 없으면 자금 스케줄의 direction이 비어 유동성 예측이 조용히 깨진다.
 */

/** 표준 필드키별 한글 동의어. */
const SYNONYMS: Record<string, string[]> = {
  // 자금일보 — 은행거래내역
  txnDate: ['거래일자', '거래일', '일자'],
  accountAlias: ['계좌별칭', '계좌', '계좌명', '연결계좌'],
  description: ['적요', '메모', '내용'],
  depositAmt: ['입금액', '입금', '수입', '입금금액'],
  withdrawalAmt: ['출금액', '출금', '지급', '인출', '출금금액'],
  balanceAfter: ['거래후잔액', '잔액', '거래후 잔액'],
  counterparty: ['거래처', '상대처'],
  txnType: ['거래구분', '구분'],
  // 은행계좌 마스터
  bankName: ['은행명', '은행'],
  accountNo: ['계좌번호'],
  currency: ['통화'],
  openingBalance: ['기초잔액', '기초 잔액'],
  openingDate: ['기초잔액기준일', '기준일'],
  overdraftLimit: ['한도', '마이너스한도', '당좌한도'],
  purpose: ['계좌용도', '용도'],
  // 예정 입출금
  scheduledDate: ['예정일자', '예정일'],
  direction: ['구분', '수지구분'],
  itemType: ['항목유형', '유형'],
  amount: ['금액'],
  certainty: ['확정도'],
  refNo: ['어음만기/문서번호', '문서번호', '어음만기'],
  // 월결산 — 시산표
  accountCode: ['계정코드', '계정 코드'],
  accountName: ['계정과목', '계정명'],
  debitTotal: ['차변합계', '차변'],
  creditTotal: ['대변합계', '대변'],
  closingBalance: ['기말잔액', '기말 잔액'],
  period: ['회계기간', '기간'],
  // 전표
  voucherNo: ['전표번호'],
  entryDate: ['전표일자', '전표일'],
  lineNo: ['행번호'],
  drcr: ['차대구분'],
  // 급여·4대보험 — 급여대장
  empId: ['사번', '사원번호', '직원번호', '사원코드'],
  name: ['이름', '성명', '직원명'],
  dept: ['부서', '부서명', '소속'],
  baseSalary: ['기본급', '기본급여'],
  taxableAllowance: ['과세수당', '제수당', '직책수당'],
  mealAllowance: ['식대', '식비'],
  incomeTax: ['소득세'],
  localTax: ['지방소득세', '지방세'],
  dependents: ['부양가족수', '부양가족'],
  prevGross: ['전월총지급', '전월급여', '전월지급액'],
};

/**
 * datasetKind별 허용 표준필드 — 매핑 스코프의 핵심.
 * 이 집합 밖의 필드는 매핑 후보로 제안되지 않는다.
 */
const FIELDS_BY_KIND: Record<string, string[]> = {
  [DatasetKind.BANK_TRANSACTIONS]: [
    'txnDate',
    'accountAlias',
    'depositAmt',
    'withdrawalAmt',
    'description',
    'balanceAfter',
    'counterparty',
    'txnType',
  ],
  [DatasetKind.BANK_ACCOUNT_MASTER]: [
    'accountAlias',
    'bankName',
    'accountNo',
    'currency',
    'openingBalance',
    'openingDate',
    'overdraftLimit',
    'purpose',
  ],
  [DatasetKind.CASHFLOW_SCHEDULE]: [
    'scheduledDate',
    'direction',
    'itemType',
    'amount',
    'counterparty',
    'certainty',
    'accountAlias',
    'refNo',
  ],
  [DatasetKind.TRIAL_BALANCE]: [
    'accountCode',
    'accountName',
    'debitTotal',
    'creditTotal',
    'openingBalance',
    'closingBalance',
    'period',
  ],
  [DatasetKind.JOURNAL_ENTRY]: [
    'voucherNo',
    'entryDate',
    'lineNo',
    'drcr',
    'accountCode',
    'accountName',
    'amount',
    'description',
    'counterparty',
  ],
  [DatasetKind.PAYROLL_REGISTER]: [
    'empId',
    'name',
    'dept',
    'baseSalary',
    'taxableAllowance',
    'mealAllowance',
    'incomeTax',
    'localTax',
    'dependents',
    'prevGross',
  ],
};

/** datasetKind에 허용된 (field, synonyms) 쌍만 — 정의 순서 유지(결정론). */
function scopedSynonyms(datasetKind: string): Array<[string, string[]]> {
  const allowed = FIELDS_BY_KIND[datasetKind];
  const entries = Object.entries(SYNONYMS);
  if (!allowed) return entries; // 미지정 kind는 전역(하위호환)
  const allowedSet = new Set(allowed);
  return entries.filter(([field]) => allowedSet.has(field));
}

export interface MappingCandidate {
  sourceColumn: string;
  suggestedField: string | null;
  confidence: number; // 0~1
}

/**
 * 헤더 배열 → 매핑 후보. datasetKind로 스코프된 동의어만 사용.
 * 정확 일치 1.0, 부분 일치 0.7, 미매핑 0.
 */
export function suggestMapping(
  headers: string[],
  datasetKind: string,
): MappingCandidate[] {
  const entries = scopedSynonyms(datasetKind);
  return headers.map((h) => {
    const norm = h.replace(/\s+/g, '');
    for (const [field, syns] of entries) {
      if (syns.some((s) => s.replace(/\s+/g, '') === norm)) {
        return { sourceColumn: h, suggestedField: field, confidence: 1 };
      }
    }
    for (const [field, syns] of entries) {
      if (
        syns.some(
          (s) =>
            norm.includes(s.replace(/\s+/g, '')) ||
            s.replace(/\s+/g, '').includes(norm),
        )
      ) {
        return { sourceColumn: h, suggestedField: field, confidence: 0.7 };
      }
    }
    return { sourceColumn: h, suggestedField: null, confidence: 0 };
  });
}

/**
 * 원본 raw 셀맵(헤더→값)을 매핑(헤더→표준필드)으로 변환.
 * calc-engine RawRow.data 형태(표준필드키 → 값)를 만든다.
 */
export function applyMapping(
  raw: Record<string, string>,
  mapping: Record<string, string>, // sourceHeader → targetField
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = mapping[header];
    if (field) out[field] = value;
  }
  return out;
}
