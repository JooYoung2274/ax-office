/**
 * types.ts — calc-engine 공개 입력 계약 + 내부 컨텍스트 타입.
 *
 * 출력 타입(Cro/Metric/Flag/ValidationReport/Severity)은 @axaxax/shared 단일 출처를 사용한다.
 */
import { Severity } from '@axaxax/shared';

/** 엔진 버전 — CRO에 박제(재현성·감사). */
export const ENGINE_VERSION = 'calc-engine@0.1.0';

/** 원천 1행. data = 정규화된 표준필드키 → 원문 셀 문자열. */
export interface RawRow {
  id: string;
  data: Record<string, string>;
}

/** 원천 데이터셋. kind = 'bank_transactions' | 'trial_balance' 등. */
export interface RawDataset {
  kind: string;
  rows: RawRow[];
}

/** 엔진 입력. caller가 정규화/해시까지 끝낸 스냅샷을 넘긴다. */
export interface CalcEngineInput {
  tenantId: string;
  domain: 'cash' | 'closing' | 'payroll';
  /** 'YYYY-MM' 또는 'YYYY-MM-DD'. */
  period: string;
  /** 소스 스냅샷의 SHA-256(caller 제공). */
  inputsHash: string;
  datasets: RawDataset[];
  /** 임계값 오버라이드(PRD §4.2 TenantConfig.thresholds). */
  thresholds?: Partial<Thresholds>;
  /**
   * CRO.generatedAt에 쓸 ISO 타임스탬프(결정론 재현용). 없으면 호출 시각을 쓴다.
   * 주의: 이 필드만 비결정론을 허용한다 — 모든 "수치" 출력은 결정론적이다.
   */
  generatedAt?: string;
}

/** 임계값(PRD §4.2). 모두 tenant 오버라이드 가능. */
export interface Thresholds {
  /** 유동성 안전선(원). 예측 최저잔액이 이 값 미만이면 경보 Flag. 기본 0. */
  liquiditySafetyBalance: string;
  /** 현금흐름 예측 일수(N). 기본 30. */
  forecastDays: number;
  /** 월대비 증감률 경고 임계(%). 기본 30. */
  momChangePct: number;
  /** z-score 이상치 임계. 기본 3.0. */
  zscoreThreshold: number;
  /** IQR 배수. 기본 1.5. */
  iqrMultiplier: number;
  /** 통계 룰 최소 표본수. 기본 6. */
  minSampleSize: number;
  /** 보조원장 vs GL 차이 허용액(원). 기본 10000. */
  subledgerVsGlTolerance: string;

  // ── 급여·4대보험(payroll) — 근로자 부담 요율(2024 기준, tenant 오버라이드 가능) ──
  /** 국민연금 요율(근로자). 기본 0.045. */
  pensionRate: string;
  /** 국민연금 기준소득월액 상한(원). 기본 6170000. */
  pensionMaxBase: string;
  /** 건강보험 요율(근로자). 기본 0.03545. */
  healthRate: string;
  /** 장기요양 요율(건강보험료 대비). 기본 0.1295. */
  ltcareRate: string;
  /** 고용보험 요율(근로자). 기본 0.009. */
  employmentRate: string;
  /** 식대 비과세 한도(월, 원). 초과분은 과세. 기본 200000. */
  mealTaxFreeLimit: string;
  /** 공제율(공제합/총지급) 경고 임계(%). 기본 35. */
  deductionRatePct: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  liquiditySafetyBalance: '0',
  forecastDays: 30,
  momChangePct: 30,
  zscoreThreshold: 3.0,
  iqrMultiplier: 1.5,
  minSampleSize: 6,
  subledgerVsGlTolerance: '10000',
  pensionRate: '0.045',
  pensionMaxBase: '6170000',
  healthRate: '0.03545',
  ltcareRate: '0.1295',
  employmentRate: '0.009',
  mealTaxFreeLimit: '200000',
  deductionRatePct: 35,
};

/** 데이터셋 kind 상수(오타 방지). */
export const DatasetKind = {
  BANK_ACCOUNT_MASTER: 'bank_account_master',
  BANK_TRANSACTIONS: 'bank_transactions',
  CASHFLOW_SCHEDULE: 'cashflow_schedule',
  TRIAL_BALANCE: 'trial_balance',
  JOURNAL_ENTRY: 'journal_entry',
  SUBLEDGER_AR: 'subledger_ar',
  SUBLEDGER_AP: 'subledger_ap',
  FIXED_ASSET: 'fixed_asset',
  COMPARATIVE_FS: 'comparative_fs',
  PAYROLL_REGISTER: 'payroll_register',
} as const;

/**
 * 계산 컨텍스트 — metric/rule compute에 주입되는 읽기전용 입력.
 * 순수성 보장(PRD §4.4): compute는 ctx만 읽고 부수효과 없음.
 */
export interface CalcContext {
  tenantId: string;
  domain: 'cash' | 'closing' | 'payroll';
  period: string;
  inputsHash: string;
  thresholds: Thresholds;
  /** kind → 해당 데이터셋의 rows. */
  datasets: Map<string, RawRow[]>;
  /** kind로 rows 조회(없으면 빈 배열). */
  rows(kind: string): RawRow[];
}

/** 내부 이슈 표현(shared ValidationIssue로 직렬화된다). */
export interface RuleIssue {
  ruleId: string;
  severity: Severity;
  message: string;
  accountId?: string;
  sourceRowIds?: string[];
}
