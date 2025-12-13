import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { PostalCodeService } from './postal-code.service';
import type { PostalCodeLookupResponse } from '@saubio/models';

@Controller('geo/postal-codes')
export class PostalCodeController {
  constructor(private readonly postalCodes: PostalCodeService) {}

  @Get(':postalCode')
  @Header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=43200')
  lookup(@Param('postalCode') postalCode: string): PostalCodeLookupResponse {
    const result = this.postalCodes.lookup(postalCode);
    if (!result) {
      throw new NotFoundException('POSTAL_CODE_NOT_FOUND');
    }
    return {
      postalCode: result.postalCode,
      city: result.city,
      area: result.area,
      state: result.state,
      normalizedCity: result.normalizedCity,
    };
  }
}
