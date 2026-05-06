import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches } from 'class-validator';

export class UploadDocumentDto {
  @Type(() => Number)
  @IsInt()
  productVariantId!: number;

  @IsOptional()
  @IsString()
  idFilePath?: string;

  @IsOptional()
  @IsString()
  @Matches(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, {
    message: 'idWebcam must be a base64 image data URL',
  })
  idWebcam?: string;
}
