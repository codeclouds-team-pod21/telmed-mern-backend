import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ProductClassification } from '../product.enums';
import { ProductVariantDto } from './product-variant.dto';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  productCategory?: string;

  @IsOptional()
  @IsString()
  productType?: string;

  @IsOptional()
  @IsEnum(ProductClassification)
  productClassification?: ProductClassification;

  @IsOptional()
  @IsNumber()
  displayPrice?: number;

  @IsOptional()
  @IsString()
  genderAvailability?: string;

  @IsOptional()
  @IsInt()
  generalQuestion?: number;

  @IsOptional()
  @IsInt()
  medicalQuestion?: number;

  @IsOptional()
  @IsInt()
  swappableProductQuestionaries?: number;

  @IsOptional()
  @IsString()
  productImage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keypoints?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  restrictedState?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  swappableProductIds?: number[];

  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @IsOptional()
  @IsBoolean()
  blockMilitaryBases?: boolean;

  @IsOptional()
  @IsBoolean()
  blockIslands?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  productVariants?: ProductVariantDto[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  deleteVariantIds?: number[];
}
