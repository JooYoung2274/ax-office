# ax-office — Finance AX

> 기업 재무팀의 반복 업무를 **AI 네이티브**로 전환하는 AX(AI Transformation) 웹 서비스.
> 첫 모듈은 중견·중소기업 재무팀을 위한 **Finance AX**(자금일보·월결산).

[![status](https://img.shields.io/badge/stage-MVP%20(W2%20E2E%20passing)-success)](#현재-상태)
[![node](https://img.shields.io/badge/node-%E2%89%A522-339933)](#사전-요구사항)
[![tests](https://img.shields.io/badge/tests-35%20passing-success)](#테스트)

---

## 핵심 철학 — "계산은 코드, 해석은 AI, 결론은 사람"

AI가 사람을 대체하는 것이 아니라, 역할을 명확히 나눈 **3단 구조**입니다.

```
┌─────────────┐   ┌──────────────────────┐   ┌─────────────────────────┐   ┌──────────────┐
│ 데이터 업로드 │ → │ ① 단순계산: 결정론 코드 │ → │ ② 이상징후·개선점: AI 리포트 │ → │ ③ 결론: 사람 승인 │
│ (엑셀/CSV)   │   │    → CRO(검증된 수치)   │   │   (근거 인용 강제, Draft)   │   │  (승인/반려)   │
└─────────────┘   └──────────────────────┘   └─────────────────────────┘   └──────────────┘
                          │ FATAL이면                    │ 환각 가드
                          ▼ AI 호출 차단                  ▼ 위반 시 재생성→사람 큐
```

이 구조를 **아키텍처가 강제**합니다:

- **계산-해석 분리** — 모든 수치는 결정론 엔진의 `CRO`(Calculation Result Object)에서만 나옵니다. AI는 CRO 밖의 숫자를 **절대 생성하지 않습니다**.
- **근거 인용 강제** — AI 리포트의 모든 finding은 유효한 `evidence_ref`(CRO 항목 ID)를 가져야 하며, 후처리 가드가 *리포트의 모든 숫자가 CRO에 실재하는지* 기계 검증합니다. 위반 시 자동 재생성, N회 실패 시 사람 검토 큐로.
- **Garbage-in 차단** — 검증에 치명 오류(FATAL: 예) 차변≠대변)가 있으면 AI 호출 자체가 차단됩니다.
- **Human-in-the-loop** — 모든 리포트는 `DRAFT`로만 생성되며, 사람 승인 전에는 노출·Export되지 않습니다.

> 📄 설계 문서: [`docs/AX-서비스-기획안.md`](docs/AX-서비스-기획안.md) (5개 팀 전체 기획) · [`docs/Finance-MVP-PRD.md`](docs/Finance-MVP-PRD.md) (재무 MVP 상세 PRD)

---

## 검증된 동작 (로컬 E2E)

실제 Postgres + Redis 위에서 슬라이스 A(자금일보) 전 구간이 통과합니다:

```
로그인 → 엑셀 3종 업로드(계좌마스터·거래내역·예정스케줄) → 자동 컬럼매핑
       → 파싱·정규화 → 기간 단위 집계 → 결정론 계산(CRO) → 유동성 경보 → 대시보드
```

예시 시나리오 — 기초잔액 1억, 당일 순수지 −1,500만(잔액 8,500만), 7/5 확정지급 1.5억:

| 산출 | 값 | 비고 |
|---|---|---|
| 총 가용잔액 | ₩85,000,000 | 코드 계산 |
| 일일 자금수지 | −₩15,000,000 | 코드 계산 |
| **예측 최저잔액** | **−₩65,000,000** (7/5) | 확정 현금흐름 예측 |
| 유동성 경보 | `min_balance_below_threshold` (WARN) | 안전선(0원) 미만 → 플래그 발화 |
| 중복 파일 | `409 Conflict` | SHA-256 해시 차단 |

---

## 모노레포 구조 (npm workspaces)

```
packages/
  shared/         공통 계약(듀얼 ESM/CJS): CRO·Report·Validation 스키마, Role, 리포트 상태머신
  calc-engine/    결정론 계산·검증 엔진(순수 TS, decimal-safe) → CRO 생성. 코드가 100% 책임지는 숫자.
  report-engine/  CRO→Claude 리포트 + 환각 가드(근거 인용·숫자 그라운딩)+재생성 루프
apps/
  api/            NestJS 백엔드(7모듈)+Prisma+BullMQ 파이프라인+JWT/RBAC+감사로그
  web/            React + Vite 프론트(역할별 화면, 검증 게이트, Draft→승인, 근거 하이라이트)
docs/             기획안 · PRD
```

### 패키지 경계 (왜 이렇게 나눴나)

| 패키지 | 책임 | 한 줄 |
|---|---|---|
| `calc-engine` | "수가 나오는 것" | 모든 산술·집계·정합성·이상치 **플래그**를 코드가 산출. `Metric.value`는 decimal-safe 문자열 |
| `report-engine` | "수의 의미를 말하는 것" | Claude는 CRO의 값만 인용. `runGuard`가 그라운딩을 기계 검증, 위반 시 재생성/`NEEDS_HUMAN` |
| `shared` | 둘 사이의 계약 | `CRO`(JSON) 단방향 데이터 계약 — 코드와 AI를 잇는 유일한 통로 |

`ANTHROPIC_API_KEY`는 **백엔드 전용**입니다. 프론트엔드는 키를 절대 보유하지 않으며, 모든 Claude 호출은 NestJS를 경유합니다.

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 프론트엔드 | React · TypeScript · Vite · React Router · TanStack Query · axios |
| 백엔드 | NestJS · Prisma · PostgreSQL · BullMQ(Redis) · Passport JWT |
| 결정론 엔진 | 순수 TypeScript · decimal.js · node:test |
| AI 오케스트레이션 | `@anthropic-ai/sdk` (`claude-opus-4-8`, adaptive thinking, 구조화 출력, prompt caching) · LCEL seam |
| 공통 | npm workspaces · TypeScript 5 · zod |

---

## 사전 요구사항

- **Node ≥ 22**, npm ≥ 10
- **PostgreSQL**, **Redis** (api 실행 시)

```bash
docker run -d --name axaxax-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=axaxax -p 5432:5432 postgres:16
docker run -d --name axaxax-redis -p 6379:6379 redis:7
```

---

## 빠른 시작

```bash
# 1) 설치 · 빌드 · 테스트
npm install
npm run build            # shared → calc/report → api → web
npm test                 # 패키지 단위 테스트(네트워크 불필요)

# 2) 환경변수
cp .env.example .env                 # 루트(웹/공용)
cp .env.example apps/api/.env        # 백엔드(prisma·nest가 cwd에서 로드)
#   → DATABASE_URL, REDIS_*, JWT_SECRET 확인. ANTHROPIC_API_KEY는 AI 리포트 사용 시에만 필요.

# 3) DB 준비(백엔드)
npm run prisma:migrate -w @axaxax/api   # 마이그레이션 적용
npm run seed           -w @axaxax/api   # DEFAULT 테넌트 + 3개 역할 사용자 시드

# 4) 실행
npm run dev:api          # http://localhost:3000/api/v1  (health: /api/v1/health)
npm run dev:web          # http://localhost:5173
```

### 시드 계정 (개발용)

| 역할 | 이메일 | 비밀번호 |
|---|---|---|
| 재무담당자 (Staff) | `staff@axaxax.dev` | `staff1234` |
| 재무팀장 (Approver) | `approver@axaxax.dev` | `approver1234` |
| 관리자 (Admin) | `admin@axaxax.dev` | `admin1234` |

> `ANTHROPIC_API_KEY` 없이도 앱은 부팅되고 **업로드·계산·검증·승인** 플로우는 정상 동작합니다. AI 리포트 생성 job만 키가 없으면 실패 후 `CALCULATED`로 롤백됩니다.

---

## 테스트

```bash
npm test                              # 전체
npm test -w @axaxax/calc-engine       # 12 — 계산 정확성·검증 게이트·결정론
npm test -w @axaxax/report-engine     # 15 — 환각 가드·재생성 루프(네트워크 무관)
npm test -w @axaxax/api               #  8 — 컬럼매핑 스코프·기간집계·jobId
```

엔드투엔드 흐름은 위 [검증된 동작](#검증된-동작-로컬-e2e) 참고(실 DB/Redis 필요).

---

## 주요 npm 스크립트

| 스크립트 | 설명 |
|---|---|
| `npm run build` | 전체 워크스페이스 빌드 |
| `npm test` | 전체 단위 테스트 |
| `npm run dev:api` / `npm run dev:web` | 개발 서버 |
| `npm run prisma:migrate -w @axaxax/api` | DB 마이그레이션 |
| `npm run seed -w @axaxax/api` | 시드 데이터 |

---

## 현재 상태

**W1 (기반·골격) + W2 (업로드 파이프라인) 완료 — 슬라이스 A E2E 통과.**

- ✅ 듀얼 빌드 `shared` 계약, Prisma 스키마(모델 21 + enum 8)
- ✅ 결정론 엔진(자금 `cash.*` / 결산 `tb.·je.·fs.*` + FATAL/WARN/INFO 룰) — 12 테스트
- ✅ ReportEngine + 환각 가드 + 재생성 루프 + 시스템 프롬프트 2종 — 15 테스트
- ✅ NestJS 7모듈(Auth/Tenant/Upload/Calc/Report/Audit/Finance) + JWT/RBAC + BullMQ 파이프라인 + 상태머신
- ✅ React 역할별 화면(대시보드/업로드/자금일보/월결산/리포트뷰어/감사로그)
- ✅ **W2**: datasetKind 스코프 컬럼매핑, 기간 단위 다중배치 집계, 엑셀 업로드→CRO→유동성 경보 E2E

### 로드맵 (PRD §7)

| Phase | 내용 |
|---|---|
| **0 — MVP** *(진행 중)* | 재무·엑셀 단일 슬라이스로 코드→AI→사람 루프 + 환각 차단 실증 |
| 1 — 멀티테넌시·보안 | TenantContext·RLS·RBAC·시크릿·ERP 커넥터·prompt caching |
| 2 — 도메인 확장 | 인사·영업·마케팅·사업기획 플러그인 |
| 3 — RAG 근거 보강 | 규정·벤치마크·과거 리포트 인덱싱 |
| 4 — Q&A·최적화 | 읽기전용 tool-calling Q&A, 모델 라우팅·eval |

---

## 보안 주의

이 저장소의 `JWT_SECRET`(`dev-only-change-me`), 시드 비밀번호, 로컬 Postgres 비밀번호(`postgres`)는 **모두 개발용 기본값**입니다. 운영 배포 전 반드시 교체하세요. 실제 `.env`와 `ANTHROPIC_API_KEY`는 저장소에 포함되지 않습니다(`.gitignore`).
