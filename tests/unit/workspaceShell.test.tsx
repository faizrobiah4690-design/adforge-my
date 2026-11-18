import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';

describe('App & WorkspaceShell integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('transitions from onboarding to workbench with 2x2 mobile tab grid and preserves offer edits on BM/EN toggle', () => {
    render(<App />);

    expect(screen.getByTestId('onboarding-screen')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('AdForge MY');
    expect(screen.getByRole('banner')).toHaveTextContent('Tempat Menempa Iklan Digital Malaysia');
    expect(screen.getByTestId('byok-video-guide')).toHaveAttribute(
      'src',
      '/assets/guide/byok-guide.webm'
    );
    expect(screen.getByTestId('nav-workbench')).toBeDisabled();
    fireEvent.click(screen.getByTestId('nav-workbench'));
    expect(screen.getByTestId('onboarding-screen')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('google-login-btn'));
    fireEvent.click(screen.getByTestId('byok-demo-btn'));

    expect(screen.getByTestId('nav-workbench')).toBeEnabled();
    expect(screen.getByTestId('brand-vault-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-tabs')).not.toBeInTheDocument();

    const offerInput = screen.getByTestId('offer-input') as HTMLTextAreaElement;
    fireEvent.change(offerInput, { target: { value: 'Tawaran Ujian Khas' } });
    fireEvent.click(screen.getByTestId('launch-campaign-btn'));

    const tabsContainer = screen.getByTestId('workspace-tabs');
    expect(tabsContainer).toHaveClass('grid-cols-2');
    expect(tabsContainer).toHaveClass('sm:grid-cols-4');

    expect(screen.getByTestId('lang-ms')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('lang-en')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByTestId('lang-en'));
    expect(screen.getByTestId('lang-ms')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('lang-en')).toHaveAttribute('aria-pressed', 'true');
    expect((screen.getByTestId('offer-input') as HTMLTextAreaElement).value).toBe(
      'Tawaran Ujian Khas'
    );
    expect(screen.getByRole('banner')).toHaveTextContent('AdForge MY');
    expect(screen.getByRole('banner')).toHaveTextContent('Tempat Menempa Iklan Digital Malaysia');
    expect(screen.getByTestId('launch-campaign-btn')).toHaveTextContent('Build Campaign');
  }, 15_000);

  it('blocks workbench recovery when logged in without BYOK key or Demo Mode', () => {
    window.localStorage.setItem(
      'adforge_workbench:v1',
      JSON.stringify({
        version: 1,
        isLoggedIn: true,
        freelancerEmail: 'freelancer@studio.my',
        byokKey: '   ',
        isDemoMode: false,
        activeScreen: 'workbench',
        brands: [],
        activeBrandId: 'demo-bisnes-saya',
      })
    );

    render(<App />);
    expect(screen.getByTestId('onboarding-screen')).toBeVisible();
    expect(screen.queryByTestId('api-settings-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('continue-workbench-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('api-settings-close')).not.toBeInTheDocument();
    expect(screen.getByTestId('nav-workbench')).toBeDisabled();
    expect(screen.queryByTestId('brand-vault-screen')).not.toBeInTheDocument();
  }, 15_000);

  it('keeps WorkspaceShell mounted behind api-settings-modal, preserving Tab 2 activeSlideIndex and safezone-overlay', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('google-login-btn'));
    fireEvent.click(screen.getByTestId('byok-demo-btn'));
    fireEvent.click(screen.getByTestId('launch-campaign-btn'));

    // Switch to Tab 2, select Slide 3, and turn Safe-Zone overlay ON
    fireEvent.click(screen.getByTestId('tab-carousel'));
    fireEvent.click(screen.getByTestId('carousel-slide-3'));
    expect(screen.getByTestId('carousel-slide-3')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('safezone-overlay-toggle'));
    expect(screen.getByTestId('safezone-overlay')).toBeInTheDocument();

    // Open and close API settings modal via nav-onboarding -> api-settings-close
    fireEvent.click(screen.getByTestId('nav-onboarding'));
    expect(screen.getByTestId('api-settings-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('api-settings-close'));
    expect(screen.queryByTestId('api-settings-modal')).not.toBeInTheDocument();

    // Tab 2 local UI state (Slide 3 + Safe-Zone overlay) must remain preserved
    expect(screen.getByTestId('carousel-slide-3')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('safezone-overlay')).toBeInTheDocument();
  }, 15_000);

  it('keeps single onboarding-demo-badge, marks header & main inert when api-settings-modal opens, focuses close button, and signs out cleanly', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('google-login-btn'));
    fireEvent.click(screen.getByTestId('byok-demo-btn'));

    // While in workbench, BrandVaultScreen carries onboarding-demo-badge
    expect(screen.getAllByTestId('onboarding-demo-badge')).toHaveLength(1);

    // Open API settings modal
    fireEvent.click(screen.getByTestId('nav-onboarding'));
    const modal = screen.getByTestId('api-settings-modal');
    expect(modal).toBeInTheDocument();

    // Only 1 onboarding-demo-badge exists in DOM (inside modal), while BrandVault badge switches to vault-demo-badge
    const onboardingBadges = screen.getAllByTestId('onboarding-demo-badge');
    expect(onboardingBadges).toHaveLength(1);
    expect(modal).toContainElement(onboardingBadges[0]);
    expect(screen.getByTestId('vault-demo-badge')).toBeInTheDocument();

    // Background <header> and <main> wrapper are marked inert and aria-hidden="true"
    const headerEl = document.querySelector('header');
    const mainEl = document.querySelector('main');
    expect(headerEl).toHaveAttribute('inert');
    expect(headerEl).toHaveAttribute('aria-hidden', 'true');
    expect(mainEl?.parentElement).toHaveAttribute('inert');
    expect(mainEl?.parentElement).toHaveAttribute('aria-hidden', 'true');

    // Initial focus moves to api-settings-close inside modal
    expect(document.activeElement).toBe(screen.getByTestId('api-settings-close'));

    // Sign out from api-settings-modal -> re-gates WorkspaceShell and disables nav-workbench
    fireEvent.click(screen.getByRole('button', { name: /Log Keluar|Sign Out/i }));
    expect(screen.queryByTestId('api-settings-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('brand-vault-screen')).not.toBeInTheDocument();
    expect(screen.getByTestId('google-login-btn')).toBeInTheDocument();
    expect(screen.getByTestId('nav-workbench')).toBeDisabled();
  }, 15_000);

  it('wraps Shift+Tab focus to byok-video-guide inside api-settings-modal and restores focus to nav-onboarding on Escape', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('google-login-btn'));
    fireEvent.click(screen.getByTestId('byok-demo-btn'));

    const navOnboardingBtn = screen.getByTestId('nav-onboarding');
    navOnboardingBtn.focus();
    fireEvent.click(navOnboardingBtn);

    const modal = screen.getByTestId('api-settings-modal');
    const closeBtn = screen.getByTestId('api-settings-close');
    const videoGuide = screen.getByTestId('byok-video-guide');
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab from first focusable element wraps to last focusable element (byok-video-guide)
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(videoGuide);
    expect(modal).toContainElement(document.activeElement as HTMLElement);

    // Tab from last focusable element wraps back to first (api-settings-close)
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(closeBtn);

    // Escape closes modal and restores focus to nav-onboarding
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('api-settings-modal')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).toBe(navOnboardingBtn);
    });
  }, 15_000);

  it('supports live Demo <-> BYOK upgrade and downgrade via api-settings-modal without resetting campaign state, clearing errors on close', async () => {
    render(<App />);

    // 1. Onboard in Demo Mode and launch campaign with custom offer & FB headline edit
    fireEvent.click(screen.getByTestId('google-login-btn'));
    fireEvent.click(screen.getByTestId('byok-demo-btn'));

    fireEvent.change(screen.getByTestId('offer-input'), {
      target: { value: 'Tawaran Kekal Semasa Naik Taraf' },
    });
    fireEvent.click(screen.getByTestId('launch-campaign-btn'));

    const fbHeadlineInput = screen
      .getByTestId('channel-facebook')
      .querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(fbHeadlineInput, { target: { value: 'Tajuk FB Kekal Modal' } });

    expect(screen.queryByRole('button', { name: /Gemini/i })).toBeNull();

    // 2. Open api-settings-modal, trigger invalid key error, close modal, reopen -> error is cleared
    fireEvent.click(screen.getByTestId('nav-onboarding'));
    expect(screen.getByTestId('api-settings-modal')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('byok-input'), { target: { value: 'bad-key' } });
    fireEvent.click(screen.getByTestId('byok-save-btn'));
    expect(screen.getByTestId('onboarding-byok-error')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('api-settings-close'));
    expect(screen.queryByTestId('api-settings-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('nav-onboarding'));
    expect(screen.queryByTestId('onboarding-byok-error')).toBeNull();

    // 3. Upgrade Demo -> BYOK inside api-settings-modal -> closes modal, preserves campaign & mounts Gemini button
    fireEvent.change(screen.getByTestId('byok-input'), {
      target: { value: 'sk-live-test-key-123456' },
    });
    fireEvent.click(screen.getByTestId('byok-save-btn'));

    expect(screen.queryByTestId('api-settings-modal')).not.toBeInTheDocument();
    expect((screen.getByTestId('offer-input') as HTMLTextAreaElement).value).toBe(
      'Tawaran Kekal Semasa Naik Taraf'
    );
    expect(
      (
        screen
          .getByTestId('channel-facebook')
          .querySelector('input[type="text"]') as HTMLInputElement
      ).value
    ).toBe('Tajuk FB Kekal Modal');
    expect(screen.getByRole('button', { name: /Gemini/i })).toBeEnabled();

    // 4. Downgrade BYOK -> Demo inside api-settings-modal -> closes modal, unmounts Gemini button, preserves campaign
    fireEvent.click(screen.getByTestId('nav-onboarding'));
    fireEvent.click(screen.getByTestId('byok-demo-btn'));

    expect(screen.queryByTestId('api-settings-modal')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gemini/i })).toBeNull();
    expect((screen.getByTestId('offer-input') as HTMLTextAreaElement).value).toBe(
      'Tawaran Kekal Semasa Naik Taraf'
    );
    expect(
      (
        screen
          .getByTestId('channel-facebook')
          .querySelector('input[type="text"]') as HTMLInputElement
      ).value
    ).toBe('Tajuk FB Kekal Modal');
  }, 15_000);
});
