import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';

/**
 * TenantInterceptor — 요청에서 tenantId/userId를 뽑아 AsyncLocalStorage에 적재.
 * JwtAuthGuard가 채운 req.user(있으면) 또는 DEFAULT_TENANT_ID를 사용.
 * 인증 이전(로그인/헬스) 요청도 DEFAULT 테넌트로 안전하게 동작한다.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenant: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    const defaultTenant = process.env.DEFAULT_TENANT_ID ?? 'DEFAULT';
    const store = {
      tenantId: user?.tenantId ?? defaultTenant,
      userId: user?.userId,
      role: user?.role,
    };
    return this.tenant.run(store, () => next.handle());
  }
}
