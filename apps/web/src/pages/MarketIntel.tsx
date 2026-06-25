import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { downloadBriefing, getBriefing, getBriefings, runMarketIntel } from '../lib/api';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import type { BriefCategory, BriefingItemDto } from '../lib/types';

// 사업기획 — 시장·경쟁 인텔리전스. 경쟁사·키워드를 모니터링해 '새 소식만'
// 한국어 브리핑(요약+분류+시사점)으로 보여준다. 분류·요약은 AI(코드는 수집·중복제거).
const CAT: Record<BriefCategory, { label: string; fg: string; bg: string }> = {
  product_launch: { label: '제품출시', fg: '#1d4ed8', bg: '#e8efff' },
  investment_ma: { label: '투자·M&A', fg: '#9333ea', bg: '#f4e9ff' },
  partnership: { label: '제휴', fg: '#0d9488', bg: '#e0f5f1' },
  pricing: { label: '가격', fg: '#c2410c', bg: '#fdebdd' },
  regulation: { label: '규제·법률', fg: '#b91c1c', bg: '#fde7e7' },
  tech: { label: '기술', fg: '#475569', bg: '#eef1f6' },
  other: { label: '기타', fg: '#6b7280', bg: '#f1f3f6' },
};
const CAT_ORDER: BriefCategory[] = [
  'product_launch',
  'investment_ma',
  'partnership',
  'pricing',
  'regulation',
  'tech',
  'other',
];

export function MarketIntel() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQ = useQuery({ queryKey: ['briefings'], queryFn: getBriefings });
  // 선택값 없으면 최신(목록 첫 항목).
  const activeId = selectedId ?? listQ.data?.[0]?.id ?? null;

  const detailQ = useQuery({
    queryKey: ['briefing', activeId],
    queryFn: () => getBriefing(activeId as string),
    enabled: !!activeId,
  });

  const runM = useMutation({
    mutationFn: runMarketIntel,
    onSuccess: (b) => {
      setSelectedId(b.id);
      qc.invalidateQueries({ queryKey: ['briefings'] });
      qc.setQueryData(['briefing', b.id], b);
    },
  });

  if (listQ.isLoading) return <LoadingState label="브리핑을 불러오는 중…" />;
  if (listQ.isError) return <ErrorState error={listQ.error} onRetry={() => listQ.refetch()} />;

  const briefings = listQ.data ?? [];

  return (
    <div className="page">
      {/* ── 헤더 + 실행 ───────────────────────────────────────── */}
      <section className="section">
        <div className="section-head">
          <div className="head-left">
            <h2>시장·경쟁 인텔리전스</h2>
            <span
              style={{ fontSize: 11, fontWeight: 700, color: '#6d5f93', background: '#efeaff', padding: '2px 8px', borderRadius: 999 }}
            >
              AI 브리핑
            </span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => runM.mutate()} disabled={runM.isPending}>
            {runM.isPending ? '모니터링 분석 중…' : '지금 모니터링 실행'}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '0 2px' }}>
          경쟁사·키워드를 모니터링해 <b style={{ color: 'var(--text-2)' }}>새 소식만</b> 골라 요약·분류하고 두비덥 관점 시사점을 답니다.
          수집·중복제거는 코드가, 요약·분류·시사점은 AI가 담당합니다.
        </p>
        {runM.isError && (
          <p style={{ color: '#b91c1c', fontSize: 12, margin: '6px 2px 0' }}>
            실행 실패: {(runM.error as Error)?.message ?? '오류'}
          </p>
        )}
      </section>

      {briefings.length === 0 ? (
        <div className="card">
          <EmptyState
            emoji="📡"
            title="아직 생성된 브리핑이 없습니다"
            description="‘지금 모니터링 실행’을 누르면 경쟁사·키워드 새 소식을 수집해 AI 브리핑을 만듭니다."
            actions={
              <button className="btn btn-primary" onClick={() => runM.mutate()} disabled={runM.isPending}>
                {runM.isPending ? '분석 중…' : '지금 모니터링 실행'}
              </button>
            }
          />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>
          {/* ── 브리핑 이력 ─────────────────────────────────── */}
          <aside className="card" style={{ padding: 10 }}>
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, padding: '4px 6px 8px' }}>
              브리핑 이력
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {briefings.map((b) => {
                const on = b.id === activeId;
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedId(b.id)}
                    style={{
                      textAlign: 'left',
                      border: '1px solid',
                      borderColor: on ? '#6d5f93' : 'var(--border)',
                      background: on ? '#f6f3ff' : 'transparent',
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>
                      {b.periodTo} 브리핑
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                      신규 {b.itemCount}건 · {b.trigger === 'cron' ? '자동' : '수동'}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ── 선택 브리핑 상세 ───────────────────────────── */}
          <div>
            {detailQ.isLoading && <LoadingState label="브리핑 로딩…" />}
            {detailQ.data && <BriefingView briefing={detailQ.data} />}
          </div>
        </div>
      )}
    </div>
  );
}

function BriefingView({ briefing }: { briefing: import('../lib/types').BriefingDetail }) {
  const grouped = CAT_ORDER.map((cat) => ({
    cat,
    items: briefing.items.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {briefing.periodFrom} ~ {briefing.periodTo}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            신규 {briefing.itemCount}건 · {briefing.trigger === 'cron' ? '자동(주간)' : '수동 실행'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => downloadBriefing(briefing.id, 'md')}>
            Markdown
          </button>
          <button className="btn btn-sm" onClick={() => downloadBriefing(briefing.id, 'html')}>
            HTML
          </button>
        </div>
      </div>

      {briefing.items.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            이번 기간에는 <b>새 소식이 없습니다.</b> (이미 본 항목은 제외됩니다)
          </p>
        </div>
      ) : (
        grouped.map((g) => (
          <section key={g.cat} className="section">
            <div className="section-head">
              <div className="head-left">
                <h2 style={{ fontSize: 14 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: CAT[g.cat].fg,
                      background: CAT[g.cat].bg,
                      padding: '2px 8px',
                      borderRadius: 999,
                      marginRight: 6,
                    }}
                  >
                    {CAT[g.cat].label}
                  </span>
                </h2>
              </div>
              <span className="meta">{g.items.length}건</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {g.items.map((it) => (
                <ItemCard key={it.id} it={it} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function ItemCard({ it }: { it: BriefingItemDto }) {
  return (
    <article className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        {it.matchedTargets.map((t) => (
          <span
            key={t}
            style={{ fontSize: 10.5, fontWeight: 600, color: '#46536a', background: '#eef1f6', padding: '1px 7px', borderRadius: 999 }}
          >
            {t}
          </span>
        ))}
      </div>
      <h3 style={{ margin: '2px 0 6px', fontSize: 14.5, fontWeight: 700, lineHeight: 1.4 }}>
        <a href={it.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-1)', textDecoration: 'none' }}>
          {it.title}
        </a>
      </h3>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--text-2)' }}>{it.summary}</p>
      <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#43395f', background: '#f6f3ff', padding: '7px 10px', borderRadius: 8 }}>
        💡 {it.implication}
      </p>
      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
        출처: {it.source ?? '-'}
        {it.publishedAt ? ` · ${it.publishedAt.slice(0, 10)}` : ''}
      </div>
    </article>
  );
}
