import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getCashDaily } from '../lib/api';
import type { CashDailySummary } from '../lib/types';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { CalcBadge } from '../components/StatusBadge';

// 자금일보·현금흐름·유동성 경보(§2.3c). 모든 수치는 CRO 기반(AI 추정 없음).
export function CashDaily() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const asOf = sp.get('date') ?? undefined;

  const q = useQuery({
    queryKey: ['cash-daily', asOf],
    queryFn: () => getCashDaily(asOf),
  });

  if (q.isLoading) return <LoadingState label="자금일보를 계산 중…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const d = q.data;
  if (!d || d.kpis.length === 0) {
    return (
      <>
        <Head asOf={asOf} disabled />
        <div className="card card-pad">
          <EmptyState
            emoji="₩"
            title="아직 자금 데이터가 없습니다"
            description="은행거래내역·예정 입출금을 업로드하면 현금흐름 예측과 유동성 경보가 계산됩니다."
            actions={<button className="btn btn-primary" onClick={() => nav('/upload')}>업로드 하러 가기</button>}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Head asOf={d.asOfDate} />
      <div className="stack">
        {/* KPI */}
        <div className="grid grid-4">
          {d.kpis.map((k) => (
            <div className="kpi" key={k.label}>
              <div className="label">{k.label}</div>
              <div className="value">{k.value}</div>
              {k.unit && <div className="sub">{k.unit}</div>}
            </div>
          ))}
        </div>

        {/* 현금흐름 예측 차트 */}
        <section className="card card-pad">
          <div className="card-title">
            <h2>현금흐름 예측 (향후 30일)</h2>
            <span className="chip">안전선 {d.safetyLine}</span>
          </div>
          <ForecastChart data={d} />
        </section>

        {/* 유동성 경보 */}
        <section className="card card-pad">
          <div className="card-title">
            <h2>⚠ 유동성 경보</h2>
            <CalcBadge />
          </div>
          {d.alerts.length === 0 ? (
            <p className="muted">발화된 경보가 없습니다.</p>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {d.alerts.map((a) => (
                <div key={a.id} className={`alert-card sev-${a.severity}`}>
                  <span className="a-icon">{a.severity === 'high' ? '🔴' : '🟡'}</span>
                  <div className="a-body">
                    <div className="a-title">
                      {a.occursOn && `${a.occursOn} `}{a.title}
                    </div>
                    <div className="a-meta">{a.detail}</div>
                  </div>
                  <button className="btn btn-sm">근거 데이터 보기 →</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 일자별 자금 테이블 */}
        <section className="card card-pad">
          <div className="card-title"><h2>일자별 자금 테이블</h2></div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>일자</th>
                  <th className="num">입금</th>
                  <th className="num">출금</th>
                  <th className="num">누적잔액</th>
                  <th>예측 플래그</th>
                </tr>
              </thead>
              <tbody>
                {d.dailyRows.map((r) => (
                  <tr key={r.date}>
                    <td className="mono">{r.date}</td>
                    <td className="num">{r.deposit}</td>
                    <td className="num">{r.withdrawal}</td>
                    <td className="num">{r.cumulative}</td>
                    <td>{r.flag ? <span className="tag-fatal">{r.flag}</span> : <span className="dim">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function Head({ asOf, disabled }: { asOf?: string; disabled?: boolean }) {
  return (
    <div className="page-head">
      <div className="titles">
        <h1>자금일보 {asOf ?? ''}</h1>
        <span className="subtitle">현금흐름 예측·유동성 경보는 모두 결정론 엔진(CRO) 산출입니다.</span>
      </div>
      <div className="page-actions">
        <CalcBadge />
        <span className="tip" data-tip={disabled ? '계산된 CRO가 없습니다. 먼저 데이터를 업로드하세요.' : ''}>
          <button className="btn btn-primary" disabled={disabled}>
            Draft 리포트 생성 ▶
          </button>
        </span>
      </div>
    </div>
  );
}

// 가벼운 SVG 라인 차트 — 예측 잔액 + 안전선(점선).
function ForecastChart({ data }: { data: CashDailySummary }) {
  const W = 720;
  const H = 220;
  const pad = 36;
  const pts = data.forecast.map((f) => Number(String(f.balance).replace(/[^0-9.-]/g, '')) || 0);
  if (pts.length === 0) return <p className="muted">예측 데이터 없음</p>;

  const safety = Number(String(data.safetyLine).replace(/[^0-9.-]/g, '')) || 0;
  const min = Math.min(...pts, safety);
  const max = Math.max(...pts, safety);
  const range = max - min || 1;
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(pts.length - 1, 1);
  const y = (v: number) => H - pad - ((v - min) / range) * (H - pad * 2);

  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const area = `${line} L${x(pts.length - 1)},${H - pad} L${x(0)},${H - pad} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="현금흐름 예측 차트">
      <defs>
        <linearGradient id="cfArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(37,99,235,0.18)" />
          <stop offset="100%" stopColor="rgba(37,99,235,0)" />
        </linearGradient>
      </defs>
      {/* 안전선 */}
      <line x1={pad} x2={W - pad} y1={y(safety)} y2={y(safety)} stroke="var(--rejected)" strokeDasharray="5 5" />
      <text x={W - pad} y={y(safety) - 6} textAnchor="end" fontSize="11" fill="var(--rejected)">
        안전선 {data.safetyLine}
      </text>
      <path d={area} fill="url(#cfArea)" />
      <path d={line} fill="none" stroke="var(--calc)" strokeWidth="2" />
      {/* 안전선 하회 지점 강조 */}
      {pts.map((v, i) =>
        v < safety ? <circle key={i} cx={x(i)} cy={y(v)} r="4" fill="var(--rejected)" /> : null,
      )}
    </svg>
  );
}
