import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { AppleOAuthDto, GoogleOAuthDto, LoginDto, RefreshTokenDto, RegisterDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() payload: RegisterDto, @Req() request: Request) {
    return this.authService.register(payload, request);
  }

  @Post('login')
  login(@Body() payload: LoginDto, @Req() request: Request) {
    return this.authService.login(payload, request);
  }

  @Post('refresh')
  refresh(@Body() payload: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(payload, request);
  }

  @Post('logout')
  logout(@Body() payload: RefreshTokenDto) {
    return this.authService.logout(payload);
  }

  @Post('oauth/google')
  googleLogin(@Body() payload: GoogleOAuthDto, @Req() request: Request) {
    return this.authService.loginWithGoogle(payload, request);
  }

  @Post('oauth/apple')
  appleLogin(@Body() payload: AppleOAuthDto, @Req() request: Request) {
    return this.authService.loginWithApple(payload, request);
  }
}
