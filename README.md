# axaxax — Finance AX MVP

기업 재무팀 업무를 AI 네이티브로 전환하는 AX 웹 서비스의 MVP. 핵심 3단 구조:

> **단순계산 = 결정론적 코드(CRO)** → **이상징후·개선점 = Claude AI 리포트(근거 인용 강제)** → **결론 = 사람 승인**

AI는 CRO(Calculation Result Object) 밖의 숫자를 절대 생성하지 않으며(후처리 가드가 기계 검증), 데이터에 치명 오류(FATAL)가 있으면 AI 호출이 차단되고, 모든 리포트는 사람 승인 전 Draft로만 존재한다.

기획·설계 문서: [`docs/AX-서비스-기획안.md`](docs/AX-서비스-기획안.md) · [`docs/Finance-MVP-PRD.md`](docs/Finance-MVP-PRD.md)

## 모노레포 구조 (npm workspaces)

```
packages/
  shared/         # 공통 계약(듀얼 ESM/CJS): CRO·Report·Validation 스키마, Role, 리포트 상태머신
  calc-engine/    # 결정론 계산·검증 엔진(순수 TS, decimal-safe) → CRO 생성. 코드가 100% 책임지는 숫자.
  report-engine/  # ReportEngine: CRO→Claude 리포트 + 환각 가드(근거 인용·숫자 그라운딩 검증)+재생성 루프
apps/
  api/            # NestJS 백엔드(7모듈) + Prisma + BullMQ 파이프라인 + JWT/RBAC + 감사로그
  web/            # React + Vite 프론트(역할별 화면, 검증 게이트, Draft→승인, 근거 하이라이트)
```

### 경계 원칙 (왜 이렇게 나눴나)
- **calc-engine** = "수가 나오는 것". 모든 산술·집계·정합성·이상치 **플래그**를 코드가 산출. `Metric.value`는 decimal-safe 문자열.
- **report-engine** = "수의 의미를 말하는 것". Claude는 CRO의 값만 인용(`evidence_ref`). `runGuard`가 출력의 모든 숫자가 CRO에 실재하는지 기계 검증 → 위반 시 재생성, N회 실패 시 `NEEDS_HUMAN`.
- 둘은 **CRO(JSON)** 단방향 계약으로만 연결. `ANTHROPIC_API_KEY`는 백엔드 전용, 프론트는 절대 보유하지 않음.

## 사전 요구사항
- Node ≥ 22, npm ≥ 10
- Postgres, Redis (api 실행 시) — 예: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres` / `docker run -d -p 6379:6379 redis`

## 설치 · 빌드 · 테스트

```bash
npm install                # 전체 워크스페이스 설치
npm run build              # 전체 빌드(shared→calc/report→api→web)
npm test                   # 패키지 단위 테스트(calc-engine 12, report-engine 15 — 네트워크 불필요)
```

## 실행 (개발)

```bash
cp .env.example .env       # 값 채우기(특히 DATABASE_URL, ANTHROPIC_API_KEY)

# 백엔드
npm run prisma:generate -w @axaxax/api
npm run prisma:migrate  -w @axaxax/api   # 최초 마이그레이션
npm run seed            -w @axaxax/api   # DEFAULT 테넌트 + 3개 역할 사용자 시드
npm run dev:api                          # http://localhost:3000  (GET /health)

# 프론트
npm run dev:web                          # http://localhost:5173
```

> `ANTHROPIC_API_KEY` 없이도 앱은 부팅된다. 리포트 생성 job만 키가 없으면 실패 후 `CALCULATED`로 롤백되고, 업로드·계산·검증·승인 플로우는 정상 동작한다.

## 현재 상태 (W1 — 기반·골격 완료)
- ✅ 모노레포·CI 골격, 듀얼 빌드 shared 계약, Prisma 스키마(모델 21 + enum 8)
- ✅ 결정론 엔진(자금일보 `cash.*` / 월결산 `tb./je./fs.*` metric + FATAL/WARN/INFO 룰) + 테스트
- ✅ ReportEngine + 환각 가드 + 재생성 루프 + 2종 시스템 프롬프트 + 네트워크 없는 테스트
- ✅ NestJS 7모듈(Auth/Tenant/Upload/Calc/Report/Audit/Finance) + JWT/RBAC + BullMQ 파이프라인 + 상태머신
- ✅ React 셸·라우팅·역할별 화면(대시보드/업로드/자금일보/월결산/리포트뷰어/감사로그)

다음(W2~): 업로드 마법사 실제 파싱·매핑, 슬라이스 A E2E, 실제 Claude 연동 검증. 로드맵은 PRD §7 참조.
