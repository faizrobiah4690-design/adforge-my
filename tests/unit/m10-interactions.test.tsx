import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JingleTab } from '../../src/components/tabs/JingleTab';
import { VideoTab } from '../../src/components/tabs/VideoTab';
import { I18nProvider, useI18n } from '../../src/i18n/I18nContext';
import { CampaignProvider, useCampaign } from '../../src/state/CampaignContext';
import { WORKBENCH_STORAGE_KEY, WorkbenchProvider, useWorkbench } from '../../src/state/WorkbenchContext';
import * as audioExportModule from '../../src/utils/audioExport';
import {
  INTERACTIONS_ENDPOINT,
  buildLyriaJinglePrompt,
  buildVideoStoryboardPrompt,
  generateLyriaJingleWithInteractions,
  generateVideoWithInteractions,
  getDefaultMusicEngine,
  getDefaultVideoEngine,
  hasLiveApiAccess,
} from '../../src/utils/interactionsApi';
import * as videoExportModule from '../../src/utils/videoExport';

function seedAuthInStorage(options: { byokKey: string; isDemoMode: boolean }) {
  window.localStorage.setItem(
    WORKBENCH_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      isLoggedIn: true,
      freelancerEmail: 'freelancer@adforge.my',
      byokKey: options.byokKey,
      isDemoMode: options.isDemoMode,
      activeScreen: 'workbench',
      activeBrandId: 'demo-bisnes-saya',
      brands: [],
    })
  );
}

function ProbeControls() {
  const { setLocale } = useI18n();
  const { saveByokKey } = useWorkbench();
  const { generateVideo, launchCampaign } = useCampaign();
  return (
    <div>
      <button type="button" data-testid="probe-en" onClick={() => setLocale('en')}>
        EN
      </button>
      <button type="button" data-testid="probe-ms" onClick={() => setLocale('ms')}>
        MS
      </button>
      <button
        type="button"
        data-testid="probe-switch-demo"
        onClick={() => saveByokKey('', true)}
      >
        Demo
      </button>
      <button
        type="button"
        data-testid="probe-direct-gen-video"
        onClick={() => {
          void generateVideo();
        }}
      >
        DirectGenVideo
      </button>
      <button
        type="button"
        data-testid="probe-relaunch"
        onClick={() => {
          launchCampaign({ offerSentence: 'Tawaran Kempen Baru M10' });
        }}
      >
        Relaunch
      </button>
    </div>
  );
}

function makeFakeAudioBlob(mimeType = 'audio/wav') {
  return new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4])], {
    type: mimeType,
  });
}

function makeFakeVideoBlob(mimeType = 'video/webm') {
  return new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])], {
    type: mimeType,
  });
}

describe('M10 interactionsApi module', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves live API access and default engines for BYOK vs Demo/invalid keys', () => {
    expect(hasLiveApiAccess(false, 'sk-live-m10-test-key-123')).toBe(true);
    expect(hasLiveApiAccess(true, 'sk-live-m10-test-key-123')).toBe(false);
    expect(hasLiveApiAccess(false, 'short')).toBe(false);
    expect(hasLiveApiAccess(false, 'key with spaces 1234')).toBe(false);

    expect(getDefaultMusicEngine(false, 'sk-live-m10-test-key-123')).toBe('lyria-3-clip-preview');
    expect(getDefaultMusicEngine(true, 'sk-live-m10-test-key-123')).toBe('local');
    expect(getDefaultMusicEngine(false, '')).toBe('local');

    expect(getDefaultVideoEngine(false, 'sk-live-m10-test-key-123')).toBe('gemini-omni-1.2-flash');
    expect(getDefaultVideoEngine(true, 'sk-live-m10-test-key-123')).toBe('local');
    expect(getDefaultVideoEngine(false, 'short')).toBe('local');
  });

  it('builds structured Lyria and 9:16 Video Storyboard prompts incorporating brand, offer, tone, and frames', () => {
    const brand = {
      id: 'kopi-kuantan',
      name: 'Kopi Kuantan',
      logoDataUrl: '/assets/brands/demo-brand-logo.png',
      themeColor: '#F59E0B',
      tone: 'casual' as const,
      whatsappNumber: '60198887777',
      updatedAt: '2026-11-18T00:00:00Z',
    };

    const lyriaPrompt = buildLyriaJinglePrompt({
      brand,
      offerSentence: 'Beli 2 Kopi Percuma 1 Kek',
      style: 'pop-ceria',
      lyrics: 'Kopi Kuantan pilihan ramai!',
    });
    expect(lyriaPrompt).toContain('Kopi Kuantan');
    expect(lyriaPrompt).toContain('Beli 2 Kopi Percuma 1 Kek');
    expect(lyriaPrompt).toContain('124 BPM');
    expect(lyriaPrompt).toContain('Kopi Kuantan pilihan ramai!');

    const videoPrompt = buildVideoStoryboardPrompt({
      brand,
      offerSentence: 'Beli 2 Kopi Percuma 1 Kek',
      jingleStyle: 'korporat-segar',
      frames: [
        {
          id: 'frame-1',
          index: 0,
          startSec: 0,
          endSec: 1.35,
          photoIndex: 0,
          overlayHeadline: 'Kopi Kuantan Segar',
          lyricLine: 'Rasa kopi asli',
        },
        {
          id: 'frame-2',
          index: 1,
          startSec: 1.35,
          endSec: 2.75,
          photoIndex: 1,
          overlayHeadline: 'Beli 2 Percuma 1',
          lyricLine: 'Minggu ini sahaja',
        },
      ],
    });
    expect(videoPrompt).toContain('9:16');
    expect(videoPrompt).toContain('Kopi Kuantan');
    expect(videoPrompt).toContain('#F59E0B');
    expect(videoPrompt).toContain('Beli 2 Kopi Percuma 1 Kek');
    expect(videoPrompt).toContain('108 BPM');
    expect(videoPrompt).toContain('Kopi Kuantan Segar');
    expect(videoPrompt).toContain('Minggu ini sahaja');
  });

  it('never calls fetch in Demo Mode, invalid key, or local engine for audio and video', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const r1 = await generateLyriaJingleWithInteractions({
      apiKey: 'sk-live-m10-test-key-123',
      isDemoMode: true,
      model: 'lyria-3-clip-preview',
      input: 'prompt',
    });
    const r2 = await generateLyriaJingleWithInteractions({
      apiKey: 'short',
      isDemoMode: false,
      model: 'lyria-3.5',
      input: 'prompt',
    });
    const r3 = await generateLyriaJingleWithInteractions({
      apiKey: 'sk-live-m10-test-key-123',
      isDemoMode: false,
      model: 'local',
      input: 'prompt',
    });

    const v1 = await generateVideoWithInteractions({
      apiKey: 'sk-live-m10-test-key-123',
      isDemoMode: true,
      model: 'gemini-omni-1.2-flash',
      input: 'prompt',
    });
    const v2 = await generateVideoWithInteractions({
      apiKey: 'sk-live-m10-test-key-123',
      isDemoMode: false,
      model: 'local',
      input: 'prompt',
    });

    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(false);
    expect(v1.ok).toBe(false);
    expect(v2.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('parses Lyria output_audio and outputs/steps base64 into audio/mpeg Blob and sends exact headers/body', async () => {
    const sampleB64 = btoa('ID3-mock-mp3-audio-bytes');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output_audio: {
            data: `data:audio/mpeg;base64,${sampleB64}`,
            mime_type: 'audio/mpeg',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const res = await generateLyriaJingleWithInteractions({
      apiKey: '  sk-live-m10-test-key-123  ',
      isDemoMode: false,
      model: 'lyria-3-clip-preview',
      input: 'Lyria prompt',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(INTERACTIONS_ENDPOINT);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'sk-live-m10-test-key-123',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'lyria-3-clip-preview',
      input: 'Lyria prompt',
      store: false,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.fileExtension).toBe('mp3');
      expect(res.mimeType).toBe('audio/mpeg');
      expect(res.blob.size).toBeGreaterThan(0);
    }

    // Also verify steps[] URL-safe base64 inlineData extraction for lyria-3.5
    const urlSafeB64 = btoa('RIFF-wave-bytes').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          steps: [
            {
              outputs: [
                {
                  inlineData: {
                    mimeType: 'audio/wav',
                    data: urlSafeB64,
                  },
                },
              ],
            },
          ],
        }),
        { status: 200 }
      )
    );

    const res35 = await generateLyriaJingleWithInteractions({
      apiKey: 'sk-live-m10-test-key-123',
      isDemoMode: false,
      model: 'lyria-3.5',
      input: 'Lyria 3.5 prompt',
    });
    expect(res35.ok).toBe(true);
    if (res35.ok) {
      expect(res35.fileExtension).toBe('wav');
      expect(res35.mimeType).toBe('audio/wav');
    }
  });

  it('sends 9:16 720p 6s response_format for Gemini Omni/Veo, fetches trusted Google uri, and rejects untrusted http uri', async () => {
    const mp4Bytes = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // 1. Trusted googleapis URI response
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            outputs: [
              {
                type: 'video',
                uri: 'https://generativelanguage.googleapis.com/v1beta/files/mock-video-123',
                mime_type: 'video/mp4',
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(mp4Bytes, {
          status: 200,
          headers: { 'Content-Type': 'video/mp4' },
        })
      );

    const okRes = await generateVideoWithInteractions({
      apiKey: 'sk-live-m10-omni-key-456',
      isDemoMode: false,
      model: 'gemini-omni-1.2-flash',
      input: 'Omni 9:16 prompt',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [postUrl, postInit] = fetchSpy.mock.calls[0];
    expect(postUrl).toBe(INTERACTIONS_ENDPOINT);
    expect(JSON.parse(String(postInit?.body))).toEqual({
      model: 'gemini-omni-1.2-flash',
      input: 'Omni 9:16 prompt',
      store: false,
      response_format: {
        type: 'video',
        duration: '6s',
        resolution: '720p',
        aspect_ratio: '9:16',
      },
    });
    expect(fetchSpy.mock.calls[1][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/files/mock-video-123'
    );
    expect(okRes.ok).toBe(true);
    if (okRes.ok) {
      expect(okRes.fileExtension).toBe('mp4');
      expect(okRes.mimeType).toBe('video/mp4');
      expect(okRes.blob.size).toBe(mp4Bytes.length);
    }

    // 2. Untrusted http:// URI must NEVER be fetched
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output_video: {
            uri: 'http://untrusted.example.com/evil.mp4',
          },
        }),
        { status: 200 }
      )
    );

    const rejectedRes = await generateVideoWithInteractions({
      apiKey: 'sk-live-m10-omni-key-456',
      isDemoMode: false,
      model: 'veo-3.1-generate-preview',
      input: 'Veo prompt',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3); // no 4th fetch to untrusted host
    expect(rejectedRes.ok).toBe(false);
  });

  it('returns { ok: false } without throwing on HTTP errors, network failures, or timeouts', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

    const httpFail = await generateLyriaJingleWithInteractions({
      apiKey: 'sk-live-m10-test-key-123',
      isDemoMode: false,
      model: 'lyria-3-clip-preview',
      input: 'prompt',
    });
    expect(httpFail.ok).toBe(false);

    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const netFail = await generateVideoWithInteractions({
      apiKey: 'sk-live-m10-test-key-123',
      isDemoMode: false,
      model: 'gemini-omni-1.2-flash',
      input: 'prompt',
    });
    expect(netFail.ok).toBe(false);

    fetchSpy.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );
    const timeoutFail = await generateLyriaJingleWithInteractions({
      apiKey: 'sk-live-m10-test-key-123',
      isDemoMode: false,
      model: 'lyria-3.5',
      input: 'prompt',
      timeoutMs: 100,
    });
    expect(timeoutFail).toEqual({ ok: false, reason: 'timeout' });
  });
});

describe('M10 Tab 3 & Tab 4 UI + CampaignContext integration', () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    window.localStorage.clear();
    let seq = 0;
    URL.createObjectURL = vi.fn(() => `blob:m10-media-${++seq}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it('Tab 3: defaults to lyria-3-clip-preview for BYOK, downloads .mp3 on live success, and falls back to local WAV on 429 error', async () => {
    seedAuthInStorage({ byokKey: 'sk-live-m10-byok-key-999', isDemoMode: false });

    const origCreate = document.createElement.bind(document);
    let lastDownload = '';
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreate(tagName);
      if (tagName.toLowerCase() === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {
          lastDownload = (el as HTMLAnchorElement).download;
        });
      }
      return el;
    });

    const mp3B64 = btoa('mock-lyria-mp3-stream');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            outputs: [{ type: 'audio', data: mp3B64, mime_type: 'audio/mpeg' }],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response('Quota exceeded', { status: 429 }));

    const wavSpy = vi
      .spyOn(audioExportModule, 'generateJingleAudio')
      .mockResolvedValue({
        wavBlob: makeFakeAudioBlob('audio/wav'),
        previewUrl: 'blob:local-wav-fallback',
        audioBuffer: {} as AudioBuffer,
        durationSec: 5.5,
        sampleRate: 48000,
      });

    render(
      <I18nProvider>
        <WorkbenchProvider>
          <CampaignProvider>
            <ProbeControls />
            <JingleTab />
          </CampaignProvider>
        </WorkbenchProvider>
      </I18nProvider>
    );

    expect(screen.getByTestId('jingle-engine-lyria-3-clip-preview')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('jingle-engine-lyria-3-5')).toBeEnabled();

    // Live Lyria 3 Clip success -> .mp3 download + live badge
    fireEvent.click(screen.getByTestId('jingle-generate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('jingle-audio-player')).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(wavSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('jingle-engine-status-badge')).toHaveTextContent(
      /Dijana oleh Live Lyria API/i
    );
    fireEvent.click(screen.getByTestId('jingle-download-btn'));
    expect(lastDownload).toBe('jingle-demo-bisnes-saya-pop-ceria.mp3');

    // Switch to Lyria 3.5 -> HTTP 429 falls back cleanly to local WAV + fallback badge
    fireEvent.click(screen.getByTestId('jingle-engine-lyria-3-5'));
    fireEvent.click(screen.getByTestId('jingle-generate-btn'));

    await waitFor(() => {
      expect(wavSpy).toHaveBeenCalledTimes(1);
    });
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body)).model).toBe('lyria-3.5');
    expect(screen.getByTestId('jingle-engine-status-badge')).toHaveTextContent(
      /Simulasi Pelayar Tempatan/i
    );
    expect(screen.getByTestId('jingle-engine-status-badge')).toHaveTextContent(/Paid Tier/i);

    fireEvent.click(screen.getByTestId('probe-en'));
    expect(screen.getByTestId('jingle-engine-status-badge')).toHaveTextContent(
      /Local Browser Simulation/i
    );

    fireEvent.click(screen.getByTestId('jingle-download-btn'));
    expect(lastDownload).toBe('jingle-demo-bisnes-saya-pop-ceria.wav');
  });

  it('Tab 3: makes ZERO fetch calls in Demo Mode or when local engine is chosen', async () => {
    seedAuthInStorage({ byokKey: 'sk-live-m10-byok-key-999', isDemoMode: true });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const wavSpy = vi
      .spyOn(audioExportModule, 'generateJingleAudio')
      .mockResolvedValue({
        wavBlob: makeFakeAudioBlob('audio/wav'),
        previewUrl: 'blob:demo-wav-1',
        audioBuffer: {} as AudioBuffer,
        durationSec: 5.5,
        sampleRate: 48000,
      });

    render(
      <I18nProvider>
        <WorkbenchProvider>
          <CampaignProvider>
            <JingleTab />
          </CampaignProvider>
        </WorkbenchProvider>
      </I18nProvider>
    );

    expect(screen.getByTestId('jingle-engine-local')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('jingle-engine-lyria-3-clip-preview')).toBeDisabled();
    expect(screen.getByTestId('jingle-engine-lyria-3-5')).toBeDisabled();
    expect(screen.getByTestId('jingle-engine-demo-note')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('jingle-generate-btn'));
    await waitFor(() => {
      expect(wavSpy).toHaveBeenCalledTimes(1);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Tab 4: enforces Storyboard Confirmation Gate before any Video API call, supports Gemini Omni 1.2 Flash + Veo 3.1 live & fallback', async () => {
    seedAuthInStorage({ byokKey: 'sk-live-m10-byok-key-999', isDemoMode: false });

    const origCreate = document.createElement.bind(document);
    let lastVideoDownload = '';
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreate(tagName);
      if (tagName.toLowerCase() === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {
          lastVideoDownload = (el as HTMLAnchorElement).download;
        });
      }
      return el;
    });

    const mp4B64 = btoa('mock-mp4-video-stream');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_video: { data: mp4B64, mime_type: 'video/mp4' },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response('Billing required', { status: 403 }));

    const audioBufSpy = vi
      .spyOn(audioExportModule, 'resolveVideoAudioBuffer')
      .mockResolvedValue({
        audioBuffer: {} as AudioBuffer,
        audioSourceUsed: 'fallback-preseeded',
      });

    const muxSpy = vi
      .spyOn(videoExportModule, 'exportVerticalVideo')
      .mockResolvedValue({
        blob: makeFakeVideoBlob('video/webm'),
        mimeType: 'video/webm',
        fileExtension: 'webm',
        durationSec: 5.5,
        width: 540,
        height: 960,
      });

    render(
      <I18nProvider>
        <WorkbenchProvider>
          <CampaignProvider>
            <ProbeControls />
            <VideoTab />
          </CampaignProvider>
        </WorkbenchProvider>
      </I18nProvider>
    );

    expect(screen.getByTestId('video-engine-gemini-omni-1-2-flash')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Gate check: button disabled AND direct call to generateVideo() makes ZERO fetch calls
    expect(screen.getByTestId('video-generate-btn')).toBeDisabled();
    fireEvent.click(screen.getByTestId('probe-direct-gen-video'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    // Confirm storyboard -> Gemini Omni 1.2 Flash live success -> .mp4 download + live badge
    fireEvent.click(screen.getByTestId('video-confirm-checkbox'));
    expect(screen.getByTestId('video-generate-btn')).toBeEnabled();
    fireEvent.click(screen.getByTestId('video-generate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('video-preview-player')).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const omniPayload = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(omniPayload.model).toBe('gemini-omni-1.2-flash');
    expect(omniPayload.response_format).toEqual({
      type: 'video',
      duration: '6s',
      resolution: '720p',
      aspect_ratio: '9:16',
    });
    expect(screen.getByTestId('video-engine-status-badge')).toHaveTextContent(
      /Live Gemini Omni 1\.2 Flash/i
    );
    expect(screen.getByTestId('video-audio-source-badge')).toHaveTextContent(
      /Audio Asli AI/i
    );
    fireEvent.click(screen.getByTestId('video-download-btn'));
    expect(lastVideoDownload).toBe('video-9x16-demo-bisnes-saya.mp4');

    // Switch to Veo 3.1 -> HTTP 403 falls back automatically to local Canvas+Audio muxer (.webm)
    fireEvent.click(screen.getByTestId('video-engine-veo-3-1-generate-preview'));
    fireEvent.click(screen.getByTestId('video-generate-btn'));

    await waitFor(() => {
      expect(muxSpy).toHaveBeenCalledTimes(1);
    });
    expect(audioBufSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body)).model).toBe(
      'veo-3.1-generate-preview'
    );
    expect(screen.getByTestId('video-engine-status-badge')).toHaveTextContent(
      /Simulasi Pelayar Tempatan/i
    );
    expect(screen.getByTestId('video-audio-source-badge')).toHaveTextContent(/Sandaran/i);

    fireEvent.click(screen.getByTestId('video-download-btn'));
    expect(lastVideoDownload).toBe('video-9x16-demo-bisnes-saya.webm');

    // Switching to Demo Mode disables live engines & makes ZERO fetch calls
    fireEvent.click(screen.getByTestId('probe-switch-demo'));
    expect(screen.getByTestId('video-engine-local')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('video-engine-gemini-omni-1-2-flash')).toBeDisabled();
    fireEvent.click(screen.getByTestId('video-generate-btn'));

    await waitFor(() => {
      expect(muxSpy).toHaveBeenCalledTimes(2);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('discards stale in-flight Lyria response when campaign relaunches mid-flight', async () => {
    seedAuthInStorage({ byokKey: 'sk-live-m10-byok-key-999', isDemoMode: false });

    let resolveFetch!: (res: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(
      <I18nProvider>
        <WorkbenchProvider>
          <CampaignProvider>
            <ProbeControls />
            <JingleTab />
          </CampaignProvider>
        </WorkbenchProvider>
      </I18nProvider>
    );

    fireEvent.click(screen.getByTestId('jingle-generate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('jingle-generate-btn')).toBeDisabled();
    });

    // Relaunch mid-flight -> increments epoch & cancels stale request
    fireEvent.click(screen.getByTestId('probe-relaunch'));
    expect(screen.getByTestId('jingle-generate-btn')).toBeEnabled();

    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify({
            output_audio: { data: btoa('stale-mp3'), mime_type: 'audio/mpeg' },
          }),
          { status: 200 }
        )
      );
      await Promise.resolve();
    });

    expect(screen.queryByTestId('jingle-audio-player')).not.toBeInTheDocument();
  });
});
