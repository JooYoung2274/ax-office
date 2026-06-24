# @axaxax/web — Finance AX MVP 프론트엔드

중견·중소기업 재무팀을 위한 AI 네이티브 AX 전환 서비스의 React 프론트엔드(W1 스켈레톤).
**계산(결정론 코드) → AI 리포트(Draft) → 사람 승인**의 3단 철학을 UX에 그대로 노출합니다:

- **검증 게이트**: FATAL 검증 오류가 있으면 "AI 리포트 생성 차단" 배너 + 버튼 물리적 비활성(+ 서버 이중 차단).
- **Draft → 승인 워크플로**: 모든 리포트는 Draft 워터마크로 생성, self-approval 비활성, 승인 시에만 공개.
- **근거 하이라이트**: finding 클릭 → 인용된 CRO metric/flag(evidence_ref)가 우측 근거 패널에서 하이라이트.

## 스택

Vite · React 18 · TypeScript · React Router v6 · @tanstack/react-query · axios · `@axaxax/shared`(타입/스키마 단일 출처)

## 실행

```bash
# 1) 환경변수 — 레포 루트에서 복사 (VITE_API_BASE_URL 포함)
cp ../../.env.example ../../.env
#   VITE_API_BASE_URL="http://localhost:3000"  ← 백엔드 주소

# 2) 의존성 설치 (워크스페이스 루트에서)
npm install

# 3) shared 패키지 빌드 (타입 제공)
npm run build -w @axaxax/shared

# 4) 개발 서버 (포트 5173)
npm run dev -w @axaxax/web
#   또는 루트에서: npm run dev:web
```

- 개발 서버: http://localhost:5173
- 상대경로 `/api` 호출은 Vite 프록시가 `VITE_API_BASE_URL`로 전달합니다(`vite.config.ts`).
- 백엔드가 꺼져 있어도 화면은 "데이터 없음 / 백엔드에 연결할 수 없습니다" 상태로 우아하게 렌더됩니다.

## 환경변수

| 변수 | 설명 |
|---|---|
| `VITE_API_BASE_URL` | 백엔드 API 베이스 URL (예: `http://localhost:3000`). 미설정 시 상대경로 `/api` + Vite 프록시. |

## 보안 — API 키는 프론트에 절대 없음

> **모든 Claude(Anthropic) 호출은 백엔드(ReportModule)를 경유합니다.**
> 프론트엔드는 `ANTHROPIC_API_KEY`를 **보유하지도, 참조하지도 않습니다.**
> 프론트가 호출하는 것은 자체 백엔드 REST API(`/api/v1/...`)뿐이며, JWT bearer 토큰만 다룹니다.
> `.env`의 `ANTHROPIC_API_KEY`는 `VITE_` 접두사가 없어 Vite 번들에 포함되지 않습니다.

## 라우트

| 경로 | 화면 | 권한 |
|---|---|---|
| `/login` | 로그인 (공개) | — |
| `/` | 대시보드 (유동성 경보·처리 큐·최근 활동) | 전체 |
| `/upload` | 업로드 마법사 (3-step, FATAL 게이트) | 전체 |
| `/cash-daily` | 자금일보·현금흐름·유동성 경보 | 전체 |
| `/monthly-closing` | 월결산 (시산표/재무제표/이상분개/계정대사) | 전체 |
| `/reports` | 리포트 목록 | 전체 |
| `/reports/:reportId` | AI 리포트 뷰어 (근거 하이라이트·승인 워크플로) | 전체(승인은 APPROVER) |
| `/audit-log` | 감사 로그 | APPROVER/ADMIN |

## 디렉터리

```
src/
  lib/        api.ts (REST 클라이언트), types.ts (DTO)
  context/    AuthContext.tsx (+ useAuth)
  components/ AppLayout, ProtectedRoute, RoleGate, StatusBadge, States
  pages/      Login, Dashboard, Upload, CashDaily, MonthlyClosing, Reports, ReportViewer, AuditLog
  router.tsx  라우트 정의
  main.tsx    QueryClientProvider + RouterProvider
```
