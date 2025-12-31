import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IdentityDocumentTypesService } from './identity-document-types.service';
import { CreateIdentityDocumentTypeDto, UpdateIdentityDocumentTypeDto } from './dto/identity-document-type.dto';

@ApiTags('admin-identity')
@Controller('admin/identity/document-types')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class IdentityDocumentTypesController {
  constructor(private readonly documentTypes: IdentityDocumentTypesService) {}

  @Get()
  list(@Query('includeArchived') includeArchived?: string) {
    return this.documentTypes.list({ includeArchived: includeArchived === 'true' });
  }

  @Post()
  create(@Body() payload: CreateIdentityDocumentTypeDto) {
    return this.documentTypes.create(payload);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() payload: UpdateIdentityDocumentTypeDto) {
    return this.documentTypes.update(id, payload);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentTypes.softDelete(id);
  }
}
