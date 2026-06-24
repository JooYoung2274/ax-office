import { IsEmail, IsString, MinLength } from 'class-validator';

/** 로그인 요청 DTO. */
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
