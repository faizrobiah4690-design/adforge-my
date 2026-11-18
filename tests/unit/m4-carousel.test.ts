import { createElement } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CarouselTab } from '../../src/components/tabs/CarouselTab';
import { I18nProvider, useI18n } from '../../src/i18n/I18nContext';
import { CampaignProvider, useCampaign } from '../../src/state/CampaignContext';
import { WorkbenchProvider } from '../../src/state/WorkbenchContext';
import type { BrandProfile, CarouselSlide } from '../../src/types/campaign';
import {
  computeCoverCrop,
  exportSlideAsPng,
  getCanvasDimensions,
  getContrastTextColor,
  getSafeZoneInsets,
  isAllowedImageSrc,
  loadDecodedImage,
  renderSlideToCanvas,
  wrapTextLines,
} from '../../src/utils/carouselExport';

const MOCK_BRAND: BrandProfile = {
  id: 'demo-bisnes-saya',
  name: 'Demo Bisnes Saya',
  logoDataUrl: '/assets/brands/demo-brand-logo.png',
  themeColor: '#0EA5E9',
  tone: 'casual',
  whatsappNumber: '60123456789',
  isSeeded: true,
  updatedAt: '2026-11-17T00:00:00Z',
};

const MOCK_SLIDE: CarouselSlide = {
  id: 'slide-1',
  index: 0,
  role: 'hook',
  photoIndex: 0,
  badgeText: 'Demo Bisnes Saya',
  headline: 'Tawaran Istimewa Untuk Anda',
  subheadline: 'Produk & servis berkualiti tinggi daripada Demo Bisnes Saya.',
  ctaText: 'Slide 1 / 4',
  editedByUser: false,
};

function createMockCanvasContext(fillColors: string[] = []) {
  const gradient = { addColorStop: vi.fn() };
  return {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    globalAlpha: 1,
    fillRect: vi.fn(function (this: { fillStyle: unknown }) {
      if (typeof this.fillStyle === 'string') {
        fillColors.push(this.fillStyle);
      }
    }),
    fill: vi.fn(function (this: { fillStyle: unknown }) {
      if (typeof this.fillStyle === 'string') {
        fillColors.push(this.fillStyle);
      }
    }),
    stroke: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 14 })),
    createLinearGradient: vi.fn(() => gradient),
  };
}

function CarouselHarness() {
  const { locale, setLocale } = useI18n();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'harness-toggle-locale',
        onClick: () => setLocale(locale === 'ms' ? 'en' : 'ms'),
      },
      locale
    ),
    createElement(CarouselTab)
  );
}

function renderCarouselTab() {
  return render(
    createElement(
      I18nProvider,
      null,
      createElement(
        WorkbenchProvider,
        null,
        createElement(CampaignProvider, null, createElement(CarouselHarness))
      )
    )
  );
}

describe('m4 carouselExport pure math helpers', () => {
  it('returns exact preset canvas dimensions for 9:16 and 4:5', () => {
    expect(getCanvasDimensions('9:16')).toEqual({ width: 1080, height: 1920 });
    expect(getCanvasDimensions('4:5')).toEqual({ width: 1080, height: 1350 });
  });

  it('computes centered cover crop across landscape, portrait, square, and invalid dimensions', () => {
    const landscapeTo916 = computeCoverCrop(1920, 1080, 1080, 1920);
    expect(landscapeTo916.sHeight).toBe(1080);
    expect(landscapeTo916.sWidth).toBeCloseTo(607.5, 4);
    expect(landscapeTo916.sx).toBeCloseTo((1920 - 607.5) / 2, 4);
    expect(landscapeTo916.sy).toBe(0);

    const fourFiveTo916 = computeCoverCrop(1080, 1350, 1080, 1920);
    expect(fourFiveTo916.sHeight).toBe(1350);
    expect(fourFiveTo916.sWidth).toBeCloseTo(759.375, 4);
    expect(fourFiveTo916.sx).toBeCloseTo((1080 - 759.375) / 2, 4);

    const nineSixteenTo45 = computeCoverCrop(1080, 1920, 1080, 1350);
    expect(nineSixteenTo45.sWidth).toBe(1080);
    expect(nineSixteenTo45.sHeight).toBeCloseTo(1350, 4);
    expect(nineSixteenTo45.sy).toBeCloseTo(285, 4);

    const squareTo45 = computeCoverCrop(512, 512, 1080, 1350);
    expect(squareTo45.sHeight).toBe(512);
    expect(squareTo45.sWidth).toBeCloseTo(512 * 0.8, 4);

    for (const bad of [
      computeCoverCrop(0, 100, 1080, 1920),
      computeCoverCrop(100, -10, 1080, 1920),
      computeCoverCrop(Number.NaN, 100, 1080, 1920),
      computeCoverCrop(100, 100, Number.POSITIVE_INFINITY, 1920),
    ]) {
      expect(Number.isFinite(bad.sx)).toBe(true);
      expect(Number.isFinite(bad.sy)).toBe(true);
      expect(Number.isFinite(bad.sWidth)).toBe(true);
      expect(Number.isFinite(bad.sHeight)).toBe(true);
      expect(bad.sWidth).toBeGreaterThanOrEqual(0);
      expect(bad.sHeight).toBeGreaterThanOrEqual(0);
    }
  });

  it('computes WCAG 2.1 contrast text color for 3-digit, 6-digit, and malformed hex colors', () => {
    expect(getContrastTextColor('#000000')).toBe('#FFFFFF');
    expect(getContrastTextColor('#0F172A')).toBe('#FFFFFF');
    expect(getContrastTextColor('#E11D48')).toBe('#FFFFFF');
    expect(getContrastTextColor('#FFFFFF')).toBe('#0F172A');
    expect(getContrastTextColor('#FDE047')).toBe('#0F172A');
    expect(getContrastTextColor('#0EA5E9')).toBe('#0F172A');
    expect(getContrastTextColor('#fff')).toBe('#0F172A');
    expect(getContrastTextColor('#000')).toBe('#FFFFFF');
    expect(getContrastTextColor('not-a-hex')).toBe('#FFFFFF');
    expect(getContrastTextColor('#12')).toBe('#FFFFFF');
  });

  it('wraps text lines deterministically, splits long unbroken tokens, and applies maxLines ellipsis', () => {
    const measure = (s: string) => s.length * 10;

    expect(wrapTextLines(measure, '   ', 200)).toEqual([]);
    expect(wrapTextLines(measure, 'Promosi Pakej Kombo', 100)).toEqual([
      'Promosi',
      'Pakej',
      'Kombo',
    ]);
    expect(wrapTextLines(measure, 'Baris Satu\nBaris Dua', 200)).toEqual([
      'Baris Satu',
      'Baris Dua',
    ]);

    const splitLines = wrapTextLines(measure, 'ABCDEFGHIJKLMNO', 50);
    expect(splitLines).toEqual(['ABCDE', 'FGHIJ', 'KLMNO']);
    for (const line of splitLines) {
      expect(measure(line)).toBeLessThanOrEqual(50);
    }

    const capped = wrapTextLines(
      measure,
      'Promosi Istimewa Pakej Kombo Di Seluruh Cawangan Demo Bisnes Saya',
      150,
      2
    );
    expect(capped).toHaveLength(2);
    expect(capped[1].endsWith('...')).toBe(true);
    expect(measure(capped[1])).toBeLessThanOrEqual(150);

    const emojiTruncated = wrapTextLines(measure, '\u{1F601}'.repeat(6), 100, 1);
    const loneSurrogateRegex =
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(emojiTruncated).toHaveLength(1);
    expect(loneSurrogateRegex.test(emojiTruncated[0])).toBe(false);
    expect(emojiTruncated[0].endsWith('...')).toBe(true);
    expect(measure(emojiTruncated[0])).toBeLessThanOrEqual(100);

    const mixedEmojiTruncated = wrapTextLines(
      measure,
      'Kopi \u{1F601}\u{1F601}\u{1F601} Sedap',
      100,
      1
    );
    expect(mixedEmojiTruncated).toHaveLength(1);
    expect(loneSurrogateRegex.test(mixedEmojiTruncated[0])).toBe(false);
    expect(measure(mixedEmojiTruncated[0])).toBeLessThanOrEqual(100);

    for (const tinyLines of [
      wrapTextLines(measure, '\u{1F601}'.repeat(6), 1, 1),
      wrapTextLines(measure, '\u{1F601}', 1),
      wrapTextLines(measure, 'ABCDEF', 1, 1),
      wrapTextLines((s) => (s === '.' ? 10 : s.length), 'a b', 1, 1),
    ]) {
      expect(tinyLines.every((l) => !loneSurrogateRegex.test(l))).toBe(true);
    }
    expect(wrapTextLines(measure, '\u{1F601}'.repeat(6), 1, 1).every((l) => measure(l) <= 1)).toBe(
      true
    );
    expect(wrapTextLines(measure, '\u{1F601}', 1).every((l) => measure(l) <= 1)).toBe(true);
    expect(wrapTextLines(measure, 'ABCDEF', 1, 1).every((l) => measure(l) <= 1)).toBe(true);
    expect(
      wrapTextLines((s) => (s === '.' ? 10 : s.length), 'a b', 1, 1).every(
        (l) => (l === '.' ? 10 : l.length) <= 1
      )
    ).toBe(true);
  });

  it('returns exact safe-zone insets for 9:16 and 4:5', () => {
    const sz916 = getSafeZoneInsets('9:16');
    expect(sz916.topRatio).toBe(0.14);
    expect(sz916.bottomRatio).toBe(0.28);
    expect(sz916.leftRatio).toBe(0.05);
    expect(sz916.rightRatio).toBe(0.15);
    expect(sz916.squareCropRatio).toBe(0);
    expect(sz916.safeRect).toEqual({ x: 54, y: 269, width: 864, height: 1113 });

    const sz45 = getSafeZoneInsets('4:5');
    expect(sz45.topRatio).toBe(0.06);
    expect(sz45.bottomRatio).toBe(0.06);
    expect(sz45.leftRatio).toBe(0.06);
    expect(sz45.rightRatio).toBe(0.06);
    expect(sz45.squareCropRatio).toBe(0.1);
    expect(sz45.safeRect).toEqual({ x: 65, y: 81, width: 950, height: 1188 });
  });

  it('allows same-origin, data:image/, and same-origin blob: URLs while blocking cross-origin, SVG data URLs, and smuggling bypasses', () => {
    expect(isAllowedImageSrc('data:image/png;base64,AAAA')).toBe(true);
    expect(isAllowedImageSrc('data:image/jpeg;base64,AAAA')).toBe(true);
    expect(isAllowedImageSrc('data:image/webp;base64,AAAA')).toBe(true);
    expect(isAllowedImageSrc('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(false);
    expect(isAllowedImageSrc(`blob:${window.location.origin}/123`)).toBe(true);
    expect(isAllowedImageSrc('/assets/photos/business-showcase-1.png')).toBe(true);
    expect(isAllowedImageSrc('//cdn.example.com/evil.png')).toBe(false);
    expect(isAllowedImageSrc('/\\evil.com/x.png')).toBe(false);
    expect(isAllowedImageSrc('\\\\evil.com\\x.png')).toBe(false);
    expect(isAllowedImageSrc('blob:https://evil.com/123')).toBe(false);
    expect(isAllowedImageSrc('blob:null/123')).toBe(false);
    expect(isAllowedImageSrc('https://evil.example/x.png')).toBe(false);
    expect(isAllowedImageSrc('')).toBe(false);
  });
});

describe('m4 Canvas 2D compositor & PNG exporter', () => {
  const originalImage = globalThis.Image;
  const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.Image = originalImage;
    if (originalFonts) {
      Object.defineProperty(document, 'fonts', originalFonts);
    } else {
      delete (document as { fonts?: FontFaceSet }).fonts;
    }
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('renders deterministically at 1080x1920 and 1080x1350 without document.fonts and handles broken images', async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: undefined,
    });

    class BrokenImageMock {
      decoding = '';
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => {
          this.onerror?.();
        });
      }
    }
    globalThis.Image = BrokenImageMock as unknown as typeof Image;

    const fillColors: string[] = [];
    const mockCtx = createMockCanvasContext(fillColors);
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D
    );

    await renderSlideToCanvas(canvas, {
      slide: { ...MOCK_SLIDE, headline: '' },
      brand: { ...MOCK_BRAND, themeColor: '#E11D48' },
      photoSrc: 'https://blocked.example/external.png',
      aspectMode: '9:16',
      totalSlides: 4,
    });

    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1920);
    expect(fillColors).toContain('#E11D48');

    await renderSlideToCanvas(canvas, {
      slide: MOCK_SLIDE,
      brand: MOCK_BRAND,
      photoSrc: '/assets/photos/business-showcase-1.png',
      aspectMode: '4:5',
      totalSlides: 4,
    });

    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1350);
    expect(fillColors).toContain('#0EA5E9');
  });

  it('renders astral-emoji fallback monogram without lone UTF-16 surrogates when logo fails to load', async () => {
    class BrokenImageMock {
      decoding = '';
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => {
          this.onerror?.();
        });
      }
    }
    globalThis.Image = BrokenImageMock as unknown as typeof Image;

    const mockCtx = createMockCanvasContext();
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D
    );

    await renderSlideToCanvas(canvas, {
      slide: MOCK_SLIDE,
      brand: {
        ...MOCK_BRAND,
        name: '\u{1F680} Kedai Maju',
        logoDataUrl: '/missing-logo.png',
      },
      photoSrc: '/assets/photos/business-showcase-1.png',
      aspectMode: '9:16',
      totalSlides: 4,
    });

    const loneSurrogateRegex =
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => String(call[0]));
    expect(fillTextCalls).toContain('\u{1F680}K');
    expect(fillTextCalls.every((text) => !loneSurrogateRegex.test(text))).toBe(true);
  });

  it('exports PNG blob, triggers download, and defers URL.revokeObjectURL by 10_000ms', async () => {
    class LoadedImageMock {
      decoding = '';
      naturalWidth = 1080;
      naturalHeight = 1350;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode = vi.fn().mockResolvedValue(undefined);
      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }
    globalThis.Image = LoadedImageMock as unknown as typeof Image;

    const mockCtx = createMockCanvasContext();
    const origCreate = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement');
    let clickedAnchor: HTMLAnchorElement | null = null;

    createElementSpy.mockImplementation((tagName: string) => {
      const el = origCreate(tagName);
      if (tagName.toLowerCase() === 'canvas') {
        const c = el as HTMLCanvasElement;
        vi.spyOn(c, 'getContext').mockReturnValue(
          mockCtx as unknown as CanvasRenderingContext2D
        );
        vi.spyOn(c, 'toBlob').mockImplementation((cb, type) => {
          expect(type).toBe('image/png');
          cb(new Blob(['fake-png-bytes'], { type: 'image/png' }));
        });
      }
      if (tagName.toLowerCase() === 'a') {
        clickedAnchor = el as HTMLAnchorElement;
        vi.spyOn(clickedAnchor, 'click').mockImplementation(() => undefined);
      }
      return el;
    });

    const createObjectUrlMock = vi.fn(() => 'blob:http://localhost/slide-1');
    const revokeObjectUrlMock = vi.fn();
    URL.createObjectURL = createObjectUrlMock;
    URL.revokeObjectURL = revokeObjectUrlMock;

    const result = await exportSlideAsPng({
      slide: MOCK_SLIDE,
      brand: MOCK_BRAND,
      photoSrc: '/assets/photos/business-showcase-1.png',
      aspectMode: '9:16',
      totalSlides: 4,
    });

    expect(result.filename).toBe('carousel-slide-1-9x16.png');
    expect(result.blob.size).toBeGreaterThan(0);
    expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    expect(clickedAnchor).not.toBeNull();
    expect(clickedAnchor!.download).toBe('carousel-slide-1-9x16.png');
    expect(revokeObjectUrlMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(9999);
    expect(revokeObjectUrlMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:http://localhost/slide-1');
  });

  it('resolves loadDecodedImage to null after 4000ms timeout and rejects on missing 2D context or empty/null toBlob', async () => {
    class HangingImageMock {
      decoding = '';
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';
    }
    globalThis.Image = HangingImageMock as unknown as typeof Image;

    const loadPromise = loadDecodedImage('/assets/photos/business-showcase-1.png');
    await vi.advanceTimersByTimeAsync(4000);
    await expect(loadPromise).resolves.toBeNull();

    class LoadedImageMock {
      decoding = '';
      naturalWidth = 512;
      naturalHeight = 512;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode = vi.fn().mockResolvedValue(undefined);
      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }
    globalThis.Image = LoadedImageMock as unknown as typeof Image;

    // Missing 2D context throws
    const badCanvas = document.createElement('canvas');
    vi.spyOn(badCanvas, 'getContext').mockReturnValue(null);
    await expect(
      renderSlideToCanvas(badCanvas, {
        slide: MOCK_SLIDE,
        brand: MOCK_BRAND,
        photoSrc: '/assets/photos/business-showcase-1.png',
        aspectMode: '9:16',
      })
    ).rejects.toThrow(/Canvas 2D context is unavailable/i);

    // Empty / null toBlob rejects
    const mockCtx = createMockCanvasContext();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreate(tagName);
      if (tagName.toLowerCase() === 'canvas') {
        const c = el as HTMLCanvasElement;
        vi.spyOn(c, 'getContext').mockReturnValue(
          mockCtx as unknown as CanvasRenderingContext2D
        );
        vi.spyOn(c, 'toBlob').mockImplementation((cb) => {
          cb(null);
        });
      }
      return el;
    });

    await expect(
      exportSlideAsPng({
        slide: MOCK_SLIDE,
        brand: MOCK_BRAND,
        photoSrc: '/assets/photos/business-showcase-1.png',
        aspectMode: '9:16',
      })
    ).rejects.toThrow(/Failed to export PNG image blob/i);
  });
});

describe('m4 CarouselTab UI integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders 4 slide selectors, updates headline live, and preserves edits across slides and BM/EN toggle', () => {
    renderCarouselTab();

    expect(screen.getByTestId('tab-panel-carousel')).toBeInTheDocument();
    expect(screen.getByTestId('carousel-slide-1')).toBeInTheDocument();
    expect(screen.getByTestId('carousel-slide-2')).toBeInTheDocument();
    expect(screen.getByTestId('carousel-slide-3')).toBeInTheDocument();
    expect(screen.getByTestId('carousel-slide-4')).toBeInTheDocument();

    const previewStage = screen.getByTestId('carousel-preview-stage');
    expect(previewStage.querySelectorAll('img').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('carousel-logo-img')).toHaveAttribute(
      'src',
      '/assets/brands/demo-brand-logo.png'
    );

    const headlineInput = screen.getByTestId('carousel-headline-input') as HTMLInputElement;
    fireEvent.change(headlineInput, { target: { value: 'Tajuk Slaid 1 Disunting' } });
    expect(previewStage).toHaveTextContent('Tajuk Slaid 1 Disunting');

    fireEvent.click(screen.getByTestId('carousel-slide-2'));
    fireEvent.change(screen.getByTestId('carousel-headline-input'), {
      target: { value: 'Tajuk Slaid 2 Disunting' },
    });
    expect(previewStage).toHaveTextContent('Tajuk Slaid 2 Disunting');

    // Toggle BM -> EN and switch back to Slide 1: both edits must persist
    fireEvent.click(screen.getByTestId('harness-toggle-locale'));
    expect(screen.getByTestId('carousel-download-btn')).toHaveTextContent(
      'Download Current Slide PNG'
    );
    expect(
      (screen.getByTestId('carousel-headline-input') as HTMLInputElement).value
    ).toBe('Tajuk Slaid 2 Disunting');

    fireEvent.click(screen.getByTestId('carousel-slide-1'));
    expect(
      (screen.getByTestId('carousel-headline-input') as HTMLInputElement).value
    ).toBe('Tajuk Slaid 1 Disunting');
    expect(previewStage).toHaveTextContent('Tajuk Slaid 1 Disunting');
  });

  it('defaults safezone-overlay to unmounted (false), toggles mount/unmount, and switches 9:16 vs 4:5 stage classes', () => {
    renderCarouselTab();

    expect(screen.queryByTestId('safezone-overlay')).toBeNull();
    expect(screen.getByTestId('carousel-preview-stage')).toHaveClass('aspect-[9/16]');

    fireEvent.click(screen.getByTestId('safezone-overlay-toggle'));
    expect(screen.getByTestId('safezone-overlay')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('safezone-aspect-4-5'));
    expect(screen.getByTestId('carousel-preview-stage')).toHaveClass('aspect-[4/5]');
    expect(screen.getByTestId('safezone-overlay')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('safezone-overlay-toggle'));
    expect(screen.queryByTestId('safezone-overlay')).toBeNull();

    fireEvent.click(screen.getByTestId('safezone-aspect-9-16'));
    expect(screen.getByTestId('carousel-preview-stage')).toHaveClass('aspect-[9/16]');
  });

  it('triggers PNG export when clicking carousel-download-btn', async () => {
    class LoadedImageMock {
      decoding = '';
      naturalWidth = 512;
      naturalHeight = 512;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode = vi.fn().mockResolvedValue(undefined);
      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }
    const origImage = globalThis.Image;
    globalThis.Image = LoadedImageMock as unknown as typeof Image;

    const mockCtx = createMockCanvasContext();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreate(tagName);
      if (tagName.toLowerCase() === 'canvas') {
        const c = el as HTMLCanvasElement;
        vi.spyOn(c, 'getContext').mockReturnValue(
          mockCtx as unknown as CanvasRenderingContext2D
        );
        vi.spyOn(c, 'toBlob').mockImplementation((cb) => {
          cb(new Blob(['png'], { type: 'image/png' }));
        });
      }
      if (tagName.toLowerCase() === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => undefined);
      }
      return el;
    });

    const origCreateUrl = URL.createObjectURL;
    const origRevokeUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:http://localhost/dl');
    URL.revokeObjectURL = vi.fn();

    try {
      renderCarouselTab();
      const btn = screen.getByTestId('carousel-download-btn');
      await act(async () => {
        fireEvent.click(btn);
      });
      await waitFor(() => {
        expect(btn).not.toBeDisabled();
      });
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.Image = origImage;
      URL.createObjectURL = origCreateUrl;
      URL.revokeObjectURL = origRevokeUrl;
    }
  });

  it('does not render broken <img src=""> when Photo 1 is cleared and translates export error on BM/EN toggle', async () => {
    function ClearPhotoHarness() {
      const { setInput } = useCampaign();
      return createElement(
        'div',
        null,
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'clear-photo-1',
            onClick: () =>
              setInput((prev) => ({
                ...prev,
                photos: [{ id: '', label: '', src: '', isSample: false }, prev.photos[1]],
              })),
          },
          'clear'
        ),
        createElement(CarouselHarness)
      );
    }

    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreate(tagName);
      if (tagName.toLowerCase() === 'canvas') {
        vi.spyOn(el as HTMLCanvasElement, 'getContext').mockReturnValue(null);
      }
      return el;
    });

    render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(ClearPhotoHarness))
        )
      )
    );

    fireEvent.click(screen.getByTestId('clear-photo-1'));
    const stageImgs = Array.from(
      screen.getByTestId('carousel-preview-stage').querySelectorAll('img')
    );
    expect(stageImgs.every((img) => Boolean(img.getAttribute('src')?.trim()))).toBe(true);

    // Role label translates to BM in ms mode and EN in en mode
    expect(screen.getByTestId('carousel-slide-1').textContent).toContain('PEMBUKA');

    await act(async () => {
      fireEvent.click(screen.getByTestId('carousel-download-btn'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/Eksport PNG gagal/i);

    fireEvent.click(screen.getByTestId('harness-toggle-locale'));
    expect(screen.getByTestId('carousel-slide-1').textContent).toContain('HOOK');
    expect(screen.getByRole('alert')).toHaveTextContent(/PNG export failed/i);
  });

  it('focuses headline input from stage click, switches Layer 1 photo, and propagates subheadline/badge/cta edits to stage and PNG export', async () => {
    class LoadedImageMock {
      decoding = '';
      naturalWidth = 512;
      naturalHeight = 512;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode = vi.fn().mockResolvedValue(undefined);
      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }
    const origImage = globalThis.Image;
    globalThis.Image = LoadedImageMock as unknown as typeof Image;

    const mockCtx = createMockCanvasContext();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreate(tagName);
      if (tagName.toLowerCase() === 'canvas') {
        const c = el as HTMLCanvasElement;
        vi.spyOn(c, 'getContext').mockReturnValue(
          mockCtx as unknown as CanvasRenderingContext2D
        );
        vi.spyOn(c, 'toBlob').mockImplementation((cb) => {
          cb(new Blob(['png'], { type: 'image/png' }));
        });
      }
      if (tagName.toLowerCase() === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => undefined);
      }
      return el;
    });

    const origCreateUrl = URL.createObjectURL;
    const origRevokeUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:http://localhost/dl2');
    URL.revokeObjectURL = vi.fn();

    try {
      renderCarouselTab();

      // Click stage headline button -> focuses carousel-headline-input
      const stageHeadlineBtn = screen.getByTitle(/Klik untuk sunting tajuk|Click to edit headline/i);
      fireEvent.click(stageHeadlineBtn);
      expect(document.activeElement).toBe(screen.getByTestId('carousel-headline-input'));

      // Switch Layer 1 photo from index 0 to index 1
      const photo1Btn = screen.getByTestId('carousel-photo-btn-1');
      expect(photo1Btn).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(photo1Btn);
      expect(photo1Btn).toHaveAttribute('aria-pressed', 'true');
      const bgImg = screen.getByTestId('carousel-preview-stage').querySelector('img')!;
      expect(bgImg.getAttribute('src')).toContain('business-product-2.png');

      // Edit subheadline, badge, and CTA
      fireEvent.change(screen.getByTestId('carousel-subheadline-input'), {
        target: { value: 'Subtajuk Karusel Baharu' },
      });
      fireEvent.change(screen.getByTestId('carousel-badge-input'), {
        target: { value: 'LENCANA BARU' },
      });
      fireEvent.change(screen.getByTestId('carousel-cta-input'), {
        target: { value: 'Tempah Slot' },
      });

      const stage = screen.getByTestId('carousel-preview-stage');
      expect(stage).toHaveTextContent('Subtajuk Karusel Baharu');
      expect(stage).toHaveTextContent('LENCANA BARU');
      expect(stage).toHaveTextContent('Tempah Slot');

      await act(async () => {
        fireEvent.click(screen.getByTestId('carousel-download-btn'));
      });
      const drawnStrings = mockCtx.fillText.mock.calls.map((c) => String(c[0]));
      expect(drawnStrings.some((s) => s.includes('LENCANA BARU'))).toBe(true);
      expect(drawnStrings.some((s) => s.includes('Tempah Slot'))).toBe(true);
    } finally {
      globalThis.Image = origImage;
      URL.createObjectURL = origCreateUrl;
      URL.revokeObjectURL = origRevokeUrl;
    }
  });

  it('displays bilingual empty-headline placeholder (Tiada tajuk) / (No headline) on slide selector when headline is cleared', () => {
    renderCarouselTab();

    const headlineInput = screen.getByTestId('carousel-headline-input') as HTMLInputElement;
    fireEvent.change(headlineInput, { target: { value: '' } });

    expect(screen.getByTestId('carousel-slide-1').textContent).toContain('(Tiada tajuk)');
    fireEvent.click(screen.getByTestId('harness-toggle-locale'));
    expect(screen.getByTestId('carousel-slide-1').textContent).toContain('(No headline)');
  });
});
