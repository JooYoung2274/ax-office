import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** JWT 검증 후 req.user에 적재되는 인증 주체. */
export interface AuthUser {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

/** @CurrentUser() — 핸들러에 인증 사용자 주입. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as AuthUser;
  },
);
