export function safeParseDbJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stringifyDbJson(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
}

export function parseDbJsonArray(value: string | null | undefined): string[] {
  const parsed = safeParseDbJson<unknown>(value, []);
  return Array.isArray(parsed) ? parsed.map(String) : [];
}
