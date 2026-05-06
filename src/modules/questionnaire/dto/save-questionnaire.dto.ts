import { IsInt, IsObject, IsOptional, IsString } from 'class-validator';

export class SaveQuestionnaireDto {
  @IsInt()
  questionaryId!: number;

  @IsObject()
  answers!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsInt()
  funnelProductId?: number;
}
