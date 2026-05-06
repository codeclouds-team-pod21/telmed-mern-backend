import {
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateOrderDto {
  @IsObject()
  body!: Record<string, unknown>;

  @IsObject()
  mapping!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  version?: string;
}
