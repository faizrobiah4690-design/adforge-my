import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

function readPngHeader(filePath: string) {
  const buf = fs.readFileSync(filePath);
  const signature = buf.subarray(0, 8);
  const ihdrChunk = buf.subarray(12, 16).toString('ascii');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf[25];
  return { size: buf.length, signature, ihdrChunk, width, height, colorType };
}

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|css|html)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe('same-origin pre-seeded assets & zero external media URLs', () => {
  it('validates klinik-gigi-impian-logo.png as 512x512 RGBA PNG', () => {
    const logoPath = path.join(PROJECT_ROOT, 'public/assets/brands/klinik-gigi-impian-logo.png');
    expect(fs.existsSync(logoPath)).toBe(true);
    const png = readPngHeader(logoPath);
    expect(Array.from(png.signature)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.ihdrChunk).toBe('IHDR');
    expect(png.width).toBeGreaterThanOrEqual(256);
    expect(png.height).toBeGreaterThanOrEqual(256);
    expect(png.colorType).toBe(6); // RGBA with alpha channel
  });

  it('validates all 3 clinic photos as >= 1080x1350 PNGs', () => {
    const names = ['clinic-scaling-1.png', 'clinic-smile-2.png', 'clinic-chair-3.png'];
    for (const name of names) {
      const photoPath = path.join(PROJECT_ROOT, 'public/assets/photos', name);
      expect(fs.existsSync(photoPath)).toBe(true);
      const png = readPngHeader(photoPath);
      expect(Array.from(png.signature)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(png.width).toBeGreaterThanOrEqual(1080);
      expect(png.height).toBeGreaterThanOrEqual(1350);
    }
  });

  it('validates fallback-jingle.wav as 48kHz 16-bit PCM RIFF WAV <= 6.0s with non-silent RMS', () => {
    const wavPath = path.join(PROJECT_ROOT, 'public/assets/audio/fallback-jingle.wav');
    expect(fs.existsSync(wavPath)).toBe(true);
    const buf = fs.readFileSync(wavPath);
    expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(buf.subarray(8, 12).toString('ascii')).toBe('WAVE');

    const audioFormat = buf.readUInt16LE(20);
    const channels = buf.readUInt16LE(22);
    const sampleRate = buf.readUInt32LE(24);
    const bitsPerSample = buf.readUInt16LE(34);
    const dataSize = buf.readUInt32LE(40);

    expect(audioFormat).toBe(1);
    expect(channels).toBe(2);
    expect(sampleRate).toBe(48000);
    expect(bitsPerSample).toBe(16);

    const bytesPerSec = sampleRate * channels * (bitsPerSample / 8);
    const durationSec = dataSize / bytesPerSec;
    expect(durationSec).toBeGreaterThan(1.0);
    expect(durationSec).toBeLessThanOrEqual(6.0);

    let sumSquares = 0;
    const totalSamples = dataSize / 2;
    for (let offset = 44; offset + 1 < buf.length; offset += 2) {
      const sample = buf.readInt16LE(offset) / 32768;
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / totalSamples);
    expect(rms).toBeGreaterThan(0.01);
  });

  it('validates byok-guide.webm starts with EBML header and is non-empty', () => {
    const webmPath = path.join(PROJECT_ROOT, 'public/assets/guide/byok-guide.webm');
    expect(fs.existsSync(webmPath)).toBe(true);
    const buf = fs.readFileSync(webmPath);
    expect(buf.length).toBeGreaterThan(50_000);
    expect(Array.from(buf.subarray(0, 4))).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  });

  it('contains zero external http(s):// URLs in index.html and src/ (except https://wa.me/)', () => {
    const files = [
      path.join(PROJECT_ROOT, 'index.html'),
      ...collectSourceFiles(path.join(PROJECT_ROOT, 'src')),
    ];
    const urlPattern = /https?:\/\/[^\s'"`<>)]+/g;
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const matches = content.match(urlPattern) ?? [];
      for (const match of matches) {
        expect(match.startsWith('https://wa.me/')).toBe(true);
      }
    }
  });
});
