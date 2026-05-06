import { IsOptional, IsPhoneNumber, IsString, MaxLength } from 'class-validator';

export class UpdateCustomerProfileDto {
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsPhoneNumber('US')
  phone?: string;
}
