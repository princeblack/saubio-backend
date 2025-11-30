import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AddDisputeMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}
