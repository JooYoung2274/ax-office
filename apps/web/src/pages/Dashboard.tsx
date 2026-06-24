import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getDashboardSummary } from '../lib/api';
import { LoadingState, ErrorState } from '../components/States';
import { useAuth } from '../context/AuthContext';
import type { AuditEntry, LiquidityAlert } from '../lib/types';

// 결정론 CRO 검증 칩(인디고). 출처가 코드·사실임을 표시.
function CroChip({ label = 'CRO 검증' }: { label?: string }) {
  return (
    <span className="cro-chip">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      {label}
    </span>
  );
}

// liquidityAlerts severity → 시각 단계(critical/warn) 매핑.
function alertVariant(sev: LiquidityAlert['severity']): 'critical' | 'warn' {
  return sev === 'high' ? 'critical' : 'warn';
}
function alertSevLabel(sev: LiquidityAlert['severity']): string {
  return sev === 'high' ? '위험' : '주의';
}

// 최근 활동 행: action 유형에 따라 아바타 색/이니셜을 결정.
function activityStyle(e: AuditEntry): { bg: string; color: string; initial: string } {
  const a = e.action.toLowerCase();
  if (a.includes('approve') || a.includes('승인'))
    return { bg: 'var(--confirm-bg)', color: 'var(--confirm)', initial: avatarInitial(e) };
  if (a.includes('reject') || a.includes('block') || a.includes('fail') || a.includes('실패') || a.includes('반려'))
    return { bg: 'var(--danger-bg)', color: 'var(--danger-text)', initial: '!' };
  if (a.includes('ai') || a.includes('draft') || a.includes('generate') || a.includes('생성'))
    return { bg: 'var(--ai-bg-2)', color: 'var(--ai)', initial: 'AI' };
  return { bg: 'var(--indigo-bg-2)', color: 'var(--indigo)', initial: avatarInitial(e) };
}
function avatarInitial(e: AuditEntry): string {
  return e.actorName?.trim()?.[0] ?? '·';
}

// 대시보드(§2.3a): KPI → 유동성 경보 → 처리 현황 큐 + 최근 활동.
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

  // KPI는 대시보드 API가 제공하지 않음 → 구조는 유지하되 자리표시자로 표시.
  // 검증 통과율은 큐(검증실패) 정보로 부분 유도 가능하나, 분모 미상이므로 자리표시자 유지.

  return (
    <div className="page">
      {/* ── KPI strip ─────────────────────────────────────── */}
      <div className="grid-3">
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-label">총 가용잔액</span>
            <CroChip />
          </div>
          <div className="kpi-value">—</div>
          <div className="kpi-sub">데이터 없음 · 자금일보 연동 예정</div>
        </div>

        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-label">7일 예측 최저잔액</span>
            <CroChip />
          </div>
          <div className="kpi-value">—</div>
          <div className="kpi-sub warn">
            {alerts.some((a) => a.severity === 'high') ? '안전선 하회 경보 발생' : '데이터 없음'}
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-label">이번 달 검증 통과율</span>
            <CroChip />
          </div>
          <div className="kpi-value">—</div>
          <div className="kpi-sub">
            {queue.validationFailed > 0 ? (
              <>검증실패 <span className="tnum">{queue.validationFailed}</span>건 대기</>
            ) : (
              '데이터 없음'
            )}
          </div>
        </div>
      </div>

      {/* ── 유동성 경보 ───────────────────────────────────── */}
      <section className="section">
        <div className="section-head">
          <div className="head-left">
            <span
              style={{ display: 'inline-flex', width: 7, height: 7, borderRadius: '50%', background: 'var(--danger)' }}
            />
            <h2>유동성 경보</h2>
            <CroChip label="결정론적 산출" />
          </div>
          <span className="meta">
            위험도 높은 순 · <span className="tnum">{alerts.length}</span>건
          </span>
        </div>

        {alerts.length === 0 ? (
          <p className="muted" style={{ padding: '14px 18px', margin: 0 }}>
            현재 발화된 유동성 경보가 없습니다. (안전선 이상 유지 중이거나 데이터 없음)
          </p>
        ) : (
          [...alerts]
            .sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1))
            .map((a) => {
              const variant = alertVariant(a.severity);
              return (
                <button
                  key={a.id}
                  className={`alert-row ${variant}`}
                  style={{ width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer', border: 'none' }}
                  onClick={() => nav(`/cash-daily${a.cashDailyDate ? `?date=${a.cashDailyDate}` : ''}`)}
                  title="자금일보의 근거 시점으로 이동"
                >
                  <span className={`alert-sev ${variant}`}>{alertSevLabel(a.severity)}</span>
                  <span className="alert-body">
                    <span className="alert-title">{a.title}</span>
                    {(a.detail || a.amount || a.occursOn) && (
                      <span className="alert-detail">
                        {a.amount && (
                          <>
                            예상부족{' '}
                            <b style={{ color: variant === 'critical' ? 'var(--danger-text)' : 'var(--warn-text)' }}>
                              {a.amount}
                            </b>
                            {(a.detail || a.occursOn) && ' · '}
                          </>
                        )}
                        {a.detail}
                        {a.occursOn && <>{a.detail ? ' · ' : ''}{a.occursOn}</>}
                      </span>
                    )}
                  </span>
                  <span className="alert-right">
                    <span className="link">근거 보기 →</span>
                    <div className="src">자금일보 · 결정론 산출</div>
                  </span>
                </button>
              );
            })
        )}
      </section>

      {/* ── 처리 현황 큐 + 최근 활동 ──────────────────────── */}
      <div className="grid-2" style={{ gridTemplateColumns: '1.1fr 1fr' }}>
        {/* 처리 현황 큐 */}
        <section className="section">
          <div className="section-head">
            <h2>처리 현황 큐</h2>
            <span className="meta">{isApprover ? '승인대기 = 내 결재함' : '실시간'}</span>
          </div>
          <div className="queue-grid">
            <button
              className="queue-cell"
              onClick={() => nav('/upload')}
              style={{ font: 'inherit', textAlign: 'left', border: 'none' }}
            >
              <div className="qlabel">
                <span className="qpip" style={{ background: 'var(--indigo)' }} />
                업로드 중
              </div>
              <div className="qnum tnum">{queue.uploading}</div>
            </button>

            <button
              className="queue-cell"
              onClick={() => nav('/upload')}
              style={{ font: 'inherit', textAlign: 'left', border: 'none' }}
            >
              <div className="qlabel">
                <span className="qpip" style={{ background: 'var(--danger)' }} />
                검증 실패
              </div>
              <div
                className="qnum tnum"
                style={queue.validationFailed > 0 ? { color: 'var(--danger-text)' } : undefined}
              >
                {queue.validationFailed}
              </div>
            </button>

            <button
              className="queue-cell"
              onClick={() => nav('/reports')}
              style={{ font: 'inherit', textAlign: 'left', border: 'none' }}
            >
              <div className="qlabel">
                <span className="qpip" style={{ background: 'var(--warn)' }} />
                Draft 미승인
              </div>
              <div className="qnum tnum" style={queue.draft > 0 ? { color: 'var(--warn-text)' } : undefined}>
                {queue.draft}
              </div>
            </button>

            <button
              className="queue-cell"
              onClick={() => nav('/reports')}
              style={{ font: 'inherit', textAlign: 'left', border: 'none' }}
            >
              <div className="qlabel">
                <span className="qpip" style={{ background: 'var(--indigo-accent)' }} />
                승인 대기
              </div>
              <div className="qnum tnum">{queue.pendingApproval}</div>
            </button>
          </div>
        </section>

        {/* 최근 활동 (AuditLog 요약) */}
        <section className="section">
          <div className="section-head">
            <h2>최근 활동</h2>
            <button
              className="link"
              onClick={() => nav('/audit-log')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
            >
              감사로그 전체 →
            </button>
          </div>
          {activity.length === 0 ? (
            <p className="muted" style={{ padding: '14px 16px', margin: 0 }}>
              최근 활동 내역이 없습니다.
            </p>
          ) : (
            activity.slice(0, 5).map((e) => {
              const s = activityStyle(e);
              return (
                <div key={e.id} className="activity-row">
                  <div className="ava" style={{ background: s.bg, color: s.color }}>
                    {s.initial}
                  </div>
                  <div className="txt">
                    <b>{e.actorName}</b>님이 {e.action} · {e.targetType} {e.targetId}
                  </div>
                  <div className="ts tnum">
                    {new Date(e.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
