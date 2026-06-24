import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './tenant/tenant.module';
import { TenantInterceptor } from './tenant/tenant.interceptor';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { UploadModule } from './upload/upload.module';
import { CalcModule } from './calc/calc.module';
import { ReportModule } from './report/report.module';
import { FinanceModule } from './finance/finance.module';
import { HealthController } from './health/health.controller';

/**
 * AppModule — 루트. ConfigModule(전역), BullMQ(Redis), 7개 기능 모듈 + 전역 가드/인터셉터.
 *
 * 전역 적용 순서(중요):
 *  - APP_GUARD: JwtAuthGuard(인증) → RolesGuard(인가)
 *  - APP_INTERCEPTOR: TenantInterceptor(tenantId 적재) → AuditInterceptor(감사)
 *    (인터셉터는 등록 역순이 아닌 등록 순서로 pre-controller 실행 → Tenant 먼저)
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // BullMQ 루트(Redis). 모든 큐가 공유.
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: Number(config.get<string>('REDIS_PORT') ?? 6379),
        },
      }),
    }),

    // 인프라(전역).
    PrismaModule,
    TenantModule,
    AuditModule,

    // 기능 모듈 7개 (PRD §6.1).
    AuthModule,
    UploadModule,
    CalcModule,
    ReportModule,
    FinanceModule,
  ],
  controllers: [HealthController],
  providers: [
    // 전역 가드: 인증 → 인가.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // 전역 인터셉터: 테넌트 컨텍스트 → 감사.
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
