import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IdentityAuditService } from './identity-audit.service';
import { IdentityAuditQueryDto } from './dto/identity-audit-query.dto';

@ApiTags('admin-identity')
@Controller('admin/identity/audit')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class IdentityAuditController {
  constructor(private readonly audit: IdentityAuditService) {}

  @Get()
  list(@Query() query: IdentityAuditQueryDto) {
    return this.audit.list(query);
  }
}
