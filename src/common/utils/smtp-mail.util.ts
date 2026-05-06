import * as net from 'node:net';
import * as tls from 'node:tls';

export type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: 'starttls' | 'ssl_tls' | 'none';
  fromEmail: string;
  fromName: string;
};

type SocketLike = net.Socket | tls.TLSSocket;
type SmtpEncryption = SmtpConfig['encryption'];

export async function sendSmtpMail(
  config: SmtpConfig,
  input: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  },
) {
  const candidates = buildConnectionCandidates(config);
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      await sendSmtpMailWithConfig(candidate, input);
      return;
    } catch (error) {
      lastError = error;

      if (!shouldRetryWithAlternateMode(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to send SMTP mail.');
}

async function sendSmtpMailWithConfig(
  config: SmtpConfig,
  input: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  },
) {
  const connection = await openSmtpConnection(config);

  try {
    await connection.expect([220]);
    await connection.command(`EHLO localhost`, [250]);

    if (config.encryption === 'starttls') {
      await connection.command('STARTTLS', [220]);
      await connection.upgradeToTls(config.host, config.port);
      await connection.command(`EHLO localhost`, [250]);
    }

    if (config.username) {
      await connection.command('AUTH LOGIN', [334]);
      await connection.command(Buffer.from(config.username, 'utf8').toString('base64'), [334]);
      await connection.command(Buffer.from(config.password, 'utf8').toString('base64'), [235]);
    }

    await connection.command(`MAIL FROM:<${config.fromEmail}>`, [250]);
    await connection.command(`RCPT TO:<${input.to}>`, [250, 251]);
    await connection.command('DATA', [354]);

    const message = buildMimeMessage(config, input);
    await connection.writeRaw(`${message}\r\n.\r\n`);
    await connection.expect([250]);
    await connection.command('QUIT', [221]);
  } finally {
    connection.close();
  }
}

function buildConnectionCandidates(config: SmtpConfig) {
  const normalized = normalizeEncryption(config.encryption, config.port);
  const fallbacks: SmtpEncryption[] =
    normalized === 'ssl_tls'
      ? ['ssl_tls', 'starttls', 'none']
      : normalized === 'starttls'
        ? ['starttls', 'ssl_tls', 'none']
        : ['none', 'starttls', 'ssl_tls'];

  return Array.from(new Set(fallbacks)).map((encryption) => ({
    ...config,
    encryption,
  }));
}

function normalizeEncryption(value: string, port: number): SmtpEncryption {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  if (normalized === 'ssl' || normalized === 'tls' || normalized === 'ssl_tls') {
    return port === 465 ? 'ssl_tls' : 'starttls';
  }

  if (normalized === 'starttls') {
    return 'starttls';
  }

  if (normalized === 'none') {
    return 'none';
  }

  return port === 465 ? 'ssl_tls' : 'starttls';
}

function shouldRetryWithAlternateMode(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = `${error.message ?? ''}`.toLowerCase();
  return (
    message.includes('err_ssl_wrong_version_number') ||
    message.includes('wrong version number') ||
    message.includes('ssl routines') ||
    message.includes('starttls') ||
    message.includes('tls connection')
  );
}

function buildMimeMessage(
  config: SmtpConfig,
  input: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  },
) {
  const boundary = `boundary_${Date.now().toString(16)}`;
  const text = (input.text ?? '').replace(/\r?\n/g, '\r\n');
  const html = input.html.replace(/\r?\n/g, '\r\n');

  return [
    `From: ${formatMailbox(config.fromName, config.fromEmail)}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    `--${boundary}--`,
  ].join('\r\n');
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function formatMailbox(name: string, email: string) {
  return name ? `${encodeHeader(name)} <${email}>` : `<${email}>`;
}

async function openSmtpConnection(config: SmtpConfig) {
  let socket: SocketLike;

  if (config.encryption === 'ssl_tls') {
    socket = await connectTls(config.host, config.port);
  } else {
    socket = await connectTcp(config.host, config.port);
  }

  return createSmtpConnection(socket);
}

function connectTcp(host: string, port: number) {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => resolve(socket));
    socket.once('error', reject);
    socket.setTimeout(20000, () => reject(new Error('SMTP connection timed out.')));
  });
}

function connectTls(host: string, port: number, socket?: net.Socket) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secureSocket = tls.connect(
      {
        host,
        port,
        socket,
        servername: host,
      },
      () => resolve(secureSocket),
    );
    secureSocket.once('error', reject);
    secureSocket.setTimeout(20000, () => reject(new Error('SMTP TLS connection timed out.')));
  });
}

function createSmtpConnection(initialSocket: SocketLike) {
  let socket = initialSocket;
  let buffer = '';
  let pending:
    | {
        resolve: (value: { code: number; message: string }) => void;
        reject: (error: Error) => void;
      }
    | undefined;

  const onData = (chunk: Buffer | string) => {
    buffer += chunk.toString();
    flush();
  };

  const onError = (error: Error) => {
    if (pending) {
      pending.reject(error);
      pending = undefined;
    }
  };

  socket.on('data', onData);
  socket.on('error', onError);

  function flush() {
    if (!pending) {
      return;
    }

    const parsed = tryParseResponse(buffer);
    if (!parsed) {
      return;
    }

    buffer = parsed.rest;
    const current = pending;
    pending = undefined;
    current.resolve({ code: parsed.code, message: parsed.message });
  }

  function waitForResponse() {
    return new Promise<{ code: number; message: string }>((resolve, reject) => {
      pending = { resolve, reject };
      flush();
    });
  }

  return {
    async expect(expectedCodes: number[]) {
      const response = await waitForResponse();
      assertExpectedCode(response, expectedCodes);
      return response;
    },
    async command(command: string, expectedCodes: number[]) {
      await writeRaw(`${command}\r\n`);
      return this.expect(expectedCodes);
    },
    upgradeToTls(host: string, port: number) {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);

      return connectTls(host, port, socket as net.Socket).then((nextSocket) => {
        socket = nextSocket;
        socket.on('data', onData);
        socket.on('error', onError);
      });
    },
    writeRaw,
    close() {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.end();
      socket.destroy();
    },
  };

  function writeRaw(value: string) {
    return new Promise<void>((resolve, reject) => {
      socket.write(value, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function tryParseResponse(input: string) {
  const lines = input.split('\r\n');
  const completeLines = lines.slice(0, -1);
  if (!completeLines.length) {
    return null;
  }

  let lastCompleteIndex = -1;
  let code = 0;

  for (let index = 0; index < completeLines.length; index += 1) {
    const line = completeLines[index];
    if (!/^\d{3}[\s-]/.test(line)) {
      continue;
    }

    if (line[3] === ' ') {
      lastCompleteIndex = index;
      code = Number(line.slice(0, 3));
    }
  }

  if (lastCompleteIndex === -1) {
    return null;
  }

  return {
    code,
    message: completeLines.slice(0, lastCompleteIndex + 1).join('\n'),
    rest: [...completeLines.slice(lastCompleteIndex + 1), lines[lines.length - 1]].join('\r\n'),
  };
}

function assertExpectedCode(
  response: { code: number; message: string },
  expectedCodes: number[],
) {
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP error ${response.code}: ${response.message}`);
  }
}
