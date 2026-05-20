export type EmailVerificationResult = {
  provider: 'xverify' | 'bypass';
  isValid: boolean;
  skipped: boolean;
  reason?: string;
  message?: string;
  raw?: unknown;
};

export type SsnVerificationResult = {
  provider: 'vouched' | 'bypass';
  isValid: boolean;
  skipped: boolean;
  reason?: string;
  message?: string;
  raw?: unknown;
};

export type AddressVerificationInput = {
  address1: string;
  address2?: string | null;
  city?: string | null;
  state: string;
  zipCode?: string | null;
  country?: string | null;
};

export type AddressVerificationResult = {
  provider: 'smarty' | 'bypass';
  isValid: boolean;
  skipped: boolean;
  reason?: string;
  message?: string;
  normalized?: {
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    country?: string | null;
  } | null;
  raw?: unknown;
};
