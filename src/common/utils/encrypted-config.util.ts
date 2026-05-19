import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';

type EncryptedPayload = {
  iv?: string;
  value?: string;
  mac?: string;
  tag?: string;
};

const STORED_CREDENTIAL_DECRYPTION_MESSAGES = new Set([
  'Stored credential value is not a valid encrypted payload.',
  'Stored credential payload failed integrity validation.',
  'CONFIG_ENCRYPTION_KEY is required for stored credential encryption.',
  'CONFIG_ENCRYPTION_KEY must resolve to exactly 32 bytes.',
]);

function resolveEncryptionKey(): Buffer | null {
  const configuredKey = String(process.env.CONFIG_ENCRYPTION_KEY ?? process.env.APP_KEY ?? '').trim();
  if (!configuredKey) {
    return null;
  }

  if (configuredKey.startsWith('base64:')) {
    return Buffer.from(configuredKey.slice(7), 'base64');
  }

  return Buffer.from(configuredKey, 'utf8');
}

function getRequiredEncryptionKey(): Buffer {
  const key = resolveEncryptionKey();

  if (!key) {
    throw new Error('CONFIG_ENCRYPTION_KEY is required for stored credential encryption.');
  }

  if (key.length !== 32) {
    throw new Error('CONFIG_ENCRYPTION_KEY must resolve to exactly 32 bytes.');
  }

  return key;
}

function parseEncryptedPayload(value: string): EncryptedPayload | null {
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as EncryptedPayload;

    if (!parsed?.iv || !parsed?.value || !parsed?.mac) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function looksLikeStoredEncryptedPayload(
  value: string | null | undefined,
): boolean {
  if (!value) {
    return false;
  }

  return Boolean(parseEncryptedPayload(value));
}

export function isStoredCredentialDecryptionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    STORED_CREDENTIAL_DECRYPTION_MESSAGES.has(error.message)
  );
}

export function decryptStoredString(value: string | null | undefined): string | null {
  if (!value) {
    return value ?? null;
  }

  const payload = parseEncryptedPayload(value);

  if (!payload?.iv || !payload.value || !payload.mac) {
    throw new Error('Stored credential value is not a valid encrypted payload.');
  }

  const key = getRequiredEncryptionKey();

  const expectedMac = createHmac('sha256', key)
    .update(`${payload.iv}${payload.value}`, 'utf8')
    .digest('hex');

  const providedMac = Buffer.from(payload.mac, 'utf8');
  const computedMac = Buffer.from(expectedMac, 'utf8');

  if (
    providedMac.length !== computedMac.length ||
    !timingSafeEqual(providedMac, computedMac)
  ) {
    throw new Error('Stored credential payload failed integrity validation.');
  }

  const decipher = createDecipheriv(
    'aes-256-cbc',
    key,
    Buffer.from(payload.iv, 'base64'),
  );

  let decrypted = decipher.update(payload.value, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function decryptStoredFields<T extends Record<string, unknown>>(
  input: T,
  encryptedKeys: string[],
): T {
  const output = { ...input } as Record<string, unknown>;

  for (const key of encryptedKeys) {
    const current = output[key];
    if (
      typeof current === 'string' &&
      current.trim() &&
      looksLikeStoredEncryptedPayload(current)
    ) {
      output[key] = decryptStoredString(current);
    }
  }

  return output as T;
}

export function encryptStoredString(value: string | null | undefined): string | null {
  if (!value) {
    return value ?? null;
  }

  const key = getRequiredEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);

  let encrypted = cipher.update(value, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const ivBase64 = iv.toString('base64');
  const mac = createHmac('sha256', key)
    .update(`${ivBase64}${encrypted}`, 'utf8')
    .digest('hex');

  return Buffer.from(
    JSON.stringify({
      iv: ivBase64,
      value: encrypted,
      mac,
    }),
    'utf8',
  ).toString('base64');
}
