import { Injectable, Logger } from '@nestjs/common';
import type { RawFeedItem } from '../logic';
import type { FeedCollector, MonitorTargetInput } from './feed-collector';

/**
 * 실 RSS 수집기 — 외부 네트워크 I/O.
 *  - 경쟁사: rssUrl 지정 시 해당 피드, 없으면 한국어 뉴스 검색 RSS.
 *  - 키워드: 한국어 뉴스 검색 RSS.
 * 의존성 없이 fetch + 경량 파서로 처리(데모는 SampleFeedCollector를 쓰므로 best-effort).
 */
@Injectable()
export class RssFeedCollector implements FeedCollector {
  private readonly log = new Logger(RssFeedCollector.name);

  async collect(targets: MonitorTargetInput[]): Promise<RawFeedItem[]> {
    const urls = targets
      .filter((t) => t.name)
      .map((t) => (t.rssUrl?.trim() ? t.rssUrl.trim() : this.newsSearchUrl(t.name)));
    const unique = Array.from(new Set(urls));
    const results = await Promise.allSettled(unique.map((u) => this.fetchFeed(u)));
    const items: RawFeedItem[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') items.push(...r.value);
      else this.log.warn(`피드 수집 실패: ${String(r.reason)}`);
    }
    return items;
  }

  /** 한국어 뉴스 검색 RSS(Google News). */
  private newsSearchUrl(query: string): string {
    const q = encodeURIComponent(query);
    return `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`;
  }

  private async fetchFeed(url: string): Promise<RawFeedItem[]> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (FinanceAX MarketIntel)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return this.parseRss(await res.text(), url);
    } finally {
      clearTimeout(timer);
    }
  }

  /** 경량 RSS 파서 — <item>의 title/link/pubDate/description 추출. */
  private parseRss(xml: string, source: string): RawFeedItem[] {
    const host = (() => {
      try {
        return new URL(source).host;
      } catch {
        return undefined;
      }
    })();
    const items: RawFeedItem[] = [];
    const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
    for (const b of blocks.slice(0, 30)) {
      const title = this.tag(b, 'title');
      const link = this.tag(b, 'link');
      if (!title || !link) continue;
      items.push({
        title: this.stripHtml(title),
        url: link,
        source: host,
        publishedAt: this.parseDate(this.tag(b, 'pubDate')),
        summaryRaw: this.stripHtml(this.tag(b, 'description')).slice(0, 600),
      });
    }
    return items;
  }

  private tag(block: string, name: string): string {
    const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
    let v = m?.[1] ?? '';
    v = v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    return v.trim();
  }

  private stripHtml(s: string): string {
    return s
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parseDate(s: string): string | undefined {
    if (!s) return undefined;
    const t = Date.parse(s);
    return Number.isNaN(t) ? undefined : new Date(t).toISOString();
  }
}
