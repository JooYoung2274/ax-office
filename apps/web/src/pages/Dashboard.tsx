import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getDashboardSummary } from '../lib/api';
import { LoadingState, ErrorState } from '../components/States';
import { CalcBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

// 대시보드(§2.3a): 유동성 경보(상단) → 처리 현황 큐 → 최근 활동.
export function Dashboard() {
  const nav = useNavigate();
  const { user, isApprover } = useAuth();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: getDashboardSummary });

  if (q.isLoading) return <LoadingState label="대시보드를 불러오는 중…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const data = q.data;
  const alerts = data?.liquidityAlerts ?? [];
  const queue = data?.queue ?? { uploading: 0, validationFailed: 0, draft: 0, pendingApproval: 0 };
  const activity = data?.recentActivity ?? [];

  return (
    <>
      <div className="page-head">
        <div className="titles">
          <h1>홈</h1>
          <span className="subtitle">{user?.name}님, 지금 무엇을 봐야 하고 무엇이 막혀 있는지 한눈에 확인하세요.</span>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => nav('/upload')}>
            + 새 분석
          </button>
        </div>
      </div>

      <div className="stack">
        {/* 유동성 경보 — 가장 위험한 항목부터. 결정론 CRO 산출(AI 아님). */}
        <section className="card card-pad">
          <div className="card-title">
            <h2>⚠ 유동성 경보 {alerts.length > 0 && `(${alerts.length})`}</h2>
            <CalcBadge />
          </div>
          {alerts.length === 0 ? (
            <p className="muted">현재 발화된 유동성 경보가 없습니다. (안전선 이상 유지 중이거나 데이터 없음)</p>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {alerts.map((a) => (
                <button
                  key={a.id}
                  className={`alert-card sev-${a.severity}`}
                  style={{ textAlign: 'left', cursor: 'pointer', width: '100%', font: 'inherit' }}
                  onClick={() => nav(`/cash-daily${a.cashDailyDate ? `?date=${a.cashDailyDate}` : ''}`)}
                  title="자금일보의 근거 시점으로 이동"
                >
                  <span className="a-icon">{a.severity === 'high' ? '🔴' : '🟡'}</span>
                  <span className="a-body">
                    <span className="a-title">{a.title}</span>
                    {(a.detail || a.amount) && (
                      <span className="a-meta">
                        {a.amount && <>예상부족 {a.amount} · </>}
                        {a.detail}
                      </span>
                    )}
                  </span>
                  <span className="dim">근거 보기 →</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 처리 현황 큐 */}
        <section className="card card-pad">
          <div className="card-title">
            <h2>처리 현황 (My Queue)</h2>
            {isApprover && <span className="chip">승인대기 = 내 결재함</span>}
          </div>
          <div className="queue">
            <button className="cell" onClick={() => nav('/upload')} style={{ font: 'inherit', cursor: 'pointer' }}>
              <div className="n">{queue.uploading}</div>
              <div className="t">업로드중</div>
            </button>
            <button
              className={`cell${queue.validationFailed > 0 ? ' alert' : ''}`}
              onClick={() => nav('/upload')}
              style={{ font: 'inherit', cursor: 'pointer' }}
            >
              <div className="n">{queue.validationFailed} {queue.validationFailed > 0 && '🔴'}</div>
              <div className="t">검증실패</div>
            </button>
            <button className="cell" onClick={() => nav('/reports')} style={{ font: 'inherit', cursor: 'pointer' }}>
              <div className="n">{queue.draft}</div>
              <div className="t">Draft</div>
            </button>
            <button className="cell" onClick={() => nav('/reports')} style={{ font: 'inherit', cursor: 'pointer' }}>
              <div className="n">{queue.pendingApproval}</div>
              <div className="t">승인대기</div>
            </button>
          </div>
        </section>

        {/* 최근 활동(AuditLog 요약) */}
        <section className="card card-pad">
          <div className="card-title">
            <h2>최근 활동</h2>
            <button className="btn btn-sm" onClick={() => nav('/audit-log')}>
              감사로그 전체
            </button>
          </div>
          {activity.length === 0 ? (
            <p className="muted">최근 활동 내역이 없습니다.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {activity.slice(0, 5).map((e) => (
                <li key={e.id} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="dim mono" style={{ width: 92 }}>
                    {new Date(e.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ fontWeight: 600 }}>{e.actorName}</span>
                  <span className="muted">
                    {e.action} · {e.targetType} {e.targetId}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
