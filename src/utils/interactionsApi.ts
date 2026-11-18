import type {
  BrandProfile,
  JingleStyleId,
  MusicEngineId,
  StoryboardFrame,
  VideoEngineId,
} from '../types/campaign';
import { isValidGeminiKeyFormat } from './copyGenerator';

export type { MusicEngineId, VideoEngineId } from '../types/campaign';

export type AudioFileExtension = 'mp3' | 'wav' | 'ogg' | 'm4a';
export type VideoFileExtension = 'mp4' | 'webm';

export const INTERACTIONS_ENDPOINT = [
  'https:/',
  'generativelanguage.googleapis.com',
  'v1beta',
  'interactions',
].join('/');

const DEFAULT_AUDIO_TIMEOUT_MS = 25_000;
const DEFAULT_VIDEO_TIMEOUT_MS = 35_000;

export type InteractionsMediaResult<Ext extends string> =
  | {
      ok: true;
      blob: Blob;
      mimeType: string;
      fileExtension: Ext;
    }
  | {
      ok: false;
      reason: string;
      status?: number;
    };

export function hasLiveApiAccess(isDemoMode: boolean, byokKey: string): boolean {
  return !isDemoMode && isValidGeminiKeyFormat(byokKey);
}

export function getDefaultMusicEngine(
  isDemoMode: boolean,
  byokKey: string
): MusicEngineId {
  return hasLiveApiAccess(isDemoMode, byokKey) ? 'lyria-3-clip-preview' : 'local';
}

export function getDefaultVideoEngine(
  isDemoMode: boolean,
  byokKey: string
): VideoEngineId {
  return hasLiveApiAccess(isDemoMode, byokKey) ? 'gemini-omni-1.2-flash' : 'local';
}

const STYLE_PROMPT_GUIDES: Record<JingleStyleId, string> = {
  'pop-ceria': 'Upbeat Malaysian retail pop (124 BPM), bright synth arpeggios, catchy chorus vocal hook',
  'santai-akustik': 'Warm acoustic chill (90 BPM), gentle guitar strums, friendly approachable Malaysian vocal',
  'korporat-segar': 'Fresh modern corporate (108 BPM), crisp marimba & clean groove, confident polished vocal',
};

export function buildLyriaJinglePrompt(params: {
  brand: BrandProfile;
  offerSentence: string;
  style: JingleStyleId;
  lyrics: string;
}): string {
  const brandName = params.brand.name.trim() || 'Bisnes Saya';
  const offer = params.offerSentence.trim() || 'Promosi istimewa minggu ini';
  const toneLabel =
    params.brand.tone === 'casual'
      ? 'Casual, warm, Malaysian SME friendly'
      : 'Professional, polished, trustworthy corporate Malaysian SME';
  const styleGuide = STYLE_PROMPT_GUIDES[params.style] ?? STYLE_PROMPT_GUIDES['pop-ceria'];
  const cleanLyrics = params.lyrics.trim();

  return [
    'Create a short commercial advertising jingle in Bahasa Melayu (<= 30 seconds).',
    `Brand: ${brandName}`,
    `Tone: ${toneLabel}`,
    `Campaign Offer: ${offer}`,
    `Musical Style: ${styleGuide}`,
    'Sing/deliver these exact Bahasa Melayu chorus lyrics clearly:',
    cleanLyrics,
  ].join('\n');
}

export function buildVideoStoryboardPrompt(params: {
  brand: BrandProfile;
  offerSentence: string;
  jingleStyle: JingleStyleId;
  frames: StoryboardFrame[];
}): string {
  const brandName = params.brand.name.trim() || 'Bisnes Saya';
  const offer = params.offerSentence.trim() || 'Promosi istimewa minggu ini';
  const toneLabel =
    params.brand.tone === 'casual'
      ? 'Santai & mesra (Casual Malaysian SME)'
      : 'Profesional & korporat (Professional Malaysian SME)';
  const styleGuide = STYLE_PROMPT_GUIDES[params.jingleStyle] ?? STYLE_PROMPT_GUIDES['pop-ceria'];

  const frameLines = params.frames.map(
    (frame, idx) =>
      `Scene ${idx + 1} (${frame.startSec.toFixed(2)}s-${frame.endSec.toFixed(2)}s): Headline "${frame.overlayHeadline.trim()}" | Caption/Lyric "${frame.lyricLine.trim()}"`
  );

  return [
    'Generate a crisp 9:16 vertical short-form social ad video (6 seconds, 720p) for TikTok, Instagram Reels, and YouTube Shorts with synchronized native music/audio.',
    `Brand: ${brandName}`,
    `Primary Theme Color: ${params.brand.themeColor}`,
    `Tone: ${toneLabel}`,
    `Offer: ${offer}`,
    `Audio Mood: ${styleGuide}`,
    'Keep key titles inside 9:16 social safe zones (avoid top/bottom edge clipping).',
    'Confirmed 4-Frame Storyboard:',
    ...frameLines,
  ].join('\n');
}

function normalizeAudioMimeAndExt(rawMime?: string | null): {
  mimeType: string;
  fileExtension: AudioFileExtension;
} {
  const lower = (rawMime ?? '').trim().toLowerCase().split(';')[0] ?? '';
  if (lower.includes('wav')) {
    return { mimeType: 'audio/wav', fileExtension: 'wav' };
  }
  if (lower.includes('ogg')) {
    return { mimeType: 'audio/ogg', fileExtension: 'ogg' };
  }
  if (lower.includes('mp4') || lower.includes('aac') || lower.includes('m4a')) {
    return { mimeType: lower || 'audio/mp4', fileExtension: 'm4a' };
  }
  if (lower.startsWith('audio/')) {
    return {
      mimeType: lower === 'audio/mp3' ? 'audio/mpeg' : lower,
      fileExtension: 'mp3',
    };
  }
  return { mimeType: 'audio/mpeg', fileExtension: 'mp3' };
}

function normalizeVideoMimeAndExt(rawMime?: string | null): {
  mimeType: string;
  fileExtension: VideoFileExtension;
} {
  const lower = (rawMime ?? '').trim().toLowerCase().split(';')[0] ?? '';
  if (lower.includes('webm')) {
    return { mimeType: 'video/webm', fileExtension: 'webm' };
  }
  if (lower.startsWith('video/')) {
    return { mimeType: lower, fileExtension: 'mp4' };
  }
  return { mimeType: 'video/mp4', fileExtension: 'mp4' };
}

function decodeBase64ToBytes(raw: string): { bytes: Uint8Array; inlineMime?: string } | null {
  if (typeof raw !== 'string') return null;
  let cleaned = raw.trim();
  let inlineMime: string | undefined;

  const dataUriMatch = /^data:([^;,]+)(?:;[^;,]*)*;base64,(.*)$/i.exec(cleaned);
  if (dataUriMatch) {
    inlineMime = dataUriMatch[1]?.trim();
    cleaned = dataUriMatch[2] ?? '';
  }

  cleaned = cleaned.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!cleaned) return null;

  const mod = cleaned.length % 4;
  if (mod === 1) return null;
  if (mod === 2) cleaned += '==';
  else if (mod === 3) cleaned += '=';

  try {
    const binary = atob(cleaned);
    if (binary.length === 0) return null;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { bytes, inlineMime };
  } catch {
    return null;
  }
}

function isTrustedGoogleMediaHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'generativelanguage.googleapis.com' ||
    host.endsWith('.googleapis.com') ||
    host.endsWith('.googleusercontent.com')
  );
}

interface ExtractedMediaCandidate {
  base64Data?: string;
  mimeType?: string;
  uri?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function extractInlineCandidate(
  node: unknown,
  kind: 'audio' | 'video',
  allowBareData: boolean
): ExtractedMediaCandidate | null {
  const rec = asRecord(node);
  if (!rec) return null;

  const inlineObj = asRecord(rec.inlineData) ?? asRecord(rec.inline_data);
  if (inlineObj && typeof inlineObj.data === 'string' && inlineObj.data.trim()) {
    const mime =
      (typeof inlineObj.mimeType === 'string' && inlineObj.mimeType) ||
      (typeof inlineObj.mime_type === 'string' && inlineObj.mime_type) ||
      undefined;
    if (!mime || mime.toLowerCase().startsWith(`${kind}/`) || allowBareData) {
      return { base64Data: inlineObj.data, mimeType: mime };
    }
  }

  const nestedKindObj = asRecord(rec[kind]);
  if (nestedKindObj) {
    const nested = extractInlineCandidate(nestedKindObj, kind, true);
    if (nested) return nested;
  }

  const rawMime =
    (typeof rec.mimeType === 'string' && rec.mimeType) ||
    (typeof rec.mime_type === 'string' && rec.mime_type) ||
    undefined;
  const rawType = typeof rec.type === 'string' ? rec.type.toLowerCase() : '';
  const matchesKind =
    allowBareData ||
    rawType === kind ||
    (rawMime !== undefined && rawMime.toLowerCase().startsWith(`${kind}/`));

  if (matchesKind && typeof rec.data === 'string' && rec.data.trim()) {
    return { base64Data: rec.data, mimeType: rawMime };
  }

  const uri =
    (typeof rec.uri === 'string' && rec.uri.trim()) ||
    (typeof rec.file_uri === 'string' && rec.file_uri.trim()) ||
    (typeof rec.url === 'string' && rec.url.trim()) ||
    undefined;

  if (uri && (matchesKind || uri.startsWith(`data:${kind}/`))) {
    return { uri, mimeType: rawMime };
  }

  return null;
}

function collectMediaCandidates(
  json: unknown,
  kind: 'audio' | 'video'
): ExtractedMediaCandidate[] {
  const root = asRecord(json);
  if (!root) return [];

  const candidates: ExtractedMediaCandidate[] = [];
  const primaryKey = kind === 'audio' ? 'output_audio' : 'output_video';
  const altPrimaryKey = kind === 'audio' ? 'outputAudio' : 'outputVideo';

  for (const key of [primaryKey, altPrimaryKey]) {
    const primary = root[key];
    if (typeof primary === 'string' && primary.trim()) {
      candidates.push({ base64Data: primary });
    } else {
      const hit = extractInlineCandidate(primary, kind, true);
      if (hit) candidates.push(hit);
    }
  }

  const visitContainer = (item: unknown, allowBareData: boolean) => {
    const rec = asRecord(item);
    if (!rec) return;

    const direct = extractInlineCandidate(rec, kind, allowBareData);
    if (direct) {
      candidates.push(direct);
    }

    for (const nestedListKey of ['outputs', 'parts', 'content', 'steps']) {
      const nestedList = rec[nestedListKey];
      if (Array.isArray(nestedList)) {
        for (const child of nestedList) {
          visitContainer(child, allowBareData);
        }
      } else if (asRecord(nestedList)) {
        visitContainer(nestedList, allowBareData);
      }
    }

    if (rec.output !== undefined) {
      visitContainer(rec.output, allowBareData);
    }
    if (rec.content !== undefined && asRecord(rec.content)) {
      visitContainer(rec.content, allowBareData);
    }
  };

  for (const arrayKey of ['outputs', 'steps', 'candidates']) {
    const list = root[arrayKey];
    if (Array.isArray(list)) {
      for (const item of list) {
        visitContainer(item, false);
      }
    }
  }

  if (root.output !== undefined) {
    visitContainer(root.output, false);
  }

  return candidates;
}

async function resolveUriToBlob(
  uri: string,
  expectedKind: 'audio' | 'video',
  apiKey: string,
  signal: AbortSignal
): Promise<{ blob: Blob; mimeType?: string } | null> {
  const trimmed = uri.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:')) {
    const decoded = decodeBase64ToBytes(trimmed);
    if (!decoded) return null;
    if (decoded.inlineMime && !decoded.inlineMime.toLowerCase().startsWith(`${expectedKind}/`)) {
      return null;
    }
    const mime =
      decoded.inlineMime || (expectedKind === 'audio' ? 'audio/mpeg' : 'video/mp4');
    const copy = new Uint8Array(decoded.bytes);
    return { blob: new Blob([copy], { type: mime }), mimeType: mime };
  }

  const isSameOriginRelative = trimmed.startsWith('/') && !trimmed.startsWith('//');
  const isBlobUri = trimmed.startsWith('blob:');

  let fetchHeaders: Record<string, string> | undefined;
  if (!isSameOriginRelative && !isBlobUri) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }

    if (parsed.protocol !== 'https:' || !isTrustedGoogleMediaHost(parsed.hostname)) {
      return null;
    }

    if (parsed.hostname.toLowerCase() === 'generativelanguage.googleapis.com') {
      fetchHeaders = { 'x-goog-api-key': apiKey.trim() };
    }
  }

  try {
    const response = await fetch(trimmed, {
      method: 'GET',
      headers: fetchHeaders,
      signal,
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob || blob.size === 0) return null;
    const mime = blob.type || response.headers.get('content-type') || undefined;
    if (mime && (mime.startsWith('text/html') || mime.startsWith('application/json'))) {
      return null;
    }
    return { blob, mimeType: mime };
  } catch {
    return null;
  }
}

async function resolveCandidatesToMedia<Ext extends string>(
  candidates: ExtractedMediaCandidate[],
  kind: 'audio' | 'video',
  apiKey: string,
  signal: AbortSignal,
  normalizeFn: (mime?: string | null) => { mimeType: string; fileExtension: Ext }
): Promise<InteractionsMediaResult<Ext>> {
  for (const candidate of candidates) {
    if (candidate.base64Data) {
      const decoded = decodeBase64ToBytes(candidate.base64Data);
      if (decoded && decoded.bytes.length > 0) {
        const { mimeType, fileExtension } = normalizeFn(
          candidate.mimeType ?? decoded.inlineMime
        );
        const copy = new Uint8Array(decoded.bytes);
        const blob = new Blob([copy], { type: mimeType });
        if (blob.size > 0) {
          return { ok: true, blob, mimeType, fileExtension };
        }
      }
    }

    if (candidate.uri) {
      const fetched = await resolveUriToBlob(candidate.uri, kind, apiKey, signal);
      if (fetched && fetched.blob.size > 0) {
        const { mimeType, fileExtension } = normalizeFn(
          candidate.mimeType ?? fetched.mimeType
        );
        const typedBlob =
          fetched.blob.type === mimeType
            ? fetched.blob
            : new Blob([fetched.blob], { type: mimeType });
        return { ok: true, blob: typedBlob, mimeType, fileExtension };
      }
    }
  }

  return {
    ok: false,
    reason: `empty_or_unparseable_${kind}_payload`,
  };
}

function linkAbortController(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number
): {
  controller: AbortController;
  cleanup: () => void;
  wasTimeout: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(100, timeoutMs));

  const cleanup = () => {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  };

  return {
    controller,
    cleanup,
    wasTimeout: () => timedOut,
  };
}

export async function generateLyriaJingleWithInteractions(params: {
  apiKey: string;
  isDemoMode: boolean;
  model: MusicEngineId;
  input: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<InteractionsMediaResult<AudioFileExtension>> {
  if (
    params.isDemoMode ||
    !isValidGeminiKeyFormat(params.apiKey) ||
    params.model === 'local'
  ) {
    return { ok: false, reason: 'local_or_demo_guard' };
  }

  if (params.signal?.aborted) {
    return { ok: false, reason: 'aborted' };
  }

  const { controller, cleanup, wasTimeout } = linkAbortController(
    params.signal,
    params.timeoutMs ?? DEFAULT_AUDIO_TIMEOUT_MS
  );

  try {
    const response = await fetch(INTERACTIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': params.apiKey.trim(),
      },
      body: JSON.stringify({
        model: params.model,
        input: params.input,
        store: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: `http_${response.status}`,
        status: response.status,
      };
    }

    const json: unknown = await response.json();
    const candidates = collectMediaCandidates(json, 'audio');
    return await resolveCandidatesToMedia(
      candidates,
      'audio',
      params.apiKey,
      controller.signal,
      normalizeAudioMimeAndExt
    );
  } catch (err) {
    if (wasTimeout()) {
      return { ok: false, reason: 'timeout' };
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, reason: 'aborted' };
    }
    return {
      ok: false,
      reason: err instanceof Error && err.message ? err.message : 'network_error',
    };
  } finally {
    cleanup();
  }
}

export async function generateVideoWithInteractions(params: {
  apiKey: string;
  isDemoMode: boolean;
  model: VideoEngineId;
  input: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<InteractionsMediaResult<VideoFileExtension>> {
  if (
    params.isDemoMode ||
    !isValidGeminiKeyFormat(params.apiKey) ||
    params.model === 'local'
  ) {
    return { ok: false, reason: 'local_or_demo_guard' };
  }

  if (params.signal?.aborted) {
    return { ok: false, reason: 'aborted' };
  }

  const { controller, cleanup, wasTimeout } = linkAbortController(
    params.signal,
    params.timeoutMs ?? DEFAULT_VIDEO_TIMEOUT_MS
  );

  try {
    const response = await fetch(INTERACTIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': params.apiKey.trim(),
      },
      body: JSON.stringify({
        model: params.model,
        input: params.input,
        store: false,
        response_format: {
          type: 'video',
          duration: '6s',
          resolution: '720p',
          aspect_ratio: '9:16',
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: `http_${response.status}`,
        status: response.status,
      };
    }

    const json: unknown = await response.json();
    const candidates = collectMediaCandidates(json, 'video');
    return await resolveCandidatesToMedia(
      candidates,
      'video',
      params.apiKey,
      controller.signal,
      normalizeVideoMimeAndExt
    );
  } catch (err) {
    if (wasTimeout()) {
      return { ok: false, reason: 'timeout' };
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, reason: 'aborted' };
    }
    return {
      ok: false,
      reason: err instanceof Error && err.message ? err.message : 'network_error',
    };
  } finally {
    cleanup();
  }
}
