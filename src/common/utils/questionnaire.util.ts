export interface QuestionnaireAnswerValue {
  type: 'string' | 'file';
  value: unknown;
  disk?: string;
}

export function normalizeQuestionnaireAnswers(
  answers: Record<string, unknown>,
): Record<string, QuestionnaireAnswerValue> {
  return Object.entries(answers).reduce<Record<string, QuestionnaireAnswerValue>>(
    (carry, [key, value]) => {
      carry[key] = {
        type: 'string',
        value,
      };
      return carry;
    },
    {},
  );
}
