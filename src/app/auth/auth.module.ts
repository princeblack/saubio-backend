import { Module, forwardRef } from '@nestjs/common';
import { JwtModule, JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { RefreshTokensService } from './refresh-tokens.service';
import { AccessTokenGuard } from './guards/access-token.guard';
import { RolesGuard } from './guards/roles.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [
    UsersModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => SecurityModule),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const expiresIn = config.get<string>('app.jwtAccessExpiresIn') ?? '1h';
        return {
          secret: config.get<string>('app.jwtAccessSecret'),
          signOptions: {
            expiresIn: expiresIn as JwtSignOptions['expiresIn'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokensService, AccessTokenGuard, RolesGuard],
  exports: [AuthService, AccessTokenGuard, RolesGuard, JwtModule, UsersModule],
})
export class AuthModule {}
