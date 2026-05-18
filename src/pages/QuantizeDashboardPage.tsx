import React, { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const LAST_QUANTIZATION_RESULT_STORAGE_KEY = 'quantize:lastResult';
const METRONOME_OFFSET_STORAGE_KEY = 'quantize:metronomeOffsetMs';
const PLAYHEAD_FOLLOW_STORAGE_KEY = 'quantize:playheadFollowEnabled';
const PLAYHEAD_FOLLOW_SENSITIVITY_STORAGE_KEY = 'quantize:playheadFollowSensitivity';

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
  metadata?: Record<string, unknown>;
  quantizeMetadata?: Record<string, unknown>;
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
  comparisonLabel: string;
  playerId: string;
  syncGroupId: string;
  followPlaybackEnabled: boolean;
  onFollowPlaybackEnabledChange: (enabled: boolean) => void;
  followSensitivityPct: number;
  onFollowSensitivityPctChange: (sensitivityPct: number) => void;
  gridSec?: number[];
  quantizedEvents?: number[];
  detectedBpm?: string;
  effectiveBpm?: string;
  timeSignature?: string;
  gridSubdivision?: string;
  zoomLevel: number;
  onZoomChange?: (zoom: number) => void;
  onDurationMeasured?: (durationSec: number) => void;
}

interface QuantizationDetailSummary {
  detectedBpm: string;
  effectiveBpm: string;
  gridSubdivision: string;
  timeSignature: string;
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

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
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

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
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

function parseTimeSignature(value: string): { beatsPerBar: number; beatUnit: number } | null {
  const match = value.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) {
    return null;
  }

  const beatsPerBar = Number(match[1]);
  const beatUnit = Number(match[2]);

  if (!Number.isFinite(beatsPerBar) || beatsPerBar <= 0 || !Number.isFinite(beatUnit) || beatUnit <= 0) {
    return null;
  }

  return { beatsPerBar, beatUnit };
}

function formatMusicalGridLabel(bpm: string, signature: string, subdivision: string): string {
  const bpmLabel = bpm.trim() ? `${bpm.trim()} BPM` : 'BPM N/D';
  const signatureLabel = signature.trim() ? signature.trim() : 'compás N/D';
  const subdivisionLabel = subdivision.trim() ? `subdiv ${subdivision.trim()}` : 'subdiv N/D';
  return `${bpmLabel} · ${signatureLabel} · ${subdivisionLabel}`;
}

function buildBeatMarkerPercentages(durationSec: number, bpmText: string): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return [];
  }

  const bpm = firstNumber(bpmText);
  if (!bpm || bpm <= 0) {
    return [];
  }

  const beatDurationSec = 60 / bpm;
  const epsilon = beatDurationSec * 0.15;
  const markers: number[] = [];

  for (let time = 0; time <= durationSec + epsilon; time += beatDurationSec) {
    markers.push((time / durationSec) * 100);
  }

  return Array.from(new Set(markers.map((marker) => Number(marker.toFixed(3))))).sort((left, right) => left - right);
}

function buildBarMarkerPercentages(durationSec: number, bpmText: string, timeSignatureText: string): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return [];
  }

  const bpm = firstNumber(bpmText);
  if (!bpm || bpm <= 0) {
    return [];
  }

  const beatDurationSec = 60 / bpm;
  const beatsPerBar = parseTimeSignature(timeSignatureText)?.beatsPerBar || 4;
  const barDurationSec = beatDurationSec * beatsPerBar;
  const epsilon = barDurationSec * 0.15;
  const markers: number[] = [];

  for (let time = 0; time <= durationSec + epsilon; time += barDurationSec) {
    markers.push((time / durationSec) * 100);
  }

  return Array.from(new Set(markers.map((marker) => Number(marker.toFixed(3))))).sort((left, right) => left - right);
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
  const analysis =
    (isRecord(source.analysis) ? source.analysis : null)
    || (isRecord(source.analysis_result) ? source.analysis_result : null)
    || source;
  const analysisDetails =
    (isRecord(analysis.analysis) ? analysis.analysis : null)
    || (isRecord(analysis.details) ? analysis.details : null)
    || analysis;
  const timing =
    (isRecord(analysis.timing) ? analysis.timing : null)
    || (isRecord(analysisDetails.timing) ? analysisDetails.timing : null)
    || {};
  const quantizedEventsValue = isRecord(timing.quantized_events)
    ? timing.quantized_events.quantized_onset_seg ?? timing.quantized_events.quantizedOnsetSeg ?? timing.quantized_events
    : timing.quantized_events
      ?? timing.quantized_onset_seg
      ?? timing.quantizedOnsetSeg
      ?? source.quantized_events
      ?? source.quantizedEvents
      ?? source.quantized_onset_seg;

  return {
    detectedBpm:
      firstText(
        analysisDetails.detected_bpm,
        analysisDetails.detectedBpm,
        analysisDetails.bpm,
        source.detected_bpm,
        source.detectedBpm,
        source.bpm,
      ) || 'N/D',
    effectiveBpm:
      firstText(
        analysisDetails.effective_bpm,
        analysisDetails.effectiveBpm,
        source.effective_bpm,
        source.effectiveBpm,
        analysisDetails.bpm,
        source.bpm,
      ) || 'N/D',
    gridSubdivision:
      firstText(
        analysisDetails.grid_subdivision,
        analysisDetails.gridSubdivision,
        analysisDetails.subdivision,
        analysisDetails.subdiv,
        source.grid_subdivision,
        source.gridSubdivision,
        source.subdivision,
        source.subdiv,
      ) || 'N/D',
    timeSignature:
      firstText(
        analysisDetails.time_signature,
        analysisDetails.timeSignature,
        analysisDetails.signature,
        analysisDetails.meter,
        source.time_signature,
        source.timeSignature,
        source.signature,
        source.meter,
      ) || 'N/D',
    quantizeStrength: firstText(source.quantize_strength, source.quantizeStrength, source.strength) || 'N/D',
    bpmForced:
      toBoolean(source.forceBpm)
      ?? toBoolean(source.force_bpm)
      ?? toBoolean(source.bpmForced)
      ?? toBoolean(source.bpm_forced)
      ?? toBoolean(analysisDetails.forceBpm)
      ?? toBoolean(analysisDetails.force_bpm)
      ?? toBoolean(analysisDetails.bpmForced)
      ?? toBoolean(analysisDetails.bpm_forced)
      ?? false,
    gridSec: extractNumberArray(
      timing.grid_sec
      ?? timing.gridSec
      ?? timing.grid
      ?? source.grid_sec
      ?? source.gridSec
      ?? source.grid,
    ),
    quantizedEvents: extractNumberArray(quantizedEventsValue),
  };
}

function hasUsefulQuantizationSummary(summary: QuantizationDetailSummary): boolean {
  return Boolean(
    summary.detectedBpm !== 'N/D'
    || summary.effectiveBpm !== 'N/D'
    || summary.gridSubdivision !== 'N/D'
    || summary.timeSignature !== 'N/D'
    || summary.gridSec.length > 0
    || summary.quantizedEvents.length > 0,
  );
}

function readQuantizationSummaryFromCloudFile(file?: CloudFile): QuantizationDetailSummary | null {
  if (!file) {
    return null;
  }

  const candidates: unknown[] = [
    file.quantizeMetadata,
    file.metadata,
    isRecord(file.metadata) ? file.metadata.quantization : null,
    isRecord(file.metadata) ? file.metadata.analysis : null,
  ];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue;
    }

    const summary = readQuantizationDetailSummary(candidate);
    if (hasUsefulQuantizationSummary(summary)) {
      return summary;
    }
  }

  return null;
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
      const itemRecord = item as unknown as Record<string, unknown>;
      const name = firstString(item.name, item.objectName, item.filename, `file-${index + 1}`);
      const updated = firstString(item.updatedAt, item.updated) || null;
      const size = toNumber(item.sizeBytes ?? item.size) ?? 0;
      const kind = normalizeCloudFileKind(name, item.kind);
      const metadata =
        (isRecord(itemRecord.metadata) ? itemRecord.metadata : null)
        || (isRecord(itemRecord.meta) ? itemRecord.meta : null)
        || undefined;
      const quantizeMetadata =
        (isRecord(itemRecord.quantizeMetadata) ? itemRecord.quantizeMetadata : null)
        || (isRecord(itemRecord.quantize_metadata) ? itemRecord.quantize_metadata : null)
        || undefined;

      return {
        name,
        size,
        updated,
        kind,
        signedUrl: firstString(item.signedUrl) || undefined,
        metadata,
        quantizeMetadata,
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

function buildWaveformPath(peaks: number[]): string {
  if (peaks.length === 0) {
    return '';
  }

  const width = 1000;
  const height = 200;
  const centerY = height / 2;
  const step = peaks.length > 1 ? width / (peaks.length - 1) : width;
  const upperPoints = peaks.map((peak, index) => `${(index * step).toFixed(2)},${(centerY - peak * centerY).toFixed(2)}`);
  const lowerPoints = peaks
    .slice()
    .reverse()
    .map((peak, index) => `${(width - index * step).toFixed(2)},${(centerY + peak * centerY).toFixed(2)}`);

  return [`M 0 ${centerY.toFixed(2)}`, ...upperPoints.map((point) => `L ${point}`), ...lowerPoints.map((point) => `L ${point}`), 'Z'].join(' ');
}

type ActivePlaybackHandle = {
  id: string;
  groupId: string;
  pause: () => void;
  getCurrentTime: () => number;
  getViewportProgress: () => number | null;
  isPlaying: () => boolean;
};

let activePlaybackHandle: ActivePlaybackHandle | null = null;

function formatClockTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
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

function WaveformPreviewCard({
  title,
  color,
  source,
  comparisonLabel,
  playerId,
  syncGroupId,
  followPlaybackEnabled,
  onFollowPlaybackEnabledChange,
  followSensitivityPct,
  onFollowSensitivityPctChange,
  gridSec,
  quantizedEvents,
  detectedBpm,
  effectiveBpm,
  timeSignature,
  gridSubdivision,
  zoomLevel,
  onZoomChange,
  onDurationMeasured,
}: WaveformPreviewCardProps) {
  const [loading, setLoading] = useState(false);
  const [waveError, setWaveError] = useState('');
  const [peaks, setPeaks] = useState<number[]>([]);
  const [durationSec, setDurationSec] = useState(0);
  const [sampleRate, setSampleRate] = useState(0);
  const [channels, setChannels] = useState(0);
  const [sizeBytes, setSizeBytes] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [metronomeOffsetMs, setMetronomeOffsetMs] = useState(() => {
    try {
      const stored = window.localStorage.getItem(METRONOME_OFFSET_STORAGE_KEY);
      if (!stored) {
        return 0;
      }

      const parsed = Number(stored);
      if (!Number.isFinite(parsed)) {
        return 0;
      }

      return Math.min(30, Math.max(-30, Math.round(parsed)));
    } catch {
      return 0;
    }
  });

  // Cursor handled via DOM refs — zero React re-renders during drag
  const durationSecRef = useRef(0);
  const cursorWaveRef = useRef<HTMLSpanElement>(null);
  const cursorMinimapRef = useRef<HTMLSpanElement>(null);
  const cursorLabelRef = useRef<HTMLSpanElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const metronomeTimerRef = useRef<number | null>(null);
  const metronomeAlignTimeoutRef = useRef<number | null>(null);
  const metronomeAudioContextRef = useRef<AudioContext | null>(null);
  const metronomeBeatRef = useRef(0);
  const isDraggingWave = useRef(false);
  const isDraggingMinimap = useRef(false);
  const isScrubbingPlaybackRef = useRef(false);
  const waveformBarCount = 240;

  // Waveform scrollable viewport and minimap window indicator
  const waveViewportRef = useRef<HTMLDivElement>(null);
  const minimapWindowRef = useRef<HTMLDivElement>(null);

  const gridMarkerPositions = getRelativeMarkerPercentages(gridSec || [], durationSec);
  const eventMarkerPositions = getRelativeMarkerPercentages(quantizedEvents || [], durationSec);
  const waveContentWidth = `${Math.max(100, zoomLevel * 120)}%`;
  const beatMarkerPositions = buildBeatMarkerPercentages(durationSec, effectiveBpm || detectedBpm || '');
  const barMarkerPositions = buildBarMarkerPercentages(durationSec, effectiveBpm || detectedBpm || '', timeSignature || '');
  const timelineBarLabelStride = Math.max(1, Math.ceil((barMarkerPositions.length || gridMarkerPositions.length || 1) / 10));
  const beatGuideStride = Math.max(1, Math.ceil((beatMarkerPositions.length || 1) / 80));
  const musicalGridLabel = formatMusicalGridLabel(effectiveBpm || detectedBpm || '', timeSignature || '', gridSubdivision || '');
  const comparisonBadgeLabel = comparisonLabel.toLowerCase() === 'original' ? 'Antes' : 'Después';
  const waveformPath = useMemo(() => buildWaveformPath(peaks), [peaks]);
  const waveformGradientId = `wave-gradient-${playerId.replace(/[^a-z0-9]+/gi, '-')}`;
  const playbackPercent = durationSec > 0 ? Math.min(100, Math.max(0, (currentTime / durationSec) * 100)) : 0;
  const playbackClockLabel = `${formatClockTime(currentTime)} / ${formatClockTime(durationSec)}`;
  const bpmForMetronome = firstNumber(effectiveBpm || detectedBpm || '');
  const timeSignatureInfo = parseTimeSignature(timeSignature || '');
  const beatsPerBar = timeSignatureInfo?.beatsPerBar || 4;
  const canUseMetronome = Boolean(bpmForMetronome && bpmForMetronome > 0);

  useEffect(() => {
    try {
      window.localStorage.setItem(METRONOME_OFFSET_STORAGE_KEY, String(metronomeOffsetMs));
    } catch {
      // Ignore storage failures.
    }
  }, [metronomeOffsetMs]);

  const clearMetronome = useCallback(() => {
    if (metronomeAlignTimeoutRef.current !== null) {
      window.clearTimeout(metronomeAlignTimeoutRef.current);
      metronomeAlignTimeoutRef.current = null;
    }
    if (metronomeTimerRef.current !== null) {
      window.clearTimeout(metronomeTimerRef.current);
      metronomeTimerRef.current = null;
    }
  }, []);

  const stopMetronome = useCallback(() => {
    clearMetronome();
    metronomeBeatRef.current = 0;
    const context = metronomeAudioContextRef.current;
    metronomeAudioContextRef.current = null;
    if (context) {
      void context.close();
    }
  }, [clearMetronome]);

  const playMetronomeClick = useCallback((accent: boolean) => {
    const bpm = bpmForMetronome;
    if (!bpm || bpm <= 0) {
      return;
    }

    const AudioContextCtor = window.AudioContext;
    if (!AudioContextCtor) {
      return;
    }

    if (!metronomeAudioContextRef.current) {
      metronomeAudioContextRef.current = new AudioContextCtor();
    }

    const context = metronomeAudioContextRef.current;
    if (!context) {
      return;
    }

    const renderClick = () => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = accent ? 'square' : 'sine';
      oscillator.frequency.value = accent ? 1100 : 760;
      gain.gain.value = accent ? 0.22 : 0.12;
      oscillator.connect(gain);
      gain.connect(context.destination);
      const startAt = context.currentTime + 0.002;
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.05);
    };

    if (context.state === 'suspended') {
      void context.resume().then(() => {
        renderClick();
      }).catch(() => {
        // Ignore resume errors; browser may block audio until next gesture.
      });
      return;
    }

    renderClick();
  }, [bpmForMetronome]);

  const startMetronome = useCallback((startTimeSec?: number) => {
    const bpm = bpmForMetronome;
    if (!metronomeEnabled || !bpm || bpm <= 0) {
      return;
    }

    stopMetronome();

    const beatDurationSec = 60 / bpm;
    const offsetSec = metronomeOffsetMs / 1000;
    const scheduleNextTick = (referenceTimeSec?: number) => {
      const audio = audioRef.current;
      if (!audio || audio.paused || !metronomeEnabled) {
        clearMetronome();
        return;
      }

      const nowSec = Math.max(
        0,
        typeof referenceTimeSec === 'number' && Number.isFinite(referenceTimeSec)
          ? referenceTimeSec
          : audio.currentTime,
      );
      // Keep ticks phase-locked to audio and always schedule into the future.
      const nextBeatIndex = Math.floor((nowSec - offsetSec + 0.002) / beatDurationSec) + 1;
      const nextBeatTimeSec = nextBeatIndex * beatDurationSec + offsetSec;
      const delayMs = Math.max(8, (nextBeatTimeSec - nowSec) * 1000);

      metronomeBeatRef.current = nextBeatIndex;
      metronomeTimerRef.current = window.setTimeout(() => {
        const beatIndex = metronomeBeatRef.current;
        playMetronomeClick(beatIndex % beatsPerBar === 0);
        scheduleNextTick();
      }, delayMs);
    };

    metronomeAlignTimeoutRef.current = window.setTimeout(() => {
      metronomeAlignTimeoutRef.current = null;
      scheduleNextTick(startTimeSec);
    }, 0);
  }, [beatsPerBar, bpmForMetronome, clearMetronome, metronomeEnabled, metronomeOffsetMs, playMetronomeClick, stopMetronome]);

  const syncPlaybackPosition = useCallback((timeSec: number) => {
    const duration = durationSecRef.current;
    const pct = duration > 0 ? Math.min(1, Math.max(0, timeSec / duration)) : 0;
    const left = `${pct * 100}%`;
    if (cursorWaveRef.current) cursorWaveRef.current.style.left = left;
    if (cursorMinimapRef.current) cursorMinimapRef.current.style.left = left;
    if (cursorLabelRef.current) {
      cursorLabelRef.current.textContent = `${formatClockTime(timeSec)} / ${formatClockTime(duration)}`;
    }
    setCurrentTime(timeSec);
  }, []);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsPlaying(false);
    syncPlaybackPosition(0);
    stopMetronome();
    if (activePlaybackHandle?.id === playerId) {
      activePlaybackHandle = null;
    }
  }, [playerId, stopMetronome, syncPlaybackPosition]);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !source?.url) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      return;
    }

    if (activePlaybackHandle && activePlaybackHandle.id !== playerId) {
      activePlaybackHandle.pause();
    }

    try {
      await audio.play();
      activePlaybackHandle = {
        id: playerId,
        groupId: syncGroupId,
        pause: () => {
          audio.pause();
        },
        getCurrentTime: () => audio.currentTime,
        getViewportProgress: () => {
          const viewport = waveViewportRef.current;
          if (!viewport) {
            return null;
          }

          const scrollable = viewport.scrollWidth - viewport.clientWidth;
          if (scrollable <= 0) {
            return 0;
          }

          return Math.min(1, Math.max(0, viewport.scrollLeft / scrollable));
        },
        isPlaying: () => !audio.paused,
      };
      setIsPlaying(true);
    } catch (error) {
      setWaveError(formatRequestError(error));
    }
  }, [isPlaying, playerId, source?.url, startMetronome, syncGroupId]);

  useEffect(() => {
    syncPlaybackPosition(0);
    setIsPlaying(false);
    stopMetronome();
    if (activePlaybackHandle?.id === playerId) {
      activePlaybackHandle = null;
    }
  }, [playerId, source?.url, stopMetronome, syncPlaybackPosition]);

  useEffect(() => {
    let frameId = 0;

    const handleFrame = () => {
      const externalPlaybackHandle = activePlaybackHandle;
      const externalIsSameGroup = Boolean(
        externalPlaybackHandle
        && externalPlaybackHandle.id !== playerId
        && externalPlaybackHandle.groupId === syncGroupId
        && externalPlaybackHandle.isPlaying(),
      );
      const audio = audioRef.current;
      const isLocalPlaying = Boolean(audio && !audio.paused);
      const currentPlaybackTime = isLocalPlaying
        ? (audio?.currentTime ?? 0)
        : externalIsSameGroup
          ? (externalPlaybackHandle?.getCurrentTime() ?? NaN)
          : NaN;
      const externalViewportProgress = externalIsSameGroup
        ? (externalPlaybackHandle?.getViewportProgress() ?? null)
        : null;

      if (Number.isFinite(currentPlaybackTime)) {
        syncPlaybackPosition(currentPlaybackTime);

        if (followPlaybackEnabled && !isDraggingMinimap.current && !isScrubbingPlaybackRef.current) {
          const vp = waveViewportRef.current;
          const duration = durationSecRef.current;
          if (vp && Number.isFinite(duration) && duration > 0) {
            const content = vp.scrollWidth;
            const visible = vp.clientWidth;
            if (content > visible) {
              if (externalIsSameGroup && typeof externalViewportProgress === 'number' && Number.isFinite(externalViewportProgress)) {
                const targetScrollLeft = Math.min(content - visible, Math.max(0, externalViewportProgress * (content - visible)));
                vp.scrollLeft = targetScrollLeft;
              } else {
                const cursorX = (Math.min(duration, Math.max(0, currentPlaybackTime)) / duration) * content;
                const margin = visible * (followSensitivityPct / 100);
                const minVisibleX = vp.scrollLeft + margin;
                const maxVisibleX = vp.scrollLeft + visible - margin;

                if (cursorX < minVisibleX || cursorX > maxVisibleX) {
                  vp.scrollLeft = Math.min(content - visible, Math.max(0, cursorX - visible * 0.5));
                }
              }
            }
          }
        }
      }
      frameId = requestAnimationFrame(handleFrame);
    };

    frameId = requestAnimationFrame(handleFrame);
    return () => cancelAnimationFrame(frameId);
  }, [followPlaybackEnabled, followSensitivityPct, isPlaying, playerId, syncGroupId, syncPlaybackPosition]);

  useEffect(() => {
    if (!isPlaying || !metronomeEnabled) {
      stopMetronome();
      return;
    }

    startMetronome(audioRef.current?.currentTime ?? 0);
  }, [isPlaying, metronomeEnabled, startMetronome, stopMetronome]);

  useEffect(() => {
    return () => {
      if (activePlaybackHandle?.id === playerId) {
        activePlaybackHandle = null;
      }
      stopMetronome();
    };
  }, [playerId, stopMetronome]);

  useEffect(() => { durationSecRef.current = durationSec; }, [durationSec]);

  const applyCursor = (ratio: number) => {
    const pct = `${ratio * 100}%`;
    if (cursorWaveRef.current) cursorWaveRef.current.style.left = pct;
    if (cursorMinimapRef.current) cursorMinimapRef.current.style.left = pct;
    if (cursorLabelRef.current) {
      const d = durationSecRef.current;
      cursorLabelRef.current.textContent = d > 0 ? `${formatClockTime(d * ratio)} / ${formatClockTime(d)}` : `${Math.round(ratio * 100)}%`;
    }
  };

  const seekToTime = useCallback((timeSec: number) => {
    const audio = audioRef.current;
    const duration = durationSecRef.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) {
      return;
    }

    const boundedTime = Math.min(duration, Math.max(0, timeSec));
    audio.currentTime = boundedTime;
    syncPlaybackPosition(boundedTime);

    if (metronomeEnabled && !audio.paused) {
      startMetronome(boundedTime);
    }
  }, [metronomeEnabled, startMetronome, syncPlaybackPosition]);

  const seekBySeconds = useCallback((deltaSec: number) => {
    const audio = audioRef.current;
    const baseTime = audio ? audio.currentTime : currentTime;
    seekToTime(baseTime + deltaSec);
  }, [currentTime, seekToTime]);

  const seekToRatio = useCallback((ratio: number) => {
    const duration = durationSecRef.current;
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }

    const boundedRatio = Math.min(1, Math.max(0, ratio));
    seekToTime(boundedRatio * duration);
  }, [seekToTime]);

  const getPlaybackTrackRatio = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  };

  const syncWindow = () => {
    const vp = waveViewportRef.current;
    const win = minimapWindowRef.current;
    if (!vp || !win) return;
    const content = vp.scrollWidth;
    const visible = vp.clientWidth;
    if (content <= visible) { win.style.left = '0%'; win.style.width = '100%'; return; }
    const frac = visible / content;
    const scroll = vp.scrollLeft / (content - visible);
    win.style.left = `${scroll * (1 - frac) * 100}%`;
    win.style.width = `${frac * 100}%`;
  };

  useEffect(() => { requestAnimationFrame(syncWindow); }, [zoomLevel]);

  const handleMinimapClick = (event: React.PointerEvent<HTMLDivElement>) => {
    // Ignore click if we just finished dragging
    if (minimapWasDraggedRef.current) {
      minimapWasDraggedRef.current = false;
      return;
    }
    
    // Click on minimap to zoom to that section
    // Zoom such that ~60% of the viewport shows the clicked region
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const targetZoom = Math.min(6, Math.max(0.5, 1.67)); // Zoom to ~1.67x to show ~60% around click point
    onZoomChange?.(Number(targetZoom.toFixed(2)));
    // Pan to center around the clicked point
    panWaveformTo(Math.max(0, Math.min(1, ratio - 0.3)));
  };

  const getWaveRatio = (event: React.PointerEvent<HTMLDivElement>) => {
    const vp = event.currentTarget;
    const rect = vp.getBoundingClientRect();
    return Math.min(1, Math.max(0, (vp.scrollLeft + event.clientX - rect.left) / vp.scrollWidth));
  };

  const getMinimapRatio = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  };

  const panWaveformTo = (ratio: number) => {
    const vp = waveViewportRef.current;
    if (!vp) return;
    const scrollable = vp.scrollWidth - vp.clientWidth;
    if (scrollable > 0) vp.scrollLeft = ratio * scrollable;
    syncWindow();
  };

  const focusTimelinePosition = useCallback((positionPct: number, preferredZoom?: number) => {
    const clampedPct = Math.min(100, Math.max(0, positionPct));
    const ratio = clampedPct / 100;
    const targetZoom = typeof preferredZoom === 'number'
      ? Math.min(6, Math.max(0.5, Number(preferredZoom.toFixed(2))))
      : zoomLevel;

    if (targetZoom !== zoomLevel) {
      onZoomChange?.(targetZoom);
      requestAnimationFrame(() => {
        panWaveformTo(Math.max(0, Math.min(1, ratio - 0.3)));
      });
    } else {
      panWaveformTo(Math.max(0, Math.min(1, ratio - 0.3)));
    }

    applyCursor(ratio);
  }, [onZoomChange, panWaveformTo, zoomLevel]);

  const handleBarLabelFocus = useCallback((positionPct: number, markerCount: number) => {
    // Aim to show around 8 bars when jumping from bar labels.
    const desiredVisibleBars = 8;
    const computedZoom = markerCount > 0
      ? markerCount / (1.2 * desiredVisibleBars)
      : zoomLevel;
    focusTimelinePosition(positionPct, computedZoom);
  }, [focusTimelinePosition, zoomLevel]);

  const getMinimapZoneInfo = (event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const edgeThreshold = 0.15; // First/last 15% are "border zones"
    const isLeftEdge = ratio < edgeThreshold;
    const isRightEdge = ratio > 1 - edgeThreshold;
    const isBorderZone = isLeftEdge || isRightEdge;
    return { ratio, isLeftEdge, isRightEdge, isBorderZone };
  };

  const handleMinimapMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const { isBorderZone } = getMinimapZoneInfo(event);
    const elem = event.currentTarget;
    if (isBorderZone) {
      elem.style.cursor = 'ew-resize'; // Left-right resize cursor for zoom
    } else {
      elem.style.cursor = 'zoom-in'; // Magnifying glass for center zoom
    }
  };

  const minimapDragModeRef = useRef<'pan' | 'zoom' | null>(null);
  const minimapDragStartXRef = useRef(0);
  const minimapDragInitialZoomRef = useRef(0);
  const minimapWasDraggedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadWaveform = async () => {
      if (!source?.url) {
        setPeaks([]); setWaveError(''); setDurationSec(0);
        setSampleRate(0); setChannels(0); setSizeBytes(0);
        return;
      }

      setLoading(true);
      setWaveError('');

      try {
        const response = await fetch(source.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const rawBuffer = await response.arrayBuffer();
        const AudioContextCtor = window.AudioContext;
        if (!AudioContextCtor) throw new Error('AudioContext no disponible en este navegador.');

        const audioContext = new AudioContextCtor();
        const audioBuffer = await audioContext.decodeAudioData(rawBuffer.slice(0));
        await audioContext.close();

        if (!cancelled) {
          setPeaks(buildWaveformPeaks(audioBuffer, waveformBarCount));
          setDurationSec(audioBuffer.duration);
          setSampleRate(audioBuffer.sampleRate);
          setChannels(audioBuffer.numberOfChannels);
          setSizeBytes(source.sizeBytes ?? rawBuffer.byteLength);
        }
      } catch (err) {
        if (!cancelled) setWaveError(formatRequestError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadWaveform();

    return () => { cancelled = true; };
    // source?.url is the only dependency that should trigger re-decode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.url]);

  return (
    <article className="wave-preview-card" style={{ ['--wave-accent' as string]: color }}>
      <h3>{title}</h3>
      <div className="wave-preview-header">
        <span className={`wave-role-badge ${comparisonLabel.toLowerCase() === 'original' ? 'wave-role-badge-original' : 'wave-role-badge-quantized'}`}>
          {comparisonBadgeLabel}
        </span>
        <span className="wave-grid-summary">{musicalGridLabel}</span>
      </div>

      {!source && <p className="wave-placeholder">No hay signed URL disponible todavía para este archivo.</p>}

      {source && (
        <>
          <p className="wave-filename">{source.label}</p>

          <audio
            className="wave-metadata-audio"
            src={source.url}
            preload="metadata"
            onLoadedMetadata={(event) => {
              const d = event.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) { setDurationSec(d); onDurationMeasured?.(d); }
            }}
          />

          {loading && (
            <p className="section-state wave-analyzing-state" aria-live="polite">
              Analizando onda
              <span className="wave-analyzing-dots" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </p>
          )}
          {!loading && waveError && <p className="status-error">No se pudo dibujar la onda: {waveError}</p>}

          {!loading && peaks.length > 0 && (
            <>
              <audio
                ref={audioRef}
                className="wave-metadata-audio"
                src={source.url}
                preload="auto"
                onLoadedMetadata={(event) => {
                  const d = event.currentTarget.duration;
                  if (Number.isFinite(d) && d > 0) {
                    setDurationSec(d);
                    syncPlaybackPosition(0);
                    onDurationMeasured?.(d);
                  }
                }}
                onPlay={() => {
                  setIsPlaying(true);
                  if (activePlaybackHandle && activePlaybackHandle.id !== playerId) {
                    activePlaybackHandle.pause();
                  }
                  activePlaybackHandle = {
                    id: playerId,
                    groupId: syncGroupId,
                    pause: () => {
                      const audio = audioRef.current;
                      if (audio) {
                        audio.pause();
                      }
                    },
                    getCurrentTime: () => audioRef.current?.currentTime ?? 0,
                    getViewportProgress: () => {
                      const viewport = waveViewportRef.current;
                      if (!viewport) {
                        return null;
                      }

                      const scrollable = viewport.scrollWidth - viewport.clientWidth;
                      if (scrollable <= 0) {
                        return 0;
                      }

                      return Math.min(1, Math.max(0, viewport.scrollLeft / scrollable));
                    },
                    isPlaying: () => Boolean(audioRef.current && !audioRef.current.paused),
                  };
                  startMetronome();
                }}
                onPause={() => {
                  setIsPlaying(false);
                  stopMetronome();
                  if (activePlaybackHandle?.id === playerId) {
                    activePlaybackHandle = null;
                  }
                }}
                onTimeUpdate={(event) => syncPlaybackPosition(event.currentTarget.currentTime)}
                onSeeked={(event) => {
                  const timeSec = event.currentTarget.currentTime;
                  syncPlaybackPosition(timeSec);
                  if (!event.currentTarget.paused && metronomeEnabled) {
                    startMetronome(timeSec);
                  }
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  stopMetronome();
                  syncPlaybackPosition(0);
                  if (activePlaybackHandle?.id === playerId) {
                    activePlaybackHandle = null;
                  }
                }}
              />
              <div className="wave-meta-grid">
                <span>Duración: {formatAudioDuration(durationSec)}</span>
                <span>Sample rate: {sampleRate || 'N/D'} Hz</span>
                <span>Canales: {channels || 'N/D'}</span>
                <span>Tamaño: {formatSizeLabel(sizeBytes || null)}</span>
              </div>

              <div className="wave-playback-controls">
                <button type="button" className="wave-playback-button" onClick={togglePlayback} disabled={!source?.url}>
                  {isPlaying ? 'Pausa' : 'Play'}
                </button>
                <button type="button" className="wave-playback-step-button" onClick={() => seekBySeconds(-5)} disabled={!source?.url}>
                  -5s
                </button>
                <button type="button" className="wave-playback-step-button" onClick={() => seekBySeconds(5)} disabled={!source?.url}>
                  +5s
                </button>
                <button
                  type="button"
                  className={`wave-metronome-button ${metronomeEnabled ? 'wave-metronome-button-active' : ''}`}
                  onClick={() => setMetronomeEnabled((previous) => !previous)}
                  disabled={!canUseMetronome}
                  title={canUseMetronome ? 'Activa o desactiva el metronomo' : 'Metronomo no disponible sin BPM'}
                >
                  {metronomeEnabled ? 'Metronomo ON' : 'Metronomo OFF'}
                </button>
                <button
                  type="button"
                  className={`wave-follow-button ${followPlaybackEnabled ? 'wave-follow-button-active' : ''}`}
                  onClick={() => onFollowPlaybackEnabledChange(!followPlaybackEnabled)}
                  title="Seguimiento automatico del cursor durante reproduccion"
                >
                  {followPlaybackEnabled ? 'Seguimiento ON' : 'Seguimiento OFF'}
                </button>
                <label className="wave-follow-sensitivity-control" title="Sensibilidad del seguimiento automatico">
                  <span>Seg {followSensitivityPct}%</span>
                  <input
                    type="range"
                    min={20}
                    max={45}
                    step={1}
                    value={followSensitivityPct}
                    onChange={(event) => onFollowSensitivityPctChange(Number(event.target.value))}
                    disabled={!followPlaybackEnabled}
                  />
                </label>
                <label className="wave-metronome-offset-control" title="Calibracion fina de latencia del metronomo">
                  <span>Offset {metronomeOffsetMs} ms</span>
                  <input
                    type="range"
                    min={-30}
                    max={30}
                    step={1}
                    value={metronomeOffsetMs}
                    onChange={(event) => setMetronomeOffsetMs(Number(event.target.value))}
                    disabled={!canUseMetronome}
                  />
                  <button
                    type="button"
                    className="wave-metronome-offset-reset"
                    onClick={() => setMetronomeOffsetMs(0)}
                    disabled={!canUseMetronome || metronomeOffsetMs === 0}
                  >
                    Reset
                  </button>
                </label>
                <span className="wave-playback-time">{playbackClockLabel}</span>
              </div>

              <div className="wave-playback-track">
                <div className="wave-playback-track-fill" style={{ width: `${playbackPercent}%` }} />
                <span className="wave-playback-thumb" style={{ left: `${playbackPercent}%` }} aria-hidden="true" />
                <div
                  className="wave-playback-scrub-zone"
                  onPointerDown={(event) => {
                    isScrubbingPlaybackRef.current = true;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    seekToRatio(getPlaybackTrackRatio(event));
                  }}
                  onPointerMove={(event) => {
                    if (!isScrubbingPlaybackRef.current) {
                      return;
                    }
                    seekToRatio(getPlaybackTrackRatio(event));
                  }}
                  onPointerUp={(event) => {
                    isScrubbingPlaybackRef.current = false;
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                  }}
                  onPointerCancel={() => {
                    isScrubbingPlaybackRef.current = false;
                  }}
                  title="Arrastra para mover la reproducción"
                />
              </div>

              {/* Scrollable + zoomable waveform viewport */}
              <div
                ref={waveViewportRef}
                className="wave-viewport-scrollable"
                onScroll={syncWindow}
              >
                <div
                  className="wave-bars-grid"
                  style={{ width: waveContentWidth }}
                  role="img"
                  aria-label={`Forma de onda ${title}`}
                >
                  <div className="wave-markers-grid">
                    {beatMarkerPositions.map((marker, index) => (
                      <span
                        key={`${title}-beat-${index}`}
                        className={`wave-marker wave-marker-beat ${index % beatsPerBar === 0 ? 'wave-marker-beat-accent' : ''}`}
                        style={{ left: `${marker}%` }}
                        title={`beat ${index + 1}`}
                      />
                    ))}
                    {barMarkerPositions.map((marker, index) => (
                      <span
                        key={`${title}-bar-${index}`}
                        className="wave-marker wave-marker-bar"
                        style={{ left: `${marker}%` }}
                        title={`bar ${index + 1}`}
                      />
                    ))}
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
                    {/* Cursor on zoomed waveform */}
                    <span ref={cursorWaveRef} className="wave-cursor-line" style={{ left: '0%' }} aria-hidden="true" />
                  </div>

                  <svg
                    className="waveform-svg"
                    viewBox="0 0 1000 200"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id={`wave-gradient-${title.replace(/[^a-z0-9]+/gi, '-')}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.95" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.22" />
                      </linearGradient>
                    </defs>
                    <path d={waveformPath} fill={`url(#wave-gradient-${title.replace(/[^a-z0-9]+/gi, '-')})`} />
                    <path d={waveformPath} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" opacity="0.95" />
                    <line x1="0" y1="100" x2="1000" y2="100" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
                  </svg>
                </div>
              </div>
            </>
          )}

          {/* Minimap strip – always 100% width, drag to pan + wheel to zoom */}
          <div className="timeline-zoom-strip">
            <div className="timeline-zoom-strip-label">
              <span>zoom x{zoomLevel.toFixed(1)} · click = zoom · bordes = zoom · centro = pan · grid musical basada en BPM</span>
              <span ref={cursorLabelRef}>–</span>
            </div>
            <p className="timeline-minimap-help">Ajusta la onda: clic en Bar para enfocar, bordes para zoom, centro para mover.</p>
            <div className="timeline-beat-guide" aria-hidden="true">
              {beatMarkerPositions.map((marker, index) => {
                if (index % beatGuideStride !== 0) {
                  return null;
                }

                const isAccent = index % beatsPerBar === 0;
                return (
                  <span
                    key={`${title}-timeline-beat-${index}`}
                    className={`timeline-beat-guide-marker ${isAccent ? 'timeline-beat-guide-marker-accent' : ''}`}
                    style={{ left: `${marker}%` }}
                    data-label={isAccent ? `${Math.floor(index / beatsPerBar) + 1}` : undefined}
                  />
                );
              })}
            </div>
            <div className="timeline-bar-labels">
              {barMarkerPositions.length > 0 ? (
                barMarkerPositions.map((marker, index) => {
                  if (index % timelineBarLabelStride !== 0) {
                    return null;
                  }

                  return (
                    <button
                      type="button"
                      key={`${title}-bar-label-${index}`}
                      className="timeline-bar-label timeline-bar-label-major"
                      style={{ left: `${marker}%` }}
                      onClick={() => handleBarLabelFocus(marker, barMarkerPositions.length)}
                      title={`Enfocar Bar ${index + 1}`}
                    >
                      {`Bar ${index + 1}`}
                    </button>
                  );
                })
              ) : gridSec && gridSec.length > 0 ? (
                gridSec.map((marker, index) => {
                  if (index % timelineBarLabelStride !== 0) {
                    return null;
                  }
                  const isBar = index % 4 === 0;
                  return (
                    <button
                      type="button"
                      key={`${title}-bar-label-${index}`}
                      className={`timeline-bar-label ${isBar ? 'timeline-bar-label-major' : 'timeline-bar-label-minor'}`}
                      style={{ left: `${gridMarkerPositions[index] || 0}%` }}
                      onClick={() => handleBarLabelFocus(gridMarkerPositions[index] || 0, gridSec.length)}
                      title={isBar ? `Enfocar Bar ${Math.floor(index / 4) + 1}` : `Enfocar pulso ${(index % 4) + 1}`}
                    >
                      {isBar ? `Bar ${Math.floor(index / 4) + 1}` : `${(index % 4) + 1}`}
                    </button>
                  );
                })
              ) : (
                <span className="timeline-bar-label timeline-bar-label-empty">Sin grid detectado</span>
              )}
            </div>
            {/* Minimap: fixed 100%, viewport window indicator shows current zoom/scroll */}
            <div
              className="timeline-minimap"
              onClick={handleMinimapClick}
              onMouseMove={handleMinimapMouseMove}
              onPointerDown={(e) => {
                isDraggingMinimap.current = true;
                minimapWasDraggedRef.current = false; // Reset drag flag for new interaction
                const zone = getMinimapZoneInfo(e);
                minimapDragModeRef.current = zone.isBorderZone ? 'zoom' : 'pan';
                minimapDragStartXRef.current = e.clientX;
                minimapDragInitialZoomRef.current = zoomLevel; // Save current zoom level
                e.currentTarget.setPointerCapture(e.pointerId);
                applyCursor(zone.ratio);
              }}
              onPointerMove={(e) => {
                if (!isDraggingMinimap.current || !minimapDragModeRef.current) return;
                const zone = getMinimapZoneInfo(e);
                const dragDelta = Math.abs(e.clientX - minimapDragStartXRef.current);
                
                // Mark as dragged if we've moved at least 3px
                if (dragDelta > 3) {
                  minimapWasDraggedRef.current = true;
                }
                
                applyCursor(zone.ratio);
                if (minimapDragModeRef.current === 'pan') {
                  panWaveformTo(zone.ratio);
                } else {
                  // Zoom mode: proportional to total drag distance (Ableton-style)
                  const totalDeltaX = e.clientX - minimapDragStartXRef.current;
                  const sensitivity = 300; // 300px of drag = 1x zoom multiplier
                  const zoomMultiplier = 1 + totalDeltaX / sensitivity;
                  const newZoom = Math.min(6, Math.max(0.5, Number((minimapDragInitialZoomRef.current * zoomMultiplier).toFixed(2))));
                  onZoomChange?.(newZoom);
                }
              }}
              onPointerUp={(e) => {
                isDraggingMinimap.current = false;
                minimapDragModeRef.current = null;
                // If no drag detected, reset flag for next interaction
                if (!minimapWasDraggedRef.current) {
                  minimapWasDraggedRef.current = false;
                }
                if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => { 
                isDraggingMinimap.current = false;
                minimapDragModeRef.current = null;
                minimapWasDraggedRef.current = false;
              }}
            >
              {/* Viewport window – updated via ref to avoid re-renders */}
              <div ref={minimapWindowRef} className="timeline-minimap-window" />
              {Array.from({ length: 48 }, (_, index) => (
                <span key={`${title}-tick-${index}`} className="timeline-tick" style={{ left: `${(index / 47) * 100}%` }} />
              ))}
              {gridMarkerPositions.map((marker, index) => (
                <span
                  key={`${title}-grid-timeline-${index}`}
                  className="timeline-marker timeline-marker-grid"
                  style={{ left: `${marker}%` }}
                  title={`grid_sec ${formatWaveMarkerLabel((gridSec || [])[index] || 0)}`}
                />
              ))}
              {eventMarkerPositions.map((marker, index) => (
                <span
                  key={`${title}-event-timeline-${index}`}
                  className="timeline-marker timeline-marker-event"
                  style={{ left: `${marker}%` }}
                  title={`quantized_event ${formatWaveMarkerLabel((quantizedEvents || [])[index] || 0)}`}
                />
              ))}
              <span ref={cursorMinimapRef} className="timeline-cursor" style={{ left: '0%' }} aria-hidden="true" />
            </div>
          </div>
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
  const [hydratingTrackKeys, setHydratingTrackKeys] = useState<Record<string, boolean>>({});

  const [singleResult, setSingleResult] = useState<Record<string, unknown> | null>(null);
  const [batchResult, setBatchResult] = useState<Record<string, unknown> | null>(null);
  const [latestQuantizationResult, setLatestQuantizationResult] = useState<Record<string, unknown> | null>(() => {
    try {
      const stored = window.localStorage.getItem(LAST_QUANTIZATION_RESULT_STORAGE_KEY);
      if (!stored) {
        return null;
      }

      const parsed = JSON.parse(stored);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [comparisonZoom, setComparisonZoom] = useState(1.5);
  const [followPlaybackEnabled, setFollowPlaybackEnabled] = useState(() => {
    try {
      const stored = window.localStorage.getItem(PLAYHEAD_FOLLOW_STORAGE_KEY);
      if (!stored) {
        return true;
      }

      return stored === '1';
    } catch {
      return true;
    }
  });
  const [followSensitivityPct, setFollowSensitivityPct] = useState(() => {
    try {
      const stored = window.localStorage.getItem(PLAYHEAD_FOLLOW_SENSITIVITY_STORAGE_KEY);
      if (!stored) {
        return 28;
      }

      const parsed = Number(stored);
      if (!Number.isFinite(parsed)) {
        return 28;
      }

      return Math.min(45, Math.max(20, Math.round(parsed)));
    } catch {
      return 28;
    }
  });
  const comparisonItems = useMemo(() => groupCloudFiles(cloudFiles), [cloudFiles]);
  const quantizationSummary = useMemo(
    () => (latestQuantizationResult ? readQuantizationDetailSummary(latestQuantizationResult) : null),
    [latestQuantizationResult],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(PLAYHEAD_FOLLOW_STORAGE_KEY, followPlaybackEnabled ? '1' : '0');
    } catch {
      // Ignore storage failures.
    }
  }, [followPlaybackEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PLAYHEAD_FOLLOW_SENSITIVITY_STORAGE_KEY, String(followSensitivityPct));
    } catch {
      // Ignore storage failures.
    }
  }, [followSensitivityPct]);

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

  const cacheTemporaryFileSignedUrl = (name: string, signedUrl: string) => {
    setCloudFiles((previousFiles) =>
      previousFiles.map((previousFile) => (previousFile.name === name ? { ...previousFile, signedUrl } : previousFile)),
    );
  };

  const hydrateComparisonItem = async (item: ComparisonItem) => {
    if (hydratingTrackKeys[item.trackKey]) {
      return;
    }

    setHydratingTrackKeys((previous) => ({ ...previous, [item.trackKey]: true }));

    try {
      const filesToHydrate = [item.original, item.quantized].filter(Boolean) as CloudFile[];
      for (const file of filesToHydrate) {
        if (!file.signedUrl) {
          const signedUrl = await resolveTemporaryFileUrl(file);
          cacheTemporaryFileSignedUrl(file.name, signedUrl);
        }
      }
    } catch (requestError) {
      setCloudFilesError(`No se pudieron preparar los audios de ${item.trackKey}: ${formatRequestError(requestError)}`);
    } finally {
      setHydratingTrackKeys((previous) => {
        const next = { ...previous };
        delete next[item.trackKey];
        return next;
      });
    }
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

  const renderCloudFileCell = (
    label: string,
    file: CloudFile | undefined,
    accentClassName: string,
    syncGroupId: string,
    summary: QuantizationDetailSummary | null,
  ) => {
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
          <WaveformPreviewCard
            title={`Wave panel ${label}`}
            color={label.toLowerCase() === 'original' ? '#38bdf8' : '#c084fc'}
            comparisonLabel={label}
            playerId={`${label}-${file.name}`}
            syncGroupId={syncGroupId}
            followPlaybackEnabled={followPlaybackEnabled}
            onFollowPlaybackEnabledChange={setFollowPlaybackEnabled}
            followSensitivityPct={followSensitivityPct}
            onFollowSensitivityPctChange={setFollowSensitivityPct}
            source={audioSource ? { label: file.name, url: audioSource, sizeBytes: file.size } : null}
            gridSec={summary?.gridSec}
            quantizedEvents={summary?.quantizedEvents}
            detectedBpm={summary?.detectedBpm}
            effectiveBpm={summary?.effectiveBpm}
            timeSignature={summary?.timeSignature}
            gridSubdivision={summary?.gridSubdivision}
            zoomLevel={comparisonZoom}
            onZoomChange={setComparisonZoom}
          />
        </div>
        <div className="cloud-file-actions">
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
        triggerDownload(blob, filename);
        setMessage('Render WAV descargado correctamente.');
        await refreshTemporaryFiles();
        return;
      } else if (isJsonResponse(response)) {
        const json = (await response.json()) as Record<string, unknown>;
        console.log('Respuesta JSON recibida:', json);
        setSingleResult(json);
        setLatestQuantizationResult(json);
        try {
          window.localStorage.setItem(LAST_QUANTIZATION_RESULT_STORAGE_KEY, JSON.stringify(json));
        } catch {
          // Ignore storage failures.
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
      try {
        window.localStorage.setItem(LAST_QUANTIZATION_RESULT_STORAGE_KEY, JSON.stringify(json));
      } catch {
        // Ignore storage failures.
      }
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
          <p className="field-help">forceGridSubdivision: fija la subdivisión de la rejilla y evita auto-detección. La subdivisión es el valor musical por pulso, por ejemplo 8 o 16; el compás es timeSignature, por ejemplo 4/4 o 3/4.</p>

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

      <section className="quantize-panel temp-files-panel">
        <h2>Comparación Before / After</h2>
        <p>Los archivos se eliminan automáticamente después de 24 horas.</p>
        <div className="comparison-zoom-controls">
          <button type="button" onClick={() => setComparisonZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}>
            Zoom out
          </button>
          <button type="button" onClick={() => setComparisonZoom((value) => Math.min(6, Number((value + 0.25).toFixed(2))))}>
            Zoom in
          </button>
          <button type="button" onClick={() => setComparisonZoom(1.5)}>
            Reset
          </button>
        </div>

        {gcsConfigured === false && <p className="section-state">GCS no está configurado todavía. Cuando se habilite, aquí aparecerán los pares de audio.</p>}
        {gcsConfigured !== false && cloudFilesLoading && <p className="section-state">Cargando archivos en la nube...</p>}
        {gcsConfigured !== false && !cloudFilesLoading && cloudFilesError && <p className="status-error">{cloudFilesError}</p>}

        {gcsConfigured !== false && !cloudFilesLoading && !cloudFilesError && comparisonItems.length === 0 && (
          <p className="section-state empty-state">No hay archivos disponibles.</p>
        )}

        {gcsConfigured !== false && !cloudFilesLoading && !cloudFilesError && comparisonItems.length > 0 && (
          <div className="cloud-files-list">
            {comparisonItems.map((item) => (
              (() => {
                const itemSummary =
                  readQuantizationSummaryFromCloudFile(item.quantized)
                  || readQuantizationSummaryFromCloudFile(item.original)
                  || quantizationSummary;

                return (
                  <details
                    key={item.trackKey}
                    className="cloud-file-group"
                    onToggle={(event) => {
                      if (event.currentTarget.open) {
                        void hydrateComparisonItem(item);
                      }
                    }}
                  >
                    <summary className="cloud-file-group-summary">
                      <div>
                        <p className="cloud-file-group-label">trackName</p>
                        <h3>{item.trackKey}</h3>
                      </div>
                      <span className={`cloud-file-group-badge cloud-file-group-badge-${item.status}`}>
                        {item.status === 'complete' ? 'Complete' : 'Pending pair'}
                      </span>
                    </summary>

                    <div className="cloud-file-columns">
                      <div className="cloud-file-column">
                        {renderCloudFileCell('Original', item.original, 'cloud-file-original', item.trackKey, itemSummary)}
                      </div>
                      <div className="cloud-file-column">
                        {renderCloudFileCell('Quantized', item.quantized, 'cloud-file-quantized', item.trackKey, itemSummary)}
                      </div>
                    </div>

                    {hydratingTrackKeys[item.trackKey] && <p className="section-state">Preparando signed URLs...</p>}
                  </details>
                );
              })()
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
