// ─────────────────────────────────────────────────────────────
// API 클라이언트 — 백엔드 REST 엔드포인트(PRD §6.2) 미러.
// ⚠ 중요: 프론트엔드는 ANTHROPIC_API_KEY를 절대 보유/참조하지 않는다.
//         모든 Claude 호출은 백엔드(ReportModule)를 경유한다(§6.1).
//         이 파일에서 호출하는 것은 우리 백엔드 API뿐이다.
// ─────────────────────────────────────────────────────────────
import axios, { AxiosError } from 'axios';
import type {
  LoginResponse,
  TemplateInfo,
  Batch,
  MappingCandidate,
  ValidationResponse,
  ReportDto,
  AuditEntry,
  DashboardSummary,
  Domain,
  Cro,
  CashDailySummary,
  MonthlyClosingSummary,
} from './types';

const TOKEN_KEY = 'axaxax.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// VITE_API_BASE_URL 미설정 시 상대경로(/api) → vite 프록시가 처리.
const baseURL =
  (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '') + '/api/v1';

export const http = axios.create({
  baseURL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// JWT bearer 인터셉터 — localStorage 토큰을 Authorization 헤더에 주입.
http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 → 로그인으로 리다이렉트(세션 만료/미인증).
http.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      tokenStore.clear();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

// 웹 Domain('cashflow'|'monthly_close') ↔ 백엔드 도메인('cash'|'closing') 매핑.
const toBackendDomain = (d: Domain): 'cash' | 'closing' =>
  d === 'monthly_close' ? 'closing' : 'cash';

// ───── 인증 ─────
export async function login(email: string, password: string): Promise<LoginResponse> {
  // 백엔드는 { accessToken, user }를 반환 — 웹 내부 표현 { token, user }로 매핑.
  const { data } = await http.post<{ accessToken: string; user: LoginResponse['user'] }>(
    '/auth/login',
    { email, password },
  );
  return { token: data.accessToken, user: data.user };
}

/** 현재 세션 검증(/auth/me). 토큰이 만료/무효면 401 → 인터셉터가 로그인으로. */
export async function getMe(): Promise<import('./types').AuthUser> {
  const { data } = await http.get<import('./types').AuthUser>('/auth/me');
  return data;
}

// ───── 업로드 (DataConnector) ─────
interface BackendTemplate {
  templateKey: string;
  datasetKind: string;
  domain: 'cash' | 'closing';
  label: string;
  requiredColumns: string[];
  optionalColumns?: string[];
  sampleRows?: Record<string, string>[];
}

export async function listTemplates(domain: Domain): Promise<TemplateInfo[]> {
  const { data } = await http.get<{ templates: BackendTemplate[] }>('/upload/templates', {
    params: { domain: toBackendDomain(domain) },
  });
  const templates = Array.isArray(data) ? (data as BackendTemplate[]) : (data.templates ?? []);
  return templates.map((t) => ({
    templateId: t.templateKey,
    domain,
    label: t.label,
    requiredColumns: t.requiredColumns.map((field) => ({ field, label: field, required: true })),
    sampleRows: t.sampleRows ?? [],
  }));
}

export async function uploadFile(
  file: File,
  domain: Domain,
  onProgress?: (pct: number) => void,
): Promise<Batch> {
  const form = new FormData();
  form.append('file', file);
  form.append('domain', domain);
  const { data } = await http.post<Batch>('/upload/files', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return data;
}

export async function getMappingCandidates(batchId: string): Promise<MappingCandidate[]> {
  const { data } = await http.get<{ candidates: MappingCandidate[] }>(
    `/upload/batches/${batchId}/mapping-candidates`,
  );
  return data.candidates;
}

export async function confirmMapping(
  batchId: string,
  mapping: Record<string, string>,
): Promise<Batch> {
  const { data } = await http.post<Batch>(`/upload/batches/${batchId}/mapping`, { mapping });
  return data;
}

export async function getBatchStatus(batchId: string): Promise<Batch> {
  const { data } = await http.get<Batch>(`/upload/batches/${batchId}`);
  return data;
}

// ───── 계산·검증 (CalculationEngine / ValidationEngine) ─────
export async function recalculate(batchId: string): Promise<{ jobId: string; status: string }> {
  const { data } = await http.post(`/batches/${batchId}/calculate`);
  return data;
}

export async function getCro(batchId: string): Promise<Cro> {
  const { data } = await http.get<Cro>(`/batches/${batchId}/cro`);
  return data;
}

export async function getValidation(batchId: string): Promise<ValidationResponse> {
  const { data } = await http.get<ValidationResponse>(`/batches/${batchId}/validation`);
  return data;
}

// ───── 리포트 (ReportEngine) ─────
export async function generateReport(batchId: string): Promise<ReportDto> {
  const { data } = await http.post<ReportDto>(`/batches/${batchId}/reports`);
  return data;
}

export async function getReport(reportId: string): Promise<ReportDto> {
  const { data } = await http.get<ReportDto>(`/reports/${reportId}`);
  return data;
}

export async function approveReport(reportId: string): Promise<ReportDto> {
  const { data } = await http.post<ReportDto>(`/reports/${reportId}/approve`);
  return data;
}

export async function rejectReport(reportId: string, reason: string): Promise<ReportDto> {
  const { data } = await http.post<ReportDto>(`/reports/${reportId}/reject`, { reason });
  return data;
}

export async function commentReport(
  reportId: string,
  body: string,
  findingId?: string,
): Promise<{ commentId: string; createdAt: string }> {
  const { data } = await http.post(`/reports/${reportId}/comments`, { body, findingId });
  return data;
}

// ───── 감사로그 (EvidenceLedger) ─────
export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
  page?: number;
}

export async function listAuditLogs(q: AuditQuery = {}): Promise<AuditEntry[]> {
  const { data } = await http.get<{ items: AuditEntry[] } | AuditEntry[]>('/audit-logs', { params: q });
  return Array.isArray(data) ? data : data.items;
}

// ───── 대시보드 ─────
interface BackendDashboard {
  queue: { uploading: number; blocked: number; drafts: number; pendingApproval: number };
  liquidityAlerts: { id: string; severity: string; message: string; value?: string }[];
  recentActivity: { action: string; targetType: string; targetId: string; createdAt: string }[];
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const { data } = await http.get<BackendDashboard>('/finance/dashboard');
  const sevMap = (s: string): 'high' | 'medium' | 'low' =>
    s === 'FATAL' ? 'high' : s === 'WARN' ? 'medium' : 'low';
  return {
    queue: {
      uploading: data.queue?.uploading ?? 0,
      validationFailed: data.queue?.blocked ?? 0,
      draft: data.queue?.drafts ?? 0,
      pendingApproval: data.queue?.pendingApproval ?? 0,
    },
    liquidityAlerts: (data.liquidityAlerts ?? []).map((a) => ({
      id: a.id,
      severity: sevMap(a.severity),
      title: a.message,
      detail: a.value ? `값 ${a.value}` : undefined,
      amount: a.value,
    })),
    recentActivity: (data.recentActivity ?? []).map((r, i) => ({
      id: `${r.createdAt}-${i}`,
      actorName: '',
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      createdAt: r.createdAt,
    })),
  };
}

// ───── 도메인 요약(자금일보 / 월결산) ─────
export async function getCashDaily(asOfDate?: string): Promise<CashDailySummary> {
  const { data } = await http.get<CashDailySummary>('/finance/cash-daily', { params: { asOfDate } });
  return data;
}

export async function getMonthlyClosing(period?: string): Promise<MonthlyClosingSummary> {
  const { data } = await http.get<MonthlyClosingSummary>('/finance/monthly-closing', { params: { period } });
  return data;
}

export async function listReports(params: { status?: string; domain?: Domain } = {}): Promise<ReportDto[]> {
  const { data } = await http.get<ReportDto[]>('/reports', { params });
  return data;
}
