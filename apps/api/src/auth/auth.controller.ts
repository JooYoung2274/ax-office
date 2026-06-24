import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser, type AuthUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/v1/auth/login — 이메일/비밀번호 → JWT. (Public) */
  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  /** GET /api/v1/auth/me — 현재 사용자. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
