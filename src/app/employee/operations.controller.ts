import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminOperationsMetrics } from '@saubio/models';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EmployeeOperationsService } from './operations.service';

@ApiTags('employee')
@Controller('employee/operations')
@UseGuards(AccessTokenGuard, RolesGuard)
export class EmployeeOperationsController {
  constructor(private readonly operationsService: EmployeeOperationsService) {}

  @Get()
  @Roles('employee')
  @ApiOperation({ summary: 'Retrieve operational metrics and incidents' })
  @ApiOkResponse({ description: 'Operations data returned successfully.' })
  getOperations(): Promise<AdminOperationsMetrics> {
    return this.operationsService.getOperations();
  }
}
