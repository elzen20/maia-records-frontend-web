import { auth } from '../firebase';
import { buildApiUrl } from './adminAccess';

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

export function buildOutputDownloadUrl(downloadPath: string): string {
  return buildApiUrl(downloadPath);
}
