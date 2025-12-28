import { Body, Controller, Post } from '@nestjs/common';
import type { PostalFollowUpResponse } from '@saubio/models';
import { FollowUpService } from './follow-up.service';
import { CreatePostalFollowUpDto } from './dto/create-follow-up.dto';

@Controller('follow-up')
export class FollowUpController {
  constructor(private readonly followUps: FollowUpService) {}

  @Post()
  create(@Body() dto: CreatePostalFollowUpDto): Promise<PostalFollowUpResponse> {
    return this.followUps.create(dto);
  }
}
