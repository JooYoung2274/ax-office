import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getMonthlyClosing } from '../lib/api';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { CalcBadge } from '../components/StatusBadge';

// 월결산·이상분개·계정대사(§2.3d). 탭: 시산표/재무제표/이상분개/계정대사.
type Tab = 'tb' | 'fs' | 'anomaly' | 'recon';

const TABS: { key: Tab; label: string }[] = [
  { key: 'tb', label: '정형분개 / 시산표' },
  { key: 'fs', label: '재무제표' },
  { key: 'anomaly', label: '이상분개' },
  { key: 'recon', label: '계정대사' },
];

export function MonthlyClosing() {
  const [tab, setTab] = useState<Tab>('anomaly');
  const nav = useNavigate();
  const period = '2026-05';

  const q = useQuery({
    queryKey: ['monthly-closing', period],
    queryFn: () => getMonthlyClosing(period),
  });

  if (q.isLoading) return <LoadingState label="월결산을 계산 중…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const d = q.data;
  const balanced = d?.balanced ?? false;

  return (
    <>
      <div className="page-head">
        <div className="titles">
          <h1>월 결산 {d?.period ?? period}</h1>
          <span className="subtitle">이상분개·대사 탐지는 결정론 룰. AI는 후보의 설명·우선순위만 다룹니다.</span>
        </div>
        <div className="page-actions">
          {d ? (
            balanced ? (
              <span className="badge badge-approved"><span className="dot" />차변=대변 균형</span>
            ) : (
              <span className="badge badge-rejected"><span className="dot" />재무제표 불균형</span>
            )
          ) : (
            <CalcBadge />
          )}
          {/* 차변≠대변이면 리포트 생성 차단(§2.3d) */}
          {balanced ? (
            <button className="btn btn-primary">Draft 리포트 생성 ▶</button>
          ) : (
            <span className="tip" data-tip="재무제표 불균형(차변≠대변) — 결산 미완료 상태에서는 리포트를 생성할 수 없습니다">
              <button className="btn btn-primary" disabled>Draft 리포트 생성 ▶</button>
            </span>
          )}
        </div>
      </div>

      {!d ? (
        <div className="card card-pad">
          <EmptyState
            emoji="▦"
            title="아직 결산 데이터가 없습니다"
            description="시산표·전표를 업로드하면 결산·이상분개·계정대사가 계산됩니다."
            actions={<button className="btn btn-primary" onClick={() => nav('/upload')}>업로드 하러 가기</button>}
          />
        </div>
      ) : (
        <>
          {/* 불균형 게이트 배너 */}
          {!balanced && (
            <div className="banner fatal">
              <span className="b-icon">🔴</span>
              <div>
                <div className="b-title">재무제표 불균형 — 결산 미완료</div>
                <div className="b-text">
                  차변 합계 {d.debitTotal} ≠ 대변 합계 {d.creditTotal}. 시산표를 정정한 뒤 재계산하세요. (AI 리포트 생성 차단)
                </div>
              </div>
            </div>
          )}

          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'tb' && (
            <div className="card card-pad">
              <div className="card-title"><h3>시산표 합계</h3><CalcBadge /></div>
              <div className="grid grid-2">
                <div className="kpi"><div className="label">차변 합계</div><div className="value">{d.debitTotal}</div></div>
                <div className="kpi"><div className="label">대변 합계</div><div className="value">{d.creditTotal}</div></div>
              </div>
              <p className="muted" style={{ marginTop: 12 }}>정형분개·계정별 시산표 상세는 백엔드 CRO 연동 시 표시됩니다.</p>
            </div>
          )}

          {tab === 'fs' && (
            <div className="card card-pad">
              <EmptyState emoji="📑" title="재무제표(BS/IS/현금흐름표)" description="CRO의 fs.bs / fs.is / fs.cf.indirect 메트릭을 연동하면 표시됩니다." />
            </div>
          )}

          {tab === 'anomaly' && (
            <section className="card card-pad">
              <div className="card-title">
                <h3>이상 분개 {d.anomalies.length > 0 && `(${d.anomalies.length}건)`}</h3>
                <CalcBadge />
              </div>
              {d.anomalies.length === 0 ? (
                <p className="muted">탐지된 이상 분개가 없습니다.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>유형</th><th>분개ID</th><th>내용</th><th>룰</th></tr>
                    </thead>
                    <tbody>
                      {d.anomalies.map((a) => (
                        <tr key={a.journalId}>
                          <td>
                            {a.severity === 'FATAL' ? <span className="tag-fatal">🔴 {a.type}</span> : <span className="tag-warn">🟡 {a.type}</span>}
                          </td>
                          <td className="mono">{a.journalId}</td>
                          <td>{a.description}</td>
                          <td className="mono dim">{a.rule}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {tab === 'recon' && (
            <section className="card card-pad">
              <div className="card-title"><h3>계정 대사 (Reconciliation)</h3><CalcBadge /></div>
              {d.reconciliations.length === 0 ? (
                <p className="muted">대사 대상 계정이 없습니다.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>계정</th><th className="num">장부</th><th className="num">대사대상</th><th className="num">차이</th><th>상태</th></tr>
                    </thead>
                    <tbody>
                      {d.reconciliations.map((r) => (
                        <tr key={r.account}>
                          <td>{r.account}</td>
                          <td className="num">{r.book}</td>
                          <td className="num">{r.target}</td>
                          <td className="num">{r.diff}</td>
                          <td>
                            {r.matched ? (
                              <span style={{ color: 'var(--approved)' }}>✓ 일치</span>
                            ) : (
                              <span className="tag-fatal">🔴 불일치</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
