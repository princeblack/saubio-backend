import { Body, Controller, Post } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateGuestBookingDto } from './dto';

@Controller('public/bookings')
export class BookingDraftsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  createGuestBooking(@Body() payload: CreateGuestBookingDto) {
    return this.bookingsService.createGuestDraft(payload);
  }
}
