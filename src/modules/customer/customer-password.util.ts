import { createHash } from 'crypto';

export function hashCustomerPassword(password: string) {
  return createHash('sha256').update(password).digest('hex');
}

export function compareCustomerPassword(password: string, hash: string) {
  return hashCustomerPassword(password) === hash;
}
