import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  BookingRequest,
  PaymentRecord,
  ProviderDashboardResponse,
  ProviderProfile,
  ProviderResourceItem,
  ProviderServiceCatalogResponse,
  User,
} from '@saubio/models';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProviderService, type ProviderOnboardingStatusResponse } from './provider.service';
import { ProviderMissionFiltersDto } from './dto/provider-mission-filters.dto';
import { UpdateProviderMissionStatusDto } from './dto/update-provider-mission-status.dto';
import { UpdateProviderProfileDto } from './dto/update-provider-profile.dto';
import { UpdateProviderServicesDto } from './dto/update-provider-services.dto';
import { CancelProviderMissionDto } from './dto/cancel-provider-mission.dto';
import { CompleteIdentityDto } from './dto/complete-identity.dto';
import { CompleteAddressDto } from './dto/complete-address.dto';
import { CompletePhoneDto } from './dto/complete-phone.dto';
import { RequestPhoneVerificationDto } from './dto/request-phone-verification.dto';
import { SignupFeeRequestDto } from './dto/signup-fee-request.dto';
import { CompleteWelcomeSessionDto } from './dto/complete-welcome-session.dto';
import { UploadIdentityDocumentDto } from './dto/upload-identity-document.dto';
import { UpdateProviderAvailabilityDto } from './dto/update-provider-availability.dto';
import { CreateProviderTimeOffDto } from './dto/create-provider-time-off.dto';

@ApiTags('provider')
@Controller('provider')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('provider', 'employee', 'admin')
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: User): Promise<ProviderDashboardResponse> {
    return this.providerService.getDashboard(user);
  }

  @Get('missions')
  listMissions(
    @CurrentUser() user: User,
    @Query() filters: ProviderMissionFiltersDto
  ): Promise<BookingRequest[]> {
    return this.providerService.listMissions(user, filters);
  }

  @Get('missions/:id')
  getMission(@CurrentUser() user: User, @Param('id') id: string): Promise<BookingRequest> {
    return this.providerService.getMission(user, id);
  }

  @Patch('missions/:id')
  updateMissionStatus(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() payload: UpdateProviderMissionStatusDto
  ): Promise<BookingRequest> {
    return this.providerService.updateMission(user, id, payload);
  }

  @Post('missions/:id/cancel')
  cancelMission(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() payload: CancelProviderMissionDto
  ): Promise<BookingRequest> {
    return this.providerService.cancelMission(user, id, payload.reason);
  }

  @Get('payments')
  listPayments(@CurrentUser() user: User): Promise<PaymentRecord[]> {
    return this.providerService.listPayments(user);
  }

  @Get('resources')
  listResources(@CurrentUser() user: User): Promise<ProviderResourceItem[]> {
    return this.providerService.listResources(user);
  }

  @Get('profile')
  getProfile(@CurrentUser() user: User): Promise<ProviderProfile> {
    return this.providerService.getProfile(user);
  }

  @Put('profile')
  updateProfile(
    @CurrentUser() user: User,
    @Body() payload: UpdateProviderProfileDto
  ): Promise<ProviderProfile> {
    return this.providerService.updateProfile(user, payload);
  }

  @Get('services')
  getServiceCatalog(@CurrentUser() user: User): Promise<ProviderServiceCatalogResponse> {
    return this.providerService.getServiceCatalog(user);
  }

  @Put('services')
  updateServiceCatalog(
    @CurrentUser() user: User,
    @Body() payload: UpdateProviderServicesDto
  ): Promise<ProviderServiceCatalogResponse> {
    return this.providerService.updateServiceCatalog(user, payload);
  }

  @Get('invitations')
  listInvitations(@CurrentUser() user: User) {
    return this.providerService.listShortNoticeInvitations(user);
  }

  @Post('invitations/:invitationId/accept')
  acceptInvitation(@CurrentUser() user: User, @Param('invitationId') invitationId: string) {
    return this.providerService.acceptShortNoticeInvitation(user, invitationId);
  }

  @Post('invitations/:invitationId/decline')
  declineInvitation(@CurrentUser() user: User, @Param('invitationId') invitationId: string) {
    return this.providerService.declineShortNoticeInvitation(user, invitationId);
  }

  @Get('onboarding/status')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  getOnboardingStatus(@CurrentUser() user: User): Promise<ProviderOnboardingStatusResponse> {
    return this.providerService.getOnboardingStatus(user);
  }

  @Patch('onboarding/identity')
  completeIdentity(
    @CurrentUser() user: User,
    @Body() payload: CompleteIdentityDto
  ): Promise<ProviderOnboardingStatusResponse> {
    return this.providerService.completeIdentityStep(user, payload);
  }

  @Patch('onboarding/address')
  completeAddress(
    @CurrentUser() user: User,
    @Body() payload: CompleteAddressDto
  ): Promise<ProviderOnboardingStatusResponse> {
    return this.providerService.completeAddressStep(user, payload);
  }

  @Patch('onboarding/phone')
  completePhone(
    @CurrentUser() user: User,
    @Body() payload: CompletePhoneDto
  ): Promise<ProviderOnboardingStatusResponse> {
    return this.providerService.completePhoneStep(user, payload);
  }

  @Post('onboarding/phone/request')
  requestPhoneCode(
    @CurrentUser() user: User,
    @Body() payload: RequestPhoneVerificationDto
  ) {
    return this.providerService.requestPhoneVerification(user, payload);
  }

  @Post('onboarding/fee')
  handleSignupFee(@CurrentUser() user: User, @Body() payload: SignupFeeRequestDto) {
    return this.providerService.handleSignupFee(user, payload);
  }

  @Post('onboarding/identity/document')
  uploadIdentityDocument(@CurrentUser() user: User, @Body() payload: UploadIdentityDocumentDto) {
    return this.providerService.uploadIdentityDocument(user, payload);
  }

  @Post('onboarding/welcome')
  completeWelcomeSession(@CurrentUser() user: User, @Body() payload: CompleteWelcomeSessionDto) {
    return this.providerService.completeWelcomeSession(user, payload);
  }

  @Get('availability')
  getAvailability(@CurrentUser() user: User) {
    return this.providerService.getAvailability(user);
  }

  @Put('availability')
  updateAvailability(
    @CurrentUser() user: User,
    @Body() payload: UpdateProviderAvailabilityDto
  ) {
    return this.providerService.updateAvailability(user, payload);
  }

  @Post('time-off')
  createTimeOff(
    @CurrentUser() user: User,
    @Body() payload: CreateProviderTimeOffDto
  ) {
    return this.providerService.createTimeOff(user, payload);
  }

  @Delete('time-off/:id')
  deleteTimeOff(@CurrentUser() user: User, @Param('id') id: string) {
    return this.providerService.deleteTimeOff(user, id);
  }

}
