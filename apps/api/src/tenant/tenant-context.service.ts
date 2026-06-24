import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 요청 단위 테넌트/사용자 컨텍스트 — PRD §6.1 TenantModule.
 * MVP는 tenantId=DEFAULT 단일 테넌트지만, 모든 쿼리에서 where:{tenantId}를 강제하기 위한
 * 시임(seam)을 둔다. 멀티테넌트 전환 비용을 0에 가깝게 유지.
 */
export interface TenantStore {
  tenantId: string;
  userId?: string;
  role?: string;
}

@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  /** 현재 요청 컨텍스트로 콜백 실행. (TenantInterceptor가 진입점에서 호출) */
  run<T>(store: TenantStore, fn: () => T): T {
    return this.als.run(store, fn);
  }

  private get store(): TenantStore | undefined {
    return this.als.getStore();
  }

  /** 현재 tenantId. 컨텍스트 밖이면 DEFAULT(시드/잡 등). */
  get tenantId(): string {
    return this.store?.tenantId ?? process.env.DEFAULT_TENANT_ID ?? 'DEFAULT';
  }

  get userId(): string | undefined {
    return this.store?.userId;
  }

  get role(): string | undefined {
    return this.store?.role;
  }
}
