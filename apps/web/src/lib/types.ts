// 프론트 전용 DTO 타입. 백엔드 PRD §6.2 응답 형태를 미러링한다.
// 가능한 한 @axaxax/shared의 타입을 재사용한다.
import type {
  Role,
  ReportStatus,
  Cro,
  ReportContent,
  Severity,
} from '@axaxax/shared';

export type { Role, ReportStatus, Cro, ReportContent, Severity };

/** 분석 도메인(슬라이스). */
export type Domain = 'cashflow' | 'monthly_close' | 'payroll';

/** 인증 사용자. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

/** 업로드 배치 상태(§6.4). */
export type BatchStatus =
  | 'RECEIVED'
  | 'PARSING'
  | 'PARSED'
  | 'MAPPED'
  | 'CALCULATING'
  | 'CALCULATED'
  | 'BLOCKED'
  | 'COMMITTED'
  | 'FAILED';

export interface TemplateColumn {
  field: string;
  label: string;
  required: boolean;
  example?: string;
}

export interface TemplateInfo {
  templateId: string;
  domain: Domain;
  label: string;
  requiredColumns: TemplateColumn[];
  sampleRows: Record<string, string>[];
}

export interface Batch {
  batchId: string;
  fileName: string;
  templateKey: string;
  domain: Domain;
  period?: string;
  status: BatchStatus;
  progress?: number;
  rowCount?: number;
  detectedSheets?: string[];
  error?: string;
  createdAt: string;
}

export interface MappingCandidate {
  sourceColumn: string;
  suggestedField: string | null;
  confidence: number;
  required: boolean;
}

/** 검증 리포트 응답(§6.2 /validation). */
export interface ValidationFinding {
  ruleId: string;
  severity: Severity;
  rowIndex?: number;
  cellRef?: string;
  field?: string;
  message: string;
  expected?: string;
  actual?: string;
}

export interface ValidationResponse {
  severity: Severity;
  fatalCount: number;
  warnCount: number;
  infoCount: number;
  blockedAI: boolean;
  findings: ValidationFinding[];
}

/** 리포트 DTO(§6.2 /reports/:id). content는 §5.2 스키마. */
export interface ReportDto {
  reportId: string;
  title: string;
  status: ReportStatus;
  domain: Domain;
  period?: string;
  model?: string;
  croId?: string;
  engineVersion?: string;
  /** 원본 데이터 변경으로 재생성이 필요한 상태(§1.1 Stale 게이트). */
  stale?: boolean;
  version?: number;
  bodyMarkdown?: string;
  content?: ReportContent;
  cro?: Cro;
  authorId: string;
  authorName: string;
  createdAt: string;
  approverName?: string;
  approvedAt?: string;
  rejectReason?: string;
  comments?: ReportComment[];
}

export interface ReportComment {
  id: string;
  findingId?: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** 대시보드 요약(§2.3a). */
export interface DashboardSummary {
  queue: {
    uploading: number;
    validationFailed: number;
    draft: number;
    pendingApproval: number;
  };
  liquidityAlerts: LiquidityAlert[];
  recentActivity: AuditEntry[];
}

export interface LiquidityAlert {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail?: string;
  occursOn?: string;
  amount?: string;
  /** 딥링크용 자금일보 기준일. */
  cashDailyDate?: string;
}

/** 자금일보(슬라이스 A) 요약. */
export interface CashDailySummary {
  asOfDate: string;
  kpis: { label: string; value: string; unit?: string }[];
  forecast: { date: string; balance: string; flag?: string }[];
  safetyLine: string;
  alerts: LiquidityAlert[];
  dailyRows: {
    date: string;
    description?: string;
    deposit: string;
    withdrawal: string;
    cumulative: string;
    flag?: string;
  }[];
  /** 자금부족 대응 — 부족분>0일 때만. */
  shortfall?: {
    amount: string;
    afterCredit: string;
    headroom: string;
    date?: string;
    covered: boolean;
  };
  /** 매출채권 회수(AR aging) — 업로드 시에만. */
  ar?: {
    total: string;
    overdueTotal: string;
    concentration: string;
    buckets: { key: string; label: string; amount: string }[];
    byCounterparty: { name: string; amount: string; overdueDays: number; bucket: string }[];
  };
}

/** 급여(슬라이스) 직원별 명세. 4대보험·실수령액은 모두 CRO 코드 계산값. */
export interface PayrollEmployee {
  empId: string;
  name: string;
  dept: string;
  gross: string;
  taxable: string;
  pension: string;
  health: string;
  ltcare: string;
  employment: string;
  insuranceTotal: string;
  incomeTax: string;
  deductionTotal: string;
  netpay: string;
  /** 회사부담 4대보험. */
  employerTotal: string;
  /** 총 인건비 = 총지급 + 회사부담. */
  laborCost: string;
}

/** 급여(슬라이스) 요약. */
export interface PayrollSummary {
  period: string;
  headcount: number;
  grossTotal: string;
  insuranceTotal: string;
  incomeTaxTotal: string;
  deductionTotal: string;
  netpayTotal: string;
  /** 회사부담 4대보험 합계. */
  employerTotal: string;
  /** 총 인건비 합계(총지급 + 회사부담). */
  laborCostTotal: string;
  employees: PayrollEmployee[];
  alerts: { id: string; severity: 'high' | 'medium' | 'low'; title: string; amount?: string }[];
}

/** 사업기획 — 시장·경쟁 인텔리전스 브리핑. */
export type BriefCategory =
  | 'product_launch'
  | 'investment_ma'
  | 'partnership'
  | 'pricing'
  | 'regulation'
  | 'tech'
  | 'other';

export interface BriefingItemDto {
  id: string;
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  category: BriefCategory;
  summary: string;
  implication: string;
  matchedTargets: string[];
}

export interface BriefingDetail {
  id: string;
  periodFrom: string;
  periodTo: string;
  itemCount: number;
  status: string;
  trigger: string;
  createdAt: string;
  items: BriefingItemDto[];
}

export type BriefingListItem = Omit<BriefingDetail, 'items'>;

/** 월결산(슬라이스 B) 요약. */
export interface MonthlyClosingSummary {
  period: string;
  balanced: boolean;
  debitTotal: string;
  creditTotal: string;
  anomalies: {
    type: string;
    journalId: string;
    description: string;
    rule: string;
    severity: Severity;
  }[];
  reconciliations: {
    account: string;
    book: string;
    target: string;
    diff: string;
    matched: boolean;
  }[];
}
