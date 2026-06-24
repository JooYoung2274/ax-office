import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  listTemplates,
  uploadFile,
  getMappingCandidates,
  confirmMapping,
  getBatchStatus,
  getValidation,
  generateReport,
} from '../lib/api';
import type {
  Domain,
  Batch,
  MappingCandidate,
  ValidationResponse,
  ValidationFinding,
} from '../lib/types';
import { LoadingState, EmptyState, ErrorState } from '../components/States';

// 업로드 마법사(§2.3b, §2.5): 템플릿 → 파일 업로드 → 컬럼 매핑·검증(FATAL 게이트).
// 데이터 배선은 그대로, 디자인 목업(UploadScreen.dc.html) 구조로 재스타일.

type StepNum = 1 | 2 | 3;

const DOMAINS: { key: Domain; label: string; desc: string }[] = [
  { key: 'cashflow', label: '자금일보 / 현금흐름', desc: '은행거래내역 · 예정 입출금' },
  { key: 'monthly_close', label: '월 결산', desc: '시산표 · 전표 · 보조원장' },
];

// 자동 매핑 신뢰도 임계값 — 미만이면 "자동 매핑(확인)" 경고.
const CONFIRM_THRESHOLD = 0.85;

// ───── SVG 아이콘(인라인, JSX-safe) ─────
function IcCheck({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
function IcWarnTri({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}
function IcShield({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function IcAlertCircle({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <path d="M12 8v5M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
function IcUpload({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
    </svg>
  );
}
function IcLock({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function IcInfo({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

// ───── 3단계 인디케이터 ─────
function Steps({ step }: { step: StepNum }) {
  const labels = ['템플릿 다운로드', '파일 업로드', '컬럼 매핑 · 검증'];
  return (
    <div className="steps">
      {labels.map((l, i) => {
        const n = (i + 1) as StepNum;
        const cls = n < step ? 'done' : n === step ? 'active' : 'todo';
        return (
          <div key={l} style={{ display: 'contents' }}>
            <div className={`step ${cls}`}>
              <span className="num">{n < step ? <IcCheck /> : n}</span>
              <span>{`${'①②③'[i]} ${l}`}</span>
            </div>
            {i < labels.length - 1 && <span className="step-line" />}
          </div>
        );
      })}
    </div>
  );
}

export function UploadWizard() {
  const [step, setStep] = useState<StepNum>(1);
  const [domain, setDomain] = useState<Domain>('cashflow');
  const [templateKey, setTemplateKey] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // 업로드 기간: 자금일보(cashflow)는 일자(YYYY-MM-DD), 월결산은 월(YYYY-MM).
  // 동일 기간의 여러 파일(계좌·거래·스케줄)이 하나의 CRO로 집계되도록 고정.
  const period = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return domain === 'monthly_close' ? today.slice(0, 7) : today;
  }, [domain]);

  return (
    <div className="page">
      <Steps step={step} />

      {step === 1 && (
        <Step1Template
          domain={domain}
          setDomain={setDomain}
          templateKey={templateKey}
          setTemplateKey={setTemplateKey}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <Step2Upload
          domain={domain}
          templateKey={templateKey}
          period={period}
          file={file}
          setFile={setFile}
          batch={batch}
          setBatch={setBatch}
          mapping={mapping}
          setMapping={setMapping}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && batch && (
        <Step3Validation
          batch={batch}
          mapping={mapping}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  );
}

// ───── Step 1: 분석 종류 선택 · 템플릿 다운로드 ─────
function Step1Template({
  domain,
  setDomain,
  templateKey,
  setTemplateKey,
  onNext,
}: {
  domain: Domain;
  setDomain: (d: Domain) => void;
  templateKey: string;
  setTemplateKey: (k: string) => void;
  onNext: () => void;
}) {
  const q = useQuery({ queryKey: ['templates', domain], queryFn: () => listTemplates(domain) });
  const templates = q.data ?? [];
  const template = templates.find((t) => t.templateId === templateKey) ?? templates[0];

  // 템플릿 목록 로드/도메인 변경 시 선택값 보정(목록 밖이면 첫 항목으로).
  useEffect(() => {
    if (templates.length === 0) return;
    if (!templates.some((t) => t.templateId === templateKey)) {
      setTemplateKey(templates[0]!.templateId);
    }
  }, [templates, templateKey, setTemplateKey]);

  return (
    <section className="section">
      <div className="section-head">
        <div className="head-left">
          <h2>① 분석 종류 선택 · 표준 템플릿 다운로드</h2>
        </div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="grid-2">
          {DOMAINS.map((d) => (
            <label
              key={d.key}
              className="card"
              style={{
                cursor: 'pointer',
                padding: '13px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                borderColor: domain === d.key ? 'var(--indigo)' : undefined,
                boxShadow: domain === d.key ? '0 0 0 3px var(--indigo-bg)' : undefined,
              }}
            >
              <input
                type="radio"
                name="domain"
                checked={domain === d.key}
                onChange={() => setDomain(d.key)}
              />
              <div>
                <div style={{ fontWeight: 700 }}>{d.label}</div>
                <div className="muted" style={{ fontSize: 12 }}>{d.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {templates.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {templates.map((t) => {
              const on = t.templateId === template?.templateId;
              return (
                <button
                  key={t.templateId}
                  type="button"
                  className={`btn btn-sm${on ? ' btn-primary' : ''}`}
                  onClick={() => setTemplateKey(t.templateId)}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="section" style={{ background: 'var(--surface)' }}>
          <div className="section-head">
            <div className="head-left">
              <h2 style={{ fontSize: 13 }}>{template ? `표준 템플릿 · ${template.label}` : '표준 템플릿'}</h2>
              <span className="cro-chip">
                <IcShield />
                CRO 표준 스키마
              </span>
            </div>
            {template && (
              <button className="btn btn-sm">
                <IcUpload size={13} />
                표준 엑셀 템플릿 다운로드
              </button>
            )}
          </div>
          {q.isLoading ? (
            <div style={{ padding: 16 }}>
              <LoadingState label="템플릿 목록을 불러오는 중…" />
            </div>
          ) : q.isError ? (
            <p className="muted" style={{ padding: 16 }}>
              템플릿 목록을 불러오지 못했습니다. 기존 사내 양식을 그대로 업로드할 수도 있습니다.
            </p>
          ) : template && template.requiredColumns.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>표준 필드</th>
                  <th>라벨</th>
                  <th>필수</th>
                  <th>예시</th>
                </tr>
              </thead>
              <tbody>
                {template.requiredColumns.map((c) => (
                  <tr key={c.field}>
                    <td className="t-code">{c.field}</td>
                    <td>{c.label}</td>
                    <td>
                      {c.required ? (
                        <span className="tag tag-red">필수</span>
                      ) : (
                        <span className="tag tag-gray">선택</span>
                      )}
                    </td>
                    <td className="muted">{c.example ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted" style={{ padding: 16 }}>
              템플릿 정보가 없습니다. 기존 사내 양식을 그대로 업로드하면 다음 단계에서 컬럼을 매핑할 수 있습니다.
            </p>
          )}
        </div>
      </div>

      <div className="action-bar" style={{ position: 'static', borderTop: '1px solid var(--border-soft)' }}>
        <span className="muted" style={{ fontSize: 12 }}>분석 종류와 템플릿을 확인했으면 다음 단계로 진행하세요.</span>
        <button className="btn btn-primary" onClick={onNext}>
          다음 · 파일 업로드 →
        </button>
      </div>
    </section>
  );
}

// ───── Step 2: 파일 업로드 ─────
function Step2Upload({
  domain,
  templateKey,
  period,
  file,
  setFile,
  batch,
  setBatch,
  mapping,
  setMapping,
  onBack,
  onNext,
}: {
  domain: Domain;
  templateKey: string;
  period: string;
  file: File | null;
  setFile: (f: File | null) => void;
  batch: Batch | null;
  setBatch: (b: Batch) => void;
  mapping: Record<string, string>;
  setMapping: (m: Record<string, string>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [progress, setProgress] = useState(0);

  const upload = useMutation({
    mutationFn: (f: File) => uploadFile(f, { templateKey, domain, period }, setProgress),
    onSuccess: (b) => setBatch(b),
  });

  // 배치 상태 폴링(파싱 진행 → MAPPED/CALCULATED 등).
  const status = useQuery({
    queryKey: ['batch-status', batch?.batchId],
    queryFn: () => getBatchStatus(batch!.batchId),
    enabled: !!batch,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'RECEIVED' || s === 'PARSING' ? 1500 : false;
    },
  });
  const liveBatch = status.data ?? batch;

  const candidates = useQuery({
    queryKey: ['mapping', batch?.batchId],
    queryFn: () => getMappingCandidates(batch!.batchId),
    enabled: !!batch,
  });

  const confirm = useMutation({
    mutationFn: () => confirmMapping(batch!.batchId, mapping),
    onSuccess: () => onNext(),
  });

  function startUpload(f: File) {
    setFile(f);
    upload.mutate(f);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) startUpload(f);
  }

  const unmappedRequired = useMemo(
    () =>
      (candidates.data ?? []).filter(
        (c) => c.required && !(mapping[c.sourceColumn] ?? c.suggestedField),
      ),
    [candidates.data, mapping],
  );

  return (
    <>
      <section className="section">
        <div className="section-head">
          <div className="head-left">
            <h2>② 파일 업로드</h2>
          </div>
          {liveBatch && (
            <span className="meta">
              배치 {liveBatch.batchId} · {liveBatch.status}
              {liveBatch.detectedSheets?.length ? ` · 시트 ${liveBatch.detectedSheets.join(', ')}` : ''}
            </span>
          )}
        </div>
        <div style={{ padding: 16 }}>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            style={{
              border: `1.5px dashed ${file ? 'var(--confirm-border)' : 'var(--input-border)'}`,
              borderRadius: 'var(--radius)',
              background: file ? 'var(--confirm-bg)' : '#fafbfd',
              padding: '28px 18px',
              textAlign: 'center',
            }}
          >
            {file ? (
              <>
                <div style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--confirm-strong)' }}>
                  <IcCheck size={16} /> {file.name}
                </div>
                <div className="muted tnum" style={{ marginTop: 4 }}>{(file.size / 1024).toFixed(0)} KB</div>
                {upload.isPending && (
                  <div className="muted tnum" style={{ marginTop: 6 }}>업로드 중… {progress}%</div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 26, color: 'var(--faint)' }}>
                  <IcUpload size={30} />
                </div>
                <div style={{ fontWeight: 600, marginTop: 8 }}>여기에 엑셀/CSV 파일을 끌어다 놓으세요</div>
                <div style={{ marginTop: 10 }}>
                  <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
                    파일 선택
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) startUpload(f);
                      }}
                    />
                  </label>
                </div>
              </>
            )}
          </div>
          {upload.isError && <div style={{ marginTop: 12 }}><ErrorState error={upload.error} /></div>}
        </div>
      </section>

      {/* 컬럼 매핑 */}
      {batch && (
        <section className="section">
          <div className="section-head">
            <div className="head-left">
              <h2>컬럼 매핑</h2>
            </div>
            {unmappedRequired.length > 0 ? (
              <span className="tag tag-red">미매핑 필수 {unmappedRequired.length}</span>
            ) : (
              <span className="meta">
                {(candidates.data?.length ?? 0)}개 컬럼
              </span>
            )}
          </div>
          {candidates.isLoading ? (
            <div style={{ padding: 16 }}>
              <LoadingState label="매핑 후보를 분석 중…" />
            </div>
          ) : candidates.isError ? (
            <div style={{ padding: 16 }}>
              <ErrorState error={candidates.error} onRetry={() => candidates.refetch()} />
            </div>
          ) : candidates.data ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>소스 컬럼</th>
                  <th>표준 필드</th>
                  <th>신뢰도</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {candidates.data.map((c) => (
                  <MappingRow
                    key={c.sourceColumn}
                    c={c}
                    value={mapping[c.sourceColumn] ?? c.suggestedField ?? ''}
                    onChange={(v) => setMapping({ ...mapping, [c.sourceColumn]: v })}
                  />
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      )}

      <div className="action-bar">
        <button className="btn" onClick={onBack}>← 이전 단계</button>
        <div className="grp">
          <button
            className="btn btn-primary"
            disabled={!batch || unmappedRequired.length > 0 || confirm.isPending}
            onClick={() => confirm.mutate()}
          >
            <IcShield size={14} />
            {confirm.isPending ? '계산 · 검증 실행 중…' : '매핑 확정 · 검증 실행 →'}
          </button>
        </div>
      </div>
    </>
  );
}

function MappingRow({
  c,
  value,
  onChange,
}: {
  c: MappingCandidate;
  value: string;
  onChange: (v: string) => void;
}) {
  const missing = c.required && !value;
  const lowConfidence = !!value && c.confidence < CONFIRM_THRESHOLD;
  return (
    <tr style={lowConfidence ? { background: '#fffdf8' } : undefined}>
      <td>{c.sourceColumn}</td>
      <td>
        <input
          value={value}
          placeholder="표준 필드"
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            padding: '4px 8px',
            border: '1px solid var(--input-border)',
            borderRadius: 6,
            fontFamily: 'inherit',
            fontSize: 12.5,
            color: 'var(--indigo)',
            fontWeight: 500,
          }}
        />
      </td>
      <td className="num tnum muted">{(c.confidence * 100).toFixed(0)}%</td>
      <td>
        {missing ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--danger-text)', fontWeight: 600 }}>
            <IcWarnTri />
            미매핑 (필수)
          </span>
        ) : lowConfidence ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--warn-text)', fontWeight: 600 }}>
            <IcWarnTri />
            자동 매핑 (확인)
          </span>
        ) : (
          <span style={{ color: 'var(--confirm)', fontWeight: 600 }}>매핑됨</span>
        )}
      </td>
    </tr>
  );
}

// ───── Step 3: 컬럼 매핑·검증 결과 + FATAL 게이트 ─────
function Step3Validation({
  batch,
  mapping,
  onBack,
}: {
  batch: Batch;
  mapping: Record<string, string>;
  onBack: () => void;
}) {
  const candidates = useQuery({
    queryKey: ['mapping', batch.batchId],
    queryFn: () => getMappingCandidates(batch.batchId),
  });

  const q = useQuery({
    queryKey: ['validation', batch.batchId],
    queryFn: () => getValidation(batch.batchId),
  });

  const gen = useMutation({ mutationFn: () => generateReport(batch.batchId) });

  if (q.isLoading) {
    return <LoadingState label="검증 결과를 불러오는 중…" />;
  }
  if (q.isError) {
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  }

  const v: ValidationResponse | undefined = q.data;
  if (!v) {
    return (
      <EmptyState title="검증 결과가 아직 없습니다" description="계산·검증 잡이 완료되면 표시됩니다." />
    );
  }

  // FATAL 게이트: FATAL 존재 시 AI 리포트 생성 차단(버튼 비활성 + 사유).
  const blocked = v.blockedAI || v.fatalCount > 0;
  const passCount = Math.max(0, (batch.rowCount ?? 0) - v.fatalCount - v.warnCount);

  return (
    <>
      <div className="grid-2">
        {/* 컬럼 매핑 */}
        <section className="section">
          <div className="section-head">
            <div className="head-left">
              <h2>컬럼 매핑</h2>
            </div>
            <span className="meta">
              {(candidates.data?.length ?? 0)}개 컬럼
              {batch.rowCount != null ? ` · ${batch.rowCount.toLocaleString()} 행` : ''}
            </span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>소스 컬럼</th>
                <th>표준 필드</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {(candidates.data ?? []).map((c) => {
                const field = mapping[c.sourceColumn] ?? c.suggestedField ?? '';
                const lowConfidence = !!field && c.confidence < CONFIRM_THRESHOLD;
                return (
                  <tr key={c.sourceColumn} style={lowConfidence ? { background: '#fffdf8' } : undefined}>
                    <td>{c.sourceColumn}</td>
                    <td style={{ color: 'var(--indigo)', fontWeight: 500 }}>{field || '—'}</td>
                    <td>
                      {lowConfidence ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--warn-text)', fontWeight: 600 }}>
                          <IcWarnTri />
                          자동 매핑 (확인)
                        </span>
                      ) : (
                        <span style={{ color: 'var(--confirm)', fontWeight: 600 }}>매핑됨</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* 검증 결과 요약 */}
        <section className="section">
          <div className="section-head">
            <div className="head-left">
              <h2>검증 결과</h2>
              <span className="cro-chip">
                <IcShield />
                CRO 결정론적 검증
              </span>
            </div>
          </div>
          <div className="grid-3" style={{ gap: 1, background: 'var(--border-soft)' }}>
            <CountCell label="통과" value={passCount} color="var(--confirm)" />
            <CountCell label="경고" value={v.warnCount} color="var(--warn-text)" />
            <CountCell label="치명(FATAL)" value={v.fatalCount} color="var(--danger-text)" />
          </div>
        </section>
      </div>

      {/* BLOCK PANEL — 검증 차단 게이트(FATAL 존재 시) */}
      {blocked && <BlockPanel v={v} />}

      {/* WARN만 있는 경우 검토 후 진행 가능 안내 */}
      {!blocked && v.warnCount > 0 && (
        <section className="section">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 18px', background: '#fffdf8' }}>
            <span style={{ color: 'var(--warn)', marginTop: 1 }}>
              <IcWarnTri size={18} />
            </span>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--warn-text)' }}>경고 {v.warnCount}건 — 검토 후 진행 가능</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                "경고를 무시하고 진행했음"이 감사 로그에 기록됩니다.
              </div>
            </div>
          </div>
        </section>
      )}

      {/* sticky action bar */}
      <div className="action-bar">
        <button className="btn" onClick={onBack}>← 이전 단계</button>
        <div className="grp">
          <button className="btn btn-primary" onClick={onBack}>
            <IcUpload size={15} />
            문제 행 수정 후 재업로드
          </button>
          {blocked ? (
            <div className="btn-stack">
              <span
                className="tip"
                data-tip="결정론적 검증(FATAL)을 통과해야 AI 리포트를 생성할 수 있습니다."
              >
                <button className="btn" disabled>
                  <IcLock />
                  AI 리포트 생성
                </button>
              </span>
              <span className="btn-note">
                <IcInfo />
                검증 실패로 비활성 — FATAL {v.fatalCount}건 해결 필요
              </span>
            </div>
          ) : (
            <button className="btn btn-primary" disabled={gen.isPending} onClick={() => gen.mutate()}>
              <IcShield size={15} />
              {gen.isPending ? 'Draft 생성 중…' : 'AI 리포트 생성 (Draft) ▶'}
            </button>
          )}
        </div>
      </div>

      {gen.isSuccess && (
        <section className="section">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 18px', background: 'var(--confirm-bg)' }}>
            <span style={{ color: 'var(--confirm)' }}><IcCheck size={18} /></span>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--confirm-strong)' }}>Draft 리포트 생성을 시작했습니다</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                리포트 화면에서 생성 진행 상황과 근거를 확인하세요.
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function CountCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', padding: '13px 14px' }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{label}</div>
      <div className="tnum" style={{ marginTop: 4, fontSize: 21, fontWeight: 700, color }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

// 잔액 불일치 금액 파싱 헬퍼 — 숫자만 추출.
function parseAmount(s?: string): number | null {
  if (s == null) return null;
  const cleaned = s.replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function BlockPanel({ v }: { v: ValidationResponse }) {
  // 차변≠대변 figures: 잔액 불일치 규칙(BALANCE)의 expected/actual에서 추출.
  const balanceFinding = v.findings.find(
    (f) => f.severity === 'FATAL' && /balance|debit|credit|차대|대차/i.test(`${f.ruleId} ${f.message}`),
  );
  const debit = parseAmount(balanceFinding?.expected);
  const credit = parseAmount(balanceFinding?.actual);
  const diff = debit != null && credit != null ? Math.abs(debit - credit) : null;
  const fmt = (n: number) => `₩${n.toLocaleString()}`;

  // 문제 행: FATAL/WARN finding 우선.
  const problemRows = v.findings.filter((f) => f.severity === 'FATAL' || f.severity === 'WARN');

  return (
    <section className="block-panel">
      <div className="block-head">
        <span className="block-icon">
          <IcAlertCircle />
        </span>
        <div style={{ flex: 1 }}>
          <h2>검증 실패 — AI 리포트 생성이 차단되었습니다</h2>
          <p>
            결정론적 검증을 통과하지 못한 데이터로는 AI 분석을 진행하지 않습니다.
            {balanceFinding ? ' 차변 합계와 대변 합계가 일치하지 않습니다.' : ''} 문제 행을 수정한 뒤 재업로드해 주세요.
            (버튼 비활성 + 서버 API 거부의 이중 차단)
          </p>
        </div>
      </div>

      {/* 차변 ≠ 대변 figures (실제 finding 기반) */}
      {balanceFinding && debit != null && credit != null && (
        <div className="block-figures">
          <div className="fig">
            <div className="l">차변 합계</div>
            <div className="v">{fmt(debit)}</div>
          </div>
          <div style={{ color: '#c4ccd8', fontSize: 18 }}>≠</div>
          <div className="fig">
            <div className="l">대변 합계</div>
            <div className="v">{fmt(credit)}</div>
          </div>
          {diff != null && (
            <>
              <div style={{ width: 1, height: 30, background: 'var(--border)' }} />
              <div className="fig">
                <div className="l">불일치 금액</div>
                <div className="v t-neg">{fmt(diff)}</div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 문제 행 테이블 */}
      {problemRows.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>심각도</th>
              <th>규칙</th>
              <th>위치</th>
              <th>문제</th>
              <th className="num">기대 / 실제</th>
            </tr>
          </thead>
          <tbody>
            {problemRows.map((f, i) => (
              <ProblemRow key={`${f.ruleId}-${i}`} f={f} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ProblemRow({ f }: { f: ValidationFinding }) {
  const isFatal = f.severity === 'FATAL';
  const loc = f.cellRef ?? (f.rowIndex != null ? `행 ${f.rowIndex.toLocaleString()}` : '—');
  return (
    <tr>
      <td>
        {isFatal ? (
          <span style={{ color: 'var(--danger-text)', fontWeight: 700 }}>FATAL</span>
        ) : (
          <span style={{ color: 'var(--warn-text)', fontWeight: 700 }}>WARN</span>
        )}
      </td>
      <td className="t-code">{f.ruleId}</td>
      <td className="t-code tnum">{loc}</td>
      <td style={{ color: '#7c5050' }}>{f.message}</td>
      <td className="num tnum muted">
        {f.expected != null || f.actual != null
          ? `${f.expected ?? '—'} / ${f.actual ?? '—'}`
          : '—'}
      </td>
    </tr>
  );
}
