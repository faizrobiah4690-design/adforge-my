import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { expect, type Locator, type Page } from '@playwright/test';

export function sha256Hex(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export interface CapturedDownload {
  suggestedFilename: string;
  filePath: string;
  buffer: Buffer;
}

export async function captureDownload(
  page: Page,
  trigger: () => Promise<void>,
  timeoutMs = 25_000,
): Promise<CapturedDownload> {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: timeoutMs }),
    trigger(),
  ]);
  const filePath = await download.path();
  if (!filePath) {
    const failure = await download.failure();
    throw new Error(`Playwright download failed (${download.suggestedFilename()}): ${failure ?? 'no local path'}`);
  }
  const buffer = fs.readFileSync(filePath);
  return {
    suggestedFilename: download.suggestedFilename(),
    filePath,
    buffer,
  };
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

export function createTestPngBuffer(options?: {
  width?: number;
  height?: number;
  rgba?: [number, number, number, number];
  stripeRgba?: [number, number, number, number];
}): Buffer {
  const width = options?.width ?? 64;
  const height = options?.height ?? 64;
  const rgba = options?.rgba ?? [14, 165, 233, 255];
  const stripeRgba = options?.stripeRgba;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowStride = 1 + width * 4;
  const rawScanlines = Buffer.alloc(rowStride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowStride;
    rawScanlines[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const px = stripeRgba && (x + y) % 8 < 4 ? stripeRgba : rgba;
      const off = rowStart + 1 + x * 4;
      rawScanlines[off] = px[0];
      rawScanlines[off + 1] = px[1];
      rawScanlines[off + 2] = px[2];
      rawScanlines[off + 3] = px[3];
    }
  }

  const idatData = zlib.deflateSync(rawScanlines);
  return Buffer.concat([
    PNG_SIGNATURE,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idatData),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export interface ParsedPngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  byteLength: number;
  sha256: string;
  aspectRatio: number;
}

export function parsePngBuffer(buffer: Buffer): ParsedPngInfo {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`Invalid PNG magic signature (length=${buffer.length})`);
  }
  const ihdrLen = buffer.readUInt32BE(8);
  const ihdrType = buffer.toString('ascii', 12, 16);
  if (ihdrType !== 'IHDR' || ihdrLen !== 13) {
    throw new Error(`Invalid PNG IHDR chunk: type=${ihdrType}, len=${ihdrLen}`);
  }
  const expectedCrc = buffer.readUInt32BE(29);
  const actualCrc = crc32(buffer.subarray(12, 29));
  if (expectedCrc !== actualCrc) {
    throw new Error(`PNG IHDR CRC mismatch: expected=${expectedCrc}, actual=${actualCrc}`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid PNG dimensions: ${width}x${height}`);
  }
  return {
    width,
    height,
    bitDepth: buffer[24],
    colorType: buffer[25],
    byteLength: buffer.length,
    sha256: sha256Hex(buffer),
    aspectRatio: width / height,
  };
}

export function assertValidSlidePng(
  buffer: Buffer,
  mode: '9:16' | '4:5',
  options?: { minBytes?: number; requireExactPresetDims?: boolean },
): ParsedPngInfo {
  const info = parsePngBuffer(buffer);
  const minBytes = options?.minBytes ?? 5000;
  expect(info.byteLength, `PNG byte size should exceed ${minBytes}`).toBeGreaterThan(minBytes);

  const expectedWidth = 1080;
  const expectedHeight = mode === '9:16' ? 1920 : 1350;
  const targetRatio = mode === '9:16' ? 9 / 16 : 4 / 5;

  if (options?.requireExactPresetDims ?? true) {
    expect(info.width, `Expected PNG width ${expectedWidth} for ${mode}`).toBe(expectedWidth);
    expect(info.height, `Expected PNG height ${expectedHeight} for ${mode}`).toBe(expectedHeight);
  } else {
    expect(Math.abs(info.aspectRatio - targetRatio)).toBeLessThan(0.02);
  }
  return info;
}

export function assertPngBytesChanged(before: Buffer, after: Buffer, contextLabel = 'PNG export'): void {
  expect(sha256Hex(after), `${contextLabel}: expected SHA-256 bytes to change after edit`).not.toBe(sha256Hex(before));
}

export function assertPngBytesIdentical(first: Buffer, second: Buffer, contextLabel = 'Safe-zone toggle'): void {
  expect(sha256Hex(second), `${contextLabel}: expected SHA-256 bytes to remain identical`).toBe(sha256Hex(first));
}

export interface ParsedWavInfo {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
  durationSec: number;
  rms: number;
  peak: number;
  byteLength: number;
  sha256: string;
}

export function parseWavBuffer(buffer: Buffer): ParsedWavInfo {
  if (
    buffer.length < 44 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error(`Invalid RIFF/WAVE header (len=${buffer.length})`);
  }

  let fmt: {
    audioFormat: number;
    channels: number;
    sampleRate: number;
    byteRate: number;
    blockAlign: number;
    bitsPerSample: number;
  } | null = null;
  let dataOffset = -1;
  let dataSize = 0;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const payloadStart = offset + 8;
    const payloadEnd = Math.min(payloadStart + chunkSize, buffer.length);

    if (chunkId === 'fmt ' && payloadEnd - payloadStart >= 16) {
      fmt = {
        audioFormat: buffer.readUInt16LE(payloadStart),
        channels: buffer.readUInt16LE(payloadStart + 2),
        sampleRate: buffer.readUInt32LE(payloadStart + 4),
        byteRate: buffer.readUInt32LE(payloadStart + 8),
        blockAlign: buffer.readUInt16LE(payloadStart + 12),
        bitsPerSample: buffer.readUInt16LE(payloadStart + 14),
      };
    } else if (chunkId === 'data') {
      dataOffset = payloadStart;
      dataSize = payloadEnd - payloadStart;
    }

    offset = payloadStart + chunkSize + (chunkSize % 2);
  }

  if (!fmt) throw new Error('WAV missing fmt chunk');
  if (dataOffset < 0 || dataSize <= 0) throw new Error('WAV missing or empty data chunk');

  let sumSq = 0;
  let peak = 0;
  let sampleCount = 0;
  const end = dataOffset + dataSize;

  if (fmt.audioFormat === 1 && fmt.bitsPerSample === 16) {
    for (let i = dataOffset; i + 2 <= end; i += 2) {
      const s = buffer.readInt16LE(i) / 32768;
      sumSq += s * s;
      const a = Math.abs(s);
      if (a > peak) peak = a;
      sampleCount++;
    }
  } else if (fmt.audioFormat === 1 && fmt.bitsPerSample === 24) {
    for (let i = dataOffset; i + 3 <= end; i += 3) {
      let val = buffer[i] | (buffer[i + 1] << 8) | (buffer[i + 2] << 16);
      if (val & 0x800000) val |= ~0xffffff;
      const s = val / 8388608;
      sumSq += s * s;
      const a = Math.abs(s);
      if (a > peak) peak = a;
      sampleCount++;
    }
  } else if (fmt.audioFormat === 1 && fmt.bitsPerSample === 32) {
    for (let i = dataOffset; i + 4 <= end; i += 4) {
      const s = buffer.readInt32LE(i) / 2147483648;
      sumSq += s * s;
      const a = Math.abs(s);
      if (a > peak) peak = a;
      sampleCount++;
    }
  } else if (fmt.audioFormat === 3 && fmt.bitsPerSample === 32) {
    for (let i = dataOffset; i + 4 <= end; i += 4) {
      const s = buffer.readFloatLE(i);
      sumSq += s * s;
      const a = Math.abs(s);
      if (a > peak) peak = a;
      sampleCount++;
    }
  } else if (fmt.audioFormat === 1 && fmt.bitsPerSample === 8) {
    for (let i = dataOffset; i < end; i++) {
      const s = (buffer[i] - 128) / 128;
      sumSq += s * s;
      const a = Math.abs(s);
      if (a > peak) peak = a;
      sampleCount++;
    }
  } else {
    throw new Error(`Unsupported WAV PCM encoding: format=${fmt.audioFormat}, bits=${fmt.bitsPerSample}`);
  }

  const bytesPerSample = fmt.bitsPerSample / 8;
  const durationSec = dataSize / (fmt.sampleRate * fmt.channels * bytesPerSample);
  const rms = sampleCount > 0 ? Math.sqrt(sumSq / sampleCount) : 0;

  return {
    ...fmt,
    dataOffset,
    dataSize,
    durationSec,
    rms,
    peak,
    byteLength: buffer.length,
    sha256: sha256Hex(buffer),
  };
}

export function assertValidAudioFileOrBuffer(
  filePath: string,
  buffer: Buffer,
  options?: { minDurationSec?: number; maxDurationSec?: number; minRms?: number },
): { sha256: string; durationSec: number; sampleRate: number; channels: number; rms: number } {
  const minDur = options?.minDurationSec ?? 1.0;
  const maxDur = options?.maxDurationSec ?? 6.0;
  const minRms = options?.minRms ?? 0.01;

  const isWav =
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE';

  if (isWav) {
    const wav = parseWavBuffer(buffer);
    expect(wav.byteLength, 'WAV should be non-trivial').toBeGreaterThan(50_000);
    expect(wav.sampleRate).toBeGreaterThanOrEqual(22_050);
    expect(wav.channels).toBeGreaterThanOrEqual(1);
    expect(wav.bitsPerSample).toBeGreaterThanOrEqual(16);
    expect(wav.durationSec).toBeGreaterThan(minDur);
    expect(wav.durationSec).toBeLessThanOrEqual(maxDur);
    expect(wav.rms, 'WAV audio must be non-silent (RMS > 0.01)').toBeGreaterThan(minRms);
    return {
      sha256: wav.sha256,
      durationSec: wav.durationSec,
      sampleRate: wav.sampleRate,
      channels: wav.channels,
      rms: wav.rms,
    };
  }

  const probe = runFfprobeRaw(filePath);
  const audioStream = probe.streams.find((s) => s.codec_type === 'audio');
  if (!audioStream) {
    throw new Error(`No audio stream found by ffprobe in ${filePath}`);
  }
  const durationSec = extractDurationSec(probe, audioStream);
  const sampleRate = Number(audioStream.sample_rate);
  const channels = Number(audioStream.channels);

  const ffmpegBin = resolveMediaBinary('ffmpeg');
  const pcmBuf = execFileSync(
    ffmpegBin,
    ['-v', 'error', '-i', filePath, '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1'],
    { maxBuffer: 25 * 1024 * 1024 },
  );
  const sampleCount = Math.floor(pcmBuf.length / 4);
  let sumSq = 0;
  for (let i = 0; i < sampleCount; i++) {
    const s = pcmBuf.readFloatLE(i * 4);
    sumSq += s * s;
  }
  const rms = sampleCount > 0 ? Math.sqrt(sumSq / sampleCount) : 0;

  expect(buffer.length).toBeGreaterThan(5_000);
  expect(sampleRate).toBeGreaterThanOrEqual(22_050);
  expect(channels).toBeGreaterThanOrEqual(1);
  expect(durationSec).toBeGreaterThan(minDur);
  expect(durationSec).toBeLessThanOrEqual(maxDur);
  expect(rms, 'Audio RMS must be non-silent (> 0.01)').toBeGreaterThan(minRms);

  return { sha256: sha256Hex(buffer), durationSec, sampleRate, channels, rms };
}

export async function verifyAudioElement(
  audioLocator: Locator,
  options?: { minDurationSec?: number; maxDurationSec?: number; timeoutMs?: number; excludeSrc?: string },
): Promise<{ readyState: number; duration: number; currentSrc: string }> {
  const minDur = options?.minDurationSec ?? 1.0;
  const maxDur = options?.maxDurationSec ?? 6.0;
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const excludeSrc = options?.excludeSrc ?? null;

  await expect(audioLocator).toBeAttached({ timeout: timeoutMs });
  await expect
    .poll(
      async () =>
        audioLocator.evaluate(
          (el: HTMLAudioElement, excluded: string | null) => {
            const src = el.currentSrc || el.src || '';
            if (!src) return false;
            if (excluded && src === excluded) return false;
            return el.error === null && el.readyState >= 2 && Number.isFinite(el.duration) && el.duration > 0;
          },
          excludeSrc,
        ),
      { timeout: timeoutMs, message: 'Waiting for <audio> readyState >= 2, updated src, and finite duration' },
    )
    .toBe(true);

  const meta = await audioLocator.evaluate((el: HTMLAudioElement) => ({
    readyState: el.readyState,
    duration: el.duration,
    errorCode: el.error ? el.error.code : null,
    currentSrc: el.currentSrc || el.src,
  }));

  expect(meta.errorCode).toBeNull();
  expect(meta.currentSrc.length).toBeGreaterThan(0);
  if (excludeSrc) {
    expect(meta.currentSrc).not.toBe(excludeSrc);
  }
  expect(meta.readyState).toBeGreaterThanOrEqual(2);
  expect(Number.isFinite(meta.duration)).toBe(true);
  expect(meta.duration).toBeGreaterThan(minDur);
  expect(meta.duration).toBeLessThanOrEqual(maxDur);

  return { readyState: meta.readyState, duration: meta.duration, currentSrc: meta.currentSrc };
}

interface FfprobeStreamRaw {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  sample_rate?: string | number;
  channels?: number;
  duration?: string | number;
  tags?: Record<string, string>;
}

interface FfprobeOutputRaw {
  format?: {
    format_name?: string;
    duration?: string | number;
    size?: string | number;
    tags?: Record<string, string>;
  };
  streams?: FfprobeStreamRaw[];
}

const WINGET_FFMPEG_BIN =
  'C:\\Users\\sklei\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin';

export function resolveMediaBinary(name: 'ffprobe' | 'ffmpeg'): string {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const wingetCandidate = path.join(WINGET_FFMPEG_BIN, exe);
  try {
    execFileSync(name, ['-version'], { stdio: 'pipe' });
    return name;
  } catch {
    if (process.platform === 'win32' && fs.existsSync(wingetCandidate)) {
      return wingetCandidate;
    }
    throw new Error(`${name} not found on PATH or at ${wingetCandidate}`);
  }
}

function parseHmsDuration(raw: string | undefined): number {
  if (!raw) return Number.NaN;
  const m = raw.trim().match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return Number.NaN;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function extractDurationSec(probe: FfprobeOutputRaw, stream?: FfprobeStreamRaw): number {
  const candidates = [
    Number(probe.format?.duration),
    Number(stream?.duration),
    parseHmsDuration(stream?.tags?.DURATION),
    parseHmsDuration(probe.format?.tags?.DURATION),
  ];
  for (const val of candidates) {
    if (Number.isFinite(val) && val > 0) return val;
  }
  return Number.NaN;
}

function runFfprobeRaw(filePath: string): Required<FfprobeOutputRaw> {
  const bin = resolveMediaBinary('ffprobe');
  const stdout = execFileSync(
    bin,
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath],
    { encoding: 'utf8' },
  );
  const parsed = JSON.parse(stdout) as FfprobeOutputRaw;
  return {
    format: parsed.format ?? {},
    streams: parsed.streams ?? [],
  };
}

export interface ProbedVideoResult {
  formatName: string;
  formatDurationSec: number;
  videoStream: { width: number; height: number; codec: string };
  audioStream: { codec: string; sampleRate: number };
}

export function probeVideoFile(filePath: string): ProbedVideoResult {
  const probe = runFfprobeRaw(filePath);
  const v = probe.streams.find((s) => s.codec_type === 'video');
  const a = probe.streams.find((s) => s.codec_type === 'audio');
  if (!v) throw new Error(`ffprobe found no video stream in ${filePath}`);
  if (!a) throw new Error(`ffprobe found no audio stream in ${filePath}`);

  const formatDurationSec = extractDurationSec(probe, v);
  const width = Number(v.width);
  const height = Number(v.height);
  const sampleRate = Number(a.sample_rate);
  if (!Number.isFinite(formatDurationSec) || formatDurationSec <= 0) {
    throw new Error(`Invalid ffprobe video duration for ${filePath}: ${probe.format.duration}`);
  }
  return {
    formatName: String(probe.format.format_name ?? ''),
    formatDurationSec,
    videoStream: { width, height, codec: String(v.codec_name ?? '') },
    audioStream: { codec: String(a.codec_name ?? ''), sampleRate },
  };
}

export function measureMediaAudioRms(filePath: string): number {
  const ffmpegBin = resolveMediaBinary('ffmpeg');
  const pcmBuf = execFileSync(
    ffmpegBin,
    ['-v', 'error', '-i', filePath, '-vn', '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1'],
    { maxBuffer: 25 * 1024 * 1024 },
  );
  const sampleCount = Math.floor(pcmBuf.length / 4);
  if (sampleCount <= 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < sampleCount; i++) {
    const s = pcmBuf.readFloatLE(i * 4);
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / sampleCount);
}

export function assertValidVerticalVideoFile(
  filePath: string,
  options?: { minDurationSec?: number; maxDurationSec?: number; minAudioRms?: number },
): ProbedVideoResult & { audioRms: number } {
  const minDur = options?.minDurationSec ?? 1.0;
  const maxDur = options?.maxDurationSec ?? 6.0;
  const minAudioRms = options?.minAudioRms ?? 0.01;
  const result = probeVideoFile(filePath);

  expect(result.videoStream.width).toBeGreaterThan(0);
  expect(result.videoStream.height).toBeGreaterThan(0);
  const ratio = result.videoStream.width / result.videoStream.height;
  expect(
    Math.abs(ratio - 9 / 16),
    `Expected 9:16 aspect ratio, got ${result.videoStream.width}x${result.videoStream.height}`,
  ).toBeLessThan(0.02);
  expect(result.audioStream.sampleRate).toBeGreaterThan(0);
  expect(result.formatDurationSec).toBeGreaterThan(minDur);
  expect(result.formatDurationSec).toBeLessThanOrEqual(maxDur);

  const audioRms = measureMediaAudioRms(filePath);
  expect(audioRms, `Muxed video audio track must be non-silent (RMS > ${minAudioRms})`).toBeGreaterThan(minAudioRms);
  return { ...result, audioRms };
}

export async function verifyVideoElement(
  videoLocator: Locator,
  options?: { minDurationSec?: number; maxDurationSec?: number; timeoutMs?: number },
): Promise<{ duration: number; videoWidth: number; videoHeight: number; currentSrc: string }> {
  const minDur = options?.minDurationSec ?? 1.0;
  const maxDur = options?.maxDurationSec ?? 6.0;
  const timeoutMs = options?.timeoutMs ?? 25_000;

  await expect(videoLocator).toBeVisible({ timeout: timeoutMs });
  await expect
    .poll(
      async () =>
        videoLocator.evaluate(
          (el: HTMLVideoElement) =>
            el.error === null &&
            el.readyState >= 1 &&
            Number.isFinite(el.duration) &&
            el.duration > 0 &&
            el.videoWidth > 0 &&
            el.videoHeight > 0,
        ),
      { timeout: timeoutMs, message: 'Waiting for <video> loadedmetadata & finite duration' },
    )
    .toBe(true);

  const meta = await videoLocator.evaluate((el: HTMLVideoElement) => ({
    duration: el.duration,
    videoWidth: el.videoWidth,
    videoHeight: el.videoHeight,
    errorCode: el.error ? el.error.code : null,
    currentSrc: el.currentSrc || el.src,
  }));

  expect(meta.errorCode).toBeNull();
  expect(Number.isFinite(meta.duration)).toBe(true);
  expect(meta.duration).toBeGreaterThan(minDur);
  expect(meta.duration).toBeLessThanOrEqual(maxDur);
  expect(Math.abs(meta.videoWidth / meta.videoHeight - 9 / 16)).toBeLessThan(0.02);
  return {
    duration: meta.duration,
    videoWidth: meta.videoWidth,
    videoHeight: meta.videoHeight,
    currentSrc: meta.currentSrc,
  };
}
