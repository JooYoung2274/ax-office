/**
 * ReportEngine — CRO → ReportContent(Draft) 오케스트레이션. PRD §5.3 / §5.6.
 *
 * 파이프라인:
 *  [1] 프롬프트 합성: 고정 prefix(system) + 가변 CRO(user)
 *  [2] LLM 호출(LlmClient — 네트워크는 여기로 격리)
 *  [3] 파싱: JSON → ReportContentSchema(zod)로 검증.
 *      스키마 실패는 가드 실패와 동급으로 취급해 재생성한다(빈/오염 출력 차단).
 *  [4] runGuard: 기계적 환각 차단 게이트
 *  [5] 실패 + regenCount < maxRegen → 위반 목록을 교정 지시로 덧붙여 재호출
 *  [6] maxRegen 초과 → status 'NEEDS_HUMAN' + 마지막 content/guard 반환(사람 큐)
 *
 * 모든 수치 생성 금지·근거 강제는 프롬프트(1차)와 runGuard(강제 게이트, 2차)로 이중 강제.
 */

import { ReportContentSchema } from '@axaxax/shared';
import type { Cro, ReportContent, GuardResult } from '@axaxax/shared';
import type { LlmClient, LlmGenerateResult } from './llm.js';
import { runGuard } from './guard.js';
import {
  buildSystemPrompt,
  buildUserMessage,
  buildCorrectiveAppendix,
  type ReportKind,
} from './prompts.js';

export interface GenerateOutcome {
  content: ReportContent;
  guard: GuardResult;
  /** 재생성 횟수(0 = 1회 만에 통과). */
  regenCount: number;
  /** DRAFT(가드 통과) | NEEDS_HUMAN(maxRegen 초과까지 미통과 → 사람 검토 큐). */
  status: 'DRAFT' | 'NEEDS_HUMAN';
  usage?: LlmGenerateResult['usage'];
}

/** 스키마 파싱 결과. 실패 시 가드 위반처럼 다뤄 재생성한다. */
interface ParseResult {
  ok: boolean;
  content: ReportContent | null;
  error?: string;
}

function parseReport(text: string): ParseResult {
  // 모델이 코드펜스(```json ... ```)로 감싸는 경우를 관용적으로 흡수.
  const cleaned = stripCodeFence(text);
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch (e) {
    return { ok: false, content: null, error: `JSON 파싱 실패: ${(e as Error).message}` };
  }
  const parsed = ReportContentSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      content: null,
      error: `스키마 검증 실패: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    };
  }
  return { ok: true, content: parsed.data };
}

function stripCodeFence(text: string): string {
  const t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence && fence[1] != null) return fence[1].trim();
  return t;
}

function defaultMaxRegen(): number {
  const raw = process.env.REPORT_MAX_REGEN;
  if (raw != null && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return 2;
}

export class ReportEngine {
  private readonly llm: LlmClient;
  private readonly maxRegen: number;

  constructor(llm: LlmClient, opts?: { maxRegen?: number }) {
    this.llm = llm;
    this.maxRegen = opts?.maxRegen ?? defaultMaxRegen();
  }

  /**
   * CRO로부터 Draft 리포트를 생성한다.
   * 주의: validationSummary.blockedAI(FATAL) 게이트는 상위 오케스트레이터(api)가
   * AI 호출 자체를 차단하는 책임이라(§5.3 [1]), 여기서는 호출이 들어온 CRO를 처리한다.
   */
  async generate(cro: Cro, kind: ReportKind): Promise<GenerateOutcome> {
    const system = buildSystemPrompt(kind);
    const baseUser = buildUserMessage(cro);

    let regenCount = 0;
    let lastContent: ReportContent | null = null;
    let lastGuard: GuardResult = {
      ok: false,
      violations: [{ kind: 'MISSING_EVIDENCE', detail: '아직 유효한 리포트가 생성되지 않았다.' }],
    };
    let lastUsage: LlmGenerateResult['usage'] | undefined;

    // 최초 1회 + 최대 maxRegen회 재생성 = 총 (maxRegen + 1)회 호출.
    for (let attempt = 0; attempt <= this.maxRegen; attempt++) {
      regenCount = attempt;

      // 재생성 시: prefix(system)는 절대 변경하지 않고, user 뒤에 교정 지시만 덧붙인다
      // (캐시 prefix 유지 + 동일 세션 피드백 재투입, §5.6 [5]).
      const user =
        attempt === 0
          ? baseUser
          : baseUser + buildCorrectiveAppendix(lastGuard.violations, lastContent);

      const result = await this.llm.generate({ system, cachePrefix: system, user });
      lastUsage = result.usage;

      const parse = parseReport(result.text);
      if (!parse.ok || parse.content == null) {
        // 스키마 실패 → 가드 실패와 동급. 위반으로 환산해 재생성 트리거.
        lastContent = null;
        lastGuard = {
          ok: false,
          violations: [
            {
              kind: 'MISSING_EVIDENCE',
              detail: `출력이 ReportContent 스키마를 만족하지 못했다. ${parse.error ?? ''}`.trim(),
            },
          ],
        };
        continue;
      }

      lastContent = parse.content;
      lastGuard = runGuard(cro, parse.content);
      if (lastGuard.ok) {
        return {
          content: parse.content,
          guard: lastGuard,
          regenCount: attempt,
          status: 'DRAFT',
          usage: lastUsage,
        };
      }
      // 가드 실패 → 다음 시도에서 교정 지시와 함께 재생성.
    }

    // maxRegen까지 통과 실패 → 사람 검토 큐. 마지막 content가 없으면 안전한 빈 셸 반환.
    const content: ReportContent =
      lastContent ?? {
        summary: '자동 검증을 통과한 리포트를 생성하지 못했습니다. 사람 검토가 필요합니다.',
        findings: [],
        recommendations: [],
        confidence: 0,
        dataCaveats: ['AI 자동 생성이 환각 차단 게이트를 통과하지 못해 사람 검토 큐로 이관되었습니다.'],
      };

    return {
      content,
      guard: lastGuard,
      regenCount,
      status: 'NEEDS_HUMAN',
      usage: lastUsage,
    };
  }
}
