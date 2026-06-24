import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';

/**
 * TenantModule — @Global. TenantContextService(요청 단위 tenantId 전파).
 * TenantInterceptor는 AppModule에서 전역 인터셉터로 등록된다.
 */
@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantModule {}
