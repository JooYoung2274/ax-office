/**
 * 기본 Anthropic 백엔드 LLM 클라이언트 — PRD §5.3 / §5.5.
 *
 * 모델 호출만 @anthropic-ai/sdk로 직접 수행한다(구조화 출력·prompt caching·
 * adaptive thinking을 정확히 제어하기 위해). 호출 규약(claude-api 스킬 기준):
 *  - model: "claude-opus-4-8" (env ANTHROPIC_MODEL, 기본값 동일)
 *  - thinking: { type: "adaptive" }            // 4.8은 adaptive만 허용
 *  - NO temperature/top_p/top_k                // 4.8에서 400
 *  - NO prefill (마지막 assistant 메시지 금지)  // 4.8에서 400
 *  - system 블록 끝에 cache_control: {type:"ephemeral"} → 안정 prefix 캐시
 *  - max_tokens 큼 → 스트리밍 후 finalMessage()로 완성본 수신(HTTP 타임아웃 회피)
 *
 * 키 부재 처리: ANTHROPIC_API_KEY가 없어도 생성자에서는 던지지 않는다.
 * 앱이 키 없이도 부팅되도록, 실제 generate() 호출 시점에만 명확히 에러를 던진다.
 *
 * [LangChain 시접(seam)] PRD는 "LangChain은 thin, glue only"라고 명시한다.
 * 본 클라이언트는 LCEL 체인의 말단 "모델 호출" 단계에 해당한다. 향후 LCEL을
 * 도입하면 RunnableSequence(loadCRO → buildPrompt → [이 호출] → verify)에서
 * 이 generate()를 RunnableLambda로 감싸 끼워넣으면 된다. 엔진/가드 로직은 불변.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LlmClient, LlmGenerateParams, LlmGenerateResult } from './llm.js';

const DEFAULT_MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 16000;

export class AnthropicLlmClient implements LlmClient {
  private readonly apiKey?: string;
  private readonly model: string;
  private client: Anthropic | null = null;

  constructor(opts?: { apiKey?: string; model?: string }) {
    // 생성 시점에는 환경변수만 읽어두고 검증은 미룬다(키 없이 부팅 허용).
    this.apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.model = opts?.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  /** 키가 있을 때만 실제 SDK 클라이언트를 lazy 초기화. */
  private getClient(): Anthropic {
    if (!this.apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY가 설정되지 않았습니다. ReportEngine의 AI 호출에는 API 키가 필요합니다. ' +
          '(키 없이도 앱은 부팅되지만 리포트 생성 시점에는 키가 있어야 합니다.)',
      );
    }
    if (!this.client) {
      this.client = new Anthropic({ apiKey: this.apiKey });
    }
    return this.client;
  }

  async generate(params: LlmGenerateParams): Promise<LlmGenerateResult> {
    const client = this.getClient();

    // 안정 prefix(시스템 규칙 + 스키마)에 cache_control을 건다.
    // system을 단일 text 블록으로 두고 그 끝에 breakpoint → tools 없음이므로
    // 렌더 순서상 system 전체가 캐시 prefix가 된다(§5.5).
    const stream = client.messages.stream({
      model: this.model,
      max_tokens: MAX_TOKENS,
      // adaptive thinking. budget_tokens / temperature / top_p 사용 금지(4.8에서 400).
      thinking: { type: 'adaptive' },
      system: [
        {
          type: 'text',
          text: params.system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: params.user,
        },
      ],
    });

    const message = await stream.finalMessage();

    // 텍스트 블록만 이어붙여 구조화 출력(JSON 문자열)을 복원.
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return {
      text,
      usage: {
        input_tokens: message.usage?.input_tokens,
        output_tokens: message.usage?.output_tokens,
        cache_read_input_tokens: message.usage?.cache_read_input_tokens ?? undefined,
      },
    };
  }
}
