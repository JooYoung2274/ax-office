import { Injectable, Logger } from '@nestjs/common';
import { AnthropicLlmClient, type LlmClient } from '@axaxax/report-engine';
import type { BriefingAnalysis } from '../logic';
import {
  BRIEFING_SYSTEM,
  BriefingAnalysisSchema,
  buildBriefingUser,
  type BriefingInput,
  type BriefingLlmService,
} from './briefing-llm.service';
import { MockBriefingLlmService } from './mock-briefing-llm.service';

/**
 * 실제 LLM 구현 — 기존 report-engine LlmClient(Anthropic) 재사용.
 * 시스템 프롬프트(고정 prefix, 캐시 대상) + 항목 JSON → zod 구조화 검증.
 * 호출 실패/스키마 불일치 시 Mock으로 폴백(브리핑이 끊기지 않도록).
 */
@Injectable()
export class AnthropicBriefingLlmService implements BriefingLlmService {
  private readonly log = new Logger(AnthropicBriefingLlmService.name);
  private readonly llm: LlmClient;
  private readonly fallback = new MockBriefingLlmService();

  constructor() {
    this.llm = new AnthropicLlmClient();
  }

  async analyze(item: BriefingInput): Promise<BriefingAnalysis> {
    try {
      const res = await this.llm.generate({ system: BRIEFING_SYSTEM, user: buildBriefingUser(item) });
      const parsed = BriefingAnalysisSchema.safeParse(JSON.parse(extractJson(res.text)));
      if (parsed.success) return parsed.data;
      this.log.warn(`구조화 출력 검증 실패 → Mock 폴백: ${parsed.error.message}`);
    } catch (e) {
      this.log.warn(`LLM 호출 실패 → Mock 폴백: ${String(e)}`);
    }
    return this.fallback.analyze(item);
  }
}

/** 모델이 코드블록/잡텍스트를 섞어도 첫 JSON 객체만 추출. */
function extractJson(text: string): string {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  return s >= 0 && e > s ? text.slice(s, e + 1) : text;
}
