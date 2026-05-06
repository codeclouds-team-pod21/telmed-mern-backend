import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class UpdateFunnelProductInputDto {
  @IsOptional()
  @IsInt()
  id?: number;

  @IsInt()
  productId!: number;

  @IsInt()
  productVariantId!: number;
}

export class UpdateFunnelDto {
  @IsOptional()
  @IsString()
  funnelName?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  promoSlug?: string;

  @IsOptional()
  @IsString()
  funnelDescription?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsInt()
  crm?: number;

  @IsOptional()
  @IsInt()
  campaign?: number;

  @IsOptional()
  @IsInt()
  renewalCampaign?: number;

  @IsOptional()
  @IsInt()
  swappableCampaign?: number;

  @IsOptional()
  @IsInt()
  displayDefault?: number;

  @IsOptional()
  @IsString()
  redirectType?: string;

  @IsOptional()
  @IsInt()
  funnelRedirection?: number;

  @IsOptional()
  @IsString()
  funnelTemplate?: string;

  @IsOptional()
  @IsString()
  funnelImage?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => UpdateFunnelProductInputDto)
  funnelProducts?: UpdateFunnelProductInputDto[];
}
