import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { I18nProvider } from '../../src/i18n/I18nContext';
import { CampaignProvider, useCampaign } from '../../src/state/CampaignContext';
import { WorkbenchProvider } from '../../src/state/WorkbenchContext';
import { CarouselTab } from '../../src/components/tabs/CarouselTab';
import { JingleTab } from '../../src/components/tabs/JingleTab';
import type { BrandProfile, CarouselSlide, PhotoAsset, StoryboardFrame } from '../../src/types/campaign';
import {
  JINGLE_DURATION_SEC,
  JINGLE_SAMPLE_RATE,
  buildJingleLyrics,
  computeRms,
  synthesizeJinglePcm,
} from '../../src/utils/audioExport';
import {
  buildPollinationsBackgroundPrompt,
  generateAiCarouselBackground,
  isAllowedImageSrc,
  renderSlideToCanvas,
  resolveSlideLayoutVariant,
} from '../../src/utils/carouselExport';
import { checkCopyCompliance } from '../../src/utils/compliance';
import { extractOfferDetails } from '../../src/utils/offerDetails';
import { truncateAtWordBoundary } from '../../src/utils/whatsapp';
import {
  POLLINATIONS_COOLDOWN_MS,
  POLLINATIONS_TEXT_ENDPOINT,
  buildCarouselSlides,
  buildCustomerPsychology,
  buildStoryboardFrames,
  generateCampaignCopyMap,
  generateCampaignWithAiCascade,
  generateCampaignWithPollinations,
  getPollinationsCooldownUntil,
  resetPollinationsCooldown,
} from '../../src/utils/copyGenerator';
import { exportVerticalVideo } from '../../src/utils/videoExport';

const TEST_BRAND: BrandProfile = {
  id: 'ulike-hellokitty',
  name: 'Ulike X HelloKitty',
  logoDataUrl: '/assets/brands/demo-brand-logo.png',
  themeColor: '#EC4899',
  tone: 'casual',
  whatsappNumber: '60198887766',
  isSeeded: false,
  updatedAt: '2026-11-18T00:00:00.000Z',
};

const TEST_PHOTOS: [PhotoAsset, PhotoAsset] = [
  {
    id: 'p1',
    label: 'Foto 1',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    isSample: false,
  },
  {
    id: 'p2',
    label: 'Foto 2',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    isSample: false,
  },
];

const TEST_OFFER = 'Edisi Khas diskaun 20% RM899 sempena Minggu Gaji, stok & slot terhad';
const TEST_USP = 'Alat IPL buang bulu tanpa rasa panas | untuk wanita sibuk & kolektor HelloKitty';

const FORBIDDEN_CLICHES = [
  'Daripada proses lama yang tidak teratur',
  'Risau caj tersembunyi, lambat dapat jawapan di mesej',
  'Pelanggan harian & pembeli pantas di Malaysia yang mencari',
  'Pelanggan aktif di Malaysia yang mencari',
  'Golongan profesional dan pembeli berorientasikan kualiti yang menilai',
  'Pembuat keputusan berasaskan pulangan nilai yang menilai nisbah kos-kepada-manfaat',
  'Tanya Jambatan Pakej Kini',
  'Usah tangguhkan keperluan anda',
  'Mengapa menunda keperluan',
  'Piawaian Nilai & Penyelesaian',
  'Elakkan kos berulang',
  'Rekod Kepuasan Pelanggan',
  'Tinggalkan Rutin Lama Yang Leceh',
  'JAMBATAN SOLUSI',
  'Mudah & Kemas Untuk Rutin Anda',
  'Mudah, telus dan kemas untuk rutin anda',
  'Pilihan Utama',
];

function createCanvasMockRecorder() {
  const fillTexts: string[] = [];
  const fillColors: string[] = [];
  const drawImageCalls: unknown[][] = [];
  let gradCalls = 0;

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'left' as CanvasTextAlign,
    globalAlpha: 1,
    fillRect: vi.fn(function (this: { fillStyle: unknown }) {
      if (typeof this.fillStyle === 'string') fillColors.push(this.fillStyle);
    }),
    fill: vi.fn(function (this: { fillStyle: unknown }) {
      if (typeof this.fillStyle === 'string') fillColors.push(this.fillStyle);
    }),
    stroke: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn((...args: unknown[]) => {
      drawImageCalls.push(args);
    }),
    fillText: vi.fn((text: string) => {
      fillTexts.push(text);
    }),
    measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
    createLinearGradient: vi.fn(() => {
      gradCalls += 1;
      return { addColorStop: vi.fn() };
    }),
  };

  return {
    ctx,
    fillTexts,
    fillColors,
    drawImageCalls,
    getGradCalls: () => gradCalls,
  };
}

describe('M12 Built-In Keyless AI & Pro Creative Overhaul', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetPollinationsCooldown();
    (globalThis as { __ADFORGE_ALLOW_LIVE_AI_IN_TESTS__?: boolean }).__ADFORGE_ALLOW_LIVE_AI_IN_TESTS__ =
      undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPollinationsCooldown();
    (globalThis as { __ADFORGE_ALLOW_LIVE_AI_IN_TESTS__?: boolean }).__ADFORGE_ALLOW_LIVE_AI_IN_TESTS__ =
      undefined;
  });

  it('1. Opens directly in Built-In Keyless AI workbench and surfaces honest BYOK failure alert on Gemini error', async () => {
    (globalThis as { __ADFORGE_ALLOW_LIVE_AI_IN_TESTS__?: boolean }).__ADFORGE_ALLOW_LIVE_AI_IN_TESTS__ =
      true;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('/assets/')) {
        return new Response(null, { status: 404 });
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        return new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), {
          status: 401,
        });
      }
      if (url === POLLINATIONS_TEXT_ENDPOINT) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    visualSummary: 'Peranti IPL tanpa rasa panas edisi HelloKitty',
                    psychology: {
                      targetPersona: 'Wanita bekerjaya yang mahu penjagaan rumah pantas.',
                      coreTrigger: 'Jimat masa & harga RM899 minggu gaji.',
                      frictionObjections: 'Pastikan set tulen dan ada panduan.',
                      trustAnchors: 'Set lengkap dengan jaminan rasmi.',
                    },
                    angles: {
                      urgency: {
                        facebook: {
                          primaryText: 'Batch HelloKitty makin susut! Grab diskaun 20% sekarang.',
                          headline: 'Ulike X HelloKitty Terhad',
                          description: 'RM899 • Slot terhad',
                        },
                      },
                    },
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    render(<App />);

    // Fresh load bypasses BYOK wall
    expect(screen.getByTestId('brand-vault-screen')).toBeInTheDocument();
    expect(screen.getByTestId('header-ai-mode-badge')).toHaveTextContent(
      /AI Terbina Dalam|Built-In AI/i
    );

    // Save an invalid/rejected Google BYOK key in header modal
    fireEvent.click(screen.getByTestId('nav-onboarding'));
    expect(screen.getByTestId('use-builtin-ai-btn')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('byok-input'), {
      target: { value: 'sk-bad-google-key-12345' },
    });
    fireEvent.click(screen.getByTestId('byok-save-btn'));

    expect(screen.getByTestId('header-ai-mode-badge')).toHaveTextContent(/Google BYOK/i);

    fireEvent.click(screen.getByTestId('launch-campaign-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('byok-fallback-alert')).toBeInTheDocument();
    });
    expect(screen.getByTestId('byok-fallback-alert')).toHaveTextContent(/401/);
    expect(screen.getByTestId('campaign-engine-status-badge')).toHaveTextContent(
      /AI Terbina Dalam|OpenAI Fast/i
    );
  });

  it('2. Calls single-call text.pollinations.ai/openai (openai-fast, reasoning_effort: low), enforces 45s cooldown, and handles 429/malformed JSON', async () => {
    (globalThis as { __ADFORGE_ALLOW_LIVE_AI_IN_TESTS__?: boolean }).__ADFORGE_ALLOW_LIVE_AI_IN_TESTS__ =
      true;

    const capturedBody: {
      model?: string;
      reasoning_effort?: string;
      response_format?: unknown;
    } = {};
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      expect(url).toBe(POLLINATIONS_TEXT_ENDPOINT);
      Object.assign(capturedBody, JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '```json\n' +
                  JSON.stringify({
                    visualSummary: 'Alat IPL penyejuk edisi khas merah jambu',
                    psychology: {
                      targetPersona: 'Wanita sibuk yang mahu sesi pantas di rumah.',
                      coreTrigger: 'Penjimatan 20% sempena minggu gaji.',
                      frictionObjections: 'Ingin kepastian keaslian produk.',
                      trustAnchors: 'Pakej rasmi beserta panduan.',
                    },
                    angles: {
                      urgency: {
                        facebook: {
                          primaryText: 'Kulit anda kusam? Grab 100% dijamin sekarang!',
                          headline: 'Jimat 20% Minggu Gaji',
                          description: 'Stok batch awal terhad',
                        },
                      },
                    },
                    carouselSlides: [
                      {
                        badgeText: 'VIP',
                        headline: 'IPL Sejuk Di Rumah',
                        subheadline: 'Siap dalam 10 minit',
                        ctaText: 'Slide 1 / 4',
                      },
                    ],
                    jingleLyrics: 'Ulike X HelloKitty memang padu,\nJimat 20% minggu gaji!',
                    storyboardFrames: [
                      { overlayHeadline: 'IPL Sejuk Di Rumah', lyricLine: 'Baris 1' },
                      { overlayHeadline: 'Tanpa Rasa Panas', lyricLine: 'Baris 2' },
                      { overlayHeadline: 'RM899 Sahaja', lyricLine: 'Baris 3' },
                      { overlayHeadline: 'Klik Sini', lyricLine: 'Baris 4' },
                    ],
                  }) +
                  '\n```',
              },
            },
          ],
        }),
        { status: 200 }
      );
    });

    const firstRes = await generateCampaignWithPollinations({
      isDemoMode: false,
      brand: TEST_BRAND,
      offerSentence: TEST_OFFER,
      uspAndAudience: TEST_USP,
      variationIndex: 1,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(capturedBody.model).toBe('openai-fast');
    expect(capturedBody.reasoning_effort).toBe('low');
    expect(capturedBody.response_format).toEqual({ type: 'json_object' });
    expect(firstRes.source).toBe('pollinations-openai-fast');
    expect(firstRes.visualSummary).toContain('IPL penyejuk');
    expect(checkCopyCompliance(firstRes.copyByAngle.urgency.facebook.primaryText)).toHaveLength(0);
    expect(firstRes.storyboardFrames[0].overlayHeadline).toContain(TEST_BRAND.name);
    expect(firstRes.storyboardFrames[3].overlayHeadline).toContain(`+${TEST_BRAND.whatsappNumber}`);
    expect(getPollinationsCooldownUntil()).toBeGreaterThan(Date.now());
    expect(getPollinationsCooldownUntil()).toBeLessThanOrEqual(
      Date.now() + POLLINATIONS_COOLDOWN_MS + 1000
    );

    // 2nd rapid call within 45s MUST skip network call and fall back cleanly
    const secondRes = await generateCampaignWithPollinations({
      isDemoMode: false,
      brand: TEST_BRAND,
      offerSentence: TEST_OFFER,
      uspAndAudience: TEST_USP,
      variationIndex: 2,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(secondRes.source).toBe('offline-smart-fallback');

    // Reset cooldown & verify HTTP 429 / malformed JSON fallback
    resetPollinationsCooldown();
    fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    const rateLimited = await generateCampaignWithPollinations({
      isDemoMode: false,
      brand: TEST_BRAND,
      offerSentence: TEST_OFFER,
      variationIndex: 3,
    });
    expect(rateLimited.source).toBe('offline-smart-fallback');
    expect(rateLimited.pollinationsErrorReason).toContain('429');

    // Demo Mode strictly makes 0 fetch calls
    resetPollinationsCooldown();
    fetchSpy.mockClear();
    const demoRes = await generateCampaignWithAiCascade({
      apiKey: 'sk-valid-byok-key-123456',
      isDemoMode: true,
      brand: TEST_BRAND,
      offerSentence: TEST_OFFER,
      photos: TEST_PHOTOS,
      variationIndex: 1,
    });
    expect(demoRes.source).toBe('offline-smart-demo');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('3. Purges all legacy clichés, propagates uspAndAudience across Tabs 1-4, and preserves 5/5 distinctness & 0 compliance findings', () => {
    const tones: Array<BrandProfile['tone']> = ['casual', 'professional'];
    const seenFb = new Set<string>();

    for (const tone of tones) {
      const brand = { ...TEST_BRAND, tone };
      for (let v = 1; v <= 5; v += 1) {
        const psych = buildCustomerPsychology(brand, TEST_OFFER, v, TEST_USP);
        const copyMap = generateCampaignCopyMap(brand, TEST_OFFER, v, TEST_USP);
        const slides = buildCarouselSlides(brand, TEST_OFFER, v, null, TEST_USP);
        const frames = buildStoryboardFrames(brand, TEST_OFFER, 'Baris 1\nBaris 2', v, null, TEST_USP);

        if (tone === 'casual') {
          seenFb.add(copyMap.urgency.facebook.primaryText);
        }

        const textsToAudit = [
          psych.targetPersona,
          psych.coreTrigger,
          psych.frictionObjections,
          psych.trustAnchors,
          ...(['urgency', 'value', 'social_proof'] as const).flatMap((ang) => [
            copyMap[ang].facebook.primaryText,
            copyMap[ang].facebook.headline,
            copyMap[ang].facebook.description,
            copyMap[ang].instagram.caption,
            copyMap[ang].tiktok.hook,
            copyMap[ang].tiktok.script,
            copyMap[ang].tiktok.caption,
            ...copyMap[ang].google_rsa.headlines,
            ...copyMap[ang].google_rsa.descriptions,
          ]),
          ...slides.flatMap((s) => [s.badgeText, s.headline, s.subheadline, s.ctaText]),
          ...frames.flatMap((f) => [f.overlayHeadline, f.lyricLine]),
        ];

        for (const txt of textsToAudit) {
          expect(checkCopyCompliance(txt)).toHaveLength(0);
          for (const cliche of FORBIDDEN_CLICHES) {
            expect(txt.toLowerCase()).not.toContain(cliche.toLowerCase());
          }
        }
      }
    }
    expect(seenFb.size).toBe(5);

    // Render App and test QuickCampaignForm usp-audience-input propagation
    render(<App />);
    fireEvent.change(screen.getByTestId('usp-audience-input'), {
      target: { value: 'Tanpa rasa panas untuk wanita sibuk' },
    });
    fireEvent.click(screen.getByTestId('launch-campaign-btn'));
    expect(screen.getByTestId('strategy-usp-summary')).toHaveTextContent(
      'Tanpa rasa panas untuk wanita sibuk'
    );
  });

  it('4. Tab 2 generates Pollinations AI background as taint-free base64 JPEG and renders 4 distinct slide layouts', async () => {
    // Guard blocks network when Demo Mode or un-opted test mode
    const guarded = await generateAiCarouselBackground({
      prompt: 'Studio photo',
      isDemoMode: false,
    });
    expect(guarded.ok).toBe(false);
    if (!guarded.ok) {
      expect(guarded.isTestGuard).toBe(true);
    }

    (globalThis as { __ADFORGE_ALLOW_LIVE_AI_IN_TESTS__?: boolean }).__ADFORGE_ALLOW_LIVE_AI_IN_TESTS__ =
      true;

    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(fakeJpeg, {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );

    const prompt = buildPollinationsBackgroundPrompt(
      TEST_BRAND,
      TEST_OFFER,
      {
        id: 'slide-1',
        index: 0,
        role: 'hook',
        photoIndex: 0,
        badgeText: 'PROMO',
        headline: 'Tajuk',
        subheadline: 'Sub',
        ctaText: 'Slide 1 / 4',
        editedByUser: false,
      },
      TEST_USP
    );
    expect(prompt).toContain('no text');
    expect(prompt).toContain('no watermark');

    const bgRes = await generateAiCarouselBackground({
      prompt,
      aspectMode: '9:16',
      seed: 12345,
      isDemoMode: false,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(bgRes.ok).toBe(true);
    if (bgRes.ok) {
      expect(bgRes.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
      expect(isAllowedImageSrc(bgRes.dataUrl)).toBe(true);
    }

    // Verify 4 distinct slide layouts in renderSlideToCanvas
    const slides = buildCarouselSlides(TEST_BRAND, TEST_OFFER, 1, null, TEST_USP);
    expect(slides.map(resolveSlideLayoutVariant)).toEqual([
      'hero_hook',
      'problem_solution',
      'feature_grid',
      'urgent_cta',
    ]);

    const origCreateElement = document.createElement.bind(document);
    const mocks = [
      createCanvasMockRecorder(),
      createCanvasMockRecorder(),
      createCanvasMockRecorder(),
      createCanvasMockRecorder(),
    ];

    for (let i = 0; i < 4; i += 1) {
      const mockCanvas = origCreateElement('canvas');
      vi.spyOn(mockCanvas, 'getContext').mockReturnValue(
        mocks[i].ctx as unknown as CanvasRenderingContext2D
      );
      await renderSlideToCanvas(mockCanvas, {
        slide: slides[i] as CarouselSlide,
        brand: { ...TEST_BRAND, logoDataUrl: '' },
        photoSrc: '',
        aspectMode: '9:16',
        totalSlides: 4,
      });
      expect(mocks[i].fillColors).toContain('#EC4899');
    }

    // Slide 2 draws Problem vs Solution split labels
    expect(mocks[1].fillTexts).toContain('CABARAN BIASA');
    expect(mocks[1].fillTexts).toContain('SOLUSI KAMI');
    // Slide 3 draws 01..04 feature grid badges
    expect(mocks[2].fillTexts).toContain('01');
    expect(mocks[2].fillTexts).toContain('04');
    // Slide 4 draws WhatsApp green CTA pill
    expect(mocks[3].fillColors).toContain('#16A34A');
  });

  it(
    '5a. Tab 3 synthesizes multi-track commercial PCM across 3 styles',
    () => {
      for (const style of ['pop-ceria', 'santai-akustik', 'korporat-segar'] as const) {
        const [left, right] = synthesizeJinglePcm(style, JINGLE_DURATION_SEC, JINGLE_SAMPLE_RATE);
        expect(left.length).toBe(264_000);
        expect(right.length).toBe(264_000);
        expect(computeRms(left)).toBeGreaterThan(0.05);
      }
    },
    15_000
  );

  it(
    '5b. Tab 3 guards Web Speech API TTS voiceover without creating a 2nd <audio> element',
    () => {
      // Test TTS unsupported fallback + supported speak/cancel without creating a 2nd <audio>
      const origSpeech = window.speechSynthesis;
      const origUtterance = (window as unknown as { SpeechSynthesisUtterance?: unknown })
        .SpeechSynthesisUtterance;

      try {
        Object.defineProperty(window, 'speechSynthesis', {
          configurable: true,
          value: undefined,
        });

        const { unmount } = render(
          <I18nProvider>
            <WorkbenchProvider>
              <CampaignProvider>
                <JingleTab />
              </CampaignProvider>
            </WorkbenchProvider>
          </I18nProvider>
        );
        expect(screen.getByTestId('jingle-voiceover-btn')).toBeDisabled();
        expect(screen.getByTestId('jingle-tts-unsupported')).toBeInTheDocument();
        unmount();

        const speakMock = vi.fn();
        const cancelMock = vi.fn();
        class MockUtterance {
          text: string;
          lang = '';
          rate = 1;
          voice: unknown = null;
          onend: (() => void) | null = null;
          onerror: (() => void) | null = null;
          constructor(text: string) {
            this.text = text;
          }
        }

        Object.defineProperty(window, 'speechSynthesis', {
          configurable: true,
          value: {
            speak: speakMock,
            cancel: cancelMock,
            getVoices: () => [{ lang: 'ms-MY', name: 'Melayu' }],
          },
        });
        Object.defineProperty(window, 'SpeechSynthesisUtterance', {
          configurable: true,
          value: MockUtterance,
        });

        const view = render(
          <I18nProvider>
            <WorkbenchProvider>
              <CampaignProvider>
                <JingleTab />
              </CampaignProvider>
            </WorkbenchProvider>
          </I18nProvider>
        );

        expect(view.container.querySelectorAll('audio')).toHaveLength(0);
        const voiceBtn = screen.getByTestId('jingle-voiceover-btn');
        expect(voiceBtn).toBeEnabled();
        fireEvent.click(voiceBtn);
        expect(cancelMock).toHaveBeenCalled();
        expect(speakMock).toHaveBeenCalledTimes(1);
        const spokenUtterance = speakMock.mock.calls[0][0] as MockUtterance;
        expect(spokenUtterance.lang).toBe('ms-MY');
        expect(view.container.querySelectorAll('audio')).toHaveLength(0);

        // Stop voiceover
        fireEvent.click(screen.getByTestId('jingle-voiceover-btn'));
        expect(cancelMock).toHaveBeenCalledTimes(2);
      } finally {
        Object.defineProperty(window, 'speechSynthesis', {
          configurable: true,
          value: origSpeech,
        });
        Object.defineProperty(window, 'SpeechSynthesisUtterance', {
          configurable: true,
          value: origUtterance,
        });
      }
    },
    15_000
  );

  it('6. Tab 4 CapCut-style Ken Burns renderer varies crop rectangles, draws CTA pill, keeps gradCalls <= 3 and 165 logo draws', async () => {
    const recorder = createCanvasMockRecorder();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreate(tagName);
      if (tagName.toLowerCase() === 'canvas') {
        vi.spyOn(el as HTMLCanvasElement, 'getContext').mockReturnValue(
          recorder.ctx as unknown as CanvasRenderingContext2D
        );
      }
      return el;
    });

    const origImage = globalThis.Image;
    const fakePhotos: [PhotoAsset, PhotoAsset] = [
      { id: 'v1', label: 'P1', src: 'data:image/png;base64,AAAA', isSample: false },
      { id: 'v2', label: 'P2', src: 'data:image/png;base64,BBBB', isSample: false },
    ];

    class MockImg {
      naturalWidth = 800;
      naturalHeight = 1200;
      width = 800;
      height = 1200;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(val: string) {
        if (val.includes('demo-brand-logo')) {
          this.naturalWidth = 400;
          this.naturalHeight = 100;
        }
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as unknown as { Image: unknown }).Image = MockImg;

    const encodedVideoTimestamps: number[] = [];
    class MockEncodedChunk {
      type: 'key' | 'delta';
      timestamp: number;
      duration: number;
      byteLength = 16;
      constructor(init: { type: 'key' | 'delta'; timestamp: number; duration: number }) {
        this.type = init.type;
        this.timestamp = init.timestamp;
        this.duration = init.duration;
      }
      copyTo(dest: ArrayBuffer | ArrayBufferView) {
        const view =
          dest instanceof ArrayBuffer ? new Uint8Array(dest) : new Uint8Array(dest.buffer, dest.byteOffset, dest.byteLength);
        view.fill(1);
      }
    }
    class MockVideoEncoder {
      static async isConfigSupported() {
        return { supported: true };
      }
      encodeQueueSize = 0;
      state = 'configured';
      constructor(private opts: { output: (c: unknown, m: unknown) => void }) {}
      configure() {}
      encode(frame: { timestamp: number; duration: number }) {
        encodedVideoTimestamps.push(frame.timestamp);
        this.opts.output(
          new MockEncodedChunk({
            type: encodedVideoTimestamps.length === 1 ? 'key' : 'delta',
            timestamp: frame.timestamp,
            duration: frame.duration,
          }),
          { decoderConfig: { codec: 'vp8', codedWidth: 540, codedHeight: 960 } }
        );
      }
      async flush() {}
      close() {
        this.state = 'closed';
      }
    }
    class MockAudioEncoder {
      static async isConfigSupported() {
        return { supported: true };
      }
      encodeQueueSize = 0;
      state = 'configured';
      constructor(private opts: { output: (c: unknown, m: unknown) => void }) {}
      configure() {}
      encode(audioData: { timestamp: number }) {
        this.opts.output(
          new MockEncodedChunk({
            type: 'key',
            timestamp: audioData.timestamp,
            duration: 20000,
          }),
          {
            decoderConfig: {
              codec: 'opus',
              sampleRate: 48000,
              numberOfChannels: 2,
              description: new Uint8Array(19),
            },
          }
        );
      }
      async flush() {}
      close() {
        this.state = 'closed';
      }
    }
    class MockVideoFrame {
      timestamp: number;
      duration: number;
      constructor(_c: unknown, init: { timestamp: number; duration: number }) {
        this.timestamp = init.timestamp;
        this.duration = init.duration;
      }
      close() {}
    }
    class MockAudioData {
      timestamp: number;
      constructor(init: { timestamp: number }) {
        this.timestamp = init.timestamp;
      }
      close() {}
    }

    const prevVE = (globalThis as Record<string, unknown>).VideoEncoder;
    const prevAE = (globalThis as Record<string, unknown>).AudioEncoder;
    const prevVF = (globalThis as Record<string, unknown>).VideoFrame;
    const prevAD = (globalThis as Record<string, unknown>).AudioData;
    const prevEVC = (globalThis as Record<string, unknown>).EncodedVideoChunk;
    const prevEAC = (globalThis as Record<string, unknown>).EncodedAudioChunk;

    Object.assign(globalThis, {
      VideoEncoder: MockVideoEncoder,
      AudioEncoder: MockAudioEncoder,
      VideoFrame: MockVideoFrame,
      AudioData: MockAudioData,
      EncodedVideoChunk: MockEncodedChunk,
      EncodedAudioChunk: MockEncodedChunk,
    });

    try {
      const fakeAudioBuffer = {
        sampleRate: 48000,
        numberOfChannels: 2,
        length: 264_000,
        duration: 5.5,
        getChannelData: () => new Float32Array(264_000),
      } as unknown as AudioBuffer;

      const frames: StoryboardFrame[] = buildStoryboardFrames(
        TEST_BRAND,
        TEST_OFFER,
        'Baris 1\nBaris 2\nBaris 3\nBaris 4',
        1,
        null,
        TEST_USP
      );

      await act(async () => {
        await exportVerticalVideo({
          frames,
          photos: fakePhotos,
          brand: TEST_BRAND,
          audioBuffer: fakeAudioBuffer,
          durationSec: 5.5,
          offerSentence: TEST_OFFER,
          uspAndAudience: TEST_USP,
        });
      });

      expect(encodedVideoTimestamps).toHaveLength(165);
      expect(recorder.getGradCalls()).toBeLessThanOrEqual(3);

      // 5-arg drawImage calls = logo draws (exactly 165)
      const logoDraws = recorder.drawImageCalls.filter((args) => args.length === 5);
      expect(logoDraws).toHaveLength(165);

      // 9-arg drawImage calls include Ken Burns zoom/pan with varying sx/sw crop rects
      const cropDraws = recorder.drawImageCalls.filter((args) => args.length === 9);
      expect(cropDraws.length).toBeGreaterThanOrEqual(330);
      const firstFrameCropSw = cropDraws[1]?.[3];
      const laterFrameCropSw = cropDraws[60]?.[3];
      expect(firstFrameCropSw).not.toBe(laterFrameCropSw);

      // WhatsApp CTA pill & promo badge rendered
      expect(recorder.fillColors).toContain('#16A34A');
      expect(recorder.fillTexts.some((t) => t.includes('DISKAUN 20%'))).toBe(true);
      expect(recorder.fillTexts.some((t) => t.includes(`WhatsApp +${TEST_BRAND.whatsappNumber}`))).toBe(
        true
      );
    } finally {
      (globalThis as unknown as { Image: unknown }).Image = origImage;
      Object.assign(globalThis, {
        VideoEncoder: prevVE,
        AudioEncoder: prevAE,
        VideoFrame: prevVF,
        AudioData: prevAD,
        EncodedVideoChunk: prevEVC,
        EncodedAudioChunk: prevEAC,
      });
    }
  });

  it('7. Preserves collab-brand subject without "Harga Promo Berbaloi" collapse and avoids mid-word USP cuts across Tabs 1-4', () => {
    const benchmarkOffer = 'Diskaun 20% + Free Gift minggu gaji';
    const benchmarkUsp =
      'Alat IPL buang bulu di rumah tanpa rasa panas, edisi kolaborasi Hello Kitty';

    for (let v = 1; v <= 5; v += 1) {
      const psych = buildCustomerPsychology(TEST_BRAND, benchmarkOffer, v, benchmarkUsp);
      const copyMap = generateCampaignCopyMap(TEST_BRAND, benchmarkOffer, v, benchmarkUsp);
      const slides = buildCarouselSlides(TEST_BRAND, benchmarkOffer, v, null, benchmarkUsp);
      const lyrics = buildJingleLyrics(TEST_BRAND.name, benchmarkOffer, v, benchmarkUsp);
      const frames = buildStoryboardFrames(TEST_BRAND, benchmarkOffer, lyrics, v, null, benchmarkUsp);

      const allFields = [
        psych.targetPersona,
        psych.coreTrigger,
        psych.frictionObjections,
        psych.trustAnchors,
        ...(['urgency', 'value', 'social_proof'] as const).flatMap((ang) => [
          copyMap[ang].facebook.primaryText,
          copyMap[ang].facebook.headline,
          copyMap[ang].facebook.description,
          copyMap[ang].instagram.caption,
          copyMap[ang].tiktok.hook,
          copyMap[ang].tiktok.script,
          copyMap[ang].tiktok.caption,
          ...copyMap[ang].google_rsa.headlines,
          ...copyMap[ang].google_rsa.descriptions,
        ]),
        ...slides.flatMap((s) => [
          s.badgeText,
          s.headline,
          s.subheadline,
          s.ctaText,
          ...(s.highlightPoints ?? []),
        ]),
        lyrics,
        ...frames.flatMap((f) => [f.overlayHeadline, f.lyricLine]),
      ];

      for (const field of allFields) {
        expect(field, `Unexpected collapse to Harga Promo Berbaloi in v=${v}: ${field}`).not.toContain(
          'Harga Promo Berbaloi'
        );
        expect(field, `Mid-word USP cut in v=${v}: ${field}`).not.toMatch(
          /\b(?:Ki|kolab|pana|pa)\b/
        );
        expect(field, `Dangling space before paren in v=${v}: ${field}`).not.toContain(' )');
        expect(field, `Dangling edisi before em-dash in v=${v}: ${field}`).not.toContain('edisi —');
        expect(checkCopyCompliance(field)).toHaveLength(0);
      }

      if (v === 1) {
        expect(slides[0].headline).toContain('Free Gift');
        expect(slides[2].headline).toContain('Free Gift');
        expect(frames[0].overlayHeadline).toContain('Free Gift');
      }
    }

    // Even when offer has no product noun, collab brand must prefer USP phrase instead of collapsing
    const noProductOffer = 'Diskaun 20% sempena minggu gaji';
    const uspFallbackSlides = buildCarouselSlides(
      TEST_BRAND,
      noProductOffer,
      1,
      null,
      benchmarkUsp
    );
    expect(uspFallbackSlides[0].headline).not.toContain('Harga Promo Berbaloi');
    expect(uspFallbackSlides[0].headline).toContain('Alat IPL');

    // When offer includes overlapping brand/collab tokens, strip overlap to keep clean product noun
    const overlapOffer = 'Alat IPL Ulike X HelloKitty diskaun 20% + Free Gift minggu gaji';
    const strippedOverlapSlides = buildCarouselSlides(
      TEST_BRAND,
      overlapOffer,
      1,
      null,
      benchmarkUsp
    );
    expect(strippedOverlapSlides[0].headline).toBe('Penat Cari Alat IPL?');
  });

  it('7b. Avoids dangling RSA prepositions, dangling "X" brand connectors, and ensures 20/20 distinct storyboard frame headlines', () => {
    const cases: Array<{ brand: BrandProfile; offer: string; usp: string }> = [
      {
        brand: TEST_BRAND,
        offer: 'Alat IPL Ulike X HelloKitty diskaun 20% + Free Gift minggu gaji',
        usp: 'Alat IPL buang bulu di rumah tanpa rasa panas, edisi kolaborasi Hello Kitty',
      },
      {
        brand: { ...TEST_BRAND, id: 'beryls-batik', name: "Beryl's X Batik" },
        offer: 'Harga RM29.90 sahaja stok terhad',
        usp: 'Coklat Tiramisu premium buatan Malaysia dalam tin edisi batik eksklusif tanpa pengawet',
      },
    ];

    const danglingEndRx =
      /\b(?:di|ke|dari|dan|atau|serta|untuk|dengan|pada|dalam|yang|tanpa|edisi|kolaborasi|rasa)$/i;

    for (const { brand, offer, usp } of cases) {
      const frameHeadlineSet = new Set<string>();
      for (let v = 1; v <= 5; v += 1) {
        const copyMap = generateCampaignCopyMap(brand, offer, v, usp);
        for (const ang of ['urgency', 'value', 'social_proof'] as const) {
          for (const h of copyMap[ang].google_rsa.headlines) {
            expect(h.length).toBeLessThanOrEqual(30);
            expect(h).not.toMatch(/\b(?:Ulike|Beryl's)\s+X\s+(?:Berbaloi|Berkualiti|Disukai|Dipercayai|Gaya|Lebih|Review|Pilihan|Komuniti|Kiraan|Tanya|Rebutan|Tawaran|Stok|Eksklusif)\b/i);
            expect(h).not.toMatch(/(?:Ulike|Beryl's)\s+X$/i);
          }
          for (const d of copyMap[ang].google_rsa.descriptions) {
            expect(d.length).toBeLessThanOrEqual(90);
            expect(d, `Dangling preposition in RSA desc (${brand.name} v=${v} ${ang}): ${d}`).not.toMatch(
              danglingEndRx
            );
            expect(d, `Dangling X connector in RSA desc (${brand.name} v=${v} ${ang}): ${d}`).not.toMatch(
              /\b(?:Ulike|Beryl's)\s+X\b(?=\s+(?:untuk|$)|$)/i
            );
          }
        }

        const frames = buildStoryboardFrames(brand, offer, 'Baris 1\nBaris 2', v, null, usp);
        for (const f of frames) {
          frameHeadlineSet.add(f.overlayHeadline);
        }
      }
      expect(frameHeadlineSet.size).toBe(20);
    }
  });

  it('7c. Strips trailing X/×/&/itu and standalone ini across RSA boundary truncation while preserving Minggu/Hari Ini and decimal RM prices', () => {
    const rsaCases: Array<{ brand: BrandProfile; offer: string; usp: string }> = [
      {
        brand: TEST_BRAND,
        offer: 'Promosi Alat IPL Penjagaan Diri Ulike X HelloKitty Edisi Terhad',
        usp: 'Alat IPL buang bulu di rumah tanpa rasa panas, edisi kolaborasi Hello Kitty',
      },
      {
        brand: TEST_BRAND,
        offer: 'Diskaun 20% + Free Gift minggu gaji untuk Ulike X HelloKitty',
        usp: '',
      },
      {
        brand: { ...TEST_BRAND, id: 'kopi-roti-kl', name: 'Kopi & Roti Artisan KL' },
        offer: 'Pakej Sarapan Kopi & Roti RM12.90 diskaun 15% minggu gaji',
        usp: '',
      },
      {
        brand: { ...TEST_BRAND, id: 'ab-studio', name: 'A - B Studio Kuala Lumpur' },
        offer: 'Set Hadiah A - B Studio Kuala Lumpur RM49.90 + Percuma Kad Ucapan Eksklusif & Kotak',
        usp: '',
      },
    ];

    const danglingEndRx =
      /(?:\b(?:di|ke|dari|dan|atau|serta|untuk|dengan|pada|dalam|yang|tanpa|edisi|kolaborasi|rasa|itu|x)|(?:^|\s)×|&)$/i;
    const isStandaloneTrailingIni = (text: string) =>
      /\bini$/i.test(text) &&
      !/\b(?:hari|minggu|bulan|tahun|kali|edisi|batch)\s+ini$/i.test(text);

    for (const { brand, offer, usp } of rsaCases) {
      for (let v = 1; v <= 5; v += 1) {
        const copyMap = generateCampaignCopyMap(brand, offer, v, usp);
        for (const ang of ['urgency', 'value', 'social_proof'] as const) {
          for (const item of [
            ...copyMap[ang].google_rsa.headlines,
            ...copyMap[ang].google_rsa.descriptions,
          ]) {
            expect(item, `Dangling token in RSA (${brand.name} v=${v} ${ang}): ${item}`).not.toMatch(
              danglingEndRx
            );
            expect(
              isStandaloneTrailingIni(item),
              `Standalone trailing "ini" in RSA (${brand.name} v=${v} ${ang}): ${item}`
            ).toBe(false);
          }
        }
      }
    }

    const sweepInput =
      'Pakej lengkap Ulike X HelloKitty & Beryl itu ini untuk anda dengan tanpa di ke yang dan atau sekarang';
    for (let len = 25; len <= 90; len += 1) {
      const truncated = truncateAtWordBoundary(sweepInput, len);
      expect(truncated.length).toBeLessThanOrEqual(len);
      expect(truncated, `Dangling token at len=${len}: "${truncated}"`).not.toMatch(danglingEndRx);
      expect(
        isStandaloneTrailingIni(truncated),
        `Standalone trailing "ini" at len=${len}: "${truncated}"`
      ).toBe(false);
    }

    // Preserves valid Malaysian time/unit phrases ending in "Ini" while stripping cascading dangling tokens
    expect(truncateAtWordBoundary("Beryl's Minggu Ini Sahaja", 20)).toBe("Beryl's Minggu Ini");
    expect(truncateAtWordBoundary('Laris Hari Ini Sahaja', 16)).toBe('Laris Hari Ini');
    expect(truncateAtWordBoundary('Pakej Sarapan Kopi & Roti', 22)).toBe('Pakej Sarapan Kopi');
    expect(truncateAtWordBoundary('Alat IPL Ulike × HelloKitty', 16)).toBe('Alat IPL Ulike');

    // Preserves decimal RM price inside bundleOrFreebie
    const kopiDetails = extractOfferDetails(
      'Kopi & Roti',
      'Pakej Sarapan Kopi & Roti RM12.90 diskaun 15% minggu gaji',
      ''
    );
    expect(kopiDetails.bundleOrFreebie).toContain('RM12.90');
    expect(kopiDetails.bundleOrFreebie).not.toMatch(/\bRM12$/);
  });

  it('8. CarouselTab aborts and ignores stale AI background fetch when campaign relaunches mid-flight', async () => {
    (globalThis as { __ADFORGE_ALLOW_LIVE_AI_IN_TESTS__?: boolean }).__ADFORGE_ALLOW_LIVE_AI_IN_TESTS__ =
      true;

    let capturedImageSignal: AbortSignal | undefined;
    let resolveImageFetch!: (res: Response) => void;
    const pendingImageFetch = new Promise<Response>((resolve) => {
      resolveImageFetch = resolve;
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('image.pollinations.ai')) {
        capturedImageSignal = init?.signal ?? undefined;
        return pendingImageFetch;
      }
      return Promise.resolve(new Response('{}', { status: 503 }));
    });

    function CarouselEpochHarness() {
      const { launchCampaign, slides } = useCampaign();
      return (
        <div>
          <button
            type="button"
            data-testid="harness-relaunch"
            onClick={() =>
              launchCampaign({
                offerSentence: 'Kempen Baharu Selepas Relaunch 30%',
                uspAndAudience: 'Kemas & pantas',
              })
            }
          >
            Relaunch
          </button>
          <span data-testid="harness-slide0-aibg">{slides[0]?.aiBackgroundDataUrl ?? 'NONE'}</span>
          <CarouselTab />
        </div>
      );
    }

    render(
      <I18nProvider>
        <WorkbenchProvider>
          <CampaignProvider>
            <CarouselEpochHarness />
          </CampaignProvider>
        </WorkbenchProvider>
      </I18nProvider>
    );

    fireEvent.click(screen.getByTestId('carousel-ai-bg-btn'));
    await waitFor(() => expect(capturedImageSignal).toBeDefined());
    expect(capturedImageSignal?.aborted).toBe(false);

    // Relaunch campaign while AI background fetch is still pending
    fireEvent.click(screen.getByTestId('harness-relaunch'));
    expect(capturedImageSignal?.aborted).toBe(true);

    // Even if the stale promise resolves later with a valid JPEG, it must NOT overwrite slide-1
    await act(async () => {
      resolveImageFetch(
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      );
      await Promise.resolve();
    });

    expect(screen.getByTestId('harness-slide0-aibg')).toHaveTextContent('NONE');
  });
});
