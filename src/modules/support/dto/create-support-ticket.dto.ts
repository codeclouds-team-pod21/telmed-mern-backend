import { IsArray, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSupportTicketDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(255)
  subject!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsArray()
  attachments?: string[];
}
