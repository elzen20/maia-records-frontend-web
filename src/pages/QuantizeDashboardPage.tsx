import React, { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import {
  buildOutputDownloadUrl,
  cleanupQuantizeUploads,
  quantizeBatch,
  quantizeSingle,
} from '../services/quantizeApi';
import './QuantizeDashboardPage.css';

type SingleResponseMode = 'json' | 'file';
type BatchResponseMode = 'json' | 'zip';

interface SingleFormState {
  file: File | null;
  strength: string;
  gridSubdivision: string;
  autoSubdivision: boolean;
  timeSignature: string;
  renderAudio: boolean;
  responseMode: SingleResponseMode;
}

interface BatchFormState {
  tracks: File[];
  reference: File | null;
  strength: string;
  gridSubdivision: string;
  autoSubdivision: boolean;
  timeSignature: string;
  renderAudio: boolean;
  responseMode: BatchResponseMode;
  maxConcurrency: string;
  useReferenceTrack: boolean;
}

function getFilenameFromHeaders(response: Response, fallback: string): string {
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const parsed = decodeURIComponent(match?.[1] || match?.[2] || '').trim();
  return parsed || fallback;
}

function triggerDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function booleanAsText(value: boolean): string {
  return value ? 'true' : 'false';
}

function appendIfValue(formData: FormData, key: string, value: string): void {
  if (value.trim() !== '') {
    formData.append(key, value.trim());
  }
}

function isJsonResponse(response: Response): boolean {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  return contentType.includes('application/json') || contentType.includes('+json');
}

async function readErrorFromResponse(response: Response): Promise<string> {
  try {
    if (isJsonResponse(response)) {
      const data = (await response.json()) as Record<string, unknown>;
      if (typeof data.message === 'string' && data.message.trim()) {
        return data.message;
      }
      return JSON.stringify(data);
    }

    const text = await response.text();
    return text.trim() || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function formatRequestError(error: unknown): string {
  if (error instanceof TypeError) {
    return 'No se pudo leer la respuesta del servidor (red/CORS/SSL o respuesta binaria incompleta).';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function buildSingleFormData(
  state: SingleFormState,
  responseMode: SingleResponseMode,
): FormData {
  if (!state.file) {
    throw new Error('Selecciona un archivo en el campo audio.');
  }

  const formData = new FormData();
  formData.append('audio', state.file);
  appendIfValue(formData, 'strength', state.strength);
  appendIfValue(formData, 'gridSubdivision', state.gridSubdivision);
  appendIfValue(formData, 'timeSignature', state.timeSignature);
  formData.append('autoSubdivision', booleanAsText(state.autoSubdivision));
  formData.append('renderAudio', booleanAsText(state.renderAudio));
  formData.append('responseMode', responseMode);
  return formData;
}

function QuantizeDashboardPage() {
  const navigate = useNavigate();
  const loadingBars = [0, 1, 2, 3, 4, 5, 6, 7];

  const [singleForm, setSingleForm] = useState<SingleFormState>({
    file: null,
    strength: '',
    gridSubdivision: '',
    autoSubdivision: true,
    timeSignature: '',
    renderAudio: true,
    responseMode: 'json',
  });

  const [batchForm, setBatchForm] = useState<BatchFormState>({
    tracks: [],
    reference: null,
    strength: '',
    gridSubdivision: '',
    autoSubdivision: true,
    timeSignature: '',
    renderAudio: true,
    responseMode: 'json',
    maxConcurrency: '4',
    useReferenceTrack: false,
  });

  const [singleLoading, setSingleLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  const [singleResult, setSingleResult] = useState<Record<string, unknown> | null>(null);
  const [batchResult, setBatchResult] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const currentEmail = auth.currentUser?.email || 'admin';

  const singleDownloadPath = useMemo(() => {
    if (!singleResult || typeof singleResult.downloadPath !== 'string') {
      return '';
    }

    try {
      return buildOutputDownloadUrl(singleResult.downloadPath);
    } catch {
      return '';
    }
  }, [singleResult]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/admin/login', { replace: true });
  };

  const onSingleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSingleForm((prev) => ({ ...prev, file }));
  };

  const onBatchTracksChange = (event: ChangeEvent<HTMLInputElement>) => {
    const tracks = event.target.files ? Array.from(event.target.files) : [];
    setBatchForm((prev) => ({ ...prev, tracks }));
  };

  const onBatchReferenceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const reference = event.target.files?.[0] || null;
    setBatchForm((prev) => ({ ...prev, reference }));
  };

  const submitSingle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSingleResult(null);

    if (!singleForm.file) {
      setError('Selecciona un archivo en el campo audio.');
      return;
    }

    setSingleLoading(true);

    try {
      const formData = buildSingleFormData(singleForm, singleForm.responseMode);

      const response = await quantizeSingle(formData);

      if (!response.ok) {
        throw new Error(await readErrorFromResponse(response));
      }

      const shouldHandleAsFile = singleForm.responseMode === 'file' || !isJsonResponse(response);

      if (shouldHandleAsFile) {
        const blob = await response.blob();
        const filename = getFilenameFromHeaders(response, `${singleForm.file.name}-quantized.wav`);
        triggerDownload(blob, filename);
        setMessage('Render WAV descargado correctamente.');
        return;
      }

      const json = (await response.json()) as Record<string, unknown>;
      setSingleResult(json);
      setMessage('Cuantizacion individual completada.');
    } catch (requestError) {
      setError(`Error en /quantize: ${formatRequestError(requestError)}`);
    } finally {
      setSingleLoading(false);
    }
  };

  const submitBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBatchResult(null);

    if (batchForm.tracks.length === 0) {
      setError('Agrega al menos un track en el campo tracks.');
      return;
    }

    const parsedConcurrency = Number(batchForm.maxConcurrency);
    if (!Number.isInteger(parsedConcurrency) || parsedConcurrency < 1 || parsedConcurrency > 16) {
      setError('maxConcurrency debe ser un entero entre 1 y 16.');
      return;
    }

    if (batchForm.responseMode === 'zip' && !batchForm.renderAudio) {
      setError('Para responseMode=zip, renderAudio debe ser true.');
      return;
    }

    setBatchLoading(true);

    try {
      const formData = new FormData();
      batchForm.tracks.forEach((track) => formData.append('tracks', track));

      if (batchForm.reference) {
        formData.append('reference', batchForm.reference);
      }

      appendIfValue(formData, 'strength', batchForm.strength);
      appendIfValue(formData, 'gridSubdivision', batchForm.gridSubdivision);
      appendIfValue(formData, 'timeSignature', batchForm.timeSignature);
      formData.append('autoSubdivision', booleanAsText(batchForm.autoSubdivision));
      formData.append('renderAudio', booleanAsText(batchForm.renderAudio));
      formData.append('responseMode', batchForm.responseMode);
      formData.append('maxConcurrency', String(parsedConcurrency));
      formData.append('useReferenceTrack', booleanAsText(batchForm.useReferenceTrack));

      const response = await quantizeBatch(formData);

      if (!response.ok) {
        throw new Error(await readErrorFromResponse(response));
      }

      const shouldHandleAsZip = batchForm.responseMode === 'zip' || !isJsonResponse(response);

      if (shouldHandleAsZip) {
        const blob = await response.blob();
        const filename = getFilenameFromHeaders(response, 'quantize-batch.zip');
        triggerDownload(blob, filename);
        setMessage('ZIP descargado correctamente.');
        return;
      }

      const json = (await response.json()) as Record<string, unknown>;
      setBatchResult(json);
      setMessage('Proceso batch completado.');
    } catch (requestError) {
      setError(`Error en /quantize/batch: ${formatRequestError(requestError)}`);
    } finally {
      setBatchLoading(false);
    }
  };

  const runCleanup = async () => {
    setError('');
    setMessage('');
    setCleanupLoading(true);

    try {
      const response = await cleanupQuantizeUploads();

      if (!response.ok) {
        throw new Error(await readErrorFromResponse(response));
      }

      setMessage('Cleanup ejecutado correctamente.');
    } catch (requestError) {
      setError(`Error en /quantize/cleanup: ${formatRequestError(requestError)}`);
    } finally {
      setCleanupLoading(false);
    }
  };

  return (
    <main className="quantize-dashboard-page">
      <header className="quantize-dashboard-header">
        <div>
          <h1>Quantize Dashboard</h1>
          <p>Admin conectado: {currentEmail}</p>
        </div>

        <div className="quantize-dashboard-actions">
          <Link to="/" className="ghost-link">Ir al sitio publico</Link>
          <button type="button" onClick={handleLogout}>Cerrar sesion</button>
        </div>
      </header>

      <section className="quantize-panel">
        <h2>Single Track - POST /quantize</h2>
        <form onSubmit={submitSingle} className="quantize-form-grid">
          <label htmlFor="single-file">audio (max 100 MB)</label>
          <input id="single-file" type="file" accept="audio/*" onChange={onSingleFileChange} required />

          <label htmlFor="single-strength">strength (opcional)</label>
          <input
            id="single-strength"
            value={singleForm.strength}
            onChange={(event) => setSingleForm((prev) => ({ ...prev, strength: event.target.value }))}
            placeholder="ej. 0.65"
          />

          <label htmlFor="single-grid">gridSubdivision (opcional)</label>
          <input
            id="single-grid"
            value={singleForm.gridSubdivision}
            onChange={(event) => setSingleForm((prev) => ({ ...prev, gridSubdivision: event.target.value }))}
            placeholder="ej. 16"
          />

          <label htmlFor="single-signature">timeSignature (opcional)</label>
          <input
            id="single-signature"
            value={singleForm.timeSignature}
            onChange={(event) => setSingleForm((prev) => ({ ...prev, timeSignature: event.target.value }))}
            placeholder="ej. 4/4"
          />

          <label htmlFor="single-response-mode">responseMode</label>
          <select
            id="single-response-mode"
            value={singleForm.responseMode}
            onChange={(event) =>
              setSingleForm((prev) => ({ ...prev, responseMode: event.target.value as SingleResponseMode }))
            }
          >
            <option value="json">json</option>
            <option value="file">file</option>
          </select>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={singleForm.autoSubdivision}
              onChange={(event) => setSingleForm((prev) => ({ ...prev, autoSubdivision: event.target.checked }))}
            />
            autoSubdivision
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={singleForm.renderAudio}
              onChange={(event) => setSingleForm((prev) => ({ ...prev, renderAudio: event.target.checked }))}
            />
            renderAudio
          </label>

          <button type="submit" disabled={singleLoading}>
            {singleLoading ? 'Procesando...' : 'Cuantizar track'}
          </button>
        </form>

        {singleLoading && (
          <div className="processing-indicator" role="status" aria-live="polite">
            <div className="processing-topline" />
            <div className="processing-wave">
              {loadingBars.map((bar) => (
                <span key={`single-bar-${bar}`} className="processing-bar" />
              ))}
            </div>
            <p>Cuantizando track... no cierres esta ventana.</p>
          </div>
        )}

        {singleDownloadPath && (
          <p className="download-link-row">
            Descarga render: <a href={singleDownloadPath} target="_blank" rel="noreferrer">{singleDownloadPath}</a>
          </p>
        )}

        {singleResult && <pre>{JSON.stringify(singleResult, null, 2)}</pre>}
      </section>

      <section className="quantize-panel">
        <h2>Batch - POST /quantize/batch</h2>
        <form onSubmit={submitBatch} className="quantize-form-grid">
          <label htmlFor="batch-tracks">tracks (uno o mas, max 100 MB c/u)</label>
          <input id="batch-tracks" type="file" accept="audio/*" multiple onChange={onBatchTracksChange} required />

          <label htmlFor="batch-reference">reference (opcional)</label>
          <input id="batch-reference" type="file" accept="audio/*" onChange={onBatchReferenceChange} />

          <label htmlFor="batch-strength">strength (opcional)</label>
          <input
            id="batch-strength"
            value={batchForm.strength}
            onChange={(event) => setBatchForm((prev) => ({ ...prev, strength: event.target.value }))}
            placeholder="ej. 0.65"
          />

          <label htmlFor="batch-grid">gridSubdivision (opcional)</label>
          <input
            id="batch-grid"
            value={batchForm.gridSubdivision}
            onChange={(event) => setBatchForm((prev) => ({ ...prev, gridSubdivision: event.target.value }))}
            placeholder="ej. 16"
          />

          <label htmlFor="batch-signature">timeSignature (opcional)</label>
          <input
            id="batch-signature"
            value={batchForm.timeSignature}
            onChange={(event) => setBatchForm((prev) => ({ ...prev, timeSignature: event.target.value }))}
            placeholder="ej. 4/4"
          />

          <label htmlFor="batch-concurrency">maxConcurrency (1-16)</label>
          <input
            id="batch-concurrency"
            type="number"
            min={1}
            max={16}
            value={batchForm.maxConcurrency}
            onChange={(event) => setBatchForm((prev) => ({ ...prev, maxConcurrency: event.target.value }))}
          />

          <label htmlFor="batch-response-mode">responseMode</label>
          <select
            id="batch-response-mode"
            value={batchForm.responseMode}
            onChange={(event) =>
              setBatchForm((prev) => ({ ...prev, responseMode: event.target.value as BatchResponseMode }))
            }
          >
            <option value="json">json</option>
            <option value="zip">zip</option>
          </select>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={batchForm.autoSubdivision}
              onChange={(event) => setBatchForm((prev) => ({ ...prev, autoSubdivision: event.target.checked }))}
            />
            autoSubdivision
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={batchForm.renderAudio}
              onChange={(event) => setBatchForm((prev) => ({ ...prev, renderAudio: event.target.checked }))}
            />
            renderAudio
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={batchForm.useReferenceTrack}
              onChange={(event) => setBatchForm((prev) => ({ ...prev, useReferenceTrack: event.target.checked }))}
            />
            useReferenceTrack
          </label>

          <button type="submit" disabled={batchLoading}>
            {batchLoading ? 'Procesando...' : 'Ejecutar batch'}
          </button>
        </form>

        {batchLoading && (
          <div className="processing-indicator" role="status" aria-live="polite">
            <div className="processing-topline" />
            <div className="processing-wave">
              {loadingBars.map((bar) => (
                <span key={`batch-bar-${bar}`} className="processing-bar" />
              ))}
            </div>
            <p>Procesando batch... esto puede tardar un poco mas.</p>
          </div>
        )}

        {batchResult && <pre>{JSON.stringify(batchResult, null, 2)}</pre>}
      </section>

      <section className="quantize-panel cleanup-panel">
        <h2>Cleanup - POST /quantize/cleanup</h2>
        <p>Elimina uploads temporales del backend.</p>
        <button type="button" onClick={runCleanup} disabled={cleanupLoading}>
          {cleanupLoading ? 'Limpiando...' : 'Ejecutar cleanup'}
        </button>
      </section>

      {message && <p className="status-message">{message}</p>}
      {error && <p className="status-error">{error}</p>}
    </main>
  );
}

export default QuantizeDashboardPage;
