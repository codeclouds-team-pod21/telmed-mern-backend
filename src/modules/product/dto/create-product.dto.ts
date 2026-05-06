import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ProductVariantDto } from './product-variant.dto';
import { ProductClassification } from '../product.enums';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  description!: string;

  @IsString()
  productCategory!: string;

  @IsString()
  productType!: string;

  @IsOptional()
  @IsEnum(ProductClassification)
  productClassification?: ProductClassification;

  @IsNumber()
  displayPrice!: number;

  @IsString()
  genderAvailability!: string;

  @IsOptional()
  @IsInt()
  generalQuestion?: number;

  @IsInt()
  medicalQuestion!: number;

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

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  restrictedState!: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  swappableProductIds?: number[];

  @IsBoolean()
  status!: boolean;

  @IsOptional()
  @IsBoolean()
  blockMilitaryBases?: boolean;

  @IsOptional()
  @IsBoolean()
  blockIslands?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  productVariants!: ProductVariantDto[];
}
