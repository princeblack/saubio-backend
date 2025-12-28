import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type {
  AdminFinanceCommissionsResponse,
  AdminFinanceExportsResponse,
  AdminFinanceOverviewResponse,
  AdminFinancePaymentItem,
  AdminFinancePayoutItem,
  AdminFinanceSettingsResponse,
  AdminFinanceInvoicesResponse,
  AdminPaginatedResponse,
} from '@saubio/models';
import { EmployeeFinanceService } from './finance.service';
import {
  FinanceCommissionsQueryDto,
  FinancePaymentsQueryDto,
  FinancePayoutsQueryDto,
  FinanceRangeQueryDto,
  FinanceInvoicesQueryDto,
} from './dto/admin-finance-query.dto';

@ApiTags('employee')
@Controller('employee/finance')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class EmployeeFinanceController {
  constructor(private readonly financeService: EmployeeFinanceService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Overview of payments & payouts' })
  @ApiOkResponse({ description: 'Overview computed.' })
  async overview(@Query() query: FinanceRangeQueryDto): Promise<AdminFinanceOverviewResponse> {
    return this.financeService.getOverview(query);
  }

  @Get('payments')
  @ApiOperation({ summary: 'List client payments' })
  async listPayments(@Query() query: FinancePaymentsQueryDto): Promise<AdminPaginatedResponse<AdminFinancePaymentItem>> {
    return this.financeService.listPayments(query);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'List provider payouts' })
  async listPayouts(@Query() query: FinancePayoutsQueryDto): Promise<AdminPaginatedResponse<AdminFinancePayoutItem>> {
    return this.financeService.listPayouts(query);
  }

  @Get('commissions')
  @ApiOperation({ summary: 'Commission breakdown' })
  async commissions(@Query() query: FinanceCommissionsQueryDto): Promise<AdminFinanceCommissionsResponse> {
    return this.financeService.getCommissions(query);
  }

  @Get('exports')
  @ApiOperation({ summary: 'Available finance exports' })
  async exports(@Query() query: FinanceRangeQueryDto): Promise<AdminFinanceExportsResponse> {
    return this.financeService.getExports(query);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Payment provider settings' })
  async settings(): Promise<AdminFinanceSettingsResponse> {
    return this.financeService.getSettings();
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Client invoices & provider statements' })
  async invoices(@Query() query: FinanceInvoicesQueryDto): Promise<AdminFinanceInvoicesResponse> {
    return this.financeService.getInvoices(query);
  }
}
