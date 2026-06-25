import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { FEED_COLLECTOR, type FeedCollector } from './collector/feed-collector';
import { BRIEFING_LLM, type BriefingLlmService } from './llm/briefing-llm.service';
import {
  briefingHtml,
  briefingMarkdown,
  matchTargets,
  selectNewItems,
  type BriefCategory,
  type BriefingItemView,
  type BriefingView,
} from './logic';

/**
 * MarketIntelService — 시장·경쟁 인텔리전스 오케스트레이션.
 * 수집(Collector) → 새 항목 식별(순수 logic) → LLM 분석 → 브리핑 영속화.
 * 외부 I/O는 모두 인터페이스(collector/llm) 뒤에 있어 테스트에서 교체 가능.
 */
@Injectable()
export class MarketIntelService {
  private readonly log = new Logger(MarketIntelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    @Inject(FEED_COLLECTOR) private readonly collector: FeedCollector,
    @Inject(BRIEFING_LLM) private readonly llm: BriefingLlmService,
  ) {}

  /** 모니터링 1회 실행 → 새 항목만 분석한 브리핑 생성. */
  async run(trigger: 'manual' | 'cron' = 'manual') {
    const tenantId = this.tenant.tenantId;
    const targets = await this.prisma.monitorTarget.findMany({ where: { tenantId, active: true } });
    const targetNames = targets.map((t) => t.name);

    // 1) 수집(외부 I/O).
    const raw = await this.collector.collect(
      targets.map((t) => ({ type: t.type, name: t.name, rssUrl: t.rssUrl })),
    );

    // 2) 이전 실행 대비 '새 항목'만(순수 로직).
    const existing = await this.prisma.feedItem.findMany({ where: { tenantId }, select: { dedupHash: true } });
    const fresh = selectNewItems(raw, new Set(existing.map((e) => e.dedupHash)));

    const now = new Date();
    const periodFrom = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const briefing = await this.prisma.briefing.create({
      data: { tenantId, periodFrom, periodTo: now, status: 'generating', trigger, itemCount: 0 },
    });

    // 3) 새 항목별 영속화 + LLM 분석.
    let order = 0;
    for (const it of fresh) {
      const matched = matchTargets(it, targetNames);
      const feed = await this.prisma.feedItem.create({
        data: {
          tenantId,
          dedupHash: it.dedupHash,
          title: it.title,
          url: it.url,
          source: it.source ?? null,
          publishedAt: it.publishedAt ? new Date(it.publishedAt) : null,
          summaryRaw: it.summaryRaw ?? null,
          matchedTargets: matched,
        },
      });
      const analysis = await this.llm.analyze({ ...it, matchedTargets: matched });
      await this.prisma.briefingItem.create({
        data: {
          briefingId: briefing.id,
          feedItemId: feed.id,
          category: analysis.category,
          summary: analysis.summary,
          implication: analysis.implication,
          matchedTargets: matched,
          order: order++,
        },
      });
    }

    await this.prisma.briefing.update({
      where: { id: briefing.id },
      data: { itemCount: fresh.length, status: fresh.length ? 'done' : 'empty' },
    });
    this.log.log(`브리핑 ${briefing.id} 생성 — 수집 ${raw.length} / 신규 ${fresh.length} (${trigger})`);
    return this.detail(briefing.id);
  }

  /** 브리핑 목록(최신순, 메타만). */
  async list() {
    const tenantId = this.tenant.tenantId;
    const rows = await this.prisma.briefing.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      briefings: rows.map((b) => ({
        id: b.id,
        periodFrom: ymd(b.periodFrom),
        periodTo: ymd(b.periodTo),
        itemCount: b.itemCount,
        status: b.status,
        trigger: b.trigger,
        createdAt: b.createdAt.toISOString(),
      })),
    };
  }

  /** 최신 브리핑 상세. */
  async latest() {
    const tenantId = this.tenant.tenantId;
    const b = await this.prisma.briefing.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    if (!b) return null;
    return this.detail(b.id);
  }

  /** 브리핑 상세(항목 포함). */
  async detail(id: string) {
    const tenantId = this.tenant.tenantId;
    const b = await this.prisma.briefing.findFirst({
      where: { id, tenantId },
      include: { items: { orderBy: { order: 'asc' }, include: { feedItem: true } } },
    });
    if (!b) throw new NotFoundException('브리핑을 찾을 수 없습니다');
    return {
      id: b.id,
      periodFrom: ymd(b.periodFrom),
      periodTo: ymd(b.periodTo),
      itemCount: b.itemCount,
      status: b.status,
      trigger: b.trigger,
      createdAt: b.createdAt.toISOString(),
      items: b.items.map((it) => ({
        id: it.id,
        title: it.feedItem.title,
        url: it.feedItem.url,
        source: it.feedItem.source ?? undefined,
        publishedAt: it.feedItem.publishedAt?.toISOString(),
        category: it.category as BriefCategory,
        summary: it.summary,
        implication: it.implication,
        matchedTargets: it.matchedTargets,
      })),
    };
  }

  /** 브리핑을 Markdown/HTML 문자열로 익스포트. */
  async export(id: string, format: 'md' | 'html') {
    const d = await this.detail(id);
    const view: BriefingView = {
      periodFrom: d.periodFrom,
      periodTo: d.periodTo,
      items: d.items.map(
        (i): BriefingItemView => ({
          title: i.title,
          url: i.url,
          source: i.source,
          category: i.category,
          summary: i.summary,
          implication: i.implication,
          matchedTargets: i.matchedTargets,
        }),
      ),
    };
    if (format === 'html') {
      return { content: briefingHtml(view), mime: 'text/html; charset=utf-8', filename: `briefing-${id}.html` };
    }
    return { content: briefingMarkdown(view), mime: 'text/markdown; charset=utf-8', filename: `briefing-${id}.md` };
  }
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
