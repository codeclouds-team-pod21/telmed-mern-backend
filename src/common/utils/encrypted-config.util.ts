import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';

type EncryptedPayload = {
  iv?: string;
  value?: string;
  mac?: string;
  tag?: string;
};

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

export function decryptStoredString(value: string | null | undefined): string | null {
  if (!value) {
    return value ?? null;
  }

  const key = resolveEncryptionKey();
  const payload = parseEncryptedPayload(value);

  if (!key || !payload?.iv || !payload.value || !payload.mac) {
    return value;
  }

  try {
    const expectedMac = createHmac('sha256', key)
      .update(`${payload.iv}${payload.value}`, 'utf8')
      .digest('hex');

    const providedMac = Buffer.from(payload.mac, 'utf8');
    const computedMac = Buffer.from(expectedMac, 'utf8');

    if (
      providedMac.length !== computedMac.length ||
      !timingSafeEqual(providedMac, computedMac)
    ) {
      return value;
    }

    const decipher = createDecipheriv(
      'aes-256-cbc',
      key,
      Buffer.from(payload.iv, 'base64'),
    );

    let decrypted = decipher.update(payload.value, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    return value;
  }
}

export function decryptStoredFields<T extends Record<string, unknown>>(
  input: T,
  encryptedKeys: string[],
): T {
  const output = { ...input } as Record<string, unknown>;

  for (const key of encryptedKeys) {
    const current = output[key];
    if (typeof current === 'string' && current.trim()) {
      output[key] = decryptStoredString(current);
    }
  }

  return output as T;
}

export function encryptStoredString(value: string | null | undefined): string | null {
  if (!value) {
    return value ?? null;
  }

  const key = resolveEncryptionKey();
  if (!key) {
    return value;
  }

  try {
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
  } catch {
    return value;
  }
}
