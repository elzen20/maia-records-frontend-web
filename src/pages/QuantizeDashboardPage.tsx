import React, { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import {
  buildOutputDownloadUrl,
  cleanupQuantizeUploads,
  getQuantizeSignedUrl,
  listQuantizeFiles,
  type QuantizeFileItem,
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

interface TemporaryQuantizeFileRow {
  objectName: string;
  displayName: string;
  sizeLabel: string;
  updatedLabel: string;
  expirationLabel: string;
  signedUrl?: string;
}

interface AudioCompareSource {
  label: string;
  url: string;
  sizeBytes?: number;
  revokeUrlOnCleanup?: boolean;
}

interface WaveformPreviewCardProps {
  title: string;
  color: string;
  source: AudioCompareSource | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function formatDateLabel(value: string): string {
  if (!value) {
    return 'N/D';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatExpirationLabel(updatedAt: string, expiresAt?: string): string {
  const expirationSource = firstString(expiresAt, updatedAt);
  if (!expirationSource) {
    return '24h';
  }

  const expirationDate = expiresAt
    ? new Date(expiresAt)
    : new Date(new Date(updatedAt).getTime() + 24 * 60 * 60 * 1000);

  if (Number.isNaN(expirationDate.getTime())) {
    return '24h';
  }

  const remainingMs = expirationDate.getTime() - Date.now();
  if (remainingMs <= 0) {
    return 'Expirado';
  }

  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  if (hours >= 24) {
    return 'Activo · vence en 24h';
  }

  return `Activo · vence en ${hours}h ${minutes}m`;
}

function formatSizeLabel(sizeBytes: number | null): string {
  if (sizeBytes === null) {
    return 'N/D';
  }

  return `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`;
}

function extractTemporaryFileItems(payload: unknown): QuantizeFileItem[] {
  if (Array.isArray(payload)) {
    return payload as QuantizeFileItem[];
  }

  if (!isRecord(payload)) {
    return [];
  }

  const candidate = payload.files ?? payload.items ?? payload.data ?? payload.results;
  return Array.isArray(candidate) ? (candidate as QuantizeFileItem[]) : [];
}

function normalizeTemporaryFiles(payload: unknown): TemporaryQuantizeFileRow[] {
  const rawFiles = extractTemporaryFileItems(payload);

  return rawFiles.map((item, index) => {
    const objectName = firstString(item.objectName, item.name, item.filename, `file-${index + 1}`);
    const displayName = firstString(item.name, item.filename, item.objectName, objectName);
    const sizeBytes = toNumber(item.sizeBytes ?? item.size);
    const updatedAt = firstString(item.updatedAt, item.updated);
    const signedUrl = firstString(item.signedUrl);

    return {
      objectName,
      displayName,
      sizeLabel: formatSizeLabel(sizeBytes),
      updatedLabel: formatDateLabel(updatedAt),
      expirationLabel: formatExpirationLabel(updatedAt, firstString(item.expiresAt) || undefined),
      signedUrl: signedUrl || undefined,
    };
  });
}

function downloadUrl(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function readSignedUrlFromPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload.trim();
  }

  if (!isRecord(payload)) {
    return '';
  }

  if (isRecord(payload.data)) {
    return firstString(
      payload.data.signedUrl,
      payload.data.url,
      payload.data.downloadUrl,
      payload.data.value,
    );
  }

  return firstString(payload.signedUrl, payload.url, payload.downloadUrl, payload.data);
}

function revokeObjectUrlIfNeeded(source: AudioCompareSource | null): void {
  if (source?.revokeUrlOnCleanup) {
    URL.revokeObjectURL(source.url);
  }
}

function extractQuantizedAudioUrl(payload: Record<string, unknown>): string {
  if (isRecord(payload.data)) {
    const nestedUrl = firstString(
      payload.data.signedUrl,
      payload.data.url,
      payload.data.downloadUrl,
      payload.data.downloadPath,
      payload.data.outputUrl,
    );
    if (nestedUrl) {
      if (nestedUrl.startsWith('/')) {
        try {
          return buildOutputDownloadUrl(nestedUrl);
        } catch {
          return '';
        }
      }

      return nestedUrl;
    }
  }

  const directUrl = firstString(
    payload.signedUrl,
    payload.url,
    payload.downloadUrl,
    payload.outputUrl,
    payload.renderUrl,
  );

  if (directUrl) {
    return directUrl;
  }

  const downloadPath = firstString(payload.downloadPath, payload.outputPath, payload.path);

  if (!downloadPath || !downloadPath.startsWith('/')) {
    return '';
  }

  try {
    return buildOutputDownloadUrl(downloadPath);
  } catch {
    return '';
  }
}

function buildWaveformPeaks(audioBuffer: AudioBuffer, barsCount: number): number[] {
  const channelCount = audioBuffer.numberOfChannels;
  const channelData = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));
  const samplesPerBar = Math.max(1, Math.floor(audioBuffer.length / barsCount));
  const peaks: number[] = [];

  for (let bar = 0; bar < barsCount; bar += 1) {
    const start = bar * samplesPerBar;
    const end = Math.min(audioBuffer.length, start + samplesPerBar);
    let peak = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      let mixedSample = 0;
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        mixedSample += channelData[channelIndex][sampleIndex] || 0;
      }

      mixedSample /= channelCount;
      const absolute = Math.abs(mixedSample);
      if (absolute > peak) {
        peak = absolute;
      }
    }

    peaks.push(Math.min(1, peak));
  }

  return peaks;
}

function formatAudioDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'N/D';
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function WaveformPreviewCard({ title, color, source }: WaveformPreviewCardProps) {
  const [loading, setLoading] = useState(false);
  const [waveError, setWaveError] = useState('');
  const [peaks, setPeaks] = useState<number[]>([]);
  const [durationSec, setDurationSec] = useState(0);
  const [sampleRate, setSampleRate] = useState(0);
  const [channels, setChannels] = useState(0);
  const [sizeBytes, setSizeBytes] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadWaveform = async () => {
      if (!source) {
        setPeaks([]);
        setWaveError('');
        setDurationSec(0);
        setSampleRate(0);
        setChannels(0);
        setSizeBytes(0);
        return;
      }

      setLoading(true);
      setWaveError('');

      try {
        const response = await fetch(source.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const rawBuffer = await response.arrayBuffer();
        const AudioContextCtor = window.AudioContext;
        if (!AudioContextCtor) {
          throw new Error('AudioContext no esta disponible en este navegador.');
        }

        const audioContext = new AudioContextCtor();
        const audioBuffer = await audioContext.decodeAudioData(rawBuffer.slice(0));
        await audioContext.close();

        if (!cancelled) {
          setPeaks(buildWaveformPeaks(audioBuffer, 180));
          setDurationSec(audioBuffer.duration);
          setSampleRate(audioBuffer.sampleRate);
          setChannels(audioBuffer.numberOfChannels);
          setSizeBytes(source.sizeBytes || rawBuffer.byteLength);
        }
      } catch (error) {
        if (!cancelled) {
          setWaveError(formatRequestError(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadWaveform();

    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <article className="wave-preview-card" style={{ ['--wave-accent' as string]: color }}>
      <h3>{title}</h3>

      {!source && <p className="wave-placeholder">Carga y cuantiza un WAV para ver la comparacion.</p>}

      {source && (
        <>
          <p className="wave-filename">{source.label}</p>

          {loading && <p className="section-state">Analizando onda...</p>}
          {!loading && waveError && <p className="status-error">No se pudo dibujar la onda: {waveError}</p>}

          {!loading && !waveError && peaks.length > 0 && (
            <>
              <div className="wave-meta-grid">
                <span>Duracion: {formatAudioDuration(durationSec)}</span>
                <span>Sample rate: {sampleRate || 'N/D'} Hz</span>
                <span>Canales: {channels || 'N/D'}</span>
                <span>Tamano: {formatSizeLabel(sizeBytes || null)}</span>
              </div>

              <div className="wave-bars-grid" role="img" aria-label={`Forma de onda ${title}`}>
                {peaks.map((peak, index) => (
                  <span
                    key={`${title}-wave-${index}`}
                    className="wave-bar"
                    style={{
                      height: `${Math.max(6, Math.round(peak * 100))}%`,
                      background: color,
                      boxShadow: `0 0 10px ${color}`,
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </article>
  );
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
  const [temporaryFiles, setTemporaryFiles] = useState<TemporaryQuantizeFileRow[]>([]);
  const [temporaryFilesLoading, setTemporaryFilesLoading] = useState(false);
  const [temporaryFilesError, setTemporaryFilesError] = useState('');
  const [temporaryFileDownloading, setTemporaryFileDownloading] = useState('');

  const [singleResult, setSingleResult] = useState<Record<string, unknown> | null>(null);
  const [batchResult, setBatchResult] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [beforeAudio, setBeforeAudio] = useState<AudioCompareSource | null>(null);
  const [afterAudio, setAfterAudio] = useState<AudioCompareSource | null>(null);

  const currentEmail = auth.currentUser?.email || 'admin';

  useEffect(() => {
    let cancelled = false;

    const loadTemporaryFiles = async () => {
      setTemporaryFilesLoading(true);
      setTemporaryFilesError('');

      try {
        const response = await listQuantizeFiles(20);

        if (!response.ok) {
          throw new Error(await readErrorFromResponse(response));
        }

        const payload = await response.json();

        if (!cancelled) {
          setTemporaryFiles(normalizeTemporaryFiles(payload));
        }
      } catch (requestError) {
        if (!cancelled) {
          setTemporaryFilesError(`Error cargando archivos temporales: ${formatRequestError(requestError)}`);
        }
      } finally {
        if (!cancelled) {
          setTemporaryFilesLoading(false);
        }
      }
    };

    loadTemporaryFiles();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    revokeObjectUrlIfNeeded(beforeAudio);
    revokeObjectUrlIfNeeded(afterAudio);
  }, [beforeAudio, afterAudio]);

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

    setBeforeAudio((previous) => {
      revokeObjectUrlIfNeeded(previous);

      if (!file) {
        return null;
      }

      return {
        label: file.name,
        url: URL.createObjectURL(file),
        sizeBytes: file.size,
        revokeUrlOnCleanup: true,
      };
    });
  };

  const onBatchTracksChange = (event: ChangeEvent<HTMLInputElement>) => {
    const tracks = event.target.files ? Array.from(event.target.files) : [];
    setBatchForm((prev) => ({ ...prev, tracks }));
  };

  const onBatchReferenceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const reference = event.target.files?.[0] || null;
    setBatchForm((prev) => ({ ...prev, reference }));
  };

  const refreshTemporaryFiles = async () => {
    try {
      const response = await listQuantizeFiles(20);

      if (!response.ok) {
        console.error('Error refrescando archivos temporales:', response);
        return;
      }

      const payload = await response.json();
      setTemporaryFiles(normalizeTemporaryFiles(payload));
    } catch (error) {
      console.error('Error al refrescar archivos temporales:', error);
    }
  };

  const handleTemporaryFileDownload = async (file: TemporaryQuantizeFileRow) => {
    setTemporaryFilesError('');
    setTemporaryFileDownloading(file.objectName);

    try {
      let signedUrl = file.signedUrl;

      if (!signedUrl) {
        const response = await getQuantizeSignedUrl(file.objectName);

        if (!response.ok) {
          throw new Error(await readErrorFromResponse(response));
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json') || contentType.includes('+json')) {
          signedUrl = readSignedUrlFromPayload(await response.json());
        } else {
          signedUrl = (await response.text()).trim();
        }

        if (!signedUrl) {
          throw new Error('El backend no devolvió una signed URL válida.');
        }

        setTemporaryFiles((previousFiles) =>
          previousFiles.map((previousFile) =>
            previousFile.objectName === file.objectName
              ? { ...previousFile, signedUrl }
              : previousFile,
          ),
        );
      }

      downloadUrl(signedUrl);
    } catch (requestError) {
      setTemporaryFilesError(`Error descargando ${file.displayName}: ${formatRequestError(requestError)}`);
    } finally {
      setTemporaryFileDownloading('');
    }
  };

  const submitSingle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSingleResult(null);
    setAfterAudio((previous) => {
      revokeObjectUrlIfNeeded(previous);
      return null;
    });

    if (!singleForm.file) {
      setError('Selecciona un archivo en el campo audio.');
      return;
    }

    setSingleLoading(true);

    try {
      const formData = buildSingleFormData(singleForm, singleForm.responseMode);

      const response = await quantizeSingle(formData);

      if (response.status === 201 || response.ok) {
        console.log('Respuesta del servidor:', response);
      } else {
        console.error('Error en la respuesta del servidor:', response);
        throw new Error(await readErrorFromResponse(response));
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('audio/wav')) {
        const blob = await response.blob();
        const filename = getFilenameFromHeaders(response, `${singleForm.file.name}-quantized.wav`);
        setAfterAudio((previous) => {
          revokeObjectUrlIfNeeded(previous);
          return {
            label: filename,
            url: URL.createObjectURL(blob),
            sizeBytes: blob.size,
            revokeUrlOnCleanup: true,
          };
        });
        triggerDownload(blob, filename);
        setMessage('Render WAV descargado correctamente.');
        await refreshTemporaryFiles();
        return;
      } else if (isJsonResponse(response)) {
        const json = (await response.json()) as Record<string, unknown>;
        console.log('Respuesta JSON recibida:', json);
        setSingleResult(json);
        const quantizedAudioUrl = extractQuantizedAudioUrl(json);
        if (quantizedAudioUrl) {
          setAfterAudio((previous) => {
            revokeObjectUrlIfNeeded(previous);
            return {
              label: 'Render cuantizado',
              url: quantizedAudioUrl,
              revokeUrlOnCleanup: false,
            };
          });
        }
        setMessage('Cuantizacion individual completada.');
        await refreshTemporaryFiles();
      } else {
        throw new Error('Tipo de respuesta desconocido o no soportado.');
      }
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
        console.error('Error en la respuesta del servidor:', response);
        throw new Error(await readErrorFromResponse(response));
      } else {
        console.log('Respuesta del servidor:', response);
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
      console.log('Respuesta JSON recibida:', json);
      setBatchResult(json);
      setMessage('Proceso batch completado.');
      await refreshTemporaryFiles();
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

      <section className="quantize-panel waveform-compare-panel">
        <h2>Comparacion de ondas - Antes vs Despues</h2>
        <p>Vista de detalle WAV para comparar el audio original y el cuantizado.</p>

        <div className="waveform-compare-grid">
          <WaveformPreviewCard title="Antes" color="#ff3ecf" source={beforeAudio} />
          <WaveformPreviewCard title="Despues" color="#b026ff" source={afterAudio} />
        </div>
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

      <section className="quantize-panel temp-files-panel">
        <h2>Archivos temporales en la nube</h2>
        <p>Los archivos se eliminan automáticamente después de 24 horas.</p>

        {temporaryFilesLoading && <p className="section-state">Cargando archivos temporales...</p>}

        {!temporaryFilesLoading && temporaryFilesError && <p className="status-error">{temporaryFilesError}</p>}

        {!temporaryFilesLoading && !temporaryFilesError && temporaryFiles.length === 0 && (
          <p className="section-state empty-state">No hay archivos temporales disponibles.</p>
        )}

        {!temporaryFilesLoading && !temporaryFilesError && temporaryFiles.length > 0 && (
          <div className="temp-files-table-wrap">
            <table className="temp-files-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tamaño</th>
                  <th>Updated</th>
                  <th>Expiración (24h)</th>
                  <th>Descargar</th>
                </tr>
              </thead>
              <tbody>
                {temporaryFiles.map((file) => (
                  <tr key={file.objectName}>
                    <td>{file.displayName}</td>
                    <td>{file.sizeLabel}</td>
                    <td>{file.updatedLabel}</td>
                    <td>{file.expirationLabel}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleTemporaryFileDownload(file)}
                        disabled={temporaryFileDownloading === file.objectName}
                      >
                        {temporaryFileDownloading === file.objectName ? 'Abriendo...' : 'Descargar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {message && <p className="status-message">{message}</p>}
      {error && <p className="status-error">{error}</p>}
    </main>
  );
}

export default QuantizeDashboardPage;
