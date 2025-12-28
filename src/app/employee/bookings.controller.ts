import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type {
  AdminBookingDetails,
  AdminBookingListItem,
  AdminBookingOverviewResponse,
  AdminPaginatedResponse,
} from '@saubio/models';
import { EmployeeBookingsService } from './bookings.service';
import { AdminBookingsQueryDto } from './dto/admin-bookings-query.dto';

@ApiTags('employee')
@Controller('employee/bookings')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class EmployeeBookingsController {
  constructor(private readonly bookings: EmployeeBookingsService) {}

  @Get()
  @ApiOperation({ summary: 'List bookings with advanced filters' })
  @ApiOkResponse({ description: 'Bookings returned successfully.' })
  list(@Query() query: AdminBookingsQueryDto): Promise<AdminPaginatedResponse<AdminBookingListItem>> {
    return this.bookings.list(query);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Overview metrics for bookings' })
  overview(@Query('rangeDays') rangeDays?: string): Promise<AdminBookingOverviewResponse> {
    return this.bookings.getOverview(Number(rangeDays) || 30);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Booking details' })
  detail(@Param('id') id: string): Promise<AdminBookingDetails> {
    return this.bookings.getDetails(id);
  }
}
