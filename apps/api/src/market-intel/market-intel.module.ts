import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketIntelController } from './market-intel.controller';
import { MarketIntelService } from './market-intel.service';
import { MarketIntelCron } from './market-intel.cron';
import { FEED_COLLECTOR } from './collector/feed-collector';
import { SampleFeedCollector } from './collector/sample-feed.collector';
import { RssFeedCollector } from './collector/rss-feed.collector';
import { BRIEFING_LLM } from './llm/briefing-llm.service';
import { MockBriefingLlmService } from './llm/mock-briefing-llm.service';
import { AnthropicBriefingLlmService } from './llm/anthropic-briefing-llm.service';

/**
 * MarketIntelModule(사업기획). 환경변수로 수집기·LLM 구현 토글:
 *  - MARKET_INTEL_SOURCE=rss → RssFeedCollector, 그 외 SampleFeedCollector(기본·오프라인).
 *  - ANTHROPIC_API_KEY 있고 MARKET_INTEL_LLM!=mock → Anthropic, 아니면 Mock(키 없이 동작).
 */
@Module({
  controllers: [MarketIntelController],
  providers: [
    MarketIntelService,
    MarketIntelCron,
    {
      provide: FEED_COLLECTOR,
      useFactory: (cfg: ConfigService) =>
        cfg.get<string>('MARKET_INTEL_SOURCE') === 'rss' ? new RssFeedCollector() : new SampleFeedCollector(),
      inject: [ConfigService],
    },
    {
      provide: BRIEFING_LLM,
      useFactory: (cfg: ConfigService) => {
        const hasKey = !!cfg.get<string>('ANTHROPIC_API_KEY');
        const forceMock = cfg.get<string>('MARKET_INTEL_LLM') === 'mock';
        return hasKey && !forceMock ? new AnthropicBriefingLlmService() : new MockBriefingLlmService();
      },
      inject: [ConfigService],
    },
  ],
})
export class MarketIntelModule {}
