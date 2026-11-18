import crypto from 'node:crypto';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JingleTab } from '../../src/components/tabs/JingleTab';
import { VideoTab } from '../../src/components/tabs/VideoTab';
import { SEEDED_DEMO_BRAND } from '../../src/data/seedVault';
import { I18nProvider, useI18n } from '../../src/i18n/I18nContext';
import { CampaignProvider, useCampaign } from '../../src/state/CampaignContext';
import { WorkbenchProvider, useWorkbench } from '../../src/state/WorkbenchContext';
import type { JingleState, JingleStyleId, PhotoAsset, StoryboardFrame } from '../../src/types/campaign';
import * as audioExportModule from '../../src/utils/audioExport';
import {
  JINGLE_DURATION_SEC,
  JINGLE_SAMPLE_RATE,
  buildJingleLyrics,
  computeRms,
  encodeWavFromPcm,
  resolveVideoAudioBuffer,
  synthesizeJinglePcm,
} from '../../src/utils/audioExport';
import * as videoExportModule from '../../src/utils/videoExport';
import {
  TOTAL_VIDEO_DURATION_SEC,
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  computeCoverCropRect,
  exportVerticalVideo,
  getActiveStoryboardFrame,
  resolveThemeColor,
  selectMediaRecorderMimeType,
  wrapTextLines,
} from '../../src/utils/videoExport';

function LanguageSwitchProbe() {
  const { locale, setLocale } = useI18n();
  return React.createElement(
    'div',
    null,
    React.createElement('span', { 'data-testid': 'probe-locale' }, locale),
    React.createElement(
      'button',
      { type: 'button', 'data-testid': 'probe-lang-en', onClick: () => setLocale('en') },
      'EN'
    ),
    React.createElement(
      'button',
      { type: 'button', 'data-testid': 'probe-lang-ms', onClick: () => setLocale('ms') },
      'BM'
    )
  );
}

function CampaignActionProbe() {
  const { jingle, setJingle, video } = useCampaign();
  return React.createElement(
    'div',
    null,
    React.createElement(
      'span',
      { 'data-testid': 'probe-lyrics-edited' },
      String(jingle.lyricsEditedByUser)
    ),
    React.createElement(
      'span',
      { 'data-testid': 'probe-video-confirmed' },
      String(video.isStoryboardConfirmed)
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'probe-seed-tab3-jingle',
        onClick: () =>
          setJingle((prev) => ({
            ...prev,
            wavBlob: new Blob(['RIFF'], { type: 'audio/wav' }),
            previewUrl: 'blob:tab3-test-audio',
            source: 'tab3-generated',
          })),
      },
      'SeedTab3'
    )
  );
}

function renderWithProviders(...children: React.ReactNode[]) {
  return render(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(
        WorkbenchProvider,
        null,
        React.createElement(CampaignProvider, null, ...children)
      )
    )
  );
}

describe('M5 audioExport (pure PCM synthesis & RIFF WAV encoder)', () => {
  const styles: JingleStyleId[] = ['pop-ceria', 'santai-akustik', 'korporat-segar'];

  it('synthesizes 5.5s 48kHz stereo non-silent PCM with distinct bytes per style', () => {
    const hashes = new Set<string>();

    for (const style of styles) {
      const [left, right] = synthesizeJinglePcm(
        style,
        JINGLE_DURATION_SEC,
        JINGLE_SAMPLE_RATE
      );
      expect(left.length).toBe(264000);
      expect(right.length).toBe(264000);
      expect(computeRms(left)).toBeGreaterThan(0.05);
      expect(computeRms(right)).toBeGreaterThan(0.05);

      let maxPeak = 0;
      for (let i = 0; i < left.length; i += 1) {
        const a = Math.max(Math.abs(left[i]), Math.abs(right[i]));
        if (a > maxPeak) maxPeak = a;
      }
      expect(maxPeak).toBeLessThanOrEqual(0.95);

      const wavBuf = encodeWavFromPcm([left, right], JINGLE_SAMPLE_RATE);
      const view = new DataView(wavBuf);
      const riff = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3)
      );
      const wave = String.fromCharCode(
        view.getUint8(8),
        view.getUint8(9),
        view.getUint8(10),
        view.getUint8(11)
      );
      const fmt = String.fromCharCode(
        view.getUint8(12),
        view.getUint8(13),
        view.getUint8(14),
        view.getUint8(15)
      );
      const dataTag = String.fromCharCode(
        view.getUint8(36),
        view.getUint8(37),
        view.getUint8(38),
        view.getUint8(39)
      );

      expect(riff).toBe('RIFF');
      expect(wave).toBe('WAVE');
      expect(fmt).toBe('fmt ');
      expect(dataTag).toBe('data');
      expect(view.getUint16(20, true)).toBe(1); // PCM
      expect(view.getUint16(22, true)).toBe(2); // Stereo
      expect(view.getUint32(24, true)).toBe(48000);
      expect(view.getUint16(34, true)).toBe(16); // 16-bit
      expect(view.getUint32(40, true)).toBe(1056000);
      expect(wavBuf.byteLength).toBe(1056044);

      const digest = crypto
        .createHash('sha256')
        .update(new Uint8Array(wavBuf))
        .digest('hex');
      hashes.add(digest);
    }

    expect(hashes.size).toBe(3);
  });

  it('builds baseline BM lyrics incorporating brand name and offer sentence', () => {
    const lyrics = buildJingleLyrics('Kafe Santai', 'Promosi Kopi RM9.90');
    expect(lyrics).toContain('Kafe Santai');
    expect(lyrics).toContain('Promosi Kopi RM9.90');
  });
});

describe('M5 videoExport pure helpers', () => {
  it('enforces 9:16 dimensions and <= 6s duration constants', () => {
    expect(VIDEO_WIDTH).toBe(540);
    expect(VIDEO_HEIGHT).toBe(960);
    expect(VIDEO_WIDTH / VIDEO_HEIGHT).toBeCloseTo(9 / 16, 4);
    expect(VIDEO_FPS).toBe(30);
    expect(TOTAL_VIDEO_DURATION_SEC).toBeLessThanOrEqual(6.0);
  });

  it('resolves active storyboard frame dynamically across boundaries and out-of-range times', () => {
    const frames: StoryboardFrame[] = [
      { id: 'f1', index: 0, startSec: 0, endSec: 1.35, photoIndex: 0, overlayHeadline: 'H1', lyricLine: 'L1' },
      { id: 'f2', index: 1, startSec: 1.35, endSec: 2.75, photoIndex: 1, overlayHeadline: 'H2', lyricLine: 'L2' },
      { id: 'f3', index: 2, startSec: 2.75, endSec: 4.15, photoIndex: 0, overlayHeadline: 'H3', lyricLine: 'L3' },
      { id: 'f4', index: 3, startSec: 4.15, endSec: 5.5, photoIndex: 1, overlayHeadline: 'H4', lyricLine: 'L4' },
    ];

    expect(getActiveStoryboardFrame(frames, -0.5).id).toBe('f1');
    expect(getActiveStoryboardFrame(frames, 0.0).id).toBe('f1');
    expect(getActiveStoryboardFrame(frames, 1.34).id).toBe('f1');
    expect(getActiveStoryboardFrame(frames, 1.35).id).toBe('f2');
    expect(getActiveStoryboardFrame(frames, 2.75).id).toBe('f3');
    expect(getActiveStoryboardFrame(frames, 4.15).id).toBe('f4');
    expect(getActiveStoryboardFrame(frames, 5.5).id).toBe('f4');
    expect(getActiveStoryboardFrame(frames, 6.2).id).toBe('f4');
  });

  it('computes centered cover crop rectangles for square and landscape sources into 9:16', () => {
    const sqCrop = computeCoverCropRect(1024, 1024, 540, 960);
    expect(sqCrop.sy).toBe(0);
    expect(sqCrop.sh).toBe(1024);
    expect(sqCrop.sw).toBeCloseTo(576, 1);
    expect(sqCrop.sx).toBeCloseTo(224, 1);

    const wideCrop = computeCoverCropRect(1920, 1080, 540, 960);
    expect(wideCrop.sy).toBe(0);
    expect(wideCrop.sh).toBe(1080);
    expect(wideCrop.sw).toBeCloseTo(607.5, 1);
  });

  it('wraps long text and breaks oversized tokens cleanly within maxLines', () => {
    const measure = (s: string) => Array.from(s).length * 10;
    const lines = wrapTextLines(
      measure,
      'Promosi Pakej Istimewa ✨🚀 sangat berbaloi untuk semua',
      150,
      3
    );
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.length).toBeGreaterThan(1);

    const tokenLines = wrapTextLines(measure, 'AAAAAAAAAAAAAAAAAAAAAAAAA', 80, 3);
    expect(tokenLines.length).toBe(3);
    expect(tokenLines[2].endsWith('...')).toBe(true);
  });

  it('prefers MP4 H.264/AAC MIME before WebM in MediaRecorder fallback selection', () => {
    const mp4First = selectMediaRecorderMimeType(
      (m) => m === 'video/mp4;codecs=avc1.42E01E,mp4a.40.2' || m === 'video/webm;codecs=vp8,opus'
    );
    expect(mp4First).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2');

    const webmFallback = selectMediaRecorderMimeType((m) => m === 'video/webm;codecs=vp8,opus');
    expect(webmFallback).toBe('video/webm;codecs=vp8,opus');
  });
});

describe('Tab 3 JingleTab & Tab 4 VideoTab component behavior', () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    window.localStorage.clear();
    let seq = 0;
    URL.createObjectURL = vi.fn(() => `blob:mock-media-${++seq}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it('JingleTab pre-populates lyrics, does not pre-mount <audio>, preserves edits on style & BM/EN toggles, and generates WAV', async () => {
    const { container } = renderWithProviders(
      React.createElement(LanguageSwitchProbe),
      React.createElement(CampaignActionProbe),
      React.createElement(JingleTab)
    );

    expect(container.querySelectorAll('audio').length).toBe(0);

    const lyricsInput = screen.getByTestId('jingle-lyrics-input') as HTMLTextAreaElement;
    expect(lyricsInput.value).toContain('Demo Bisnes Saya');
    expect(screen.getByTestId('jingle-download-btn')).toBeDisabled();

    // Edit lyrics -> sets lyricsEditedByUser = true
    fireEvent.change(lyricsInput, {
      target: { value: 'Lirik Tersuai Demo Bisnes Saya ✨' },
    });
    expect(screen.getByTestId('probe-lyrics-edited')).toHaveTextContent('true');

    // Switch style & toggle BM -> EN -> BM: custom lyrics stay intact
    fireEvent.click(screen.getByTestId('jingle-style-santai-akustik'));
    expect(screen.getByTestId('jingle-style-santai-akustik')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('jingle-style-santai-akustik')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(lyricsInput.value).toBe('Lirik Tersuai Demo Bisnes Saya ✨');

    fireEvent.click(screen.getByTestId('probe-lang-en'));
    expect(screen.getByTestId('probe-locale')).toHaveTextContent('en');
    expect(lyricsInput.value).toBe('Lirik Tersuai Demo Bisnes Saya ✨');
    expect(screen.getByTestId('jingle-style-santai-akustik')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Whitespace rejection via alert
    fireEvent.change(lyricsInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('jingle-generate-btn'));
    expect(screen.getByTestId('jingle-error')).toHaveAttribute('role', 'alert');
    expect(container.querySelectorAll('audio').length).toBe(0);

    // Restore valid lyrics and generate WAV preview
    fireEvent.change(lyricsInput, {
      target: { value: 'Pilihan tepat Demo Bisnes Saya!' },
    });
    fireEvent.click(screen.getByTestId('jingle-generate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('jingle-audio-player')).toBeInTheDocument();
    });
    expect(container.querySelectorAll('audio').length).toBe(1);
    expect(screen.getByTestId('jingle-audio-player')).toHaveAttribute(
      'src',
      'blob:mock-media-1'
    );
    expect(screen.getByTestId('jingle-download-btn')).toBeEnabled();
  });

  it('VideoTab enforces storyboard confirmation gate, renders 4 frame thumbnails, resets confirmation on edit, and toggles audio source badge', () => {
    const { container } = renderWithProviders(
      React.createElement(LanguageSwitchProbe),
      React.createElement(CampaignActionProbe),
      React.createElement(VideoTab)
    );

    // 0 <video> before generation; 4 storyboard frame cards with visible <img>
    expect(container.querySelectorAll('video').length).toBe(0);
    for (let i = 1; i <= 4; i += 1) {
      const card = screen.getByTestId(`video-storyboard-frame-${i}`);
      expect(card.querySelector('img')).not.toBeNull();
      expect(screen.getByTestId(`video-frame-input-${i}`)).toBeInTheDocument();
    }

    const checkbox = screen.getByTestId('video-confirm-checkbox') as HTMLInputElement;
    const generateBtn = screen.getByTestId('video-generate-btn');
    const downloadBtn = screen.getByTestId('video-download-btn');
    const audioBadge = screen.getByTestId('video-audio-source-badge');

    expect(checkbox.checked).toBe(false);
    expect(screen.getByTestId('video-gate-warning')).toBeInTheDocument();
    expect(generateBtn).toBeDisabled();
    expect(downloadBtn).toBeDisabled();
    expect(audioBadge.textContent).toMatch(/Sandaran|Fallback/i);

    // Confirm storyboard -> unlocks generateBtn, preserves across BM <-> EN
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(screen.queryByTestId('video-gate-warning')).not.toBeInTheDocument();
    expect(generateBtn).toBeEnabled();

    fireEvent.click(screen.getByTestId('probe-lang-en'));
    expect(checkbox.checked).toBe(true);
    expect(generateBtn).toBeEnabled();

    // Editing frame 1 resets confirmation gate immediately
    const frame1Input = screen.getByTestId('video-frame-input-1') as HTMLInputElement;
    fireEvent.change(frame1Input, { target: { value: 'Tajuk Bingkai Disunting' } });
    expect(checkbox.checked).toBe(false);
    expect(screen.getByTestId('probe-video-confirmed')).toHaveTextContent('false');
    expect(screen.getByTestId('video-gate-warning')).toBeInTheDocument();
    expect(generateBtn).toBeDisabled();
    expect(downloadBtn).toBeDisabled();

    // Seeding Tab 3 generated jingle updates badge to Tab 3
    fireEvent.click(screen.getByTestId('probe-seed-tab3-jingle'));
    expect(audioBadge.textContent).toMatch(/Tab 3/i);
  });
});

describe('Tier 5 M5 Adversarial Coverage — videoExport & audioExport hardening', () => {
  const origVideoEncoder = (globalThis as Record<string, unknown>).VideoEncoder;
  const origAudioEncoder = (globalThis as Record<string, unknown>).AudioEncoder;
  const origVideoFrame = (globalThis as Record<string, unknown>).VideoFrame;
  const origAudioData = (globalThis as Record<string, unknown>).AudioData;
  const origEncodedVideoChunk = (globalThis as Record<string, unknown>).EncodedVideoChunk;
  const origEncodedAudioChunk = (globalThis as Record<string, unknown>).EncodedAudioChunk;
  const origMediaRecorder = (globalThis as Record<string, unknown>).MediaRecorder;
  const origOfflineAudioCtx = (globalThis as Record<string, unknown>).OfflineAudioContext;
  const origImage = globalThis.Image;

  const sampleFrames: StoryboardFrame[] = [
    { id: 'frame-1', index: 0, startSec: 0, endSec: 1.35, photoIndex: 0, overlayHeadline: 'H1', lyricLine: 'L1' },
    { id: 'frame-2', index: 1, startSec: 1.35, endSec: 2.75, photoIndex: 1, overlayHeadline: 'H2', lyricLine: 'L2' },
    { id: 'frame-3', index: 2, startSec: 2.75, endSec: 4.15, photoIndex: 0, overlayHeadline: 'H3', lyricLine: 'L3' },
    { id: 'frame-4', index: 3, startSec: 4.15, endSec: 5.5, photoIndex: 1, overlayHeadline: 'H4', lyricLine: 'L4' },
  ];

  const samplePhotos: [PhotoAsset, PhotoAsset] = [
    { id: 'p1', label: 'P1', src: '/assets/photos/business-showcase-1.png', isSample: true },
    { id: 'p2', label: 'P2', src: '/assets/photos/business-product-2.png', isSample: true },
  ];

  function createFakeAudioBuffer(durationSec = 5.5, sampleRate = 48000): AudioBuffer {
    const len = Math.round(durationSec * sampleRate);
    const ch0 = new Float32Array(len).fill(0.05);
    const ch1 = new Float32Array(len).fill(0.05);
    return {
      duration: durationSec,
      sampleRate,
      length: len,
      numberOfChannels: 2,
      getChannelData: (ch: number) => (ch === 0 ? ch0 : ch1),
      copyFromChannel: vi.fn(),
      copyToChannel: vi.fn(),
    } as unknown as AudioBuffer;
  }

  function installCanvasMock(options?: {
    onDrawImage?: (...args: unknown[]) => void;
    onCreateLinearGradient?: () => void;
  }) {
    const gradient = { addColorStop: vi.fn() };
    const ctx = {
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      fillRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      clip: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn((...args: unknown[]) => options?.onDrawImage?.(...args)),
      fillText: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
      createLinearGradient: vi.fn(() => {
        options?.onCreateLinearGradient?.();
        return gradient;
      }),
    };
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreate(tagName);
      if (tagName.toLowerCase() === 'canvas') {
        const c = el as HTMLCanvasElement;
        vi.spyOn(c, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
        c.captureStream = vi.fn(() => ({
          getVideoTracks: () => [{ stop: vi.fn() }],
        })) as unknown as HTMLCanvasElement['captureStream'];
      }
      return el;
    });
    return ctx;
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    const g = globalThis as Record<string, unknown>;
    g.VideoEncoder = origVideoEncoder;
    g.AudioEncoder = origAudioEncoder;
    g.VideoFrame = origVideoFrame;
    g.AudioData = origAudioData;
    g.EncodedVideoChunk = origEncodedVideoChunk;
    g.EncodedAudioChunk = origEncodedAudioChunk;
    g.MediaRecorder = origMediaRecorder;
    g.OfflineAudioContext = origOfflineAudioCtx;
    globalThis.Image = origImage;
  });

  it('guards wrapTextLines against maxLines <= 0, maxWidth <= 0, and tiny maxWidth', () => {
    const measure = (s: string) => s.length * 10;
    expect(wrapTextLines(measure, 'Hello world', 50, 0)).toEqual([]);
    expect(wrapTextLines(measure, 'Hello world', 0, 2)).toEqual([]);
    expect(wrapTextLines(measure, 'Hello world', Number.NaN, 2)).toEqual([]);
    const tiny = wrapTextLines(measure, 'ABCDEF', 1, 1);
    expect(tiny.every((l) => measure(l) <= 1)).toBe(true);
  });

  it('breaks out of WebCodecs backpressure loops on async encodeError and closes both encoders on mid-encode throw', async () => {
    installCanvasMock();
    class NoopImage {
      naturalWidth = 100;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = NoopImage as unknown as typeof Image;

    let veCloseCalls = 0;
    let aeCloseCalls = 0;
    let veEncodeCount = 0;

    class MockVideoEncoder {
      static isConfigSupported = vi.fn().mockResolvedValue({ supported: true });
      state: CodecState = 'configured';
      encodeQueueSize = 0;
      private onError: (err: Error) => void;
      constructor(init: { output: () => void; error: (err: Error) => void }) {
        this.onError = init.error;
      }
      configure = vi.fn();
      encode = vi.fn(() => {
        veEncodeCount += 1;
        if (veEncodeCount === 3) {
          this.encodeQueueSize = 9;
          setTimeout(() => this.onError(new Error('stalled-video')), 10);
        }
      });
      flush = vi.fn().mockResolvedValue(undefined);
      close = vi.fn(() => {
        veCloseCalls += 1;
        this.state = 'closed';
      });
    }

    class MockAudioEncoder {
      static isConfigSupported = vi.fn().mockResolvedValue({ supported: true });
      state: CodecState = 'configured';
      encodeQueueSize = 0;
      configure = vi.fn();
      encode = vi.fn();
      flush = vi.fn().mockResolvedValue(undefined);
      close = vi.fn(() => {
        aeCloseCalls += 1;
        this.state = 'closed';
      });
    }

    const g = globalThis as Record<string, unknown>;
    g.VideoEncoder = MockVideoEncoder;
    g.AudioEncoder = MockAudioEncoder;
    g.VideoFrame = class {
      close = vi.fn();
    };
    g.AudioData = class {
      close = vi.fn();
    };
    g.MediaRecorder = undefined;

    const start = Date.now();
    await expect(
      exportVerticalVideo({
        frames: sampleFrames,
        photos: samplePhotos,
        brand: SEEDED_DEMO_BRAND,
        audioBuffer: createFakeAudioBuffer(),
      })
    ).rejects.toThrow(/MediaRecorder is available/i);

    expect(Date.now() - start).toBeLessThan(2500);
    expect(veCloseCalls).toBe(1);
    expect(aeCloseCalls).toBe(1);
  });

  it('rejects 0-byte MediaRecorder onstop blobs cleanly', async () => {
    installCanvasMock();
    class NoopImage {
      naturalWidth = 100;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = NoopImage as unknown as typeof Image;

    const g = globalThis as Record<string, unknown>;
    g.VideoEncoder = undefined;
    g.AudioEncoder = undefined;
    g.AudioContext = class {
      state = 'running';
      createMediaStreamDestination = () => ({ stream: { getAudioTracks: () => [] } });
      createBufferSource = () => ({ buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() });
      close = vi.fn().mockResolvedValue(undefined);
    };
    g.MediaStream = class {
      getTracks = () => [];
    };
    g.MediaRecorder = class {
      static isTypeSupported = () => true;
      state = 'inactive';
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ondataavailable: ((ev: { data: Blob }) => void) | null = null;
      start() {
        this.state = 'recording';
        queueMicrotask(() => {
          this.state = 'inactive';
          this.onstop?.();
        });
      }
      stop() {
        this.state = 'inactive';
        this.onstop?.();
      }
    };

    await expect(
      exportVerticalVideo({
        frames: sampleFrames,
        photos: samplePhotos,
        brand: SEEDED_DEMO_BRAND,
        audioBuffer: createFakeAudioBuffer(),
      })
    ).rejects.toThrow(/empty video blob/i);
  });

  it('preserves 4:1 logo aspect ratio, caches gradients across 165 frames, and sanitizes NaN durationSec', async () => {
    let gradCalls = 0;
    const drawImageCalls: unknown[][] = [];
    installCanvasMock({
      onCreateLinearGradient: () => {
        gradCalls += 1;
      },
      onDrawImage: (...args) => {
        drawImageCalls.push(args);
      },
    });

    class WideLogoImage {
      naturalWidth = 400;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      private _src = '';
      set src(v: string) {
        this._src = v;
        if (v.includes('logo')) {
          this.naturalWidth = 400;
          this.naturalHeight = 100;
        } else {
          this.naturalWidth = 540;
          this.naturalHeight = 960;
        }
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return this._src;
      }
    }
    globalThis.Image = WideLogoImage as unknown as typeof Image;

    class MockEncodedVideoChunk {
      type: 'key' | 'delta';
      timestamp: number;
      duration: number;
      byteLength = 8;
      constructor(init: { type: 'key' | 'delta'; timestamp: number; duration: number }) {
        this.type = init.type;
        this.timestamp = init.timestamp;
        this.duration = init.duration;
      }
      copyTo(dest: ArrayBufferView | ArrayBuffer) {
        if (dest instanceof Uint8Array) dest.fill(1);
      }
    }
    class MockEncodedAudioChunk {
      type: 'key' | 'delta';
      timestamp: number;
      duration: number;
      byteLength = 4;
      constructor(init: { type: 'key' | 'delta'; timestamp: number; duration: number }) {
        this.type = init.type;
        this.timestamp = init.timestamp;
        this.duration = init.duration;
      }
      copyTo(dest: ArrayBufferView | ArrayBuffer) {
        if (dest instanceof Uint8Array) dest.fill(2);
      }
    }

    let videoEncoded = 0;
    class HappyVideoEncoder {
      static isConfigSupported = vi.fn().mockResolvedValue({ supported: true });
      state: CodecState = 'configured';
      encodeQueueSize = 0;
      private onOutput: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void;
      constructor(init: { output: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void }) {
        this.onOutput = init.output;
      }
      configure = vi.fn();
      encode = vi.fn((frame: { timestamp: number; duration: number }) => {
        videoEncoded += 1;
        this.onOutput(
          new MockEncodedVideoChunk({
            type: videoEncoded === 1 ? 'key' : 'delta',
            timestamp: frame.timestamp,
            duration: frame.duration,
          }) as unknown as EncodedVideoChunk,
          { decoderConfig: { codec: 'vp8', codedWidth: 540, codedHeight: 960 } } as EncodedVideoChunkMetadata
        );
      });
      flush = vi.fn().mockResolvedValue(undefined);
      close = vi.fn();
    }
    class HappyAudioEncoder {
      static isConfigSupported = vi.fn().mockResolvedValue({ supported: true });
      state: CodecState = 'configured';
      encodeQueueSize = 0;
      private onOutput: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void;
      constructor(init: { output: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void }) {
        this.onOutput = init.output;
      }
      configure = vi.fn();
      encode = vi.fn((audioData: { timestamp: number }) => {
        this.onOutput(
          new MockEncodedAudioChunk({
            type: 'key',
            timestamp: audioData.timestamp,
            duration: 20000,
          }) as unknown as EncodedAudioChunk,
          {
            decoderConfig: {
              codec: 'opus',
              sampleRate: 48000,
              numberOfChannels: 2,
              description: new Uint8Array(19),
            },
          } as EncodedAudioChunkMetadata
        );
      });
      flush = vi.fn().mockResolvedValue(undefined);
      close = vi.fn();
    }

    const g = globalThis as Record<string, unknown>;
    g.EncodedVideoChunk = MockEncodedVideoChunk;
    g.EncodedAudioChunk = MockEncodedAudioChunk;
    g.VideoEncoder = HappyVideoEncoder;
    g.AudioEncoder = HappyAudioEncoder;
    g.VideoFrame = class {
      timestamp: number;
      duration: number;
      constructor(_src: unknown, init: { timestamp: number; duration: number }) {
        this.timestamp = init.timestamp;
        this.duration = init.duration;
      }
      close = vi.fn();
    };
    g.AudioData = class {
      timestamp: number;
      constructor(init: { timestamp: number }) {
        this.timestamp = init.timestamp;
      }
      close = vi.fn();
    };

    const res = await exportVerticalVideo({
      frames: sampleFrames,
      photos: samplePhotos,
      brand: SEEDED_DEMO_BRAND,
      audioBuffer: createFakeAudioBuffer(),
      durationSec: Number.NaN,
    });

    expect(res.durationSec).toBe(TOTAL_VIDEO_DURATION_SEC);
    expect(videoEncoded).toBe(165);
    expect(gradCalls).toBeLessThanOrEqual(3);

    const logoDraws = drawImageCalls.filter(
      (args) => args.length === 5 && (args[0] as { src: string }).src.includes('logo')
    );
    expect(logoDraws.length).toBe(165);
    const dw = Number(logoDraws[0][3]);
    const dh = Number(logoDraws[0][4]);
    expect(dw / dh).toBeCloseTo(4.0, 1);
  });

  it('recovers when Tab 3 wavBlob is corrupt AND fallback WAV fetch returns 404', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response);

    const g = globalThis as Record<string, unknown>;
    g.OfflineAudioContext = class {
      destination = {};
      constructor(_channels: number, _length: number, _sr: number) {}
      createBuffer(ch: number, len: number, sr: number) {
        const data = [new Float32Array(len), new Float32Array(len)];
        return {
          numberOfChannels: ch,
          length: len,
          sampleRate: sr,
          duration: len / sr,
          getChannelData: (idx: number) => data[idx] ?? data[0],
        };
      }
      decodeAudioData = vi.fn().mockRejectedValue(new Error('decode failed'));
      createOscillator = () => ({ type: 'sine', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() });
      createBiquadFilter = () => ({ type: 'lowpass', frequency: { setValueAtTime: vi.fn() }, connect: vi.fn() });
      createGain = () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() });
      createDynamicsCompressor = () => ({ threshold: { setValueAtTime: vi.fn() }, knee: { setValueAtTime: vi.fn() }, ratio: { setValueAtTime: vi.fn() }, attack: { setValueAtTime: vi.fn() }, release: { setValueAtTime: vi.fn() }, connect: vi.fn() });
      createStereoPanner = () => ({ pan: { setValueAtTime: vi.fn() }, connect: vi.fn() });
      createBufferSource = () => ({ buffer: null, connect: vi.fn(), start: vi.fn() });
      startRendering = vi.fn().mockRejectedValue(new Error('offline render failed'));
    };

    const corruptJingle: JingleState = {
      style: 'pop-ceria',
      generatedStyle: 'pop-ceria',
      lyrics: 'Lirik',
      lyricsEditedByUser: false,
      durationSec: 5.5,
      sampleRate: 48000,
      wavBlob: new Blob(['not-a-wav'], { type: 'audio/wav' }),
      previewUrl: 'blob:corrupt',
      source: 'tab3-generated',
    };

    const resolved = await resolveVideoAudioBuffer(corruptJingle);
    expect(resolved.audioSourceUsed).toBe('fallback-preseeded');
    expect(resolved.audioBuffer.length).toBe(264000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('stops canvasStream tracks if new AudioContext throws in MediaRecorder fallback', async () => {
    const trackStop = vi.fn();
    const origCreate = document.createElement.bind(document);
    const ctx = installCanvasMock();
    vi.restoreAllMocks();
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreate(tagName);
      if (tagName.toLowerCase() === 'canvas') {
        const c = el as HTMLCanvasElement;
        vi.spyOn(c, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
        c.captureStream = vi.fn(() => ({
          getTracks: () => [{ stop: trackStop }],
          getVideoTracks: () => [{ stop: trackStop }],
        })) as unknown as HTMLCanvasElement['captureStream'];
      }
      return el;
    });

    class NoopImage {
      naturalWidth = 100;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = NoopImage as unknown as typeof Image;

    const g = globalThis as Record<string, unknown>;
    g.VideoEncoder = undefined;
    g.AudioEncoder = undefined;
    g.MediaRecorder = class {
      static isTypeSupported = () => true;
    };
    g.AudioContext = class {
      constructor() {
        throw new Error('AudioContext blocked');
      }
    };

    await expect(
      exportVerticalVideo({
        frames: sampleFrames,
        photos: samplePhotos,
        brand: SEEDED_DEMO_BRAND,
        audioBuffer: createFakeAudioBuffer(),
      })
    ).rejects.toThrow(/AudioContext blocked/i);

    expect(trackStop).toHaveBeenCalledTimes(1);
  });

  it('invokes cleanup (stops tracks and closes AudioContext) when recorder.start throws synchronously', async () => {
    const canvasTrackStop = vi.fn();
    const combinedTrackStop = vi.fn();
    const audioCtxClose = vi.fn().mockResolvedValue(undefined);
    const origCreate = document.createElement.bind(document);
    const ctx = installCanvasMock();
    vi.restoreAllMocks();
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreate(tagName);
      if (tagName.toLowerCase() === 'canvas') {
        const c = el as HTMLCanvasElement;
        vi.spyOn(c, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
        c.captureStream = vi.fn(() => ({
          getTracks: () => [{ stop: canvasTrackStop }],
          getVideoTracks: () => [{ stop: canvasTrackStop }],
        })) as unknown as HTMLCanvasElement['captureStream'];
      }
      return el;
    });

    class NoopImage {
      naturalWidth = 100;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = NoopImage as unknown as typeof Image;

    const g = globalThis as Record<string, unknown>;
    g.VideoEncoder = undefined;
    g.AudioEncoder = undefined;
    g.AudioContext = class {
      state = 'running';
      createMediaStreamDestination = () => ({ stream: { getAudioTracks: () => [] } });
      createBufferSource = () => ({ buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() });
      close = audioCtxClose;
    };
    g.MediaStream = class {
      getTracks = () => [{ stop: combinedTrackStop }];
    };
    g.MediaRecorder = class {
      static isTypeSupported = () => true;
      state = 'inactive';
      start() {
        throw new Error('recorder start failed');
      }
      stop = vi.fn();
    };

    await expect(
      exportVerticalVideo({
        frames: sampleFrames,
        photos: samplePhotos,
        brand: SEEDED_DEMO_BRAND,
        audioBuffer: createFakeAudioBuffer(),
      })
    ).rejects.toThrow(/recorder start failed/i);

    expect(canvasTrackStop).toHaveBeenCalledTimes(1);
    expect(combinedTrackStop).toHaveBeenCalledTimes(1);
    expect(audioCtxClose).toHaveBeenCalledTimes(1);
  });

  it('rejects hanging WebCodecs flush() after 10_000ms, closes both encoders, and falls back to MediaRecorder', async () => {
    vi.useFakeTimers();
    const canvasTrackStop = vi.fn();
    const origCreate = document.createElement.bind(document);
    const ctx = installCanvasMock();
    vi.restoreAllMocks();
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreate(tagName);
      if (tagName.toLowerCase() === 'canvas') {
        const c = el as HTMLCanvasElement;
        vi.spyOn(c, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
        c.captureStream = vi.fn(() => ({
          getTracks: () => [{ stop: canvasTrackStop }],
          getVideoTracks: () => [{ stop: canvasTrackStop }],
        })) as unknown as HTMLCanvasElement['captureStream'];
      }
      return el;
    });

    class NoopImage {
      naturalWidth = 100;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = NoopImage as unknown as typeof Image;

    let veClosed = 0;
    let aeClosed = 0;
    let mrStartCalled = false;

    class HangingFlushVideoEncoder {
      static isConfigSupported = vi.fn().mockResolvedValue({ supported: true });
      state: CodecState = 'configured';
      encodeQueueSize = 0;
      configure = vi.fn();
      encode = vi.fn();
      flush = vi.fn(() => new Promise<void>(() => {}));
      close = vi.fn(() => {
        veClosed += 1;
        this.state = 'closed';
      });
    }

    class HangingFlushAudioEncoder {
      static isConfigSupported = vi.fn().mockResolvedValue({ supported: true });
      state: CodecState = 'configured';
      encodeQueueSize = 0;
      configure = vi.fn();
      encode = vi.fn();
      flush = vi.fn().mockResolvedValue(undefined);
      close = vi.fn(() => {
        aeClosed += 1;
        this.state = 'closed';
      });
    }

    const g = globalThis as Record<string, unknown>;
    g.VideoEncoder = HangingFlushVideoEncoder;
    g.AudioEncoder = HangingFlushAudioEncoder;
    g.VideoFrame = class {
      close = vi.fn();
    };
    g.AudioData = class {
      close = vi.fn();
    };
    g.AudioContext = class {
      state = 'running';
      createMediaStreamDestination = () => ({ stream: { getAudioTracks: () => [] } });
      createBufferSource = () => ({ buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() });
      close = vi.fn().mockResolvedValue(undefined);
    };
    g.MediaStream = class {
      getTracks = () => [];
    };
    g.MediaRecorder = class {
      static isTypeSupported = () => true;
      state = 'inactive';
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ondataavailable: ((ev: { data: Blob }) => void) | null = null;
      start() {
        mrStartCalled = true;
        this.state = 'recording';
        setTimeout(() => {
          this.ondataavailable?.({ data: new Blob(['fallback-video-bytes'], { type: 'video/webm' }) });
          this.state = 'inactive';
          this.onstop?.();
        }, 50);
      }
      stop() {
        this.state = 'inactive';
        this.onstop?.();
      }
    };

    const exportPromise = exportVerticalVideo({
      frames: sampleFrames,
      photos: samplePhotos,
      brand: SEEDED_DEMO_BRAND,
      audioBuffer: createFakeAudioBuffer(),
    });

    await vi.advanceTimersByTimeAsync(10_200);
    const res = await exportPromise;

    expect(veClosed).toBe(1);
    expect(aeClosed).toBe(1);
    expect(mrStartCalled).toBe(true);
    expect(res.blob.size).toBeGreaterThan(0);
    expect(canvasTrackStop).toHaveBeenCalled();
  });

  it('expands 3-digit hex #f00 and falls back invalid hex colors to #0EA5E9 across gradients, strokes, and fills', async () => {
    expect(resolveThemeColor('#f00')).toBe('#ff0000');
    expect(resolveThemeColor('not-a-hex')).toBe('#0EA5E9');

    const gradientStops: Array<{ offset: number; color: string }> = [];
    const fillStyles: unknown[] = [];
    const strokeStyles: unknown[] = [];

    const gradient = {
      addColorStop: vi.fn((offset: number, color: string) => {
        gradientStops.push({ offset, color });
      }),
    };
    let _fillStyle: unknown = '#000000';
    let _strokeStyle: unknown = '#000000';
    const ctx = {
      get fillStyle() {
        return _fillStyle;
      },
      set fillStyle(val: unknown) {
        _fillStyle = val;
        fillStyles.push(val);
      },
      get strokeStyle() {
        return _strokeStyle;
      },
      set strokeStyle(val: unknown) {
        _strokeStyle = val;
        strokeStyles.push(val);
      },
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      fillRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      clip: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
      createLinearGradient: vi.fn(() => gradient),
    };

    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreate(tagName);
      if (tagName.toLowerCase() === 'canvas') {
        vi.spyOn(el as HTMLCanvasElement, 'getContext').mockReturnValue(
          ctx as unknown as CanvasRenderingContext2D
        );
      }
      return el;
    });

    class NoopImage {
      naturalWidth = 100;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = NoopImage as unknown as typeof Image;

    class MockEncodedVideoChunk {
      type: 'key' | 'delta';
      timestamp: number;
      duration: number;
      byteLength = 4;
      constructor(init: { type: 'key' | 'delta'; timestamp: number; duration: number }) {
        this.type = init.type;
        this.timestamp = init.timestamp;
        this.duration = init.duration;
      }
      copyTo(dest: ArrayBufferView | ArrayBuffer) {
        if (dest instanceof Uint8Array) dest.fill(1);
      }
    }
    class MockEncodedAudioChunk {
      type: 'key' | 'delta';
      timestamp: number;
      duration: number;
      byteLength = 4;
      constructor(init: { type: 'key' | 'delta'; timestamp: number; duration: number }) {
        this.type = init.type;
        this.timestamp = init.timestamp;
        this.duration = init.duration;
      }
      copyTo(dest: ArrayBufferView | ArrayBuffer) {
        if (dest instanceof Uint8Array) dest.fill(2);
      }
    }

    let videoEncoded = 0;
    class HappyVideoEncoder {
      static isConfigSupported = vi.fn().mockResolvedValue({ supported: true });
      state: CodecState = 'configured';
      encodeQueueSize = 0;
      private onOutput: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void;
      constructor(init: { output: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void }) {
        this.onOutput = init.output;
      }
      configure = vi.fn();
      encode = vi.fn((frame: { timestamp: number; duration: number }) => {
        videoEncoded += 1;
        this.onOutput(
          new MockEncodedVideoChunk({
            type: videoEncoded === 1 ? 'key' : 'delta',
            timestamp: frame.timestamp,
            duration: frame.duration,
          }) as unknown as EncodedVideoChunk,
          { decoderConfig: { codec: 'vp8', codedWidth: 540, codedHeight: 960 } } as EncodedVideoChunkMetadata
        );
      });
      flush = vi.fn().mockResolvedValue(undefined);
      close = vi.fn();
    }
    class HappyAudioEncoder {
      static isConfigSupported = vi.fn().mockResolvedValue({ supported: true });
      state: CodecState = 'configured';
      encodeQueueSize = 0;
      private onOutput: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void;
      constructor(init: { output: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void }) {
        this.onOutput = init.output;
      }
      configure = vi.fn();
      encode = vi.fn((audioData: { timestamp: number }) => {
        this.onOutput(
          new MockEncodedAudioChunk({
            type: 'key',
            timestamp: audioData.timestamp,
            duration: 20000,
          }) as unknown as EncodedAudioChunk,
          {
            decoderConfig: {
              codec: 'opus',
              sampleRate: 48000,
              numberOfChannels: 2,
              description: new Uint8Array(19),
            },
          } as EncodedAudioChunkMetadata
        );
      });
      flush = vi.fn().mockResolvedValue(undefined);
      close = vi.fn();
    }

    const g = globalThis as Record<string, unknown>;
    g.EncodedVideoChunk = MockEncodedVideoChunk;
    g.EncodedAudioChunk = MockEncodedAudioChunk;
    g.VideoEncoder = HappyVideoEncoder;
    g.AudioEncoder = HappyAudioEncoder;
    g.VideoFrame = class {
      timestamp: number;
      duration: number;
      constructor(_src: unknown, init: { timestamp: number; duration: number }) {
        this.timestamp = init.timestamp;
        this.duration = init.duration;
      }
      close = vi.fn();
    };
    g.AudioData = class {
      timestamp: number;
      constructor(init: { timestamp: number }) {
        this.timestamp = init.timestamp;
      }
      close = vi.fn();
    };

    // 1. Valid 3-digit hex '#f00' -> expanded to '#ff0000' and rgba(255, 0, 0, ...)
    await exportVerticalVideo({
      frames: sampleFrames,
      photos: samplePhotos,
      brand: { ...SEEDED_DEMO_BRAND, themeColor: '#f00' },
      audioBuffer: createFakeAudioBuffer(),
      durationSec: 1.5,
    });

    expect(gradientStops.some((s) => s.color === 'rgba(255, 0, 0, 0.24)')).toBe(true);
    expect(gradientStops.some((s) => s.color.includes('14, 165, 233'))).toBe(false);
    expect(strokeStyles).toContain('rgba(255, 0, 0, 0.65)');
    expect(fillStyles).toContain('#ff0000');
    expect(fillStyles).not.toContain('#f00');

    // 2. Invalid hex 'not-a-hex' -> deterministic '#0EA5E9' fallback
    gradientStops.length = 0;
    fillStyles.length = 0;
    strokeStyles.length = 0;

    await exportVerticalVideo({
      frames: sampleFrames,
      photos: samplePhotos,
      brand: { ...SEEDED_DEMO_BRAND, themeColor: 'not-a-hex' },
      audioBuffer: createFakeAudioBuffer(),
      durationSec: 1.5,
    });

    expect(gradientStops.some((s) => s.color === 'rgba(14, 165, 233, 0.24)')).toBe(true);
    expect(strokeStyles).toContain('rgba(14, 165, 233, 0.65)');
    expect(fillStyles).toContain('#0EA5E9');
    expect(fillStyles).not.toContain('not-a-hex');
  });
});

describe('Tier 5 JingleTab & VideoTab UI adversarial tests', () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    window.localStorage.clear();
    let seq = 0;
    URL.createObjectURL = vi.fn(() => `blob:mock-t5-${++seq}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it('tracks generatedStyle independently from selected style, displays stale-style notice, downloads with generatedStyle filename, and translates JingleTab error on BM/EN toggle', async () => {
    const origCreate = document.createElement.bind(document);
    let lastAnchorDownload = '';
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreate(tagName);
      if (tagName.toLowerCase() === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {
          lastAnchorDownload = (el as HTMLAnchorElement).download;
        });
      }
      return el;
    });

    renderWithProviders(
      React.createElement(LanguageSwitchProbe),
      React.createElement(JingleTab)
    );

    // Empty lyrics error translates on BM <-> EN toggle
    fireEvent.change(screen.getByTestId('jingle-lyrics-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('jingle-generate-btn'));
    expect(screen.getByTestId('jingle-error')).toHaveTextContent(/Sila masukkan lirik/i);

    fireEvent.click(screen.getByTestId('probe-lang-en'));
    expect(screen.getByTestId('jingle-error')).toHaveTextContent(/Please enter jingle chorus lyrics/i);

    fireEvent.change(screen.getByTestId('jingle-lyrics-input'), {
      target: { value: 'Demo Bisnes Saya pilihan utama anda' },
    });
    fireEvent.click(screen.getByTestId('jingle-style-pop-ceria'));
    fireEvent.click(screen.getByTestId('jingle-generate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('jingle-audio-player')).toBeInTheDocument();
    });

    // Switch style without regenerating
    fireEvent.click(screen.getByTestId('jingle-style-santai-akustik'));
    expect(screen.getByTestId('jingle-stale-style-notice')).toBeInTheDocument();
    expect(screen.getByTestId('jingle-tab').textContent).toContain('pop-ceria • 5.5s');

    fireEvent.click(screen.getByTestId('jingle-download-btn'));
    expect(lastAnchorDownload).toBe('jingle-demo-bisnes-saya-pop-ceria.wav');
  });

  it('discards stale async JingleTab and VideoTab renders when launchCampaign runs mid-flight and clears/translates VideoTab errors cleanly', async () => {
    let resolveJingle!: (res: audioExportModule.GeneratedJingleResult) => void;
    vi.spyOn(audioExportModule, 'generateJingleAudio').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveJingle = resolve;
        })
    );

    let resolveVideoAudio!: (res: audioExportModule.ResolvedVideoAudio) => void;
    vi.spyOn(audioExportModule, 'resolveVideoAudioBuffer').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveVideoAudio = resolve;
        })
    );

    function RaceHarness() {
      const { launchCampaign, jingle, video } = useCampaign();
      return React.createElement(
        'div',
        null,
        React.createElement('span', { 'data-testid': 'race-jingle-source' }, jingle.source),
        React.createElement('span', { 'data-testid': 'race-video-status' }, video.status),
        React.createElement('span', { 'data-testid': 'race-video-url' }, video.videoUrl ?? 'none'),
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'race-relaunch',
            onClick: () => launchCampaign({ offerSentence: 'Kempen Baharu Race' }),
          },
          'relaunch'
        )
      );
    }

    renderWithProviders(
      React.createElement(LanguageSwitchProbe),
      React.createElement(RaceHarness),
      React.createElement(JingleTab),
      React.createElement(VideoTab)
    );

    // Start Jingle generation and Video generation concurrently
    fireEvent.click(screen.getByTestId('jingle-generate-btn'));
    fireEvent.click(screen.getByTestId('video-confirm-checkbox'));
    fireEvent.click(screen.getByTestId('video-generate-btn'));
    expect(screen.getByTestId('race-video-status')).toHaveTextContent('rendering');

    // Relaunch campaign while both are pending
    fireEvent.click(screen.getByTestId('race-relaunch'));
    expect(screen.getByTestId('race-jingle-source')).toHaveTextContent('fallback-preseeded');
    expect(screen.getByTestId('race-video-status')).toHaveTextContent('awaiting-confirmation');

    await act(async () => {
      resolveJingle({
        audioBuffer: null,
        wavBlob: new Blob(['RIFF'], { type: 'audio/wav' }),
        previewUrl: 'blob:stale-jingle',
        durationSec: 5.5,
        sampleRate: 48000,
      });
      resolveVideoAudio({
        audioBuffer: { duration: 5.5, sampleRate: 48000, numberOfChannels: 2 } as AudioBuffer,
        audioSourceUsed: 'fallback-preseeded',
      });
    });

    expect(screen.getByTestId('race-jingle-source')).toHaveTextContent('fallback-preseeded');
    expect(screen.getByTestId('race-video-status')).toHaveTextContent('awaiting-confirmation');
    expect(screen.getByTestId('race-video-url')).toHaveTextContent('none');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stale-jingle');

    // VideoTab render error translates on BM <-> EN toggle and clears when frame edited
    vi.spyOn(audioExportModule, 'resolveVideoAudioBuffer').mockResolvedValueOnce({
      audioBuffer: { duration: 5.5, sampleRate: 48000, numberOfChannels: 2 } as AudioBuffer,
      audioSourceUsed: 'fallback-preseeded',
    });
    vi.spyOn(videoExportModule, 'exportVerticalVideo').mockRejectedValueOnce(
      new Error('Mocked encoder failure')
    );

    fireEvent.click(screen.getByTestId('video-confirm-checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('video-generate-btn'));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Gagal merender video menegak/i);
    });

    fireEvent.click(screen.getByTestId('probe-lang-en'));
    expect(screen.getByRole('alert')).toHaveTextContent(/Failed to render vertical video/i);

    fireEvent.change(screen.getByTestId('video-frame-input-1'), {
      target: { value: 'Edited after error' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('disables VideoTab storyboard frame inputs and textareas during rendering and ignores mid-render edits', async () => {
    vi.spyOn(audioExportModule, 'resolveVideoAudioBuffer').mockResolvedValueOnce({
      audioBuffer: { duration: 5.5, sampleRate: 48000, numberOfChannels: 2 } as AudioBuffer,
      audioSourceUsed: 'fallback-preseeded',
    });

    let resolveExport!: (res: videoExportModule.ExportVideoResult) => void;
    vi.spyOn(videoExportModule, 'exportVerticalVideo').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve;
        })
    );

    const { container } = renderWithProviders(
      React.createElement(CampaignActionProbe),
      React.createElement(VideoTab)
    );

    const frame1Input = screen.getByTestId('video-frame-input-1') as HTMLInputElement;
    const frame1Lyric = document.getElementById('video-frame-lyric-1') as HTMLTextAreaElement;
    const originalHeadline = frame1Input.value;

    fireEvent.click(screen.getByTestId('video-confirm-checkbox'));
    fireEvent.click(screen.getByTestId('video-generate-btn'));

    await waitFor(() => {
      expect(frame1Input).toBeDisabled();
      expect(frame1Lyric).toBeDisabled();
    });

    // Attempted edit during render must not mutate storyboard frame or unconfirm state
    fireEvent.change(frame1Input, { target: { value: 'Suntingan Semasa Render' } });
    expect(frame1Input.value).toBe(originalHeadline);
    expect(screen.getByTestId('probe-video-confirmed')).toHaveTextContent('true');

    await act(async () => {
      resolveExport({
        blob: new Blob(['webm-bytes'], { type: 'video/webm' }),
        mimeType: 'video/webm',
        fileExtension: 'webm',
        durationSec: 5.5,
        width: 540,
        height: 960,
      });
    });

    await waitFor(() => {
      expect(container.querySelectorAll('video').length).toBe(1);
    });
    expect(frame1Input).toBeEnabled();
    expect(frame1Lyric).toBeEnabled();
  });

  it('invalidates stale in-flight VideoTab render when launched brand themeColor/logoDataUrl changes mid-render', async () => {
    vi.spyOn(audioExportModule, 'resolveVideoAudioBuffer').mockResolvedValueOnce({
      audioBuffer: { duration: 5.5, sampleRate: 48000, numberOfChannels: 2 } as AudioBuffer,
      audioSourceUsed: 'fallback-preseeded',
    });

    let resolveExport!: (res: videoExportModule.ExportVideoResult) => void;
    vi.spyOn(videoExportModule, 'exportVerticalVideo').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve;
        })
    );

    function BrandEditMidRenderProbe() {
      const { activeBrandId, updateBrand } = useWorkbench();
      const { video } = useCampaign();
      return React.createElement(
        'div',
        null,
        React.createElement('span', { 'data-testid': 'mid-video-status' }, video.status),
        React.createElement(
          'span',
          { 'data-testid': 'mid-video-confirmed' },
          String(video.isStoryboardConfirmed)
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'mid-change-theme',
            onClick: () => updateBrand(activeBrandId, { themeColor: '#E11D48' }),
          },
          'changeTheme'
        )
      );
    }

    const { container } = renderWithProviders(
      React.createElement(BrandEditMidRenderProbe),
      React.createElement(VideoTab)
    );

    fireEvent.click(screen.getByTestId('video-confirm-checkbox'));
    fireEvent.click(screen.getByTestId('video-generate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('mid-video-status')).toHaveTextContent('rendering');
    });

    // Mutate themeColor mid-render -> resets status to awaiting-confirmation and unconfirms
    fireEvent.click(screen.getByTestId('mid-change-theme'));
    expect(screen.getByTestId('mid-video-status')).toHaveTextContent('awaiting-confirmation');
    expect(screen.getByTestId('mid-video-confirmed')).toHaveTextContent('false');

    // Stale in-flight export resolves -> must NOT surface old branding or mount <video>
    await act(async () => {
      resolveExport({
        blob: new Blob(['stale-brand-webm'], { type: 'video/webm' }),
        mimeType: 'video/webm',
        fileExtension: 'webm',
        durationSec: 5.5,
        width: 540,
        height: 960,
      });
    });

    expect(screen.getByTestId('mid-video-status')).toHaveTextContent('awaiting-confirmation');
    expect(screen.getByTestId('mid-video-confirmed')).toHaveTextContent('false');
    expect(container.querySelectorAll('video').length).toBe(0);
  });

  it('recovers cleanly when VideoTab unmounts mid-render (tab switch) and revokes orphan blob URLs on provider unmount', async () => {
    vi.spyOn(audioExportModule, 'resolveVideoAudioBuffer').mockResolvedValueOnce({
      audioBuffer: { duration: 5.5, sampleRate: 48000, numberOfChannels: 2 } as AudioBuffer,
      audioSourceUsed: 'fallback-preseeded',
    });

    let resolveExport!: (res: videoExportModule.ExportVideoResult) => void;
    vi.spyOn(videoExportModule, 'exportVerticalVideo').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve;
        })
    );

    function TabSwitchHarness() {
      const { activeTab, setActiveTab, video } = useCampaign();
      return React.createElement(
        'div',
        null,
        React.createElement('span', { 'data-testid': 'harness-video-status' }, video.status),
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'harness-go-strategy',
            onClick: () => setActiveTab('strategy'),
          },
          'strategy'
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'harness-go-video',
            onClick: () => setActiveTab('video'),
          },
          'video'
        ),
        activeTab === 'video' ? React.createElement(VideoTab) : React.createElement('div', { 'data-testid': 'strategy-placeholder' }, 'strategy')
      );
    }

    const { container, unmount } = renderWithProviders(React.createElement(TabSwitchHarness));

    // Start on VideoTab
    fireEvent.click(screen.getByTestId('harness-go-video'));
    fireEvent.click(screen.getByTestId('video-confirm-checkbox'));
    fireEvent.click(screen.getByTestId('video-generate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('harness-video-status')).toHaveTextContent('rendering');
    });

    // Switch to StrategyTab (unmounts VideoTab while exportVerticalVideo is still pending)
    fireEvent.click(screen.getByTestId('harness-go-strategy'));
    expect(screen.queryByTestId('video-tab')).toBeNull();

    // Resolve export while VideoTab is unmounted
    await act(async () => {
      resolveExport({
        blob: new Blob(['bg-webm'], { type: 'video/webm' }),
        mimeType: 'video/webm',
        fileExtension: 'webm',
        durationSec: 5.5,
        width: 540,
        height: 960,
      });
    });

    // Switch back to VideoTab -> video is ready, controls are enabled, <video> player mounted
    fireEvent.click(screen.getByTestId('harness-go-video'));
    expect(screen.getByTestId('harness-video-status')).toHaveTextContent('ready');
    expect(screen.getByTestId('video-generate-btn')).toBeEnabled();
    expect(screen.getByTestId('video-confirm-checkbox')).toBeEnabled();
    expect(screen.getByTestId('video-frame-input-1')).toBeEnabled();
    expect(screen.getByTestId('video-download-btn')).toBeEnabled();
    expect(container.querySelectorAll('video').length).toBe(1);

    // Also verify provider unmount mid-render aborts cleanly without leaking orphan blob URLs
    let resolveOrphanExport!: (res: videoExportModule.ExportVideoResult) => void;
    vi.spyOn(audioExportModule, 'resolveVideoAudioBuffer').mockResolvedValueOnce({
      audioBuffer: { duration: 5.5, sampleRate: 48000, numberOfChannels: 2 } as AudioBuffer,
      audioSourceUsed: 'fallback-preseeded',
    });
    vi.spyOn(videoExportModule, 'exportVerticalVideo').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOrphanExport = resolve;
        })
    );

    const createUrlMock = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    const callsBeforeOrphan = createUrlMock.mock.calls.length;
    fireEvent.click(screen.getByTestId('video-generate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('harness-video-status')).toHaveTextContent('rendering');
    });

    unmount();

    await act(async () => {
      resolveOrphanExport({
        blob: new Blob(['orphan-webm'], { type: 'video/webm' }),
        mimeType: 'video/webm',
        fileExtension: 'webm',
        durationSec: 5.5,
        width: 540,
        height: 960,
      });
    });

    // No orphan blob URL should be created after provider unmount
    expect(createUrlMock.mock.calls.length).toBe(callsBeforeOrphan);
  });

  it('completes JingleTab synthesis cleanly across tab-jingle -> tab-video unmount and aborts on provider unmount', async () => {
    let resolveJingle!: (res: audioExportModule.GeneratedJingleResult) => void;
    vi.spyOn(audioExportModule, 'generateJingleAudio').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveJingle = resolve;
        })
    );

    function JingleSwitchHarness() {
      const { activeTab, setActiveTab, jingle } = useCampaign();
      return React.createElement(
        'div',
        null,
        React.createElement('span', { 'data-testid': 'harness-jingle-source' }, jingle.source),
        React.createElement('span', { 'data-testid': 'harness-jingle-ver' }, String(jingle.version ?? 0)),
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'harness-go-jingle',
            onClick: () => setActiveTab('jingle'),
          },
          'jingle'
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'harness-go-video',
            onClick: () => setActiveTab('video'),
          },
          'video'
        ),
        activeTab === 'jingle'
          ? React.createElement(JingleTab)
          : activeTab === 'video'
            ? React.createElement(VideoTab)
            : null
      );
    }

    const { container, unmount } = renderWithProviders(React.createElement(JingleSwitchHarness));

    fireEvent.click(screen.getByTestId('harness-go-jingle'));
    fireEvent.click(screen.getByTestId('jingle-style-santai-akustik'));
    fireEvent.click(screen.getByTestId('jingle-generate-btn'));
    expect(screen.getByTestId('jingle-generate-btn')).toBeDisabled();

    // Switch to VideoTab mid-synthesis (unmounts JingleTab)
    fireEvent.click(screen.getByTestId('harness-go-video'));
    expect(screen.queryByTestId('jingle-tab')).toBeNull();
    expect(screen.getByTestId('video-audio-source-badge')).toHaveTextContent(/Sandaran|Fallback/i);

    await act(async () => {
      resolveJingle({
        audioBuffer: null,
        wavBlob: new Blob(['RIFF-MID-SWITCH'], { type: 'audio/wav' }),
        previewUrl: 'blob:jingle-bg-ready',
        durationSec: 5.5,
        sampleRate: 48000,
      });
    });

    // VideoTab immediately reflects Tab 3 audio source
    expect(screen.getByTestId('harness-jingle-source')).toHaveTextContent('tab3-generated');
    expect(screen.getByTestId('harness-jingle-ver')).toHaveTextContent('1');
    expect(screen.getByTestId('video-audio-source-badge')).toHaveTextContent(/Tab 3/i);

    // Return to JingleTab -> player mounted and download enabled
    fireEvent.click(screen.getByTestId('harness-go-jingle'));
    expect(screen.getByTestId('jingle-audio-player')).toBeInTheDocument();
    expect(screen.getByTestId('jingle-download-btn')).toBeEnabled();
    expect(container.querySelectorAll('audio').length).toBe(1);

    // Provider unmount mid-synthesis revokes orphan previewUrl
    let resolveOrphanJingle!: (res: audioExportModule.GeneratedJingleResult) => void;
    vi.spyOn(audioExportModule, 'generateJingleAudio').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOrphanJingle = resolve;
        })
    );
    fireEvent.click(screen.getByTestId('jingle-generate-btn'));
    unmount();

    await act(async () => {
      resolveOrphanJingle({
        audioBuffer: null,
        wavBlob: new Blob(['RIFF-ORPHAN'], { type: 'audio/wav' }),
        previewUrl: 'blob:orphan-jingle',
        durationSec: 5.5,
        sampleRate: 48000,
      });
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:orphan-jingle');
  });

  it('resets JingleTab lyrics via Set Semula Ikut Jenama and clears lyricsEditedByUser', () => {
    renderWithProviders(
      React.createElement(CampaignActionProbe),
      React.createElement(JingleTab)
    );

    const lyricsInput = screen.getByTestId('jingle-lyrics-input') as HTMLTextAreaElement;
    const initialLyrics = lyricsInput.value;
    expect(screen.getByTestId('probe-lyrics-edited')).toHaveTextContent('false');

    fireEvent.change(lyricsInput, { target: { value: 'Lirik Tersuai Pengguna Sahaja' } });
    expect(screen.getByTestId('probe-lyrics-edited')).toHaveTextContent('true');

    fireEvent.click(screen.getByTestId('jingle-reset-lyrics-btn'));
    expect(lyricsInput.value).toBe(initialLyrics);
    expect(screen.getByTestId('probe-lyrics-edited')).toHaveTextContent('false');
  });

  it('triggers hasPendingTab3Update when Tab 3 jingle is regenerated and revokes stale videoUrl across ready -> error -> frame edit', async () => {
    vi.spyOn(audioExportModule, 'generateJingleAudio')
      .mockResolvedValueOnce({
        audioBuffer: null,
        wavBlob: new Blob(['RIFF-1'], { type: 'audio/wav' }),
        previewUrl: 'blob:jingle-v1',
        durationSec: 5.5,
        sampleRate: 48000,
      })
      .mockResolvedValueOnce({
        audioBuffer: null,
        wavBlob: new Blob(['RIFF-2'], { type: 'audio/wav' }),
        previewUrl: 'blob:jingle-v2',
        durationSec: 5.5,
        sampleRate: 48000,
      });

    vi.spyOn(audioExportModule, 'resolveVideoAudioBuffer').mockResolvedValue({
      audioBuffer: { duration: 5.5, sampleRate: 48000, numberOfChannels: 2 } as AudioBuffer,
      audioSourceUsed: 'tab3-jingle',
    });

    vi.spyOn(videoExportModule, 'exportVerticalVideo')
      .mockResolvedValueOnce({
        blob: new Blob(['webm-1'], { type: 'video/webm' }),
        mimeType: 'video/webm',
        fileExtension: 'webm',
        durationSec: 5.5,
        width: 540,
        height: 960,
      })
      .mockRejectedValueOnce(new Error('Second render boom'))
      .mockResolvedValueOnce({
        blob: new Blob(['webm-3'], { type: 'video/webm' }),
        mimeType: 'video/webm',
        fileExtension: 'webm',
        durationSec: 5.5,
        width: 540,
        height: 960,
      });

    function DualTabHarness() {
      const { activeTab, setActiveTab, video } = useCampaign();
      return React.createElement(
        'div',
        null,
        React.createElement('span', { 'data-testid': 'dual-video-url' }, video.videoUrl ?? 'none'),
        React.createElement(
          'button',
          { type: 'button', 'data-testid': 'dual-go-jingle', onClick: () => setActiveTab('jingle') },
          'jingle'
        ),
        React.createElement(
          'button',
          { type: 'button', 'data-testid': 'dual-go-video', onClick: () => setActiveTab('video') },
          'video'
        ),
        activeTab === 'jingle' ? React.createElement(JingleTab) : React.createElement(VideoTab)
      );
    }

    renderWithProviders(React.createElement(DualTabHarness));

    // 1. Generate Tab 3 v1, then render Tab 4 video -> no pending update notice
    fireEvent.click(screen.getByTestId('dual-go-jingle'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('jingle-generate-btn'));
    });

    fireEvent.click(screen.getByTestId('dual-go-video'));
    fireEvent.click(screen.getByTestId('video-confirm-checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('video-generate-btn'));
    });
    expect(screen.queryByTestId('video-pending-tab3-notice')).toBeNull();
    const firstVideoUrl = screen.getByTestId('dual-video-url').textContent ?? '';
    expect(firstVideoUrl.startsWith('blob:')).toBe(true);

    // 2. Regenerate Tab 3 v2 -> VideoTab MUST show video-pending-tab3-notice
    fireEvent.click(screen.getByTestId('dual-go-jingle'));
    fireEvent.click(screen.getByTestId('jingle-style-korporat-segar'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('jingle-generate-btn'));
    });

    fireEvent.click(screen.getByTestId('dual-go-video'));
    expect(screen.getByTestId('video-pending-tab3-notice')).toBeInTheDocument();

    // 3. Re-render fails (ready -> error) -> editing a frame revokes firstVideoUrl and clears videoUrl
    await act(async () => {
      fireEvent.click(screen.getByTestId('video-generate-btn'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/Second render boom/i);

    fireEvent.change(screen.getByTestId('video-frame-input-1'), {
      target: { value: 'Frame Edited After Second Failure' },
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstVideoUrl);
    expect(screen.getByTestId('dual-video-url')).toHaveTextContent('none');

    // 4. Re-confirm and render succeeds -> clears pending notice
    fireEvent.click(screen.getByTestId('video-confirm-checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('video-generate-btn'));
    });
    expect(screen.queryByTestId('video-pending-tab3-notice')).toBeNull();
  });

  it('invalidates confirmation, unmounts stale <video>, disables download, and clears error when editing storyboard Caption / Lyric textarea (#video-frame-lyric-1)', async () => {
    vi.spyOn(audioExportModule, 'resolveVideoAudioBuffer').mockResolvedValue({
      audioBuffer: { duration: 5.5, sampleRate: 48000, numberOfChannels: 2 } as AudioBuffer,
      audioSourceUsed: 'fallback-preseeded',
    });

    vi.spyOn(videoExportModule, 'exportVerticalVideo')
      .mockResolvedValueOnce({
        blob: new Blob(['webm-lyric-1'], { type: 'video/webm' }),
        mimeType: 'video/webm',
        fileExtension: 'webm',
        durationSec: 5.5,
        width: 540,
        height: 960,
      })
      .mockRejectedValueOnce(new Error('Lyric test render error'));

    const { container } = renderWithProviders(
      React.createElement(CampaignActionProbe),
      React.createElement(VideoTab)
    );

    const checkbox = screen.getByTestId('video-confirm-checkbox') as HTMLInputElement;
    const generateBtn = screen.getByTestId('video-generate-btn');
    const downloadBtn = screen.getByTestId('video-download-btn');
    const lyric1 = document.getElementById('video-frame-lyric-1') as HTMLTextAreaElement;

    // 1. Confirm -> edit lyric1 in awaiting-confirmation -> unchecks gate
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(generateBtn).toBeEnabled();

    fireEvent.change(lyric1, { target: { value: 'Lirik Bingkai 1 Disunting Sebelum Jana' } });
    expect(checkbox.checked).toBe(false);
    expect(screen.getByTestId('probe-video-confirmed')).toHaveTextContent('false');
    expect(screen.getByTestId('video-gate-warning')).toBeInTheDocument();
    expect(generateBtn).toBeDisabled();

    // 2. Confirm & render -> edit lyric1 in ready state -> unmounts <video>, revokes URL, disables download
    fireEvent.click(checkbox);
    await act(async () => {
      fireEvent.click(generateBtn);
    });
    const player = screen.getByTestId('video-preview-player');
    const renderedSrc = player.getAttribute('src') ?? '';
    expect(renderedSrc.startsWith('blob:')).toBe(true);
    expect(downloadBtn).toBeEnabled();

    fireEvent.change(lyric1, { target: { value: 'Lirik Bingkai 1 Disunting Selepas Siap' } });
    expect(checkbox.checked).toBe(false);
    expect(container.querySelectorAll('video').length).toBe(0);
    expect(downloadBtn).toBeDisabled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(renderedSrc);

    // 3. Confirm & trigger error -> edit lyric1 clears error alert & resets confirmation
    fireEvent.click(checkbox);
    await act(async () => {
      fireEvent.click(generateBtn);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/Lyric test render error/i);

    fireEvent.change(lyric1, { target: { value: 'Lirik Bingkai 1 Selepas Ralat' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(checkbox.checked).toBe(false);
  });
});
