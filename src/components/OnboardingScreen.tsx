import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  LogOut,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { BYOK_GUIDE_VIDEO_URL } from '../data/seedVault';
import { useI18n } from '../i18n/I18nContext';
import { useWorkbench } from '../state/WorkbenchContext';
import type { UiLanguage } from '../types/campaign';
import { isValidGeminiKeyFormat } from '../utils/copyGenerator';

const LOCAL_COPY: Record<
  UiLanguage,
  {
    loginRequired: string;
    emptyKeyError: string;
    invalidKeyError: string;
    showKey: string;
    hideKey: string;
    emailPlaceholder: string;
    updateEmailLabel: string;
    byokSavedBadge: string;
    playGuide: string;
    pauseGuide: string;
    steps: [string, string, string];
    settingsTitle: string;
    settingsSubtitle: string;
    signInFirstHint: string;
  }
> = {
  ms: {
    loginRequired: 'Sila log masuk dengan Google di Langkah 1 terlebih dahulu sebelum meneruskan.',
    emptyKeyError: 'Sila masukkan kunci API Google AI Studio atau pilih Mod Demo.',
    invalidKeyError:
      'Format kunci API tidak sah. Kunci Google AI Studio mesti sekurang-kurangnya 12 aksara.',
    showKey: 'Tunjuk kunci',
    hideKey: 'Sembunyi kunci',
    emailPlaceholder: 'freelancer@studio.my',
    updateEmailLabel: 'E-mel sesi Google',
    byokSavedBadge: 'Kunci BYOK Disimpan',
    playGuide: 'Mainkan Panduan',
    pauseGuide: 'Jeda Panduan',
    steps: [
      '1. Buka Google AI Studio',
      '2. Klik Create API Key',
      '3. Tampal kunci atau guna Mod Demo',
    ],
    settingsTitle: 'Tetapan Akses & Kunci BYOK',
    settingsSubtitle:
      'Kemas kini kunci Google AI Studio atau tukar ke Mod Demo tanpa menetapkan semula kempen aktif anda.',
    signInFirstHint: 'Log masuk dengan Google terlebih dahulu untuk mengaktifkan akses BYOK atau Mod Demo.',
  },
  en: {
    loginRequired: 'Please sign in with Google in Step 1 first before continuing.',
    emptyKeyError: 'Please enter a Google AI Studio API key or choose Demo Mode.',
    invalidKeyError:
      'Invalid API key format. Google AI Studio keys must be at least 12 characters.',
    showKey: 'Show key',
    hideKey: 'Hide key',
    emailPlaceholder: 'freelancer@studio.my',
    updateEmailLabel: 'Google session email',
    byokSavedBadge: 'BYOK Key Saved',
    playGuide: 'Play Guide',
    pauseGuide: 'Pause Guide',
    steps: [
      '1. Open Google AI Studio',
      '2. Click Create API Key',
      '3. Paste your key or use Demo Mode',
    ],
    settingsTitle: 'Access & BYOK Key Settings',
    settingsSubtitle:
      'Update your Google AI Studio key or switch to Demo Mode without resetting your active campaign.',
    signInFirstHint: 'Sign in with Google first to enable BYOK save or Demo Mode.',
  },
};

type OnboardingErrorCode = 'login_required' | 'empty_key' | 'invalid_key';

export function OnboardingScreen() {
  const { locale, t } = useI18n();
  const {
    isLoggedIn,
    freelancerEmail,
    byokKey,
    isDemoMode,
    loginWithGoogle,
    logout,
    saveByokKey,
    setActiveScreen,
  } = useWorkbench();

  const copy = LOCAL_COPY[locale];
  const [keyDraft, setKeyDraft] = useState<string>(byokKey);
  const [emailDraft, setEmailDraft] = useState<string>(freelancerEmail ?? 'freelancer@studio.my');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [byokErrorCode, setByokErrorCode] = useState<OnboardingErrorCode | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const byokErrorMessage =
    byokErrorCode === 'login_required'
      ? copy.loginRequired
      : byokErrorCode === 'empty_key'
        ? copy.emptyKeyError
        : byokErrorCode === 'invalid_key'
          ? copy.invalidKeyError
          : null;

  useEffect(() => {
    setKeyDraft(byokKey);
  }, [byokKey]);

  useEffect(() => {
    if (freelancerEmail) {
      setEmailDraft(freelancerEmail);
    }
  }, [freelancerEmail]);

  const hasByokKey = Boolean(byokKey.trim());
  const isSettingsModal = isLoggedIn && (hasByokKey || isDemoMode);

  const closeSettingsModal = useCallback(() => {
    const target = previousFocusRef.current;
    previousFocusRef.current = null;
    setActiveScreen('workbench');
    if (target) {
      window.setTimeout(() => {
        if (target.isConnected && !target.hasAttribute('disabled')) {
          target.focus();
        }
      }, 0);
    }
  }, [setActiveScreen]);

  useEffect(() => {
    if (!isSettingsModal) {
      return;
    }
    const opener = document.activeElement;
    if (opener instanceof HTMLElement && !modalRef.current?.contains(opener)) {
      previousFocusRef.current = opener;
    }
    closeBtnRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSettingsModal();
        return;
      }
      if (event.key === 'Tab' && modalRef.current) {
        const hasLayout = modalRef.current.getBoundingClientRect().width > 0;
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), video[controls], [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => {
          if (el.hasAttribute('hidden')) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          return hasLayout ? el.offsetParent !== null || el === document.activeElement : true;
        });

        if (focusable.length === 0) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (!active || !modalRef.current.contains(active)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsModal, closeSettingsModal]);

  const handleGoogleLogin = () => {
    setByokErrorCode(null);
    loginWithGoogle(emailDraft.trim() || 'freelancer@studio.my');
  };

  const handleSaveKey = (event: FormEvent) => {
    event.preventDefault();
    if (!isLoggedIn) {
      setByokErrorCode('login_required');
      return;
    }

    const trimmed = keyDraft.trim();
    if (!trimmed) {
      setByokErrorCode('empty_key');
      return;
    }

    if (!isValidGeminiKeyFormat(trimmed)) {
      setByokErrorCode('invalid_key');
      return;
    }

    setByokErrorCode(null);
    saveByokKey(trimmed, false);
    if (isSettingsModal) {
      closeSettingsModal();
    } else {
      setActiveScreen('workbench');
    }
  };

  const handleDemoEnter = () => {
    if (!isLoggedIn) {
      setByokErrorCode('login_required');
      return;
    }
    const sanitizedKey = isValidGeminiKeyFormat(keyDraft) ? keyDraft.trim() : '';
    setByokErrorCode(null);
    setKeyDraft(sanitizedKey);
    saveByokKey(sanitizedKey, true);
    if (isSettingsModal) {
      closeSettingsModal();
    } else {
      setActiveScreen('workbench');
    }
  };

  const handleToggleGuideVideo = async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    try {
      if (video.paused) {
        await video.play();
        setIsVideoPlaying(true);
      } else {
        video.pause();
        setIsVideoPlaying(false);
      }
    } catch {
      setIsVideoPlaying(!video.paused);
    }
  };

  const cardBody = (
    <div className="rounded-2xl border border-slate-800 bg-[#111827] p-5 sm:p-8 shadow-xl min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-300 max-w-full">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span className="break-words whitespace-normal leading-tight">{t('onboarding.badge')}</span>
          </span>
          {isDemoMode ? (
            <span
              data-testid="onboarding-demo-badge"
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300"
            >
              {t('app.demoBadge')}
            </span>
          ) : null}
          {!isDemoMode && hasByokKey ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              {copy.byokSavedBadge}
            </span>
          ) : null}
        </div>

        {isSettingsModal ? (
          <button
            ref={closeBtnRef}
            type="button"
            data-testid="api-settings-close"
            onClick={closeSettingsModal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition cursor-pointer shrink-0"
          >
            <X className="h-3.5 w-3.5 shrink-0" />
            {t('common.close')}
          </button>
        ) : null}
      </div>

      <h1
        id={isSettingsModal ? 'api-settings-modal-title' : undefined}
        className="text-xl sm:text-3xl font-bold tracking-tight text-slate-100 break-words"
      >
        {isSettingsModal ? copy.settingsTitle : t('onboarding.title')}
      </h1>
      <p className="mt-2 text-sm sm:text-base text-slate-400 max-w-3xl break-words">
        {isSettingsModal ? copy.settingsSubtitle : t('onboarding.subtitle')}
      </p>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 min-w-0">
        <div className="space-y-5 min-w-0">
          <div className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 space-y-3 min-w-0">
            <h2 className="text-sm font-semibold text-slate-200">
              {t('onboarding.step1Title')}
            </h2>
            {isLoggedIn ? (
              <div className="space-y-2 min-w-0">
                <div
                  data-testid="onboarding-session-badge"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 min-w-0"
                >
                  <span className="min-w-0 break-all">
                    {t('onboarding.loggedInAs')}: <strong>{freelancerEmail || 'freelancer@studio.my'}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      previousFocusRef.current = null;
                      logout();
                    }}
                    className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-[#0B0F19]/60 px-2 py-0.5 text-[11px] font-medium text-emerald-200 hover:bg-[#0B0F19] transition cursor-pointer shrink-0"
                  >
                    <LogOut className="h-3 w-3 shrink-0" />
                    {t('app.logout')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 min-w-0">
                <div className="min-w-0">
                  <label
                    htmlFor="freelancer-email-input"
                    className="block text-[11px] font-medium text-slate-400 mb-1"
                  >
                    {copy.updateEmailLabel}
                  </label>
                  <input
                    id="freelancer-email-input"
                    type="email"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    placeholder={copy.emailPlaceholder}
                    className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  data-testid="google-login-btn"
                  onClick={handleGoogleLogin}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-white transition cursor-pointer"
                >
                  <LogIn className="h-4 w-4 shrink-0" />
                  {t('onboarding.googleBtn')}
                </button>
              </div>
            )}
          </div>

          <form
            onSubmit={handleSaveKey}
            noValidate
            className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 space-y-3 min-w-0"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200 min-w-0">
              <KeyRound className="h-4 w-4 text-sky-400 shrink-0" />
              <h2 className="break-words">{t('onboarding.step2Title')}</h2>
            </div>

            {!isLoggedIn ? (
              <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 break-words">
                {copy.signInFirstHint}
              </p>
            ) : null}

            <div className="min-w-0">
              <label
                htmlFor="byok-input"
                className="block text-xs font-medium text-slate-400 mb-1.5"
              >
                {t('onboarding.byokLabel')}
              </label>
              <div className="flex flex-wrap sm:flex-nowrap items-stretch gap-2 min-w-0">
                <input
                  id="byok-input"
                  data-testid="byok-input"
                  type={showKey ? 'text' : 'password'}
                  value={keyDraft}
                  onChange={(e) => {
                    setKeyDraft(e.target.value);
                    if (byokErrorCode) {
                      setByokErrorCode(null);
                    }
                  }}
                  placeholder={t('onboarding.byokPlaceholder')}
                  className="flex-1 min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  data-testid="onboarding-byok-visibility"
                  aria-label={showKey ? copy.hideKey : copy.showKey}
                  aria-pressed={showKey}
                  onClick={() => setShowKey((prev) => !prev)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-[#111827] px-2.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition cursor-pointer shrink-0"
                >
                  {showKey ? (
                    <EyeOff className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="hidden sm:inline whitespace-nowrap">{showKey ? copy.hideKey : copy.showKey}</span>
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500 break-words">{t('onboarding.byokHint')}</p>
            </div>

            {byokErrorMessage ? (
              <p
                role="alert"
                data-testid="onboarding-byok-error"
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 break-words"
              >
                {byokErrorMessage}
              </p>
            ) : null}

            <div className="flex flex-col sm:flex-row lg:flex-col flex-wrap gap-2.5 pt-1 min-w-0">
              <button
                type="submit"
                data-testid="byok-save-btn"
                disabled={!isLoggedIn}
                className="inline-flex w-full sm:flex-1 lg:w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 text-center leading-snug whitespace-normal hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
              >
                {t('onboarding.saveKeyBtn')}
              </button>
              <button
                type="button"
                data-testid="byok-demo-btn"
                disabled={!isLoggedIn}
                onClick={handleDemoEnter}
                className="inline-flex w-full sm:flex-1 lg:w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm font-medium text-slate-200 text-center leading-snug whitespace-normal hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
                <span>{t('onboarding.demoBtn')}</span>
              </button>
            </div>
          </form>

          {isLoggedIn && (hasByokKey || isDemoMode) ? (
            <button
              type="button"
              data-testid="continue-workbench-btn"
              onClick={closeSettingsModal}
              className="inline-flex w-full items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-300 hover:bg-sky-500/25 transition cursor-pointer"
            >
              {t('onboarding.continueBtn')}
            </button>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 flex flex-col justify-between gap-3 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <PlayCircle className="h-4 w-4 text-sky-400 shrink-0" />
                <h2 className="break-words">{t('onboarding.videoTitle')}</h2>
              </div>
              <p className="mt-1 text-xs text-slate-400 break-words">{t('onboarding.videoSubtitle')}</p>
            </div>

            <button
              type="button"
              data-testid="onboarding-video-guide-play"
              onClick={() => {
                void handleToggleGuideVideo();
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-[#111827] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition cursor-pointer max-w-full whitespace-normal text-center leading-tight"
            >
              {isVideoPlaying ? (
                <PauseCircle className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              )}
              {isVideoPlaying ? copy.pauseGuide : copy.playGuide}
            </button>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-800 bg-black w-full min-w-0">
            <video
              ref={videoRef}
              data-testid="byok-video-guide"
              src={BYOK_GUIDE_VIDEO_URL}
              controls
              tabIndex={0}
              preload="auto"
              playsInline
              onPlay={() => setIsVideoPlaying(true)}
              onPause={() => setIsVideoPlaying(false)}
              onEnded={() => setIsVideoPlaying(false)}
              className="block w-full max-w-full aspect-video object-contain bg-black"
            />
          </div>

          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2 min-w-0">
            {copy.steps.map((step) => (
              <li
                key={step}
                className="rounded-lg border border-slate-800 bg-[#111827] px-2.5 py-2 text-[11px] text-slate-300 break-words min-w-0"
              >
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );

  if (isSettingsModal) {
    return (
      <section data-testid="onboarding-screen" className="min-w-0">
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6">
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="api-settings-modal-title"
            data-testid="api-settings-modal"
            className="w-full max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-2xl min-w-0"
          >
            {cardBody}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="onboarding-screen"
      className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 min-w-0"
    >
      {cardBody}
    </section>
  );
}
