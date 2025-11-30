import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import {
  CancelBookingDto,
  ClaimBookingDto,
  ConfirmBookingLocksDto,
  CreateBookingDto,
  CreateBookingLockDto,
  ListBookingsQueryDto,
  ProviderSearchDto,
  ReleaseBookingLocksDto,
  UpdateBookingDto,
} from './dto';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@saubio/models';
import { BookingLocksService } from './booking-locks.service';

@Controller('bookings')
@UseGuards(AccessTokenGuard, RolesGuard)
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly bookingLocksService: BookingLocksService
  ) {}

  @Get()
  @Roles('client', 'company', 'provider', 'employee', 'admin')
  findAll(@CurrentUser() user: User, @Query() filters: ListBookingsQueryDto) {
    return this.bookingsService.findAll(user, filters);
  }

  @Get('providers/search')
  @Roles('client', 'company', 'employee', 'admin')
  listProviders(@Query() filters: ProviderSearchDto, @CurrentUser() user: User) {
    return this.bookingsService.listProviderSuggestions(filters, user);
  }

  @Get(':id')
  @Roles('client', 'company', 'provider', 'employee', 'admin')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.bookingsService.findOne(id, user);
  }

  @Post()
  @Roles('client', 'company', 'employee', 'admin')
  create(@Body() payload: CreateBookingDto, @CurrentUser() user: User) {
    return this.bookingsService.create(payload, user);
  }

  @Post(':id/claim')
  @Roles('client', 'company')
  claim(
    @Param('id') id: string,
    @Body() payload: ClaimBookingDto,
    @CurrentUser() user: User
  ) {
    return this.bookingsService.claimGuestBooking(id, payload.guestToken, user);
  }

  @Patch(':id')
  @Roles('client', 'company', 'employee', 'admin')
  update(@Param('id') id: string, @Body() payload: UpdateBookingDto, @CurrentUser() user: User) {
    return this.bookingsService.update(id, payload, user);
  }

  @Post(':id/cancel')
  @Roles('client', 'company', 'employee', 'admin')
  cancel(
    @Param('id') id: string,
    @Body() payload: CancelBookingDto | undefined,
    @CurrentUser() user: User
  ) {
    return this.bookingsService.cancel(id, user, payload);
  }

  @Post(':id/fallback/assign')
  @Roles('employee', 'admin')
  assignFallbackTeam(@Param('id') id: string, @CurrentUser() user: User) {
    return this.bookingsService.assignFallbackTeam(id, user);
  }

  @Post(':id/locks')
  @Roles('employee', 'admin')
  createLocks(
    @Param('id') id: string,
    @Body() payload: CreateBookingLockDto,
    @CurrentUser() user: User
  ) {
    return this.bookingLocksService.createLocks(id, payload, user);
  }

  @Post(':id/locks/confirm')
  @Roles('employee', 'admin')
  confirmLocks(
    @Param('id') id: string,
    @Body() payload: ConfirmBookingLocksDto,
    @CurrentUser() user: User
  ) {
    return this.bookingLocksService.confirmLocks(id, payload, user);
  }

  @Post(':id/locks/release')
  @Roles('employee', 'admin')
  releaseLocks(
    @Param('id') id: string,
    @Body() payload: ReleaseBookingLocksDto,
    @CurrentUser() user: User
  ) {
    return this.bookingLocksService.releaseLocks(id, payload, user);
  }

  @Get(':id/locks')
  @Roles('employee', 'admin')
  listLocks(@Param('id') id: string, @CurrentUser() user: User) {
    return this.bookingLocksService.listLocks(id, user);
  }
}
