/**
 * validation/rules.ts — 실제 검증 규칙(PRD §4.2 룰셋).
 *
 * FATAL: 차대불균형, 필수컬럼 누락, 기간 결번/중복, 음수 비허용 필드, 계정매핑 실패.
 * WARN : 월대비 ±임계 초과, z-score/IQR 이상치, 보조원장 vs GL 차이.
 * INFO : 신규 계정코드 출현.
 */
import { abs, dec, div, gt, sub, sum } from '../decimal.js';
import { dateISO, hasColumn, num, numOr0, str } from '../parse.js';
import { CalcContext, DatasetKind, RawRow, RuleIssue } from '../types.js';
import { ValidationRule } from './engine.js';

// ──────────────────────────────────────────────────────────────────────────
// 통계 헬퍼(z-score / IQR) — 결정론. 표본은 정렬 후 사용.
// ──────────────────────────────────────────────────────────────────────────
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function stddev(xs: number[], mu: number): number {
  const v = xs.reduce((a, b) => a + (b - mu) * (b - mu), 0) / xs.length;
  return Math.sqrt(v);
}
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lo = sorted[base] ?? 0;
  const hi = sorted[base + 1] ?? lo;
  return lo + rest * (hi - lo);
}

// ──────────────────────────────────────────────────────────────────────────
// FATAL 규칙
// ──────────────────────────────────────────────────────────────────────────

/** crit.debitCreditMismatch — 시산표 전체 차변합 ≠ 대변합(정확히 0이어야 함). */
export const debitCreditMismatch: ValidationRule = {
  ruleId: 'crit.debitCreditMismatch',
  severity: 'FATAL',
  domains: ['closing'],
  evaluate(ctx) {
    const rows = ctx.rows(DatasetKind.TRIAL_BALANCE);
    if (rows.length === 0) return [];
    const debit = sum(rows.map((r) => numOr0(r, 'debitTotal')));
    const credit = sum(rows.map((r) => numOr0(r, 'creditTotal')));
    const diff = sub(debit, credit);
    if (diff.isZero()) return [];
    return [
      {
        ruleId: 'crit.debitCreditMismatch',
        severity: 'FATAL',
        message: `시산표 대차 불균형: 차변합계 ${debit.toFixed(0)} ≠ 대변합계 ${credit.toFixed(
          0,
        )} (차이 ${diff.toFixed(0)})`,
        sourceRowIds: rows.map((r) => r.id),
      },
    ];
  },
};

/** crit.missingRequiredColumn — 도메인 필수 컬럼 누락. */
export const missingRequiredColumn: ValidationRule = {
  ruleId: 'crit.missingRequiredColumn',
  severity: 'FATAL',
  evaluate(ctx) {
    const issues: RuleIssue[] = [];
    if (ctx.domain === 'cash') {
      const rows = ctx.rows(DatasetKind.BANK_TRANSACTIONS);
      if (rows.length > 0) {
        const required = ['txnDate', 'accountAlias'];
        for (const col of required) {
          if (!hasColumn(rows, col)) {
            issues.push({
              ruleId: 'crit.missingRequiredColumn',
              severity: 'FATAL',
              message: `자금일보 필수 컬럼 누락: ${col} (은행거래내역)`,
            });
          }
        }
        // 금액 컬럼: 입금/출금 중 적어도 하나는 있어야 함.
        if (!hasColumn(rows, 'depositAmt') && !hasColumn(rows, 'withdrawalAmt')) {
          issues.push({
            ruleId: 'crit.missingRequiredColumn',
            severity: 'FATAL',
            message: '자금일보 필수 컬럼 누락: depositAmt/withdrawalAmt (은행거래내역)',
          });
        }
      }
    } else {
      const rows = ctx.rows(DatasetKind.TRIAL_BALANCE);
      if (rows.length > 0) {
        for (const col of ['accountCode', 'debitTotal', 'creditTotal']) {
          if (!hasColumn(rows, col)) {
            issues.push({
              ruleId: 'crit.missingRequiredColumn',
              severity: 'FATAL',
              message: `월결산 필수 컬럼 누락: ${col} (시산표)`,
            });
          }
        }
      }
    }
    return issues;
  },
};

/**
 * crit.periodGap — 거래일 시퀀스 결번/중복(영업일 기준은 캘린더 미보유로 단순화:
 * 동일 일자 중복은 INFO가 아닌 정보로, 연속일 사이 '주중(월~금)' 결번을 FATAL로 본다).
 * 캘린더 공휴일 데이터가 없으므로 주말은 결번에서 제외한다.
 */
export const periodGap: ValidationRule = {
  ruleId: 'crit.periodGap',
  severity: 'FATAL',
  domains: ['cash'],
  evaluate(ctx) {
    const rows = ctx.rows(DatasetKind.BANK_TRANSACTIONS);
    if (rows.length === 0) return [];
    const dates = new Set<string>();
    for (const r of rows) {
      const d = dateISO(r, 'txnDate');
      if (d) dates.add(d);
    }
    const sorted = [...dates].sort();
    if (sorted.length < 2) return [];
    const issues: RuleIssue[] = [];
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    for (
      let t = Date.parse(`${first}T00:00:00Z`);
      t <= Date.parse(`${last}T00:00:00Z`);
      t += 86_400_000
    ) {
      const d = new Date(t);
      const dow = d.getUTCDay(); // 0=일,6=토
      if (dow === 0 || dow === 6) continue; // 주말 제외
      const iso = d.toISOString().slice(0, 10);
      if (!dates.has(iso)) {
        issues.push({
          ruleId: 'crit.periodGap',
          severity: 'FATAL',
          message: `거래일 연속성 위반(영업일 결번): ${iso} 데이터 누락`,
        });
      }
    }
    return issues;
  },
};

/** crit.negativeOnNonNegativeField — 음수 비허용 필드에 음수. */
export const negativeOnNonNegativeField: ValidationRule = {
  ruleId: 'crit.negativeOnNonNegativeField',
  severity: 'FATAL',
  evaluate(ctx) {
    const issues: RuleIssue[] = [];
    // 자금: 입금/출금액 음수 금지.
    if (ctx.domain === 'cash') {
      for (const r of ctx.rows(DatasetKind.BANK_TRANSACTIONS)) {
        for (const f of ['depositAmt', 'withdrawalAmt']) {
          const v = num(r, f);
          if (v && v.isNegative()) {
            issues.push({
              ruleId: 'crit.negativeOnNonNegativeField',
              severity: 'FATAL',
              message: `음수 비허용 필드 위반: ${f}=${v.toFixed(0)}`,
              sourceRowIds: [r.id],
            });
          }
        }
      }
    } else {
      // 결산: 차변/대변/취득원가/내용연수 음수 금지.
      for (const r of ctx.rows(DatasetKind.TRIAL_BALANCE)) {
        for (const f of ['debitTotal', 'creditTotal']) {
          const v = num(r, f);
          if (v && v.isNegative()) {
            issues.push({
              ruleId: 'crit.negativeOnNonNegativeField',
              severity: 'FATAL',
              message: `음수 비허용 필드 위반: ${f}=${v.toFixed(0)} (계정 ${str(r, 'accountCode')})`,
              accountId: str(r, 'accountCode') || undefined,
              sourceRowIds: [r.id],
            });
          }
        }
      }
      for (const r of ctx.rows(DatasetKind.FIXED_ASSET)) {
        for (const f of ['acquisitionCost', 'usefulLifeMonths']) {
          const v = num(r, f);
          if (v && v.isNegative()) {
            issues.push({
              ruleId: 'crit.negativeOnNonNegativeField',
              severity: 'FATAL',
              message: `음수 비허용 필드 위반: ${f}=${v.toFixed(0)} (자산 ${str(r, 'assetCode')})`,
              sourceRowIds: [r.id],
            });
          }
        }
      }
    }
    return issues;
  },
};

/**
 * crit.accountMappingFailure — 계정코드가 BS/IS 어느 쪽에도 귀속되지 않음.
 * caller가 정규화 시 'statement'(BS/IS) 필드를 채운다는 가정. 빈 값이면 매핑 실패.
 */
export const accountMappingFailure: ValidationRule = {
  ruleId: 'crit.accountMappingFailure',
  severity: 'FATAL',
  domains: ['closing'],
  evaluate(ctx) {
    const rows = ctx.rows(DatasetKind.TRIAL_BALANCE);
    if (rows.length === 0) return [];
    // statement 컬럼 자체가 없으면 매핑 단계 미수행으로 보고 스킵(다른 규칙이 처리).
    if (!hasColumn(rows, 'statement')) return [];
    const issues: RuleIssue[] = [];
    for (const r of rows) {
      const stmt = str(r, 'statement').toUpperCase();
      if (stmt !== 'BS' && stmt !== 'IS') {
        issues.push({
          ruleId: 'crit.accountMappingFailure',
          severity: 'FATAL',
          message: `계정 매핑 실패(BS/IS 미귀속): 계정 ${str(r, 'accountCode')} ${str(
            r,
            'accountName',
          )}`,
          accountId: str(r, 'accountCode') || undefined,
          sourceRowIds: [r.id],
        });
      }
    }
    return issues;
  },
};

// ──────────────────────────────────────────────────────────────────────────
// WARN 규칙
// ──────────────────────────────────────────────────────────────────────────

/**
 * warn.momChange — 계정별 전월대비 증감률이 임계 초과.
 * 시산표 행에 'priorClosingBalance'(전월 기말)가 있으면 당월 기말과 비교.
 */
export const momChange: ValidationRule = {
  ruleId: 'warn.momChange',
  severity: 'WARN',
  domains: ['closing'],
  evaluate(ctx) {
    const rows = ctx.rows(DatasetKind.TRIAL_BALANCE);
    if (!hasColumn(rows, 'priorClosingBalance')) return [];
    const issues: RuleIssue[] = [];
    const thetaPct = dec(ctx.thresholds.momChangePct);
    for (const r of rows) {
      const prior = num(r, 'priorClosingBalance');
      const curr = num(r, 'closingBalance');
      if (!prior || !curr || prior.isZero()) continue;
      const pct = div(sub(curr, prior).abs(), prior.abs());
      if (!pct) continue;
      const pctValue = pct.times(100);
      if (gt(pctValue, thetaPct)) {
        issues.push({
          ruleId: 'warn.momChange',
          severity: 'WARN',
          message: `전월대비 증감률 임계 초과: 계정 ${str(r, 'accountCode')} ${pctValue.toFixed(
            2,
          )}% (임계 ±${thetaPct.toFixed(0)}%)`,
          accountId: str(r, 'accountCode') || undefined,
          sourceRowIds: [r.id],
        });
      }
    }
    return issues;
  },
};

/**
 * warn.zscoreOutlier / warn.iqrOutlier — 시산표 기말잔액 분포 이상치.
 * 표본 n ≥ minSampleSize 일 때만 평가(미달 시 info.insufficientHistory).
 * 한 계정 시계열이 아니라 동일 기간 계정 간 분포로 단순화(시계열 입력은 caller가 별도 제공).
 */
export const distributionOutlier: ValidationRule = {
  ruleId: 'warn.zscoreOutlier',
  severity: 'WARN',
  domains: ['closing'],
  evaluate(ctx) {
    const rows = ctx.rows(DatasetKind.TRIAL_BALANCE).filter((r) => num(r, 'closingBalance') !== null);
    const minN = ctx.thresholds.minSampleSize;
    if (rows.length < minN) {
      if (rows.length > 0) {
        return [
          {
            ruleId: 'info.insufficientHistory',
            severity: 'INFO',
            message: `통계 이상치 평가 표본 부족(n=${rows.length} < ${minN})`,
          },
        ];
      }
      return [];
    }
    const xs = rows.map((r) => num(r, 'closingBalance')!.toNumber());
    const mu = mean(xs);
    const sd = stddev(xs, mu);
    const sorted = [...xs].sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const zTh = ctx.thresholds.zscoreThreshold;
    const k = ctx.thresholds.iqrMultiplier;
    const lo = q1 - k * iqr;
    const hi = q3 + k * iqr;

    const issues: RuleIssue[] = [];
    rows.forEach((r, i) => {
      const x = xs[i]!;
      const z = sd === 0 ? 0 : Math.abs((x - mu) / sd);
      if (z > zTh) {
        issues.push({
          ruleId: 'warn.zscoreOutlier',
          severity: 'WARN',
          message: `z-score 이상치: 계정 ${str(r, 'accountCode')} z=${z.toFixed(2)} (임계 ${zTh})`,
          accountId: str(r, 'accountCode') || undefined,
          sourceRowIds: [r.id],
        });
      } else if (x < lo || x > hi) {
        issues.push({
          ruleId: 'warn.iqrOutlier',
          severity: 'WARN',
          message: `IQR 이상치: 계정 ${str(r, 'accountCode')} 값=${x} (허용 ${lo.toFixed(
            0,
          )}~${hi.toFixed(0)})`,
          accountId: str(r, 'accountCode') || undefined,
          sourceRowIds: [r.id],
        });
      }
    });
    return issues;
  },
};

/**
 * warn.subledgerVsGL — 보조원장 기말잔액 합계 vs GL(시산표) 통제계정 잔액 차이.
 * subledger_ar/ap 합계와 trial_balance의 동일 통제계정(accountName 일치) 잔액 비교.
 */
export const subledgerVsGL: ValidationRule = {
  ruleId: 'warn.subledgerVsGL',
  severity: 'WARN',
  domains: ['closing'],
  evaluate(ctx) {
    const tb = ctx.rows(DatasetKind.TRIAL_BALANCE);
    if (tb.length === 0) return [];
    const tol = dec(ctx.thresholds.subledgerVsGlTolerance);
    const issues: RuleIssue[] = [];

    const check = (kind: string, controlName: string) => {
      const sub = ctx.rows(kind);
      if (sub.length === 0) return;
      const subTotal = sum(sub.map((r) => numOr0(r, 'closingBalance')));
      const ctrl = tb.find((r) => str(r, 'accountName') === controlName);
      if (!ctrl) return;
      const glBal = numOr0(ctrl, 'closingBalance');
      const diff = abs(subTotal.minus(glBal));
      if (gt(diff, tol)) {
        issues.push({
          ruleId: 'warn.subledgerVsGL',
          severity: 'WARN',
          message: `보조원장 vs GL 불일치: ${controlName} 보조원장합 ${subTotal.toFixed(
            0,
          )} / GL잔액 ${glBal.toFixed(0)} (차이 ${diff.toFixed(0)}, 허용 ${tol.toFixed(0)})`,
          accountId: str(ctrl, 'accountCode') || undefined,
          sourceRowIds: [ctrl.id, ...sub.map((r) => r.id)],
        });
      }
    };

    check(DatasetKind.SUBLEDGER_AR, '외상매출금');
    check(DatasetKind.SUBLEDGER_AP, '외상매입금');
    return issues;
  },
};

// ──────────────────────────────────────────────────────────────────────────
// INFO 규칙
// ──────────────────────────────────────────────────────────────────────────

/**
 * info.newAccount — 직전 기간에 없던 신규 계정코드 출현.
 * 시산표 행에 'isNewAccount'='true' 플래그(caller가 12기간 이력 대조 후 표기)를 신뢰.
 */
export const newAccount: ValidationRule = {
  ruleId: 'info.newAccount',
  severity: 'INFO',
  domains: ['closing'],
  evaluate(ctx) {
    const rows = ctx.rows(DatasetKind.TRIAL_BALANCE);
    const issues: RuleIssue[] = [];
    for (const r of rows) {
      if (str(r, 'isNewAccount').toLowerCase() === 'true') {
        issues.push({
          ruleId: 'info.newAccount',
          severity: 'INFO',
          message: `신규 계정코드 출현: ${str(r, 'accountCode')} ${str(r, 'accountName')}`,
          accountId: str(r, 'accountCode') || undefined,
          sourceRowIds: [r.id],
        });
      }
    }
    return issues;
  },
};

/** 자금 도메인 규칙 집합. */
export const CASH_RULES: ValidationRule[] = [
  missingRequiredColumn,
  periodGap,
  negativeOnNonNegativeField,
];

/** 결산 도메인 규칙 집합. */
export const CLOSING_RULES: ValidationRule[] = [
  debitCreditMismatch,
  missingRequiredColumn,
  negativeOnNonNegativeField,
  accountMappingFailure,
  momChange,
  distributionOutlier,
  subledgerVsGL,
  newAccount,
];

/** 전체 규칙(엔진은 도메인 필터로 자동 선별). */
export const ALL_RULES: ValidationRule[] = [
  debitCreditMismatch,
  missingRequiredColumn,
  periodGap,
  negativeOnNonNegativeField,
  accountMappingFailure,
  momChange,
  distributionOutlier,
  subledgerVsGL,
  newAccount,
];

// lint: 미사용 import 방지용 참조(타입 전용 모듈 경계).
export type { CalcContext };
