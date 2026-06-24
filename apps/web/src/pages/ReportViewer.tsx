import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Role } from '@axaxax/shared';
import type { Cro } from '@axaxax/shared';
import { getReport, approveReport, rejectReport, commentReport } from '../lib/api';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { StatusBadge, StaleBadge } from '../components/StatusBadge';
import { RoleGate } from '../components/RoleGate';
import { useAuth } from '../context/AuthContext';

// AI 리포트 뷰어(§2.3e,f) — finding 클릭 → evidence_refs 하이라이트 + CRO 값 표시.
export function ReportViewer() {
  const { reportId = '' } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
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
    mutationFn: () => commentReport(reportId, comment, selected ?? undefined),
    onSuccess: () => {
      setComment('');
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
  const findings = content?.findings ?? [];
  const selectedFinding = findings.find((f) => f.id === selected) ?? null;

  // 선택된 finding의 evidence_refs가 가리키는 CRO 항목.
  const evidenceItems = selectedFinding && cro ? resolveEvidence(cro, selectedFinding.evidence_refs) : [];

  // self-approval 차단(§2.1): 본인이 생성한 리포트는 승인 불가.
  const isSelfAuthored = !!user && r.authorId === user.id;

  return (
    <>
      <div className="page-head">
        <div className="titles">
          <h1>
            {isDraft && <span className="tag-warn" style={{ marginRight: 8 }}>[DRAFT]</span>}
            {r.title}
          </h1>
          <span className="subtitle">
            생성 {r.authorName} · {new Date(r.createdAt).toLocaleString('ko-KR')} · {r.model ?? 'claude-opus-4-8'}
            {r.version && r.version > 1 && ` · v${r.version}`}
          </span>
        </div>
        <div className="page-actions">
          {r.stale && <StaleBadge />}
          <StatusBadge status={r.status} />

          {/* 승인 — APPROVER 이상, self-approval 비활성 */}
          <RoleGate
            allow={[Role.FINANCE_APPROVER, Role.ADMIN]}
            reason="리포트 승인 권한이 없습니다 (재무팀장/관리자 전용)"
            extraDisabled={isSelfAuthored || !isDraft}
            extraReason={isSelfAuthored ? '본인이 생성한 리포트는 승인할 수 없습니다' : '승인 가능한 상태가 아닙니다'}
          >
            {({ disabled }) => (
              <button className="btn btn-success" disabled={disabled || approve.isPending} onClick={() => approve.mutate()}>
                ✓ 승인
              </button>
            )}
          </RoleGate>

          {/* 반려 — APPROVER 이상 */}
          <RoleGate
            allow={[Role.FINANCE_APPROVER, Role.ADMIN]}
            reason="리포트 반려 권한이 없습니다"
            extraDisabled={!isDraft}
            extraReason="반려 가능한 상태가 아닙니다"
          >
            {({ disabled }) => (
              <button className="btn btn-danger" disabled={disabled} onClick={() => setRejecting(true)}>
                ✗ 반려
              </button>
            )}
          </RoleGate>
        </div>
      </div>

      {/* 미승인 경고 배너 */}
      {isDraft && (
        <div className="banner warn">
          <span className="b-icon">⚠</span>
          <div>
            <div className="b-title">미승인 Draft — 외부 공유 불가</div>
            <div className="b-text">사람 승인 전까지 워터마크가 강제되며 Export가 차단됩니다.</div>
          </div>
        </div>
      )}
      {r.status === 'REJECTED' && r.rejectReason && (
        <div className="banner fatal">
          <span className="b-icon">✗</span>
          <div>
            <div className="b-title">반려됨</div>
            <div className="b-text">사유: {r.rejectReason}</div>
          </div>
        </div>
      )}

      {/* 반려 사유 입력 */}
      {rejecting && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <h3>반려 사유 (필수)</h3>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: JE-771 근거 부족, 구매요청서 첨부 후 재생성"
            style={{ width: '100%', minHeight: 70, marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid var(--border-strong)', fontFamily: 'inherit' }}
          />
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn" onClick={() => setRejecting(false)}>취소</button>
            <button className="btn btn-danger" disabled={!reason.trim() || reject.isPending} onClick={() => reject.mutate()}>
              반려 확정
            </button>
          </div>
        </div>
      )}

      {isDrafting ? (
        <div className="card card-pad">
          <EmptyState emoji="🤖" title="AI 리포트 생성 중…" description="Claude가 CRO를 근거로 Draft를 작성하고 있습니다. 잠시만 기다려 주세요." />
        </div>
      ) : !content ? (
        <div className="card card-pad">
          <EmptyState title="리포트 본문이 아직 없습니다" description="생성이 완료되면 findings와 근거가 표시됩니다." />
        </div>
      ) : (
        <div className="report-layout">
          {/* 본문: findings */}
          <div className="card card-pad report-body">
            {isDraft && (
              <div className="draft-watermark" aria-hidden>
                <span>DRAFT · 미승인</span>
              </div>
            )}

            <h2>요약</h2>
            <p style={{ marginTop: 6 }}>{content.summary}</p>

            {/* confidence + dataCaveats */}
            <div className="row" style={{ gap: 16, margin: '14px 0', flexWrap: 'wrap' }}>
              <ConfidenceBadge value={content.confidence} />
              {content.dataCaveats.map((c, i) => (
                <span key={i} className="chip" title="데이터 한계/주의사항">⚠ {c}</span>
              ))}
            </div>

            <hr className="hr-light" />

            <h2>발견 사항 (findings)</h2>
            {findings.length === 0 ? (
              <p className="muted">CRO 근거로 도출된 발견 사항이 없습니다. (데이터 한계는 위 caveats 참조)</p>
            ) : (
              <div className="stack" style={{ gap: 10, marginTop: 10 }}>
                {findings.map((f, i) => (
                  <div
                    key={f.id}
                    className={`finding${selected === f.id ? ' selected' : ''}`}
                    onClick={() => setSelected(f.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>
                        [{i + 1}] {f.area}
                      </strong>
                      <SeverityChip severity={f.severity} />
                    </div>
                    <p className="obs">{f.observation}</p>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      가설: {f.rootCauseHypothesis}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      {f.evidence_refs.map((ref) => (
                        <span key={ref} className="ref-chip">{ref}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 권고 */}
            {content.recommendations.length > 0 && (
              <>
                <hr className="hr-light" />
                <h2>권고 (제안)</h2>
                <ul style={{ marginTop: 8 }}>
                  {content.recommendations.map((rec) => (
                    <li key={rec.id} style={{ marginBottom: 6 }}>
                      {rec.action}{' '}
                      <span className="chip">영향 {rec.impact}</span>{' '}
                      <span className="chip">노력 {rec.effort}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* 근거 패널: 선택된 finding의 evidence_refs → CRO 셀 하이라이트 */}
          <aside className="card card-pad" style={{ position: 'sticky', top: 0 }}>
            <h3>근거 (Evidence)</h3>
            {!selectedFinding ? (
              <p className="muted" style={{ marginTop: 8 }}>
                좌측 발견 사항을 클릭하면 인용된 CRO 항목(metric/flag)이 여기서 하이라이트됩니다.
              </p>
            ) : evidenceItems.length === 0 ? (
              <p className="muted" style={{ marginTop: 8 }}>
                참조 ID에 해당하는 CRO 항목을 찾지 못했습니다. (CRO 미연동 또는 근거 불일치)
              </p>
            ) : (
              <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                {evidenceItems.map((it) => (
                  <div key={it.id} className="evidence-cell highlight">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{it.label}</strong>
                      <span className={`badge ${it.kind === 'flag' ? 'badge-rejected' : 'badge-calc'}`} style={{ fontSize: 10 }}>
                        {it.kind === 'flag' ? 'FLAG' : 'METRIC'}
                      </span>
                    </div>
                    <div className="mono" style={{ fontSize: 16, fontWeight: 700, margin: '4px 0' }}>
                      {it.value}
                      {it.unit ? ` ${it.unit}` : ''}
                    </div>
                    <div className="ref-chip">cro://{it.id}</div>
                    {it.sourceRowIds.length > 0 && (
                      <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
                        원본 행: {it.sourceRowIds.join(', ')}
                      </div>
                    )}
                    <button className="btn btn-sm" style={{ marginTop: 8 }}>원본 업로드 위치 열기</button>
                  </div>
                ))}
              </div>
            )}

            {/* 코멘트 스레드(finding 단위) */}
            <hr className="hr-light" />
            <h3>코멘트{selectedFinding ? ` · ${selectedFinding.id}` : ''}</h3>
            {(r.comments ?? []).filter((c) => !selected || c.findingId === selected).map((c) => (
              <div key={c.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>
                  {c.authorName} <span className="dim">{new Date(c.createdAt).toLocaleTimeString('ko-KR')}</span>
                </div>
                <div style={{ fontSize: 13 }}>{c.body}</div>
              </div>
            ))}
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={selectedFinding ? `${selectedFinding.id}에 코멘트…` : '리포트 코멘트…'}
              style={{ width: '100%', minHeight: 54, marginTop: 8, padding: 8, borderRadius: 8, border: '1px solid var(--border-strong)', fontFamily: 'inherit' }}
            />
            <button
              className="btn btn-sm btn-primary"
              style={{ marginTop: 6 }}
              disabled={!comment.trim() || addComment.isPending}
              onClick={() => addComment.mutate()}
            >
              코멘트 추가
            </button>
          </aside>
        </div>
      )}
    </>
  );
}

// confidence는 shared에서 number(0~1). 레벨 라벨로 변환.
function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const level = value >= 0.75 ? 'high' : value >= 0.4 ? 'medium' : 'low';
  const label = level === 'high' ? '높음' : level === 'medium' ? '보통' : '낮음 · 참고용';
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className="muted" style={{ fontSize: 12.5 }}>confidence {label}</span>
      <span className="conf-bar">
        <i style={{ width: `${pct}%`, background: level === 'low' ? 'var(--text-3)' : level === 'medium' ? 'var(--warn)' : 'var(--approved)' }} />
      </span>
      <span className="dim" style={{ fontSize: 12 }}>{pct}%</span>
    </span>
  );
}

function SeverityChip({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: 'badge-rejected', high: 'badge-rejected', FATAL: 'badge-rejected',
    medium: 'badge-warn', WARN: 'badge-warn',
    low: 'badge-calc', info: 'badge-pending', INFO: 'badge-pending',
  };
  return <span className={`badge ${map[severity] ?? 'badge-pending'}`} style={{ fontSize: 11 }}>{severity}</span>;
}

// CRO에서 evidence_refs(metricId/flagId)를 실제 항목으로 해석.
interface ResolvedEvidence {
  id: string;
  label: string;
  value: string;
  unit?: string;
  kind: 'metric' | 'flag';
  sourceRowIds: string[];
}
function resolveEvidence(cro: Cro, refs: string[]): ResolvedEvidence[] {
  const out: ResolvedEvidence[] = [];
  for (const ref of refs) {
    const m = cro.metrics.find((x) => x.id === ref);
    if (m) {
      out.push({ id: m.id, label: m.name, value: m.value, unit: m.unit, kind: 'metric', sourceRowIds: m.sourceRowIds });
      continue;
    }
    const f = cro.flags.find((x) => x.id === ref);
    if (f) {
      out.push({ id: f.id, label: f.message, value: f.value ?? '—', kind: 'flag', sourceRowIds: f.sourceRowIds });
    }
  }
  return out;
}
