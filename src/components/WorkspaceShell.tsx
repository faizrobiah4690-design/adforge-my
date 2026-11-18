import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, Cpu, Film, LayoutGrid, Loader2, Music, Sparkles } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useCampaign } from '../state/CampaignContext';
import type { VariationFrameworkId, WorkspaceTabId } from '../types/campaign';
import { BrandVaultScreen } from './BrandVaultScreen';
import { QuickCampaignForm } from './QuickCampaignForm';
import { CarouselTab } from './tabs/CarouselTab';
import { JingleTab } from './tabs/JingleTab';
import { StrategyTab } from './tabs/StrategyTab';
import { VideoTab } from './tabs/VideoTab';

interface TabDef {
  id: WorkspaceTabId;
  labelKey: string;
}

const TAB_DEFS: TabDef[] = [
  { id: 'strategy', labelKey: 'tabs.strategy' },
  { id: 'carousel', labelKey: 'tabs.carousel' },
  { id: 'jingle', labelKey: 'tabs.jingle' },
  { id: 'video', labelKey: 'tabs.video' },
];

const FRAMEWORK_PILLS: Array<{
  slot: 1 | 2 | 3 | 4 | 5;
  id: VariationFrameworkId;
  labelKey: string;
}> = [
  { slot: 1, id: 'pas', labelKey: 'variation.fw1' },
  { slot: 2, id: 'bab', labelKey: 'variation.fw2' },
  { slot: 3, id: 'pov_ugc', labelKey: 'variation.fw3' },
  { slot: 4, id: 'smart_buyer', labelKey: 'variation.fw4' },
  { slot: 5, id: 'fomo_drop', labelKey: 'variation.fw5' },
];

function TabIcon({ tabId }: { tabId: WorkspaceTabId }) {
  switch (tabId) {
    case 'strategy':
      return <Sparkles className="h-4 w-4 shrink-0" />;
    case 'carousel':
      return <LayoutGrid className="h-4 w-4 shrink-0" />;
    case 'jingle':
      return <Music className="h-4 w-4 shrink-0" />;
    case 'video':
      return <Film className="h-4 w-4 shrink-0" />;
  }
}

export function WorkspaceShell() {
  const { locale, t } = useI18n();
  const {
    activeTab,
    setActiveTab,
    isLaunched,
    variationIndex,
    activeFrameworkId,
    productVisionSummary,
    campaignGenStatus,
    campaignGenSource,
    campaignGenError,
    pollinationsCooldownUntil,
    selectVariation,
    generateNewVariation,
  } = useCampaign();

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!pollinationsCooldownUntil || pollinationsCooldownUntil <= Date.now()) {
      return;
    }
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (current >= pollinationsCooldownUntil) {
        window.clearInterval(id);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [pollinationsCooldownUntil]);

  const cooldownSeconds =
    pollinationsCooldownUntil && pollinationsCooldownUntil > nowMs
      ? Math.ceil((pollinationsCooldownUntil - nowMs) / 1000)
      : 0;

  const activeFwPill =
    FRAMEWORK_PILLS.find((fw) => fw.id === activeFrameworkId) ?? FRAMEWORK_PILLS[0];
  const isGenerating = campaignGenStatus === 'generating';

  const statusBadgeKey =
    campaignGenSource === 'gemini-2.5-flash'
      ? 'variation.statusGemini25'
      : campaignGenSource === 'gemini-2.0-flash'
        ? 'variation.statusGemini20'
        : campaignGenSource === 'pollinations-openai-fast'
          ? 'variation.statusBuiltInPollinations'
          : campaignGenSource === 'offline-smart-demo'
            ? 'variation.statusOfflineDemo'
            : 'variation.statusOfflineFallback';

  const isLiveVisionBadge =
    campaignGenSource === 'gemini-2.5-flash' ||
    campaignGenSource === 'gemini-2.0-flash' ||
    campaignGenSource === 'pollinations-openai-fast';

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 space-y-6 min-w-0">
      <BrandVaultScreen />
      <QuickCampaignForm />

      {isLaunched ? (
        <section className="space-y-4 min-w-0">
          <section
            data-testid="variation-toolbar"
            aria-label={t('variation.toolbarTitle')}
            className="rounded-2xl border border-slate-800 bg-[#111827] p-3.5 sm:p-4 space-y-3 min-w-0 max-w-full"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
                <span
                  data-testid="active-variation-label"
                  className="text-xs sm:text-sm font-semibold text-slate-100 whitespace-normal [overflow-wrap:anywhere] leading-snug min-w-0"
                >
                  {t('variation.activeLabel')} #{variationIndex} — {t(activeFwPill.labelKey)}
                </span>

                <span
                  data-testid="campaign-engine-status-badge"
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-medium max-w-full min-w-0 ${
                    isGenerating
                      ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                      : isLiveVisionBadge
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-slate-700 bg-[#0B0F19] text-slate-300'
                  }`}
                >
                  {isGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  ) : (
                    <Cpu className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere] leading-snug">
                    {t(statusBadgeKey)}
                  </span>
                </span>

                {productVisionSummary ? (
                  <span
                    data-testid="product-vision-summary-badge"
                    className="inline-block rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1 text-[11px] text-indigo-200 max-w-full min-w-0 whitespace-normal [overflow-wrap:anywhere] leading-snug"
                  >
                    {t('variation.visionPrefix')} {productVisionSummary}
                  </span>
                ) : null}

                {cooldownSeconds > 0 ? (
                  <span
                    data-testid="pollinations-cooldown-badge"
                    className="inline-flex items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200 max-w-full min-w-0 whitespace-normal [overflow-wrap:anywhere] leading-snug"
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>
                      {locale === 'ms'
                        ? `Had AI Terbina Dalam: ${cooldownSeconds}s`
                        : `Built-In AI Cooldown: ${cooldownSeconds}s`}
                    </span>
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                data-testid="generate-new-variation-btn"
                disabled={isGenerating}
                onClick={() => {
                  void generateNewVariation();
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-500/50 bg-sky-500/15 px-3 py-1.5 text-xs sm:text-sm font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-55 disabled:cursor-not-allowed transition cursor-pointer max-w-full min-w-0 whitespace-normal [overflow-wrap:anywhere] leading-snug"
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                ) : null}
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {isGenerating ? t('variation.generatingBtn') : t('variation.newBtn')}
                </span>
              </button>
            </div>

            {campaignGenError ? (
              <div
                role="alert"
                data-testid="byok-fallback-alert"
                className="flex items-start gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 min-w-0"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span className="min-w-0 break-words [overflow-wrap:anywhere] leading-snug">
                  {campaignGenError}
                </span>
              </div>
            ) : null}

            {isGenerating ? (
              <p className="text-[11px] text-sky-300 whitespace-normal [overflow-wrap:anywhere] leading-snug">
                {t('variation.generatingBanner')}
              </p>
            ) : null}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 min-w-0">
              {FRAMEWORK_PILLS.map((fw) => {
                const isSelected = activeFrameworkId === fw.id;
                return (
                  <button
                    key={fw.id}
                    type="button"
                    data-testid={`variation-pill-${fw.slot}`}
                    aria-pressed={isSelected}
                    disabled={isGenerating}
                    onClick={() => {
                      void selectVariation(fw.slot);
                    }}
                    className={`rounded-xl border px-2.5 py-1.5 text-[11px] sm:text-xs font-medium text-left transition cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed min-w-0 max-w-full whitespace-normal [overflow-wrap:anywhere] leading-snug ${
                      isSelected
                        ? 'border-sky-500 bg-sky-500/15 text-sky-100 ring-1 ring-sky-500/40'
                        : 'border-slate-800 bg-[#0B0F19] text-slate-300 hover:border-slate-700 hover:text-slate-100'
                    }`}
                  >
                    {t(fw.labelKey)}
                  </button>
                );
              })}
            </div>
          </section>

          <div
            data-testid="workspace-tabs"
            role="tablist"
            aria-label={t('app.navWorkbench')}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0"
          >
            {TAB_DEFS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  data-testid={`tab-${tab.id}`}
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl border px-2 sm:px-2.5 md:px-3 py-2 text-[11px] sm:text-xs md:text-sm font-semibold transition cursor-pointer min-w-0 ${
                    isActive
                      ? 'border-sky-500 bg-sky-500/15 text-sky-200 shadow-sm'
                      : 'border-slate-800 bg-[#111827] text-slate-300 hover:border-slate-700 hover:text-slate-100'
                  }`}
                >
                  <TabIcon tabId={tab.id} />
                  <span className="min-w-0 leading-tight text-center [overflow-wrap:anywhere]">{t(tab.labelKey)}</span>
                </button>
              );
            })}
          </div>

          <div className="min-w-0">
            {activeTab === 'strategy' ? <StrategyTab /> : null}
            {activeTab === 'carousel' ? <CarouselTab /> : null}
            {activeTab === 'jingle' ? <JingleTab /> : null}
            {activeTab === 'video' ? <VideoTab /> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
