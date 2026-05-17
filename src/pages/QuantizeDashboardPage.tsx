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
  forceBpm: string;
  forceGridSubdivision: string;
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

type CloudFile = {
  name: string;
  size: number;
  updated: string | null;
  kind: 'original' | 'quantized' | 'other';
  signedUrl?: string;
};

type ComparisonItem = {
  trackKey: string;
  original?: CloudFile;
  quantized?: CloudFile;
  status: 'complete' | 'missing-original' | 'missing-quantized';
};

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
  gridSec?: number[];
  quantizedEvents?: number[];
}

interface QuantizationDetailSummary {
  detectedBpm: string;
  effectiveBpm: string;
  gridSubdivision: string;
  quantizeStrength: string;
  bpmForced: boolean;
  gridSec: number[];
  quantizedEvents: number[];
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
  appendIfValue(formData, 'forceBpm', state.forceBpm);
  appendIfValue(formData, 'forceGridSubdivision', state.forceGridSubdivision);
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

function parseDate(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}


function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function extractNumberArray(value: unknown): number[] {
  const candidate =
    Array.isArray(value)
      ? value
      : isRecord(value)
        ? (value.quantized_onset_seg ?? value.grid_sec ?? value.gridSec ?? value.values ?? value.items ?? [])
        : [];

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate
    .map((entry) => {
      if (typeof entry === 'number' && Number.isFinite(entry)) {
        return entry;
      }

      if (typeof entry === 'string' && entry.trim()) {
        const parsed = Number(entry);
        return Number.isFinite(parsed) ? parsed : null;
      }

      if (isRecord(entry)) {
        return firstNumber(entry.time, entry.timeSec, entry.sec, entry.second, entry.at, entry.timestamp, entry.t);
      }

      return null;
    })
    .filter((entry): entry is number => typeof entry === 'number');
}

function normalizeTrackKey(fileName: string): string {
  if (fileName.startsWith('originals/')) {
    return fileName.slice('originals/'.length);
  }

  if (fileName.startsWith('quantized/')) {
    return fileName.slice('quantized/'.length).replace(/\.quantized\.wav$/i, '.wav');
  }

  return fileName;
}

function normalizeCloudFileKind(fileName: string, inputKind?: unknown): CloudFile['kind'] {
  const normalizedKind = typeof inputKind === 'string' ? inputKind.trim().toLowerCase() : '';

  if (normalizedKind === 'original' || normalizedKind === 'quantized' || normalizedKind === 'other') {
    return normalizedKind;
  }

  if (fileName.startsWith('originals/')) {
    return 'original';
  }

  if (fileName.startsWith('quantized/')) {
    return 'quantized';
  }

  return 'other';
}

function groupCloudFiles(files: CloudFile[]): ComparisonItem[] {
  const grouped = new Map<string, ComparisonItem>();

  for (const file of files) {
    if (file.kind === 'other') {
      continue;
    }

    const trackKey = normalizeTrackKey(file.name);
    const existing = grouped.get(trackKey) || { trackKey, status: 'missing-quantized' as const };

    if (file.kind === 'original') {
      existing.original = file;
    } else if (file.kind === 'quantized') {
      existing.quantized = file;
    }

    if (existing.original && existing.quantized) {
      existing.status = 'complete';
    } else if (existing.original) {
      existing.status = 'missing-quantized';
    } else if (existing.quantized) {
      existing.status = 'missing-original';
    }

    grouped.set(trackKey, existing);
  }

  return Array.from(grouped.values()).sort((left, right) => {
    const leftUpdated = Math.max(parseDate(left.original?.updated), parseDate(left.quantized?.updated));
    const rightUpdated = Math.max(parseDate(right.original?.updated), parseDate(right.quantized?.updated));
    return rightUpdated - leftUpdated || left.trackKey.localeCompare(right.trackKey);
  });
}

function readQuantizationDetailSummary(payload: Record<string, unknown>): QuantizationDetailSummary {
  const source = isRecord(payload.data) ? payload.data : payload;
  const analysis = isRecord(source.analysis) ? source.analysis : source;
  const analysisDetails = isRecord(analysis.analysis) ? analysis.analysis : analysis;
  const timing = isRecord(analysis.timing) ? analysis.timing : {};
  const quantizedEventsValue = isRecord(timing.quantized_events)
    ? timing.quantized_events.quantized_onset_seg ?? timing.quantized_events.quantizedOnsetSeg ?? timing.quantized_events
    : timing.quantized_events ?? source.quantized_events ?? source.quantizedEvents;

  return {
    detectedBpm:
      firstString(
        analysisDetails.detected_bpm,
        analysisDetails.detectedBpm,
        source.detected_bpm,
        source.detectedBpm,
      ) || 'N/D',
    effectiveBpm:
      firstString(
        analysisDetails.effective_bpm,
        analysisDetails.effectiveBpm,
        source.effective_bpm,
        source.effectiveBpm,
      ) || 'N/D',
    gridSubdivision:
      firstString(
        analysisDetails.grid_subdivision,
        analysisDetails.gridSubdivision,
        source.grid_subdivision,
        source.gridSubdivision,
      ) || 'N/D',
    quantizeStrength: firstString(source.quantize_strength, source.quantizeStrength, source.strength) || 'N/D',
    bpmForced: Boolean(source.forceBpm || source.force_bpm || analysisDetails.forceBpm || analysisDetails.force_bpm),
    gridSec: extractNumberArray(timing.grid_sec ?? timing.gridSec ?? source.grid_sec ?? source.gridSec),
    quantizedEvents: extractNumberArray(quantizedEventsValue),
  };
}

function formatWaveMarkerLabel(value: number): string {
  return `${value.toFixed(3)}s`;
}

function getRelativeMarkerPercentages(markers: number[], durationSec: number): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return [];
  }

  return markers
    .map((marker) => (marker / durationSec) * 100)
    .filter((marker) => Number.isFinite(marker) && marker >= 0 && marker <= 100);
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

function normalizeCloudFiles(payload: unknown): CloudFile[] {
  const rawFiles = extractTemporaryFileItems(payload);

  return rawFiles
    .map((item, index) => {
      const name = firstString(item.name, item.objectName, item.filename, `file-${index + 1}`);
      const updated = firstString(item.updatedAt, item.updated) || null;
      const size = toNumber(item.sizeBytes ?? item.size) ?? 0;
      const kind = normalizeCloudFileKind(name, item.kind);

      return {
        name,
        size,
        updated,
        kind,
        signedUrl: firstString(item.signedUrl) || undefined,
      };
    })
    .filter((file) => file.kind === 'original' || file.kind === 'quantized' || file.kind === 'other');
}

function groupCloudFilesFromPayload(payload: unknown): ComparisonItem[] {
  return groupCloudFiles(normalizeCloudFiles(payload));
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

function extractCloudStorageUrl(entry: unknown): string {
  if (typeof entry === 'string') {
    return entry.trim();
  }

  if (!isRecord(entry)) {
    return '';
  }

  return firstString(
    entry.signedUrl,
    entry.url,
    entry.downloadUrl,
    entry.publicUrl,
    entry.objectUrl,
    entry.path,
    entry.name,
  );
}

function extractCloudStorageName(entry: unknown): string {
  if (typeof entry === 'string') {
    return entry.trim();
  }

  if (!isRecord(entry)) {
    return '';
  }

  return firstString(entry.objectName, entry.name, entry.filename, entry.path, entry.storageName);
}

function extractQuantizedResponseSources(payload: Record<string, unknown>): {
  original?: AudioCompareSource;
  quantized?: AudioCompareSource;
} {
  const source = isRecord(payload.data) ? payload.data : payload;
  const fileEntry = isRecord(source.file) ? source.file : source;
  const outputEntry = isRecord(source.output) ? source.output : source;

  const originalCloudStorage = fileEntry.cloudStorage ?? fileEntry.storage ?? source.file;
  const quantizedCloudStorage = outputEntry.cloudStorage ?? outputEntry.storage ?? source.output;

  const originalObjectName = extractCloudStorageName(originalCloudStorage);
  const quantizedObjectName = extractCloudStorageName(quantizedCloudStorage);

  const originalUrl = extractCloudStorageUrl(originalCloudStorage);
  const quantizedUrl = extractCloudStorageUrl(quantizedCloudStorage);

  return {
    original: originalUrl
      ? {
          label: originalObjectName || 'Original',
          url: originalUrl,
        }
      : undefined,
    quantized: quantizedUrl
      ? {
          label: quantizedObjectName || 'Quantized',
          url: quantizedUrl,
        }
      : undefined,
  };
}

async function fetchCloudFileBlobWithRetry(resolveUrl: () => Promise<string>): Promise<Blob> {
  const fetchBlob = async (url: string): Promise<Response> => fetch(url, { method: 'GET' });

  const attempt = async () => {
    const url = await resolveUrl();
    const response = await fetchBlob(url);

    if (response.ok) {
      return response.blob();
    }

    if (response.status === 401 || response.status === 403) {
      const refreshedUrl = await resolveUrl();
      const refreshedResponse = await fetchBlob(refreshedUrl);
      if (refreshedResponse.ok) {
        return refreshedResponse.blob();
      }

      throw new Error(await readErrorFromResponse(refreshedResponse));
    }

    throw new Error(await readErrorFromResponse(response));
  };

  return attempt();
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

function WaveformPreviewCard({ title, color, source, gridSec, quantizedEvents }: WaveformPreviewCardProps) {
  const [loading, setLoading] = useState(false);
  const [waveError, setWaveError] = useState('');
  const [peaks, setPeaks] = useState<number[]>([]);
  const [durationSec, setDurationSec] = useState(0);
  const [sampleRate, setSampleRate] = useState(0);
  const [channels, setChannels] = useState(0);
  const [sizeBytes, setSizeBytes] = useState(0);
  const gridMarkerPositions = getRelativeMarkerPercentages(gridSec || [], durationSec);
  const eventMarkerPositions = getRelativeMarkerPercentages(quantizedEvents || [], durationSec);

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
                <div className="wave-markers-grid">
                  {gridMarkerPositions.map((marker, index) => (
                    <span
                      key={`${title}-grid-${index}`}
                      className="wave-marker wave-marker-grid"
                      style={{ left: `${marker}%` }}
                      title={`grid_sec ${formatWaveMarkerLabel((gridSec || [])[index] || 0)}`}
                    />
                  ))}
                  {eventMarkerPositions.map((marker, index) => (
                    <span
                      key={`${title}-event-${index}`}
                      className="wave-marker wave-marker-event"
                      style={{ left: `${marker}%` }}
                      title={`quantized_event ${formatWaveMarkerLabel((quantizedEvents || [])[index] || 0)}`}
                    />
                  ))}
                </div>

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
    forceBpm: '',
    forceGridSubdivision: '',
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
  const [cloudFiles, setCloudFiles] = useState<CloudFile[]>([]);
  const [cloudFilesLoading, setCloudFilesLoading] = useState(false);
  const [cloudFilesError, setCloudFilesError] = useState('');
  const [gcsConfigured, setGcsConfigured] = useState<boolean | null>(null);
  const [temporaryFileDownloading, setTemporaryFileDownloading] = useState('');

  const [singleResult, setSingleResult] = useState<Record<string, unknown> | null>(null);
  const [batchResult, setBatchResult] = useState<Record<string, unknown> | null>(null);
  const [latestQuantizationResult, setLatestQuantizationResult] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [beforeAudio, setBeforeAudio] = useState<AudioCompareSource | null>(null);
  const [afterAudio, setAfterAudio] = useState<AudioCompareSource | null>(null);
  const comparisonItems = useMemo(() => groupCloudFiles(cloudFiles), [cloudFiles]);
  const quantizationSummary = useMemo(
    () => (latestQuantizationResult ? readQuantizationDetailSummary(latestQuantizationResult) : null),
    [latestQuantizationResult],
  );

  const currentEmail = auth.currentUser?.email || 'admin';

  useEffect(() => {
    let cancelled = false;

    const loadCloudFiles = async () => {
      setCloudFilesLoading(true);
      setCloudFilesError('');

      try {
        const response = await listQuantizeFiles(50);

        if (!response.ok) {
          const errorMessage = await readErrorFromResponse(response);
          if (!cancelled) {
            setGcsConfigured(!/gcs_bucket is not configured/i.test(errorMessage));
          }
          throw new Error(errorMessage);
        }

        const payload = await response.json();

        if (!cancelled) {
          setGcsConfigured(
            isRecord(payload) && typeof payload.gcsConfigured === 'boolean' ? payload.gcsConfigured : true,
          );
          setCloudFiles(normalizeCloudFiles(payload));
        }
      } catch (requestError) {
        if (!cancelled) {
          const messageText = formatRequestError(requestError);
          setCloudFilesError(messageText);
          if (/gcs_bucket is not configured/i.test(messageText)) {
            setGcsConfigured(false);
            setCloudFilesError('');
          }
        }
      } finally {
        if (!cancelled) {
          setCloudFilesLoading(false);
        }
      }
    };

    loadCloudFiles();

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

  const cacheTemporaryFileSignedUrl = (name: string, signedUrl: string) => {
    setCloudFiles((previousFiles) =>
      previousFiles.map((previousFile) => (previousFile.name === name ? { ...previousFile, signedUrl } : previousFile)),
    );
  };

  const refreshTemporaryFiles = async () => {
    try {
      const response = await listQuantizeFiles(50);

      if (!response.ok) {
        console.error('Error refrescando archivos temporales:', response);
        return;
      }

      const payload = await response.json();
      setCloudFiles(normalizeCloudFiles(payload));
      setGcsConfigured(isRecord(payload) && typeof payload.gcsConfigured === 'boolean' ? payload.gcsConfigured : true);
    } catch (error) {
      console.error('Error al refrescar archivos temporales:', error);
    }
  };

  const resolveTemporaryFileUrl = async (file: CloudFile): Promise<string> => {
    if (file.signedUrl) {
      return file.signedUrl;
    }

    const requestSignedUrl = async () => {
      const response = await getQuantizeSignedUrl(file.name);

      if (!response.ok) {
        throw new Error(await readErrorFromResponse(response));
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json') || contentType.includes('+json')) {
        return readSignedUrlFromPayload(await response.json());
      }

      return (await response.text()).trim();
    };

    let signedUrl = await requestSignedUrl();

    if (!signedUrl) {
      throw new Error('El backend no devolvió una signed URL válida.');
    }

    cacheTemporaryFileSignedUrl(file.name, signedUrl);
    return signedUrl;
  };

  const handleTemporaryFileDownload = async (file: CloudFile) => {
    setCloudFilesError('');
    setTemporaryFileDownloading(file.name);

    try {
      const blob = await fetchCloudFileBlobWithRetry(() => resolveTemporaryFileUrl(file));
      triggerDownload(blob, file.name.split('/').pop() || file.name);
    } catch (requestError) {
      setCloudFilesError(`Error descargando ${file.name}: ${formatRequestError(requestError)}`);
    } finally {
      setTemporaryFileDownloading('');
    }
  };

  const handleTemporaryFilePlay = async (file: CloudFile) => {
    setCloudFilesError('');
    setTemporaryFileDownloading(file.name);

    try {
      const blob = await fetchCloudFileBlobWithRetry(() => resolveTemporaryFileUrl(file));
      const blobUrl = URL.createObjectURL(blob);
      const audio = new Audio(blobUrl);
      await audio.play();
      audio.addEventListener('ended', () => URL.revokeObjectURL(blobUrl), { once: true });
    } catch (requestError) {
      setCloudFilesError(`Error reproduciendo ${file.name}: ${formatRequestError(requestError)}`);
    } finally {
      setTemporaryFileDownloading('');
    }
  };

  const renderCloudFileCell = (label: string, file: CloudFile | undefined, accentClassName: string) => {
    if (!file) {
      return <p className="cloud-file-empty">No disponible</p>;
    }

    const audioSource = file.signedUrl || '';

    return (
      <div className={`cloud-file-card ${accentClassName}`}>
        <p className="cloud-file-kind">{label}</p>
        <p className="cloud-file-name">{file.name}</p>
        <p className="cloud-file-meta">{formatSizeLabel(file.size)} · {formatDateLabel(file.updated || '')}</p>
        <p className="cloud-file-meta cloud-file-meta-muted">{file.kind}</p>
        <div className="cloud-file-audio-wrap">
          <audio controls preload="none" src={audioSource || undefined} />
          <div className="cloud-file-wave-placeholder">Waveform preparado para reutilizar aquí.</div>
        </div>
        <div className="cloud-file-actions">
          <button
            type="button"
            onClick={() => handleTemporaryFilePlay(file)}
            disabled={temporaryFileDownloading === file.name}
          >
            Reproducir
          </button>
          <button
            type="button"
            onClick={() => handleTemporaryFileDownload(file)}
            disabled={temporaryFileDownloading === file.name}
          >
            Descargar
          </button>
        </div>
      </div>
    );
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
        setLatestQuantizationResult(json);

        const responseSources = extractQuantizedResponseSources(json);
        if (responseSources.original) {
          setBeforeAudio((previous) => {
            revokeObjectUrlIfNeeded(previous);
            return responseSources.original || null;
          });
        }
        if (responseSources.quantized) {
          setAfterAudio((previous) => {
            revokeObjectUrlIfNeeded(previous);
            return responseSources.quantized || null;
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
      setLatestQuantizationResult(json);
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

          <label htmlFor="single-force-bpm">forceBpm (opcional)</label>
          <input
            id="single-force-bpm"
            value={singleForm.forceBpm}
            onChange={(event) => setSingleForm((prev) => ({ ...prev, forceBpm: event.target.value }))}
            placeholder="fija el BPM usado para construir la rejilla"
          />
          <p className="field-help">forceBpm: fija el BPM usado para construir la rejilla.</p>

          <label htmlFor="single-force-grid">forceGridSubdivision (opcional)</label>
          <input
            id="single-force-grid"
            value={singleForm.forceGridSubdivision}
            onChange={(event) => setSingleForm((prev) => ({ ...prev, forceGridSubdivision: event.target.value }))}
            placeholder="fija la subdivisión y evita auto-detección"
          />
          <p className="field-help">forceGridSubdivision: fija la subdivisión de la rejilla y evita auto-detección.</p>

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

        {quantizationSummary && (
          <div className="quantization-detail-grid">
            <div>
              <span>detected_bpm</span>
              <strong>{quantizationSummary.detectedBpm}</strong>
            </div>
            <div>
              <span>effective_bpm</span>
              <strong>{quantizationSummary.effectiveBpm}</strong>
            </div>
            <div>
              <span>grid_subdivision</span>
              <strong>{quantizationSummary.gridSubdivision}</strong>
            </div>
            <div>
              <span>quantize_strength</span>
              <strong>{quantizationSummary.quantizeStrength}</strong>
            </div>
            <div>
              <span>analysis mode</span>
              <strong className={quantizationSummary.bpmForced ? 'detail-badge detail-badge-forced' : 'detail-badge'}>
                {quantizationSummary.bpmForced ? 'BPM forced' : 'quantized by rhythmic analysis'}
              </strong>
            </div>
            <div>
              <span>grid_sec</span>
              <strong>{quantizationSummary.gridSec.length} marcadores</strong>
            </div>
            <div>
              <span>quantized_events</span>
              <strong>{quantizationSummary.quantizedEvents.length} eventos</strong>
            </div>
          </div>
        )}

        <div className="waveform-compare-grid">
          <WaveformPreviewCard
            title="Antes"
            color="#ff3ecf"
            source={beforeAudio}
            gridSec={quantizationSummary?.gridSec}
            quantizedEvents={quantizationSummary?.quantizedEvents}
          />
          <WaveformPreviewCard
            title="Despues"
            color="#b026ff"
            source={afterAudio}
            gridSec={quantizationSummary?.gridSec}
            quantizedEvents={quantizationSummary?.quantizedEvents}
          />
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
        <h2>Comparación Before / After</h2>
        <p>Los archivos se eliminan automáticamente después de 24 horas.</p>

        {gcsConfigured === false && <p className="section-state">GCS no está configurado todavía. Cuando se habilite, aquí aparecerán los pares de audio.</p>}
        {gcsConfigured !== false && cloudFilesLoading && <p className="section-state">Cargando archivos en la nube...</p>}
        {gcsConfigured !== false && !cloudFilesLoading && cloudFilesError && <p className="status-error">{cloudFilesError}</p>}

        {gcsConfigured !== false && !cloudFilesLoading && !cloudFilesError && comparisonItems.length === 0 && (
          <p className="section-state empty-state">No hay archivos disponibles.</p>
        )}

        {gcsConfigured !== false && !cloudFilesLoading && !cloudFilesError && comparisonItems.length > 0 && (
          <div className="cloud-files-list">
            {comparisonItems.map((item) => (
              <article key={item.trackKey} className="cloud-file-group">
                <div className="cloud-file-group-header">
                  <div>
                    <p className="cloud-file-group-label">trackName</p>
                    <h3>{item.trackKey}</h3>
                  </div>
                  <span className={`cloud-file-group-badge cloud-file-group-badge-${item.status}`}>
                    {item.status === 'complete' ? 'Complete' : 'Pending pair'}
                  </span>
                </div>

                <div className="cloud-file-columns">
                  <div className="cloud-file-column">
                    {renderCloudFileCell('Original', item.original, 'cloud-file-original')}
                  </div>
                  <div className="cloud-file-column">
                    {renderCloudFileCell('Quantized', item.quantized, 'cloud-file-quantized')}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {message && <p className="status-message">{message}</p>}
      {error && <p className="status-error">{error}</p>}
    </main>
  );
}

export default QuantizeDashboardPage;
