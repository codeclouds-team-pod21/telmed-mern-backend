import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class UpsertCustomerAddressDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id?: number;

  @IsOptional()
  @IsString()
  crmAddressId?: string;

  @IsString()
  @MaxLength(100)
  fname!: string;

  @IsString()
  @MaxLength(100)
  lname!: string;

  @IsString()
  @MaxLength(255)
  address1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address2?: string;

  @IsString()
  @Length(2, 2)
  country!: string;

  @IsString()
  @MaxLength(10)
  state!: string;

  @IsString()
  @MaxLength(100)
  city!: string;

  @IsString()
  @MaxLength(20)
  zipCode!: string;

  @IsOptional()
  @IsBoolean()
  makeDefault?: boolean;

  @IsOptional()
  @IsIn(['shipping', 'billing'])
  type?: 'shipping' | 'billing';
}
