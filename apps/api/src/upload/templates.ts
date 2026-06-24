import { DatasetKind } from '@axaxax/calc-engine';

/**
 * 업로드 템플릿 정의 — PRD §3.2. 도메인(cash/closing)별 표준 템플릿 메타.
 * MVP: 핵심 슬라이스 A/B 템플릿. requiredColumns/sampleRows는 프론트 마법사용.
 */
export interface TemplateDef {
  templateKey: string; // Prisma TemplateKey
  datasetKind: string; // calc-engine DatasetKind
  domain: 'cash' | 'closing' | 'payroll';
  label: string;
  requiredColumns: string[];
  optionalColumns: string[];
  sampleRows: Record<string, string>[];
}

export const TEMPLATES: TemplateDef[] = [
  {
    templateKey: 'BANK_TRANSACTION',
    datasetKind: DatasetKind.BANK_TRANSACTIONS,
    domain: 'cash',
    label: '일별 은행거래내역',
    requiredColumns: ['거래일자', '계좌별칭', '입금액', '출금액'],
    optionalColumns: ['적요', '거래후잔액', '거래처', '거래구분'],
    sampleRows: [
      {
        거래일자: '2026-06-01',
        계좌별칭: '운영_국민_주거래',
        입금액: '5000000',
        출금액: '0',
        거래후잔액: '157000000',
        적요: '(주)가나 물품대',
      },
    ],
  },
  {
    templateKey: 'BANK_ACCOUNT_MASTER',
    datasetKind: DatasetKind.BANK_ACCOUNT_MASTER,
    domain: 'cash',
    label: '은행계좌 마스터',
    requiredColumns: ['계좌별칭', '은행명', '계좌번호', '통화', '기초잔액', '기초잔액기준일'],
    optionalColumns: ['계좌용도', '한도'],
    sampleRows: [
      {
        계좌별칭: '운영_국민_주거래',
        은행명: '국민은행',
        계좌번호: '123456-01-789012',
        통화: 'KRW',
        기초잔액: '152000000',
        기초잔액기준일: '2026-06-01',
      },
    ],
  },
  {
    templateKey: 'CASHFLOW_SCHEDULE',
    datasetKind: DatasetKind.CASHFLOW_SCHEDULE,
    domain: 'cash',
    label: '예정 입출금 스케줄',
    requiredColumns: ['예정일자', '구분', '항목유형', '금액'],
    optionalColumns: ['거래처', '확정도', '연결계좌', '어음만기/문서번호'],
    sampleRows: [
      { 예정일자: '2026-07-10', 구분: '수금', 항목유형: '외상매출', 금액: '30000000', 확정도: '예상' },
    ],
  },
  {
    templateKey: 'TRIAL_BALANCE',
    datasetKind: DatasetKind.TRIAL_BALANCE,
    domain: 'closing',
    label: '시산표',
    requiredColumns: ['계정코드', '계정과목', '차변합계', '대변합계', '회계기간'],
    optionalColumns: ['기초잔액', '기말잔액'],
    sampleRows: [
      {
        계정코드: '0108',
        계정과목: '외상매출금',
        차변합계: '80000000',
        대변합계: '50000000',
        회계기간: '2026-05',
      },
    ],
  },
  {
    templateKey: 'JOURNAL_ENTRY',
    datasetKind: DatasetKind.JOURNAL_ENTRY,
    domain: 'closing',
    label: '총계정원장/전표',
    requiredColumns: ['전표번호', '전표일자', '차대구분', '계정코드', '금액'],
    optionalColumns: ['행번호', '계정과목', '적요', '거래처'],
    sampleRows: [
      {
        전표번호: '20260515-0007',
        전표일자: '2026-05-15',
        차대구분: '차변',
        계정코드: '0401',
        금액: '10000000',
        적요: '5월 매출',
      },
    ],
  },
  {
    templateKey: 'PAYROLL_REGISTER',
    datasetKind: DatasetKind.PAYROLL_REGISTER,
    domain: 'payroll',
    label: '직원 급여대장',
    requiredColumns: ['사번', '이름', '기본급'],
    optionalColumns: ['부서', '과세수당', '식대', '소득세', '지방소득세', '부양가족수', '전월총지급'],
    sampleRows: [
      {
        사번: 'E001',
        이름: '김직원',
        부서: '재무팀',
        기본급: '3000000',
        과세수당: '200000',
        식대: '200000',
        소득세: '84850',
        지방소득세: '8480',
      },
    ],
  },
];

export function templatesForDomain(domain?: 'cash' | 'closing' | 'payroll'): TemplateDef[] {
  if (!domain) return TEMPLATES;
  return TEMPLATES.filter((t) => t.domain === domain);
}

export function findTemplate(templateKey: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.templateKey === templateKey);
}
