import { auth } from '../firebase';
import { buildApiUrl } from './adminAccess';

export interface QuantizeFileItem {
  objectName?: string;
  name?: string;
  filename?: string;
  kind?: string;
  signedUrl?: string;
  sizeBytes?: number | string;
  size?: number | string;
  updatedAt?: string;
  updated?: string;
  expiresAt?: string;
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    return {};
  }

  const token = await currentUser.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function quantizeSingle(formData: FormData): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(buildApiUrl('/quantize'), {
    method: 'POST',
    redirect: 'manual', // Disable automatic redirection
    body: formData,
    headers,
  });
}

export async function quantizeBatch(formData: FormData): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(buildApiUrl('/quantize/batch'), {
    method: 'POST',
    redirect: 'manual', // Disable automatic redirection
    body: formData,
    headers,
  });
}

export async function cleanupQuantizeUploads(): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(buildApiUrl('/quantize/cleanup'), {
    method: 'POST',
    redirect: 'manual', // Disable automatic redirection
    headers,
  });
}

export async function listQuantizeFiles(limit = 20): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(buildApiUrl(`/quantize/files?limit=${encodeURIComponent(String(limit))}`), {
    method: 'GET',
    redirect: 'manual',
    headers,
  });
}

export async function getQuantizeSignedUrl(objectName: string): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(buildApiUrl(`/quantize/files/signed-url?object=${encodeURIComponent(objectName)}`), {
    method: 'GET',
    redirect: 'manual',
    headers,
  });
}

export function buildOutputDownloadUrl(downloadPath: string): string {
  return buildApiUrl(downloadPath);
}
