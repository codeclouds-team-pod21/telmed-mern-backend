import { IsInt, IsObject } from 'class-validator';

export class EvaluateQuestionnaireDto {
  @IsInt()
  questionaryId!: number;

  @IsObject()
  answers!: Record<string, unknown>;
}
