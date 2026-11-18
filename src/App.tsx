import { Briefcase, Languages } from 'lucide-react';
import { OnboardingScreen } from './components/OnboardingScreen';
import { WorkspaceShell } from './components/WorkspaceShell';
import { I18nProvider, useI18n } from './i18n/I18nContext';
import { CampaignProvider } from './state/CampaignContext';
import { WorkbenchProvider, useWorkbench } from './state/WorkbenchContext';

function WorkspaceHeader() {
  const { locale, setLocale, t } = useI18n();
  const { activeScreen, setActiveScreen, activeBrand, isLoggedIn, byokKey, isDemoMode } =
    useWorkbench();
  const canEnterWorkbench = isLoggedIn && (Boolean(byokKey.trim()) || isDemoMode);
  const isModalOverlayOpen = canEnterWorkbench && activeScreen === 'onboarding';

  return (
    <header
      inert={isModalOverlayOpen}
      aria-hidden={isModalOverlayOpen || undefined}
      className="sticky top-0 z-30 border-b border-slate-800 bg-[#0B0F19]/95 backdrop-blur min-w-0"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 shrink-0">
            <Briefcase className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-sm sm:text-base font-bold text-slate-100 break-words">
                {t('app.title')}
              </span>
              <span
                data-testid="workbench-badge"
                className="rounded-full border border-slate-700 bg-[#111827] px-2 py-0.5 text-[10px] font-medium text-slate-300 break-words whitespace-normal leading-tight max-w-full"
              >
                {t('app.workbenchBadge')}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 break-words leading-snug">{t('app.subtitle')}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span
            data-testid="header-active-brand"
            className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#111827] px-2.5 py-1 text-xs text-slate-300"
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: activeBrand.themeColor }}
            />
            <span className="max-w-[180px] whitespace-normal break-words [overflow-wrap:anywhere] leading-tight">
              {activeBrand.name}
            </span>
          </span>

          <div className="inline-flex rounded-lg border border-slate-800 bg-[#111827] p-0.5">
            <button
              type="button"
              data-testid="nav-onboarding"
              onClick={() => setActiveScreen('onboarding')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                activeScreen === 'onboarding' || !canEnterWorkbench
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {t('app.navOnboarding')}
            </button>
            <button
              type="button"
              data-testid="nav-workbench"
              disabled={!canEnterWorkbench}
              aria-disabled={!canEnterWorkbench}
              onClick={() => {
                if (canEnterWorkbench) {
                  setActiveScreen('workbench');
                }
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                activeScreen === 'workbench' && canEnterWorkbench
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {t('app.navWorkbench')}
            </button>
          </div>

          <div
            data-testid="language-toggle"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-[#111827] p-0.5"
            aria-label={t('app.langLabel')}
          >
            <Languages className="ml-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
            <button
              type="button"
              data-testid="lang-ms"
              aria-pressed={locale === 'ms'}
              onClick={() => setLocale('ms')}
              className={`rounded-md px-2 py-1 text-xs font-semibold transition cursor-pointer ${
                locale === 'ms'
                  ? 'bg-slate-100 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {t('app.langMs')}
            </button>
            <button
              type="button"
              data-testid="lang-en"
              aria-pressed={locale === 'en'}
              onClick={() => setLocale('en')}
              className={`rounded-md px-2 py-1 text-xs font-semibold transition cursor-pointer ${
                locale === 'en'
                  ? 'bg-slate-100 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {t('app.langEn')}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function AppRouter() {
  const { activeScreen, isLoggedIn, byokKey, isDemoMode } = useWorkbench();
  const canEnterWorkbench = isLoggedIn && (Boolean(byokKey.trim()) || isDemoMode);

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 min-w-0 max-w-full overflow-x-hidden">
      <WorkspaceHeader />
      {canEnterWorkbench ? (
        <>
          <div
            inert={activeScreen === 'onboarding'}
            aria-hidden={activeScreen === 'onboarding' || undefined}
          >
            <WorkspaceShell />
          </div>
          {activeScreen === 'onboarding' ? <OnboardingScreen /> : null}
        </>
      ) : (
        <OnboardingScreen />
      )}
    </div>
  );
}

export function App() {
  return (
    <I18nProvider>
      <WorkbenchProvider>
        <CampaignProvider>
          <AppRouter />
        </CampaignProvider>
      </WorkbenchProvider>
    </I18nProvider>
  );
}

export default App;
