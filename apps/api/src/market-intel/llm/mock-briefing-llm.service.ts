import { Injectable } from '@nestjs/common';
import type { BriefCategory, BriefingAnalysis } from '../logic';
import type { BriefingInput, BriefingLlmService } from './briefing-llm.service';

/**
 * Mock LLM — API 키·네트워크 없이 결정적 한국어 브리핑 생성(데모·테스트용).
 * 제목/본문 키워드로 카테고리를 규칙 분류하고, 본문에서 요약·시사점을 조립한다.
 */
@Injectable()
export class MockBriefingLlmService implements BriefingLlmService {
  async analyze(item: BriefingInput): Promise<BriefingAnalysis> {
    const hay = `${item.title} ${item.summaryRaw ?? ''}`;
    const category = classify(hay);
    const body = (item.summaryRaw ?? item.title).trim();
    const target = item.matchedTargets[0];
    const summary =
      `${target ? `${target} 관련 소식입니다. ` : ''}${body}`.slice(0, 220) +
      (body.length > 220 ? '…' : '');
    return { category, summary, implication: implicationFor(category, target) };
  }
}

const RULES: Array<[BriefCategory, RegExp]> = [
  ['investment_ma', /(투자|유치|시리즈|인수|합병|m&a|지분|펀딩)/i],
  ['partnership', /(제휴|협업|협력|파트너|맞손|손잡)/i],
  ['regulation', /(규제|법|저작권|가이드라인|입법|딥페이크|개인정보)/i],
  ['pricing', /(요금|가격|구독|할인|무제한 요금|요금제)/i],
  ['product_launch', /(출시|공개|선보|런칭|신규 서비스|신모델|베타)/i],
  ['tech', /(모델|엔진|기술|연구|알고리즘|합성|클로닝)/i],
];

function classify(text: string): BriefCategory {
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  return 'other';
}

function implicationFor(cat: BriefCategory, target?: string): string {
  const who = target ?? '경쟁사';
  switch (cat) {
    case 'product_launch':
      return `${who}의 신규 출시로 음성 IP 경쟁이 심화 — 두비덥 라인업 차별화 점검 필요.`;
    case 'investment_ma':
      return `${who} 자금력 강화 — 두비덥은 공공도서관 채널 우위를 방어 포인트로 강화 검토.`;
    case 'partnership':
      return `${who} 제휴로 유통망 확대 — 두비덥도 콘텐츠·플랫폼 제휴 기회 탐색 권장.`;
    case 'pricing':
      return `시장 가격 구조 변화 — 두비덥 라이선싱·구독 가격 정책 재점검 필요.`;
    case 'regulation':
      return `음성 저작권·규제 변화 — 두비덥 권리처리 프로세스 선제 대응이 기회가 될 수 있음.`;
    case 'tech':
      return `기술 트렌드 변화 — 두비덥 제작 파이프라인 도입 타당성 검토.`;
    default:
      return `직접 영향은 제한적이나 시장 동향으로 모니터링 지속.`;
  }
}
