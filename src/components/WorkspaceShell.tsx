import { Film, LayoutGrid, Music, Sparkles } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useCampaign } from '../state/CampaignContext';
import type { WorkspaceTabId } from '../types/campaign';
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
  const { t } = useI18n();
  const { activeTab, setActiveTab, isLaunched } = useCampaign();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 space-y-6 min-w-0">
      <BrandVaultScreen />
      <QuickCampaignForm />

      {isLaunched ? (
        <section className="space-y-4 min-w-0">
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
                  <span className="leading-tight text-center break-words">{t(tab.labelKey)}</span>
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
