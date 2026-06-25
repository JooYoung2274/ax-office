import { createHash } from 'node:crypto';

/**
 * market-intel/logic.ts — 시장·경쟁 인텔리전스의 '순수' 도메인 로직.
 * 외부 의존성(DB·HTTP·LLM) 없이 결정적으로 동작 → 단위 테스트 대상.
 */

/** 수집기가 반환하는 정규화 전 피드 항목. */
export interface RawFeedItem {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string; // ISO
  summaryRaw?: string;
}

export type BriefCategory =
  | 'product_launch'
  | 'investment_ma'
  | 'partnership'
  | 'pricing'
  | 'regulation'
  | 'tech'
  | 'other';

/** 카테고리 한국어 라벨. */
export const CATEGORY_LABEL: Record<BriefCategory, string> = {
  product_launch: '제품출시',
  investment_ma: '투자·M&A',
  partnership: '제휴',
  pricing: '가격',
  regulation: '규제·법률',
  tech: '기술',
  other: '기타',
};

/** LLM이 항목별로 산출하는 분석. */
export interface BriefingAnalysis {
  category: BriefCategory;
  summary: string; // 한국어 3~4줄
  implication: string; // 두비덥 관점 시사점 1줄
}

/** URL 정규화(쿼리·해시·트레일링 슬래시 제거, 소문자). */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    let s = `${u.protocol}//${u.host}${u.pathname}`.toLowerCase();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return (url || '').trim().toLowerCase();
  }
}

/** 중복/새 항목 판별 키 — 정규화 URL + 제목. */
export function dedupHash(item: { url: string; title: string }): string {
  const key = `${normalizeUrl(item.url)}|${(item.title || '').trim().toLowerCase()}`;
  return createHash('sha256').update(key).digest('hex');
}

/**
 * 이전 실행 대비 '새 항목'만 식별. 배치 내 중복도 제거(같은 해시 첫 항목만).
 * @param items 이번 수집 결과
 * @param existingHashes DB에 이미 있는 dedupHash 집합
 */
export function selectNewItems(
  items: RawFeedItem[],
  existingHashes: Set<string>,
): Array<RawFeedItem & { dedupHash: string }> {
  const seen = new Set<string>(existingHashes);
  const out: Array<RawFeedItem & { dedupHash: string }> = [];
  for (const it of items) {
    if (!it.url || !it.title) continue;
    const h = dedupHash(it);
    if (seen.has(h)) continue; // 이전 실행 or 배치 내 중복
    seen.add(h);
    out.push({ ...it, dedupHash: h });
  }
  return out;
}

/** 항목과 매칭되는 모니터링 대상(경쟁사·키워드) 이름 추출. */
export function matchTargets(item: RawFeedItem, targetNames: string[]): string[] {
  const hay = `${item.title} ${item.summaryRaw ?? ''}`.toLowerCase();
  return targetNames.filter((n) => n && hay.includes(n.toLowerCase()));
}

// ── 브리핑 익스포트(Markdown / HTML) ──────────────────────────

export interface BriefingItemView {
  title: string;
  url: string;
  source?: string;
  category: BriefCategory;
  summary: string;
  implication: string;
  matchedTargets: string[];
}

export interface BriefingView {
  periodFrom: string; // YYYY-MM-DD
  periodTo: string;
  items: BriefingItemView[];
}

/** 사람이 읽을 한국어 Markdown 브리핑. */
export function briefingMarkdown(b: BriefingView): string {
  const lines: string[] = [];
  lines.push(`# 시장·경쟁 인텔리전스 브리핑`);
  lines.push(`기간: ${b.periodFrom} ~ ${b.periodTo} · 신규 ${b.items.length}건`);
  lines.push('');
  if (b.items.length === 0) {
    lines.push('_이번 기간 새 소식이 없습니다._');
    return lines.join('\n');
  }
  // 카테고리별 그룹.
  const order: BriefCategory[] = [
    'product_launch',
    'investment_ma',
    'partnership',
    'pricing',
    'regulation',
    'tech',
    'other',
  ];
  for (const cat of order) {
    const items = b.items.filter((i) => i.category === cat);
    if (items.length === 0) continue;
    lines.push(`## ${CATEGORY_LABEL[cat]} (${items.length})`);
    for (const it of items) {
      const tags = it.matchedTargets.length ? ` _[${it.matchedTargets.join(', ')}]_` : '';
      lines.push(`### ${it.title}${tags}`);
      lines.push(it.summary);
      lines.push(`> 💡 시사점: ${it.implication}`);
      lines.push(`> 출처: ${it.source ?? '-'} · ${it.url}`);
      lines.push('');
    }
  }
  return lines.join('\n').trim();
}

/** 다운로드용 HTML(간단·자체 스타일). */
export function briefingHtml(b: BriefingView): string {
  const esc = (s: string) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const rows = b.items
    .map(
      (it) => `<article style="margin:0 0 18px;padding:14px 16px;border:1px solid #e3e8f0;border-radius:8px">
  <div style="font-size:11px;color:#6d5f93;font-weight:700">${esc(CATEGORY_LABEL[it.category])}${
    it.matchedTargets.length ? ' · ' + esc(it.matchedTargets.join(', ')) : ''
  }</div>
  <h3 style="margin:4px 0 8px;font-size:15px"><a href="${esc(it.url)}" style="color:#1a2233;text-decoration:none">${esc(it.title)}</a></h3>
  <p style="margin:0;color:#4f4763;line-height:1.6;font-size:13px">${esc(it.summary)}</p>
  <p style="margin:8px 0 0;color:#43395f;font-size:12.5px">💡 ${esc(it.implication)}</p>
  <p style="margin:6px 0 0;color:#9aa7bd;font-size:11px">출처: ${esc(it.source ?? '-')}</p>
</article>`,
    )
    .join('\n');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>시장·경쟁 인텔리전스 브리핑</title></head>
<body style="font-family:Pretendard,system-ui,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#1a2233">
<h1 style="font-size:20px">시장·경쟁 인텔리전스 브리핑</h1>
<p style="color:#6a7689">기간: ${esc(b.periodFrom)} ~ ${esc(b.periodTo)} · 신규 ${b.items.length}건</p>
${b.items.length ? rows : '<p style="color:#8b99ad">이번 기간 새 소식이 없습니다.</p>'}
</body></html>`;
}
