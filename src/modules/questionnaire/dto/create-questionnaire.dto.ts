import {
  IsInt,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateQuestionnaireDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsIn(['general', 'medical', 'swap', 'vitals'])
  type!: 'general' | 'medical' | 'swap' | 'vitals';

  @ValidateIf((_, value) => !Array.isArray(value))
  @IsObject()
  @ValidateIf((_, value) => Array.isArray(value))
  @IsArray()
  questions!: Record<string, unknown> | unknown[];

  @IsOptional()
  @IsInt()
  @Min(1)
  questionPerGroup?: number;

  @IsOptional()
  status?: boolean;
}
