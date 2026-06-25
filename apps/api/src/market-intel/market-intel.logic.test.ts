/**
 * market-intel 순수 로직 + Mock LLM 단위 테스트(node:test, 외부 I/O 없음).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  briefingMarkdown,
  dedupHash,
  matchTargets,
  selectNewItems,
  type BriefingView,
  type RawFeedItem,
} from './logic';
import { MockBriefingLlmService } from './llm/mock-briefing-llm.service';

test('dedupHash — 쿼리스트링·해시·대소문자 차이를 같은 항목으로', () => {
  const a = dedupHash({ url: 'https://ex.com/news/a?utm=1#x', title: '제목' });
  const b = dedupHash({ url: 'https://EX.com/news/a/', title: '제목' });
  assert.equal(a, b);
  const c = dedupHash({ url: 'https://ex.com/news/b', title: '제목' });
  assert.notEqual(a, c);
});

test('selectNewItems — 이전 실행/배치 내 중복 제거, 새 항목만', () => {
  const items: RawFeedItem[] = [
    { title: 'A', url: 'https://ex.com/a' },
    { title: 'A', url: 'https://ex.com/a?ref=2' }, // 위와 동일(정규화)
    { title: 'B', url: 'https://ex.com/b' },
    { title: '', url: 'https://ex.com/c' }, // 제목 없음 → 스킵
  ];
  const existing = new Set([dedupHash({ title: 'B', url: 'https://ex.com/b' })]);
  const fresh = selectNewItems(items, existing);
  assert.equal(fresh.length, 1, 'A 하나만 신규');
  assert.equal(fresh[0].title, 'A');
});

test('matchTargets — 제목·본문에 언급된 대상만', () => {
  const item: RawFeedItem = { title: '수퍼톤 신모델', url: 'u', summaryRaw: '오디오북 확대' };
  const matched = matchTargets(item, ['수퍼톤', '일레븐랩스', '오디오북']);
  assert.deepEqual(matched.sort(), ['수퍼톤', '오디오북']);
});

test('briefingMarkdown — 카테고리 그룹 + 시사점 포함', () => {
  const view: BriefingView = {
    periodFrom: '2026-06-18',
    periodTo: '2026-06-25',
    items: [
      {
        title: '일레븐랩스 투자',
        url: 'u1',
        category: 'investment_ma',
        summary: '8천만 달러 유치',
        implication: '경쟁 심화',
        matchedTargets: ['일레븐랩스'],
      },
    ],
  };
  const md = briefingMarkdown(view);
  assert.match(md, /투자·M&A/);
  assert.match(md, /시사점: 경쟁 심화/);
  assert.match(md, /일레븐랩스/);
});

test('MockBriefingLlmService — 키워드 규칙 분류(키 없이 동작)', async () => {
  const llm = new MockBriefingLlmService();
  const cases: Array<[string, string]> = [
    ['일레븐랩스 시리즈C 투자 유치', 'investment_ma'],
    ['타입캐스트 네이버와 제휴 체결', 'partnership'],
    ['AI 음성 저작권 가이드라인 입법예고', 'regulation'],
    ['밀리의서재 구독 요금제 개편', 'pricing'],
    ['수퍼톤 신모델 출시', 'product_launch'],
  ];
  for (const [title, expected] of cases) {
    const r = await llm.analyze({ title, url: 'u', summaryRaw: title, matchedTargets: [] });
    assert.equal(r.category, expected, title);
    assert.ok(r.summary.length > 0 && r.implication.length > 0);
  }
});
