import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getPayrollSummary } from '../lib/api';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { CalcBadge } from '../components/StatusBadge';

// 급여·4대보험(슬라이스). 4대보험·실수령액은 모두 CRO 코드가 요율로 계산한 값.
// 이상징후의 해석은 AI 리포트에서 다룬다.
export function Payroll() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const period = sp.get('period') ?? undefined;

  const q = useQuery({
    queryKey: ['payroll', period],
    queryFn: () => getPayrollSummary(period),
  });

  if (q.isLoading) return <LoadingState label="급여·4대보험을 계산 중…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const d = q.data;
  if (!d || d.headcount === 0 || d.employees.length === 0) {
    return (
      <div className="page">
        <div className="card">
          <EmptyState
            emoji="₩"
            title="아직 급여 데이터가 없습니다"
            description="급여대장을 업로드하면 4대보험·소득세·실수령액이 코드로 계산됩니다."
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

  return (
    <div className="page">
      {/* ── KPI row ─────────────────────────────────────────── */}
      <div
        className="grid-3"
        style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}
      >
        <KpiCard label="인원수" value={`${d.headcount.toLocaleString('ko-KR')}명`} raw />
        <KpiCard label="총지급액" value={formatWon(d.grossTotal)} />
        <KpiCard label="총실지급" value={formatWon(d.netpayTotal)} />
        <KpiCard label="회사부담 4대보험" value={formatWon(d.employerTotal)} />
        <KpiCard label="총 인건비" value={formatWon(d.laborCostTotal)} />
      </div>

      {/* ── 계산 근거 안내 한 줄 ───────────────────────────── */}
      <p className="muted" style={{ fontSize: 12, margin: '2px 2px 0' }}>
        4대보험(근로자·회사부담)·실수령액·총 인건비는 코드가 요율로 계산합니다. <b style={{ color: 'var(--text-2)' }}>소득세는 홈택스 간이세액표 조회값(또는 급여SW 산출값)을 입력</b>하며, 미입력 시 실수령 정확도가 제한됩니다. 이상징후 해석은 AI 리포트에서 확인하세요.
      </p>

      {/* ── 4대보험 / 이상 경보 ─────────────────────────────── */}
      {d.alerts.length > 0 && (
        <section className="section">
          <div className="section-head">
            <div className="head-left">
              <h2>4대보험 · 이상 경보</h2>
              <CalcBadge />
            </div>
            <span className="meta">{d.alerts.length}건</span>
          </div>
          <div>
            {d.alerts.map((a) => {
              const crit = a.severity === 'high';
              return (
                <div key={a.id} className={`alert-row ${crit ? 'critical' : 'warn'}`}>
                  <span className={`alert-sev ${crit ? 'critical' : 'warn'}`}>
                    {crit ? '위험' : '주의'}
                  </span>
                  <div className="alert-body">
                    <div className="alert-title">{a.title}</div>
                    {a.amount && (
                      <div className="alert-detail tnum">{formatWon(a.amount)}</div>
                    )}
                  </div>
                  <div className="alert-right">
                    <button className="btn btn-sm">근거 데이터 →</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 직원별 급여명세 ─────────────────────────────────── */}
      <section className="section">
        <div className="section-head">
          <div className="head-left">
            <h2>직원별 급여명세</h2>
            <CalcBadge />
          </div>
          <span className="meta">{d.employees.length.toLocaleString('ko-KR')}명</span>
        </div>
        <table className="data-table tnum">
          <thead>
            <tr>
              <th>사번</th>
              <th>이름</th>
              <th>부서</th>
              <th className="num">총지급</th>
              <th className="num">과세소득</th>
              <th className="num">4대보험</th>
              <th className="num">소득세</th>
              <th className="num">실수령</th>
              <th className="num" style={{ color: 'var(--ai)' }}>회사부담</th>
              <th className="num" style={{ color: 'var(--ai)' }}>총 인건비</th>
            </tr>
          </thead>
          <tbody>
            {d.employees.map((e) => (
              <tr key={e.empId}>
                <td className="t-code">{e.empId}</td>
                <td>{e.name}</td>
                <td>{e.dept}</td>
                <td className="num">{formatNum(e.gross)}</td>
                <td className="num muted">{formatNum(e.taxable)}</td>
                <td className="num t-neg">{formatNum(e.insuranceTotal)}</td>
                <td className="num t-neg">{isZero(e.incomeTax) ? '—' : formatNum(e.incomeTax)}</td>
                <td className="num" style={{ fontWeight: 600 }}>
                  {formatNum(e.netpay)}
                </td>
                <td className="num" style={{ color: 'var(--text-3)' }}>{formatNum(e.employerTotal)}</td>
                <td className="num" style={{ fontWeight: 600 }}>{formatNum(e.laborCost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--surface)' }}>
              <td colSpan={3}>합계 · {d.headcount.toLocaleString('ko-KR')}명</td>
              <td className="num">{formatNum(d.grossTotal)}</td>
              <td className="num muted">—</td>
              <td className="num t-neg">{formatNum(d.insuranceTotal)}</td>
              <td className="num t-neg">{formatNum(d.incomeTaxTotal)}</td>
              <td className="num">{formatNum(d.netpayTotal)}</td>
              <td className="num">{formatNum(d.employerTotal)}</td>
              <td className="num">{formatNum(d.laborCostTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}

// ── KPI 카드 ────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  tone,
  raw,
}: {
  label: string;
  value: string;
  tone?: 'neg' | 'pos';
  raw?: boolean;
}) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <CalcBadge />
      </div>
      <div className={`kpi-value sm${tone ? ` ${tone}` : ''}`} style={raw ? { fontVariantNumeric: 'tabular-nums' } : undefined}>
        {value}
      </div>
    </div>
  );
}

// ── 숫자 유틸(CashDaily와 동일) ─────────────────────────────
function toNumber(s: string | undefined): number {
  return Number(String(s ?? '').replace(/[^0-9.-]/g, '')) || 0;
}
function formatNum(s: string | undefined): string {
  return toNumber(s).toLocaleString('ko-KR');
}
function isZero(s: string | undefined): boolean {
  return toNumber(s) === 0;
}
function formatWon(s: string | undefined): string {
  const n = toNumber(s);
  return `${n < 0 ? '−' : ''}₩${Math.abs(n).toLocaleString('ko-KR')}`;
}
