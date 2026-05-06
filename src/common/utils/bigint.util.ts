export function normalizeBigInts<T>(value: T): T {
  if (typeof value === 'bigint') {
    return value.toString() as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeBigInts(item)) as T;
  }

  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        normalizeBigInts(nestedValue),
      ]),
    ) as T;
  }

  return value;
}
