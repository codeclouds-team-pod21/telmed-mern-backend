import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class FunnelProductInputDto {
  @IsOptional()
  @IsInt()
  id?: number;

  @IsInt()
  productId!: number;

  @IsInt()
  productVariantId!: number;
}

export class CreateFunnelDto {
  @IsString()
  @IsNotEmpty()
  funnelName!: string;

  @IsString()
  slug!: string;

  @IsString()
  promoSlug!: string;

  @IsString()
  funnelDescription!: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsInt()
  crm!: number;

  @IsInt()
  campaign!: number;

  @IsOptional()
  @IsInt()
  renewalCampaign?: number;

  @IsOptional()
  @IsInt()
  swappableCampaign?: number;

  @IsInt()
  displayDefault!: number;

  @IsOptional()
  @IsString()
  redirectType?: string;

  @IsOptional()
  @IsInt()
  funnelRedirection?: number;

  @IsString()
  funnelTemplate!: string;

  @IsOptional()
  @IsString()
  funnelImage?: string;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FunnelProductInputDto)
  funnelProducts!: FunnelProductInputDto[];
}
