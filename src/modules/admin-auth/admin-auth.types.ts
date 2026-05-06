export type AdminPermission = string;

export type AdminTokenType = 'access' | 'refresh' | 'two_factor';

export interface AdminTokenPayload {
  sub: number;
  email: string;
  name: string;
  type: AdminTokenType;
  exp: number;
  iat: number;
  jti: string;
  permissions?: AdminPermission[];
  remember?: boolean;
}

export interface AdminAuthUser {
  id: number;
  name: string;
  email: string;
  permissions: AdminPermission[];
}
