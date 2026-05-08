import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateQuestionnaireDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsIn(['general', 'medical', 'swap'])
  type!: 'general' | 'medical' | 'swap';

  @ValidateIf((_, value) => !Array.isArray(value))
  @IsObject()
  @ValidateIf((_, value) => Array.isArray(value))
  @IsArray()
  questions!: Record<string, unknown> | unknown[];

  @IsOptional()
  status?: boolean;
}
