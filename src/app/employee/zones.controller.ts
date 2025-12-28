import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EmployeeZonesService } from './zones.service';
import type {
  AdminPostalZonesResponse,
  AdminZoneCoverageResponse,
  AdminProviderServiceAreasResponse,
  AdminZoneMatchingRulesResponse,
  AdminMatchingTestResponse,
} from '@saubio/models';
import { PostalZonesQueryDto } from './dto/postal-zones-query.dto';
import { ProviderServiceAreasQueryDto } from './dto/provider-service-areas-query.dto';
import { MatchingTestDto } from './dto/matching-test.dto';

@ApiTags('employee')
@Controller('employee/zones')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class EmployeeZonesController {
  constructor(private readonly zones: EmployeeZonesService) {}

  @Get('reference')
  @ApiOperation({ summary: 'Référentiel des codes postaux/villes' })
  reference(@Query() query: PostalZonesQueryDto): AdminPostalZonesResponse {
    return this.zones.listZones(query);
  }

  @Get('coverage')
  @ApiOperation({ summary: 'Couverture prestataires par zone' })
  async coverage(): Promise<AdminZoneCoverageResponse> {
    return this.zones.zoneCoverage();
  }

  @Get('service-areas')
  @ApiOperation({ summary: 'Zones d’intervention déclarées par les prestataires' })
  async serviceAreas(@Query() query: ProviderServiceAreasQueryDto): Promise<AdminProviderServiceAreasResponse> {
    return this.zones.providerServiceAreas(query);
  }

  @Get('rules')
  @ApiOperation({ summary: 'Paramètres de matching par zone' })
  async rules(): Promise<AdminZoneMatchingRulesResponse> {
    return this.zones.matchingRules();
  }

  @Post('matching/test')
  @ApiOperation({ summary: 'Diagnostic de matching sur un cas concret' })
  async matchingTest(@Body() payload: MatchingTestDto): Promise<AdminMatchingTestResponse> {
    return this.zones.matchingTest(payload);
  }
}
