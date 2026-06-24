/**
 * LLM 클라이언트 추상화 — PRD §5.3.
 *
 * ReportEngine은 이 좁은 인터페이스에만 의존한다. 덕분에:
 *  - 테스트에서 네트워크 없이 fake 클라이언트를 주입할 수 있고,
 *  - 모델 호출 방식(Anthropic SDK 직접 / 향후 LangChain LCEL)을 교체해도
 *    엔진 로직(프롬프트 합성·환각 가드·재생성 루프)은 그대로 둘 수 있다.
 *
 * cachePrefix는 "byte-stable한 고정 prefix"를 가리킨다(시스템 규칙 + 출력 스키마).
 * Anthropic 클라이언트는 이 블록 끝에 cache_control: {type:"ephemeral"}를 건다.
 */

export interface LlmGenerateParams {
  /** byte-stable 고정 prefix(시스템 규칙 + 출력 스키마 설명). cache_control 대상. */
  system: string;
  /**
   * 캐시 prefix를 명시적으로 분리하고 싶을 때 쓰는 힌트.
   * 생략 시 system 전체를 캐시 가능한 안정 prefix로 본다.
   * (재생성 시에도 prefix는 절대 바뀌지 않아야 캐시가 깨지지 않는다.)
   */
  cachePrefix?: string;
  /** 가변 part: CRO JSON(정렬된 키) + (재생성 시) 교정 지시. user 메시지로 들어간다. */
  user: string;
}

export interface LlmGenerateResult {
  /** 모델이 생성한 텍스트(구조화 출력 JSON 문자열). */
  text: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    /** 프롬프트 캐시 적중 검증용(§5.5). */
    cache_read_input_tokens?: number;
  };
}

export interface LlmClient {
  generate(params: LlmGenerateParams): Promise<LlmGenerateResult>;
}
