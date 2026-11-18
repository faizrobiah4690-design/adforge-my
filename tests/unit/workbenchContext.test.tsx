import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SEEDED_BRAND_ID } from '../../src/data/seedVault';
import {
  WORKBENCH_STORAGE_KEY,
  WorkbenchProvider,
  normalizeWhatsappDigits,
  useWorkbench,
} from '../../src/state/WorkbenchContext';

function WorkbenchProbe() {
  const {
    isLoggedIn,
    freelancerEmail,
    byokKey,
    isDemoMode,
    activeScreen,
    loginWithGoogle,
    saveByokKey,
    brands,
    activeBrand,
    selectBrand,
    createBrand,
    updateBrand,
    deleteBrand,
  } = useWorkbench();

  const seeded = brands.find((b) => b.id === SEEDED_BRAND_ID);

  return (
    <div>
      <span data-testid="logged-in">{String(isLoggedIn)}</span>
      <span data-testid="email">{freelancerEmail ?? 'none'}</span>
      <span data-testid="byok">{byokKey}</span>
      <span data-testid="demo">{String(isDemoMode)}</span>
      <span data-testid="screen">{activeScreen}</span>
      <span data-testid="brand-count">{brands.length}</span>
      <span data-testid="active-brand-id">{activeBrand.id}</span>
      <span data-testid="active-brand-name">{activeBrand.name}</span>
      <span data-testid="active-brand-wa">{activeBrand.whatsappNumber}</span>
      <span data-testid="active-brand-tone">{activeBrand.tone}</span>
      <span data-testid="seeded-wa">{seeded?.whatsappNumber ?? ''}</span>
      <span data-testid="seeded-tone">{seeded?.tone ?? ''}</span>

      <button
        type="button"
        data-testid="do-login"
        onClick={() => loginWithGoogle('nurul@agency.my')}
      >
        login
      </button>
      <button
        type="button"
        data-testid="do-save-key"
        onClick={() => saveByokKey('  sk-live-test-key-123456  ', false)}
      >
        saveKey
      </button>
      <button
        type="button"
        data-testid="do-save-blank-key"
        onClick={() => saveByokKey('   ', false)}
      >
        saveBlankKey
      </button>
      <button
        type="button"
        data-testid="do-create-brand"
        onClick={() =>
          createBrand({
            name: 'Kafe Kopi Harmoni',
            themeColor: '#10B981',
            tone: 'professional',
            whatsappNumber: '0198887777',
          })
        }
      >
        createBrand
      </button>
      <button
        type="button"
        data-testid="do-delete-active"
        onClick={() => deleteBrand(activeBrand.id)}
      >
        deleteActive
      </button>
      <button
        type="button"
        data-testid="do-update-active"
        onClick={() =>
          updateBrand(activeBrand.id, {
            whatsappNumber: '+6017-555 4433',
            tone: 'professional',
          })
        }
      >
        updateActive
      </button>
      <button
        type="button"
        data-testid="do-select-seeded"
        onClick={() => selectBrand(SEEDED_BRAND_ID)}
      >
        selectSeeded
      </button>
      <button
        type="button"
        data-testid="do-blank-name-update"
        onClick={() => updateBrand(activeBrand.id, { name: '   ' })}
      >
        blankNameUpdate
      </button>
    </div>
  );
}

describe('WorkbenchContext', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('normalizes Malaysian and international WhatsApp numbers consistently', () => {
    expect(normalizeWhatsappDigits('012-345 6789')).toBe('60123456789');
    expect(normalizeWhatsappDigits('+6019 888 7777')).toBe('60198887777');
    expect(normalizeWhatsappDigits('0060 12-345 6789')).toBe('60123456789');
    expect(normalizeWhatsappDigits('0065 9123 4567')).toBe('6591234567');
    expect(normalizeWhatsappDigits('+60 012-345 6789')).toBe('60123456789');
  });

  it('stores normalized 0060, 0065, and +60 01x numbers in Brand Vault folders without corrupting prefixes', () => {
    function NormalizationProbe() {
      const { activeBrand, createBrand, updateBrand } = useWorkbench();
      return (
        <div>
          <span data-testid="norm-wa">{activeBrand.whatsappNumber}</span>
          <button
            type="button"
            data-testid="create-0060"
            onClick={() =>
              createBrand({ name: 'Kedai 0060', whatsappNumber: '0060 12-345 6789' })
            }
          >
            create0060
          </button>
          <button
            type="button"
            data-testid="update-0065"
            onClick={() =>
              updateBrand(activeBrand.id, { whatsappNumber: '0065 9123 4567' })
            }
          >
            update0065
          </button>
          <button
            type="button"
            data-testid="update-trunk0"
            onClick={() =>
              updateBrand(activeBrand.id, { whatsappNumber: '+60 012-345 6789' })
            }
          >
            updateTrunk0
          </button>
        </div>
      );
    }

    render(
      <WorkbenchProvider>
        <NormalizationProbe />
      </WorkbenchProvider>
    );

    fireEvent.click(screen.getByTestId('create-0060'));
    expect(screen.getByTestId('norm-wa')).toHaveTextContent('60123456789');

    fireEvent.click(screen.getByTestId('update-0065'));
    expect(screen.getByTestId('norm-wa')).toHaveTextContent('6591234567');

    fireEvent.click(screen.getByTestId('update-trunk0'));
    expect(screen.getByTestId('norm-wa')).toHaveTextContent('60123456789');
  });

  it('isolates Brand Vault folders, supports deleteBrand for custom folders only, and persists state under adforge_workbench:v1', () => {
    const { unmount } = render(
      <WorkbenchProvider>
        <WorkbenchProbe />
      </WorkbenchProvider>
    );

    expect(screen.getByTestId('active-brand-id')).toHaveTextContent(SEEDED_BRAND_ID);
    expect(screen.getByTestId('brand-count')).toHaveTextContent('1');

    // Cannot delete the pre-seeded brand folder
    fireEvent.click(screen.getByTestId('do-delete-active'));
    expect(screen.getByTestId('brand-count')).toHaveTextContent('1');

    fireEvent.click(screen.getByTestId('do-login'));
    fireEvent.click(screen.getByTestId('do-save-key'));
    expect(screen.getByTestId('logged-in')).toHaveTextContent('true');
    expect(screen.getByTestId('email')).toHaveTextContent('nurul@agency.my');
    expect(screen.getByTestId('byok')).toHaveTextContent('sk-live-test-key-123456');
    expect(screen.getByTestId('screen')).toHaveTextContent('workbench');

    fireEvent.click(screen.getByTestId('do-create-brand'));
    expect(screen.getByTestId('brand-count')).toHaveTextContent('2');
    expect(screen.getByTestId('active-brand-id')).toHaveTextContent('kafe-kopi-harmoni');
    expect(screen.getByTestId('active-brand-wa')).toHaveTextContent('60198887777');

    fireEvent.click(screen.getByTestId('do-update-active'));
    expect(screen.getByTestId('active-brand-wa')).toHaveTextContent('60175554433');
    // Seeded Demo Bisnes Saya must remain untouched
    expect(screen.getByTestId('seeded-wa')).toHaveTextContent('60123456789');
    expect(screen.getByTestId('seeded-tone')).toHaveTextContent('casual');

    const stored = window.localStorage.getItem(WORKBENCH_STORAGE_KEY);
    expect(stored).not.toBeNull();
    unmount();

    render(
      <WorkbenchProvider>
        <WorkbenchProbe />
      </WorkbenchProvider>
    );
    expect(screen.getByTestId('brand-count')).toHaveTextContent('2');
    expect(screen.getByTestId('active-brand-id')).toHaveTextContent('kafe-kopi-harmoni');
    expect(screen.getByTestId('active-brand-wa')).toHaveTextContent('60175554433');
    expect(screen.getByTestId('screen')).toHaveTextContent('workbench');

    fireEvent.click(screen.getByTestId('do-delete-active'));
    expect(screen.getByTestId('brand-count')).toHaveTextContent('1');
    expect(screen.getByTestId('active-brand-id')).toHaveTextContent(SEEDED_BRAND_ID);
  });

  it('recovers gracefully from malformed localStorage payloads', () => {
    window.localStorage.setItem(WORKBENCH_STORAGE_KEY, '{invalid-json');
    render(
      <WorkbenchProvider>
        <WorkbenchProbe />
      </WorkbenchProvider>
    );

    expect(screen.getByTestId('brand-count')).toHaveTextContent('1');
    expect(screen.getByTestId('active-brand-id')).toHaveTextContent(SEEDED_BRAND_ID);
    expect(screen.getByTestId('screen')).toHaveTextContent('onboarding');
  });

  it('rejects string "false" isLoggedIn coercion and invalid brand records on storage recovery', () => {
    window.localStorage.setItem(
      WORKBENCH_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        isLoggedIn: 'false',
        isDemoMode: 'true',
        activeScreen: 'workbench',
        brands: [
          {
            id: 'invalid-empty-logo',
            name: 'Invalid Brand',
            logoDataUrl: '',
            themeColor: '#0EA5E9',
            tone: 'casual',
            whatsappNumber: '60111111111',
            updatedAt: '2026-11-17T00:00:00.000Z',
          },
          {
            id: 'invalid-no-updated-at',
            name: 'Missing Timestamp',
            logoDataUrl: '/assets/brands/demo-brand-logo.png',
            themeColor: '#0EA5E9',
            tone: 'casual',
            whatsappNumber: '60111111111',
          },
        ],
        activeBrandId: 'invalid-empty-logo',
      })
    );

    render(
      <WorkbenchProvider>
        <WorkbenchProbe />
      </WorkbenchProvider>
    );

    expect(screen.getByTestId('logged-in')).toHaveTextContent('false');
    expect(screen.getByTestId('demo')).toHaveTextContent('false');
    expect(screen.getByTestId('screen')).toHaveTextContent('onboarding');
    expect(screen.getByTestId('brand-count')).toHaveTextContent('1');
    expect(screen.getByTestId('active-brand-id')).toHaveTextContent(SEEDED_BRAND_ID);
    expect(screen.getByTestId('active-brand-name')).toHaveTextContent('Demo Bisnes Saya');
  });

  it('preserves existing brand name when updateBrand receives whitespace-only name', () => {
    render(
      <WorkbenchProvider>
        <WorkbenchProbe />
      </WorkbenchProvider>
    );

    fireEvent.click(screen.getByTestId('do-create-brand'));
    expect(screen.getByTestId('active-brand-name')).toHaveTextContent('Kafe Kopi Harmoni');

    fireEvent.click(screen.getByTestId('do-blank-name-update'));
    expect(screen.getByTestId('active-brand-name')).toHaveTextContent('Kafe Kopi Harmoni');
  });

  it('keeps activeScreen on onboarding when saveByokKey receives whitespace-only key without demoMode while logged in', () => {
    render(
      <WorkbenchProvider>
        <WorkbenchProbe />
      </WorkbenchProvider>
    );

    fireEvent.click(screen.getByTestId('do-login'));
    fireEvent.click(screen.getByTestId('do-save-key'));
    expect(screen.getByTestId('screen')).toHaveTextContent('workbench');

    fireEvent.click(screen.getByTestId('do-save-blank-key'));
    expect(screen.getByTestId('byok')).toHaveTextContent('');
    expect(screen.getByTestId('demo')).toHaveTextContent('false');
    expect(screen.getByTestId('screen')).toHaveTextContent('onboarding');
  });

  it('preserves existing phone number when updateBrand receives invalid WhatsApp and sanitizes unsafe localStorage fields', () => {
    window.localStorage.setItem(
      WORKBENCH_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        isLoggedIn: true,
        freelancerEmail: 'pro@studio.my',
        byokKey: 'sk-live-test-key-123456',
        isDemoMode: false,
        activeScreen: 'workbench',
        brands: [
          {
            id: 'unsafe-brand',
            name: 'Bisnes Terkawal',
            logoDataUrl: 'https://evil.example/tracker.png',
            themeColor: 'not-a-hex-color',
            tone: 'professional',
            whatsappNumber: 'not-a-phone',
            updatedAt: '2026-11-17T00:00:00.000Z',
          },
        ],
        activeBrandId: 'unsafe-brand',
      })
    );

    function SanitizeProbe() {
      const { activeBrand, updateBrand } = useWorkbench();
      return (
        <div>
          <span data-testid="san-logo">{activeBrand.logoDataUrl}</span>
          <span data-testid="san-color">{activeBrand.themeColor}</span>
          <span data-testid="san-wa">{activeBrand.whatsappNumber}</span>
          <button
            type="button"
            data-testid="do-invalid-wa"
            onClick={() => updateBrand(activeBrand.id, { whatsappNumber: 'invalid-abc' })}
          >
            invalidWa
          </button>
        </div>
      );
    }

    render(
      <WorkbenchProvider>
        <SanitizeProbe />
      </WorkbenchProvider>
    );

    expect(screen.getByTestId('san-logo')).toHaveTextContent(
      '/assets/brands/demo-brand-logo.png'
    );
    expect(screen.getByTestId('san-color')).toHaveTextContent('#0EA5E9');
    expect(screen.getByTestId('san-wa')).toHaveTextContent('60123456789');

    fireEvent.click(screen.getByTestId('do-invalid-wa'));
    expect(screen.getByTestId('san-wa')).toHaveTextContent('60123456789');
  });

  it('falls back to 60123456789 when createBrand receives invalid, too-short, or leading-0 WhatsApp numbers', () => {
    function CreateInvalidPhoneProbe() {
      const { createBrand } = useWorkbench();
      return (
        <div>
          <button
            type="button"
            data-testid="create-short"
            onClick={() => {
              const b = createBrand({ name: 'Short WA', whatsappNumber: '123' });
              (document.getElementById('out-short') as HTMLElement).textContent = b.whatsappNumber;
            }}
          >
            short
          </button>
          <button
            type="button"
            data-testid="create-lead0"
            onClick={() => {
              const b = createBrand({ name: 'Lead 0 WA', whatsappNumber: '0212345678' });
              (document.getElementById('out-lead0') as HTMLElement).textContent = b.whatsappNumber;
            }}
          >
            lead0
          </button>
          <span id="out-short" data-testid="out-short" />
          <span id="out-lead0" data-testid="out-lead0" />
        </div>
      );
    }

    render(
      <WorkbenchProvider>
        <CreateInvalidPhoneProbe />
      </WorkbenchProvider>
    );

    fireEvent.click(screen.getByTestId('create-short'));
    fireEvent.click(screen.getByTestId('create-lead0'));
    expect(screen.getByTestId('out-short')).toHaveTextContent('60123456789');
    expect(screen.getByTestId('out-lead0')).toHaveTextContent('60123456789');
  });
});
