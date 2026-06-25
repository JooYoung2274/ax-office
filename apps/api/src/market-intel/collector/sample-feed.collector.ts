import { Injectable } from '@nestjs/common';
import type { RawFeedItem } from '../logic';
import type { FeedCollector, MonitorTargetInput } from './feed-collector';

/**
 * 데모/오프라인용 수집기 — 네트워크·API 키 없이 동작.
 * 음성 IP/오디오북/웹툰 시장 샘플 피드를 반환하고, 활성 대상과 매칭되는 항목만 통과시킨다.
 */
@Injectable()
export class SampleFeedCollector implements FeedCollector {
  private readonly samples: RawFeedItem[] = [
    {
      title: '수퍼톤, 실시간 음성 변환 신모델 공개… 게임·더빙 시장 정조준',
      url: 'https://example.com/news/supertone-realtime-voice',
      source: '테크뉴스',
      publishedAt: '2026-06-22T09:00:00+09:00',
      summaryRaw: '수퍼톤이 지연을 크게 줄인 실시간 음성 변환 모델을 출시했다고 발표했다. 게임 보이스와 영상 더빙 적용을 우선 타깃으로 한다.',
    },
    {
      title: '일레븐랩스, 시리즈C 8천만 달러 유치… 오디오북 자동 내레이션 확대',
      url: 'https://example.com/news/elevenlabs-seriesc',
      source: '글로벌비즈',
      publishedAt: '2026-06-21T14:30:00+09:00',
      summaryRaw: 'ElevenLabs가 8천만 달러 규모의 투자를 유치했다. 오디오북 자동 내레이션과 다국어 더빙 라인업을 강화한다는 계획이다.',
    },
    {
      title: '타입캐스트, 네이버웹툰과 보이스툰 제작 제휴 체결',
      url: 'https://example.com/news/typecast-naver-voicetoon',
      source: '콘텐츠일보',
      publishedAt: '2026-06-20T11:00:00+09:00',
      summaryRaw: '타입캐스트가 네이버웹툰과 손잡고 인기 웹툰을 음성 더빙한 보이스툰을 공동 제작하기로 했다.',
    },
    {
      title: '문체부, AI 음성 복제·딥페이크 음성 저작권 가이드라인 입법예고',
      url: 'https://example.com/news/voice-copyright-guideline',
      source: '정책브리핑',
      publishedAt: '2026-06-19T16:00:00+09:00',
      summaryRaw: '문화체육관광부가 AI 음성 복제와 딥페이크 음성에 대한 권리 처리 가이드라인을 입법예고했다. 성우 목소리 무단 학습 규제가 핵심이다.',
    },
    {
      title: '밀리의서재, 구독 요금제 개편… AI 오디오북 무제한 요금 신설',
      url: 'https://example.com/news/millie-pricing',
      source: '출판저널',
      publishedAt: '2026-06-18T10:00:00+09:00',
      summaryRaw: '밀리의서재가 구독 요금제를 개편하며 AI가 읽어주는 오디오북을 무제한 제공하는 상위 요금제를 신설했다.',
    },
    {
      title: '리디, 자체 AI 더빙 엔진으로 웹소설 오디오화 본격화',
      url: 'https://example.com/news/ridi-ai-dubbing',
      source: 'IT조선',
      publishedAt: '2026-06-17T13:20:00+09:00',
      summaryRaw: '리디가 자체 AI 더빙 엔진을 도입해 인기 웹소설을 오디오 콘텐츠로 전환하는 작업을 본격화한다.',
    },
    {
      title: '한 시중은행, 분기 실적 발표… (시장과 무관한 기사)',
      url: 'https://example.com/news/unrelated-bank',
      source: '경제신문',
      publishedAt: '2026-06-16T08:00:00+09:00',
      summaryRaw: '한 시중은행이 분기 실적을 발표했다. 음성 AI 시장과는 무관한 일반 기사.',
    },
  ];

  async collect(targets: MonitorTargetInput[]): Promise<RawFeedItem[]> {
    const names = targets.map((t) => t.name.toLowerCase()).filter(Boolean);
    if (names.length === 0) return this.samples;
    // 활성 대상(경쟁사/키워드)이 제목·본문에 언급된 항목만 통과.
    return this.samples.filter((s) => {
      const hay = `${s.title} ${s.summaryRaw ?? ''}`.toLowerCase();
      return names.some((n) => hay.includes(n));
    });
  }
}
