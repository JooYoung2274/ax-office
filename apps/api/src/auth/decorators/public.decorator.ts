import { SetMetadata } from '@nestjs/common';

/** @Public() — JwtAuthGuard 우회(로그인·헬스체크 등). PRD §6.5. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
