import { IsString } from 'class-validator';

export class PrepareCheckoutPaymentDto {
  @IsString()
  bookingId!: string;
}
