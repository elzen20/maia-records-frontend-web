const rawAdminEmails = import.meta.env.VITE_ADMIN_EMAILS || '';

const ADMIN_EMAILS = rawAdminEmails
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export const QUANTIZE_API_BASE_URL = (import.meta.env.VITE_QUANTIZE_API_BASE_URL || '').trim();

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export function getAdminEmails(): string[] {
  return ADMIN_EMAILS;
}

export function buildApiUrl(path: string): string {
  if (!QUANTIZE_API_BASE_URL) {
    throw new Error('Missing VITE_QUANTIZE_API_BASE_URL in environment variables.');
  }

  const base = QUANTIZE_API_BASE_URL.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
