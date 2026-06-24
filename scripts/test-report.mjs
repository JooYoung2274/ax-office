// AI 리포트 생성 E2E: 최신 cash 배치 → POST report → 폴링 → findings/guard/usage 출력.
const BASE = 'http://localhost:3000/api/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'approver@axaxax.dev', password: 'approver1234' }) })).json();
const H = { authorization: `Bearer ${login.accessToken}`, 'content-type': 'application/json' };

// 최신 cash 배치(계산 완료) 찾기
const periods = await (await fetch(`${BASE}/finance/periods?domain=cash`, { headers: H })).json();
const batch = (periods.periods || []).find((b) => b.lifecycle === 'CALCULATED') || periods.periods?.[0];
console.log('대상 배치:', batch?.id?.slice(0, 10), '| lifecycle:', batch?.lifecycle);
if (!batch) { console.log('계산된 cash 배치 없음'); process.exit(1); }

// 리포트 생성 트리거
const genRes = await fetch(`${BASE}/batches/${batch.id}/reports`, { method: 'POST', headers: H });
const gen = await genRes.json();
console.log('POST report →', genRes.status, '| reportId:', gen.reportId || gen.id, '| status:', gen.status);
const reportId = gen.reportId || gen.id;
if (!reportId) { console.log('응답:', JSON.stringify(gen)); process.exit(1); }

// 폴링(Claude 호출 대기)
let report;
const start = Date.now();
process.stdout.write('AI 생성 대기');
while (Date.now() - start < 90000) {
  await sleep(2500);
  process.stdout.write('.');
  report = await (await fetch(`${BASE}/reports/${reportId}`, { headers: H })).json();
  if (['DRAFT', 'APPROVED', 'REJECTED', 'CALCULATED', 'BLOCKED'].includes(report.status)) break;
}
console.log('\n\n=== 결과 ===');
console.log('status:', report.status, '| regenCount:', report.regenCount, '| confidence:', report.confidence);
const c = report.content || {};
console.log('\n[요약]', c.summary);
console.log('\n[findings]');
for (const f of c.findings || []) {
  console.log(` - (${f.severity}) ${f.title || f.area}: ${f.observation}`);
  console.log(`   근거 evidence_refs: ${JSON.stringify(f.evidence_refs)}`);
  console.log(`   원인가설: ${f.rootCauseHypothesis}`);
}
console.log('\n[recommendations]');
for (const r of c.recommendations || []) console.log(` - ${r.action} (impact:${r.impact}/effort:${r.effort})`);
console.log('\n[dataCaveats]', JSON.stringify(c.dataCaveats));
console.log('\n[환각 가드]', JSON.stringify(report.guard));
