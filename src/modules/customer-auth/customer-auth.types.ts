export type CustomerTokenType = 'access' | 'refresh' | 'reset_password';

export interface CustomerTokenPayload {
  sub: number;
  email: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  remember?: boolean;
  type: CustomerTokenType;
  exp: number;
  iat: number;
  jti: string;
}

export interface CustomerAuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
}
