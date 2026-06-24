# @axaxax/calc-engine

Finance AX MVP의 **결정론 계산·검증 엔진**.

> 철학: **단순계산 = 결정론 코드(이 패키지) → 이상징후·인사이트 = AI 리포트(다른 패키지) → 결론 = 사람.**
> 이 엔진의 출력 **CRO(Calculation Result Object)** 는 AI가 인용 가능한 *유일한 숫자의 출처*다.
> 100% 결정론적이고 decimal-safe하다. raw JS float 산술은 어디에서도 쓰지 않는다.

## 공개 API

```ts
import { runCalcEngine, ENGINE_VERSION } from '@axaxax/calc-engine';
import type { CalcEngineInput, RawDataset, RawRow, Cro } from '@axaxax/calc-engine';

const cro: Cro = runCalcEngine(input);
```

- `ENGINE_VERSION` — `"calc-engine@0.1.0"`. CRO에 박제(재현성·감사).
- `runCalcEngine(input: CalcEngineInput): Cro` — 검증을 먼저 실행하고 metric/flag를 조립한다.
  FATAL이 1건이라도 있으면 `cro.validationSummary.blockedAI === true`이며, 이때 상위
  오케스트레이터는 AI 호출을 차단한다. blocked여도 **항상 유효한 CRO**를 반환한다(metric은 부분적일 수 있음).
- `metricId(domain, period, name)` / `flagId(domain, period, name)` — ID 규칙
  `{domain}.{period}.{name}` / `{domain}.{period}.flag.{name}`. evidence_ref 검증·생성에 사용.
- `decimal` — decimal.js 래퍼(add/sub/mul/div/sum/compare/toFixedString 등).
- `runValidation`, `ALL_RULES`, `CASH_RULES`, `CLOSING_RULES` — 검증 엔진/규칙 직접 사용.

### 입력 형태

```ts
interface RawRow { id: string; data: Record<string, string>; } // data = 표준필드키 → 원문 문자열
interface RawDataset { kind: string; rows: RawRow[]; }          // kind는 DatasetKind 상수 사용

interface CalcEngineInput {
  tenantId: string;
  domain: 'cash' | 'closing';
  period: string;            // 'YYYY-MM' 또는 'YYYY-MM-DD'
  inputsHash: string;        // 소스 스냅샷 SHA-256 (caller 제공)
  datasets: RawDataset[];
  thresholds?: Partial<Thresholds>;  // tenant 임계값 오버라이드
  generatedAt?: string;              // 결정론 재현용 타임스탬프(없으면 호출 시각)
}
```

`data`의 키는 PRD §3.2 템플릿의 **표준 필드 키**(`txnDate`, `accountAlias`, `depositAmt`,
`debitTotal`, `creditTotal`, `closingBalance`, `statement` 등)다. caller가 NORMALIZE 단계까지
끝낸 값을 넘기되, 콤마·괄호음수·통화기호 잔여 변형은 엔진의 `parse.ts`가 한 번 더 흡수한다.

## 아키텍처: 두 개의 레지스트리

```
runCalcEngine(input)
  ├─ buildContext           : datasets → kind별 Map (결정론, 입력 순서 보존)
  ├─ runValidation          : ValidationRule[] 순회 → ValidationReport (blockedAI = fatal>0)
  ├─ metric registry        : MetricDef[].compute(ctx) → Metric[]   (도메인별)
  ├─ flag registry          : FlagDef[].compute(ctx, metrics) → Flag[]
  └─ CRO 조립               : engineVersion / validationSummary 박제
```

### 1) Metric 레지스트리 (`registry.ts`, `metrics/*.ts`)

각 metric은 순수함수 `compute(ctx)`를 가진 선언적 정의다.

```ts
interface MetricDef {
  name: string;                          // metricId의 {name} 부분 (예: 'tb.debit_total')
  label: string;                         // 사람이 읽는 라벨
  unit: 'KRW' | 'PERCENT' | 'RATIO' | 'DAYS' | 'COUNT';
  compute(ctx: CalcContext): MetricResult | MetricResult[] | null; // 단일/다중/비계산
}
```

- 단일 수치는 `MetricResult` 하나, 시계열·버킷·자산별 등 다중 수치는 `MetricResult[]`를 반환하고
  각 결과에 `nameOverride`로 고유 슬러그를 준다(예: `forecast.confirmed.2026-07-15`).
- `value`는 항상 **문자열**(decimal-safe). `decimal.ts`의 `moneyString`/`ratioString`으로 직렬화한다.
- 비계산(데이터 없음/분모≤0)은 `null` 또는 빈 배열을 반환한다 — **임의 값을 끼워넣지 않는다**.

구현 범위:
- 자금(슬라이스 A, `metrics/cash.ts`): 은행별/총 잔액, 일일 순수지, 가용자금,
  N일 확정 현금흐름 예측 시계열, 예측 최저잔액.
- 결산(슬라이스 B, `metrics/closing.ts`): 시산표 차/대 합계·차대검증, 정액·정률 감가상각,
  선급비용 안분, 정기 미지급 계상, BS/IS 매핑 합계, 간접법 현금흐름, YoY 증감액·증감률.

### 2) ValidationEngine (`validation/engine.ts`, `validation/rules.ts`)

각 규칙은 순수함수 `evaluate(ctx)`를 가지며 `RuleIssue[]`를 반환한다.

```ts
interface ValidationRule {
  ruleId: string;
  severity: 'FATAL' | 'WARN' | 'INFO';
  domains?: Array<'cash' | 'closing'>;   // 미지정 시 전 도메인
  evaluate(ctx: CalcContext): RuleIssue[];
}
```

집계 결과 `ValidationReport`는 `counts{fatal,warn,info}`와 `blockedAI = (fatal > 0)`을 담는다.

구현된 규칙:
- **FATAL**: `crit.debitCreditMismatch`(시산표 차≠대), `crit.missingRequiredColumn`(필수 컬럼 누락),
  `crit.periodGap`(영업일 결번), `crit.negativeOnNonNegativeField`(음수 비허용 필드),
  `crit.accountMappingFailure`(BS/IS 미귀속).
- **WARN**: `warn.momChange`(전월비 ±θ 초과), `warn.zscoreOutlier`/`warn.iqrOutlier`(이상치),
  `warn.subledgerVsGL`(보조원장 vs GL 차이).
- **INFO**: `info.newAccount`(신규 계정코드), `info.insufficientHistory`(통계 표본 부족).

### 3) Flag — '플래그(코드)' vs '해석(AI)'의 경계

코드는 **사실(value/expected/threshold)** 만 만든다. "왜/권고"는 AI가 CRO를 인용해서 작성한다.
Flag에 `reason`/`recommendation` 자연어 필드는 **없다**(PRD §4.3 경계 규칙).

- 자금: `flag.min_balance_below_threshold` — 예측 최저잔액 < 안전선(`liquiditySafetyBalance`, 기본 0원).
- 결산: `flag.abnormal_account_variance` — YoY 증감률이 임계 초과한 계정.

## metric 추가법

1. `metrics/cash.ts` 또는 `metrics/closing.ts`에 `MetricDef`를 작성한다.

   ```ts
   export const myMetric: MetricDef = {
     name: 'my.metric',
     label: '내 지표',
     unit: 'KRW',
     compute(ctx) {
       const rows = ctx.rows(DatasetKind.TRIAL_BALANCE);
       if (rows.length === 0) return null;            // 데이터 없으면 null
       const v = sum(rows.map((r) => numOr0(r, 'debitTotal')));
       return { value: moneyString(v), unit: 'KRW', formula: 'Σ ...', sourceRowIds: rows.map(r => r.id) };
     },
   };
   ```

2. 도메인 배열(`CASH_METRICS` 또는 `CLOSING_METRICS`)에 push한다. 끝.
   엔진이 `metricId(domain, period, name)`로 ID를 부여하고 CRO.metrics[]에 넣는다.

규칙 추가는 동일하게 `ValidationRule`을 작성해 `ALL_RULES`(+도메인 배열)에 추가한다.
Flag 추가는 `FlagDef`를 작성해 `CASH_FLAGS`/`CLOSING_FLAGS`에 추가한다.

## 결정론·재현성 (PRD §4.4)

- 모든 `compute`/`evaluate`는 부수효과 없는 순수함수. `Date.now()`/`Math.random()`/전역상태 참조 금지.
- 컬렉션은 **명시적 정렬**(alias·date 등) 후 처리해 순서 의존성을 제거한다.
- 모든 금액·비율은 `decimal.ts`(decimal.js, `ROUND_HALF_UP`, 표시 직전에만 반올림)로 연산.
- 유일하게 비결정을 허용하는 출력은 `cro.generatedAt`이다(입력 `generatedAt` 우선). 그 외 모든 수치는
  동일 입력 → 동일 출력을 보장한다.

## 테스트

```bash
npm test   # tsc 컴파일 후 node --test (dist/**/*.test.js)
```

커버리지: 차변=대변 FATAL 게이트, 현금흐름 예측·유동성 경보 Flag, decimal 정확성, 결정론 재현.
```
```
