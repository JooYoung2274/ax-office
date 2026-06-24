# @axaxax/api — Finance AX MVP 백엔드 (NestJS)

핵심 철학: **업로드 → 결정론 계산(CRO) → ValidationEngine FATAL 게이트(AI 차단) → AI 리포트 Draft → 사람 승인.**
리포트는 승인 전까지 Draft이며 비노출, self-approval 차단, 모든 행위는 append-only AuditLog에 기록된다.

## 모듈 (7 + 인프라)

| 모듈 | 책임 |
|---|---|
| `AuthModule` | JWT 발급/검증, `JwtAuthGuard`, `RolesGuard`, `@Roles()`, `@CurrentUser()`, `@Public()` |
| `TenantModule` (@Global) | `TenantContextService`(AsyncLocalStorage), 요청 단위 `tenantId` 전파(MVP=DEFAULT) |
| `AuditModule` (@Global) | `AuditService`(append-only writer) + 전역 `AuditInterceptor` + 감사 조회 |
| `UploadModule` | DataConnector: 멀티파트 업로드, SHA-256 봉인, xlsx 파싱, 컬럼 매핑, parse→calc enqueue |
| `CalcModule` | `runCalcEngine` 래핑, CRO 봉인, ValidationReport, FATAL→BLOCKED 게이트 (Claude 미호출) |
| `ReportModule` | `ReportEngine`(Claude) 통합, 생성 게이트(BLOCKED→409), 상태머신, 승인/반려/코멘트/Export |
| `FinanceModule` | 자금일보(cash)/월결산(closing) 도메인 오케스트레이션(대시보드·기간) |
| `PrismaModule` (@Global) | PrismaClient 생명주기 |

전역: `JwtAuthGuard` → `RolesGuard` (가드), `TenantInterceptor` → `AuditInterceptor` (인터셉터).

## REST 엔드포인트 (기본 prefix `/api/v1`, 명시 없으면 JWT 필요)

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| GET | `/health` | Public | 헬스체크 |
| POST | `/auth/login` | Public | 이메일/비밀번호 → JWT |
| GET | `/auth/me` | STAFF+ | 현재 사용자 |
| GET | `/upload/templates?domain=cash\|closing` | STAFF+ | 도메인별 템플릿 |
| POST | `/upload/files` | STAFF+ | 멀티파트 업로드(중복 해시 409) → parse enqueue |
| GET | `/upload/batches/:batchId/mapping-candidates` | STAFF+ | 컬럼 매핑 후보 |
| POST | `/upload/batches/:batchId/mapping` | STAFF+ | 매핑 확정 → calc enqueue |
| GET | `/upload/batches/:batchId` | STAFF+ | 배치 상태/진행률(SSE 폴백 폴링) |
| POST | `/batches/:batchId/calculate` | STAFF+ | 계산·검증 재실행 |
| GET | `/batches/:batchId/cro` | STAFF+ | CRO 조회 |
| GET | `/batches/:batchId/validation` | STAFF+ | 검증 리포트 조회 |
| POST | `/batches/:batchId/reports` | STAFF+ | AI 리포트 생성(CRO BLOCKED면 409) → report enqueue |
| GET | `/reports/:reportId` | STAFF+ | 리포트 조회(Draft는 작성자/승인자만) |
| POST | `/reports/:reportId/approve` | **APPROVER** | 승인(self-approval 차단) |
| POST | `/reports/:reportId/reject` | **APPROVER** | 반려(사유 필수) |
| POST | `/reports/:reportId/comments` | STAFF+ | 코멘트(finding 스레드) |
| GET | `/reports/:reportId/export?format=pdf` | STAFF+ | Export(승인된 리포트만, 미승인 403 — 스텁) |
| GET | `/finance/dashboard` | STAFF+ | 처리 큐 + 유동성 경보(CRO flags) + 최근 활동 |
| GET | `/finance/periods?domain=cash\|closing` | STAFF+ | 기간 목록 |
| GET | `/audit-logs?targetType=&targetId=&action=&from=&to=&take=&skip=` | APPROVER/ADMIN | 감사 로그 조회 |

`STAFF+` = `FINANCE_STAFF`, `FINANCE_APPROVER`, `ADMIN`. `APPROVER` = `FINANCE_APPROVER`, `ADMIN`.

## BullMQ 파이프라인 (PRD §6.3)

```
POST /upload/files → [parse-queue] → (사용자 매핑 확정) → [calc-queue] → CALCULATED|BLOCKED
                                                                              │ (BLOCKED면 정지)
POST /batches/:id/reports → [report-queue] → DRAFT | (가드 미통과) BLOCKED
```

- 큐 이름 상수: `src/common/constants.ts` (`parse-queue`/`calc-queue`/`report-queue`).
- 잡 멱등 키: `parse:{batchId}`, `calc:{batchId}`, `report:{reportId}`.
- 공통 옵션: `attempts:3`, exponential backoff, `removeOnFail:false`(감사 보존).
- report-queue는 `concurrency:4`(외부 API 격리). CRO 부재/FATAL은 `UnrecoverableError`.
- 진행 상태는 `GET /upload/batches/:id`(폴링)로 노출. SSE는 후속.

## 리포트 생명주기 상태머신 (@axaxax/shared `canTransition`)

`PENDING → CALCULATED → (BLOCKED) → AI_DRAFTING → DRAFT → APPROVED | REJECTED`
배치 `lifecycle` 컬럼과 `Report.status`가 이 상태머신을 공유하며, 모든 전이는 `canTransition()`으로 강제된다.

## Prisma 모델 (`prisma/schema.prisma`, PRD §3.4)

Tenant, User(role), UploadBatch(sourceHash·status·lifecycle·progress), ColumnMapping, RawDataset, RawRow,
Account, BankAccount, BankTransaction, CashflowSchedule, TrialBalance, JournalEntry, Subledger, FixedAsset,
ComparativeFs, CalculationResult(CRO JSON + engineVersion + blockedAI), ValidationReport, Report(ReportStatus
enum + content/guard/confidence/regenCount/stale/approver/rejectionReason/croId), Comment, AuditLog(append-only).

Enums: Role, TemplateKey, BatchStatus, StatementType, SliceType(cash/closing), CashflowDirection, DrCr,
Severity, ReportStatus.

## 로컬 실행

### 1. 인프라 (Postgres + Redis via Docker)

```bash
docker run -d --name axaxax-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=axaxax -p 5432:5432 postgres:16
docker run -d --name axaxax-redis -p 6379:6379 redis:7
```

### 2. 환경변수

루트의 `.env.example`를 복사: `cp .env.example .env` (DATABASE_URL, REDIS_*, JWT_SECRET, ANTHROPIC_API_KEY, DEFAULT_TENANT_ID, API_PORT 등).

### 3. 의존성 / 마이그레이션 / 시드 / 기동

```bash
npm install                                # 루트(workspaces)
npm run build:packages                     # shared/calc-engine/report-engine 빌드(워크스페이스 의존)
npm run prisma:generate -w @axaxax/api
npm run prisma:migrate  -w @axaxax/api     # 최초 마이그레이션 생성/적용
npm run seed            -w @axaxax/api     # DEFAULT 테넌트 + 3 사용자
npm run dev:api                            # = nest start --watch (http://localhost:3000/api/v1)
```

### 시드 계정 (개발 전용 — 배포 전 변경)

| 이메일 | 비밀번호 | 역할 |
|---|---|---|
| staff@axaxax.dev | staff1234 | FINANCE_STAFF |
| approver@axaxax.dev | approver1234 | FINANCE_APPROVER |
| admin@axaxax.dev | admin1234 | ADMIN |

## 주의

- ANTHROPIC_API_KEY 없이도 앱은 부팅된다. 키가 없으면 report-queue 잡이 generate() 시점에 실패하고 재시도 소진 후 리포트가 CALCULATED로 롤백된다(나머지 파이프라인은 정상).
- 모든 Claude 호출은 백엔드(ReportModule) 경유. 프론트는 키를 모른다.
