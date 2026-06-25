import { z } from 'zod';
import type { BriefingAnalysis, RawFeedItem } from '../logic';

/**
 * LLM 추상화(LlmService) — 항목별 한국어 요약·분류·시사점 산출.
 * Service는 이 인터페이스에만 의존 → 실제(Anthropic)/Mock 교체 가능, 키 없이도 동작.
 * (필요 시 LangChain 구현으로 교체해도 인터페이스는 그대로.)
 */
export interface BriefingInput extends RawFeedItem {
  matchedTargets: string[];
}

export interface BriefingLlmService {
  analyze(item: BriefingInput): Promise<BriefingAnalysis>;
}

export const BRIEFING_LLM = Symbol('BRIEFING_LLM');

/** 구조화 출력 스키마(withStructuredOutput 상당 — zod로 검증). */
export const BriefingAnalysisSchema = z.object({
  category: z.enum(['product_launch', 'investment_ma', 'partnership', 'pricing', 'regulation', 'tech', 'other']),
  summary: z.string().min(1),
  implication: z.string().min(1),
});

/** byte-stable 시스템 프롬프트(캐시 prefix). 두비덥 관점 고정. */
export const BRIEFING_SYSTEM = `당신은 음성 IP 유통 기업 '두비덥'의 사업기획 애널리스트입니다.
두비덥은 보이스뱅크·덥라이트·보이스툰·오디오북 사업을 하며 매출의 60%가 공공도서관에서 발생합니다.
주어진 뉴스 1건을 분석해 아래 JSON 스키마로만 답하세요(코드블록·설명 없이 JSON 객체 하나).

스키마:
{
  "category": "product_launch | investment_ma | partnership | pricing | regulation | tech | other 중 하나",
  "summary": "한국어 3~4줄 핵심 요약(사실 위주, 과장 금지)",
  "implication": "두비덥 관점의 시사점 1줄(기회/위협/대응 관점)"
}

카테고리 기준: 제품·서비스 출시=product_launch, 투자유치·인수합병=investment_ma, 제휴·협업=partnership,
가격·요금제=pricing, 규제·법률·저작권=regulation, 기술·연구=tech, 그 외=other.`;

/** 항목 → user 메시지(JSON). */
export function buildBriefingUser(item: BriefingInput): string {
  return JSON.stringify(
    {
      title: item.title,
      source: item.source ?? null,
      publishedAt: item.publishedAt ?? null,
      body: item.summaryRaw ?? '',
      matchedTargets: item.matchedTargets,
    },
    null,
    0,
  );
}
