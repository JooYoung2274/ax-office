import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAuditLogs, type AuditQuery } from '../lib/api';
import type { AuditEntry } from '../lib/types';
import { LoadingState, ErrorState, EmptyState } from '../components/States';

// 감사 로그(§2.3g) — append-only. APPROVER/ADMIN 전용(라우트에서도 게이트).
// 모든 행위는 변경 불가능하게 기록되며, 보존기간 5년.

type TagColor = 'green' | 'indigo' | 'ai' | 'red' | 'gray';

// 백엔드 액션 상수 → 표시 라벨 / 태그 색상.
const ACTION_META: Record<string, { label: string; color: TagColor }> = {
  LOGIN: { label: '로그인', color: 'gray' },
  UPLOAD_RECEIVED: { label: '업로드', color: 'indigo' },
  MAPPING_CONFIRMED: { label: '매핑 확정', color: 'indigo' },
  CALC_COMPLETED: { label: '계산 완료', color: 'indigo' },
  VALIDATION_BLOCKED: { label: '검증 실패', color: 'red' },
  AI_INVOKED: { label: 'AI 초안 생성', color: 'ai' },
  REPORT_DRAFTED: { label: 'AI 초안 생성', color: 'ai' },
  REPORT_APPROVED: { label: '승인', color: 'green' },
  REPORT_REJECTED: { label: '반려', color: 'red' },
  COMMENT_ADDED: { label: '코멘트', color: 'gray' },
  EXPORT: { label: '내보내기', color: 'indigo' },
  ROLE_CHANGED: { label: '권한 변경', color: 'gray' },
};

function actionMeta(action: string): { label: string; color: TagColor } {
  if (ACTION_META[action]) return ACTION_META[action];
  // 미등록 액션은 키워드로 합리적 추론.
  const a = action.toUpperCase();
  if (a.includes('APPROV') || a.includes('PASS')) return { label: action, color: 'green' };
  if (a.includes('REJECT') || a.includes('BLOCK') || a.includes('FAIL') || a.includes('DENIED'))
    return { label: action, color: 'red' };
  if (a.includes('AI') || a.includes('DRAFT')) return { label: action, color: 'ai' };
  if (a.includes('UPLOAD') || a.includes('CALC') || a.includes('EXPORT') || a.includes('MAPP'))
    return { label: action, color: 'indigo' };
  return { label: action, color: 'gray' };
}

const TAG_CLASS: Record<TagColor, string> = {
  green: 'tag tag-green',
  indigo: 'tag tag-indigo',
  ai: 'tag tag-ai',
  red: 'tag tag-red',
  gray: 'tag tag-gray',
};

// 결과(outcome) 텍스트를 의미색으로.
function outcomeColor(outcome: string): string {
  const o = outcome.toUpperCase();
  if (o === 'APPROVED' || o === 'OK' || o === 'PASS' || o === 'CALCULATED') return 'var(--confirm)';
  if (o === 'BLOCKED' || o === 'REJECTED' || o === 'FAILED' || o === 'DENIED') return 'var(--danger-text)';
  if (o === 'DRAFT' || o === 'PENDING') return 'var(--warn-text)';
  return 'var(--text-3)';
}

// 행위자 역할 추출(메타에 있으면 표시).
function actorRole(e: AuditEntry): string | undefined {
  const r = e.metadata?.['actorRole'] ?? e.metadata?.['role'];
  return typeof r === 'string' ? r : undefined;
}

// 대상 표시: 메타의 사람이 읽을 라벨 우선, 없으면 type + id.
function targetLabel(e: AuditEntry): string {
  const label = e.metadata?.['targetLabel'] ?? e.metadata?.['label'] ?? e.metadata?.['summary'];
  if (typeof label === 'string' && label.trim()) return label;
  const parts = [e.targetType, e.targetId].filter(Boolean);
  return parts.length ? parts.join(' ') : '—';
}

// 결과 컬럼: 메타의 outcome/result/status 우선, 없으면 액션에서 추론.
function outcomeText(e: AuditEntry): string {
  const o = e.metadata?.['outcome'] ?? e.metadata?.['result'] ?? e.metadata?.['status'];
  if (typeof o === 'string' && o.trim()) return o;
  switch (e.action) {
    case 'REPORT_APPROVED':
      return 'APPROVED';
    case 'REPORT_REJECTED':
      return 'REJECTED';
    case 'VALIDATION_BLOCKED':
      return 'BLOCKED';
    case 'CALC_COMPLETED':
      return 'CALCULATED';
    case 'AI_INVOKED':
    case 'REPORT_DRAFTED':
      return 'DRAFT';
    default:
      return 'OK';
  }
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

const LockIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22a35a" strokeWidth="2">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

const ChevronIcon = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const ExportIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
  </svg>
);

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function exportCsv(rows: AuditEntry[]): void {
  const header = ['시각', '행위자', '역할', '액션', '대상', '결과'];
  const lines = rows.map((e) => {
    const role = actorRole(e) ?? '';
    return [
      formatTs(e.createdAt),
      e.actorName,
      role,
      actionMeta(e.action).label,
      targetLabel(e),
      outcomeText(e),
    ]
      .map(csvCell)
      .join(',');
  });
  const csv = '﻿' + [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AuditLogPage() {
  // 백엔드 필터 엔드포인트가 확정되기 전까지 필터는 기본 비움(전체).
  const [filter] = useState<AuditQuery>({});

  const q = useQuery({
    queryKey: ['audit-logs', filter],
    queryFn: () => listAuditLogs(filter),
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);

  return (
    <>
      <div className="page-head">
        <div className="titles">
          <h1>감사 로그</h1>
          <span className="subtitle">모든 행위는 변경 불가능하게 기록됩니다 · append-only</span>
        </div>
      </div>

      {/* 열람 권한 안내 + 필터 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 11.5,
            color: 'var(--muted)',
          }}
        >
          {LockIcon}
          재무팀장·관리자만 열람할 수 있습니다 · 보존기간 5년
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btn btn-sm" disabled title="필터 준비 중">
            전체 액션 {ChevronIcon}
          </button>
          <button type="button" className="btn btn-sm" disabled title="필터 준비 중">
            전체 사용자 {ChevronIcon}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => exportCsv(rows)}
            disabled={rows.length === 0}
          >
            {ExportIcon}
            CSV 내보내기
          </button>
        </div>
      </div>

      {q.isLoading ? (
        <LoadingState label="감사 로그를 불러오는 중…" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          emoji="☰"
          title="감사 로그가 없습니다"
          description="활동이 기록되면 여기에 표시됩니다."
        />
      ) : (
        <section className="section">
          <table className="data-table">
            <thead>
              <tr>
                <th>시각</th>
                <th>행위자</th>
                <th>액션</th>
                <th>대상</th>
                <th>결과</th>
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
              {rows.map((e) => {
                const meta = actionMeta(e.action);
                const role = actorRole(e);
                const outcome = outcomeText(e);
                return (
                  <tr key={e.id}>
                    <td style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                      {formatTs(e.createdAt)}
                    </td>
                    <td>
                      <b>{e.actorName}</b>
                      {role ? <span style={{ color: 'var(--faint)' }}> ({role})</span> : null}
                    </td>
                    <td>
                      <span className={TAG_CLASS[meta.color]}>{meta.label}</span>
                    </td>
                    <td>{targetLabel(e)}</td>
                    <td style={{ color: outcomeColor(outcome), whiteSpace: 'nowrap' }}>{outcome}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
