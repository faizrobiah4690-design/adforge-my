import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandVaultScreen } from '../../src/components/BrandVaultScreen';
import { OnboardingScreen } from '../../src/components/OnboardingScreen';
import { QuickCampaignForm } from '../../src/components/QuickCampaignForm';
import { SAMPLE_CLINIC_PHOTOS, SAMPLE_OFFER_CHIP, SEEDED_BRAND_ID } from '../../src/data/seedVault';
import { I18nProvider, useI18n } from '../../src/i18n/I18nContext';
import { CampaignProvider, useCampaign } from '../../src/state/CampaignContext';
import { WorkbenchProvider, useWorkbench } from '../../src/state/WorkbenchContext';
import {
  ImageNormalizeError,
  computeContainedDimensions,
  isDataImageUrl,
  normalizeLogoFile,
  normalizePhotoFile,
  type ImageNormalizeDeps,
} from '../../src/utils/imageNormalize';

function createMockCanvasAndImageDeps(options: {
  naturalWidth?: number;
  naturalHeight?: number;
  triggerImageError?: boolean;
  missingContext?: boolean;
  badToDataUrl?: boolean;
}) {
  const clearRect = vi.fn();
  const fillRect = vi.fn();
  const drawImage = vi.fn();
  let currentFillStyle = '';

  const ctx = {
    clearRect,
    fillRect,
    drawImage,
    get fillStyle() {
      return currentFillStyle;
    },
    set fillStyle(val: string) {
      currentFillStyle = val;
    },
  };

  const toDataURL = vi.fn((mimeType?: string) => {
    if (options.badToDataUrl) {
      return 'data:,';
    }
    if (mimeType === 'image/jpeg') {
      return 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2w==';
    }
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  });

  const canvasStub = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => (options.missingContext ? null : ctx)),
    toDataURL,
  } as unknown as HTMLCanvasElement;

  const deps: ImageNormalizeDeps = {
    createImage: () => {
      const imgObj: {
        naturalWidth: number;
        naturalHeight: number;
        onload: null | (() => void);
        onerror: null | (() => void);
        _src: string;
      } = {
        naturalWidth: options.naturalWidth ?? 512,
        naturalHeight: options.naturalHeight ?? 512,
        onload: null,
        onerror: null,
        _src: '',
      };

      Object.defineProperty(imgObj, 'src', {
        get() {
          return imgObj._src;
        },
        set(val: string) {
          imgObj._src = val;
          queueMicrotask(() => {
            if (options.triggerImageError) {
              imgObj.onerror?.();
            } else {
              imgObj.onload?.();
            }
          });
        },
      });

      return imgObj as unknown as HTMLImageElement;
    },
    createCanvas: () => canvasStub,
  };

  return { deps, clearRect, fillRect, drawImage, toDataURL, canvasStub };
}

function stubGlobalBrowserCanvasAndImage(naturalWidth = 600, naturalHeight = 600) {
  const originalImage = globalThis.Image;

  class MockImage {
    naturalWidth = naturalWidth;
    naturalHeight = naturalHeight;
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;
    private _src = '';

    get src() {
      return this._src;
    }

    set src(val: string) {
      this._src = val;
      queueMicrotask(() => {
        this.onload?.();
      });
    }
  }

  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    writable: true,
    value: MockImage,
  });

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        drawImage: vi.fn(),
        fillStyle: '',
      }) as unknown as CanvasRenderingContext2D
  );

  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation((mimeType?: string) =>
    mimeType === 'image/jpeg'
      ? 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2w=='
      : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  );

  return () => {
    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      writable: true,
      value: originalImage,
    });
  };
}

function renderWithProviders(ui: ReactNode) {
  return render(
    <I18nProvider>
      <WorkbenchProvider>
        <CampaignProvider>{ui}</CampaignProvider>
      </WorkbenchProvider>
    </I18nProvider>
  );
}

describe('imageNormalize', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes a valid 512x512 PNG logo preserving alpha transparency without upscaling', async () => {
    const { deps, clearRect, fillRect, drawImage, canvasStub } = createMockCanvasAndImageDeps({
      naturalWidth: 512,
      naturalHeight: 512,
    });
    const pngFile = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', {
      type: 'image/png',
    });

    const res = await normalizeLogoFile(pngFile, deps);
    expect(res.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(res.dataUrl.startsWith('blob:')).toBe(false);
    expect(res.width).toBe(512);
    expect(res.height).toBe(512);
    expect(res.wasResized).toBe(false);
    expect(canvasStub.width).toBe(512);
    expect(canvasStub.height).toBe(512);
    expect(clearRect).toHaveBeenCalledWith(0, 0, 512, 512);
    expect(fillRect).not.toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(isDataImageUrl(res.dataUrl)).toBe(true);
  });

  it('downscales oversized 3200x1600 PNG logo to maxDimension 1600 preserving aspect ratio', async () => {
    const { deps } = createMockCanvasAndImageDeps({
      naturalWidth: 3200,
      naturalHeight: 1600,
    });
    const pngFile = new File([new Uint8Array([137, 80, 78, 71])], 'wide-logo.png', {
      type: 'image/png',
    });

    const res = await normalizeLogoFile(pngFile, deps);
    expect(res.width).toBe(1600);
    expect(res.height).toBe(800);
    expect(res.originalWidth).toBe(3200);
    expect(res.originalHeight).toBe(1600);
    expect(res.wasResized).toBe(true);
  });

  it('rejects non-PNG logo uploads with INVALID_TYPE', async () => {
    const jpgFile = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
    const txtFile = new File(['hello'], 'not-an-image.txt', { type: 'text/plain' });
    const svgFile = new File(['<svg></svg>'], 'vector.svg', { type: 'image/svg+xml' });

    await expect(normalizeLogoFile(jpgFile)).rejects.toMatchObject({
      name: 'ImageNormalizeError',
      code: 'INVALID_TYPE',
    });
    await expect(normalizeLogoFile(txtFile)).rejects.toBeInstanceOf(ImageNormalizeError);
    await expect(normalizeLogoFile(svgFile)).rejects.toMatchObject({ code: 'INVALID_TYPE' });
  });

  it('normalizes JPEG photo with #0B0F19 fill and downscales 2400x3000 to 1280x1600', async () => {
    const { deps, fillRect, toDataURL } = createMockCanvasAndImageDeps({
      naturalWidth: 2400,
      naturalHeight: 3000,
    });
    const jpgFile = new File([new Uint8Array([255, 216, 255])], 'clinic.jpg', {
      type: 'image/jpeg',
    });

    const res = await normalizePhotoFile(jpgFile, deps);
    expect(res.mimeType).toBe('image/jpeg');
    expect(res.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(res.width).toBe(1280);
    expect(res.height).toBe(1600);
    expect(res.wasResized).toBe(true);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1280, 1600);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9);
  });

  it('rejects null, empty 0-byte, and oversized files with typed error codes', async () => {
    await expect(normalizeLogoFile(null)).rejects.toMatchObject({ code: 'NO_FILE' });

    const emptyFile = new File([], 'empty.png', { type: 'image/png' });
    await expect(normalizeLogoFile(emptyFile)).rejects.toMatchObject({ code: 'EMPTY_FILE' });

    const oversized = {
      name: 'huge.png',
      type: 'image/png',
      size: 20 * 1024 * 1024,
    } as File;
    await expect(normalizePhotoFile(oversized)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('rejects corrupt images, unavailable 2D context, and failed canvas export', async () => {
    const pngFile = new File([new Uint8Array([1, 2, 3])], 'test.png', { type: 'image/png' });

    const corruptDeps = createMockCanvasAndImageDeps({ triggerImageError: true }).deps;
    await expect(normalizeLogoFile(pngFile, corruptDeps)).rejects.toMatchObject({
      code: 'CORRUPT_IMAGE',
    });

    const zeroDimDeps = createMockCanvasAndImageDeps({ naturalWidth: 0, naturalHeight: 0 }).deps;
    await expect(normalizeLogoFile(pngFile, zeroDimDeps)).rejects.toMatchObject({
      code: 'CORRUPT_IMAGE',
    });

    const noCtxDeps = createMockCanvasAndImageDeps({ missingContext: true }).deps;
    await expect(normalizeLogoFile(pngFile, noCtxDeps)).rejects.toMatchObject({
      code: 'CANVAS_UNAVAILABLE',
    });

    const badExportDeps = createMockCanvasAndImageDeps({ badToDataUrl: true }).deps;
    await expect(normalizeLogoFile(pngFile, badExportDeps)).rejects.toMatchObject({
      code: 'EXPORT_FAILED',
    });

    expect(() => computeContainedDimensions(0, 100)).toThrow(ImageNormalizeError);
  });

  it('rejects SVG photos, type/ext-less files, FileReader failures, and handles WEBP + extreme aspect ratios + NaN maxDimension', async () => {
    const svgPhoto = new File(['<svg></svg>'], 'photo.svg', { type: 'image/svg+xml' });
    await expect(normalizePhotoFile(svgPhoto)).rejects.toMatchObject({ code: 'INVALID_TYPE' });

    const typeless = new File([new Uint8Array([1, 2, 3])], 'noext', { type: '' });
    await expect(normalizePhotoFile(typeless)).rejects.toMatchObject({ code: 'INVALID_TYPE' });

    const pngFile = new File([new Uint8Array([137, 80, 78, 71])], 'test.png', {
      type: 'image/png',
    });
    const errorReaderDeps: ImageNormalizeDeps = {
      createFileReader: () => {
        const reader = {
          result: null,
          onload: null as null | (() => void),
          onerror: null as null | (() => void),
          onabort: null as null | (() => void),
          readAsDataURL() {
            queueMicrotask(() => reader.onerror?.());
          },
        };
        return reader as unknown as FileReader;
      },
    };
    await expect(normalizePhotoFile(pngFile, errorReaderDeps)).rejects.toMatchObject({
      code: 'READ_FAILED',
    });

    const abortReaderDeps: ImageNormalizeDeps = {
      createFileReader: () => {
        const reader = {
          result: null,
          onload: null as null | (() => void),
          onerror: null as null | (() => void),
          onabort: null as null | (() => void),
          readAsDataURL() {
            queueMicrotask(() => reader.onabort?.());
          },
        };
        return reader as unknown as FileReader;
      },
    };
    await expect(normalizePhotoFile(pngFile, abortReaderDeps)).rejects.toMatchObject({
      code: 'READ_FAILED',
    });

    const { deps: webpDeps, fillRect, toDataURL } = createMockCanvasAndImageDeps({
      naturalWidth: 800,
      naturalHeight: 600,
    });
    const webpFile = new File([new Uint8Array([82, 73, 70, 70])], 'clinic.webp', {
      type: 'image/webp',
    });
    const webpRes = await normalizePhotoFile(webpFile, webpDeps);
    expect(webpRes.mimeType).toBe('image/jpeg');
    expect(fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9);

    expect(computeContainedDimensions(100000, 1, 1600)).toEqual({
      width: 1600,
      height: 1,
      wasResized: true,
    });
    expect(computeContainedDimensions(3200, 1600, Number.NaN)).toEqual({
      width: 1600,
      height: 800,
      wasResized: true,
    });
    expect(computeContainedDimensions(3200, 1600, 0)).toEqual({
      width: 1600,
      height: 800,
      wasResized: true,
    });
  });
});

describe('OnboardingScreen', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function OnboardingProbe() {
    const { setLocale } = useI18n();
    const { isLoggedIn, isDemoMode, byokKey, activeScreen } = useWorkbench();
    const { input } = useCampaign();
    return (
      <div>
        <span data-testid="probe-logged-in">{String(isLoggedIn)}</span>
        <span data-testid="probe-demo">{String(isDemoMode)}</span>
        <span data-testid="probe-byok">{byokKey}</span>
        <span data-testid="probe-screen">{activeScreen}</span>
        <span data-testid="probe-offer">{input.offerSentence}</span>
        <button type="button" data-testid="onboarding-switch-en" onClick={() => setLocale('en')}>
          EN
        </button>
        <button type="button" data-testid="onboarding-switch-ms" onClick={() => setLocale('ms')}>
          BM
        </button>
      </div>
    );
  }

  it('renders dark-mode Freelancer Workbench, local video guide, and gates Demo/Save behind Google Login (never auto-login)', () => {
    renderWithProviders(
      <>
        <OnboardingProbe />
        <OnboardingScreen />
      </>
    );

    expect(screen.getByTestId('onboarding-screen')).toBeInTheDocument();
    expect(screen.getByTestId('byok-video-guide')).toHaveAttribute(
      'src',
      '/assets/guide/byok-guide.webm'
    );
    expect(screen.getByTestId('onboarding-video-guide-play')).toBeInTheDocument();

    const saveBtn = screen.getByTestId('byok-save-btn');
    const demoBtn = screen.getByTestId('byok-demo-btn');
    expect(saveBtn).toBeDisabled();
    expect(demoBtn).toBeDisabled();

    fireEvent.click(demoBtn);
    fireEvent.click(saveBtn);

    expect(screen.getByTestId('probe-logged-in')).toHaveTextContent('false');
    expect(screen.getByTestId('probe-screen')).toHaveTextContent('onboarding');
    expect(screen.getByTestId('google-login-btn')).toBeInTheDocument();
  });

  it('reveals session badge on Google login, toggles password visibility preserving value, and validates BYOK keys', () => {
    renderWithProviders(
      <>
        <OnboardingProbe />
        <OnboardingScreen />
      </>
    );

    fireEvent.click(screen.getByTestId('google-login-btn'));
    expect(screen.getByTestId('probe-logged-in')).toHaveTextContent('true');
    expect(screen.getByTestId('onboarding-session-badge')).toHaveTextContent(
      'freelancer@studio.my'
    );

    const byokInput = screen.getByTestId('byok-input') as HTMLInputElement;
    expect(byokInput.type).toBe('password');

    fireEvent.change(byokInput, { target: { value: 'AIzaSySecretKeyTest999' } });
    fireEvent.click(screen.getByTestId('onboarding-byok-visibility'));
    expect(byokInput.type).toBe('text');
    expect(byokInput.value).toBe('AIzaSySecretKeyTest999');

    fireEvent.click(screen.getByTestId('onboarding-byok-visibility'));
    expect(byokInput.type).toBe('password');
    expect(byokInput.value).toBe('AIzaSySecretKeyTest999');

    // Empty key blocked
    fireEvent.change(byokInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('byok-save-btn'));
    expect(screen.getByTestId('onboarding-byok-error')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('probe-screen')).toHaveTextContent('onboarding');

    // Malformed key blocked
    fireEvent.change(byokInput, { target: { value: 'bad-key-123' } });
    fireEvent.click(screen.getByTestId('byok-save-btn'));
    expect(screen.getByTestId('onboarding-byok-error')).toHaveTextContent(/AIza/i);
    expect(screen.getByTestId('probe-screen')).toHaveTextContent('onboarding');

    // 11-char AIza key blocked (< 12 char minimum)
    fireEvent.change(byokInput, { target: { value: 'AIza1234567' } });
    fireEvent.click(screen.getByTestId('byok-save-btn'));
    expect(screen.getByTestId('onboarding-byok-error')).toHaveTextContent(/AIza/i);
    expect(screen.getByTestId('probe-screen')).toHaveTextContent('onboarding');

    // Valid key transitions to workbench
    fireEvent.change(byokInput, { target: { value: 'AIzaSyValidKey123456' } });
    fireEvent.click(screen.getByTestId('byok-save-btn'));
    expect(screen.getByTestId('probe-byok')).toHaveTextContent('AIzaSyValidKey123456');
    expect(screen.getByTestId('probe-demo')).toHaveTextContent('false');
    expect(screen.getByTestId('probe-screen')).toHaveTextContent('workbench');

    // 12-char AIza key accepted (matches isValidGeminiKeyFormat {8,} rule)
    fireEvent.change(screen.getByTestId('byok-input'), {
      target: { value: 'AIza12345678' },
    });
    fireEvent.click(screen.getByTestId('byok-save-btn'));
    expect(screen.getByTestId('probe-byok')).toHaveTextContent('AIza12345678');
    expect(screen.getByTestId('probe-screen')).toHaveTextContent('workbench');
  });

  it('supports 1-click Demo Mode after login and renders api-settings-modal on revisit preserving campaign state', () => {
    function RevisitHarness() {
      const { activeScreen, setActiveScreen } = useWorkbench();
      const { setInput } = useCampaign();
      return (
        <div>
          <button
            type="button"
            data-testid="edit-campaign-offer"
            onClick={() =>
              setInput((prev) => ({ ...prev, offerSentence: 'Tawaran Kekal Semula' }))
            }
          >
            edit
          </button>
          <button
            type="button"
            data-testid="revisit-settings"
            onClick={() => setActiveScreen('onboarding')}
          >
            revisit
          </button>
          <OnboardingProbe />
          {activeScreen === 'onboarding' ? <OnboardingScreen /> : null}
        </div>
      );
    }

    renderWithProviders(<RevisitHarness />);

    fireEvent.click(screen.getByTestId('google-login-btn'));
    fireEvent.click(screen.getByTestId('byok-demo-btn'));

    expect(screen.getByTestId('probe-demo')).toHaveTextContent('true');
    expect(screen.getByTestId('probe-screen')).toHaveTextContent('workbench');

    fireEvent.click(screen.getByTestId('edit-campaign-offer'));
    fireEvent.click(screen.getByTestId('revisit-settings'));

    const modal = screen.getByTestId('api-settings-modal');
    expect(modal).toHaveAttribute('role', 'dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');

    fireEvent.click(screen.getByTestId('api-settings-close'));
    expect(screen.getByTestId('probe-screen')).toHaveTextContent('workbench');
    expect(screen.getByTestId('probe-offer')).toHaveTextContent('Tawaran Kekal Semula');
  });

  it('sanitizes malformed keyDraft when entering Demo Mode and translates visible BYOK error on BM/EN toggle', () => {
    renderWithProviders(
      <>
        <OnboardingProbe />
        <OnboardingScreen />
      </>
    );

    fireEvent.click(screen.getByTestId('google-login-btn'));

    const byokInput = screen.getByTestId('byok-input') as HTMLInputElement;
    fireEvent.change(byokInput, { target: { value: 'bad-key-123' } });
    fireEvent.click(screen.getByTestId('byok-save-btn'));
    expect(screen.getByTestId('onboarding-byok-error')).toHaveTextContent(
      'Format kunci API tidak sah'
    );

    // Toggling BM <-> EN translates already-visible inline error immediately
    fireEvent.click(screen.getByTestId('onboarding-switch-en'));
    expect(screen.getByTestId('onboarding-byok-error')).toHaveTextContent('Invalid API key format');
    fireEvent.click(screen.getByTestId('onboarding-switch-ms'));
    expect(screen.getByTestId('onboarding-byok-error')).toHaveTextContent(
      'Format kunci API tidak sah'
    );

    // Entering Demo Mode with malformed keyDraft does NOT persist bad-key-123 into byokKey
    fireEvent.click(screen.getByTestId('byok-demo-btn'));
    expect(screen.getByTestId('probe-demo')).toHaveTextContent('true');
    expect(screen.getByTestId('probe-byok')).toHaveTextContent('');
    expect((screen.getByTestId('byok-input') as HTMLInputElement).value).toBe('');

    // Entering Demo Mode with valid keyDraft preserves trimmed valid key
    fireEvent.change(screen.getByTestId('byok-input'), {
      target: { value: '  AIzaSyValidDemoKey123  ' },
    });
    fireEvent.click(screen.getByTestId('byok-demo-btn'));
    expect(screen.getByTestId('probe-demo')).toHaveTextContent('true');
    expect(screen.getByTestId('probe-byok')).toHaveTextContent('AIzaSyValidDemoKey123');
  });

  it('closes api-settings-modal on Escape key and re-gates workbench on logout', () => {
    function ModalEscapeHarness() {
      const { activeScreen, setActiveScreen } = useWorkbench();
      return (
        <div>
          <button
            type="button"
            data-testid="open-settings"
            onClick={() => setActiveScreen('onboarding')}
          >
            open
          </button>
          <OnboardingProbe />
          {activeScreen === 'onboarding' ? <OnboardingScreen /> : null}
        </div>
      );
    }

    renderWithProviders(<ModalEscapeHarness />);
    fireEvent.click(screen.getByTestId('google-login-btn'));
    fireEvent.click(screen.getByTestId('byok-demo-btn'));
    expect(screen.getByTestId('probe-screen')).toHaveTextContent('workbench');

    fireEvent.click(screen.getByTestId('open-settings'));
    expect(screen.getByTestId('api-settings-modal')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('probe-screen')).toHaveTextContent('workbench');

    fireEvent.click(screen.getByTestId('open-settings'));
    fireEvent.click(screen.getByRole('button', { name: /Log Keluar|Sign Out/i }));
    expect(screen.getByTestId('probe-logged-in')).toHaveTextContent('false');
    expect(screen.getByTestId('probe-screen')).toHaveTextContent('onboarding');
  });
});

describe('BrandVaultScreen', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function VaultProbe() {
    const { setLocale } = useI18n();
    const { activeBrand, brands, loginWithGoogle, saveByokKey } = useWorkbench();
    return (
      <div>
        <span data-testid="vault-active-id">{activeBrand.id}</span>
        <span data-testid="vault-active-wa">{activeBrand.whatsappNumber}</span>
        <span data-testid="vault-active-color">{activeBrand.themeColor}</span>
        <span data-testid="vault-active-tone">{activeBrand.tone}</span>
        <span data-testid="vault-active-logo">{activeBrand.logoDataUrl}</span>
        <span data-testid="vault-count">{brands.length}</span>
        <button type="button" data-testid="vault-switch-en" onClick={() => setLocale('en')}>
          EN
        </button>
        <button type="button" data-testid="vault-switch-ms" onClick={() => setLocale('ms')}>
          BM
        </button>
        <button
          type="button"
          data-testid="activate-demo-mode"
          onClick={() => {
            loginWithGoogle();
            saveByokKey('', true);
          }}
        >
          demo
        </button>
      </div>
    );
  }

  it('displays pre-seeded Klinik Gigi Impian, demo badge when active, and rejects blank folder creation', () => {
    renderWithProviders(
      <>
        <VaultProbe />
        <BrandVaultScreen />
      </>
    );

    expect(screen.getByTestId(`brand-folder-${SEEDED_BRAND_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId('brand-logo-preview')).toHaveAttribute(
      'src',
      '/assets/brands/klinik-gigi-impian-logo.png'
    );
    expect((screen.getByTestId('brand-whatsapp-input') as HTMLInputElement).value).toBe(
      '60123456789'
    );

    fireEvent.click(screen.getByTestId('activate-demo-mode'));
    expect(screen.getByTestId('onboarding-demo-badge')).toHaveTextContent(/Demo/i);

    fireEvent.change(screen.getByTestId('new-brand-name-input'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('create-brand-btn'));
    expect(screen.getByTestId('brand-error')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('vault-count')).toHaveTextContent('1');
  });

  it('isolates multiple folders, validates WhatsApp with buffered draft, and normalizes PNG logo uploads', async () => {
    const cleanupImage = stubGlobalBrowserCanvasAndImage(256, 256);
    try {
      renderWithProviders(
        <>
          <VaultProbe />
          <BrandVaultScreen />
        </>
      );

      // Create second folder
      fireEvent.change(screen.getByTestId('new-brand-name-input'), {
        target: { value: 'Kopi Klasik KL' },
      });
      fireEvent.click(screen.getByTestId('create-brand-btn'));
      expect(screen.getByTestId('vault-active-id')).toHaveTextContent('kopi-klasik-kl');

      // Edit color, tone, and valid Malaysian WhatsApp
      fireEvent.change(screen.getByTestId('brand-color-input'), {
        target: { value: '#10B981' },
      });
      fireEvent.click(screen.getByTestId('brand-tone-professional'));
      expect(screen.getByTestId('brand-tone-professional')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('brand-tone-professional')).toHaveAttribute('data-active', 'true');

      fireEvent.change(screen.getByTestId('brand-whatsapp-input'), {
        target: { value: '+60 19-888 7766' },
      });
      fireEvent.click(screen.getByTestId('brand-save-btn'));
      expect(screen.getByTestId('vault-active-wa')).toHaveTextContent('60198887766');

      // Invalid WhatsApp keeps buffered draft and does not overwrite stored number
      fireEvent.change(screen.getByTestId('brand-whatsapp-input'), {
        target: { value: 'abc-not-a-phone' },
      });
      fireEvent.click(screen.getByTestId('brand-save-btn'));
      expect(screen.getByTestId('brand-error')).toHaveAttribute('role', 'alert');
      expect(screen.getByTestId('vault-active-wa')).toHaveTextContent('60198887766');

      // Upload valid PNG logo
      const logoInput = screen.getByTestId('brand-logo-input') as HTMLInputElement;
      const validPng = new File([new Uint8Array([137, 80, 78, 71])], 'kopi-logo.png', {
        type: 'image/png',
      });
      fireEvent.change(logoInput, { target: { files: [validPng] } });

      await waitFor(() => {
        expect(screen.getByTestId('vault-active-logo').textContent).toMatch(
          /^data:image\/png;base64,/
        );
      });

      const uploadedLogoSrc = screen.getByTestId('brand-logo-preview').getAttribute('src');

      // Reject invalid non-PNG upload without losing previous logo
      const badFile = new File(['plain text'], 'not-an-image.txt', { type: 'text/plain' });
      fireEvent.change(logoInput, { target: { files: [badFile] } });
      await waitFor(() => {
        expect(screen.getByTestId('brand-error')).toHaveAttribute('role', 'alert');
      });
      expect(screen.getByTestId('brand-logo-preview')).toHaveAttribute('src', uploadedLogoSrc);

      // Switch back to Klinik Gigi Impian — completely isolated
      fireEvent.click(screen.getByTestId(`brand-folder-${SEEDED_BRAND_ID}`));
      expect(screen.getByTestId('vault-active-color')).toHaveTextContent('#0EA5E9');
      expect(screen.getByTestId('vault-active-tone')).toHaveTextContent('casual');
      expect(screen.getByTestId('vault-active-wa')).toHaveTextContent('60123456789');
      expect(screen.getByTestId('brand-logo-preview')).toHaveAttribute(
        'src',
        '/assets/brands/klinik-gigi-impian-logo.png'
      );
    } finally {
      cleanupImage();
    }
  });

  it('matches only <button> elements for [data-testid^="brand-folder-"] and translates inline errors on BM/EN toggle', () => {
    renderWithProviders(
      <>
        <VaultProbe />
        <BrandVaultScreen />
      </>
    );

    const vaultScreen = screen.getByTestId('brand-vault-screen');
    const initialFolders = Array.from(
      vaultScreen.querySelectorAll('[data-testid^="brand-folder-"]')
    );
    expect(initialFolders).toHaveLength(1);
    expect(initialFolders.every((el) => el.tagName === 'BUTTON')).toBe(true);
    expect(vaultScreen.querySelectorAll('div[data-testid^="brand-folder-"]')).toHaveLength(0);

    // Create second folder
    fireEvent.change(screen.getByTestId('new-brand-name-input'), {
      target: { value: 'Klinik & Co <1>' },
    });
    fireEvent.click(screen.getByTestId('create-brand-btn'));
    expect(screen.getByTestId('vault-active-id')).toHaveTextContent('klinik-co-1');

    const updatedFolders = Array.from(
      vaultScreen.querySelectorAll('[data-testid^="brand-folder-"]')
    );
    expect(updatedFolders).toHaveLength(2);
    expect(updatedFolders.every((el) => el.tagName === 'BUTTON')).toBe(true);
    expect(vaultScreen.querySelectorAll('div[data-testid^="brand-folder-"]')).toHaveLength(0);

    // Clicking the [data-testid^="brand-folder-"] element matching Klinik Gigi Impian switches back cleanly
    const seededBtn = updatedFolders.find((el) => el.textContent?.includes('Klinik Gigi Impian'));
    expect(seededBtn).toBeDefined();
    fireEvent.click(seededBtn!);
    expect(screen.getByTestId('vault-active-id')).toHaveTextContent(SEEDED_BRAND_ID);
    expect((screen.getByTestId('brand-name-input') as HTMLInputElement).value).toBe(
      'Klinik Gigi Impian'
    );

    // Trigger inline error and verify BM <-> EN toggle translates it reactively
    fireEvent.change(screen.getByTestId('new-brand-name-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('create-brand-btn'));
    expect(screen.getByTestId('brand-error')).toHaveTextContent(
      'Sila masukkan nama folder jenama yang sah'
    );

    fireEvent.click(screen.getByTestId('vault-switch-en'));
    expect(screen.getByTestId('brand-error')).toHaveTextContent(
      'Please enter a valid brand folder name'
    );

    fireEvent.click(screen.getByTestId('vault-switch-ms'));
    expect(screen.getByTestId('brand-error')).toHaveTextContent(
      'Sila masukkan nama folder jenama yang sah'
    );
  });

  it('rejects blank brand-name-input save, oversized logo, onBlur invalid WhatsApp, and disables save while logo upload is pending', async () => {
    let triggerImageLoad: (() => void) | null = null;
    const origImage = globalThis.Image;
    class DeferredImage {
      naturalWidth = 128;
      naturalHeight = 128;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_val: string) {
        triggerImageLoad = () => this.onload?.();
      }
    }
    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      writable: true,
      value: DeferredImage,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          fillStyle: '',
        }) as unknown as CanvasRenderingContext2D
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    );

    try {
      renderWithProviders(
        <>
          <VaultProbe />
          <BrandVaultScreen />
        </>
      );

      // Blank brand name save rejection
      fireEvent.change(screen.getByTestId('brand-name-input'), { target: { value: '   ' } });
      fireEvent.click(screen.getByTestId('brand-save-btn'));
      expect(screen.getByTestId('brand-error')).toHaveAttribute('role', 'alert');

      // onBlur invalid WhatsApp triggers error without wiping saved phone
      fireEvent.change(screen.getByTestId('brand-whatsapp-input'), {
        target: { value: 'abc-invalid' },
      });
      fireEvent.blur(screen.getByTestId('brand-whatsapp-input'));
      expect(screen.getByTestId('brand-error')).toHaveAttribute('role', 'alert');
      expect(screen.getByTestId('vault-active-wa')).toHaveTextContent('60123456789');

      // Oversized logo (>15MB) rejected
      const hugeLogo = new File([new Uint8Array(10)], 'huge.png', { type: 'image/png' });
      Object.defineProperty(hugeLogo, 'size', { value: 16 * 1024 * 1024 });
      fireEvent.change(screen.getByTestId('brand-logo-input'), {
        target: { files: [hugeLogo] },
      });
      await waitFor(() => {
        expect(screen.getByTestId('brand-error')).toHaveAttribute('role', 'alert');
      });

      // Deferred logo upload disables brand-save-btn until resolved
      const validLogo = new File([new Uint8Array([137, 80, 78, 71])], 'deferred.png', {
        type: 'image/png',
      });
      fireEvent.change(screen.getByTestId('brand-logo-input'), {
        target: { files: [validLogo] },
      });
      expect(screen.getByTestId('brand-save-btn')).toBeDisabled();

      await waitFor(() => {
        expect(triggerImageLoad).not.toBeNull();
      });
      triggerImageLoad!();

      await waitFor(() => {
        expect(screen.getByTestId('brand-save-btn')).toBeEnabled();
      });
      expect(screen.getByTestId('vault-active-logo').textContent).toMatch(
        /^data:image\/png;base64,/
      );
    } finally {
      Object.defineProperty(globalThis, 'Image', {
        configurable: true,
        writable: true,
        value: origImage,
      });
    }
  });

  it('invalidates pending logo upload and clears busy/error state when switching folders mid-upload', async () => {
    let triggerImageError: (() => void) | null = null;
    const origImage = globalThis.Image;
    class DeferredErrorImage {
      naturalWidth = 0;
      naturalHeight = 0;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_val: string) {
        triggerImageError = () => this.onerror?.();
      }
    }
    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      writable: true,
      value: DeferredErrorImage,
    });

    try {
      renderWithProviders(
        <>
          <VaultProbe />
          <BrandVaultScreen />
        </>
      );

      // Create Brand B then switch back to Brand A (seeded)
      fireEvent.change(screen.getByTestId('new-brand-name-input'), {
        target: { value: 'Klinik Kedua' },
      });
      fireEvent.click(screen.getByTestId('create-brand-btn'));
      expect(screen.getByTestId('vault-active-id')).toHaveTextContent('klinik-kedua');

      fireEvent.click(screen.getByTestId(`brand-folder-${SEEDED_BRAND_ID}`));
      expect(screen.getByTestId('vault-active-id')).toHaveTextContent(SEEDED_BRAND_ID);

      // Start corrupt PNG upload on Brand A while deferred
      const corruptPng = new File([new Uint8Array([137, 80, 78, 71])], 'corrupt.png', {
        type: 'image/png',
      });
      fireEvent.change(screen.getByTestId('brand-logo-input'), {
        target: { files: [corruptPng] },
      });
      expect(screen.getByTestId('brand-save-btn')).toBeDisabled();

      await waitFor(() => {
        expect(triggerImageError).not.toBeNull();
      });

      // Switch to Brand B before Brand A upload settles -> Brand B Save must be enabled immediately
      fireEvent.click(screen.getByTestId('brand-folder-klinik-kedua'));
      expect(screen.getByTestId('vault-active-id')).toHaveTextContent('klinik-kedua');
      expect(screen.getByTestId('brand-save-btn')).toBeEnabled();

      // Reject Brand A deferred upload -> must NOT leak invalid_logo error onto Brand B
      triggerImageError!();
      await waitFor(() => {
        expect(screen.queryByTestId('brand-error')).toBeNull();
      });
      expect(screen.getByTestId('brand-save-btn')).toBeEnabled();
    } finally {
      Object.defineProperty(globalThis, 'Image', {
        configurable: true,
        writable: true,
        value: origImage,
      });
    }
  });

  it('updates activeBrand themeColor and aria-pressed state when clicking THEME_COLOR_PRESETS swatch buttons', () => {
    renderWithProviders(
      <>
        <VaultProbe />
        <BrandVaultScreen />
      </>
    );

    const skySwatch = screen.getByRole('button', { name: '#0EA5E9' });
    const emeraldSwatch = screen.getByRole('button', { name: '#10B981' });
    expect(skySwatch).toHaveAttribute('aria-pressed', 'true');
    expect(emeraldSwatch).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(emeraldSwatch);
    expect(emeraldSwatch).toHaveAttribute('aria-pressed', 'true');
    expect(skySwatch).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('vault-active-color')).toHaveTextContent('#10B981');
    expect((screen.getByTestId('brand-color-input') as HTMLInputElement).value.toLowerCase()).toBe(
      '#10b981'
    );
  });

  it('keeps invalid_wa error visible on brand-name-input or theme color edits until WhatsApp is valid or folder switches', () => {
    renderWithProviders(
      <>
        <VaultProbe />
        <BrandVaultScreen />
      </>
    );

    // Trigger invalid_wa on blur
    const waInput = screen.getByTestId('brand-whatsapp-input') as HTMLInputElement;
    fireEvent.change(waInput, { target: { value: '123' } });
    fireEvent.blur(waInput);
    expect(screen.getByTestId('brand-error')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('brand-error')).toHaveTextContent(/WhatsApp/i);

    // Editing brand name must NOT clear invalid_wa while waDraft is still invalid
    fireEvent.change(screen.getByTestId('brand-name-input'), {
      target: { value: 'Klinik Gigi Impian X' },
    });
    expect(screen.getByTestId('brand-error')).toHaveTextContent(/WhatsApp/i);
    expect(waInput.value).toBe('123');
    expect(screen.getByTestId('vault-active-wa')).toHaveTextContent('60123456789');

    // Clicking a THEME_COLOR_PRESETS swatch or editing color input must NOT clear invalid_wa
    fireEvent.click(screen.getByRole('button', { name: '#10B981' }));
    expect(screen.getByTestId('brand-error')).toHaveTextContent(/WhatsApp/i);
    fireEvent.change(screen.getByTestId('brand-color-input'), { target: { value: '#F59E0B' } });
    expect(screen.getByTestId('brand-error')).toHaveTextContent(/WhatsApp/i);

    // Fixing WhatsApp clears invalid_wa and updates stored phone
    fireEvent.change(waInput, { target: { value: '018-777 6655' } });
    expect(screen.queryByTestId('brand-error')).toBeNull();
    expect(screen.getByTestId('vault-active-wa')).toHaveTextContent('60187776655');

    // Trigger invalid_wa again, then verify folder creation/switch clears it cleanly
    fireEvent.change(waInput, { target: { value: '99' } });
    fireEvent.blur(waInput);
    expect(screen.getByTestId('brand-error')).toHaveTextContent(/WhatsApp/i);
    fireEvent.change(screen.getByTestId('new-brand-name-input'), {
      target: { value: 'Klinik Folder B' },
    });
    fireEvent.click(screen.getByTestId('create-brand-btn'));
    expect(screen.queryByTestId('brand-error')).toBeNull();
  });

  it('creates duplicate brand folder name with -2 slug suffix without overwriting seeded Klinik Gigi Impian and syncs QuickCampaignForm select', () => {
    renderWithProviders(
      <>
        <VaultProbe />
        <BrandVaultScreen />
        <QuickCampaignForm />
      </>
    );

    fireEvent.change(screen.getByTestId('new-brand-name-input'), {
      target: { value: 'Klinik Gigi Impian' },
    });
    fireEvent.click(screen.getByTestId('create-brand-btn'));

    expect(screen.getByTestId('vault-count')).toHaveTextContent('2');
    expect(screen.getByTestId('vault-active-id')).toHaveTextContent('klinik-gigi-impian-2');
    expect(screen.getByTestId('brand-folder-klinik-gigi-impian')).toBeInTheDocument();
    expect(screen.getByTestId('brand-folder-klinik-gigi-impian-2')).toBeInTheDocument();

    // Mutate the duplicate folder's WhatsApp and color
    fireEvent.change(screen.getByTestId('brand-whatsapp-input'), {
      target: { value: '019-222 3333' },
    });
    fireEvent.change(screen.getByTestId('brand-color-input'), {
      target: { value: '#10B981' },
    });
    expect(screen.getByTestId('vault-active-wa')).toHaveTextContent('60192223333');

    // Selecting seeded brand via QuickCampaignForm <select> switches Brand Vault back to uncorrupted seeded folder
    const brandSelect = screen.getByTestId('campaign-brand-select') as HTMLSelectElement;
    expect(brandSelect.value).toBe('klinik-gigi-impian-2');
    fireEvent.change(brandSelect, { target: { value: SEEDED_BRAND_ID } });

    expect(screen.getByTestId('vault-active-id')).toHaveTextContent(SEEDED_BRAND_ID);
    expect(screen.getByTestId('vault-active-wa')).toHaveTextContent('60123456789');
    expect(screen.getByTestId('vault-active-color')).toHaveTextContent('#0EA5E9');
  });
});

describe('QuickCampaignForm', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function FormProbe() {
    const { setLocale } = useI18n();
    const { createBrand } = useWorkbench();
    const { isLaunched, input } = useCampaign();
    return (
      <div>
        <span data-testid="form-launched">{String(isLaunched)}</span>
        <span data-testid="form-brand-id">{input.brandId}</span>
        <span data-testid="form-photo-0">{input.photos[0].src}</span>
        <span data-testid="form-photo-1">{input.photos[1].src}</span>
        <button
          type="button"
          data-testid="add-folder-btn"
          onClick={() => createBrand({ name: 'Klinik Harmoni' })}
        >
          addFolder
        </button>
        <button type="button" data-testid="switch-en" onClick={() => setLocale('en')}>
          EN
        </button>
        <button type="button" data-testid="switch-ms" onClick={() => setLocale('ms')}>
          BM
        </button>
      </div>
    );
  }

  it('validates non-empty offer and both photos before launching campaign', () => {
    renderWithProviders(
      <>
        <FormProbe />
        <QuickCampaignForm />
      </>
    );

    // Clear offer -> blocks launch
    fireEvent.change(screen.getByTestId('offer-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('launch-campaign-btn'));
    expect(screen.getByTestId('campaign-form-error')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('form-launched')).toHaveTextContent('false');

    // Fill offer via quick chip, clear Photo 2 -> blocks launch
    fireEvent.click(screen.getByTestId('offer-sample-chip'));
    expect((screen.getByTestId('offer-input') as HTMLTextAreaElement).value).toBe(
      SAMPLE_OFFER_CHIP
    );

    fireEvent.click(screen.getByTestId('campaign-photo-2-clear'));
    expect(screen.getByTestId('photo-slot-1').querySelector('img')).toBeNull();
    fireEvent.click(screen.getByTestId('launch-campaign-btn'));
    expect(screen.getByTestId('campaign-form-error')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('form-launched')).toHaveTextContent('false');

    // 1-click sample picker attaches Photo 2 when empty and opens 3-photo clinic gallery
    fireEvent.click(screen.getByTestId('sample-photo-picker-1'));
    expect(screen.getByTestId('photo-slot-1').querySelector('img')).not.toBeNull();
    expect(screen.getByText(SAMPLE_CLINIC_PHOTOS[2].label)).toBeInTheDocument();

    // Select 3rd clinic photo from gallery on Slot 2 and Slot 1
    fireEvent.click(screen.getByText(SAMPLE_CLINIC_PHOTOS[2].label));
    expect(screen.getByTestId('form-photo-1')).toHaveTextContent(SAMPLE_CLINIC_PHOTOS[2].src);

    fireEvent.click(screen.getByTestId('sample-photo-picker-0'));
    fireEvent.click(within(screen.getByTestId('photo-slot-0')).getByText(SAMPLE_CLINIC_PHOTOS[2].label));
    expect(screen.getByTestId('form-photo-0')).toHaveTextContent(SAMPLE_CLINIC_PHOTOS[2].src);

    // Valid submit launches campaign
    fireEvent.click(screen.getByTestId('launch-campaign-btn'));
    expect(screen.getByTestId('form-launched')).toHaveTextContent('true');
  });

  it('normalizes uploaded photos to data: URLs, preserves prior photo on invalid upload, syncs brand select, and keeps edits across BM/EN toggle', async () => {
    const cleanupImage = stubGlobalBrowserCanvasAndImage(1200, 1500);
    try {
      renderWithProviders(
        <>
          <FormProbe />
          <QuickCampaignForm />
        </>
      );

      fireEvent.click(screen.getByTestId('add-folder-btn'));
      const brandSelect = screen.getByTestId('campaign-brand-select') as HTMLSelectElement;
      expect(brandSelect.value).toBe('klinik-harmoni');

      const photo1Input = screen.getByTestId('campaign-photo-1-input') as HTMLInputElement;
      const validPhoto = new File([new Uint8Array([255, 216, 255])], 'smile.jpg', {
        type: 'image/jpeg',
      });
      fireEvent.change(photo1Input, { target: { files: [validPhoto] } });

      await waitFor(() => {
        expect(screen.getByTestId('form-photo-0').textContent).toMatch(/^data:image\/jpeg;base64,/);
      });

      const validDataUrl = screen.getByTestId('form-photo-0').textContent;

      // Invalid file preserves existing photo and displays error
      const badFile = new File(['bad'], 'bad-file.txt', { type: 'text/plain' });
      fireEvent.change(photo1Input, { target: { files: [badFile] } });
      await waitFor(() => {
        expect(screen.getByTestId('campaign-form-error')).toHaveAttribute('role', 'alert');
      });
      expect(screen.getByTestId('form-photo-0')).toHaveTextContent(validDataUrl ?? '');

      // Custom offer stays intact across BM <-> EN switch
      fireEvent.change(screen.getByTestId('offer-input'), {
        target: { value: 'Promosi Khas Implan Gigi' },
      });
      fireEvent.click(screen.getByTestId('switch-en'));
      expect(screen.getByTestId('launch-campaign-btn')).toHaveTextContent('Build Campaign');
      expect((screen.getByTestId('offer-input') as HTMLTextAreaElement).value).toBe(
        'Promosi Khas Implan Gigi'
      );
      expect(screen.getByTestId('form-photo-0')).toHaveTextContent(validDataUrl ?? '');

      fireEvent.click(screen.getByTestId('switch-ms'));
      expect(screen.getByTestId('launch-campaign-btn')).toHaveTextContent('Bina Kempen');
      expect((screen.getByTestId('offer-input') as HTMLTextAreaElement).value).toBe(
        'Promosi Khas Implan Gigi'
      );
    } finally {
      cleanupImage();
    }
  });

  it('translates visible campaign form inline error on BM/EN toggle', () => {
    renderWithProviders(
      <>
        <FormProbe />
        <QuickCampaignForm />
      </>
    );

    fireEvent.change(screen.getByTestId('offer-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('launch-campaign-btn'));
    expect(screen.getByTestId('campaign-form-error')).toHaveTextContent(
      'Sila masukkan ayat tawaran kempen'
    );

    fireEvent.click(screen.getByTestId('switch-en'));
    expect(screen.getByTestId('campaign-form-error')).toHaveTextContent(
      'Please enter a campaign offer sentence'
    );

    fireEvent.click(screen.getByTestId('switch-ms'));
    expect(screen.getByTestId('campaign-form-error')).toHaveTextContent(
      'Sila masukkan ayat tawaran kempen'
    );
  });

  it('disables launch-campaign-btn while photo upload normalization is pending and re-enables once resolved', async () => {
    let triggerImageLoad: (() => void) | null = null;
    const origImage = globalThis.Image;
    class DeferredImage {
      naturalWidth = 600;
      naturalHeight = 800;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_val: string) {
        triggerImageLoad = () => this.onload?.();
      }
    }
    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      writable: true,
      value: DeferredImage,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          fillStyle: '',
        }) as unknown as CanvasRenderingContext2D
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    );

    try {
      renderWithProviders(
        <>
          <FormProbe />
          <QuickCampaignForm />
        </>
      );

      const photo1Input = screen.getByTestId('campaign-photo-1-input');
      const png = new File([new Uint8Array([137, 80, 78, 71])], 'clinic.png', {
        type: 'image/png',
      });
      fireEvent.change(photo1Input, { target: { files: [png] } });

      expect(screen.getByTestId('launch-campaign-btn')).toBeDisabled();
      expect(screen.getByTestId('sample-photo-picker-0')).toBeDisabled();

      await waitFor(() => {
        expect(triggerImageLoad).not.toBeNull();
      });
      triggerImageLoad!();

      await waitFor(() => {
        expect(screen.getByTestId('launch-campaign-btn')).toBeEnabled();
      });
      expect(screen.getByTestId('form-photo-0').textContent).toMatch(/^data:image\/png;base64,/);
    } finally {
      Object.defineProperty(globalThis, 'Image', {
        configurable: true,
        writable: true,
        value: origImage,
      });
    }
  });
});
