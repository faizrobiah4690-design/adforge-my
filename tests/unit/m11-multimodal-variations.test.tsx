import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { JingleTab } from '../../src/components/tabs/JingleTab';
import { StrategyTab } from '../../src/components/tabs/StrategyTab';
import { VideoTab } from '../../src/components/tabs/VideoTab';
import { WorkspaceShell } from '../../src/components/WorkspaceShell';
import { SAMPLE_OFFER_CHIP, SEEDED_DEMO_BRAND } from '../../src/data/seedVault';
import { I18nProvider } from '../../src/i18n/I18nContext';
import { CampaignProvider, useCampaign } from '../../src/state/CampaignContext';
import { WorkbenchProvider, useWorkbench } from '../../src/state/WorkbenchContext';
import type { BrandProfile, PhotoAsset } from '../../src/types/campaign';
import { buildJingleLyrics } from '../../src/utils/audioExport';
import { checkCopyCompliance } from '../../src/utils/compliance';
import {
  buildCarouselSlides,
  buildCustomerPsychology,
  buildStoryboardFrames,
  extractOfferDetails,
  generateCampaignCopyMap,
  generateMultimodalCampaignWithGemini,
} from '../../src/utils/copyGenerator';

const ULIKE_BRAND: BrandProfile = {
  ...SEEDED_DEMO_BRAND,
  id: 'ulike-hellokitty',
  name: 'Ulike X HelloKitty',
  tone: 'casual',
  whatsappNumber: '60198887766',
};

const ULIKE_OFFER =
  'Edisi Terhad Diskaun 20% RM899 Beli 1 Percuma Casing sempena Minggu Gaji, stok & slot terhad — WhatsApp sekarang.';

const MOCK_PHOTOS: [PhotoAsset, PhotoAsset] = [
  {
    id: 'p1',
    label: 'Ulike Front',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    isSample: false,
  },
  {
    id: 'p2',
    label: 'Ulike Kit',
    src: '/assets/photos/business-product-2.png',
    isSample: true,
  },
];

describe('M11 Offer Extraction, "Tawaran Tawaran" Fix & 5-Framework Variation Engine', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts structured OfferDetails (collabTag, discountPercent, priceTag, bundleOrFreebie, occasion, scarcityCue, vertical) without dental hardcoding', () => {
    const details = extractOfferDetails(ULIKE_BRAND.name, ULIKE_OFFER);
    expect(details.collabTag).toMatch(/X HelloKitty/i);
    expect(details.discountPercent).toBe('20%');
    expect(details.priceTag).toBe('RM899');
    expect(details.bundleOrFreebie).toMatch(/Percuma Casing/i);
    expect(details.occasion).toMatch(/Edisi Terhad|Minggu Gaji/i);
    expect(details.scarcityCue).toMatch(/stok & slot terhad/i);
    expect(details.vertical).toBe('beauty');
    expect(details.productTopic.length).toBeGreaterThan(0);

    const fnbDetails = extractOfferDetails(
      'Kopi Kampung',
      'Kombo 2 Kopi + Kek Batik RM19.90 hujung minggu'
    );
    expect(fnbDetails.vertical).toBe('fnb');
    expect(fnbDetails.priceTag).toBe('RM19.90');
    expect(fnbDetails.bundleOrFreebie).toMatch(/Kombo/i);
  });

  it('never produces duplicate "Tawaran Tawaran" across any variation, angle, tone, or tricky offer input', () => {
    const trickyOffers = [
      'Tawaran istimewa hujung minggu untuk pelanggan baharu',
      'Diskaun 20% pakej bundle RM199 tawaran hebat',
      ULIKE_OFFER,
      SAMPLE_OFFER_CHIP,
    ];
    const brands: BrandProfile[] = [
      ULIKE_BRAND,
      { ...ULIKE_BRAND, id: 'pro', tone: 'professional' },
    ];

    for (const brand of brands) {
      for (const offer of trickyOffers) {
        for (let v = 1; v <= 5; v += 1) {
          const psych = buildCustomerPsychology(brand, offer, v);
          const copyMap = generateCampaignCopyMap(brand, offer, v);
          const slides = buildCarouselSlides(brand, offer, v);
          const lyrics = buildJingleLyrics(brand.name, offer, v);
          const frames = buildStoryboardFrames(brand, offer, lyrics, v);

          const allStrings = [
            psych.targetPersona,
            psych.coreTrigger,
            psych.frictionObjections,
            psych.trustAnchors,
            ...Object.values(copyMap).flatMap((c) => [
              c.facebook.primaryText,
              c.facebook.headline,
              c.facebook.description,
              c.instagram.caption,
              c.instagram.hashtags,
              c.tiktok.hook,
              c.tiktok.script,
              c.tiktok.caption,
              ...c.google_rsa.headlines,
              ...c.google_rsa.descriptions,
            ]),
            ...slides.flatMap((s) => [s.badgeText, s.headline, s.subheadline, s.ctaText]),
            lyrics,
            ...frames.flatMap((f) => [f.overlayHeadline, f.lyricLine]),
          ];

          for (const str of allStrings) {
            expect(str, `Found duplicate Tawaran in v=${v}: ${str}`).not.toMatch(
              /\btawaran\s+tawaran\b/i
            );
          }
        }
      }
    }
  });

  it('generates 5 distinct variations (#1..#5) across Psychology, Tab 1 (4 channels x 3 angles), Tab 2 slides, Tab 3 lyrics, and Tab 4 storyboard with 0 compliance findings', () => {
    const psychSet = new Set<string>();
    const fbSet = new Set<string>();
    const igSet = new Set<string>();
    const ttSet = new Set<string>();
    const rsaSet = new Set<string>();
    const slideSet = new Set<string>();
    const lyricsSet = new Set<string>();
    const frameSet = new Set<string>();

    for (const brand of [ULIKE_BRAND, { ...ULIKE_BRAND, id: 'pro', tone: 'professional' as const }]) {
      if (brand.tone === 'casual') {
        for (let v = 1; v <= 5; v += 1) {
          const psych = buildCustomerPsychology(brand, ULIKE_OFFER, v);
          const copy = generateCampaignCopyMap(brand, ULIKE_OFFER, v);
          const slides = buildCarouselSlides(brand, ULIKE_OFFER, v);
          const lyrics = buildJingleLyrics(brand.name, ULIKE_OFFER, v);
          const frames = buildStoryboardFrames(brand, ULIKE_OFFER, lyrics, v);

          psychSet.add(`${psych.targetPersona}|${psych.coreTrigger}`);
          fbSet.add(copy.urgency.facebook.primaryText);
          igSet.add(copy.value.instagram.caption);
          ttSet.add(copy.social_proof.tiktok.hook);
          rsaSet.add(copy.urgency.google_rsa.headlines.join('|'));
          slideSet.add(slides.map((s) => s.headline).join('|'));
          lyricsSet.add(lyrics);
          frameSet.add(frames.map((f) => f.overlayHeadline).join('|'));

          expect(slides[0].photoIndex).toBe(0);
          expect(lyrics).toContain(brand.name);
          expect(frames[0].overlayHeadline).toContain(brand.name);
          expect(frames[3].overlayHeadline).toContain(`+${brand.whatsappNumber}`);
        }
      }

      // Zero compliance findings + RSA bounds + wa.me tags across all 5 variations x 3 angles x 2 tones
      for (let v = 1; v <= 5; v += 1) {
        const map = generateCampaignCopyMap(brand, ULIKE_OFFER, v);
        for (const angle of ['urgency', 'value', 'social_proof'] as const) {
          const entry = map[angle];
          const fields = [
            entry.facebook.primaryText,
            entry.facebook.headline,
            entry.facebook.description,
            entry.instagram.caption,
            entry.instagram.hashtags,
            entry.tiktok.hook,
            entry.tiktok.script,
            entry.tiktok.caption,
            ...entry.google_rsa.headlines,
            ...entry.google_rsa.descriptions,
          ];
          for (const field of fields) {
            expect(
              checkCopyCompliance(field),
              `Compliance finding for ${brand.tone}/v${v}/${angle}: ${field}`
            ).toHaveLength(0);
          }
          for (const h of entry.google_rsa.headlines) {
            expect(h.length).toBeGreaterThan(0);
            expect(h.length).toBeLessThanOrEqual(30);
          }
          for (const d of entry.google_rsa.descriptions) {
            expect(d.length).toBeGreaterThan(0);
            expect(d.length).toBeLessThanOrEqual(90);
          }
        }
        expect(map.urgency.facebook.whatsappUrl).toContain('SUDUT-1-SEGERA');
        expect(map.value.facebook.whatsappUrl).toContain('SUDUT-2-NILAI');
        expect(map.social_proof.facebook.whatsappUrl).toContain('SUDUT-3-BUKTISOSIAL');
      }
    }

    expect(psychSet.size).toBe(5);
    expect(fbSet.size).toBe(5);
    expect(igSet.size).toBe(5);
    expect(ttSet.size).toBe(5);
    expect(rsaSet.size).toBe(5);
    expect(slideSet.size).toBe(5);
    expect(lyricsSet.size).toBe(5);
    expect(frameSet.size).toBe(5);
  });

  it('sends photo1 + photo2 inlineData to gemini-2.5-flash, falls back 2.5-flash -> 2.0-flash -> offline, and enforces Demo Mode zero-fetch guard', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // 1. Demo Mode makes ZERO fetch calls even with a valid BYOK key
    const demoResult = await generateMultimodalCampaignWithGemini({
      apiKey: 'sk-live-valid-key-123456',
      isDemoMode: true,
      brand: ULIKE_BRAND,
      offerSentence: ULIKE_OFFER,
      photos: MOCK_PHOTOS,
      variationIndex: 4,
    });
    expect(demoResult.source).toBe('offline-smart-demo');
    expect(fetchSpy).not.toHaveBeenCalled();

    // 2. Live BYOK: photo2 (/assets/...) fetched + converted to base64; gemini-2.5-flash 503 -> falls back to gemini-2.0-flash 200
    const mockImageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
    const capturedModels: string[] = [];
    let capturedPartsCount = 0;

    fetchSpy.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === '/assets/photos/business-product-2.png') {
        return new Response(mockImageBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }
      if (url.includes('gemini-2.5-flash:generateContent')) {
        capturedModels.push('gemini-2.5-flash');
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          contents: Array<{ parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }>;
        };
        capturedPartsCount = body.contents[0].parts.filter((p) => Boolean(p.inlineData)).length;
        return new Response(JSON.stringify({ error: { message: 'Overloaded' } }), { status: 503 });
      }
      if (url.includes('gemini-2.0-flash:generateContent')) {
        capturedModels.push('gemini-2.0-flash');
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        visualSummary: 'Peranti IPL merah jambu edisi HelloKitty bersama sarung pelindung.',
                        psychology: {
                          targetPersona: 'Peminat kecantikan & kolektor HelloKitty.',
                          coreTrigger: 'Penjimatan 20% pada harga RM899.',
                          frictionObjections: 'Ingin pastikan keaslian set kolaborasi.',
                          trustAnchors: 'Set rasmi Ulike X HelloKitty dengan panduan lengkap.',
                        },
                        angles: {
                          urgency: {
                            facebook: {
                              primaryText: 'Kulit anda kusam? Grab 100% dijamin terbaik sekarang!',
                              headline: 'Ulike X HelloKitty Terhad',
                              description: 'Edisi minggu gaji',
                            },
                            google_rsa: {
                              headlines: [
                                'Tajuk RSA Sangat Panjang Melebihi Tiga Puluh Aksara',
                                'Diskaun 20% Ulike',
                                'Edisi HelloKitty',
                              ],
                              descriptions: [
                                'Penerangan sangat panjang melebihi sembilan puluh aksara untuk menguji had selamat Google Search RSA.',
                                'WhatsApp sekarang.',
                              ],
                            },
                          },
                        },
                        carouselSlides: [
                          { badgeText: 'VISION', headline: 'IPL Edisi HelloKitty', subheadline: 'Kemas di rumah', ctaText: 'Slide 1 / 4' },
                        ],
                        jingleLyrics: 'Ulike X HelloKitty pilihan bergaya,\nJimat 20% minggu gaji!',
                        storyboardFrames: [
                          { overlayHeadline: 'Visual Peranti HelloKitty', lyricLine: 'Baris 1' },
                          { overlayHeadline: 'Ciri Penyejukan', lyricLine: 'Baris 2' },
                          { overlayHeadline: 'RM899 Sahaja', lyricLine: 'Baris 3' },
                          { overlayHeadline: 'Hubungi Kami', lyricLine: 'Baris 4' },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const fallbackSuccess = await generateMultimodalCampaignWithGemini({
      apiKey: 'sk-live-valid-key-123456',
      isDemoMode: false,
      brand: ULIKE_BRAND,
      offerSentence: ULIKE_OFFER,
      photos: MOCK_PHOTOS,
      variationIndex: 1,
    });

    expect(capturedModels).toEqual(['gemini-2.5-flash', 'gemini-2.0-flash']);
    expect(capturedPartsCount).toBe(2);
    expect(fallbackSuccess.source).toBe('gemini-2.0-flash');
    expect(fallbackSuccess.visualSummary).toContain('HelloKitty');
    expect(checkCopyCompliance(fallbackSuccess.copyByAngle.urgency.facebook.primaryText)).toHaveLength(0);
    expect(fallbackSuccess.copyByAngle.urgency.facebook.whatsappUrl).toContain('SUDUT-1-SEGERA');
    expect(fallbackSuccess.copyByAngle.urgency.google_rsa.headlines[0].length).toBeLessThanOrEqual(30);
    expect(fallbackSuccess.copyByAngle.urgency.google_rsa.descriptions[0].length).toBeLessThanOrEqual(90);
    expect(fallbackSuccess.storyboardFrames[0].overlayHeadline).toContain(ULIKE_BRAND.name);
    expect(fallbackSuccess.storyboardFrames[3].overlayHeadline).toContain(`+${ULIKE_BRAND.whatsappNumber}`);

    // 3. Double failure falls back to offline-smart-fallback
    fetchSpy.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('/assets/')) {
        return new Response(null, { status: 404 });
      }
      return new Response('down', { status: 500 });
    });

    const doubleFail = await generateMultimodalCampaignWithGemini({
      apiKey: 'sk-live-valid-key-123456',
      isDemoMode: false,
      brand: ULIKE_BRAND,
      offerSentence: ULIKE_OFFER,
      photos: MOCK_PHOTOS,
      variationIndex: 4,
    });
    expect(doubleFail.source).toBe('offline-smart-fallback');
    expect(doubleFail.psychology.coreTrigger).toContain('20%');
  });

  it('renders variation-toolbar above 4-child workspace-tabs, keeps /Gemini/i button unique, cycles Variasi #1..#5, and resets Tab 4 confirmation gate', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('google-login-btn'));
    fireEvent.click(screen.getByTestId('byok-demo-btn'));
    fireEvent.change(screen.getByTestId('offer-input'), {
      target: { value: ULIKE_OFFER },
    });
    fireEvent.click(screen.getByTestId('launch-campaign-btn'));

    // workspace-tabs must still have exact 4 direct tab children
    const workspaceTabs = screen.getByTestId('workspace-tabs');
    expect(workspaceTabs.querySelectorAll(':scope > [role="tab"]')).toHaveLength(4);
    expect(screen.getByTestId('variation-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('campaign-engine-status-badge')).toHaveTextContent(/Demo/i);

    // Confirm Tab 4 gate, then generate new variation -> gate resets to false
    fireEvent.click(screen.getByTestId('tab-video'));
    fireEvent.click(screen.getByTestId('video-confirm-checkbox'));
    expect(screen.getByTestId('video-generate-btn')).toBeEnabled();

    fireEvent.click(screen.getByTestId('generate-new-variation-btn'));
    expect(screen.getByTestId('active-variation-label')).toHaveTextContent('#2');
    expect(screen.getByTestId('video-generate-btn')).toBeDisabled();

    // Check Tab 1 updates across variations
    fireEvent.click(screen.getByTestId('tab-strategy'));
    const fbV2 = (
      screen.getByTestId('channel-facebook').querySelector('textarea') as HTMLTextAreaElement
    ).value;
    fireEvent.click(screen.getByTestId('variation-pill-4'));
    expect(screen.getByTestId('active-variation-label')).toHaveTextContent('#4');
    const fbV4 = (
      screen.getByTestId('channel-facebook').querySelector('textarea') as HTMLTextAreaElement
    ).value;
    expect(fbV4).not.toBe(fbV2);
    expect(fbV4).toContain('20%');

    // Check Tab 3 reset lyrics respects active variation
    fireEvent.click(screen.getByTestId('tab-jingle'));
    const lyricsArea = screen.getByTestId('jingle-lyrics-input') as HTMLTextAreaElement;
    const lyricsV4 = lyricsArea.value;
    fireEvent.change(lyricsArea, { target: { value: 'Lirik tersuai' } });
    fireEvent.click(screen.getByTestId('jingle-reset-lyrics-btn'));
    expect((screen.getByTestId('jingle-lyrics-input') as HTMLTextAreaElement).value).toBe(lyricsV4);

    // Upgrade Demo -> BYOK and verify only 1 button matches /Gemini/i
    fireEvent.click(screen.getByTestId('tab-strategy'));
    fireEvent.click(screen.getByTestId('nav-onboarding'));
    fireEvent.change(screen.getByTestId('byok-input'), {
      target: { value: 'sk-live-m11-unique-btn' },
    });
    fireEvent.click(screen.getByTestId('byok-save-btn'));
    expect(screen.getAllByRole('button', { name: /Gemini/i })).toHaveLength(1);
  }, 15_000);

  it('discards stale in-flight Gemini Vision response on rapid variation switch and preserves user edits made mid-flight', async () => {
    let resolveFirst!: (res: Response) => void;
    let resolveSecond!: (res: Response) => void;
    let modelCalls = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('/assets/')) {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      modelCalls += 1;
      if (modelCalls === 1) {
        return new Promise<Response>((r) => {
          resolveFirst = r;
        });
      }
      return new Promise<Response>((r) => {
        resolveSecond = r;
      });
    });

    function StaleGuardHarness() {
      const { loginWithGoogle, saveByokKey } = useWorkbench();
      const { launchCampaign, generateNewVariation, variationIndex } = useCampaign();
      return (
        <div>
          <button
            type="button"
            data-testid="setup-byok"
            onClick={() => {
              loginWithGoogle('pro@studio.my');
              saveByokKey('sk-live-stale-guard-1234', false);
            }}
          >
            setup
          </button>
          <button
            type="button"
            data-testid="do-launch"
            onClick={() => launchCampaign({ offerSentence: ULIKE_OFFER })}
          >
            launch
          </button>
          <button
            type="button"
            data-testid="do-next-var"
            onClick={() => {
              void generateNewVariation();
            }}
          >
            next
          </button>
          <span data-testid="var-idx">{variationIndex}</span>
          <WorkspaceShell />
        </div>
      );
    }

    render(
      <I18nProvider>
        <WorkbenchProvider>
          <CampaignProvider>
            <StaleGuardHarness />
          </CampaignProvider>
        </WorkbenchProvider>
      </I18nProvider>
    );

    fireEvent.click(screen.getByTestId('setup-byok'));
    fireEvent.click(screen.getByTestId('do-launch'));

    await waitFor(() => {
      expect(modelCalls).toBe(1);
    });

    // Switch immediately to Variation #2 while #1 vision is in-flight
    fireEvent.click(screen.getByTestId('do-next-var'));
    await waitFor(() => {
      expect(modelCalls).toBe(2);
    });
    expect(screen.getByTestId('var-idx')).toHaveTextContent('2');

    // User manually edits Facebook headline on #2 while #2 is in-flight
    const fbHeadline = screen
      .getByTestId('channel-facebook')
      .querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(fbHeadline, { target: { value: 'Suntingan Manual Kekal' } });

    // Resolve stale Variation #1 -> must be ignored completely
    await act(async () => {
      resolveFirst(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        visualSummary: 'STALE_V1_VISION',
                        psychology: { targetPersona: 'STALE_V1_PERSONA' },
                        angles: {
                          urgency: { facebook: { headline: 'STALE_V1_HEADLINE' } },
                        },
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      );
      await Promise.resolve();
    });

    expect(screen.getByTestId('strategy-psychology-panel').textContent).not.toContain('STALE_V1_PERSONA');
    expect(fbHeadline.value).toBe('Suntingan Manual Kekal');

    // Resolve Variation #2 -> hydrates psychology + vision badge while preserving manual FB edit
    await act(async () => {
      resolveSecond(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        visualSummary: 'Produk V2 Dikesan',
                        psychology: { targetPersona: 'Persona Segar V2' },
                        angles: {
                          urgency: { facebook: { headline: 'Gemini V2 Tidak Menimpa' } },
                        },
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('product-vision-summary-badge')).toHaveTextContent('Produk V2 Dikesan');
    });
    expect(screen.getByTestId('strategy-psychology-panel').textContent).toContain('Persona Segar V2');
    expect(
      (screen.getByTestId('channel-facebook').querySelector('input[type="text"]') as HTMLInputElement).value
    ).toBe('Suntingan Manual Kekal');
  });
});

// Keep unused imports referenced cleanly if needed
void StrategyTab;
void JingleTab;
void VideoTab;
