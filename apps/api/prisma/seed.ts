/**
 * 시드 — DEFAULT 테넌트 + 3 역할 사용자(bcrypt 해시). PRD §2.1 / W1 완료기준.
 *
 * 시드 로그인 정보(개발 전용 — 운영 배포 전 반드시 변경):
 *   staff@axaxax.dev    / staff1234     → FINANCE_STAFF (재무담당자)
 *   approver@axaxax.dev / approver1234  → FINANCE_APPROVER (재무팀장/승인자)
 *   admin@axaxax.dev    / admin1234     → ADMIN (관리자)
 *
 * 실행: npm run seed -w @axaxax/api  (또는 apps/api에서 npm run seed)
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TENANT_ID = process.env.DEFAULT_TENANT_ID ?? 'DEFAULT';

const SEED_USERS = [
  { email: 'staff@axaxax.dev', name: '김담당', password: 'staff1234', role: 'FINANCE_STAFF' },
  { email: 'approver@axaxax.dev', name: '이팀장', password: 'approver1234', role: 'FINANCE_APPROVER' },
  { email: 'admin@axaxax.dev', name: '박관리', password: 'admin1234', role: 'ADMIN' },
] as const;

async function main(): Promise<void> {
  // DEFAULT 테넌트(고정 ID로 upsert — 단일 테넌트).
  const tenant = await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    create: { id: TENANT_ID, name: 'Default Tenant' },
    update: {},
  });
  console.log(`테넌트 준비 완료: ${tenant.id}`);

  for (const u of SEED_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        tenantId: tenant.id,
        email: u.email,
        name: u.name,
        passwordHash,
        role: u.role as never,
      },
      update: { passwordHash, role: u.role as never, name: u.name },
    });
    console.log(`사용자 시드: ${u.email} (${u.role})`);
  }

  console.log('\n시드 완료. 로그인 예시:');
  console.log('  POST /api/v1/auth/login  { "email":"staff@axaxax.dev", "password":"staff1234" }');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
