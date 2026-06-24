# Finance AX MVP 상세 PRD

> **한 줄 요약**: 중견·중소기업 재무팀을 위한 AI 네이티브 AX 전환 서비스. **단순계산(결정론적 코드) → 이상징후·개선점(Claude AI 리포트, 근거 인용 강제) → 결론(사람 승인)** 의 3단 구조로, AI가 CRO(Calculation Result Object) 밖의 숫자를 절대 생성하지 못하게 기계적으로 차단하고, 모든 리포트를 Draft로 생성해 사람 승인 전 비노출한다.

---

## 0. 문서 개요

### 0.1 MVP 목표
엑셀 의존도가 높고 ERP 풀연동이 어려운 중견·중소기업 재무팀이, **엑셀/CSV 업로드만으로** 자금일보·현금흐름 예측과 월 결산·이상 탐지를 자동화하고, **근거가 추적되는 AI 리포트**를 받아 사람이 빠르게 검토·승인하도록 한다. 핵심 가치는 "즉효성(빠른 도입·즉시 효과)"과 "신뢰성(환각 0, 근거 100% 추적)"의 동시 달성이다.

### 0.2 범위 (Scope)

**In scope (MVP 수직 슬라이스 2개)**
- **슬라이스 A — 자금일보·현금흐름 예측 + 유동성 경보**: 은행거래내역·예정 입출금 기반 일별 현금흐름 예측(결정론적 룰)과 안전선 대비 유동성 경보.
- **슬라이스 B — 월 결산 자동화(정형 분개·재무제표) + 이상 분개/계정 대사 탐지**: 시산표·전표 기반 결산정리, BS/IS 산출, 차대 불균형·이상치·미대사 후보 탐지.
- 공통 기반: 엑셀/CSV 업로드(DataConnector), 결정론적 CalculationEngine + ValidationEngine, AI ReportEngine(Draft 생성), EvidenceLedger(AuditLog), 승인 워크플로, RBAC 골격, 감사 로그.

**Out of scope (MVP 비범위)**
- ERP/뱅킹 실시간 API 연동(OpenBanking·전자세금계산서 직연동). 엑셀/CSV 업로드만.
- 멀티 테넌트·조직/SSO 관리 화면(단일 테넌트 가정, RBAC는 골격만 — 사용자 초대/역할 편집 UI 없음).
- **AI의 숫자 생성·시뮬레이션**(What-if·예측을 AI가 생성하는 기능 일체 — 예측도 결정론적 룰).
- 자동 분개의 완전 무인화(정형 분개 자동 생성은 하되 사람 확인 필수; 비정형·판단 분개 제외).
- 세무 신고·법정 공시 산출물(세무조정, 부가세 신고서 등).
- 모바일 전용 앱 / 실시간 협업 동시편집(반응형 웹까지만).
- 고급 권한(필드 단위 ACL)·다단계 결재선(승인은 단일 승인자 1단계).
- 알림 채널 다양화(인앱 알림만; 이메일/슬랙/카카오는 후속).
- 대시보드 커스터마이징·BI 자유 분석(고정 레이아웃).

### 0.3 타겟 사용자
- **1차 고객**: 중견·중소기업(엑셀 의존 높음, ERP 풀연동 어려움, 빠른 즉효성 중요).
- **1차 팀**: 재무팀(Finance AX).
- **사용자 역할(RBAC 골격)**: 재무담당자(Staff), 재무팀장(Reviewer/Approver), 관리자(Admin). 상세는 §2.1.

### 0.4 성공 지표 (Success Metrics)

| 지표 | 목표 | 측정 방법 |
|---|---|---|
| **리드타임 단축** | 자금일보·월결산 작업 리드타임 **80% ↓** | 도입 전 수작업 소요시간 대비 업로드→승인 완료 시간 |
| **CRO 일치율 / 환각** | 리포트 내 모든 수치의 **CRO 일치율 100% / 환각 0건** | 후처리 검증기(§5.6) 통과율, 위반 로그 0 |
| **AI 리포트 채택률** | 생성된 Draft의 **승인 채택률 70% ↑** (반려·전면재작성 제외) | Approved / 전체 생성 비율 |
| **베타 정착도** | 베타 고객 **주 1회 이상 정기 사용 정착** | 주차별 활성 업로드·리포트 생성 빈도 |

### 0.5 가정 · 제약
- **단일 테넌트 가정**: 모든 테이블에 `tenantId`를 두되 MVP는 `DEFAULT` 단일 테넌트. 멀티테넌트 전환 비용을 0에 가깝게 유지하는 추상화만 확보.
- **원본 불변(Immutability)**: 업로드 원본은 수정하지 않고 SHA-256 스냅샷으로 봉인. 모든 정규화·계산은 원본의 파생물이며 역추적 가능.
- **결정론 우선**: 예측·비율·증감 등 모든 수치는 순수 TS 결정론 엔진이 산출. AI는 CRO·플래그의 값만 인용한다.
- **검증 게이트**: 치명(FATAL) 검증 오류가 1건이라도 있으면 계산·AI 호출이 이중 차단된다.
- **Human-in-the-loop**: 모든 리포트는 Draft로만 생성, 사람 승인 전 비노출·외부 공유 불가.
- **기술 스택**: React+TS 프론트, NestJS 백엔드, 순수 TS 결정론 엔진, LangChain.js(LCEL), `@anthropic-ai/sdk`(`claude-opus-4-8`), Postgres+Prisma, BullMQ.

### 0.6 용어 · 네이밍 규약 (문서 전체 일관)

| 용어 | 정의 |
|---|---|
| **CRO** (CalculationResult / CalculationResultObject) | 결정론 엔진의 출력. AI가 인용 가능한 **유일한 숫자의 출처**. `metrics[]`·`flags[]`·`validationSummary` 포함 |
| **metricId** | CRO 내 수치의 안정적 ID. 규칙 `{domain}.{period}.{name}` (예: `cf.2026-06.net_change`) |
| **flagId** | CRO 내 결정론 규칙이 탐지한 이상징후/경보 ID (예: `cf.2026-06.flag.min_balance_below_threshold`) |
| **evidence_ref** | AI 리포트 finding이 인용하는 CRO 항목 ID(metricId 또는 flagId). 근거 없는 주장 금지 |
| **ValidationReport** | ValidationEngine 산출. `severity`(FATAL/WARN/INFO), `blockedAI` 등. FATAL 존재 시 AI 차단 |
| **Draft** | 리포트 최초 상태. 비노출·외부 Export 불가. 사람 승인 시에만 공개 |
| **EvidenceLedger / AuditLog** | append-only 감사 로그. 업로드·계산·AI 호출·승인 전 과정을 actor·시각·CRO 해시와 함께 기록 |
| **engine_version** | 결정론 엔진 버전. CRO에 박제하여 재현성·감사 추적 |
| **sourceRowId(s)** | 계산값이 유래한 RawRow 역참조. evidence_ref 추적의 종착점 |

> 상태값 표기 규약: 화면(UX)은 한국어 라벨(Draft/승인됨/반려됨)로, 백엔드 상태머신은 `PENDING/CALCULATED/BLOCKED/AI_DRAFTING/DRAFT/APPROVED/REJECTED`로 통일한다(§6.4). 두 표현의 매핑은 §2·§6 상호 참조.

---

## 1. 개요 (아키텍처·핵심 원칙)

### 1.1 3단 구조와 게이트
```
[데이터 업로드] → [① 단순계산: 결정론 엔진(CRO)] → [② 이상징후·개선점: Claude AI 리포트(Draft)] → [③ 결론: 사람 승인]
                         │ ValidationEngine FATAL                │ 후처리 검증기(환각 차단)
                         ▼ (FATAL 시 차단)                       ▼ (위반 시 재생성/사람 큐)
                    AI 호출 차단(이중)                       Draft 비노출
```

- **Garbage-in 게이트**: ValidationEngine이 FATAL을 반환하면 AI 리포트 생성이 **버튼 비활성 + 서버 API 거부**로 이중 차단된다.
- **CRO 불변 게이트**: 리포트 생성 시점의 CRO를 스냅샷으로 고정. 이후 원본이 바뀌면 "원본 데이터 변경됨 — 재생성 필요" 배지를 표시한다.
- **Human-in-the-loop 게이트**: 모든 리포트는 Draft로만 생성되며 Approved 전 외부 공유/Export(워터마크 없는) 불가.

### 1.2 공통 추상화
- **DataConnector** (§3): 엑셀/CSV 수신·파싱·매핑·정규화.
- **CalculationEngine + ValidationEngine** (§4): 순수 함수 결정론 엔진. CRO와 ValidationReport 산출.
- **ReportEngine** (§5): CRO를 입력으로 Claude 호출, 근거 인용 강제, Draft 생성.
- **EvidenceLedger / AuditLog** (§3, §6): append-only 감사·근거 추적.
- **TenantContext** (§6): 단일 테넌트 가정, RBAC 골격.

---

## 2. 사용자 · UX / 화면

### 2.1 사용자 역할 및 권한 (MVP는 RBAC 골격만)

MVP는 단일 테넌트를 가정하되 AuditLog·승인 워크플로의 무결성을 위해 3개 역할의 권한 골격을 코드 레벨에서 분리한다. SSO/조직 관리 화면은 비범위이며, 역할은 시드 데이터로 부여한다.

| 역할 | 핵심 권한 | 제약 |
|------|-----------|------|
| **재무담당자(Staff)** | 데이터 업로드, 계산·검증 실행, 검증 실패 수정·재업로드, AI 리포트 생성(Draft), 코멘트 작성 | **자기 리포트 승인 불가**(self-approval 차단). Export는 승인된 리포트만 |
| **재무팀장(Reviewer/Approver)** | 위 전체 + 리포트 **승인/반려**, 반려 사유 작성, 승인된 리포트 Export | 데이터 원본(업로드 파일) 삭제 불가 |
| **관리자(Admin)** | 위 전체 + 사용자/역할 시드 확인, 감사 로그 전체 조회, 보존정책·임계값(유동성 경보 기준 등) 설정 | 감사 로그 **수정/삭제 불가**(append-only) |

> 백엔드 RBAC 매핑: Staff=`FINANCE_STAFF`, Approver=`FINANCE_MANAGER`/`FINANCE_APPROVER`, Admin=`ADMIN`/`OWNER` (§6.5).

**권한 표현 원칙**
- 모든 화면은 `TenantContext`에서 현재 사용자 role을 읽어 액션 버튼을 **숨김이 아니라 비활성화 + 사유 툴팁**으로 노출(예: "본인이 생성한 리포트는 승인할 수 없습니다").
- 승인 관련 모든 행위(생성/제출/승인/반려/Export)는 `EvidenceLedger`에 actor·시각·대상·before/after를 기록.

### 2.2 핵심 사용자 여정 (User Journey)

재무담당자 기준 메인 플로우. 각 단계는 게이트로 연결되어, 앞 단계가 통과되지 못하면 다음 단계가 잠긴다.

```
[1] 데이터 업로드 마법사
      │  템플릿 다운로드 → 파일 업로드 → 컬럼 매핑
      ▼
[2] 계산·검증 실행 (결정론적 엔진)
      │  CalculationEngine → ValidationEngine
      ├──[검증 FATAL]──► [2-1] 검증 실패 게이트
      │                       │ 오류 셀 표시 → 수정/재업로드
      │                       └──► [2]로 복귀 (AI 호출 차단 상태 유지)
      ▼ (검증 PASS / WARN만 존재)
[3] 계산 결과 확인 (CRO 확정)
      │  자금일보·현금흐름 / 월결산·대사 결과를 사람이 먼저 확인
      ▼
[4] AI 리포트 생성 (Draft)
      │  CRO 스냅샷 고정 → Claude 리포트 (finding마다 evidence_ref 강제)
      ▼
[5] 리포트 검토
      │  finding 클릭 → 원본 셀 하이라이트 / confidence·caveats 확인
      ▼
[6] 승인 워크플로
      ├── 승인  ──► 상태 Approved
      ├── 반려  ──► 상태 Rejected (+사유) → [4] 재생성 가능
      └── 코멘트 ──► finding 단위 스레드
      ▼
[7] 내보내기 (Export)
      │  승인된 리포트만 PDF/XLSX, 워터마크 없이; Draft는 "DRAFT - 미승인" 워터마크 강제
```

### 2.3 화면별 상세 명세 (와이어프레임 수준)

#### (a) 대시보드 / 홈
```
┌─────────────────────────────────────────────────────────────┐
│ [로고 Finance AX]      재무팀 · 6월 결산   [👤 김담당 ▼]      │
├──────────────┬──────────────────────────────────────────────┤
│ ◀ 사이드바    │  ⚠ 유동성 경보 (2)                            │
│              │  ┌────────────────────────────────────────┐  │
│ ▢ 홈         │  │ 🔴 가용현금 7일 후 안전선 하회 예상       │  │
│ ▢ 업로드      │  │ 🟡 익월 결제 집중일(25일) 부족액 ₩320M  │  │
│ ▢ 자금일보    │  └────────────────────────────────────────┘  │
│ ▢ 월결산      │                                              │
│ ▢ 리포트      │  ▣ 처리 현황 (My Queue)                       │
│ ▢ 감사로그    │   ┌─────────┬─────────┬─────────┬─────────┐  │
│              │   │ 업로드중 │ 검증실패 │ Draft   │ 승인대기 │  │
│ ─────────    │   │   1     │   1 🔴  │   2     │   1     │  │
│ [+ 새 분석]   │   └─────────┴─────────┴─────────┴─────────┘  │
│              │  ▣ 최근 활동 (AuditLog 요약 5건)              │
│              │   • 14:02 김담당 자금일보 Draft 생성          │
│              │   • 11:30 이팀장 5월결산 리포트 승인          │
└──────────────┴──────────────────────────────────────────────┘
```
- **목적**: "지금 무엇을 봐야 하고 무엇이 막혀 있는가"를 30초 안에. 유동성 경보(슬라이스 A)와 처리 큐를 최상단에 배치.
- **유동성 경보 카드**: 가장 위험한 항목부터. 클릭 시 자금일보 화면의 근거 시점으로 딥링크. 이 숫자는 **모두 결정론 엔진 산출(CRO)** 이며 AI 생성이 아님(배지 "계산값").
- **My Queue**: 상태별 카운트. 검증실패는 빨간 배지로 우선 강조.
- **권한 차이**: 팀장 로그인 시 "승인대기" 카드가 본인 결재함 중심.

#### (b) 업로드 마법사 (3-step)
```
Step 1 템플릿 ─────► Step 2 업로드·매핑 ─────► Step 3 검증결과
```
**Step 1 — 템플릿 다운로드**: 분석 종류 선택(○ 자금일보/현금흐름 ○ 월 결산) → 표준 엑셀 템플릿 다운로드(헤더 고정, 필수 컬럼 강조, 예시 1행). "기존 사내 양식 그대로 업로드" 옵션 → Step 2 매핑으로 분기.

**Step 2 — 파일 업로드 & 컬럼 매핑**
```
┌─ 파일 드롭존 ──────────────────┐   ┌─ 컬럼 매핑 ───────────────────┐
│  자금일보_2026-06.xlsx (23KB) │   │ 우리 컬럼      →  표준 필드     │
│  ✓ 시트 "일보" 인식           │   │ "거래일자"  → [거래일 ▼]✓     │
│  4,210 행                     │   │ "입금"      → [입금액 ▼]✓     │
└──────────────────────────────┘   │ "출금"      → [출금액 ▼]✓     │
                                    │ "적요"      → [메모 ▼]        │
                                    │ "잔액"      → [⚠ 미매핑 ▼]    │
                                    └───────────────────────────────┘
```
`DataConnector`가 시트/헤더 자동 감지 → 매핑 추천(편집 가능). 미매핑 필수 필드는 빨간 표시. 날짜/통화 포맷 미리보기("2026/6/1" → `2026-06-01`).

**Step 3 — 검증 결과**
```
┌──────────────────────────────────────────────────────────┐
│  검증 결과: 🔴 치명 오류 2 · 🟡 경고 5 · ✓ 통과 4,203행    │
│  ── AI 리포트 생성이 차단되었습니다 ──                     │
│  🔴 FATAL  D14   잔액 불일치: 전일잔액+입금-출금 ≠ 당일잔액 │
│           (계산 ₩1,204,000 / 입력 ₩1,240,000, 차이 36,000)│
│           [원본 셀 보기] [수정 가이드]                     │
│  🔴 FATAL  D902  거래일 누락(빈 셀)  [해당 행 보기]         │
│  🟡 WARN   D77   동일 적요 중복 거래 추정  [무시] [확인]    │
│  [수정 후 재업로드]   [경고 무시하고 진행 ▶](FATAL 0일 때만 활성) │
└──────────────────────────────────────────────────────────┘
```
FATAL이 1건이라도 있으면 "진행" 버튼 비활성 + "AI 리포트 생성이 차단되었습니다" 배너. 각 오류는 **검증 규칙 ID + 원본 셀 좌표 + 기대값/실제값**으로 구체화(§4 룰셋과 1:1).

#### (c) 자금일보 · 현금흐름 · 유동성 경보 (슬라이스 A)
```
┌─ 자금일보 2026-06-24 ────────────  [계산값 🔒] [Draft 리포트 생성 ▶] ─┐
│ KPI: 기초현금 ₩4.2B │ 입금 ₩1.1B │ 출금 ₩1.4B │ 기말 ₩3.9B         │
├──────────────────────────────────────────────────────────────────┤
│  현금흐름 예측 (향후 30일)                                          │
│   ₩ │      ╱╲        ◀ 안전선 ₩500M (점선)                         │
│     │ ─────╲─────────────╲────── ← 6/30, 7/25 안전선 하회           │
│     └──────────────────────────────────► 일자                      │
│  ⚠ 유동성 경보                                                      │
│   🔴 7/25 예상부족 ₩320M  근거: 만기도래 차입 ₩500M + 급여 ₩280M    │
│      [근거 데이터 보기] (→ 원본 셀/계산식 추적)                      │
│  일자별 자금 테이블 (입금/출금/누적잔액/예측플래그)                  │
└──────────────────────────────────────────────────────────────────┘
```
- 모든 숫자는 CRO 기반(예측 모델도 결정론적 룰 — 확정 입출금 + 반복 패턴 + 만기 스케줄). **AI 추정치 없음.**
- 유동성 경보는 Admin이 설정한 안전선과 비교한 결과. 경보 클릭 → 어떤 거래/만기가 부족을 유발하는지 근거 추적.
- 상태: 미업로드 시 빈 상태, 검증 실패 시 "현금흐름 계산 불가 — 데이터 수정 필요" 게이트.

#### (d) 월결산 · 이상분개 · 계정대사 (슬라이스 B)
```
┌─ 월 결산 2026-05 ──────────  [차변=대변 ✓ 균형] [Draft 리포트 생성 ▶] ┐
│ 탭: [정형분개] [재무제표] [이상분개] [계정대사]                       │
├──────────────────────────────────────────────────────────────────┤
│ ▣ 이상 분개 (12건 / 분개 8,442건 중)                                │
│   유형        │ 분개ID  │ 내용                      │ 룰            │
│  ─────────────┼────────┼──────────────────────────┼───────────────│
│  🔴 차대 불균형│ JE-204 │ 차변 ₩5.0M / 대변 ₩4.5M  │ BALANCE       │
│  🟡 비정상 큰값 │ JE-771 │ 소모품비 ₩88M (평균 12×)  │ OUTLIER_3σ    │
│  🟡 주말 전표   │ JE-990 │ 일요일 매출 분개          │ WEEKEND       │
│  🟡 미배부 계정 │ JE-310 │ 가지급금 미정산 60일+     │ AGING         │
│ ▣ 계정 대사 (Reconciliation)                                       │
│   계정        │ 장부      │ 대사대상  │ 차이      │ 상태           │
│  ─────────────┼──────────┼──────────┼──────────┼────────────────│
│  보통예금     │ ₩3.91B   │ ₩3.91B   │ ₩0       │ ✓ 일치         │
│  외상매출금   │ ₩1.20B   │ ₩1.18B   │ ₩20M 🔴  │ 불일치 [상세]  │
└──────────────────────────────────────────────────────────────────┘
```
이상분개/대사 탐지는 **결정론적 룰**(차대균형, 3σ 이상치, 주말/심야 전표, aging, 대사 차이)로 사람이 검토할 후보를 산출. AI는 이 후보의 **설명·우선순위·개선점**만 다룸(숫자 생성 금지). 차변≠대변이면 상단에 "재무제표 불균형 — 결산 미완료" 게이트, 리포트 생성 차단.

#### (e) AI 리포트 뷰어 (근거 하이라이트 핵심 화면)
```
┌─ [DRAFT] 5월 결산 이상징후 리포트  · 생성 김담당 14:02 · claude-opus-4-8 ┐
│  ⚠ 미승인 Draft — 외부 공유 불가                  [승인요청] [반려] [⋯]  │
├───────────────────────────────┬──────────────────────────────────────┤
│  리포트 본문                    │  근거 패널 (Evidence)                  │
│  ## 이상징후 요약              │   ▣ JE-771 원본 분개                   │
│  소모품비 계정에서 평균 대비    │   ┌────────────────────────────────┐  │
│  12배 큰 분개[1]가 확인됨...    │   │ 시트 "5월분개" 행 771           │  │
│   ┌──────────────────────┐    │   │ │날짜│계정│ 금액 │ 적요    │     │  │
│   │ confidence: 0.86      │    │   │ │5/14│소모│ 88M🟨│ 비품일괄│     │  │
│   │ caveats: 단가 정상,    │    │   └────────────────────────────────┘  │
│   │  수량 급증 가능성 미확인│    │   evidence_ref: cro://JE-771.amount    │
│   └──────────────────────┘    │   [원본 업로드 파일 위치 열기]          │
│  [1] →클릭 시 우측 셀 하이라이트 │                                       │
└───────────────────────────────┴──────────────────────────────────────┘
```
- **finding 단위 구조**: 각 finding은 `{ observation, evidence_refs[], confidence, dataCaveats }`(스키마는 §5.2). 본문의 `[1]` 각주 클릭 → 우측 근거 패널에서 **해당 원본 셀이 노란색 하이라이트**되고 스크롤 이동.
- **evidence_ref 강제**: 근거 없는 문장은 렌더링 단계에서 차단. CRO 밖 숫자가 본문에 등장하면 자동 플래그(빌드 시 "근거 누락 finding 있음 → Draft 생성 실패").
- **confidence/caveats**: finding마다 신뢰도와 주의사항 인라인 표기. confidence 낮음은 회색 + "참고용" 라벨.
- **상태 배지**: `Draft`(주황) / `승인됨`(초록) / `반려됨`(빨강) / `원본변경-재생성필요`(회색 점멸).

#### (f) 승인 워크플로 / 히스토리
```
┌─ 승인 워크플로 ──────────────────────────────────────────────┐
│  현재 상태:  Draft ──▶ ●승인요청 ──▶ ○승인 / ○반려             │
│  [✓ 승인]  [✗ 반려]   (※ 본인 생성 리포트는 승인 비활성)        │
│   반려 시: 사유 입력(필수) "JE-771 근거 부족, 구매요청서 첨부 후 재생성" │
│  ▣ 코멘트 스레드 (finding 단위)                               │
│   #1 finding · 이팀장: "회계기준 재검토 필요" 13:40            │
│      └ 김담당: "수정 반영했습니다" 14:10                       │
│  ▣ 히스토리 (타임라인)                                        │
│   14:02 김담당 Draft 생성 / 14:05 승인 요청 / 14:20 이팀장 반려 / 15:01 재생성(v2) │
└──────────────────────────────────────────────────────────────┘
```
상태 머신: `Draft → SubmittedForApproval → Approved | Rejected`(백엔드 매핑 §6.4). Rejected는 재생성으로 새 버전(v2) 생성, 이전 버전은 히스토리 보존. self-approval 차단. 모든 전이가 `EvidenceLedger`에 기록되어 타임라인과 1:1 매핑.

#### (g) 감사 로그 뷰 (AuditLog / EvidenceLedger)
```
┌─ 감사 로그 (append-only) ────────────────────────────────────┐
│  필터: [기간] [행위자▼] [대상유형: 업로드/계산/리포트/승인▼]  │
│  시각        행위자   액션          대상       상세 / 해시      │
│  06-24 14:02 김담당  REPORT_CREATE  RPT-88    cro_hash=ab3f…  │
│  06-24 14:02 system  AI_CALL        RPT-88    model=opus-4-8  │
│  06-24 13:50 system  VALIDATION     UP-21     FATAL=0,WARN=5  │
│  06-24 13:48 김담당  UPLOAD         UP-21     file=…06.xlsx   │
│  06-24 11:30 이팀장  REPORT_APPROVE RPT-80    [diff 보기]      │
└──────────────────────────────────────────────────────────────┘
```
기록 대상: 업로드, 컬럼매핑 확정, 검증 결과(FATAL/WARN 수), 계산 실행, **AI 호출(모델·프롬프트 캐시·CRO 해시·`_request_id`)**, 리포트 생성/제출/승인/반려, Export. **수정·삭제 불가(append-only)**. 행 클릭 시 스냅샷·해시로 "이 리포트는 이 CRO를 근거로 만들어졌다"를 추적.

### 2.4 화면별 공통 상태 모델

| 상태 | 시각 표현 | 동작 |
|------|-----------|------|
| **Loading** | 스켈레톤 + "계산 중…"(결정론), "리포트 생성 중…"(AI, 스트리밍 진행률) | 액션 비활성 |
| **검증실패 게이트(Blocked)** | 빨간 배너 "AI 리포트 생성이 차단되었습니다" + 오류 리스트 | 생성·Export 버튼 물리적 비활성, 서버도 거부 |
| **계산 완료(Calculated)** | "계산값 🔒" 배지, KPI/테이블 노출 | "Draft 리포트 생성" 활성 |
| **Draft** | 주황 배지 "[DRAFT] 미승인", 전체 워터마크 | 승인요청 가능, 외부 Export 차단 |
| **승인요청(Submitted)** | "승인 대기" 배지 | 승인자 알림, 본인 승인 불가 |
| **승인됨(Approved)** | 초록 배지, 워터마크 제거 | 워터마크 없는 Export 허용 |
| **반려됨(Rejected)** | 빨간 배지 + 사유 | 재생성으로 새 버전 |
| **원본변경(Stale)** | 회색 "재생성 필요" 배지 | 기존 리포트 읽기전용, 재생성 유도 |

핵심 컴포넌트: 업로드 드롭존, 컬럼 매핑 테이블, 검증 결과 리스트, KPI 카드, 현금흐름 차트, 경보 카드, 이상분개/대사 테이블, **마크다운 리포트 렌더러 + evidence 하이라이트 패널**, confidence 바·caveat 칩, 승인 액션 바, 히스토리 타임라인, 감사 로그 그리드.

### 2.5 빈 상태 · 에러 · 검증 차단 UX (Garbage-in 게이트의 사람 표현)
- **빈 상태**: 일러스트 + "아직 데이터가 없습니다. 템플릿을 받아 업로드하세요" + [템플릿 받기][업로드]. 모호한 빈 화면 금지.
- **부분 에러(WARN만)**: 노란 배너 "경고 5건 — 검토 후 진행 가능". 진행 버튼 활성이되 "경고를 무시하고 진행했음"이 AuditLog에 기록됨을 안내.
- **치명 차단(FATAL)**: 상단 고정 배너 "데이터에 치명 오류가 있어 AI 분석을 시작할 수 없습니다." 오류는 "원인-위치-기대값"으로 구체화. [원본 셀 보기][수정 가이드][수정 후 재업로드]. **이중 차단**: 버튼 비활성 + 서버 API 거부(우회 불가).
- **AI 생성 실패(근거 누락)**: evidence_ref 없는 finding 발견 시 "근거를 찾지 못한 항목이 있어 Draft를 만들 수 없습니다"로 실패 처리(빈 근거 리포트 금지).
- **네트워크/타임아웃**: 계산은 재시도, AI 호출은 멱등키로 중복 생성 방지 + "다시 시도" 제공.

---

## 3. 데이터 모델 · 업로드

### 3.1 설계 원칙
- **원본 불변(Immutability)**: 업로드 파일은 절대 수정하지 않는다. `RawDataset/RawRow`에 원문 그대로 적재하고 SHA-256 해시를 `UploadBatch.sourceHash`에 기록. 정규화·계산은 항상 RawRow의 파생물.
- **검증 게이트(Validation Gate)**: FATAL 1건이라도 있으면 `ValidationReport.severity = FATAL`로 막히고, CalculationEngine 및 AI ReportEngine 호출이 차단된다.
- **근거 추적(Evidence Ledger)**: 모든 계산값은 `sourceRowIds`로 RawRow에 연결되어 AI 근거 인용을 가능하게 한다.
- **단일 테넌트 + RBAC 골격**: 모든 테이블에 `tenantId`를 두어 멀티테넌트 전환 비용을 최소화.

### 3.2 입력 데이터 및 업로드 템플릿

템플릿은 회계 프로그램(더존 iCUBE/SmartA, 영림원, 세무사 제공 자료) 표준 양식과 최대한 호환되도록 설계한다. 한글 헤더 1행, 데이터 2행부터. 날짜 `YYYY-MM-DD`, 금액은 원화 정수 표준이되 파서가 `1,000원`·`(1,000)`(괄호 음수)·`₩1,000`·`2024.01.05`·`24/1/5` 변형을 흡수한다.

#### 3.2-A 자금일보 슬라이스

**(A-1) 은행계좌 마스터 — `bank_account_master`**

| 헤더 | 키 | 타입 | 필수 | 예시 | 검증규칙 |
|---|---|---|---|---|---|
| 계좌별칭 | accountAlias | string | Y | 운영_국민_주거래 | 테넌트 내 유일, 1~50자 |
| 은행명 | bankName | string | Y | 국민은행 | 비어있지 않음 |
| 계좌번호 | accountNo | string | Y | 123456-01-789012 | 마스킹 허용, 정규화 시 숫자만 추출해 유일성 검사 |
| 계좌용도 | purpose | enum | N | 운영/급여/세금/예금 | 미지정 시 `운영` |
| 통화 | currency | string | Y | KRW | MVP는 KRW만 허용, 그 외 WARN |
| 기초잔액 | openingBalance | decimal | Y | 152000000 | 숫자 변환 가능, 음수 허용(마이너스통장) |
| 기초잔액기준일 | openingDate | date | Y | 2024-01-01 | 유효 날짜, 거래내역 최소일자 이하 |
| 한도(마이너스/당좌) | overdraftLimit | decimal | N | 100000000 | ≥0 |

**(A-2) 일별 은행거래내역 — `bank_transaction`**

| 헤더 | 키 | 타입 | 필수 | 예시 | 검증규칙 |
|---|---|---|---|---|---|
| 거래일자 | txnDate | date | Y | 2024-03-15 | 유효 날짜, 미래일자 FATAL |
| 계좌별칭 | accountAlias | string | Y | 운영_국민_주거래 | 마스터에 존재해야 함(미존재 시 FATAL) |
| 적요 | description | string | N | (주)가나 물품대 | — |
| 입금액 | depositAmt | decimal | 조건부 | 5000000 | 입금/출금 중 정확히 하나만 > 0 |
| 출금액 | withdrawalAmt | decimal | 조건부 | 0 | 음수 불가 |
| 거래후잔액 | balanceAfter | decimal | N | 157000000 | 제공 시 잔액 연속성 대사(WARN/FATAL) |
| 거래처 | counterparty | string | N | (주)가나 | — |
| 거래구분 | txnType | enum | N | 매출입금/매입출금/급여/세금/이체 | 미지정 시 룰 기반 분류 |

> 검증 핵심: ① 입금·출금 동시 양수 또는 동시 0 → FATAL. ② `balanceAfter` 제공 시 `직전잔액+입금−출금=당일잔액` 불일치 → 누락 거래 의심 FATAL. ③ 기초잔액+누적거래=마지막 잔액 대사.

**(A-3) 예정 입출금 스케줄 — `cashflow_schedule`**

| 헤더 | 키 | 타입 | 필수 | 예시 | 검증규칙 |
|---|---|---|---|---|---|
| 예정일자 | scheduledDate | date | Y | 2024-04-10 | 유효 날짜, 기준일 이후 권장 |
| 구분 | direction | enum | Y | 수금/지급 | 두 값만 허용 |
| 항목유형 | itemType | enum | Y | 어음/외상매출/외상매입/급여/세금/차입상환/이자 | — |
| 거래처 | counterparty | string | N | (주)다라 | — |
| 금액 | amount | decimal | Y | 30000000 | > 0 |
| 확정도 | certainty | enum | N | 확정/예상 | 미지정 시 `예상` |
| 연결계좌 | accountAlias | string | N | 운영_국민_주거래 | 제공 시 마스터 존재 검사 |
| 어음만기/문서번호 | refNo | string | N | 어음2024-0033 | 어음일 경우 권장 |

#### 3.2-B 월 결산 슬라이스

**(B-1) 시산표 — `trial_balance`** (월 결산 1차 입력)

| 헤더 | 키 | 타입 | 필수 | 예시 | 검증규칙 |
|---|---|---|---|---|---|
| 계정코드 | accountCode | string | Y | 0108 | 표준계정 매핑 키 |
| 계정과목 | accountName | string | Y | 외상매출금 | — |
| 기초잔액 | openingBalance | decimal | N | 120000000 | 숫자 변환 |
| 차변합계 | debitTotal | decimal | Y | 80000000 | ≥0 |
| 대변합계 | creditTotal | decimal | Y | 50000000 | ≥0 |
| 기말잔액 | closingBalance | decimal | N | 150000000 | 제공 시 `기초±(차−대)` 대사 |
| 회계기간 | period | string | Y | 2024-03 | `YYYY-MM` |

> 검증 핵심: **전체 차변합계 = 전체 대변합계**(대차평형). 불일치 시 FATAL → 결산 계산 및 AI 차단.

**(B-2) 총계정원장/전표 — `journal_entry`**

| 헤더 | 키 | 타입 | 필수 | 예시 | 검증규칙 |
|---|---|---|---|---|---|
| 전표번호 | voucherNo | string | Y | 20240315-0007 | 동일 전표 내 차대 그룹핑 키 |
| 전표일자 | entryDate | date | Y | 2024-03-15 | 회계기간 범위 내 |
| 행번호 | lineNo | int | N | 1 | 전표 내 유일 |
| 차대구분 | drcr | enum | Y | 차변/대변 | 두 값만 허용 |
| 계정코드 | accountCode | string | Y | 0401 | — |
| 계정과목 | accountName | string | N | 상품매출 | — |
| 금액 | amount | decimal | Y | 10000000 | > 0 |
| 적요 | description | string | N | 3월 매출 | — |
| 거래처 | counterparty | string | N | (주)마바 | AR/AP 대사용 |

> 검증 핵심: 전표번호별 **차변합계 = 대변합계**(전표 균형). 시산표·원장 합계 교차 대사.

**(B-3) 보조원장 AR/AP — `subledger_ar`, `subledger_ap`** (동일 스키마, `arap` 구분)

| 헤더 | 키 | 타입 | 필수 | 예시 | 검증규칙 |
|---|---|---|---|---|---|
| 구분 | arap | enum | Y | AR/AP | — |
| 거래처코드 | partnerCode | string | N | P0012 | — |
| 거래처명 | partnerName | string | Y | (주)마바 | — |
| 기초잔액 | openingBalance | decimal | N | 20000000 | — |
| 당기증가 | increase | decimal | N | 15000000 | ≥0 |
| 당기감소(회수/지급) | decrease | decimal | N | 18000000 | ≥0 |
| 기말잔액 | closingBalance | decimal | Y | 17000000 | `기초+증가−감소` 대사 |
| 회계기간 | period | string | Y | 2024-03 | — |

> 검증 핵심: 보조원장 거래처 기말잔액 합계 = 시산표 통제계정(외상매출금/외상매입금) 잔액 → **계정 대사**(불일치는 WARN, 임계 초과 시 이상징후 후보).

**(B-4) 고정자산·감가상각 — `fixed_asset`**

| 헤더 | 키 | 타입 | 필수 | 예시 | 검증규칙 |
|---|---|---|---|---|---|
| 자산코드 | assetCode | string | Y | FA-0007 | 유일 |
| 자산명 | assetName | string | Y | 생산설비A | — |
| 자산분류 | assetClass | enum | Y | 기계장치/비품/차량운반구/건물 | — |
| 취득일 | acquisitionDate | date | Y | 2021-05-01 | — |
| 취득원가 | acquisitionCost | decimal | Y | 60000000 | > 0 |
| 내용연수(월) | usefulLifeMonths | int | Y | 60 | > 0 |
| 상각방법 | method | enum | Y | 정액/정률 | — |
| 기초감가상각누계 | accumDepOpening | decimal | Y | 24000000 | ≥0, ≤취득원가 |
| 당월상각비 | monthlyDepreciation | decimal | N | 1000000 | 제공 시 엔진 재계산 대사 |
| 회계기간 | period | string | Y | 2024-03 | — |

**(B-5) 전기 비교 재무제표 — `comparative_fs`**

| 헤더 | 키 | 타입 | 필수 | 예시 | 검증규칙 |
|---|---|---|---|---|---|
| 재무제표구분 | statement | enum | Y | BS/IS | — |
| 항목명 | lineItem | string | Y | 매출액 | 표준 라인아이템 매핑 |
| 당기금액 | currentAmt | decimal | N | 1200000000 | — |
| 전기금액 | priorAmt | decimal | Y | 1000000000 | — |
| 회계기간 | period | string | Y | 2024-03 | — |
| 비교기간 | priorPeriod | string | Y | 2023-03 | — |

### 3.3 업로드 처리 파이프라인

업로드는 BullMQ 잡으로 비동기 처리하며, 각 단계는 멱등하고 실패 시 해당 `UploadBatch` 상태로 정확히 재현 가능하다.

```
파일 수신
  │  (1) RECEIVE: multipart 업로드, 원본 바이트 보관 → SHA-256 해시 산출
  ▼
파싱 (PARSE)
  │  - xlsx: SheetJS로 시트별 2차원 배열 추출, 병합셀/숨김행 처리
  │  - csv: 인코딩 감지(UTF-8/EUC-KR/CP949) → papaparse, 구분자 자동 추정
  │  - 헤더행 탐지, 합계/소계 행 플래그
  │  - 결과를 RawRow로 적재(rowIndex, 원문 셀 그대로) — 무손실
  ▼
컬럼 매핑 (MAP)
  │  - templateKey별 표준 헤더 사전 + 한글 동의어 사전으로 자동 매핑 제안
  │    (예: "출금","지급액","인출" → withdrawalAmt)
  │  - 신뢰도 낮은 컬럼은 사용자 매핑 UI로 확인(ColumnMapping 저장 → 재사용)
  ▼
타입 변환·정규화 (NORMALIZE)
  │  - 날짜: 다중 포맷 파서 → ISO(YYYY-MM-DD)
  │  - 금액: 통화기호/콤마 제거, 괄호·△·▲ 음수 처리, decimal(정수원)로
  │  - enum: 동의어 → 표준값 / 합계·공백·주석행 제외 / 트림·전각→반각
  │  - 변환 실패 셀은 폐기하지 않고 cellErrors에 기록(원문 보존)
  ▼
검증 (VALIDATE)
  │  - ValidationEngine: 필수누락/타입오류/대차평형/잔액연속성/대사
  │  - severity: FATAL > WARN > INFO 집계 → ValidationReport 생성
  │  - FATAL 존재 시 배치 status=BLOCKED → 계산·AI 단계 진입 금지
  ▼
RawDataset 적재 확정 (COMMIT)
  │  - 정규화 결과를 도메인 staging(BankTransaction/TrialBalance/…)로 투영
  │  - UploadBatch.sourceHash, rowCount, parsedAt 확정
  ▼
스냅샷 (SNAPSHOT)
     - 원본 파일 객체스토리지 보관 + sourceHash로 봉인
     - AuditLog: UPLOAD_COMMITTED(batchId, hash, actor) 기록
```

**원본 스냅샷 해시**: 업로드 직후 원본 바이트의 SHA-256을 `UploadBatch.sourceHash`에 기록. 동일 해시 재업로드는 중복으로 감지(경고 후 스킵 가능). 정규화·계산 결과에 `sourceHash`를 봉인하여 "이 리포트가 어떤 파일에서 나왔는가"를 변조 불가능하게 증명한다.

### 3.4 핵심 도메인 데이터 모델 (Prisma)

```prisma
// ---------- 테넌시 & 사용자 (단일 테넌트 가정, RBAC 골격) ----------
model Tenant {
  id          String   @id @default(cuid())
  name        String
  createdAt   DateTime @default(now())
  users       User[]
  uploads     UploadBatch[]
  accounts    Account[]
  bankAccounts BankAccount[]
}

enum Role { OWNER  FINANCE_MANAGER  FINANCE_STAFF  VIEWER }

model User {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  email     String   @unique
  name      String
  role      Role     @default(FINANCE_STAFF)
  createdAt DateTime @default(now())
  uploads   UploadBatch[]
  approvals Report[] @relation("Approver")
  @@index([tenantId])
}

// ---------- 업로드 & 원본 (불변) ----------
enum TemplateKey {
  BANK_ACCOUNT_MASTER  BANK_TRANSACTION  CASHFLOW_SCHEDULE
  TRIAL_BALANCE  JOURNAL_ENTRY  SUBLEDGER_AR  SUBLEDGER_AP
  FIXED_ASSET  COMPARATIVE_FS
}

enum BatchStatus {
  RECEIVED  PARSED  MAPPED  VALIDATED
  BLOCKED      // FATAL 검증 → 계산/AI 차단
  COMMITTED  FAILED
}

model UploadBatch {
  id          String      @id @default(cuid())
  tenantId    String
  tenant      Tenant      @relation(fields: [tenantId], references: [id])
  uploadedById String
  uploadedBy  User        @relation(fields: [uploadedById], references: [id])
  templateKey TemplateKey
  fileName    String
  sourceHash  String      // SHA-256 원본 스냅샷 해시
  storageKey  String      // 객체스토리지 원본 위치
  period      String?     // YYYY-MM
  status      BatchStatus @default(RECEIVED)
  rowCount    Int?
  parsedAt    DateTime?
  createdAt   DateTime    @default(now())
  rawDataset  RawDataset?
  validation  ValidationReport?
  columnMaps  ColumnMapping[]
  @@unique([tenantId, sourceHash]) // 동일 파일 중복 차단
  @@index([tenantId, templateKey, period])
}

model ColumnMapping {
  id          String      @id @default(cuid())
  batchId     String
  batch       UploadBatch @relation(fields: [batchId], references: [id])
  sourceHeader String     // 파일의 원본 헤더
  targetField String      // 표준 필드 키
  confidence  Float
  confirmedBy String?
  @@index([batchId])
}

model RawDataset {
  id        String      @id @default(cuid())
  batchId   String      @unique
  batch     UploadBatch @relation(fields: [batchId], references: [id])
  sheetName String?
  rows      RawRow[]
  createdAt DateTime    @default(now())
}

model RawRow {
  id         String     @id @default(cuid())
  datasetId  String
  dataset    RawDataset @relation(fields: [datasetId], references: [id])
  rowIndex   Int        // 원본 행 번호(1-base)
  raw        Json       // 원문 셀 — 무손실
  normalized Json?      // 정규화 결과
  cellErrors Json?      // 셀 단위 변환오류
  isExcluded Boolean    @default(false)
  @@index([datasetId, rowIndex])
}

// ---------- 계정과목 마스터 (표준화) ----------
enum StatementType { BS  IS }

model Account {
  id            String   @id @default(cuid())
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  code          String   // 회사 계정코드 (예: 0108)
  name          String
  stdCode       String?  // 표준계정 매핑 코드
  statement     StatementType?
  fsLineItem    String?  // 매핑된 재무제표 라인
  normalSide    String?  // DEBIT/CREDIT
  isControl     Boolean  @default(false) // 통제계정(AR/AP)
  @@unique([tenantId, code])
  @@index([tenantId, stdCode])
}

// ---------- 자금일보 도메인 ----------
model BankAccount {
  id             String   @id @default(cuid())
  tenantId       String
  tenant         Tenant   @relation(fields: [tenantId], references: [id])
  alias          String
  bankName       String
  accountNoNorm  String   // 숫자만 정규화
  purpose        String?
  currency       String   @default("KRW")
  openingBalance Decimal  @db.Decimal(18, 0)
  openingDate    DateTime
  overdraftLimit Decimal? @db.Decimal(18, 0)
  transactions   BankTransaction[]
  @@unique([tenantId, alias])
  @@index([tenantId, accountNoNorm])
}

model BankTransaction {
  id            String      @id @default(cuid())
  tenantId      String
  batchId       String      // 출처 배치
  sourceRowId   String      // 근거 RawRow
  bankAccountId String
  bankAccount   BankAccount @relation(fields: [bankAccountId], references: [id])
  txnDate       DateTime
  description   String?
  depositAmt    Decimal     @db.Decimal(18, 0) @default(0)
  withdrawalAmt Decimal     @db.Decimal(18, 0) @default(0)
  balanceAfter  Decimal?    @db.Decimal(18, 0)
  counterparty  String?
  txnType       String?
  @@index([tenantId, bankAccountId, txnDate])
  @@index([batchId])
}
// CashflowSchedule는 BankTransaction과 유사 구조(direction/itemType/amount/scheduledDate/certainty)

// ---------- 월 결산 도메인 ----------
model TrialBalance {
  id            String   @id @default(cuid())
  tenantId      String
  batchId       String
  sourceRowId   String
  period        String   // YYYY-MM
  accountCode   String
  accountName   String
  openingBalance Decimal? @db.Decimal(18, 0)
  debitTotal    Decimal  @db.Decimal(18, 0)
  creditTotal   Decimal  @db.Decimal(18, 0)
  closingBalance Decimal? @db.Decimal(18, 0)
  @@unique([tenantId, period, accountCode])
  @@index([tenantId, period])
}

enum DrCr { DEBIT  CREDIT }

model JournalEntry {
  id           String   @id @default(cuid())
  tenantId     String
  batchId      String
  sourceRowId  String
  period       String
  voucherNo    String
  lineNo       Int?
  entryDate    DateTime
  drcr         DrCr
  accountCode  String
  accountName  String?
  amount       Decimal  @db.Decimal(18, 0)
  description  String?
  counterparty String?
  @@index([tenantId, period, voucherNo])
  @@index([tenantId, accountCode, entryDate])
}
// Subledger, FixedAsset, ComparativeFS도 동일 패턴:
// tenantId + batchId + sourceRowId + period + 도메인 필드 + 인덱스

// ---------- 계산 결과 (CRO) — AI는 이 밖의 숫자 생성 금지 ----------
enum SliceType { CASH_DAILY  MONTHLY_CLOSE }

model CalculationResult {
  id          String    @id @default(cuid())
  tenantId    String
  batchId     String    // 입력 배치(대표)
  slice       SliceType
  period      String?
  metricKey   String    // 예: liquidity.runwayDays, close.bs.totalAssets
  value       Decimal   @db.Decimal(20, 2)
  unit        String?   // KRW / DAYS / RATIO
  sourceRowIds String[] // 근거 RawRow IDs (Evidence Ledger)
  formula     String?   // 결정론적 산식 식별자
  computedAt  DateTime  @default(now())
  @@index([tenantId, slice, period])
  @@index([tenantId, metricKey])
}

// ---------- 검증 리포트 ----------
enum Severity { FATAL  WARN  INFO }

model ValidationReport {
  id        String      @id @default(cuid())
  tenantId  String
  batchId   String      @unique
  batch     UploadBatch @relation(fields: [batchId], references: [id])
  severity  Severity    // 최고 심각도 — FATAL이면 AI 차단
  fatalCount Int        @default(0)
  warnCount Int         @default(0)
  findings  Json        // [{code,severity,rowIndex,field,message}]
  createdAt DateTime    @default(now())
  @@index([tenantId])
}

// ---------- 리포트 (Draft → 승인) ----------
enum ReportStatus { DRAFT  APPROVED  REJECTED }

model Report {
  id            String       @id @default(cuid())
  tenantId      String
  slice         SliceType
  period        String?
  status        ReportStatus @default(DRAFT) // 항상 Draft로 생성
  title         String
  bodyMarkdown  String       // AI 생성 본문(근거 인용 포함)
  calcResultIds String[]     // 인용한 CRO IDs
  citations     Json         // [{claim, croId, sourceRowIds}]
  approverId    String?
  approver      User?        @relation("Approver", fields: [approverId], references: [id])
  approvedAt    DateTime?
  createdAt     DateTime     @default(now())
  @@index([tenantId, slice, period, status])
}

// ---------- 감사 로그 (Evidence Ledger) ----------
model AuditLog {
  id         String   @id @default(cuid())
  tenantId   String
  actorId    String?
  action     String   // UPLOAD_COMMITTED / VALIDATION_BLOCKED / AI_INVOKED / REPORT_APPROVED ...
  targetType String   // UploadBatch / Report ...
  targetId   String
  metadata   Json     // hash, severity, model, tokenUsage 등
  createdAt  DateTime @default(now())
  @@index([tenantId, targetType, targetId])
  @@index([tenantId, action, createdAt])
}
```

**관계·인덱스 설계 의도**
- 모든 도메인 테이블에 `tenantId`를 두고 조회 인덱스 선두 컬럼으로 사용 → 멀티테넌트 전환 시 격리/성능 동시 확보.
- `BankTransaction(tenantId, bankAccountId, txnDate)`, `TrialBalance(tenantId, period, accountCode)`, `JournalEntry(tenantId, period, voucherNo)`는 일별 잔액 누적·기간 시산표 조회·전표 균형 검증의 핫패스에 맞춘 복합 인덱스.
- `UploadBatch @@unique([tenantId, sourceHash])`로 동일 파일 중복 적재를 DB 레벨에서 차단.
- 모든 투영 테이블이 `sourceRowId`/`sourceRowIds`로 RawRow를 역참조 → AI 근거 인용의 종착점.

### 3.5 계정과목 표준화 매핑

회계 프로그램별 계정코드 체계가 제각각이므로(더존 4자리 vs 영림원 vs 수기), 회사 계정 → **표준 계정(stdCode) → 재무제표 라인아이템** 2단계 매핑을 둔다.

1. **표준 차트 시드**: K-GAAP 중소기업 표준 계정과목표 기준으로 `stdCode`, `statement(BS/IS)`, `fsLineItem`, `normalSide` 시드.
2. **자동 매핑 제안**: 업로드된 `accountCode`/`accountName`을 (a) 코드 패턴 규칙, (b) 계정명 동의어 사전, (c) 임베딩 유사도 보조로 표준계정 후보 추천. 신뢰도와 함께 `Account.stdCode`에 저장.
3. **사람 확정 + 재사용**: 임계 미만/미매핑 계정은 사용자가 확정. 확정 매핑은 테넌트 단위 영속화되어 다음 달부터 자동 적용(월마다 반복 입력 안 함).
4. **미매핑 차단**: 표준 매핑이 없는 계정이 남으면 결산 계산을 WARN으로 표시하고 합계에 "미분류" 버킷 명시(숫자를 임의로 끼워넣지 않음). 단, BS/IS 어느 쪽에도 미귀속인 계정은 §4의 `crit.accountMappingFailure`로 FATAL 차단.
5. **통제계정 표시**: `isControl=true` 계정은 보조원장(AR/AP) 합계와의 대사 대상으로 자동 연결.

### 3.6 멀티 기간(월) 데이터 관리와 전기 비교

1. **기간 키 일원화**: 결산 도메인 모든 데이터는 `period`(YYYY-MM)를 보유. `TrialBalance @@unique([tenantId, period, accountCode])`로 월별 1개 시산표 스냅샷 보장.
2. **월별 스냅샷 불변 + 재업로드 버전**: 동일 월 재업로드 시 새 `UploadBatch`(새 sourceHash)가 생성되고, 직전 배치는 보존된 채 "활성 배치" 포인터만 최신으로 변경. 과거 리포트는 자신이 인용한 배치/CRO를 그대로 가리켜 재현성 유지.
3. **전기 비교(두 경로)**: ① **자체 누적** — 이전 월/전년 동월 `CalculationResult`가 있으면 결정론 엔진이 당기 CRO와 직접 비교(증감액·증감률). ② **업로드 비교표** — 과거 데이터 없는 첫 도입 기업은 `comparative_fs`(B-5)로 전기 금액 직접 업로드. 이 경우도 전기 금액은 RawRow에 봉인된 입력값(AI 생성 아님).
4. **YoY/MoM 메트릭의 CRO화**: 증감률 등 파생 지표도 모두 `CalculationResult`로 저장하고 `sourceRowIds`에 당기·전기 출처를 함께 담는다. AI는 "매출 20% 증가" 서술을 반드시 이 비교 CRO를 인용해서만 작성.
5. **기간 정합성 검증**: `period`·`priorPeriod`가 회계적으로 대응하는지 검증. 비교 대상 월 결손이면 비교 메트릭을 생성하지 않고 "비교 불가(데이터 없음)"로 명시 — 빈 값을 추정으로 채우지 않는다.

---

## 4. 계산 · 검증 룰셋

> 이 섹션은 **코드가 100% 책임지는 결정론 영역**이다. 모든 숫자는 여기 정의된 metric을 통해 산출되며, AI(ReportEngine)는 그 결과물(CRO)과 ValidationReport 플래그만 입력으로 받는다. AI는 이 metric 밖의 숫자를 생성·추정·보정할 수 없다.

### 4.0 공통 규약
- **금액 단위**: 정수 최소화폐단위(원)로 저장, `Decimal`(decimal.js / Prisma.Decimal)로 연산. `number` 직접 산술 금지.
- **반올림**: 표시용 `ROUND_HALF_UP`, 소수 둘째(비율은 % 소수 둘째). 내부 계산은 반올림하지 않고 누적.
- **기간 표기**: `asOfDate`(기준일), `period`(YYYY-MM), `[from, to)` 반개구간.
- **부호 규약**: 자금수지·증감액은 부호 보존(유입 +, 유출 −). 잔액은 음수 가능(당좌차월).
- **CRO 식별**: 모든 metric 출력은 `{metricId, value, unit, period, inputsHash, evidenceCells[]}` 형태로 EvidenceLedger에 기록. `evidenceCells`는 원천 셀 좌표(`fileId:sheet!A1` 또는 `rowId`)로 추적성 강제.

### 4.1 CalculationEngine — 선언적 Metric 정의

```ts
interface MetricDef {
  id: string;
  name: string;
  formula: string;          // 사람이 읽는 공식(검증·문서화용)
  compute: (ctx: CalcContext) => Decimal | CroValue; // 순수함수
  inputs: InputRef[];
  unit: 'KRW' | 'ratio' | 'pct' | 'days' | 'count';
  period: 'instant' | 'daily' | 'monthly' | 'range';
}
```

#### 4.1-A 자금일보·현금흐름 (슬라이스 A)

| id | 이름 | 공식 | 입력 | 단위 | 기간 |
|---|---|---|---|---|---|
| `cash.bankBalance.byBank` | 은행별 잔액 | `Σ(입금−출금)` per 계좌(또는 일자별 마지막 명시잔액 우선) | 은행거래내역 | KRW | instant |
| `cash.bankBalance.total` | 총 가용잔액 | `Σ byBank` (가용 계좌만) | byBank, 계좌메타 | KRW | instant |
| `cash.dailyNet` | 일일 자금수지 | `Σ당일입금 − Σ당일출금` | 은행거래내역(일자별) | KRW | daily |
| `cash.available` | 가용자금 | `총가용잔액 + 즉시인출가능약정한도 − 당일확정지급` | total, 약정한도, 확정지급 | KRW | instant |
| `cash.forecast.confirmed` | 향후 N일 확정 현금흐름 | `잔액_d = 잔액_{d-1} + 확정회수_d − 확정지급_d`. **확정**만 포함(만기 어음·약정·대출원리금) | 받을어음·지급어음 만기, 차입상환, 확정 정기지급 | KRW | range |
| `cash.forecast.minBalance` | 예측구간 최저잔액일 | `min_d 잔액_d` 및 `argmin` | forecast.confirmed | KRW | range |
| `ar.expectedCollections` | 회수예정 집계 | `Σ 미회수채권` group by 만기버킷(0–7/8–30/31–60/60+) | 매출채권 보조원장 | KRW | range |
| `ap.scheduledPayments` | 지급예정 집계 | `Σ 미지급` group by 만기버킷 | 매입채무 보조원장 | KRW | range |
| `cash.liquidityGap` | 유동성 갭(N일) | `cash.available + Σ확정회수 − Σ확정지급` | available, ar/ap | KRW | range |
| `cash.runwayDays` | 현금 소진일수 | `cash.available / max(평균일일순유출, ε)` | available, 최근30일 dailyNet 평균 | days | instant |

> `확정 vs 예상` 구분이 핵심: forecast는 **만기·약정이 확정된 항목만** 포함하고, 미확정 회수예정은 `ar.expectedCollections`로 분리(예측 잔액에 섞지 않음).

#### 4.1-B 월결산 (슬라이스 B)

| id | 이름 | 공식 | 단위 | 기간 |
|---|---|---|---|---|
| `tb.debitTotal` | 시산표 차변 합계 | `Σ 모든계정.차변` | KRW | monthly |
| `tb.creditTotal` | 시산표 대변 합계 | `Σ 모든계정.대변` | KRW | monthly |
| `tb.balanceCheck` | 차대 일치 검증값 | `debitTotal − creditTotal` (=0) | KRW | monthly |
| `je.depreciation.sl` | 감가상각(정액) | 자산별 `(취득가−잔존)/내용연수(월) × 당월귀속월수` | KRW | monthly |
| `je.depreciation.db` | 감가상각(정률) | `기초장부가 × 정률 ÷ 12 × 귀속월수`, `누계 ≤ 취득가−잔존` 캡 | KRW | monthly |
| `je.prepaid.amort` | 선급비용 안분 | `선급총액 × (당월일수/약정총일수)` 또는 월할 | KRW | monthly |
| `je.accrual.recurring` | 정기 미지급 계상 | 약정 정기금액 × 당월 미계상분 | KRW | monthly |
| `tb.adjusted` | 결산정리 후 시산표 | `수정전시산표 + Σ결산분개(je.*)` | KRW | monthly |
| `fs.bs` | 재무상태표 매핑 | 계정→BS 집계. `자산 = 부채 + 자본` 강제 | KRW | monthly |
| `fs.is` | 손익계산서 매핑 | 수익/비용 집계 → 매출총이익/영업이익/당기순이익 | KRW | monthly |
| `fs.cf.indirect` | 현금흐름표(간접법) | `당기순이익 + 비현금비용 ± 운전자본증감 ± 투자·재무` | KRW | monthly |
| `var.yoyAmount` | 전기대비 증감액 | `당기 − 전기` | KRW | monthly |
| `var.yoyPct` | 전기대비 증감률 | `(당기−전기)/|전기|×100` (전기=0이면 null+플래그) | pct | monthly |
| `var.budgetPct` | 예산대비 증감률 | `(실적−예산)/|예산|×100` | pct | monthly |

#### 4.1-C 비율 (참고 지표)

| id | 이름 | 공식 | 단위 |
|---|---|---|---|
| `ratio.current` | 유동비율 | `유동자산/유동부채×100` | pct |
| `ratio.quick` | 당좌비율 | `(유동자산−재고)/유동부채×100` | pct |
| `ratio.cashRatio` | 현금비율 | `현금성자산/유동부채×100` | pct |
| `ratio.debtToEquity` | 부채비율 | `부채총계/자본총계×100` | pct |
| `ratio.dso` | 매출채권회수기간 | `매출채권/매출액×당기일수` | days |

> 비율은 **분모 0/음수 가드** 필수: 분모≤0이면 `value=null`, `ratio.denominatorInvalid` info 플래그. AI는 null 비율로 해석을 만들지 않는다.

### 4.2 ValidationEngine 룰셋

각 규칙: `{ruleId, severity, predicate, defaultThreshold, evidenceCells, message}`. **치명(critical) 규칙이 하나라도 발화하면 `gate.aiCall = BLOCKED`** — ReportEngine 호출 자체가 차단되고 정정 전까지 Draft 생성 불가.

#### 4.2-A 치명 (Critical / FATAL) — AI 게이트 차단

| ruleId | 판정식 | 기본 임계값 | 비고 |
|---|---|---|---|
| `crit.debitCreditMismatch` | `|debitTotal − creditTotal| > 0` | 정확히 0 | decimal 정밀비교, 반올림 오차도 불허 |
| `crit.tbSumMismatch` | `|Σ계정별차변 − debitTotal| > 0` (대변 동일) | 0 | 부분합 vs 총합 |
| `crit.bsImbalance` | `|자산 − (부채+자본)| > 0` | 0 | 대차평균 위반 |
| `crit.missingRequiredColumn` | 필수 컬럼 ∉ 헤더 | 자금: 계좌/일자/금액, 결산: 계정/차변/대변 | 매핑 단계 |
| `crit.periodGap` | 일자 시퀀스 결번·중복(영업일 기준) | 연속성 100% | 주말·공휴일 보정 |
| `crit.negativeOnNonNegativeField` | `value<0` on {취득가,액면,내용연수,재고수량,매출액} | <0 금지 | 잔액·수지 제외 |
| `crit.accountMappingFailure` | 계정코드 ∉ 매핑테이블(BS/IS 미귀속) | 미매핑 0건 | 1건이라도 차단 |
| `crit.duplicatePrimaryKey` | 동일 (거래ID/전표번호) 중복 | 0건 | 이중계상 방지 |
| `crit.dateParseFailure` | 일자 파싱 실패 ∨ 기준일 범위 밖 | 0건 | |

#### 4.2-B 경고 (Warning) — 게이트 통과, 플래그 전달

| ruleId | 판정식 | 기본 임계값(중소기업) |
|---|---|---|
| `warn.momChange` | `|전월비 증감률| > θ` (계정별) | θ = ±30%(손익), 자산 ±20% |
| `warn.zscoreOutlier` | `|(x−μ)/σ| > θ` (최근 12기간) | θ = 3.0 |
| `warn.iqrOutlier` | `x < Q1−k·IQR ∨ x > Q3+k·IQR` | k = 1.5 |
| `warn.subledgerVsGL` | `|보조원장합 − GL잔액| > θ` | θ = 10,000원 |
| `warn.arSpike` | `미회수채권_당월/전월 − 1 > θ` | θ = +25% |
| `warn.overdueAr` | `Σ만기경과채권/Σ총채권 > θ` | θ = 15% |
| `warn.liquidityAlert` | `forecast.minBalance < θ` ∨ `runwayDays < D` | θ = 0원 / D = 30일 |
| `warn.budgetOverrun` | `var.budgetPct > θ` (비용) | θ = +15% |
| `warn.depreciationDrift` | `|당월상각 − 전월상각|/전월상각 > θ` | θ = 5% |

> 임계값은 모두 `TenantConfig.thresholds`로 오버라이드 가능. z-score/IQR은 표본 `n ≥ 6`일 때만 평가(미달 시 `info.insufficientHistory`).

#### 4.2-C 정보 (Info) — 참고 표시

| ruleId | 판정식 |
|---|---|
| `info.newAccount` | 계정코드가 직전 12기간 내 미출현 |
| `info.newCounterparty` | 거래처가 과거 이력에 없음 |
| `info.zeroPriorBase` | `var.yoyPct` 계산 시 전기=0 |
| `info.insufficientHistory` | 통계 룰 표본부족(n<6) |
| `info.roundingResidual` | 표시반올림 누적잔차 발생 |

### 4.3 이상치 — '플래그(코드)' vs '해석(AI)'의 경계

**원칙**: CalculationEngine/ValidationEngine은 **플래그(사실)만** 생성한다. "왜 생겼는가", "어떤 조치를 권고하는가"는 AI(ReportEngine)의 영역이며, AI는 플래그의 숫자(`value`, `expected`)를 **그대로 인용**할 뿐 재계산·재추정하지 않는다.

```ts
interface Flag {
  ruleId: string;                 // 'warn.zscoreOutlier'
  type: 'critical' | 'warning' | 'info';
  metricId: string;
  accountId?: string;
  value: Decimal;                 // 실제 관측값 (코드가 계산)
  expected?: Decimal | { range: [Decimal, Decimal] };
  deviation?: Decimal;            // value − expected 또는 z/배수
  threshold: Decimal;            // 발화 임계값 (재현성)
  period: string;
  evidenceCells: string[];        // ['ledger.xlsx:Sheet1!C42', 'rowId:8831']
  computedAt: string;
  inputsHash: string;
  // 주의: 'reason'/'recommendation' 필드 없음 — 해석은 AI 산출물로 분리
}
```
- **경계 규칙 1**: Flag에 자연어 `reason`/`recommendation`이 **없다**. 있으면 설계 위반.
- **경계 규칙 2**: AI는 `evidenceCells`(=evidence_ref)를 인용하지 못하는 주장을 쓸 수 없다. 인용 가능한 숫자는 Flag/CRO 안의 값뿐.
- **경계 규칙 3**: `critical` Flag가 존재하면 AI는 호출되지 않으므로, 치명 플래그는 해석 없이 "데이터 정정 필요" UI로 직접 노출.

### 4.4 결정론 · 재현성 · 테스트 전략
- **Decimal 안전연산**: `+ - * /` 직접 연산 금지(`.plus/.minus/.times/.dividedBy`). 나눗셈은 `분모≤0` 가드 후, 내부 정밀도 `DECIMAL_PLACES=10`, 표시 직전에만 반올림. 통화 합산은 정수 원 단위로 누적.
- **순수성 보장**: 모든 `compute()`는 부수효과 없는 순수함수. 현재시각·랜덤·전역상태 참조 금지(기준일은 `asOfDate` 주입). 안정정렬 + 명시적 tie-breaker로 순서 의존성 제거.
- **동일 입력 → 동일 출력**: `inputsHash = SHA256(정규화 입력 + 설정 + engineVersion)`. 동일 hash면 캐시 재사용, 결과 불일치 시 회귀. `engineVersion`을 CRO에 각인.
- **테스트 전략**: ① metric별 골든 케이스(정상/경계/0분모/음수/빈입력, 감가상각 정액·정률·기중취득). ② 속성기반 테스트(`차변==대변`, `자산==부채+자본`, `Σ버킷==총계` 불변식). ③ 스냅샷/회귀(CRO 전체 diff 리뷰). ④ 재현성 테스트(동일 입력 100회 바이트 동일). ⑤ Validation 게이트 테스트(각 critical 룰 발화 시 "AI 호출 0회" 보장). ⑥ CI 게이트(커버리지 + 불변식 통과 전 머지 차단).

---

## 5. CRO · AI 리포트 · 프롬프트

이 섹션은 핵심 데이터 계약과 AI 리포트 생성 파이프라인을 정의한다. 모든 모델 호출은 `@anthropic-ai/sdk`로 `claude-opus-4-8`를 호출하며, 사고는 adaptive thinking(`thinking: {type:"adaptive"}`), 구조화 출력은 `output_config.format`(json_schema)를 사용한다. 환각 차단의 기계적 핵심은 "AI는 CRO 밖의 숫자를 생성하지 않는다"이며, 이는 **프롬프트 규칙 + 후처리 검증기**로 이중 강제한다.

### 5.1 CRO(Calculation Result Object) JSON 스키마

CRO는 결정론 엔진의 출력이자 **코드 → AI로 흐르는 단방향 데이터 계약**이다. AI는 CRO를 읽기만 하고, CRO에 존재하는 `metricId`/`flagId`만 `evidence_ref`로 인용할 수 있다.

- **항목 ID 체계**: 인용 가능한 모든 수치/플래그는 결정론적 ID를 가진다. `{domain}.{period}.{name}`(예: `cf.2026-06.net_change`). 같은 입력 → 같은 ID(프롬프트 캐시 친화·멱등).
- **`engine_version`**: 재현성·감사용. 엔진 로직 변경 시 동일 입력의 수치가 달라질 수 있으므로 CRO에 박제.
- **`metrics[]`**: 검증된 수치(ID·값·단위·source pointer).
- **`flags[]`**: 결정론 규칙이 탐지한 이상징후/경보(`metric_refs`로 파생 추적).
- **`validationSummary`**: 데이터 품질. `fatal`이 있으면 상위 오케스트레이터가 AI 호출 자체를 차단.

```json
{
  "cro_version": "1.0",
  "cro_id": "cro_cf_2026-06_8f1a2c",
  "tenant_id": "t_single_mvp",
  "slice": "cashflow_daily",
  "engine_version": "calc-engine@2.3.1",
  "generated_at": "2026-06-24T02:00:00Z",
  "source_digest": "sha256:3b9c…",
  "period": { "type": "month_with_daily", "start": "2026-06-01", "end": "2026-06-30", "granularity": "day" },
  "currency": "KRW",
  "metrics": [
    { "id": "cf.2026-06.opening_balance", "label": "월초 현금잔액", "value": 1850000000, "unit": "KRW", "kind": "stock",
      "source": { "type": "input_cell", "ref": "bank_balance.csv#R2:opening" } },
    { "id": "cf.2026-06.net_change", "label": "월간 순현금흐름", "value": -420000000, "unit": "KRW", "kind": "flow",
      "source": { "type": "derived", "formula": "sum(inflows)-sum(outflows)", "input_refs": ["cf.2026-06.total_inflow","cf.2026-06.total_outflow"] } },
    { "id": "cf.2026-06.projected_min_balance", "label": "예측 최저잔액(D+30)", "value": 95000000, "unit": "KRW", "kind": "projection",
      "occurs_on": "2026-07-18",
      "source": { "type": "derived", "formula": "running_balance over scheduled_ar/ap", "input_refs": ["cf.2026-06.opening_balance"] } },
    { "id": "cf.2026-06.liquidity_buffer_days", "label": "유동성 버퍼(일)", "value": 12, "unit": "days", "kind": "ratio" }
  ],
  "flags": [
    { "id": "cf.2026-06.flag.min_balance_below_threshold", "severity": "high", "rule_id": "LIQ-001",
      "rule_label": "예측 최저잔액 < 안전한도(1억원)", "triggered": true,
      "metric_refs": ["cf.2026-06.projected_min_balance"],
      "threshold": { "operator": "<", "value": 100000000, "unit": "KRW" }, "observed_value": 95000000 },
    { "id": "cf.2026-06.flag.buffer_days_low", "severity": "medium", "rule_id": "LIQ-002",
      "rule_label": "유동성 버퍼 < 15일", "triggered": true,
      "metric_refs": ["cf.2026-06.liquidity_buffer_days"],
      "threshold": { "operator": "<", "value": 15, "unit": "days" }, "observed_value": 12 }
  ],
  "validationSummary": {
    "status": "warning",
    "fatal_count": 0,
    "warning_count": 1,
    "checks": [
      { "id": "VAL-BAL-RECON", "label": "기초+순변동=기말 정합성", "status": "pass" },
      { "id": "VAL-DATE-GAP", "label": "거래일 연속성", "status": "warning", "detail": "2026-06-15 데이터 누락" }
    ],
    "ai_invocation_allowed": true
  }
}
```

> **계약 불변식**: `ai_invocation_allowed`는 `fatal_count == 0`일 때만 `true`. `false`면 ReportEngine은 모델을 호출하지 않고 즉시 "데이터 치명 오류" 상태로 사람 큐에 넘긴다. AI 리포트의 모든 `evidence_ref`는 이 CRO의 `metrics[].id` 또는 `flags[].id` 집합(이하 `allowedIds`)에만 속할 수 있다. (이 `validationSummary`는 §4 ValidationReport의 직렬화 표현이다.)

### 5.2 AI 리포트 출력 스키마 (엄격)

리포트는 `output_config.format`의 `json_schema`로 강제하고 `additionalProperties: false` + `required`로 누수를 막는다. `confidence`와 `dataCaveats`는 **필수 필드**라 비워둘 수 없다. 아래는 Zod 정의(런타임 검증용)와 동일 의미의 json_schema다.

**Zod (`zodOutputFormat`로 변환):**

```typescript
import { z } from "zod";

const EvidenceRef = z.string().regex(/^[a-z]+\.[0-9]{4}-[0-9]{2}\.[a-z0-9_.]+$/);

export const FinanceReportSchema = z.object({
  summary: z.string().min(1).describe("3~5문장. 새 숫자 생성 금지; 인용 수치는 모두 CRO에서."),
  findings: z.array(z.object({
    id: z.string().regex(/^F[0-9]{3}$/),
    area: z.enum(["liquidity", "cashflow", "reconciliation", "anomaly_entry", "account_match"]),
    severity: z.enum(["info", "low", "medium", "high", "critical"]),
    observation: z.string().min(1).describe("관찰 사실. 수치는 evidence_refs가 가리키는 CRO 값과 일치."),
    evidence_refs: z.array(EvidenceRef).min(1).describe("CRO의 metricId/flagId만 허용. 최소 1개 필수."),
    rootCauseHypothesis: z.string().min(1).describe("가설임을 명시. 단정 금지."),
  })).min(0),
  recommendations: z.array(z.object({
    id: z.string().regex(/^R[0-9]{3}$/),
    action: z.string().min(1),
    impact: z.enum(["low", "medium", "high"]),
    effort: z.enum(["low", "medium", "high"]),
    linkedFindingIds: z.array(z.string().regex(/^F[0-9]{3}$/)).min(1),
  })).min(0),
  confidence: z.object({ level: z.enum(["low","medium","high"]), rationale: z.string().min(1) }),
  dataCaveats: z.array(z.string()).describe("데이터 한계·누락·검증 경고. validationSummary의 warning 반영."),
}).strict();
```

**json_schema (`output_config: { format: { type: "json_schema", schema: … } }`):**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["summary", "findings", "recommendations", "confidence", "dataCaveats"],
  "properties": {
    "summary": { "type": "string" },
    "findings": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["id","area","severity","observation","evidence_refs","rootCauseHypothesis"],
        "properties": {
          "id": { "type": "string" },
          "area": { "type": "string", "enum": ["liquidity","cashflow","reconciliation","anomaly_entry","account_match"] },
          "severity": { "type": "string", "enum": ["info","low","medium","high","critical"] },
          "observation": { "type": "string" },
          "evidence_refs": { "type": "array", "items": { "type": "string" } },
          "rootCauseHypothesis": { "type": "string" }
        }
      }
    },
    "recommendations": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["id","action","impact","effort","linkedFindingIds"],
        "properties": {
          "id": { "type": "string" },
          "action": { "type": "string" },
          "impact": { "type": "string", "enum": ["low","medium","high"] },
          "effort": { "type": "string", "enum": ["low","medium","high"] },
          "linkedFindingIds": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "confidence": {
      "type": "object", "additionalProperties": false,
      "required": ["level","rationale"],
      "properties": { "level": { "type": "string", "enum": ["low","medium","high"] }, "rationale": { "type": "string" } }
    },
    "dataCaveats": { "type": "array", "items": { "type": "string" } }
  }
}
```

> 구조화 출력 json_schema는 `minLength`/`pattern` 같은 문자열 제약을 지원하지 않는다. SDK가 미지원 제약을 자동 제거하고 클라이언트측에서 Zod로 재검증한다. 따라서 `evidence_ref` 형식·길이 강제는 **후처리 Zod 단계**(§5.6)에서 일어난다.

### 5.3 ReportEngine 파이프라인 (LCEL 체인 단계)

LangChain.js의 `RunnableSequence`로 단계를 조립하고, 모델 호출만 `@anthropic-ai/sdk` 클라이언트로 직접 수행한다(구조화 출력·prompt caching·adaptive thinking 정확 제어). 큐는 BullMQ, 영속화는 Postgres+Prisma.

```
[1] CRO 적재 (loadCRO)
     └─ validationSummary.ai_invocation_allowed === false → ❌ 즉시 중단
        → status: "blocked_data_fatal", 사람 큐(reviewQueue), 모델 미호출
[2] 프롬프트 합성 (buildPrompt)
     ├─ 캐시 prefix (고정·byte-stable): 시스템 규칙 + 회계기준 + 출력 스키마 설명
     │     → system 블록 끝에 cache_control: { type: "ephemeral" }
     └─ 가변 suffix: CRO JSON(결정론 직렬화: 정렬된 키)
           → 마지막 user 메시지. 캐시 무효화 방지를 위해 prefix엔 타임스탬프/UUID 금지
[3] claude-opus-4-8 호출 (invokeModel) — 스트리밍
     client.messages.stream({
       model: "claude-opus-4-8", max_tokens: 16000,
       thinking: { type: "adaptive" },
       output_config: { format: zodOutputFormat(FinanceReportSchema) },
       system: [ FROZEN_RULES_BLOCK ],   // ← cache_control 포함
       messages: [ { role: "user", content: croJson } ],
     })  → await stream.finalMessage()
[4] 후처리 검증기 (verifyReport) ── 환각 차단의 기계적 게이트
     ├─ (a) Zod 파싱 통과?
     ├─ (b) 모든 finding.evidence_refs ⊆ CRO.allowedIds ?
     ├─ (c) summary/observation 내 모든 숫자 토큰이 CRO 수치 집합과 일치?
     ├─ (d) 모든 recommendation.linkedFindingIds ⊆ 존재하는 finding.id ?
     └─ (e) confidence, dataCaveats 비어있지 않음?
[5] 불일치 시 자동 재생성 (retry, 최대 N=2)
     └─ 위반 항목을 구조화 피드백으로 같은 세션에 재투입
[6] N회 실패 시
     └─ status: "low_confidence", confidence를 강제 'low'로 다운그레이드 → 사람 큐
[7] Draft 저장 (persistDraft)
     └─ Prisma: Report(status="draft", visible=false, cro_id, engine_version, model="claude-opus-4-8")
        EvidenceLedger/AuditLog에 {croId, promptHash, modelResponseId(_request_id), verifierResult, retries} 기록
        → 사람 승인 전 절대 비노출
```

`messages.stream(...).finalMessage()`를 쓰는 이유: 큰 `max_tokens`/긴 입력에서 HTTP 타임아웃을 피하기 위해 스트리밍이 기본이며, 개별 이벤트가 불필요할 때 `.finalMessage()`로 완성된 메시지를 받는다.

### 5.4 시스템 프롬프트 설계 (2종)

두 프롬프트 모두 **고정 prefix**(시스템 규칙 + 회계기준)와 출력 스키마 설명을 포함하며, 이 블록에 `cache_control: { type: "ephemeral" }`를 건다. CRO JSON은 user 메시지로 따로 들어가 캐시 prefix를 깨지 않는다.

**(공통 규칙 블록 — 두 프롬프트 공유, 회계기준 텍스트와 함께 캐시)**
```text
너는 중견·중소기업 재무팀을 위한 재무 분석 어시스턴트다. 다음 규칙을 절대 위반하지 않는다.

[수치 생성 금지]
- 너는 어떤 숫자도 직접 계산하거나 추정하지 않는다.
- 리포트에 등장하는 모든 금액·비율·일수·건수는 입력 CRO의 metrics[] 또는 flags[]에 실제로 존재하는 값이어야 한다.
- CRO에 없는 수치를 쓰면 그 리포트는 폐기된다. 합·차·비율을 새로 계산하지 마라.
  비교가 필요하면 CRO에 이미 있는 항목들만 인용해 서술하라.

[근거 강제]
- 모든 finding은 evidence_refs에 최소 1개의 CRO 항목ID(metricId 또는 flagId)를 담아야 한다.
- evidence_refs에는 CRO에 실재하는 ID 문자열만 넣는다. ID를 지어내지 마라.
- observation에서 인용하는 수치는 그 evidence_refs가 가리키는 CRO 항목 값과 정확히 일치해야 한다.

[역할 한계]
- 너는 결론을 내리거나 의사결정을 하지 않는다. 승인·집행은 사람이 한다.
- rootCauseHypothesis는 항상 "가설"로 서술한다. 단정하지 말고 "~일 가능성이 있다 / ~로 추정된다 / 확인이 필요하다"로 쓴다.
- 권고(recommendations)는 제안일 뿐이며 실행 여부는 사람이 정한다.

[필수 출력]
- confidence(level + rationale)와 dataCaveats를 반드시 채운다.
- CRO.validationSummary에 warning이 있으면 그 내용을 dataCaveats에 반영하고 confidence를 낮춘다(데이터 누락 시 medium 이하).
- 불확실하거나 CRO 근거가 빈약하면 finding을 만들지 말고 dataCaveats에 한계를 적는다.

[회계기준 컨텍스트]
- 통화/단위는 CRO의 currency·unit을 따른다. 임의 환산·반올림을 하지 않는다.
- 현금흐름은 K-IFRS/일반기업회계기준의 영업·투자·재무 구분을 존중한다.
- 분개/대사 판단은 차변=대변 원칙, 계정 정합성을 전제로 한다.
출력은 제공된 JSON 스키마를 정확히 따른다. 스키마 밖 필드를 추가하지 않는다.
```

**(A) 자금일보·현금흐름·유동성 경보 리포트용 (도메인 헤더)**
```text
[작업: 자금일보 / 현금흐름 / 유동성 경보 리포트]
입력 CRO는 일별 현금흐름과 유동성 지표를 담는다(slice: cashflow_daily).
- flags[]의 유동성 경보(LIQ-*)를 우선순위 높은 finding으로 다룬다.
- 예측 최저잔액·버퍼일수는 projection 성격이므로 observation에 "예측치"임을 명시한다.
- 경보가 가리키는 날짜(occurs_on)와 안전한도 대비 부족분을 CRO 값 인용으로 설명한다.
- 권고는 "결제 일정 조정", "단기차입 검토" 등 실행 가능 수준으로 적되 금액 단정은 하지 않는다.
```

**(B) 월 결산·이상 분개/계정 대사 리포트용 (도메인 헤더)**
```text
[작업: 월 결산 / 이상 분개 / 계정 대사 리포트]
입력 CRO는 정형 분개 결과와 대사 탐지 지표를 담는다(slice: month_close).
- flags[]의 이상 분개·미대사 항목(RECON-*, JE-*)을 finding으로 우선 다룬다.
- 이상 분개는 "왜 이상한지"를 CRO가 제시한 규칙(rule_label)과 항목 값으로 서술한다.
- 미대사 건수·금액은 CRO의 metric을 그대로 인용한다. 표본을 추정해 합산하지 마라.
- rootCauseHypothesis는 "전기 이월 누락 가능성", "계정 매핑 오류 가능성" 등 검증 대상 가설로 쓴다.
- 결산 마감 가부 판단은 하지 않는다. 사람이 대사·승인하도록 확인 포인트만 제시한다.
```

### 5.5 모델 / 비용 고려
- **기본 모델**: `claude-opus-4-8`($5/$25 per 1M tokens). 근거 추적·규칙 준수가 정확도에 직결되므로 인텔리전스 우선. adaptive thinking으로 복잡 케이스에서 추론 깊이를 모델이 자가 조절(고정 `budget_tokens`는 4.8에서 400 에러 — 사용 금지).
- **Prompt caching**: 회계기준 + 시스템 규칙 + 출력 스키마 설명은 요청마다 동일한 고정 prefix이므로 `cache_control: { type: "ephemeral" }`로 캐시. 렌더 순서 `tools → system → messages`이므로 system 블록 끝에 breakpoint를 두면 안정 prefix 전체가 캐시. CRO JSON만 user 메시지로 가변. 캐시 읽기 비용 ~0.1배 → 야간 배치 처리 시 비용 절감. prefix에 타임스탬프/UUID/비정렬 JSON 금지, `usage.cache_read_input_tokens`로 적중 검증.
- **출력 스트리밍**: `max_tokens=16000`에서도 스트리밍 기본, `.finalMessage()`로 완성본 수신.
- **MVP에서 batch 불필요**: Batches API는 50% 저렴하나 최대 24시간 지연. 자금일보·유동성 경보는 즉효성(아침 전 도착)이 핵심이고 단일 테넌트 기준 슬라이스 수가 소수라 지연 감수 이유 없음. BullMQ 야간 스케줄링 + prompt caching으로 비용 관리. 테넌트·슬라이스가 수백 단위로 늘고 지연 허용이 생기면 batch 재검토.

### 5.6 환각 차단의 기계적 동작 (후처리 검증기)

프롬프트 규칙은 1차 방어, **검증기는 강제 게이트**다. 통과하지 못한 리포트는 절대 Draft로 저장되지 않고 재생성 또는 사람 큐로 간다.

```typescript
// allowedIds = CRO.metrics[].id ∪ CRO.flags[].id
function verifyReport(report, cro): VerifyResult {
  const allowedIds = new Set([...cro.metrics.map(m=>m.id), ...cro.flags.map(f=>f.id)]);
  const findingIds = new Set(report.findings.map(f=>f.id));
  const croValues = buildNumberSet(cro);   // {value, unit} 정규화(반올림·단위 통일)
  const violations = [];

  // (a) 스키마 — Zod로 파싱. 실패 시 즉시 violation.
  if (!FinanceReportSchema.safeParse(report).success) return fail("SCHEMA_INVALID");

  // (b) evidence_ref 유효성: CRO에 없는 ID 인용 = 환각
  for (const f of report.findings)
    for (const ref of f.evidence_refs)
      if (!allowedIds.has(ref)) violations.push({ finding: f.id, type: "UNKNOWN_EVIDENCE_REF", ref });

  // (c) 수치 그라운딩: summary/observation의 모든 숫자 토큰이 CRO 값과 일치?
  for (const text of [report.summary, ...report.findings.map(f=>f.observation)])
    for (const num of extractNumbers(text))
      if (!croValues.hasApprox(num)) violations.push({ type: "UNGROUNDED_NUMBER", value: num, where: text });

  // (d) 참조 무결성
  for (const r of report.recommendations)
    for (const fid of r.linkedFindingIds)
      if (!findingIds.has(fid)) violations.push({ rec: r.id, type: "DANGLING_LINK", fid });

  // (e) 필수 정직성 필드
  if (!report.confidence?.rationale) violations.push({ type: "MISSING_CONFIDENCE" });
  if (report.dataCaveats == null)    violations.push({ type: "MISSING_CAVEATS" });

  return violations.length === 0 ? ok() : fail(violations);
}

// 오케스트레이션
let result, retries = 0;
while (retries <= MAX_RETRIES /* =2 */) {
  const report = await invokeModel(prompt, retries === 0 ? null : feedbackFrom(result));
  result = verifyReport(report, cro);
  if (result.ok) return persistDraft(report, cro, { retries }); // status="draft", visible=false
  retries++;
}
report.confidence.level = "low";
report.confidence.rationale += " | 자동검증 미통과: " + summarize(result.violations);
return enqueueHumanReview(report, cro, result.violations);
```

핵심은 (b)와 (c)다. **(b)** 는 "근거를 지어냈는지"를, **(c)** 는 "숫자를 지어냈는지"를 CRO 집합과의 차집합으로 기계적으로 잡는다. 수치 비교는 단위·반올림을 정규화한 근사 매칭(`hasApprox`)으로 표기 차이(1,850,000,000 vs 18.5억) 오탐을 줄이되, CRO에 없는 새 값은 반드시 걸린다. 모든 위반·재시도·모델 응답ID(`_request_id`)는 EvidenceLedger/AuditLog에 남아 사후 감사·책임 추적이 가능하다.

---

## 6. 백엔드 API · 파이프라인

### 6.1 NestJS 모듈 구조

```
AppModule
├── AuthModule            (JWT 인증·RBAC 골격)
├── TenantModule          (TenantContext 전파)
├── AuditModule           (EvidenceLedger / AuditLog)  ← 전역(Global)
├── UploadModule          (DataConnector)
├── CalcModule            (CalculationEngine + ValidationEngine 래핑)
├── ReportModule          (ReportEngine, Claude 호출)
└── FinanceModule         (자금일보 / 월결산 도메인 오케스트레이션)
```

| 모듈 | 핵심 책임 | 주요 의존 | 비고 |
|---|---|---|---|
| **AuthModule** | JWT 발급·검증, `JwtAuthGuard`, `RolesGuard`. RBAC는 `FINANCE_STAFF`/`FINANCE_APPROVER`/`ADMIN` 골격 | Prisma(User) | `@nestjs/passport`, `passport-jwt` |
| **TenantModule** | 요청 단위 `TenantContext`(tenantId,userId,roles)를 `AsyncLocalStorage`로 전파. MVP는 `tenantId=DEFAULT` 고정이나 모든 쿼리에 `where:{tenantId}` 강제 | AuthModule | 전역 미들웨어 + `ClsService` |
| **AuditModule** | `EvidenceLedger`(append-only) + 전역 `AuditInterceptor`. 모든 상태변경 API와 Claude 호출 메타데이터 자동 기록 | Prisma(AuditLog) | `@Global()` |
| **UploadModule** | `DataConnector`. 엑셀/CSV 수신, 파일 검증, 원본 보관, 컬럼 매핑 제시·확정 | AuditModule, BullMQ(parse-queue) | `multer` + `exceljs`/`papaparse` |
| **CalcModule** | 순수 TS 결정론 엔진 래핑. `CalculationEngine`(CRO) + `ValidationEngine` | AuditModule | **Claude를 절대 호출하지 않음** |
| **ReportModule** | `ReportEngine`. CRO 입력으로 LCEL + `@anthropic-ai/sdk`(claude-opus-4-8) 호출, Draft 생성. 근거 인용 강제, CRO 밖 숫자 차단 | CalcModule, AuditModule, BullMQ(report-queue) | 유일하게 ANTHROPIC_API_KEY 사용 |
| **FinanceModule** | 슬라이스 A/B 도메인 오케스트레이션. 배치 생명주기·승인 워크플로 | Upload/Calc/Report/Audit | 사용자 대면 컨트롤러 |

핵심 의존 규칙:
- **CalcModule은 ReportModule에 의존하지 않는다.** 계산은 AI 없이 독립 완결(역방향 Report→Calc만 허용).
- **ReportModule만 ANTHROPIC_API_KEY를 안다.** ConfigModule 네임스페이스 분리로 타 모듈 접근 불가.
- **AuditModule은 @Global**이라 인터셉터가 횡단 관심사로 동작.

### 6.2 REST API 엔드포인트

기본 경로 `/api/v1`. 모든 엔드포인트 `JwtAuthGuard` 적용(표기 없으면 `FINANCE_STAFF` 이상).

**업로드 (DataConnector)**

| Method | Path | 설명 | 응답 요지 | 권한 |
|---|---|---|---|---|
| GET | `/upload/templates?domain=cashflow\|monthly_close` | 도메인별 템플릿 조회 | `{templateId, requiredColumns[], sampleRows[]}` | STAFF |
| POST | `/upload/files` | 멀티파트 업로드. 검증 통과 시 batch 생성 + 파싱 enqueue | `{batchId, status:"PARSING", detectedSheets[]}` | STAFF |
| GET | `/upload/batches/:batchId/mapping-candidates` | 매핑 후보 조회 | `{candidates:[{sourceColumn,suggestedField,confidence}]}` | STAFF |
| POST | `/upload/batches/:batchId/mapping` | 매핑 확정 → 계산·검증 enqueue | `{batchId, status:"CALCULATING"}` | STAFF |
| GET | `/upload/batches/:batchId` | 배치 상태·진행률 | `{batchId, status, progress, error?}` | STAFF |

**계산·검증 (CalculationEngine / ValidationEngine)**

| Method | Path | 설명 | 응답 요지 | 권한 |
|---|---|---|---|---|
| POST | `/batches/:batchId/calculate` | 계산·검증 재실행 | `{jobId, status:"CALCULATING"}` | STAFF |
| GET | `/batches/:batchId/cro` | CRO 조회 | `CalculationResultObject` | STAFF |
| GET | `/batches/:batchId/validation` | 검증 리포트 조회 | `{severity, criticalErrors[], warnings[], blockedAI}` | STAFF |

**리포트 (ReportEngine) — 생명주기 워크플로**

| Method | Path | 설명 | 응답 요지 | 권한 |
|---|---|---|---|---|
| POST | `/batches/:batchId/reports` | AI 리포트 생성 트리거(CRO 존재·non-blocked 시에만), Draft enqueue | `{reportId, status:"AI_DRAFTING"}` | STAFF |
| GET | `/reports/:reportId` | 리포트 조회(Draft는 작성자/승인자만) | `ReportDto` | STAFF |
| POST | `/reports/:reportId/approve` | 승인 → 공개 | `{reportId, status:"APPROVED"}` | **APPROVER** |
| POST | `/reports/:reportId/reject` | 반려(사유 필수) | `{reportId, status:"REJECTED"}` | **APPROVER** |
| POST | `/reports/:reportId/comments` | 코멘트 추가 | `{commentId, createdAt}` | STAFF |

**감사로그 (EvidenceLedger)**

| Method | Path | 설명 | 권한 |
|---|---|---|---|
| GET | `/audit-logs?entityType=&entityId=&action=&from=&to=` | 감사로그 조회(필터·페이지네이션) | APPROVER 이상 |
| GET | `/reports/:reportId/export?format=pdf` | 리포트 + 근거 + 승인 이력 PDF | STAFF (승인된 리포트만 워터마크 없이) |

### 6.3 비동기 파이프라인 (BullMQ)

업로드 한 건은 3개 큐를 직렬 통과한다. 실패·치명오류 시 다음 단계로 진행하지 않는다.

```
[POST /upload/files]
       │ 검증 통과
       ▼
 ┌──────────────┐    ┌──────────────────┐    ┌───────────────────┐
 │ parse-queue  │ →  │ calc-queue       │ →  │ report-queue      │
 │ 파일 파싱     │    │ 계산+검증         │    │ Claude Draft 생성  │
 │ → 매핑 후보   │    │ → CRO + Validation│    │ → DRAFT           │
 └──────────────┘    └──────────────────┘    └───────────────────┘
                              │ 치명오류
                              ▼
                       [BLOCKED] + 알림 (AI 미호출, report job enqueue 안 됨)
```

1. **parse job**: 행/컬럼 파싱, 시트 스키마, 매핑 후보 산출. 완료 시 `PARSED`로 전이하고 사용자 매핑 확정 대기(사람 입력 게이트).
2. **calc job**(매핑 확정 시 enqueue): `CalculationEngine`→CRO, `ValidationEngine`→무결성. **치명 오류 시 calc job 내 즉시 중단**: 배치 `BLOCKED`, report-queue enqueue 안 함, 담당자 알림. AI 미호출.
3. **report job**: 검증 통과(`CALCULATED`) 배치만 진입. CRO를 컨텍스트로 Claude 호출, Draft 생성.

**job 상태·재시도·멱등성:**
```typescript
const jobOpts: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 86_400 },
  removeOnFail: false,            // 실패 job은 감사·재처리 위해 보존
  jobId: `report:${batchId}:${reportType}`,  // 멱등 키
};
```
- **멱등성**: `jobId`를 `{단계}:{batchId}[:{reportType}]`로 고정해 중복 트리거 디듀프. 리포트는 `reportId`를 미리 발급하고 worker가 upsert하여 재시도가 중복 Draft를 만들지 않게 한다.
- **재시도 정책**: parse/calc는 결정론이라 재시도 안전. report job은 Claude 일시 오류(429/5xx)에 한해 재시도하되, **검증 치명오류·CRO 부재는 `UnrecoverableError`로 즉시 fail**.
- **분리 워커**: report-queue는 외부 API 지연으로 별도 워커/동시성 격리(`concurrency: 4`), parse/calc는 CPU 바운드 별도 풀.

**진행 상태 노출 — SSE 우선:**
```typescript
@Sse('batches/:batchId/events')
streamBatchEvents(@Param('batchId') id: string): Observable<MessageEvent> {
  return this.batchEvents.subscribe(id); // status_transition, progress, blocked, draft_ready
}
```
- **기본 SSE**: worker가 `job.updateProgress()`·상태 전이 발행 → `QueueEvents` 리스너가 배치별 Subject로 중계 → 프론트가 단일 연결로 전 과정 수신.
- **폴백 폴링**: `GET /upload/batches/:batchId`로 스냅샷 조회(SSE 재접속 정합화).

### 6.4 리포트 생명주기 상태머신

```
                    calc job 시작
         PENDING ──────────────────► CALCULATED
            │                            │  POST /reports (트리거)
            │ 치명오류                     ▼
            └──────► BLOCKED          AI_DRAFTING
                       │                  │  Claude 응답 + CRO검증 통과
                  (재업로드/매핑           ▼
                   수정 후 PENDING)      DRAFT
                                      ┌───┴────┐
                                approve│        │reject
                                      ▼        ▼
                                  APPROVED   REJECTED
```

| 전이 | 조건 | 트리거 |
|---|---|---|
| PENDING → CALCULATED | CRO 산출 + ValidationEngine 통과(FATAL 0) | calc job 성공 |
| PENDING → BLOCKED | 검증 치명오류 ≥ 1 | calc job 내 검증 |
| BLOCKED → PENDING | 데이터 재업로드/매핑 수정 후 재계산 | `POST /calculate` |
| CALCULATED → AI_DRAFTING | 리포트 생성 트리거, **검증 통과 재확인** | `POST /reports` |
| AI_DRAFTING → DRAFT | Claude 응답 + **CRO 밖 숫자 미생성 검증 통과**(§5.6) | report job 성공 |
| AI_DRAFTING → BLOCKED | CRO 밖 숫자/근거 누락 → 가드 위반(재시도 소진) | report job 가드 실패 |
| DRAFT → APPROVED | 승인자(APPROVER) 승인. **이때만 비노출 해제** | `POST /approve` |
| DRAFT → REJECTED | 승인자 반려(사유 필수) → 재생성 시 새 버전 | `POST /reject` |

> UX 라벨 매핑: `DRAFT`=Draft(미승인), `AI_DRAFTING`=리포트 생성 중, `BLOCKED`=검증실패 게이트, `APPROVED`=승인됨, `REJECTED`=반려됨. 승인 요청(SubmittedForApproval) 단계는 화면 표시용 상태이며 DRAFT의 하위 상태로 처리한다.

불변 규칙: **DRAFT 이전 상태에서 리포트는 일반 사용자에게 노출되지 않으며, APPROVED 전까지 작성자·승인자만 열람 가능.** BLOCKED 상태에서는 AI 호출 자체가 차단된다(상태머신이 `AI_DRAFTING` 진입을 거부).

### 6.5 보안 (MVP 수준)
- **JWT 인증**: `JwtAuthGuard` 전역 가드, `@Public()`로 로그인·헬스체크만 예외. 액세스 토큰 단기(15분) + 리프레시. `RolesGuard`로 승인/반려는 `FINANCE_APPROVER` 강제.
- **ANTHROPIC_API_KEY 격리**: 키는 백엔드 `.env`에만(ConfigModule `report` 네임스페이스). 프론트 노출·ReportModule 외 주입 차단. **모든 Claude 호출은 백엔드 경유**(프론트는 `POST /reports` 트리거만).
- **업로드 파일 검증**: 확장자 화이트리스트(`.xlsx`,`.csv`), MIME 재확인, 최대 크기·행/셀 수 상한, 수식·매크로 제거(값만 추출), 파일명 path traversal 방지(`path.basename`+서버 UUID 저장명), 격리 worker 파싱.
- **감사로그 자동 인터셉터**: 전역 `AuditInterceptor`가 모든 상태변경 요청을 `actor, action, entityType, entityId, before/after diff, requestId`로 자동 기록. Claude 호출은 ReportEngine이 추가로 `model(claude-opus-4-8), input/output 토큰, 인용 CRO 필드, _request_id`를 EvidenceLedger에 남김. AuditLog는 append-only(수정·삭제 API 없음).
- **AI 입력 가드**: ReportEngine은 Claude에 CRO만 주입하고, 응답의 모든 숫자가 CRO 필드와 매칭되는지 후검증(§5.6) — 실패 시 가드 위반으로 Draft 생성 거부.

### 6.6 핵심 DTO / 인터페이스 (TypeScript)

> 아래 DTO는 §5의 CRO/리포트 스키마를 백엔드 도메인 관점에서 표현한 것이다. `metricKey`(DTO)와 `metricId`(CRO JSON)는 동일 개념의 표기 차이이며, 직렬화 경계에서 `id` 필드로 통일된다.

```typescript
// ── CRO ──────────────────────────────────────────────
export interface CalculationResultObject {
  croId: string;
  batchId: string;
  domain: 'cashflow' | 'monthly_close';
  generatedAt: string;            // ISO 8601
  engineVersion: string;          // 결정론 재현성 추적
  metrics: Record<string, CroMetric>; // AI 인용 가능한 모든 수치
  series?: CroTimeSeries[];
}
export interface CroMetric {
  key: string;                    // 예: "liquidity.coverage_days" (= metricId)
  label: string;
  value: number;
  unit: string;                   // "KRW" | "days" | "ratio"
  sourceRefs: string[];           // 예: ["sheet:자금일보!B12", "rule:coverage_v2"]
}
export interface CroTimeSeries { metricKey: string; points: Array<{ date: string; value: number }>; }

// ── ValidationEngine ─────────────────────────────────
export interface ValidationReport {
  batchId: string;
  severity: 'OK' | 'WARNING' | 'CRITICAL';
  blockedAI: boolean;             // CRITICAL이면 true → report job 미진입
  criticalErrors: ValidationIssue[];
  warnings: ValidationIssue[];
}
export interface ValidationIssue { code: string; message: string; locations: string[]; }

// ── 리포트 ───────────────────────────────────────────
export type ReportStatus =
  | 'PENDING' | 'CALCULATED' | 'BLOCKED'
  | 'AI_DRAFTING' | 'DRAFT' | 'APPROVED' | 'REJECTED';

export interface ReportDto {
  reportId: string; batchId: string; croId: string;
  status: ReportStatus;
  findings: ReportFinding[];
  createdBy: string; approvedBy?: string;
  visibleToAll: boolean;          // APPROVED 전까지 false
}
export interface ReportFinding {
  type: 'anomaly' | 'improvement';
  title: string; description: string;
  citedMetricKeys: string[];      // CRO 밖 숫자 금지 — CRO metric key(=evidence_ref) 인용
  severity: 'low' | 'medium' | 'high';
}
```

```typescript
// ── ReportEngine: Claude 호출 (claude-opus-4-8, 구조화 출력 + 프롬프트 캐싱) ──
import Anthropic from '@anthropic-ai/sdk';

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['anomaly', 'improvement'] },
          title: { type: 'string' },
          description: { type: 'string' },
          citedMetricKeys: { type: 'array', items: { type: 'string' } },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['type','title','description','citedMetricKeys','severity'],
        additionalProperties: false,
      },
    },
  },
  required: ['findings'],
  additionalProperties: false,
} as const;

async function draftReport(client: Anthropic, cro: CalculationResultObject) {
  const res = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },           // 4.8: budget_tokens 사용 불가
    output_config: { format: { type: 'json_schema', schema: REPORT_SCHEMA } },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify({ metrics: cro.metrics, series: cro.series }) }],
  });

  const text = res.content.find((b) => b.type === 'text');
  const parsed = JSON.parse(text!.text) as { findings: ReportFinding[] };

  // 후검증 가드(§5.6 요약): 인용 key가 전부 CRO에 존재해야 함 — 아니면 BLOCKED
  const validKeys = new Set(Object.keys(cro.metrics));
  const violated = parsed.findings.some(
    (f) => f.citedMetricKeys.length === 0 || f.citedMetricKeys.some((k) => !validKeys.has(k)),
  );
  if (violated) throw new ReportGuardViolation('CRO 밖 인용 또는 근거 누락');
  return parsed.findings;
}
```

API 사용 주의:
- `claude-opus-4-8`은 `thinking: { type: 'adaptive' }`만 지원하며 `budget_tokens`·`temperature`/`top_p`는 400을 반환하므로 사용하지 않는다.
- 구조화 출력은 deprecated된 `output_format`이 아닌 `output_config: { format: { type: 'json_schema', … } }`를 사용한다.
- 프롬프트 캐싱은 안정적 system 프롬프트에 `cache_control: { type: 'ephemeral' }`를 두고, 변동하는 CRO를 user 메시지(프리픽스 뒤)에 배치해 캐시 히트를 유지한다.
- LCEL 체인 구성 시 위 `messages.create` 호출을 `RunnableLambda`로 감싸 `croLoader → promptAssembler → claudeCall → guardValidator` 파이프라인으로 관측·테스트 가능하게 만든다.

---

## 7. 마일스톤 (주차별 구현 계획, 8주)

각 주차는 "데모 가능한 증분"을 산출하고, 핵심 게이트(검증 차단·근거 인용·승인)는 가능한 한 이른 주차에 뼈대를 세운다. 슬라이스 A(자금일보)를 먼저 끝까지 관통시키고, 슬라이스 B(월결산)는 그 위에 얹는다.

| 주차 | 목표 (Deliverable) | 핵심 작업 | 완료 기준(Exit) |
|---|---|---|---|
| **W1 — 기반·골격** | 모노레포·CI·스키마 부트스트랩 | NestJS 7모듈 골격, Prisma 스키마(§3.4) 마이그레이션, React 셸·라우팅, AuthModule(JWT)+RBAC 3롤 시드, TenantContext(`DEFAULT`), AuditModule(@Global) 골격 | 로그인→빈 대시보드, AuditLog에 인증 이벤트 기록 |
| **W2 — 업로드·파싱(DataConnector)** | 엑셀/CSV 업로드 + 매핑 | 슬라이스 A 템플릿(A-1~A-3), 업로드 마법사 3-step, RawDataset/RawRow 무손실 적재, SHA-256 봉인, 컬럼 자동매핑+사용자 확정, parse-queue | 자금일보 파일 업로드→매핑 확정→RawRow 적재, 중복 해시 차단 |
| **W3 — 계산·검증 엔진 A** | 슬라이스 A CRO + ValidationEngine | `cash.*` metric(§4.1-A), critical/warn 룰(§4.2), CRO 직렬화(§5.1), calc-queue, FATAL 시 BLOCKED 게이트, decimal 안전연산·골든 테스트 | 자금일보 CRO 생성, FATAL 데이터가 BLOCKED로 막힘(AI 호출 0회 테스트 통과) |
| **W4 — 자금일보 화면 + 유동성 경보** | 슬라이스 A UX 관통 | KPI·현금흐름 차트·유동성 경보 카드·일자별 테이블, 검증 결과 화면, 빈/에러/차단 상태 UX, SSE 진행률, 근거 추적 딥링크 | 업로드→계산→유동성 경보까지 화면으로 확인(AI 전 단계 E2E) |
| **W5 — ReportEngine + 환각 가드** | 슬라이스 A AI 리포트(Draft) | LCEL 파이프라인(§5.3), claude-opus-4-8 호출(adaptive thinking, output_config, prompt caching), 시스템 프롬프트 A, 후처리 검증기(§5.6), report-queue, 멱등·재시도 | CRO→Draft 생성, evidence_ref/숫자 그라운딩 위반 시 재생성→사람 큐 동작 |
| **W6 — 리포트 뷰어 + 승인 워크플로** | 근거 하이라이트·승인 | AI 리포트 뷰어(finding↔근거 셀 하이라이트), confidence/caveat UI, 상태머신(§6.4), 승인/반려/코멘트, self-approval 차단, Stale 배지, Export(워터마크) | Draft→승인→공개 전 과정 + 감사로그 1:1 매핑, 미승인 비노출 검증 |
| **W7 — 슬라이스 B(월결산·이상분개·대사)** | 슬라이스 B 풀스택 | B 템플릿(B-1~B-5), 계정 표준화 매핑(§3.5), `tb./je./fs.*` metric(§4.1-B), 이상분개·대사 룰, 월결산 화면(4탭), 시스템 프롬프트 B로 리포트 | 시산표 업로드→결산정리→BS/IS→이상분개/대사 후보→AI 리포트(Draft) E2E |
| **W8 — 통합·하드닝·베타** | 베타 출시 준비 | 멀티기간/전기비교(§3.6), 감사로그 뷰, 보안 하드닝(파일·키 격리·rate limit), 재현성·속성기반 테스트 보강, 성능(핫패스 인덱스), 베타 온보딩(시드·샘플 데이터) | 두 슬라이스 안정 동작, 성공지표 계측 훅 탑재, 베타 고객 1곳 온보딩 |

**확장 버퍼(필요 시 9~10주)**: PDF Export 품질·워터마크 정교화, 임계값 설정(Admin) 화면, 회귀 스냅샷 셋 확대, 부하 테스트. 6주로 압축이 필요하면 W7(슬라이스 B)을 베타 직후 fast-follow로 분리하고 W1~W6(슬라이스 A 풀버티컬)을 MVP 코어로 우선 출시한다.

**주차별 누적 데모 흐름**: W2 업로드 → W3 CRO/검증 차단 → W4 자금일보·경보 → W5 AI Draft → W6 승인·근거 → W7 월결산 → W8 베타.

---

## 8. 리스크 · 오픈 이슈

### 8.1 주요 리스크 & 완화

| # | 리스크 | 영향 | 완화책 |
|---|---|---|---|
| R1 | **고객 엑셀 양식 다양성** — 회계 프로그램·사내 양식 편차로 매핑 실패율 상승 | 도입 마찰, 검증 FATAL 빈발 | 동의어 사전 확장, 매핑 영속화·재사용(§3.5), 베타 고객 양식 사전 수집·시드 |
| R2 | **결정론 예측의 정확도 한계** — 확정 항목만 쓰는 현금흐름 예측이 실제와 괴리 | 유동성 경보 신뢰 저하 | `확정 vs 예상` 명확 분리(§4.1-A), 예측치임을 UI·리포트에 명시, 임계값 튜닝 |
| R3 | **환각 가드 오탐/미탐** — 숫자 그라운딩(`hasApprox`)의 단위·반올림 경계 | 정상 리포트 반복 재생성 또는 미세 누락 통과 | 정규화 규칙 테스트셋 구축, 위반 로그 모니터링, 임계 근사값 조정(§5.6) |
| R4 | **계정 표준화 미매핑** — 비표준 계정이 BS/IS 누락 유발 | 재무제표 신뢰 저하 | 미매핑 FATAL 차단(`crit.accountMappingFailure`) + "미분류" 버킷 명시, 사람 확정 강제 |
| R5 | **Claude API 비용·지연** — opus-4-8 단가, 야간 배치 지연 | 운영비·즉효성 저하 | prompt caching(~0.1배), 스트리밍 타임아웃 방지, batch는 후속 검토(§5.5) |
| R6 | **단일 승인자 1단계의 통제 한계** — 소규모팀 self-approval 우회 시도 | 감사 무결성 | self-approval 코드 차단 + append-only AuditLog + CRO 해시 추적(§2.1, §6.5) |
| R7 | **CRO 스냅샷 노후화(Stale)** — 원본 변경 후 구 리포트 오용 | 잘못된 의사결정 | Stale 배지·재생성 유도(§1.1), 리포트가 인용한 배치/CRO 고정 참조(§3.6) |
| R8 | **engine_version 변경 시 과거 재현성** — 산식 변경이 과거 수치를 흔듦 | 감사·신뢰 | CRO에 engineVersion 박제, inputsHash 회귀 테스트(§4.4) |

### 8.2 오픈 이슈 (결정 필요)

| # | 이슈 | 옵션 | 잠정 방향 |
|---|---|---|---|
| O1 | **공휴일/영업일 캘린더 소스** — `crit.periodGap`·예측 영업일 보정 기준 | (a) 내장 한국 공휴일 테이블 (b) 외부 API (c) 테넌트 설정 | (a) 내장 + (c) 보정값. 연단위 공휴일 시드 갱신 절차 필요 |
| O2 | **임계값 기본/오버라이드 거버넌스** — TenantConfig 변경 권한·이력 | Admin만 변경 + AuditLog 기록 vs 잠금 | Admin 변경 + append-only 기록. 변경 후 기존 CRO 재계산 트리거 여부 미정 |
| O3 | **재업로드 시 활성 배치 전환 정책** — 동월 재업로드가 기존 Draft에 미치는 영향 | 자동 Stale 처리 vs 사용자 확인 | 자동 Stale 배지 + 명시 재생성. 진행 중 승인요청 건의 처리 규칙 확정 필요 |
| O4 | **숫자 추출 정규식의 한국어 단위** — "18.5억", "₩3.2조" 등 혼합 표기 | 정규식 확장 vs 모델에 숫자 표기 규약 강제 | 시스템 프롬프트로 표준 표기 유도 + `hasApprox` 한국어 단위 파서 보강 |
| O5 | **PDF Export 근거 패널 표현** — 인터랙티브 하이라이트의 정적 변환 | 각주+부록 표 vs 셀 스냅샷 이미지 | 각주 번호 + 근거 부록 테이블. 셀 좌표·원본 파일명 명시 |
| O6 | **AI 리포트 다국어/톤** — 베타 고객별 표현 수위 | 고정 프롬프트 vs 테넌트 톤 설정 | MVP는 고정(한국어, 실무 톤). 후속에서 톤 파라미터화 검토 |
| O7 | **이상분개 룰 임계의 업종 편차** — 제조 vs 도소매 3σ/aging 기준 | 단일 기본값 vs 업종 프리셋 | 단일 보수 기본값 + TenantConfig 오버라이드. 업종 프리셋은 데이터 축적 후 |
| O8 | **알림 전달(인앱 only)** — BLOCKED·승인대기 알림의 실시간성 | SSE 인앱 vs 후속 이메일 | MVP는 인앱(SSE+My Queue). 이메일/슬랙은 비범위(후속) |
| O9 | **샘플/시드 데이터의 현실성** — 베타 온보딩용 더미 데이터 품질 | 합성 vs 익명화 실데이터 | 합성 데이터(검증 케이스 포함). 실데이터 익명화는 고객 협의 |

### 8.3 명시적 비범위 재확인 (§0.2 참조)
ERP/뱅킹 실연동, 멀티테넌트/SSO 관리 화면, AI의 숫자 생성·시뮬레이션, 자동 분개 완전 무인화, 세무·공시 산출물, 모바일 앱·실시간 동시편집, 다단계 결재선, 알림 채널 다양화, 대시보드 커스터마이징은 모두 MVP 비범위이며, 본 PRD의 추상화(DataConnector·TenantContext·RBAC 골격·CRO 계약)는 이들을 후속 단계에서 낮은 비용으로 확장할 수 있도록 설계되었다.