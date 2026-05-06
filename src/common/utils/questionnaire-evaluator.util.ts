type QuestionRule = {
  action?: string;
  if?: Record<string, unknown>;
  message?: string;
};

type QuestionVisibilityRule = {
  field?: unknown;
  op?: unknown;
  value?: unknown;
};

type QuestionRecord = {
  id?: string | number;
  key?: string;
  type?: string;
  logic?: { rules?: QuestionRule[] };
  children?: Array<QuestionRecord | { logic?: { when?: QuestionVisibilityRule[] }; question?: QuestionRecord }>;
};

export type QuestionnaireDisqualificationResult = {
  disqualified: boolean;
  message?: string;
  questionId?: string;
};

function coerceQuestionPayload(input: unknown): unknown {
  let value = input;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (typeof value !== 'string') {
      break;
    }

    try {
      value = JSON.parse(value);
    } catch {
      break;
    }
  }

  return value;
}

function getQuestionRoots(input: unknown): QuestionRecord[] {
  const source = coerceQuestionPayload(input);

  if (Array.isArray(source)) {
    return source as QuestionRecord[];
  }

  if (source && typeof source === 'object') {
    return Object.values(source as Record<string, unknown>) as QuestionRecord[];
  }

  return [];
}

function getQuestionKey(question: QuestionRecord) {
  return String(question.key ?? question.id ?? '').trim();
}

function normalizeToken(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

function parseDateValue(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const input = value.trim();
  if (!input) {
    return null;
  }

  const isoMatch = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }

  const slashMatch = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function calculateAge(isoDate: string) {
  const birthDate = new Date(isoDate);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
}

function validateValue(value: unknown, condition: string) {
  const match = condition.trim().match(/^(<=|>=|===|==|<|>|!=)\s*(.+)$/);
  if (!match) {
    return false;
  }

  const [, operator, rawExpected] = match;
  const actualDate = parseDateValue(value);
  const expectedDate = parseDateValue(rawExpected);

  if (actualDate !== null && expectedDate !== null) {
    switch (operator) {
      case '<':
        return actualDate < expectedDate;
      case '<=':
        return actualDate <= expectedDate;
      case '>':
        return actualDate > expectedDate;
      case '>=':
        return actualDate >= expectedDate;
      case '==':
      case '===':
        return actualDate === expectedDate;
      case '!=':
        return actualDate !== expectedDate;
      default:
        return false;
    }
  }

  const actualNumber = Number(value);
  const expectedNumber = Number(rawExpected);
  const hasNumericComparison =
    !Number.isNaN(actualNumber) &&
    !Number.isNaN(expectedNumber) &&
    rawExpected.trim() !== '';

  switch (operator) {
    case '<':
      return hasNumericComparison ? actualNumber < expectedNumber : String(value ?? '') < rawExpected;
    case '<=':
      return hasNumericComparison ? actualNumber <= expectedNumber : String(value ?? '') <= rawExpected;
    case '>':
      return hasNumericComparison ? actualNumber > expectedNumber : String(value ?? '') > rawExpected;
    case '>=':
      return hasNumericComparison ? actualNumber >= expectedNumber : String(value ?? '') >= rawExpected;
    case '==':
    case '===':
      return hasNumericComparison ? actualNumber === expectedNumber : String(value ?? '') === rawExpected;
    case '!=':
      return hasNumericComparison ? actualNumber !== expectedNumber : String(value ?? '') !== rawExpected;
    default:
      return false;
  }
}

function matchesVisibilityRule(
  rule: QuestionVisibilityRule,
  answers: Record<string, unknown>,
) {
  const field = String(rule.field ?? '').trim();
  if (!field) {
    return true;
  }

  const actualValue = answers[field];
  const operator = String(rule.op ?? '==').trim().toLowerCase();
  const expectedValue = rule.value;
  const expectedList = Array.isArray(expectedValue)
    ? expectedValue.map((value) => normalizeToken(value))
    : String(expectedValue ?? '')
        .split(',')
        .map((value) => normalizeToken(value))
        .filter(Boolean);

  if (Array.isArray(actualValue)) {
    const normalizedActual = actualValue.map((value) => normalizeToken(value));
    switch (operator) {
      case '!=':
        return !normalizedActual.includes(normalizeToken(expectedValue));
      case 'not_in':
        return expectedList.every((value) => !normalizedActual.includes(value));
      case 'in':
        return expectedList.some((value) => normalizedActual.includes(value));
      case 'includes':
      case 'contains':
      case '==':
      case '===':
      default:
        return normalizedActual.includes(normalizeToken(expectedValue));
    }
  }

  const normalizedActualValue = normalizeToken(actualValue);
  const normalizedExpectedValue = normalizeToken(expectedValue);

  switch (operator) {
    case '!=':
      return normalizedActualValue !== normalizedExpectedValue;
    case 'in':
      return expectedList.includes(normalizedActualValue);
    case 'not_in':
      return !expectedList.includes(normalizedActualValue);
    case '>':
    case '>=':
    case '<':
    case '<=':
      return validateValue(actualValue, `${operator} ${String(expectedValue ?? '')}`);
    case '==':
    case '===':
    default:
      return String(actualValue ?? '') === String(expectedValue ?? '');
  }
}

function matchesVisibilityRules(
  rules: QuestionVisibilityRule[],
  answers: Record<string, unknown>,
) {
  if (!rules.length) {
    return true;
  }

  return rules.every((rule) => matchesVisibilityRule(rule, answers));
}

function collectVisibleQuestions(
  questions: QuestionRecord[],
  answers: Record<string, unknown>,
) {
  const visible: QuestionRecord[] = [];

  function appendQuestion(question: QuestionRecord) {
    visible.push(question);

    const children = Array.isArray(question.children) ? question.children : [];
    for (const child of children) {
      if (child && typeof child === 'object' && 'question' in child && child.question) {
        const rules = Array.isArray(child.logic?.when) ? child.logic.when : [];
        if (!matchesVisibilityRules(rules, answers)) {
          continue;
        }

        appendQuestion(child.question);
        continue;
      }

      appendQuestion(child as QuestionRecord);
    }
  }

  for (const question of questions) {
    appendQuestion(question);
  }

  return visible;
}

function getDisqualificationMessage(question: QuestionRecord, answers: Record<string, unknown>) {
  const rules = question.logic?.rules ?? [];
  const questionKey = getQuestionKey(question);
  const fallbackValue = answers[questionKey];

  for (const rule of rules) {
    if (rule.action !== 'disqualify' || !rule.if) {
      continue;
    }

    const [field, condition] = Object.entries(rule.if)[0] ?? ['', ''];
    const answerValue =
      field === 'bmi' && fallbackValue && typeof fallbackValue === 'object' && 'bmi' in (fallbackValue as Record<string, unknown>)
        ? (fallbackValue as { bmi?: unknown }).bmi
        : answers[field] ?? fallbackValue;

    if (question.type === 'dob') {
      const conditionText = String(condition ?? '');
      const rawExpected = conditionText.replace(/^(<=|>=|===|==|<|>|!=)\s*/, '');
      if (parseDateValue(rawExpected) !== null) {
        if (validateValue(answerValue, conditionText)) {
          return rule.message ?? 'We are sorry, you do not qualify based on the date provided.';
        }
        continue;
      }

      const age = typeof answerValue === 'string' ? calculateAge(answerValue) : null;
      if (age !== null && validateValue(age, conditionText)) {
        return rule.message ?? 'We are sorry, you do not meet the age requirement for this program.';
      }
      continue;
    }

    if (typeof condition === 'string' && validateValue(answerValue, condition)) {
      return rule.message ?? 'Based on your answers, you do not qualify for this program.';
    }

    if (answerValue === condition) {
      return rule.message ?? 'Based on your answers, you do not qualify for this program.';
    }
  }

  return null;
}

export function evaluateQuestionnaireDisqualification(
  rawQuestions: unknown,
  answers: Record<string, unknown>,
): QuestionnaireDisqualificationResult {
  const roots = getQuestionRoots(rawQuestions);
  const visibleQuestions = collectVisibleQuestions(roots, answers);

  for (const question of visibleQuestions) {
    const message = getDisqualificationMessage(question, answers);
    if (message) {
      return {
        disqualified: true,
        message,
        questionId: getQuestionKey(question),
      };
    }
  }

  return { disqualified: false };
}
