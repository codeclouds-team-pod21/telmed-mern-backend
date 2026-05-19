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
      if (
        value &&
        typeof value === 'object' &&
        'type' in (value as Record<string, unknown>) &&
        'value' in (value as Record<string, unknown>)
      ) {
        const typedValue = value as QuestionnaireAnswerValue;
        carry[key] = {
          type: typedValue.type === 'file' ? 'file' : 'string',
          value: typedValue.value,
          ...(typedValue.disk ? { disk: typedValue.disk } : {}),
        };
        return carry;
      }

      carry[key] = {
        type: 'string',
        value,
      };
      return carry;
    },
    {},
  );
}
