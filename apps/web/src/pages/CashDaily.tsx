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
      <div className="page">
        <div className="card">
          <EmptyState
            emoji="₩"
            title="아직 자금 데이터가 없습니다"
            description="은행거래내역·예정 입출금을 업로드하면 현금흐름 예측과 유동성 경보가 계산됩니다."
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

  const horizon = d.forecast.length;

  return (
    <div className="page">
      {/* ── KPI row ─────────────────────────────────────────── */}
      <div className="grid-3">
        {d.kpis.slice(0, 3).map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-top">
              <span className="kpi-label">{k.label}</span>
              <CalcBadge />
            </div>
            <div className={`kpi-value sm${kpiTone(k.value)}`}>{formatWon(k.value)}</div>
            {k.unit && (
              <div className={`kpi-sub${/하회|경보|위험/.test(k.unit) ? ' warn' : ''}`}>
                {k.unit}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── 현금흐름 예측 차트 ──────────────────────────────── */}
      <section className="section">
        <div className="section-head">
          <div className="head-left">
            <h2>현금흐름 예측 · 향후 {horizon || 0}일 잔액</h2>
            <CalcBadge label="예측모델" />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              fontSize: 11.5,
              color: 'var(--text-3)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{ width: 14, height: 2.5, background: 'var(--indigo)', borderRadius: 2 }}
              />
              예측 잔액
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 0, borderTop: '2px dashed var(--confirm)' }} />
              안전선 {formatWon(d.safetyLine)}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 12,
                  height: 10,
                  background: 'rgba(220,38,38,0.12)',
                  border: '1px solid #e7b4b4',
                  borderRadius: 2,
                }}
              />
              하회 구간
            </span>
          </div>
        </div>
        <div style={{ padding: '14px 12px 8px' }}>
          <ForecastChart forecast={d.forecast} safetyLine={d.safetyLine} />
        </div>
      </section>

      {/* ── 유동성 경보 ─────────────────────────────────────── */}
      {d.alerts.length > 0 && (
        <section className="section">
          <div className="section-head">
            <div className="head-left">
              <h2>유동성 경보</h2>
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
                    <div className="alert-title">
                      {a.occursOn && `${a.occursOn} · `}
                      {a.title}
                    </div>
                    <div className="alert-detail">{a.detail}</div>
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

      {/* ── 일자별 거래 내역 ────────────────────────────────── */}
      <section className="section">
        <div className="section-head">
          <h2>일자별 거래 내역</h2>
          <span className="meta">최근 {d.dailyRows.length}영업일</span>
        </div>
        {d.dailyRows.length === 0 ? (
          <div style={{ padding: 16 }}>
            <p className="muted" style={{ margin: 0 }}>
              거래 내역이 없습니다.
            </p>
          </div>
        ) : (
          <table className="data-table tnum">
            <thead>
              <tr>
                <th>일자</th>
                <th>적요</th>
                <th className="num">입금</th>
                <th className="num">출금</th>
                <th className="num">잔액</th>
              </tr>
            </thead>
            <tbody>
              {d.dailyRows.map((r, i) => (
                <tr key={`${r.date}-${i}`}>
                  <td>{shortDate(r.date)}</td>
                  <td>{r.description ?? r.flag ?? '—'}</td>
                  <td className={`num ${isZero(r.deposit) ? 't-dash' : 't-pos'}`}>
                    {isZero(r.deposit) ? '—' : formatNum(r.deposit)}
                  </td>
                  <td className={`num ${isZero(r.withdrawal) ? 't-dash' : 't-neg'}`}>
                    {isZero(r.withdrawal) ? '—' : formatNum(r.withdrawal)}
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {formatNum(r.cumulative)}
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

// ── 숫자 유틸 ───────────────────────────────────────────────
function toNumber(s: string | undefined): number {
  return Number(String(s ?? '').replace(/[^0-9.-]/g, '')) || 0;
}
function isZero(s: string | undefined): boolean {
  return toNumber(s) === 0;
}
function formatNum(s: string | undefined): string {
  return toNumber(s).toLocaleString('ko-KR');
}
function formatWon(s: string | undefined): string {
  const n = toNumber(s);
  return `${n < 0 ? '−' : ''}₩${Math.abs(n).toLocaleString('ko-KR')}`;
}
// KPI 값 문자열의 부호로 색조(.pos/.neg) 결정.
function kpiTone(value: string): string {
  const t = String(value);
  if (/^[−-]/.test(t.trim()) || toNumber(t) < 0) return ' neg';
  if (/^\+/.test(t.trim())) return ' pos';
  return '';
}

// ── 현금흐름 예측 SVG (목업 <script> 로직을 React로 재현) ──
// 실제 forecast 시리즈로 area/line/안전선/하회 밴드/최저잔액 마커·축 라벨을 계산.
function ForecastChart({
  forecast,
  safetyLine,
}: {
  forecast: CashDailySummary['forecast'];
  safetyLine: string;
}) {
  if (forecast.length === 0) {
    return (
      <p className="muted" style={{ padding: '24px 4px', textAlign: 'center', margin: 0 }}>
        예측 데이터 없음
      </p>
    );
  }

  // viewBox 좌표계 (목업과 동일).
  const x0 = 60;
  const x1 = 980;
  const yTop = 20;
  const yBot = 230;

  const vals = forecast.map((f) => toNumber(f.balance));
  const sv = toNumber(safetyLine);

  // y 범위: 데이터 + 안전선 + 0 을 포함, 위아래 약간의 패딩.
  const lo = Math.min(...vals, sv, 0);
  const hi = Math.max(...vals, sv, 0);
  const span = hi - lo || 1;
  const yMin = lo - span * 0.1;
  const yMax = hi + span * 0.1;

  const n = vals.length;
  const xAt = (i: number) => x0 + (i * (x1 - x0)) / Math.max(n - 1, 1);
  const yAt = (v: number) => yBot - ((v - yMin) / (yMax - yMin)) * (yBot - yTop);

  const pts = vals.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const linePath = pts
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath =
    `M${pts[0].x.toFixed(1)} ${yBot} ` +
    pts.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
    ` L${pts[n - 1].x.toFixed(1)} ${yBot} Z`;

  // 최저 잔액 마커.
  let mi = 0;
  vals.forEach((v, i) => {
    if (v < vals[mi]) mi = i;
  });
  const minX = pts[mi].x;
  const minY = pts[mi].y;
  const minLabelY = Math.min(minY + 18, yBot - 4);

  // 안전선 하회 구간 밴드 (잔액 < 안전선인 구간을 교차점 보간으로 산출).
  const crossX = (i: number, j: number) => {
    const a = vals[i];
    const b = vals[j];
    if (a === b) return xAt(i);
    const f = (a - sv) / (a - b);
    return xAt(i) + f * (xAt(j) - xAt(i));
  };
  type Band = { x: number; w: number };
  const bands: Band[] = [];
  let bandStart: number | null = vals[0] < sv ? x0 : null;
  for (let i = 0; i < n - 1; i++) {
    const down = vals[i] >= sv && vals[i + 1] < sv;
    const up = vals[i] < sv && vals[i + 1] >= sv;
    if (down) bandStart = crossX(i, i + 1);
    if (up && bandStart !== null) {
      const end = crossX(i, i + 1);
      bands.push({ x: bandStart, w: end - bandStart });
      bandStart = null;
    }
  }
  if (bandStart !== null) bands.push({ x: bandStart, w: x1 - bandStart });

  const safetyY = yAt(sv);

  // 가로 그리드 3선 + y축 라벨 (yMax · 중간 · yMin 근처).
  const gridVals = [yMax - (yMax - yMin) * 0.0, (yMax + yMin) / 2, yMin];
  const baseY = yAt(0); // 0 기준선

  // x축 라벨: 시작/중간/끝 등 최대 5개를 균등 추출.
  const labelIdx = pickLabelIndices(n, 5);

  return (
    <svg
      viewBox="0 0 1000 280"
      style={{ width: '100%', height: 'auto', display: 'block' }}
      preserveAspectRatio="none"
      role="img"
      aria-label="현금흐름 예측 차트"
    >
      {/* grid */}
      {gridVals.map((gv, i) => {
        const gy = yAt(gv);
        return <line key={i} x1={x0} y1={gy} x2={x1} y2={gy} stroke="#eef1f6" strokeWidth={1} />;
      })}
      {gridVals.map((gv, i) => {
        const gy = yAt(gv);
        return (
          <text
            key={`yl-${i}`}
            x={x0 - 8}
            y={gy + 4}
            textAnchor="end"
            fontSize={10}
            fill="#9aa7bd"
          >
            {compactWon(gv)}
          </text>
        );
      })}
      {/* 0 기준선 */}
      {baseY > yTop && baseY < yBot && (
        <line x1={x0} y1={baseY} x2={x1} y2={baseY} stroke="#dde3ec" strokeWidth={1} />
      )}

      {/* danger band(s) — 안전선 하회 구간 */}
      {bands.map((b, i) => (
        <rect
          key={`band-${i}`}
          x={b.x.toFixed(1)}
          y={yTop}
          width={Math.max(b.w, 0).toFixed(1)}
          height={yBot - yTop}
          fill="rgba(220,38,38,0.07)"
        />
      ))}

      {/* safety line */}
      <line
        x1={x0}
        y1={safetyY.toFixed(1)}
        x2={x1}
        y2={safetyY.toFixed(1)}
        stroke="#15803d"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />

      {/* area + line */}
      <path d={areaPath} fill="rgba(55,48,163,0.07)" />
      <path d={linePath} fill="none" stroke="#3730a3" strokeWidth={2.2} strokeLinejoin="round" />

      {/* min marker */}
      <circle cx={minX.toFixed(1)} cy={minY.toFixed(1)} r={4.5} fill="#dc2626" stroke="#fff" strokeWidth={2} />
      <text
        x={minX.toFixed(1)}
        y={minLabelY.toFixed(1)}
        textAnchor="middle"
        fontSize={10.5}
        fontWeight={700}
        fill="#b91c1c"
      >
        {compactWon(vals[mi])} · {shortDate(forecast[mi].date)}
      </text>

      {/* x labels */}
      {labelIdx.map((idx) => (
        <text
          key={`xl-${idx}`}
          x={xAt(idx).toFixed(1)}
          y={250}
          textAnchor="middle"
          fontSize={10}
          fill="#9aa7bd"
        >
          {shortDate(forecast[idx].date)}
        </text>
      ))}
    </svg>
  );
}

// n개 중 최대 max개의 균등 인덱스(시작·끝 포함).
function pickLabelIndices(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  for (let k = 0; k < max; k++) out.push(Math.round((k * (n - 1)) / (max - 1)));
  return Array.from(new Set(out));
}

// "2026-07-01" → "7/1", "06.24" → "6/24" 등 짧은 표기.
function shortDate(s: string): string {
  const m = String(s).match(/(\d{1,4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${Number(m[2])}/${Number(m[3])}`;
  const m2 = String(s).match(/(\d{1,2})[-./](\d{1,2})/);
  if (m2) return `${Number(m2[1])}/${Number(m2[2])}`;
  return s;
}

// 큰 금액을 억/만 단위로 축약(축 라벨·마커용). 한국 단위(억=1e8, 만=1e4).
function compactWon(n: number): string {
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (a === 0) return '0';
  if (a >= 1e8) return `${sign}${trim(a / 1e8)}억`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4).toLocaleString('ko-KR')}만`;
  return `${sign}${Math.round(a).toLocaleString('ko-KR')}`;
}
function trim(x: number): string {
  return (Math.round(x * 10) / 10).toString();
}
