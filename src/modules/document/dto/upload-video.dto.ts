import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches } from 'class-validator';

export class UploadVideoDto {
  @Type(() => Number)
  @IsInt()
  productVariantId!: number;

  @IsOptional()
  @IsString()
  videoPath!: string;

  @IsOptional()
  @IsString()
  @Matches(/^data:video\/[a-zA-Z0-9.+-]+;base64,/, {
    message: 'videoDataUrl must be a base64 video data URL',
  })
  videoDataUrl?: string;
}
