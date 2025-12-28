import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { User } from '@saubio/models';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProviderOnboardingDto } from './dto/provider-onboarding.dto';
import { ManualPayoutBatchDto } from './dto/manual-payout.dto';
import { CapturePaymentDto } from './dto/capture-payment.dto';
import { PrepareCheckoutPaymentDto } from './dto/prepare-checkout-payment.dto';
import { CreateMandateDto } from './dto/create-mandate.dto';
import { UpdateProviderPayoutStatusDto } from './dto/update-provider-payout-status.dto';
import { ProviderPayoutSetupDto } from './dto/provider-payout-setup.dto';
import { ProviderPayoutAdminDto } from './dto/provider-payout-admin.dto';
import { ProviderBankInfoDto } from './dto/provider-bank-info.dto';

@ApiTags('payments')
@Controller('payments')
@UseGuards(AccessTokenGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('mandates')
  @Roles('client', 'company', 'provider', 'employee', 'admin')
  listMandates(@CurrentUser() user: User) {
    return this.paymentsService.listMandates(user);
  }

  @Post('mandates')
  @Roles('client', 'company')
  createMandate(@Body() payload: CreateMandateDto, @CurrentUser() user: User) {
    return this.paymentsService.createMandate(payload, user);
  }

  @Get('events')
  @Roles('client', 'company', 'provider', 'employee', 'admin')
  listPaymentEvents(@CurrentUser() user: User) {
    return this.paymentsService.listCustomerPaymentEvents(user);
  }

  @Post('providers/onboarding/self')
  @Roles('provider')
  startOwnOnboarding(@CurrentUser() user: User, @Body() payload: ProviderPayoutSetupDto) {
    return this.paymentsService.setupProviderPayout(user, payload);
  }

  @Post('providers/onboarding')
  @Roles('admin', 'employee')
  startProviderOnboardingAdmin(@Body() payload: ProviderPayoutAdminDto) {
    return this.paymentsService.setupProviderPayoutByAdmin(payload);
  }

  @Get('providers/payment-method/bank')
  @Roles('provider', 'employee', 'admin')
  getProviderBankInfo(@CurrentUser() user: User): Promise<ProviderBankInfoDto> {
    return this.paymentsService.getProviderBankInfo(user);
  }

  @Post('providers/payment-method/bank')
  @Roles('provider', 'employee', 'admin')
  upsertProviderBankInfo(
    @CurrentUser() user: User,
    @Body() payload: ProviderPayoutSetupDto
  ): Promise<ProviderBankInfoDto> {
    return this.paymentsService.saveProviderBankInfo(user, payload);
  }

  @Patch('providers/:providerId/payout-status')
  @Roles('admin', 'employee')
  updateProviderPayoutStatus(
    @Param('providerId') providerId: string,
    @Body() payload: UpdateProviderPayoutStatusDto
  ) {
    return this.paymentsService.updateProviderPayoutStatus(providerId, payload);
  }

  @Post('payouts/manual')
  @Roles('admin', 'employee')
  createManualPayout(@Body() payload: ManualPayoutBatchDto) {
    const scheduledFor = payload.scheduledFor ? new Date(payload.scheduledFor) : undefined;
    return this.paymentsService.createManualPayoutBatch(scheduledFor, payload.note);
  }

  @Get('payouts')
  @Roles('admin', 'employee')
  listPayoutBatches() {
    return this.paymentsService.listPayoutBatches();
  }

  @Get('provider/documents')
  @Roles('provider', 'employee', 'admin')
  listProviderDocuments(@CurrentUser() user: User) {
    return this.paymentsService.listProviderDocuments(user);
  }

  @Post('capture')
  @Roles('client', 'company')
  captureBookingPayment(@Body() payload: CapturePaymentDto, @CurrentUser() user: User) {
    return this.paymentsService.captureCheckoutPayment(payload.bookingId, user);
  }

  @Post('checkout-intent')
  @Roles('client', 'company')
  prepareCheckoutPayment(@Body() payload: PrepareCheckoutPaymentDto, @CurrentUser() user: User) {
    return this.paymentsService.prepareCheckoutPayment(payload.bookingId, user);
  }
}
