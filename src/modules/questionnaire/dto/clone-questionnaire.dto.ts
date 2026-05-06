import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CloneQuestionnaireDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
}
