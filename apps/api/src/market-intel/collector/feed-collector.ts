import type { RawFeedItem } from '../logic';

/**
 * Collector provider — 외부 I/O(뉴스/RSS 수집)만 담당. Service는 이 인터페이스에만 의존.
 * 키/네트워크 없이도 동작해야 하므로 Sample 구현으로 대체 가능.
 */
export interface MonitorTargetInput {
  type: 'competitor' | 'keyword';
  name: string;
  rssUrl?: string | null;
}

export interface FeedCollector {
  collect(targets: MonitorTargetInput[]): Promise<RawFeedItem[]>;
}

export const FEED_COLLECTOR = Symbol('FEED_COLLECTOR');
