import { SetMetadata } from '@nestjs/common';
import { Role } from '@axaxax/shared';

/** @Roles(...) — 허용 역할 지정. RolesGuard가 읽는다. PRD §6.5. */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
