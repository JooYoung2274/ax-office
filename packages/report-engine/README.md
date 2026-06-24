# @axaxax/report-engine

Finance AX MVP의 **AI ReportEngine**. CRO(CalculationResultObject)를 입력으로
구조화된 `ReportContent`(Draft)를 생성하되, **AI가 CRO 밖의 숫자를 절대 만들지 못하도록**
기계적 후처리 가드(환각 차단 게이트)로 강제한다.

> 철학(PRD): **계산 = 결정론 코드(CRO 생성) → 이상·인사이트 = AI 리포트(이 패키지) → 결론 = 사람 승인.**
> AI는 해석만 한다. 모든 수치는 CRO의 `metricId`/`flagId`(evidence_ref)로만 인용된다.

## 공개 API

NestJS `api` 패키지가 의존하는 표면(정확히 이 시그니처):

```ts
import { Cro, ReportContent, GuardResult } from '@axaxax/shared';

export interface LlmGenerateParams { system: string; cachePrefix?: string; user: string; }
export interface LlmGenerateResult {
  text: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
}
export interface LlmClient { generate(params: LlmGenerateParams): Promise<LlmGenerateResult>; }

// 순수 함수. evidence_ref ⊆ CRO ids / 숫자 그라운딩 / finding당 근거 ≥1 검증.
export function runGuard(cro: Cro, content: ReportContent): GuardResult;

export interface GenerateOutcome {
  content: ReportContent;
  guard: GuardResult;
  regenCount: number;
  status: 'DRAFT' | 'NEEDS_HUMAN';
  usage?: LlmGenerateResult['usage'];
}

export class ReportEngine {
  constructor(llm: LlmClient, opts?: { maxRegen?: number }); // 기본 REPORT_MAX_REGEN env 또는 2
  generate(cro: Cro, kind: 'cash' | 'closing'): Promise<GenerateOutcome>;
}

export class AnthropicLlmClient implements LlmClient {
  constructor(opts?: { apiKey?: string; model?: string });   // ANTHROPIC_API_KEY / ANTHROPIC_MODEL
  generate(p: LlmGenerateParams): Promise<LlmGenerateResult>;
}
```

보조 export: `buildSystemPrompt`, `buildUserMessage`, `buildCorrectiveAppendix`,
`FROZEN_RULES_BLOCK`, `OUTPUT_SCHEMA_DESCRIPTION`, `CASH_DOMAIN_HEADER`,
`CLOSING_DOMAIN_HEADER`, `extractNumbers`, 타입 `GenerateOutcome`/`ReportKind`/`LlmClient`*.

## 환각 차단 가드 (`runGuard`) — 핵심

가드는 **순수 함수**(네트워크·시각·랜덤 참조 없음)라 완전히 단위 테스트된다.
PRD §5.6의 세 검사를 기계적으로 수행한다:

1. **UNKNOWN_EVIDENCE_REF** — 모든 `finding.evidence_refs`가
   `collectEvidenceIds(cro)`(= CRO의 모든 metricId ∪ flagId)에 속하는가.
   근거를 지어내면 여기서 걸린다.
2. **UNGROUNDED_NUMBER** — `summary` + 각 `finding.observation`에서 숫자 토큰을
   추출(`extractNumbers`)해, CRO의 metric/flag 값 집합과 **근사 일치**(상대오차 1%)하는가.
   숫자를 지어내면(예: CRO에 없는 320,000,000원) 차집합으로 잡힌다.
   - 파서는 콤마/통화기호/괄호음수/△▲, 한국어 단위(억·만·천), %·일수를 흡수한다.
   - CRO 값은 원 단위와 억/만 축약 표기(예: 1,850,000,000 ↔ 18.5억)를 함께 등록해 오탐을 줄인다.
3. **MISSING_EVIDENCE** — 각 finding이 evidence_ref를 최소 1개 갖는가
   (스키마가 1차 보장, 가드가 방어적으로 재검사).

`ok = (violations.length === 0)`.

## 재생성 루프 — 제로 환각 강제 (PRD §5.3 / §5.6)

`ReportEngine.generate`의 흐름:

```
[1] 프롬프트 합성: 고정 prefix(system: 규칙+스키마+도메인헤더) + 가변 CRO(user, 정렬 키 JSON)
[2] LlmClient.generate 호출 (네트워크는 여기로 격리)
[3] 파싱: JSON → ReportContentSchema(zod). 스키마 실패도 가드 실패와 동급 → 재생성
[4] runGuard(cro, content) — 기계적 환각 게이트
[5] 실패 + regenCount < maxRegen → 위반 목록을 "교정 지시"로 user 뒤에 덧붙여 재호출
       └ system(캐시 prefix)은 절대 바꾸지 않음 → prompt cache 유지
[6] maxRegen 초과까지 미통과 → status='NEEDS_HUMAN' (마지막 content+guard 동반, 사람 큐)
    통과 → status='DRAFT'
```

- **프롬프트 규칙은 1차 방어, `runGuard`는 강제 게이트.** 통과 못한 리포트는 절대 그대로
  Draft로 나가지 않는다. 재생성 또는 사람 큐로 간다.
- `maxRegen` 기본값: `REPORT_MAX_REGEN` env, 없으면 2. 총 호출 = `maxRegen + 1`회.
- 재생성은 **같은 세션 피드백 재투입** 방식: 직전 위반을 구조화해 다시 던진다.

## 프롬프트 캐시 (PRD §5.5)

- `system` 블록 = **byte-stable 고정 prefix**(공통 규칙 + 출력 스키마 + 도메인 헤더).
  `AnthropicLlmClient`는 이 블록 끝에 `cache_control: { type: 'ephemeral' }`를 건다.
- CRO JSON은 `buildUserMessage`로 **정렬된 키**로 직렬화되어 user 메시지에만 들어간다 →
  prefix를 깨지 않는다(타임스탬프/UUID 금지).
- 재생성 시에도 prefix는 동일하게 유지된다(테스트로 검증).
- `usage.cache_read_input_tokens`로 적중 검증.

## 모델 호출 (`AnthropicLlmClient`)

`@anthropic-ai/sdk`로 직접 호출(claude-api 스킬 기준):

- model `claude-opus-4-8` (env `ANTHROPIC_MODEL`, 기본값 동일)
- `thinking: { type: 'adaptive' }` — 4.8은 adaptive만 허용 (budget_tokens 금지)
- **temperature/top_p/top_k 미사용** (4.8에서 400), **prefill 금지**
- `messages.stream(...).finalMessage()` — 큰 max_tokens에서 HTTP 타임아웃 회피
- **키 부재 처리**: `ANTHROPIC_API_KEY`가 없어도 생성자는 던지지 않는다(앱 부팅 허용).
  실제 `generate()` 호출 시점에만 명확한 에러를 던진다.

### LangChain 시접(seam)

PRD는 "LangChain은 thin, glue only"라고 명시한다. 현재 구현은 모델 호출을 `@anthropic-ai/sdk`로
직접 수행하되, `LlmClient` 인터페이스가 LCEL이 끼어들 자리를 만든다. 향후
`RunnableSequence(loadCRO → buildPrompt → [모델 호출] → verify)`를 도입하면
`AnthropicLlmClient.generate`를 `RunnableLambda`로 감싸 말단 단계에 끼워넣으면 되고,
**엔진/가드 로직은 불변**이다.

## 테스트

```sh
npm run test -w @axaxax/report-engine   # tsc 빌드 후 node --test
```

- `guard.test.ts` — `runGuard`를 **순수 함수**로 손수 만든 CRO + 여러 픽스처
  (정상 / unknown ref / ungrounded number / missing evidence / 억 단위 / % / 다중 위반)로 검증.
  **네트워크를 전혀 타지 않는다.**
- `engine.test.ts` — **FAKE in-memory `LlmClient`**(`ScriptedLlmClient`, 네트워크 없음)로
  (1) 깨끗한 리포트 → `DRAFT`, (2) bad evidence_ref 반복 → maxRegen 초과 후 `NEEDS_HUMAN`,
  그리고 교정 피드백/캐시 prefix 안정성/스키마 실패 재생성/`maxRegen=0`/closing 프롬프트 선택을 검증.

## 빌드 메모

CommonJS 출력(`type:"module"` 없음), tsconfig는 `../../tsconfig.base.json`(NodeNext) 확장.
모든 상대 import는 `.js`로 끝난다. `@axaxax/shared`는 먼저 빌드되어 있어야 한다.
