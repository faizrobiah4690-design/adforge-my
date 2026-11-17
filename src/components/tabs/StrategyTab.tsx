import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useCampaign } from '../../state/CampaignContext';
import { useWorkbench } from '../../state/WorkbenchContext';
import type {
  AngleId,
  ChannelCopy,
  ChannelId,
  UiLanguage,
} from '../../types/campaign';
import {
  checkCopyCompliance,
  RISKY_COMPLIANCE_SAMPLE,
  rewriteSafeCopy,
} from '../../utils/compliance';
import {
  buildCustomerPsychology,
  generateCampaignCopyMap,
  isValidGeminiKeyFormat,
} from '../../utils/copyGenerator';
import { calculateCpaMetrics, formatRm } from '../../utils/cpa';
import {
  ANGLE_WHATSAPP_TAGS,
  rewriteWhatsappUrlPhone,
} from '../../utils/whatsapp';

const ANGLES: AngleId[] = ['confidence', 'hygiene', 'payday'];

const EXTRA_LABELS: Record<
  UiLanguage,
  {
    toneCasualBadge: string;
    toneProBadge: string;
    enhanceByokBtn: string;
    enhancingByokBtn: string;
    enhanceByokReady: string;
    enhanceByokFallback: string;
    applySafeRewriteBtn: string;
    resetComplianceBtn: string;
    metaCategory: string;
    healthcareCategory: string;
    ruleLabel: string;
    suggestionLabel: string;
    matchedLabel: string;
    rsaOverLimit: string;
    zeroCloseRateNote: string;
    previewTag: string;
  }
> = {
  ms: {
    toneCasualBadge: 'Nada: Santai',
    toneProBadge: 'Nada: Profesional',
    enhanceByokBtn: 'Tingkatkan dengan Gemini (BYOK)',
    enhancingByokBtn: 'Menjana...',
    enhanceByokReady: 'Salinan dipertingkat oleh Gemini',
    enhanceByokFallback: 'Menggunakan templat selamat terbina',
    applySafeRewriteBtn: 'Guna Ayat Selamat',
    resetComplianceBtn: 'Muat dari Teks Facebook',
    metaCategory: 'Meta Personal Attributes',
    healthcareCategory: 'Norma Kesihatan MY / KKLIU',
    ruleLabel: 'Peraturan',
    suggestionLabel: 'Cadangan',
    matchedLabel: 'Frasa dikesan',
    rsaOverLimit: 'Melebihi had',
    zeroCloseRateNote: 'Kadar tutup 0% — masukkan > 0% untuk unjuran CPA sebenar.',
    previewTag: 'Pratonton',
  },
  en: {
    toneCasualBadge: 'Tone: Casual',
    toneProBadge: 'Tone: Professional',
    enhanceByokBtn: 'Enhance with Gemini (BYOK)',
    enhancingByokBtn: 'Enhancing...',
    enhanceByokReady: 'Copy enhanced with Gemini',
    enhanceByokFallback: 'Using built-in compliant template',
    applySafeRewriteBtn: 'Apply Safe Rewrite',
    resetComplianceBtn: 'Load from Facebook Copy',
    metaCategory: 'Meta Personal Attributes',
    healthcareCategory: 'MY Healthcare / KKLIU Norm',
    ruleLabel: 'Rule',
    suggestionLabel: 'Suggestion',
    matchedLabel: 'Matched',
    rsaOverLimit: 'Over limit',
    zeroCloseRateNote: 'Close rate is 0% — enter > 0% for live projected CPA.',
    previewTag: 'Preview',
  },
};

function syncAngleCopyWhatsapp(
  copy: ChannelCopy,
  nextPhone: string
): ChannelCopy {
  return {
    facebook: {
      ...copy.facebook,
      primaryText: rewriteWhatsappUrlPhone(copy.facebook.primaryText, nextPhone),
      whatsappUrl: rewriteWhatsappUrlPhone(copy.facebook.whatsappUrl, nextPhone),
    },
    instagram: {
      ...copy.instagram,
      caption: rewriteWhatsappUrlPhone(copy.instagram.caption, nextPhone),
      whatsappUrl: rewriteWhatsappUrlPhone(copy.instagram.whatsappUrl, nextPhone),
    },
    tiktok: {
      ...copy.tiktok,
      script: rewriteWhatsappUrlPhone(copy.tiktok.script, nextPhone),
      caption: rewriteWhatsappUrlPhone(copy.tiktok.caption, nextPhone),
      whatsappUrl: rewriteWhatsappUrlPhone(copy.tiktok.whatsappUrl, nextPhone),
    },
    google_rsa: {
      ...copy.google_rsa,
      whatsappUrl: rewriteWhatsappUrlPhone(copy.google_rsa.whatsappUrl, nextPhone),
    },
  };
}

export function StrategyTab() {
  const { locale, t } = useI18n();
  const extra = EXTRA_LABELS[locale];
  const { byokKey, isDemoMode } = useWorkbench();
  const {
    launchedBrand,
    launchedOfferSentence,
    campaignLaunchEpoch,
    selectedAngle,
    setSelectedAngle,
    editedCopyByAngle,
    updateChannelCopy,
    cpaInputs,
    setCpaInputs,
    isEnhancingStrategy,
    strategyEnhanceNoticeByAngle,
    enhanceStrategyAngleWithGemini,
  } = useCampaign();

  const baselineMap = useMemo(
    () => generateCampaignCopyMap(launchedBrand, launchedOfferSentence),
    [launchedBrand, launchedOfferSentence]
  );

  const angleCopy: ChannelCopy = useMemo(() => {
    const raw = editedCopyByAngle[selectedAngle] ?? baselineMap[selectedAngle];
    return syncAngleCopyWhatsapp(raw, launchedBrand.whatsappNumber);
  }, [baselineMap, editedCopyByAngle, selectedAngle, launchedBrand.whatsappNumber]);

  const psychology = useMemo(
    () => buildCustomerPsychology(launchedBrand, launchedOfferSentence),
    [launchedBrand, launchedOfferSentence]
  );

  const cpaEval = useMemo(() => calculateCpaMetrics(cpaInputs), [cpaInputs]);

  const [copiedChannel, setCopiedChannel] = useState<ChannelId | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [complianceText, setComplianceText] = useState<string>(
    () => angleCopy.facebook.primaryText
  );
  const [complianceEditedByUser, setComplianceEditedByUser] = useState<boolean>(false);

  const launchScopeKey = `${campaignLaunchEpoch}::${launchedBrand.id}::${launchedBrand.tone}::${launchedBrand.name}::${launchedBrand.whatsappNumber}`;
  const prevScopeRef = useRef<string>(launchScopeKey);
  const prevAngleRef = useRef<AngleId>(selectedAngle);

  useEffect(() => {
    const scopeChanged = prevScopeRef.current !== launchScopeKey;
    const angleChanged = prevAngleRef.current !== selectedAngle;
    if (scopeChanged || angleChanged) {
      prevScopeRef.current = launchScopeKey;
      prevAngleRef.current = selectedAngle;
      setComplianceEditedByUser(false);
      setComplianceText(angleCopy.facebook.primaryText);
      return;
    }

    if (!complianceEditedByUser) {
      setComplianceText(angleCopy.facebook.primaryText);
    }
  }, [
    launchScopeKey,
    selectedAngle,
    angleCopy.facebook.primaryText,
    complianceEditedByUser,
  ]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const complianceFindings = useMemo(
    () => checkCopyCompliance(complianceText),
    [complianceText]
  );

  const canUseByok = !isDemoMode && isValidGeminiKeyFormat(byokKey);
  const angleTag = ANGLE_WHATSAPP_TAGS[selectedAngle];
  const toneLabel =
    launchedBrand.tone === 'casual' ? extra.toneCasualBadge : extra.toneProBadge;

  async function handleCopyChannel(channel: ChannelId) {
    const waUrl = angleCopy[channel].whatsappUrl;
    let payload = '';

    if (channel === 'facebook') {
      payload = [
        `[Facebook Ads — ${launchedBrand.name} | ${angleTag}]`,
        angleCopy.facebook.primaryText,
        `${t('tab1.headlineLabel')}: ${angleCopy.facebook.headline}`,
        `${t('tab1.descriptionLabel')}: ${angleCopy.facebook.description}`,
        `${t('tab1.whatsappCtaLabel')}: ${waUrl}`,
      ].join('\n');
    } else if (channel === 'instagram') {
      payload = [
        `[Instagram — ${launchedBrand.name} | ${angleTag}]`,
        angleCopy.instagram.caption,
        angleCopy.instagram.hashtags,
        `${t('tab1.whatsappCtaLabel')}: ${waUrl}`,
      ].join('\n');
    } else if (channel === 'tiktok') {
      payload = [
        `[TikTok — ${launchedBrand.name} | ${angleTag}]`,
        `${t('tab1.hookLabel')}: ${angleCopy.tiktok.hook}`,
        `${t('tab1.scriptLabel')}: ${angleCopy.tiktok.script}`,
        `${t('tab1.captionLabel')}: ${angleCopy.tiktok.caption}`,
        `${t('tab1.whatsappCtaLabel')}: ${waUrl}`,
      ].join('\n');
    } else {
      payload = [
        `[Google Search RSA — ${launchedBrand.name} | ${angleTag}]`,
        `${t('tab1.rsaHeadlinesLabel')}:`,
        ...angleCopy.google_rsa.headlines.map((h) => `- ${h}`),
        `${t('tab1.rsaDescriptionsLabel')}:`,
        ...angleCopy.google_rsa.descriptions.map((d) => `- ${d}`),
        `${t('tab1.rsaNegativesLabel')}: ${angleCopy.google_rsa.negativeKeywords.join(', ')}`,
        `${t('tab1.whatsappCtaLabel')}: ${waUrl}`,
      ].join('\n');
    }

    let wroteViaClipboardApi = false;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(payload);
        wroteViaClipboardApi = true;
      } catch {
        wroteViaClipboardApi = false;
      }
    }

    if (!wroteViaClipboardApi && typeof document !== 'undefined') {
      const tempArea = document.createElement('textarea');
      tempArea.value = payload;
      tempArea.setAttribute('readonly', '');
      tempArea.style.position = 'fixed';
      tempArea.style.left = '-9999px';
      document.body.appendChild(tempArea);
      tempArea.select();
      try {
        document.execCommand('copy');
      } catch {
        // Ignore if blocked in non-interactive environment
      }
      document.body.removeChild(tempArea);
    }

    setCopiedChannel(channel);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => {
      setCopiedChannel(null);
    }, 2000);
  }

  function handleByokEnhance() {
    if (!canUseByok || isEnhancingStrategy) {
      return;
    }
    void enhanceStrategyAngleWithGemini(selectedAngle);
  }

  function handleCpaNumberChange(
    field: 'servicePriceRm' | 'marginPercent' | 'closeRatePercent' | 'estimatedCplRm',
    raw: string
  ) {
    const parsed = Number(raw);
    setCpaInputs((prev) => ({
      ...prev,
      [field]: raw.trim() === '' || !Number.isFinite(parsed) ? 0 : parsed,
    }));
  }

  function handleRsaHeadlineChange(index: number, nextValue: string) {
    const nextHeadlines = [...angleCopy.google_rsa.headlines];
    nextHeadlines[index] = nextValue;
    updateChannelCopy(selectedAngle, 'google_rsa', { headlines: nextHeadlines });
  }

  function handleRsaDescriptionChange(index: number, nextValue: string) {
    const nextDescriptions = [...angleCopy.google_rsa.descriptions];
    nextDescriptions[index] = nextValue;
    updateChannelCopy(selectedAngle, 'google_rsa', { descriptions: nextDescriptions });
  }

  const cpaBadgeStyle =
    cpaEval.status === 'safe'
      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
      : cpaEval.status === 'caution'
        ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
        : 'border-rose-500/40 bg-rose-500/15 text-rose-300';

  const cpaStatusText =
    cpaEval.status === 'safe'
      ? t('tab1.cpaSafe')
      : cpaEval.status === 'caution'
        ? t('tab1.cpaCaution')
        : t('tab1.cpaOverLimit');

  const currentEnhanceNotice = strategyEnhanceNoticeByAngle[selectedAngle] ?? null;

  return (
    <div
      data-testid="strategy-tab"
      role="tabpanel"
      className="rounded-2xl border border-slate-800 bg-[#111827] p-4 sm:p-6 space-y-6 min-w-0"
    >
      {/* Section 1: Customer Psychology Analysis */}
      <section
        data-testid="strategy-psychology-panel"
        className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 sm:p-5 space-y-4 min-w-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-slate-100 break-words [overflow-wrap:anywhere]">
              {t('tab1.psychologyTitle')} — {launchedBrand.name}
            </h3>
            <p className="text-xs text-slate-400 break-words [overflow-wrap:anywhere] mt-0.5">
              {launchedOfferSentence}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="rounded-full border border-slate-700 bg-[#111827] px-2.5 py-1 text-xs font-medium text-sky-300">
              {toneLabel}
            </span>
            {canUseByok ? (
              <button
                type="button"
                onClick={handleByokEnhance}
                disabled={isEnhancingStrategy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-3 py-1.5 text-xs font-medium text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>{isEnhancingStrategy ? extra.enhancingByokBtn : extra.enhanceByokBtn}</span>
              </button>
            ) : null}
          </div>
        </div>

        {currentEnhanceNotice ? (
          <p data-testid="strategy-enhance-notice" className="text-xs text-indigo-300">
            {currentEnhanceNotice === 'gemini' ? extra.enhanceByokReady : extra.enhanceByokFallback}
          </p>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">
          <div className="rounded-lg border border-slate-800/90 bg-[#111827] p-3 space-y-1 min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-400">
              {t('tab1.personaLabel')}
            </div>
            <p className="text-sm text-slate-200 break-words">{psychology.targetPersona}</p>
          </div>

          <div className="rounded-lg border border-slate-800/90 bg-[#111827] p-3 space-y-1 min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
              {t('tab1.triggerLabel')}
            </div>
            <p className="text-sm text-slate-200 break-words">{psychology.coreTrigger}</p>
          </div>

          <div className="rounded-lg border border-slate-800/90 bg-[#111827] p-3 space-y-1 min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-400">
              {t('tab1.frictionLabel')}
            </div>
            <p className="text-sm text-slate-200 break-words">{psychology.frictionObjections}</p>
          </div>

          <div className="rounded-lg border border-slate-800/90 bg-[#111827] p-3 space-y-1 min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-400">
              {t('tab1.trustLabel')}
            </div>
            <p className="text-sm text-slate-200 break-words">{psychology.trustAnchors}</p>
          </div>
        </div>
      </section>

      {/* Section 2: 3 Selectable Ad Angles */}
      <section className="space-y-3 min-w-0">
        <h4 className="text-sm sm:text-base font-semibold text-slate-100">
          {t('tab1.anglesTitle')}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-w-0">
          {ANGLES.map((angle) => {
            const isSelected = angle === selectedAngle;
            const titleKey =
              angle === 'confidence'
                ? 'tab1.angleConfidence'
                : angle === 'hygiene'
                  ? 'tab1.angleHygiene'
                  : 'tab1.anglePayday';
            const descKey =
              angle === 'confidence'
                ? 'tab1.angleConfidenceDesc'
                : angle === 'hygiene'
                  ? 'tab1.angleHygieneDesc'
                  : 'tab1.anglePaydayDesc';

            return (
              <button
                key={angle}
                type="button"
                data-testid={`angle-${angle}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedAngle(angle)}
                className={`rounded-xl border p-3.5 text-left transition cursor-pointer min-w-0 space-y-1.5 ${
                  isSelected
                    ? 'border-sky-500 bg-sky-500/15 text-slate-100 ring-1 ring-sky-500/40'
                    : 'border-slate-800 bg-[#0B0F19] text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5 min-w-0">
                  <span className="text-sm font-semibold break-words">{t(titleKey)}</span>
                  <span className="rounded bg-slate-800/90 px-1.5 py-0.5 text-[10px] font-mono text-sky-300">
                    {ANGLE_WHATSAPP_TAGS[angle].replace(/\[Kod:\s*|\]/g, '')}
                  </span>
                </div>
                <p className="text-xs text-slate-400 break-words">{t(descKey)}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Section 3: 4-Channel Copy Cards + Angle-Tagged WhatsApp CTAs */}
      <section className="space-y-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <h4 className="text-sm sm:text-base font-semibold text-slate-100">
            {t('tab1.channelsTitle')}
          </h4>
          <span className="text-xs font-mono text-sky-300 break-all">{angleTag}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
          {/* Channel 1: Facebook Ads */}
          <article
            data-testid="channel-facebook"
            data-channel="facebook"
            className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 space-y-3 min-w-0 flex flex-col justify-between"
          >
            <div className="space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                <h5 className="text-sm font-semibold text-sky-400">
                  {t('tab1.channelFacebook')}
                </h5>
                <button
                  type="button"
                  data-testid="copy-btn-facebook"
                  onClick={() => handleCopyChannel('facebook')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#111827] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-sky-500/60 cursor-pointer"
                >
                  {copiedChannel === 'facebook' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-300">{t('tab1.copiedBtn')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>{t('tab1.copyBtn')}</span>
                    </>
                  )}
                </button>
              </div>

              <div className="rounded-lg border border-slate-800/80 bg-[#111827] px-3 py-2 text-xs text-slate-300 space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-sky-300">
                  <span>{extra.previewTag}:</span>
                  <span>{toneLabel}</span>
                  <span>•</span>
                  <span className="font-mono">{angleTag}</span>
                </div>
                <p className="font-medium text-slate-100 break-words">
                  {angleCopy.facebook.headline}
                </p>
                <p className="text-slate-400 break-words">{angleCopy.facebook.description}</p>
              </div>

              <label className="block space-y-1 min-w-0">
                <span className="text-xs font-medium text-slate-300">
                  {t('tab1.primaryTextLabel')}
                </span>
                <textarea
                  rows={4}
                  value={angleCopy.facebook.primaryText}
                  onChange={(e) =>
                    updateChannelCopy(selectedAngle, 'facebook', {
                      primaryText: e.target.value,
                    })
                  }
                  className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-w-0">
                <label className="block space-y-1 min-w-0">
                  <span className="text-xs font-medium text-slate-300">
                    {t('tab1.headlineLabel')}
                  </span>
                  <input
                    type="text"
                    value={angleCopy.facebook.headline}
                    onChange={(e) =>
                      updateChannelCopy(selectedAngle, 'facebook', {
                        headline: e.target.value,
                      })
                    }
                    className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                </label>
                <label className="block space-y-1 min-w-0">
                  <span className="text-xs font-medium text-slate-300">
                    {t('tab1.descriptionLabel')}
                  </span>
                  <input
                    type="text"
                    value={angleCopy.facebook.description}
                    onChange={(e) =>
                      updateChannelCopy(selectedAngle, 'facebook', {
                        description: e.target.value,
                      })
                    }
                    className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                </label>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 space-y-1 min-w-0">
              <div className="text-[11px] font-medium text-slate-400">
                {t('tab1.whatsappCtaLabel')}
              </div>
              <a
                data-testid="whatsapp-cta-facebook"
                href={angleCopy.facebook.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 underline break-all"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="break-all">{angleCopy.facebook.whatsappUrl}</span>
              </a>
            </div>
          </article>

          {/* Channel 2: Instagram */}
          <article
            data-testid="channel-instagram"
            data-channel="instagram"
            className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 space-y-3 min-w-0 flex flex-col justify-between"
          >
            <div className="space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                <h5 className="text-sm font-semibold text-pink-400">
                  {t('tab1.channelInstagram')}
                </h5>
                <button
                  type="button"
                  data-testid="copy-btn-instagram"
                  onClick={() => handleCopyChannel('instagram')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#111827] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-pink-500/60 cursor-pointer"
                >
                  {copiedChannel === 'instagram' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-300">{t('tab1.copiedBtn')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>{t('tab1.copyBtn')}</span>
                    </>
                  )}
                </button>
              </div>

              <div className="rounded-lg border border-slate-800/80 bg-[#111827] px-3 py-2 text-xs text-slate-300 space-y-0.5 min-w-0">
                <div className="text-[11px] text-pink-300 font-mono">{angleTag}</div>
                <p className="text-slate-300 break-words">{angleCopy.instagram.hashtags}</p>
              </div>

              <label className="block space-y-1 min-w-0">
                <span className="text-xs font-medium text-slate-300">
                  {t('tab1.captionLabel')}
                </span>
                <textarea
                  rows={4}
                  value={angleCopy.instagram.caption}
                  onChange={(e) =>
                    updateChannelCopy(selectedAngle, 'instagram', {
                      caption: e.target.value,
                    })
                  }
                  className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 focus:border-pink-500 focus:outline-none"
                />
              </label>

              <label className="block space-y-1 min-w-0">
                <span className="text-xs font-medium text-slate-300">
                  {t('tab1.hashtagsLabel')}
                </span>
                <input
                  type="text"
                  value={angleCopy.instagram.hashtags}
                  onChange={(e) =>
                    updateChannelCopy(selectedAngle, 'instagram', {
                      hashtags: e.target.value,
                    })
                  }
                  className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 focus:border-pink-500 focus:outline-none"
                />
              </label>
            </div>

            <div className="pt-2 border-t border-slate-800/80 space-y-1 min-w-0">
              <div className="text-[11px] font-medium text-slate-400">
                {t('tab1.whatsappCtaLabel')}
              </div>
              <a
                data-testid="whatsapp-cta-instagram"
                href={angleCopy.instagram.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 underline break-all"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="break-all">{angleCopy.instagram.whatsappUrl}</span>
              </a>
            </div>
          </article>

          {/* Channel 3: TikTok */}
          <article
            data-testid="channel-tiktok"
            data-channel="tiktok"
            className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 space-y-3 min-w-0 flex flex-col justify-between"
          >
            <div className="space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                <h5 className="text-sm font-semibold text-teal-400">
                  {t('tab1.channelTiktok')}
                </h5>
                <button
                  type="button"
                  data-testid="copy-btn-tiktok"
                  onClick={() => handleCopyChannel('tiktok')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#111827] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-teal-500/60 cursor-pointer"
                >
                  {copiedChannel === 'tiktok' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-300">{t('tab1.copiedBtn')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>{t('tab1.copyBtn')}</span>
                    </>
                  )}
                </button>
              </div>

              <div className="rounded-lg border border-slate-800/80 bg-[#111827] px-3 py-2 text-xs text-slate-300 space-y-0.5 min-w-0">
                <div className="text-[11px] text-teal-300 font-mono">{angleTag}</div>
                <p className="text-slate-200 break-words">{angleCopy.tiktok.hook}</p>
              </div>

              <label className="block space-y-1 min-w-0">
                <span className="text-xs font-medium text-slate-300">
                  {t('tab1.hookLabel')}
                </span>
                <input
                  type="text"
                  value={angleCopy.tiktok.hook}
                  onChange={(e) =>
                    updateChannelCopy(selectedAngle, 'tiktok', { hook: e.target.value })
                  }
                  className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
                />
              </label>

              <label className="block space-y-1 min-w-0">
                <span className="text-xs font-medium text-slate-300">
                  {t('tab1.scriptLabel')}
                </span>
                <textarea
                  rows={3}
                  value={angleCopy.tiktok.script}
                  onChange={(e) =>
                    updateChannelCopy(selectedAngle, 'tiktok', { script: e.target.value })
                  }
                  className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
                />
              </label>

              <label className="block space-y-1 min-w-0">
                <span className="text-xs font-medium text-slate-300">
                  {t('tab1.captionLabel')}
                </span>
                <textarea
                  rows={2}
                  value={angleCopy.tiktok.caption}
                  onChange={(e) =>
                    updateChannelCopy(selectedAngle, 'tiktok', { caption: e.target.value })
                  }
                  className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
                />
              </label>
            </div>

            <div className="pt-2 border-t border-slate-800/80 space-y-1 min-w-0">
              <div className="text-[11px] font-medium text-slate-400">
                {t('tab1.whatsappCtaLabel')}
              </div>
              <a
                data-testid="whatsapp-cta-tiktok"
                href={angleCopy.tiktok.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 underline break-all"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="break-all">{angleCopy.tiktok.whatsappUrl}</span>
              </a>
            </div>
          </article>

          {/* Channel 4: Google Search RSA */}
          <article
            data-testid="channel-google_rsa"
            data-channel="google_rsa"
            className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 space-y-3 min-w-0 flex flex-col justify-between"
          >
            <div className="space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                <h5 className="text-sm font-semibold text-amber-400">
                  {t('tab1.channelGoogleRsa')}
                </h5>
                <button
                  type="button"
                  data-testid="copy-btn-google_rsa"
                  onClick={() => handleCopyChannel('google_rsa')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#111827] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-amber-500/60 cursor-pointer"
                >
                  {copiedChannel === 'google_rsa' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-300">{t('tab1.copiedBtn')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>{t('tab1.copyBtn')}</span>
                    </>
                  )}
                </button>
              </div>

              {/* 3 Headlines (nth 0..2), no maxLength */}
              <div className="space-y-2 min-w-0">
                <div className="text-xs font-medium text-slate-300">
                  {t('tab1.rsaHeadlinesLabel')}
                </div>
                {angleCopy.google_rsa.headlines.slice(0, 3).map((headline, idx) => {
                  const over = headline.length > 30;
                  const inputId = `rsa-headline-${idx + 1}`;
                  return (
                    <div key={`rsa-h-${idx}`} className="space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <label htmlFor={inputId} className="text-slate-400">
                          H{idx + 1}
                        </label>
                        <span
                          className={`font-mono ${
                            over ? 'text-rose-400 font-semibold' : 'text-slate-400'
                          }`}
                        >
                          {headline.length}/30
                          {over ? ` (${extra.rsaOverLimit})` : ''}
                        </span>
                      </div>
                      <input
                        id={inputId}
                        type="text"
                        value={headline}
                        onChange={(e) => handleRsaHeadlineChange(idx, e.target.value)}
                        className={`w-full min-w-0 rounded-lg border bg-[#111827] px-3 py-1.5 text-sm text-slate-100 focus:outline-none ${
                          over
                            ? 'border-rose-500 focus:border-rose-400'
                            : 'border-slate-700 focus:border-amber-500'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* 2 Descriptions (nth 3..4), no maxLength */}
              <div className="space-y-2 min-w-0">
                <div className="text-xs font-medium text-slate-300">
                  {t('tab1.rsaDescriptionsLabel')}
                </div>
                {angleCopy.google_rsa.descriptions.slice(0, 2).map((desc, idx) => {
                  const over = desc.length > 90;
                  const textareaId = `rsa-description-${idx + 1}`;
                  return (
                    <div key={`rsa-d-${idx}`} className="space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <label htmlFor={textareaId} className="text-slate-400">
                          D{idx + 1}
                        </label>
                        <span
                          className={`font-mono ${
                            over ? 'text-rose-400 font-semibold' : 'text-slate-400'
                          }`}
                        >
                          {desc.length}/90
                          {over ? ` (${extra.rsaOverLimit})` : ''}
                        </span>
                      </div>
                      <textarea
                        id={textareaId}
                        rows={2}
                        value={desc}
                        onChange={(e) => handleRsaDescriptionChange(idx, e.target.value)}
                        className={`w-full min-w-0 rounded-lg border bg-[#111827] px-3 py-1.5 text-sm text-slate-100 focus:outline-none ${
                          over
                            ? 'border-rose-500 focus:border-rose-400'
                            : 'border-slate-700 focus:border-amber-500'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Negative Keywords */}
              <div className="space-y-1.5 min-w-0">
                <div className="text-xs font-medium text-slate-300">
                  {t('tab1.rsaNegativesLabel')}
                </div>
                <div className="flex flex-wrap gap-1.5 min-w-0">
                  {angleCopy.google_rsa.negativeKeywords.map((kw, idx) => (
                    <span
                      key={`neg-${idx}-${kw}`}
                      className="rounded-md border border-slate-700 bg-[#111827] px-2 py-0.5 text-xs text-slate-300 break-words"
                    >
                      -{kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 space-y-1 min-w-0">
              <div className="text-[11px] font-medium text-slate-400">
                {t('tab1.whatsappCtaLabel')}
              </div>
              <a
                data-testid="whatsapp-cta-google_rsa"
                href={angleCopy.google_rsa.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 underline break-all"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="break-all">{angleCopy.google_rsa.whatsappUrl}</span>
              </a>
            </div>
          </article>
        </div>
      </section>

      {/* Section 4: Break-Even CPA Guardrail */}
      <section
        data-testid="cpa-guardrail"
        className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 sm:p-5 space-y-4 min-w-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <h4 className="text-sm sm:text-base font-semibold text-slate-100">
            {t('tab1.cpaTitle')}
          </h4>
          <span
            data-testid="cpa-status-badge"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cpaBadgeStyle}`}
          >
            {cpaEval.status === 'safe' ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>{cpaStatusText}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 min-w-0">
          <label className="block space-y-1 min-w-0">
            <span className="text-xs font-medium text-slate-300">
              {t('tab1.cpaPriceLabel')}
            </span>
            <input
              type="number"
              min={0}
              step="1"
              data-testid="cpa-price-input"
              value={cpaInputs.servicePriceRm}
              onChange={(e) => handleCpaNumberChange('servicePriceRm', e.target.value)}
              className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </label>

          <label className="block space-y-1 min-w-0">
            <span className="text-xs font-medium text-slate-300">
              {t('tab1.cpaMarginLabel')}
            </span>
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              data-testid="cpa-margin-input"
              value={cpaInputs.marginPercent}
              onChange={(e) => handleCpaNumberChange('marginPercent', e.target.value)}
              className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </label>

          <label className="block space-y-1 min-w-0">
            <span className="text-xs font-medium text-slate-300">
              {t('tab1.cpaCloseRateLabel')}
            </span>
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              data-testid="cpa-close-rate-input"
              value={cpaInputs.closeRatePercent}
              onChange={(e) => handleCpaNumberChange('closeRatePercent', e.target.value)}
              className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </label>

          <label className="block space-y-1 min-w-0">
            <span className="text-xs font-medium text-slate-300">
              {t('tab1.cpaTargetCplLabel')}
            </span>
            <input
              type="number"
              min={0}
              step="1"
              data-testid="cpa-cpl-input"
              value={cpaInputs.estimatedCplRm}
              onChange={(e) => handleCpaNumberChange('estimatedCplRm', e.target.value)}
              className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-w-0">
          <div className="rounded-lg border border-slate-800 bg-[#111827] p-3 min-w-0">
            <div className="text-xs text-slate-400">{t('tab1.cpaBreakEvenCpa')}</div>
            <div
              data-testid="cpa-break-even-value"
              className="mt-1 text-lg font-bold text-slate-100"
            >
              {formatRm(cpaEval.breakEvenCpaRm)}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#111827] p-3 min-w-0">
            <div className="text-xs text-slate-400">{t('tab1.cpaMaxCpl')}</div>
            <div
              data-testid="cpa-max-cpl-value"
              className="mt-1 text-lg font-bold text-sky-300"
            >
              {formatRm(cpaEval.maxRecommendedCplRm)}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#111827] p-3 min-w-0">
            <div className="text-xs text-slate-400">{t('tab1.cpaProjectedCpa')}</div>
            <div
              data-testid="cpa-projected-value"
              className="mt-1 text-lg font-bold text-slate-100"
            >
              {formatRm(cpaEval.projectedCpaRm)}
            </div>
          </div>
        </div>

        {cpaEval.hasZeroCloseRate ? (
          <p className="text-xs text-amber-300">{extra.zeroCloseRateNote}</p>
        ) : null}
      </section>

      {/* Section 5: Policy-Safe Copy Check */}
      <section
        data-testid="compliance-checker"
        className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 sm:p-5 space-y-4 min-w-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <h4 className="text-sm sm:text-base font-semibold text-slate-100">
            {t('tab1.complianceTitle')}
          </h4>
          <span
            data-testid="compliance-status-badge"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
              complianceFindings.length === 0
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
            }`}
          >
            {complianceFindings.length === 0 ? (
              <>
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span>{t('tab1.compliancePass')}</span>
              </>
            ) : (
              <>
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {complianceFindings.length} {t('tab1.complianceFlagCount')}
                </span>
              </>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <button
            type="button"
            data-testid="compliance-test-risky-btn"
            onClick={() => {
              setComplianceEditedByUser(true);
              setComplianceText(RISKY_COMPLIANCE_SAMPLE);
            }}
            className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25 cursor-pointer"
          >
            {t('tab1.complianceTestRiskyBtn')}
          </button>

          <button
            type="button"
            data-testid="compliance-apply-rewrite-btn"
            onClick={() => {
              const safe = rewriteSafeCopy(complianceText, launchedBrand.name);
              setComplianceEditedByUser(true);
              setComplianceText(safe);
            }}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
          >
            {extra.applySafeRewriteBtn}
          </button>

          <button
            type="button"
            onClick={() => {
              setComplianceEditedByUser(false);
              setComplianceText(angleCopy.facebook.primaryText);
            }}
            className="rounded-lg border border-slate-700 bg-[#111827] px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600 cursor-pointer"
          >
            {extra.resetComplianceBtn}
          </button>
        </div>

        <label className="block space-y-1.5 min-w-0">
          <span className="text-xs font-medium text-slate-300">
            {t('tab1.complianceEditorLabel')}
          </span>
          <textarea
            rows={3}
            data-testid="compliance-input"
            value={complianceText}
            onChange={(e) => {
              setComplianceEditedByUser(true);
              setComplianceText(e.target.value);
            }}
            className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </label>

        <div data-testid="compliance-findings" className="space-y-2 min-w-0">
          {complianceFindings.length === 0 ? (
            <p className="text-xs text-emerald-300 break-words">
              {t('tab1.compliancePass')}
            </p>
          ) : (
            complianceFindings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 space-y-1 min-w-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[11px] font-semibold text-rose-200 break-words">
                    {finding.category === 'meta_personal_attributes'
                      ? extra.metaCategory
                      : extra.healthcareCategory}
                  </span>
                  <span className="text-[11px] font-mono text-amber-200 break-words">
                    {extra.matchedLabel}: &ldquo;
                    {finding.id === 'my-kkliu-notice' && locale === 'en'
                      ? 'No clinical consultation / KKLIU reference'
                      : finding.matchedText}
                    &rdquo;
                  </span>
                </div>
                <p className="text-xs text-slate-200 break-words">
                  <strong className="text-rose-200">{extra.ruleLabel}:</strong>{' '}
                  {t(finding.ruleKey)}
                </p>
                <p className="text-xs text-emerald-200 break-words">
                  <strong className="text-emerald-300">{extra.suggestionLabel}:</strong>{' '}
                  {t(finding.suggestionKey)}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
