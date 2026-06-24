import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAuditLogs, type AuditQuery } from '../lib/api';
import { LoadingState, ErrorState, EmptyState } from '../components/States';

// 감사 로그(§2.3g) — append-only. APPROVER/ADMIN 전용(라우트에서도 게이트).
const TARGET_TYPES = ['', 'UploadBatch', 'CalculationResult', 'Report', 'Approval'];

export function AuditLogPage() {
  const [filter, setFilter] = useState<AuditQuery>({});

  const q = useQuery({
    queryKey: ['audit-logs', filter],
    queryFn: () => listAuditLogs(filter),
  });

  return (
    <>
      <div className="page-head">
        <div className="titles">
          <h1>감사 로그</h1>
          <span className="subtitle">append-only · 수정/삭제 불가. 업로드·계산·AI 호출·승인 전 과정을 기록합니다.</span>
        </div>
      </div>

      {/* 필터 */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <label className="dim" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>대상유형</label>
            <select
              value={filter.entityType ?? ''}
              onChange={(e) => setFilter((f) => ({ ...f, entityType: e.target.value || undefined }))}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-strong)' }}
            >
              {TARGET_TYPES.map((t) => (
                <option key={t} value={t}>{t || '전체'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="dim" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>액션</label>
            <input
              placeholder="예: REPORT_APPROVE"
              value={filter.action ?? ''}
              onChange={(e) => setFilter((f) => ({ ...f, action: e.target.value || undefined }))}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-strong)' }}
            />
          </div>
          <div>
            <label className="dim" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>행위자</label>
            <input
              placeholder="이름/ID"
              value={filter.actor ?? ''}
              onChange={(e) => setFilter((f) => ({ ...f, actor: e.target.value || undefined }))}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-strong)' }}
            />
          </div>
          <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => setFilter({})}>
            필터 초기화
          </button>
        </div>
      </div>

      <div className="card card-pad">
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (q.data ?? []).length === 0 ? (
          <EmptyState emoji="☰" title="감사 로그가 없습니다" description="활동이 기록되면 여기에 표시됩니다." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>시각</th>
                  <th>행위자</th>
                  <th>액션</th>
                  <th>대상</th>
                  <th>상세 / 해시</th>
                </tr>
              </thead>
              <tbody>
                {q.data!.map((e) => (
                  <tr key={e.id}>
                    <td className="mono dim nowrap">
                      {new Date(e.createdAt).toLocaleString('ko-KR', {
                        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td>{e.actorName}</td>
                    <td className="mono">{e.action}</td>
                    <td className="dim">
                      {e.targetType} <span className="mono">{e.targetId}</span>
                    </td>
                    <td className="dim mono" style={{ fontSize: 11.5 }}>
                      {e.metadata ? summarizeMeta(e.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function summarizeMeta(meta: Record<string, unknown>): string {
  return Object.entries(meta)
    .slice(0, 4)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}
