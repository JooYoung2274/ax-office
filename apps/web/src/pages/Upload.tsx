import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  listTemplates,
  uploadFile,
  getMappingCandidates,
  confirmMapping,
  getValidation,
  generateReport,
} from '../lib/api';
import type { Domain, Batch, ValidationResponse } from '../lib/types';
import { EmptyState, ErrorState } from '../components/States';

// 업로드 마법사(§2.3b, §2.5): 템플릿 → 파일 업로드·매핑 → 검증결과(FATAL 게이트).

type StepNum = 1 | 2 | 3;

const DOMAINS: { key: Domain; label: string; desc: string }[] = [
  { key: 'cashflow', label: '자금일보 / 현금흐름', desc: '은행거래내역 · 예정 입출금' },
  { key: 'monthly_close', label: '월 결산', desc: '시산표 · 전표 · 보조원장' },
];

function Stepper({ step }: { step: StepNum }) {
  const labels = ['템플릿', '업로드 · 매핑', '검증 결과'];
  return (
    <div className="stepper">
      {labels.map((l, i) => {
        const n = (i + 1) as StepNum;
        const cls = n < step ? 'done' : n === step ? 'active' : '';
        return (
          <div key={l} style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`step ${cls}`}>
              <span className="n">{n < step ? '✓' : n}</span>
              {l}
            </div>
            {i < labels.length - 1 && <span className={`step-line ${n < step ? 'done' : ''}`} />}
          </div>
        );
      })}
    </div>
  );
}

export function UploadWizard() {
  const [step, setStep] = useState<StepNum>(1);
  const [domain, setDomain] = useState<Domain>('cashflow');
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  return (
    <>
      <div className="page-head">
        <div className="titles">
          <h1>업로드 마법사</h1>
          <span className="subtitle">엑셀/CSV 업로드 → 결정론 검증 → (통과 시) AI 리포트 생성</span>
        </div>
      </div>

      <Stepper step={step} />

      {step === 1 && (
        <Step1Template
          domain={domain}
          setDomain={setDomain}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <Step2Upload
          domain={domain}
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
      {step === 3 && batch && <Step3Validation batch={batch} onBack={() => setStep(2)} />}
    </>
  );
}

// ───── Step 1 ─────
function Step1Template({
  domain,
  setDomain,
  onNext,
}: {
  domain: Domain;
  setDomain: (d: Domain) => void;
  onNext: () => void;
}) {
  const q = useQuery({ queryKey: ['templates', domain], queryFn: () => listTemplates(domain) });

  return (
    <div className="card card-pad stack">
      <h2>1. 분석 종류 선택 · 템플릿 다운로드</h2>
      <div className="grid grid-2">
        {DOMAINS.map((d) => (
          <label
            key={d.key}
            className="card card-pad"
            style={{
              cursor: 'pointer',
              borderColor: domain === d.key ? 'var(--brand)' : undefined,
              boxShadow: domain === d.key ? '0 0 0 3px var(--brand-50)' : undefined,
            }}
          >
            <div className="row">
              <input
                type="radio"
                name="domain"
                checked={domain === d.key}
                onChange={() => setDomain(d.key)}
              />
              <div>
                <div style={{ fontWeight: 700 }}>{d.label}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{d.desc}</div>
              </div>
            </div>
          </label>
        ))}
      </div>

      <div className="card card-pad" style={{ background: 'var(--surface-2)' }}>
        <div className="card-title">
          <h3>표준 템플릿</h3>
          {q.data?.[0] && (
            <button className="btn btn-sm">표준 엑셀 템플릿 다운로드 ⬇</button>
          )}
        </div>
        {q.isError ? (
          <p className="muted">템플릿 목록을 불러오지 못했습니다. 기존 사내 양식을 그대로 업로드할 수도 있습니다.</p>
        ) : q.data && q.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>표준 필드</th>
                  <th>라벨</th>
                  <th>필수</th>
                  <th>예시</th>
                </tr>
              </thead>
              <tbody>
                {q.data[0].requiredColumns.map((c) => (
                  <tr key={c.field}>
                    <td className="mono">{c.field}</td>
                    <td>{c.label}</td>
                    <td>{c.required ? <span className="tag-fatal">필수</span> : <span className="dim">선택</span>}</td>
                    <td className="dim">{c.example ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            템플릿 정보가 없습니다. "기존 사내 양식 그대로 업로드"를 선택하면 다음 단계에서 컬럼을 매핑할 수 있습니다.
          </p>
        )}
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={onNext}>
          다음 · 파일 업로드 →
        </button>
      </div>
    </div>
  );
}

// ───── Step 2 ─────
function Step2Upload({
  domain,
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
    mutationFn: (f: File) => uploadFile(f, domain, setProgress),
    onSuccess: (b) => setBatch(b),
  });

  const candidates = useQuery({
    queryKey: ['mapping', batch?.batchId],
    queryFn: () => getMappingCandidates(batch!.batchId),
    enabled: !!batch,
  });

  const confirm = useMutation({
    mutationFn: () => confirmMapping(batch!.batchId, mapping),
    onSuccess: () => onNext(),
  });

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      upload.mutate(f);
    }
  }

  const unmappedRequired = useMemo(
    () => (candidates.data ?? []).filter((c) => c.required && !mapping[c.sourceColumn] && !c.suggestedField),
    [candidates.data, mapping],
  );

  return (
    <div className="stack">
      <div className="card card-pad">
        <h2>2. 파일 업로드</h2>
        <div
          className={`dropzone${file ? ' has-file' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          style={{ marginTop: 12 }}
        >
          {file ? (
            <>
              <div style={{ fontWeight: 700 }}>✓ {file.name}</div>
              <div className="muted">{(file.size / 1024).toFixed(0)} KB</div>
              {upload.isPending && (
                <div className="muted" style={{ marginTop: 6 }}>업로드 중… {progress}%</div>
              )}
              {batch && (
                <div className="muted" style={{ marginTop: 6 }}>
                  배치 {batch.batchId} · {batch.status}
                  {batch.detectedSheets?.length ? ` · 시트 ${batch.detectedSheets.join(', ')}` : ''}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="emoji" style={{ fontSize: 28 }}>📄</div>
              <div style={{ fontWeight: 600 }}>여기에 엑셀/CSV 파일을 끌어다 놓으세요</div>
              <div className="muted" style={{ marginTop: 8 }}>
                <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
                  파일 선택
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setFile(f);
                        upload.mutate(f);
                      }
                    }}
                  />
                </label>
              </div>
            </>
          )}
        </div>
        {upload.isError && <ErrorState error={upload.error} />}
      </div>

      {/* 컬럼 매핑 */}
      {batch && (
        <div className="card card-pad">
          <div className="card-title">
            <h2>컬럼 매핑</h2>
            {unmappedRequired.length > 0 && (
              <span className="badge badge-rejected"><span className="dot" />미매핑 필수 {unmappedRequired.length}</span>
            )}
          </div>
          {candidates.isLoading && <p className="muted">매핑 후보를 분석 중…</p>}
          {candidates.isError && (
            <p className="muted">매핑 후보를 불러오지 못했습니다. 백엔드 연결을 확인하세요.</p>
          )}
          {candidates.data && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>우리 컬럼</th>
                    <th>표준 필드</th>
                    <th>신뢰도</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.data.map((c) => {
                    const val = mapping[c.sourceColumn] ?? c.suggestedField ?? '';
                    const missing = c.required && !val;
                    return (
                      <tr key={c.sourceColumn}>
                        <td className="mono">{c.sourceColumn}</td>
                        <td>
                          <input
                            className="mono"
                            style={{ padding: '4px 8px', border: '1px solid var(--border-strong)', borderRadius: 6, width: '100%' }}
                            value={val}
                            placeholder="표준 필드"
                            onChange={(e) => setMapping({ ...mapping, [c.sourceColumn]: e.target.value })}
                          />
                        </td>
                        <td className="dim">{(c.confidence * 100).toFixed(0)}%</td>
                        <td>
                          {missing ? (
                            <span className="tag-fatal">⚠ 미매핑 (필수)</span>
                          ) : (
                            <span style={{ color: 'var(--approved)' }}>✓</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn" onClick={onBack}>← 이전</button>
        <button
          className="btn btn-primary"
          disabled={!batch || unmappedRequired.length > 0 || confirm.isPending}
          onClick={() => confirm.mutate()}
        >
          {confirm.isPending ? '계산·검증 실행 중…' : '매핑 확정 · 검증 실행 →'}
        </button>
      </div>
    </div>
  );
}

// ───── Step 3: 검증 결과 + FATAL 게이트 ─────
function Step3Validation({ batch, onBack }: { batch: Batch; onBack: () => void }) {
  const q = useQuery({
    queryKey: ['validation', batch.batchId],
    queryFn: () => getValidation(batch.batchId),
  });

  const gen = useMutation({ mutationFn: () => generateReport(batch.batchId) });

  if (q.isLoading) {
    return (
      <div className="card card-pad">
        <p className="muted">검증 결과를 불러오는 중…</p>
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="card card-pad">
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </div>
    );
  }

  const v: ValidationResponse | undefined = q.data;
  if (!v) {
    return (
      <div className="card card-pad">
        <EmptyState title="검증 결과가 아직 없습니다" description="계산·검증 잡이 완료되면 표시됩니다." />
      </div>
    );
  }

  const blocked = v.blockedAI || v.fatalCount > 0;
  const hasWarn = v.warnCount > 0;

  return (
    <div className="stack">
      <div className="card card-pad">
        <h2>3. 검증 결과</h2>
        <div className="row" style={{ gap: 16, marginTop: 8 }}>
          <span className="badge badge-rejected"><span className="dot" />치명 {v.fatalCount}</span>
          <span className="badge badge-warn"><span className="dot" />경고 {v.warnCount}</span>
          <span className="badge badge-approved"><span className="dot" />통과</span>
        </div>
      </div>

      {/* FATAL 차단 배너 — AI 리포트 생성 차단 게이트(§2.5) */}
      {blocked && (
        <div className="banner fatal">
          <span className="b-icon">🔴</span>
          <div>
            <div className="b-title">검증 실패 — AI 리포트 생성이 차단되었습니다</div>
            <div className="b-text">
              데이터에 치명 오류가 있어 AI 분석을 시작할 수 없습니다. 오류를 수정한 뒤 재업로드하세요.
              (버튼 비활성 + 서버 API 거부의 이중 차단)
            </div>
          </div>
        </div>
      )}
      {!blocked && hasWarn && (
        <div className="banner warn">
          <span className="b-icon">🟡</span>
          <div>
            <div className="b-title">경고 {v.warnCount}건 — 검토 후 진행 가능</div>
            <div className="b-text">"경고를 무시하고 진행했음"이 감사 로그에 기록됩니다.</div>
          </div>
        </div>
      )}

      {/* 오류 상세 — 규칙ID + 셀 좌표 + 기대/실제 */}
      <div className="card card-pad">
        <div className="card-title">
          <h3>오류 · 경고 상세</h3>
        </div>
        {v.findings.length === 0 ? (
          <p className="muted">검출된 이슈가 없습니다.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>심각도</th>
                  <th>규칙</th>
                  <th>위치</th>
                  <th>내용</th>
                  <th>기대 / 실제</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {v.findings.map((f, i) => (
                  <tr key={i}>
                    <td>
                      {f.severity === 'FATAL' ? (
                        <span className="tag-fatal">🔴 FATAL</span>
                      ) : f.severity === 'WARN' ? (
                        <span className="tag-warn">🟡 WARN</span>
                      ) : (
                        <span className="dim">INFO</span>
                      )}
                    </td>
                    <td className="mono">{f.ruleId}</td>
                    <td className="mono dim">{f.cellRef ?? (f.rowIndex != null ? `행 ${f.rowIndex}` : '—')}</td>
                    <td>{f.message}</td>
                    <td className="dim">
                      {f.expected != null || f.actual != null
                        ? `${f.expected ?? '—'} / ${f.actual ?? '—'}`
                        : '—'}
                    </td>
                    <td>
                      <button className="btn btn-sm">원본 셀 보기</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn" onClick={onBack}>← 수정 후 재업로드</button>
        {/* AI 리포트 생성 — FATAL 존재 시 물리적 비활성 + 사유 툴팁 */}
        {blocked ? (
          <span className="tip" data-tip="검증 실패(FATAL) 상태에서는 AI 리포트를 생성할 수 없습니다">
            <button className="btn btn-primary" disabled>
              AI 리포트 생성 ▶
            </button>
          </span>
        ) : (
          <button className="btn btn-primary" disabled={gen.isPending} onClick={() => gen.mutate()}>
            {gen.isPending ? 'Draft 생성 중…' : 'AI 리포트 생성 (Draft) ▶'}
          </button>
        )}
      </div>

      {gen.isSuccess && (
        <div className="banner info">
          <span className="b-icon">✅</span>
          <div>
            <div className="b-title">Draft 리포트 생성을 시작했습니다</div>
            <div className="b-text">리포트 화면에서 생성 진행 상황과 근거를 확인하세요.</div>
          </div>
        </div>
      )}
    </div>
  );
}
