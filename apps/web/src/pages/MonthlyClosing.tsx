import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getMonthlyClosing } from '../lib/api';
import { LoadingState, ErrorState, EmptyState } from '../components/States';

// 월결산·이상분개·계정대사(§2.3d). 탭: 시산표/재무제표/이상분개/계정대사.
type Tab = 'tb' | 'fs' | 'anomaly' | 'recon';

// 인라인 SVG(JSX-safe) — 체크 표시.
function CheckIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function MonthlyClosing() {
  const [tab, setTab] = useState<Tab>('tb');
  const nav = useNavigate();
  const period = '2026-05';

  const q = useQuery({
    queryKey: ['monthly-closing', period],
    queryFn: () => getMonthlyClosing(period),
  });

  if (q.isLoading) return <LoadingState label="월결산을 계산 중…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const d = q.data;

  if (!d) {
    return (
      <div className="page">
        <div className="section">
          <EmptyState
            emoji="▦"
            title="아직 결산 데이터가 없습니다"
            description="시산표·전표를 업로드하면 결산·이상분개·계정대사가 계산됩니다."
            actions={
              <button className="btn btn-primary" onClick={() => nav('/upload')}>
                업로드 하러 가기
              </button>
            }
          />
        </div>
      </div>
    );
  }

  const balanced = d.balanced;
  const anomalyCount = d.anomalies.length;

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'tb', label: '시산표' },
    { key: 'fs', label: '재무제표 (BS·IS)' },
    { key: 'anomaly', label: '이상분개', count: anomalyCount },
    { key: 'recon', label: '계정대사' },
  ];

  return (
    <div className="page">
      {/* 탭 */}
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.count != null && t.count > 0 && <span className="count">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* 검증 상태: 균형 → 통과 스트립 / 불균형 → 차단 게이트 (garbage-in blocks AI) */}
      {balanced ? (
        <div className="verify-pass">
          <span className="ic">
            <CheckIcon />
          </span>
          <div style={{ flex: 1 }}>
            <div className="t1">검증 통과 — 차변·대변 합계 일치</div>
            <div className="t2">
              차변 합계 ₩{groupDigits(d.debitTotal)} = 대변 합계 ₩{groupDigits(d.creditTotal)} · CRO 결정론적 검증
            </div>
          </div>
          <span className="badge badge-calc">CALCULATED · 계산완료</span>
        </div>
      ) : (
        <div className="block-panel">
          <div className="block-head">
            <span className="block-icon">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6" />
                <path d="M12 16.5v.5" />
              </svg>
            </span>
            <div>
              <h2>차대 불일치 — 결산 미완료, AI 리포트 차단</h2>
              <p>
                차변 합계와 대변 합계가 일치하지 않습니다. 결정론 검증을 통과하지 못한 데이터로는 AI 리포트를
                생성할 수 없습니다. 시산표를 정정한 뒤 재계산하세요.
              </p>
            </div>
          </div>
          <div className="block-figures">
            <div className="fig">
              <div className="l">차변 합계</div>
              <div className="v">₩{groupDigits(d.debitTotal)}</div>
            </div>
            <div className="fig">
              <div className="l">대변 합계</div>
              <div className="v">₩{groupDigits(d.creditTotal)}</div>
            </div>
            <div className="fig">
              <div className="l">불일치 금액</div>
              <div className="v t-neg">₩{diffAmount(d.debitTotal, d.creditTotal)}</div>
            </div>
          </div>
        </div>
      )}

      {/* 시산표 탭 — 합계잔액시산표 */}
      {tab === 'tb' && (
        <section className="section">
          <div className="section-head">
            <div className="head-left">
              <h2>합계잔액시산표</h2>
            </div>
            <span className="meta">단위: 원 · {d.period}</span>
          </div>
          <table className="data-table tnum">
            <thead>
              <tr>
                <th>계정코드</th>
                <th>계정과목</th>
                <th className="num">전기이월</th>
                <th className="num">차변</th>
                <th className="num">대변</th>
                <th className="num">잔액</th>
              </tr>
            </thead>
            <tbody>
              {/* API가 계정별 TB 행을 제공하지 않으면 우아한 빈 상태(구조는 유지). */}
              <tr>
                <td colSpan={6} style={{ padding: 0, borderBottom: 'none' }}>
                  <EmptyState
                    emoji="▦"
                    title="계정별 시산표 상세가 아직 없습니다"
                    description="CRO가 계정별 차·대변 행을 제공하면 표시됩니다. 아래 합계는 결정론 검증값입니다."
                  />
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>합계</td>
                <td className="num" style={{ color: 'var(--indigo)' }}>
                  {groupDigits(d.debitTotal)}
                </td>
                <td className="num" style={{ color: 'var(--indigo)' }}>
                  {groupDigits(d.creditTotal)}
                </td>
                <td className="num">
                  {balanced ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--confirm)' }}>
                      <CheckIcon size={13} />
                      일치
                    </span>
                  ) : (
                    <span className="tag tag-red">불일치</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {/* 재무제표 탭 */}
      {tab === 'fs' && (
        <section className="section">
          <div className="section-head">
            <div className="head-left">
              <h2>재무제표 (BS · IS)</h2>
            </div>
            <span className="meta">{d.period}</span>
          </div>
          <table className="data-table tnum">
            <thead>
              <tr>
                <th>구분</th>
                <th>항목</th>
                <th className="num">금액</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="t-code">BS</td>
                <td>차변 합계 (자산·비용)</td>
                <td className="num">{groupDigits(d.debitTotal)}</td>
              </tr>
              <tr>
                <td className="t-code">BS</td>
                <td>대변 합계 (부채·자본·수익)</td>
                <td className="num">{groupDigits(d.creditTotal)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>차대 균형</td>
                <td className="num">
                  {balanced ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--confirm)' }}>
                      <CheckIcon size={13} />
                      균형
                    </span>
                  ) : (
                    <span className="tag tag-red">불균형</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
          <div style={{ padding: '12px 16px' }}>
            <p className="muted" style={{ margin: 0 }}>
              BS/IS/현금흐름표 상세는 CRO의 fs.bs / fs.is / fs.cf.indirect 메트릭 연동 시 표시됩니다.
            </p>
          </div>
        </section>
      )}

      {/* 이상분개 탭 */}
      {tab === 'anomaly' && (
        <section className="section">
          <div className="section-head">
            <div className="head-left tab" style={{ padding: 0, margin: 0, cursor: 'default' }}>
              <h2>이상분개</h2>
              {anomalyCount > 0 && <span className="count">{anomalyCount}</span>}
            </div>
            <span className="meta">결정론 룰 탐지 · AI는 설명·우선순위만 보조</span>
          </div>
          {anomalyCount === 0 ? (
            <EmptyState emoji="✓" title="탐지된 이상 분개가 없습니다" description="모든 분개가 검증 룰을 통과했습니다." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>유형</th>
                  <th>분개 ID</th>
                  <th>내용</th>
                  <th>룰</th>
                </tr>
              </thead>
              <tbody>
                {d.anomalies.map((a) => (
                  <tr key={a.journalId}>
                    <td>
                      <span className={`tag ${sevTag(a.severity)}`}>{sevLabel(a.severity)} · {a.type}</span>
                    </td>
                    <td className="t-code">{a.journalId}</td>
                    <td>{a.description}</td>
                    <td className="t-code">{a.rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* 계정대사 탭 */}
      {tab === 'recon' && (
        <section className="section">
          <div className="section-head">
            <div className="head-left">
              <h2>계정대사</h2>
            </div>
            <span className="meta">장부 vs 대사대상 · 결정론 비교</span>
          </div>
          {d.reconciliations.length === 0 ? (
            <EmptyState emoji="▦" title="대사 대상 계정이 없습니다" description="대사 대상 데이터를 연동하면 표시됩니다." />
          ) : (
            <table className="data-table tnum">
              <thead>
                <tr>
                  <th>계정</th>
                  <th className="num">장부</th>
                  <th className="num">대사대상</th>
                  <th className="num">차이</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {d.reconciliations.map((r) => (
                  <tr key={r.account}>
                    <td>{r.account}</td>
                    <td className="num">{r.book}</td>
                    <td className="num">{r.target}</td>
                    <td className={`num${r.matched ? '' : ' t-neg'}`}>{r.diff}</td>
                    <td>
                      {r.matched ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--confirm)' }}>
                          <CheckIcon size={13} />
                          일치
                        </span>
                      ) : (
                        <span className="tag tag-red">불일치</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

// 차변·대변 합계 문자열(자릿수 콤마 포함 가능)의 차이 절댓값을 콤마 포맷으로.
function diffAmount(debit: string, credit: string): string {
  const dv = toBigIntSafe(debit);
  const cv = toBigIntSafe(credit);
  if (dv == null || cv == null) return '—';
  const diff = dv > cv ? dv - cv : cv - dv;
  return groupDigits(diff.toString());
}

function toBigIntSafe(s: string): bigint | null {
  const cleaned = s.replace(/[^0-9-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  try {
    return BigInt(cleaned);
  } catch {
    return null;
  }
}

function groupDigits(s: string): string {
  const neg = s.startsWith('-');
  const digits = neg ? s.slice(1) : s;
  return (neg ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function sevTag(sev: 'FATAL' | 'WARN' | 'INFO'): string {
  if (sev === 'FATAL') return 'tag-red';
  if (sev === 'WARN') return 'tag-warn';
  return 'tag-gray';
}

function sevLabel(sev: 'FATAL' | 'WARN' | 'INFO'): string {
  if (sev === 'FATAL') return 'FATAL';
  if (sev === 'WARN') return 'WARN';
  return 'INFO';
}
