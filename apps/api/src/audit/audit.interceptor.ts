import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';

/**
 * AuditInterceptor — 전역. 모든 상태변경(POST/PUT/PATCH/DELETE) 요청을 자동 기록.
 * 세밀한 도메인 감사(승인/계산 등)는 각 서비스가 AuditService.log로 별도 기록하고,
 * 이 인터셉터는 횡단 관심사(누가 어떤 mutating 엔드포인트를 호출했는가)를 보강한다.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly mutating = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method: string = req?.method ?? 'GET';

    if (!this.mutating.has(method)) {
      return next.handle();
    }

    const user = req?.user;
    const path: string = req?.originalUrl ?? req?.url ?? '';

    return next.handle().pipe(
      tap(() => {
        // 실패한 요청은 예외로 빠져 여기 도달하지 않음 → 성공한 mutating 요청만 기록.
        void this.audit
          .log({
            action: 'HTTP_MUTATION',
            targetType: 'HttpRequest',
            targetId: `${method} ${path}`,
            actorId: user?.userId ?? null,
            tenantId: user?.tenantId,
            metadata: { method, path },
          })
          .catch(() => undefined);
      }),
    );
  }
}
