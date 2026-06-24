import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

/**
 * AuditModule — @Global. EvidenceLedger writer + 조회. PRD §6.1.
 * AuditInterceptor는 AppModule에서 전역 인터셉터로 등록된다.
 */
@Global()
@Module({
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
