import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../common/constants';

/**
 * AuthService — 이메일/비밀번호 검증 후 JWT 발급. PRD §6.5.
 * MVP는 시드 사용자(bcrypt 해시)로 로그인.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');

    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload);

    // 인증 이벤트 감사 기록(W1 완료기준: AuditLog에 인증 이벤트 기록).
    await this.audit.log({
      action: AuditAction.LOGIN,
      targetType: 'User',
      targetId: user.id,
      actorId: user.id,
      tenantId: user.tenantId,
      metadata: { email: user.email, role: user.role },
    });

    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }
}
