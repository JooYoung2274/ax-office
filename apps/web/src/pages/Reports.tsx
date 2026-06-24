import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { listReports } from '../lib/api';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { StatusBadge, StaleBadge } from '../components/StatusBadge';

// 리포트 목록 — Draft/승인대기/승인됨/반려됨 전체. 클릭 시 뷰어로.
export function Reports() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['reports'], queryFn: () => listReports() });

  if (q.isLoading) return <LoadingState label="리포트 목록을 불러오는 중…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const reports = q.data ?? [];
  const staleCount = reports.filter((r) => r.stale).length;

  return (
    <div className="page">
      <section className="section">
        <div className="section-head">
          <div className="head-left">
            <h2>리포트</h2>
            <span className="meta">
              모든 리포트는 초안으로 생성되며, 사람 승인 전까지 비공개이고 내보낼 수 없습니다.
            </span>
          </div>
          <div className="flex items-center gap-9">
            {staleCount > 0 && (
              <span className="meta">재생성 필요 {staleCount}건</span>
            )}
            <span className="meta">총 {reports.length}건</span>
            <button className="btn btn-sm" onClick={() => nav('/upload')}>
              + 새 분석
            </button>
          </div>
        </div>

        {reports.length === 0 ? (
          <EmptyState
            emoji="◫"
            title="아직 생성된 리포트가 없습니다"
            description="데이터를 업로드하고 검증을 통과하면 AI 리포트(초안)를 생성할 수 있습니다."
            actions={
              <button className="btn btn-primary" onClick={() => nav('/upload')}>
                업로드 하러 가기
              </button>
            }
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>제목</th>
                <th>도메인</th>
                <th>기간</th>
                <th>상태</th>
                <th>작성자</th>
                <th>생성일</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr
                  key={r.reportId}
                  style={{ cursor: 'pointer' }}
                  onClick={() => nav(`/reports/${r.reportId}`)}
                >
                  <td>
                    <Link
                      to={`/reports/${r.reportId}`}
                      className="link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="muted">{r.domain === 'cashflow' ? '자금일보' : '월결산'}</td>
                  <td className="tnum muted">{r.period ?? '—'}</td>
                  <td>
                    <span className="flex items-center gap-9">
                      <StatusBadge status={r.status} />
                      {r.stale && <StaleBadge />}
                    </span>
                  </td>
                  <td>{r.authorName}</td>
                  <td className="tnum muted">
                    {new Date(r.createdAt).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
