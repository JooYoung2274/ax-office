import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@axaxax/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * RolesGuard — @Roles(...)에 명시된 역할만 통과. PRD §2.1 / §6.5.
 * 역할 미지정 핸들러는 누구나(인증만 되면) 통과(기본 FINANCE_STAFF 이상).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const role: string | undefined = req.user?.role;
    if (role && required.includes(role as Role)) return true;

    throw new ForbiddenException(`이 작업에는 ${required.join(' 또는 ')} 권한이 필요합니다.`);
  }
}
