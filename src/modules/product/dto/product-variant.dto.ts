import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class VariantPlanDto {
  @IsInt()
  @Min(1)
  planId!: number;

  @IsInt()
  @Min(1)
  campaign!: number;

  @IsInt()
  @Min(1)
  offer!: number;

  @IsInt()
  @Min(1)
  shippingProfile!: number;

  @IsNumber()
  @Min(0)
  sellingPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  discountCoupon?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationWeeks?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  supplyWeeks?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  status?: boolean;
}

class VariantBasicDto {
  @IsOptional()
  @IsInt()
  id?: number;

  @IsString()
  @IsNotEmpty()
  variantName!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  image?: string;
}

class VariantCrmDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique((item: VariantPlanDto) => item.planId)
  @ValidateNested({ each: true })
  @Type(() => VariantPlanDto)
  plans?: VariantPlanDto[];

  @IsInt()
  @Min(1)
  offer!: number;

  @IsInt()
  @Min(1)
  shippingProfile!: number;

  @IsString()
  pharmacy!: string;

  @IsInt()
  @Min(1)
  campaign!: number;
}

class VariantDoctorDto {
  @IsInt()
  @Min(1)
  networkId!: number;

  @IsInt()
  @Min(0)
  refills!: number;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsInt()
  @Min(1)
  daysSupply!: number;

  @IsInt()
  @Min(1)
  dispenseUnit!: number;

  @IsString()
  offrableId!: string;

  @IsInt()
  @Min(1)
  prescriptionDuration!: number;

  @IsString()
  metaData!: string;
}

export class ProductVariantDto {
  @ValidateNested()
  @Type(() => VariantBasicDto)
  basic!: VariantBasicDto;

  @ValidateNested()
  @Type(() => VariantCrmDto)
  crm!: VariantCrmDto;

  @ValidateNested()
  @Type(() => VariantDoctorDto)
  doctor!: VariantDoctorDto;

  @IsOptional()
  @IsBoolean()
  isSupplyAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  isTitrationAvailable?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  supplyProducts?: number[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  titrationProducts?: number[];

  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
