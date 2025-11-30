import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminOperationsMetrics } from '@saubio/models';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminOperationsService } from './operations.service';

@ApiTags('admin')
@Controller('admin/operations')
@UseGuards(AccessTokenGuard, RolesGuard)
export class AdminOperationsController {
  constructor(private readonly adminOperationsService: AdminOperationsService) {}

  @Get()
  @Roles('admin', 'employee')
  @ApiOperation({ summary: 'Retrieve operational metrics and incidents' })
  @ApiOkResponse({ description: 'Operations data returned successfully.' })
  getOperations(): Promise<AdminOperationsMetrics> {
    return this.adminOperationsService.getOperations();
  }
}
