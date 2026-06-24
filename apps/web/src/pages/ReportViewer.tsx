import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Role } from '@axaxax/shared';
import type { Cro, Severity } from '@axaxax/shared';
import { getReport, approveReport, rejectReport, commentReport } from '../lib/api';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { StatusBadge, StaleBadge } from '../components/StatusBadge';
import { RoleGate } from '../components/RoleGate';
import { useAuth } from '../context/AuthContext';

// AI 리포트 뷰어(§2.3e,f) — 3단 출처 구분 화면.
//   TIER 2(보라) = AI 분석 findings, TIER 1(인디고) = CRO 근거 수치, TIER 3(초록) = 사람 승인.
//   finding 클릭 → 그 finding의 evidence_refs가 가리키는 CRO 항목(metric/flag)을 우측 패널에서 하이라이트.
export function ReportViewer() {
  const { reportId = '' } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');

  const q = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => getReport(reportId),
    enabled: !!reportId,
  });

  const approve = useMutation({
    mutationFn: () => approveReport(reportId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report', reportId] }),
  });
  const reject = useMutation({
    mutationFn: () => rejectReport(reportId, reason),
    onSuccess: () => {
      setRejecting(false);
      setReason('');
      qc.invalidateQueries({ queryKey: ['report', reportId] });
    },
  });
  const addComment = useMutation({
    mutationFn: () => commentReport(reportId, comment, selectedId ?? undefined),
    onSuccess: () => {
      setComment('');
      setCommenting(false);
      qc.invalidateQueries({ queryKey: ['report', reportId] });
    },
  });

  if (q.isLoading) return <LoadingState label="리포트를 불러오는 중…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const r = q.data;
  if (!r) return <EmptyState title="리포트를 찾을 수 없습니다" />;

  const content = r.content;
  const cro = r.cro;
  const isDraft = r.status === 'DRAFT';
  const isDrafting = r.status === 'AI_DRAFTING';
  const isApproved = r.status === 'APPROVED';
  const findings = content?.findings ?? [];

  // 선택 finding은 기본값을 첫 항목으로(목업 sel:0과 동일).
  const selectedFinding =
    findings.find((f) => f.id === selectedId) ?? findings[0] ?? null;

  // CRO id → 표시용 행(metric/flag) 룩업 + 하이라이트 집합.
  const croRows = cro ? buildCroRows(cro) : [];
  const citedSet = new Set(selectedFinding?.evidence_refs ?? []);

  // self-approval 차단(§2.1): 본인이 생성한 리포트는 승인 불가.
  const isSelfAuthored = !!user && r.authorId === user.id;

  return (
    <div className="page">
      {/* ── 페이지 헤더 ─────────────────────────────────── */}
      <div className="topbar" style={{ borderRadius: 8, border: '1px solid var(--border)' }}>
        <div className="title-wrap">
          <h1>{r.title}</h1>
          <span className="subtitle">
            {r.authorName} · {new Date(r.createdAt).toLocaleString('ko-KR')} · {r.model ?? 'claude-opus-4-8'}
            {r.version && r.version > 1 ? ` · v${r.version}` : ''}
          </span>
        </div>
        <div className="right">
          {r.stale && <StaleBadge />}
          <StatusBadge status={r.status} />
          <button
            className="btn"
            disabled={!isApproved}
            title={isApproved ? '리포트 Export' : '승인 전에는 Export·외부 공유가 차단됩니다'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* ── 반려 사유 배너 ─────────────────────────────── */}
      {r.status === 'REJECTED' && r.rejectReason && (
        <div className="draft-banner" style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger-border)' }}>
          <span className="sev-badge sev-high">반려됨</span>
          <span className="note" style={{ color: 'var(--danger-text)' }}>사유: {r.rejectReason}</span>
        </div>
      )}

      {isDrafting ? (
        <div className="state">
          <span className="emoji">🤖</span>
          <div className="s-title">AI 리포트 생성 중…</div>
          <p className="muted">Claude가 CRO를 근거로 Draft를 작성하고 있습니다. 잠시만 기다려 주세요.</p>
        </div>
      ) : !content ? (
        <EmptyState title="리포트 본문이 아직 없습니다" description="생성이 완료되면 findings와 근거가 표시됩니다." />
      ) : (
        <div className="report-wrap">
          {/* 미승인 시에만 워터마크 강제 */}
          {!isApproved && (
            <div className="draft-watermark" aria-hidden>
              <span>DRAFT · 미승인</span>
            </div>
          )}

          <div className="report-body">
            {/* DRAFT 배너 (DRAFT 상태에서만) */}
            {isDraft && (
              <div className="draft-banner">
                <span className="ai-chip">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                  DRAFT · 미승인
                </span>
                <span className="note">
                  이 리포트는 승인 전 초안입니다. Export·외부 공유는 승인 후 가능합니다.
                </span>
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--faint)' }}>
                  <span className="ai-chip">AI 작성</span>
                  {r.model ?? 'Claude'} · {new Date(r.createdAt).toLocaleString('ko-KR')} 생성
                </span>
              </div>
            )}

            {/* ── 3단 그리드: AI findings (좌) | CRO 근거 (우) ── */}
            <div className="report-grid">
              {/* TIER 2: AI 분석 리포트 */}
              <section className="ai-panel">
                <div className="ai-panel-head">
                  <div className="head-left">
                    <span className="ai-tag-sq">AI</span>
                    <h2>AI 분석 리포트 — 관측·가설</h2>
                  </div>
                  <span style={{ fontSize: 11, color: '#8579a3' }}>결정하지 않습니다 · 보조 의견</span>
                </div>

                <div className="ai-panel-body">
                  {content.summary && (
                    <p className="finding-obs" style={{ margin: 0 }}>{content.summary}</p>
                  )}

                  {findings.length === 0 ? (
                    <p className="muted" style={{ fontSize: 12.5 }}>
                      CRO 근거로 도출된 발견 사항이 없습니다. (데이터 한계는 아래 caveats 참조)
                    </p>
                  ) : (
                    findings.map((f, i) => {
                      const active = selectedFinding?.id === f.id;
                      const pct = `${Math.round(content.confidence * 100)}%`;
                      return (
                        <div
                          key={f.id}
                          className={`finding-card${active ? ' active' : ''}`}
                          onClick={() => setSelectedId(f.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedId(f.id);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-pressed={active}
                        >
                          <div className="finding-top">
                            <span className={`sev-badge ${sevClass(f.severity)}`}>{sevLabel(f.severity)}</span>
                            <span className="finding-title">
                              [{i + 1}] {f.area}
                            </span>
                          </div>
                          <p className="finding-obs">{f.observation}</p>
                          <div className="ev-chips">
                            {f.evidence_refs.map((ref) => (
                              <span key={ref} className="ev-chip">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                  <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
                                </svg>
                                {croLabel(croRows, ref)}
                              </span>
                            ))}
                          </div>
                          <div className="finding-foot">
                            <div className="hyp">
                              <b>원인 가설</b> · {f.rootCauseHypothesis}
                            </div>
                            <div className="conf">
                              <span className="lbl">확신도</span>
                              <div className="conf-bar">
                                <div style={{ width: pct }} />
                              </div>
                              <span className="pct">{pct}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* dataCaveats */}
                  {content.dataCaveats.length > 0 && (
                    <div className="caveats">
                      <div className="ct">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 8v5M12 16h.01" />
                        </svg>
                        데이터 한계 (dataCaveats)
                      </div>
                      <ul>
                        {content.dataCaveats.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 권고 */}
                  {content.recommendations.length > 0 && (
                    <div className="caveats" style={{ borderColor: 'var(--ai-border)' }}>
                      <div className="ct" style={{ color: 'var(--ai-strong)' }}>권고 (제안)</div>
                      <ul style={{ paddingLeft: 17 }}>
                        {content.recommendations.map((rec) => (
                          <li key={rec.id}>
                            {rec.action}{' '}
                            <span className="ai-chip">영향 {rec.impact}</span>{' '}
                            <span className="ai-chip">노력 {rec.effort}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>

              {/* TIER 1: CRO 근거 수치 (결정론) */}
              <section className="cro-panel">
                <div className="section-head">
                  <div className="head-left">
                    <span className="cro-chip">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                      CRO
                    </span>
                    <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>근거 수치 · 결정론적</h2>
                  </div>
                </div>
                <div style={{ padding: '11px 13px' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 9 }}>
                    {selectedFinding ? (
                      <>선택한 관측: <b style={{ color: 'var(--ai-strong)' }}>[{(findings.indexOf(selectedFinding)) + 1}] {selectedFinding.area}</b> 가 인용한 수치</>
                    ) : (
                      <>좌측 발견 사항을 선택하면 인용된 수치가 하이라이트됩니다.</>
                    )}
                  </div>

                  {croRows.length === 0 ? (
                    <p className="muted" style={{ fontSize: 12 }}>연동된 CRO 수치가 없습니다.</p>
                  ) : (
                    <div className="cro-rows">
                      {croRows.map((m) => {
                        const hot = citedSet.has(m.id);
                        return (
                          <div key={m.id} className={`cro-row${hot ? ' hot' : ''}`}>
                            <div style={{ minWidth: 0 }}>
                              <div className="l">
                                {m.label}
                                {hot && <span className="cited-tag">인용됨</span>}
                              </div>
                              <div className="k">{m.id}</div>
                            </div>
                            <div className={`v${m.flag ? ' flag' : ''}`}>{m.value}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--faint)', lineHeight: 1.6 }}>
                    이 수치는 업로드 데이터에 대해 코드가 100% 결정론적으로 산출·검증한 값입니다. AI는 이 값을 인용만 하며 수정하지 않습니다.
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* 반려 사유 입력 */}
      {rejecting && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ margin: '0 0 8px' }}>반려 사유 (필수)</h3>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: JE-771 근거 부족, 구매요청서 첨부 후 재생성"
            style={{ width: '100%', minHeight: 70, padding: 10, borderRadius: 8, border: '1px solid var(--input-border)', fontFamily: 'inherit' }}
          />
          <div className="flex between" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button className="btn" onClick={() => setRejecting(false)}>취소</button>
            <button className="btn btn-danger" disabled={!reason.trim() || reject.isPending} onClick={() => reject.mutate()}>
              반려 확정
            </button>
          </div>
        </div>
      )}

      {/* 코멘트 입력 */}
      {commenting && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ margin: '0 0 8px' }}>
            코멘트{selectedFinding ? ` · [${findings.indexOf(selectedFinding) + 1}] ${selectedFinding.area}` : ''}
          </h3>
          {(r.comments ?? [])
            .filter((c) => !selectedFinding || c.findingId === selectedFinding.id)
            .map((c) => (
              <div key={c.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>
                  {c.authorName}{' '}
                  <span className="muted">{new Date(c.createdAt).toLocaleTimeString('ko-KR')}</span>
                </div>
                <div style={{ fontSize: 13 }}>{c.body}</div>
              </div>
            ))}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={selectedFinding ? `[${findings.indexOf(selectedFinding) + 1}] ${selectedFinding.area}에 코멘트…` : '리포트 코멘트…'}
            style={{ width: '100%', minHeight: 54, marginTop: 8, padding: 8, borderRadius: 8, border: '1px solid var(--input-border)', fontFamily: 'inherit' }}
          />
          <div className="flex between" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button className="btn" onClick={() => setCommenting(false)}>닫기</button>
            <button
              className="btn btn-primary"
              disabled={!comment.trim() || addComment.isPending}
              onClick={() => addComment.mutate()}
            >
              코멘트 추가
            </button>
          </div>
        </div>
      )}

      {/* ── TIER 3: 사람 승인 바 ─────────────────────────── */}
      <div className="approval-bar">
        <div className="approval-note">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" strokeWidth="1.8">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
          </svg>
          최종 결론·승인은 <b style={{ color: 'var(--text)' }}>사람</b>의 책임입니다 · 현재 상태{' '}
          <b style={{ color: isApproved ? 'var(--confirm)' : 'var(--warn-text)' }}>{r.status}</b>
        </div>

        <div className="flex items-center" style={{ gap: 10 }}>
          {/* 코멘트 */}
          <button className="btn" onClick={() => setCommenting((v) => !v)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            코멘트
          </button>

          {/* 반려 — APPROVER 이상 */}
          <RoleGate
            allow={[Role.FINANCE_APPROVER, Role.ADMIN]}
            reason="리포트 반려 권한이 없습니다 (재무팀장/관리자 전용)"
            extraDisabled={!isDraft}
            extraReason="반려 가능한 상태가 아닙니다"
          >
            {({ disabled }) => (
              <button className="btn btn-danger" disabled={disabled} onClick={() => setRejecting(true)}>
                반려 (사유 입력)
              </button>
            )}
          </RoleGate>

          {/* 승인 — APPROVER 이상 + self-approval 차단 */}
          <div className="btn-stack">
            <RoleGate
              allow={[Role.FINANCE_APPROVER, Role.ADMIN]}
              reason="승인 권한이 없습니다 (재무팀장/관리자 전용)"
              extraDisabled={isSelfAuthored || !isDraft}
              extraReason={
                isSelfAuthored
                  ? '본인이 생성한 리포트는 승인할 수 없습니다'
                  : '승인 가능한 상태가 아닙니다'
              }
            >
              {({ disabled }) => (
                <button
                  className="btn btn-primary"
                  disabled={disabled || approve.isPending}
                  onClick={() => approve.mutate()}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  승인
                </button>
              )}
            </RoleGate>
            {isSelfAuthored && isDraft && (
              <span className="btn-note">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                본인 생성 초안 — 승인 불가 (재무팀장 권한 필요)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 헬퍼 ─────────────────────────────────────────────── */

// CRO severity(FATAL/WARN/INFO) 및 일반 high/mid/low 라벨 → sev-* 클래스.
function sevClass(severity: Severity | string): string {
  switch (severity) {
    case 'FATAL':
    case 'high':
    case 'critical':
      return 'sev-high';
    case 'WARN':
    case 'mid':
    case 'medium':
      return 'sev-mid';
    case 'INFO':
    case 'low':
    case 'info':
    default:
      return 'sev-low';
  }
}
function sevLabel(severity: Severity | string): string {
  switch (sevClass(severity)) {
    case 'sev-high':
      return '높음';
    case 'sev-mid':
      return '중간';
    default:
      return '낮음';
  }
}

// CRO id → 라벨(없으면 id 그대로). evidence 칩 라벨용.
function croLabel(rows: CroRow[], id: string): string {
  return rows.find((m) => m.id === id)?.label ?? id;
}

interface CroRow {
  id: string;
  label: string;
  value: string;
  flag: boolean;
}

// CRO의 metrics + flags를 표시용 행으로 평탄화(우측 패널 + 칩 라벨 룩업).
function buildCroRows(cro: Cro): CroRow[] {
  const rows: CroRow[] = [];
  for (const m of cro.metrics) {
    rows.push({ id: m.id, label: m.name, value: formatMetric(m.value, m.unit), flag: false });
  }
  for (const f of cro.flags) {
    rows.push({ id: f.id, label: f.message, value: f.value ?? 'FLAG', flag: true });
  }
  return rows;
}

// unit별 표시 포맷(tabular-nums는 CSS에서 적용).
function formatMetric(value: string, unit: string): string {
  switch (unit) {
    case 'KRW': {
      const n = Number(value);
      if (Number.isNaN(n)) return value;
      return `${n < 0 ? '−' : ''}₩${Math.abs(n).toLocaleString('ko-KR')}`;
    }
    case 'PERCENT':
      return `${value}%`;
    case 'DAYS':
      return `${value}일`;
    case 'COUNT':
      return `${value}건`;
    default:
      return value;
  }
}
