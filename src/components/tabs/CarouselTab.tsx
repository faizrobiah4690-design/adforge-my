import { useEffect, useRef, useState } from 'react';
import {
  Download,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useCampaign } from '../../state/CampaignContext';
import { useWorkbench } from '../../state/WorkbenchContext';
import type { CarouselSlide } from '../../types/campaign';
import {
  buildPollinationsBackgroundPrompt,
  exportSlideAsPng,
  generateAiCarouselBackground,
  getContrastTextColor,
  resolveSlideLayoutVariant,
} from '../../utils/carouselExport';

const ROLE_LABELS: Record<'ms' | 'en', Record<CarouselSlide['role'], string>> = {
  ms: {
    hook: 'PEMBUKA',
    offer: 'TAWARAN',
    proof: 'BUKTI',
    cta: 'CTA',
  },
  en: {
    hook: 'HOOK',
    offer: 'OFFER',
    proof: 'PROOF',
    cta: 'CTA',
  },
};

type CarouselExportError = { code: 'export_failed'; detail?: string } | null;

function resolveSafeThemeColor(hex: string): string {
  const cleaned = hex.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cleaned)) {
    return cleaned;
  }
  return '#0EA5E9';
}

export function CarouselTab() {
  const { locale, t } = useI18n();
  const { isDemoMode } = useWorkbench();
  const {
    campaignLaunchEpoch,
    launchedBrand,
    launchedOfferSentence,
    launchedUspAndAudience,
    launchedPhotos,
    slides,
    updateSlide,
    safeZoneMode,
    setSafeZoneMode,
  } = useCampaign();

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportErrorState, setExportErrorState] = useState<CarouselExportError>(null);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const headlineInputRef = useRef<HTMLInputElement | null>(null);
  const latestEpochRef = useRef<number>(campaignLaunchEpoch);
  const aiBgAbortRef = useRef<AbortController | null>(null);

  latestEpochRef.current = campaignLaunchEpoch;

  useEffect(() => {
    setBgError(null);
    return () => {
      aiBgAbortRef.current?.abort();
      aiBgAbortRef.current = null;
      setIsGeneratingBg(false);
    };
  }, [campaignLaunchEpoch]);

  const exportError = exportErrorState
    ? exportErrorState.detail
      ? locale === 'ms'
        ? `Eksport PNG gagal: ${exportErrorState.detail}`
        : `PNG export failed: ${exportErrorState.detail}`
      : locale === 'ms'
        ? 'Eksport PNG gagal. Sila cuba lagi.'
        : 'PNG export failed. Please try again.'
    : null;

  const safeIndex = slides.length > 0 ? Math.min(activeSlideIndex, slides.length - 1) : 0;
  const activeSlide = slides[safeIndex];

  const themeColor = resolveSafeThemeColor(launchedBrand.themeColor);
  const contrastTextColor = getContrastTextColor(themeColor);
  const photoAsset = activeSlide
    ? launchedPhotos[activeSlide.photoIndex] ?? launchedPhotos[0]
    : launchedPhotos[0];
  const photoSrc = photoAsset?.src ?? '';
  const aiBgSrc = activeSlide?.aiBackgroundDataUrl?.trim() ?? '';
  const bgSrc = aiBgSrc.length > 0 ? aiBgSrc : photoSrc;
  const layoutVariant = activeSlide ? resolveSlideLayoutVariant(activeSlide) : 'hero_hook';
  const is45 = safeZoneMode === '4:5';

  const handleGenerateAiBackground = async () => {
    if (!activeSlide || isGeneratingBg) {
      return;
    }
    const epochAtStart = campaignLaunchEpoch;
    const targetSlideId = activeSlide.id;
    aiBgAbortRef.current?.abort();
    const controller = new AbortController();
    aiBgAbortRef.current = controller;

    setIsGeneratingBg(true);
    setBgError(null);
    try {
      const prompt = buildPollinationsBackgroundPrompt(
        launchedBrand,
        launchedOfferSentence,
        activeSlide,
        launchedUspAndAudience
      );
      const res = await generateAiCarouselBackground({
        prompt,
        aspectMode: safeZoneMode,
        seed: Math.floor(Date.now() % 1_000_000),
        isDemoMode,
        signal: controller.signal,
      });
      if (controller.signal.aborted || latestEpochRef.current !== epochAtStart) {
        return;
      }
      if (res.ok) {
        updateSlide(targetSlideId, {
          aiBackgroundDataUrl: res.dataUrl,
          editedByUser: true,
        });
      } else if (res.isTestGuard) {
        setBgError(
          locale === 'ms'
            ? 'Mod Demo / persekitaran ujian: panggilan rangkaian luaran dilangkau — foto produk kekal aktif.'
            : 'Demo / test mode: external background fetch skipped — product photo remains active.'
        );
      } else {
        setBgError(
          locale === 'ms'
            ? `Latar belakang AI tidak tersedia (${res.reason}). Foto produk kekal aktif.`
            : `AI background unavailable (${res.reason}). Product photo remains active.`
        );
      }
    } finally {
      if (aiBgAbortRef.current === controller) {
        aiBgAbortRef.current = null;
        setIsGeneratingBg(false);
      }
    }
  };

  const handleDownloadPng = async () => {
    if (!activeSlide || isExporting) {
      return;
    }
    setIsExporting(true);
    setExportErrorState(null);
    try {
      await exportSlideAsPng({
        slide: activeSlide,
        brand: launchedBrand,
        photoSrc,
        aspectMode: safeZoneMode,
        totalSlides: slides.length,
      });
    } catch (err) {
      const detail = err instanceof Error && err.message ? err.message : undefined;
      setExportErrorState({ code: 'export_failed', detail });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      data-testid="tab-panel-carousel"
      role="tabpanel"
      className="rounded-2xl border border-slate-800 bg-[#111827] p-4 sm:p-6 space-y-5 min-w-0"
    >
      {/* Header & Aspect/Safe-Zone Controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between min-w-0">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-slate-100">{t('tab2.title')}</h3>
          <p className="text-xs text-slate-400">{t('tab2.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <button
            type="button"
            data-testid="safezone-aspect-9-16"
            aria-pressed={safeZoneMode === '9:16'}
            onClick={() => setSafeZoneMode('9:16')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              safeZoneMode === '9:16'
                ? 'border-sky-500 bg-sky-500/15 text-sky-200'
                : 'border-slate-700 bg-[#0B0F19] text-slate-300 hover:border-slate-600'
            }`}
          >
            {t('tab2.aspect916')}
          </button>

          <button
            type="button"
            data-testid="safezone-aspect-4-5"
            aria-pressed={safeZoneMode === '4:5'}
            onClick={() => setSafeZoneMode('4:5')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              safeZoneMode === '4:5'
                ? 'border-sky-500 bg-sky-500/15 text-sky-200'
                : 'border-slate-700 bg-[#0B0F19] text-slate-300 hover:border-slate-600'
            }`}
          >
            {t('tab2.aspect45')}
          </button>

          <button
            type="button"
            data-testid="safezone-overlay-toggle"
            aria-pressed={showSafeZone}
            onClick={() => setShowSafeZone((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              showSafeZone
                ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                : 'border-slate-700 bg-[#0B0F19] text-slate-300 hover:border-slate-600'
            }`}
          >
            {showSafeZone ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            <span>{t('tab2.safeZoneToggleLabel')}</span>
          </button>
        </div>
      </div>

      {/* 4-Slide Selector */}
      <div className="space-y-2 min-w-0">
        <div className="text-xs font-medium text-slate-300">{t('tab2.slideSelectorLabel')}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
          {slides.map((slide, idx) => {
            const isSelected = idx === safeIndex;
            const slideNumLabel = locale === 'ms' ? `Slaid ${idx + 1}` : `Slide ${idx + 1}`;
            return (
              <button
                key={slide.id}
                type="button"
                data-testid={`carousel-slide-${idx + 1}`}
                aria-pressed={isSelected}
                onClick={() => {
                  setActiveSlideIndex(idx);
                  setExportErrorState(null);
                }}
                className={`rounded-xl border px-3 py-2 text-left transition cursor-pointer min-w-0 ${
                  isSelected
                    ? 'border-sky-500 bg-sky-500/15 text-sky-100'
                    : 'border-slate-800 bg-[#0B0F19] text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-xs font-semibold">
                  <span>{slideNumLabel}</span>
                  <span className="uppercase text-[10px] tracking-wide text-slate-400">
                    {ROLE_LABELS[locale][slide.role]}
                  </span>
                </div>
                <div className="mt-0.5 whitespace-normal break-words [overflow-wrap:anywhere] text-[11px] leading-snug text-slate-400">
                  {slide.headline || (locale === 'ms' ? '(Tiada tajuk)' : '(No headline)')}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {activeSlide ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-w-0">
          {/* Left Column: Live Two-Layer Preview Stage */}
          <div className="lg:col-span-6 space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 min-w-0">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-[#0B0F19] px-2.5 py-1 max-w-full min-w-0">
                <ImageIcon className="h-3 w-3 text-sky-400 shrink-0" />
                <span className="min-w-0 break-words [overflow-wrap:anywhere] whitespace-normal leading-tight">
                  {t('tab2.layerBgLabel')}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-[#0B0F19] px-2.5 py-1 max-w-full min-w-0">
                <Layers className="h-3 w-3 text-emerald-400 shrink-0" />
                <span className="min-w-0 break-words [overflow-wrap:anywhere] whitespace-normal leading-tight">
                  {t('tab2.layerFgLabel')}
                </span>
              </span>
            </div>

            <div
              className={`rounded-2xl border border-slate-800 bg-[#0B0F19] min-w-0 ${
                is45 ? 'p-1.5 sm:p-4' : 'p-3 sm:p-4'
              }`}
            >
              <div
                data-testid="carousel-preview-stage"
                data-carousel-stage="true"
                className={`w-full mx-auto relative overflow-hidden rounded-2xl border border-slate-700 bg-[#0B0F19] shadow-xl ${
                  safeZoneMode === '9:16'
                    ? 'max-w-[320px] aspect-[9/16]'
                    : 'max-w-[360px] aspect-[4/5]'
                }`}
              >
                {/* Layer 1: Text-Free Background Photo or AI Background + Scrims */}
                {bgSrc.trim().length > 0 ? (
                  <img
                    src={bgSrc}
                    alt={activeSlide.headline || launchedBrand.name}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full bg-gradient-to-br from-slate-900 via-slate-800 to-[#0B0F19]"
                  />
                )}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-[36%] bg-gradient-to-b from-[#040914]/75 to-transparent"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[66%] bg-gradient-to-t from-[#040914]/95 via-[#040914]/70 to-transparent"
                />

                {/* Layer 2: Foreground Brand Elements & 4 Distinct Poster Layouts */}
                <div
                  className={`relative z-10 flex h-full flex-col justify-between min-w-0 ${
                    is45 ? 'p-2 sm:p-3.5 gap-1 sm:gap-2' : 'p-3.5 sm:p-4'
                  }`}
                >
                  <div className={is45 ? 'space-y-1 sm:space-y-2 min-w-0' : 'space-y-2 min-w-0'}>
                    <div
                      className={
                        is45 ? 'h-1 sm:h-1.5 w-full rounded-full' : 'h-1.5 w-full rounded-full'
                      }
                      style={{ backgroundColor: themeColor }}
                    />

                    <div
                      className={
                        is45
                          ? 'flex items-center gap-1.5 sm:gap-2.5 min-w-0'
                          : 'flex items-center gap-2.5 min-w-0'
                      }
                    >
                      <img
                        data-testid="carousel-logo-img"
                        data-layer="logo"
                        src={launchedBrand.logoDataUrl}
                        alt={`${launchedBrand.name} logo`}
                        className={`rounded-lg object-contain bg-white/95 p-0.5 shrink-0 border-2 ${
                          is45 ? 'h-6 w-6 sm:h-9 sm:w-9' : 'h-9 w-9'
                        }`}
                        style={{ borderColor: themeColor }}
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={`whitespace-normal break-words [overflow-wrap:anywhere] font-bold text-slate-50 leading-tight ${
                            is45 ? 'text-[11px] sm:text-xs line-clamp-1 sm:line-clamp-none' : 'text-xs'
                          }`}
                        >
                          {launchedBrand.name}
                        </div>
                        <div
                          className={`font-medium text-slate-300 ${
                            is45 ? 'text-[10px] sm:text-[11px] leading-tight' : 'text-[11px]'
                          }`}
                        >
                          {locale === 'ms' ? 'Slaid' : 'Slide'} {activeSlide.index + 1} /{' '}
                          {slides.length}
                        </div>
                      </div>
                    </div>

                    {activeSlide.badgeText.trim() ? (
                      <div className="min-w-0">
                        <span
                          className={`inline-block max-w-full rounded-xl font-bold whitespace-normal break-words [overflow-wrap:anywhere] ${
                            is45
                              ? 'px-2 sm:px-2.5 py-0.5 text-[9px] sm:text-[11px] leading-tight'
                              : 'px-2.5 py-0.5 text-[11px]'
                          }`}
                          style={{
                            backgroundColor: themeColor,
                            color: contrastTextColor,
                          }}
                        >
                          {activeSlide.badgeText}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {/* Layout 1: hero_hook — Product Photo Inset + Bold Hook Card */}
                  {layoutVariant === 'hero_hook' ? (
                    <div className={is45 ? 'space-y-1.5 sm:space-y-2.5 min-w-0' : 'space-y-2.5 min-w-0'}>
                      {photoSrc.trim().length > 0 ? (
                        <div
                          className={`mx-auto aspect-[4/3] overflow-hidden rounded-xl border-2 bg-slate-950/90 shadow-lg ${
                            is45
                              ? 'w-[50%] sm:w-[72%] max-w-[96px] sm:max-w-[180px] max-h-[68px] sm:max-h-[120px]'
                              : 'w-[72%] max-w-[180px]'
                          }`}
                          style={{ borderColor: themeColor }}
                        >
                          <img
                            src={photoSrc}
                            alt={photoAsset?.label || launchedBrand.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : null}

                      <div
                        className={`flex rounded-xl border-2 bg-slate-950/85 shadow-lg min-w-0 ${
                          is45 ? 'gap-2 sm:gap-2.5 p-2 sm:p-3' : 'gap-2.5 p-3'
                        }`}
                        style={{ borderColor: themeColor }}
                      >
                        <div
                          aria-hidden="true"
                          className="w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: themeColor }}
                        />
                        <div
                          className={`min-w-0 flex-1 ${
                            is45 ? 'space-y-1 sm:space-y-1.5' : 'space-y-1.5'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => headlineInputRef.current?.focus()}
                            title={
                              locale === 'ms'
                                ? 'Klik untuk sunting tajuk'
                                : 'Click to edit headline'
                            }
                            className="w-full text-left cursor-text rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 min-w-0 block"
                          >
                            <div
                              className={`font-extrabold text-white break-words [overflow-wrap:anywhere] ${
                                is45
                                  ? 'text-xs sm:text-base leading-tight sm:leading-snug line-clamp-2 sm:line-clamp-none'
                                  : 'text-sm sm:text-base leading-snug'
                              }`}
                            >
                              {activeSlide.headline || '\u00A0'}
                            </div>
                            {activeSlide.subheadline.trim() ? (
                              <div
                                className={`text-slate-300 break-words [overflow-wrap:anywhere] ${
                                  is45
                                    ? 'mt-0.5 sm:mt-1 text-[10px] sm:text-xs leading-snug sm:leading-relaxed line-clamp-2 sm:line-clamp-none'
                                    : 'mt-1 text-[11px] sm:text-xs leading-relaxed'
                                }`}
                              >
                                {activeSlide.subheadline}
                              </div>
                            ) : null}
                          </button>

                          {activeSlide.ctaText.trim() ? (
                            <div className={is45 ? 'pt-0.5 sm:pt-1 min-w-0' : 'pt-1 min-w-0'}>
                              <span
                                className={`inline-block max-w-full rounded-xl font-bold whitespace-normal break-words [overflow-wrap:anywhere] ${
                                  is45
                                    ? 'px-2 sm:px-3 py-0.5 sm:py-1 text-[9px] sm:text-[11px] leading-tight'
                                    : 'px-3 py-1 text-[11px]'
                                }`}
                                style={{
                                  backgroundColor: themeColor,
                                  color: contrastTextColor,
                                }}
                              >
                                {activeSlide.ctaText}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Layout 2: problem_solution — Split Problem vs Solution Card */}
                  {layoutVariant === 'problem_solution' ? (
                    <div className={is45 ? 'space-y-1 sm:space-y-2 min-w-0' : 'space-y-2 min-w-0'}>
                      <div
                        className={`rounded-xl border border-rose-500/70 bg-[#1E1B2E]/90 min-w-0 ${
                          is45 ? 'p-1.5 sm:p-2.5' : 'p-2.5'
                        }`}
                      >
                        <span
                          className={`inline-block rounded-full bg-rose-500 font-bold text-white ${
                            is45
                              ? 'px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] leading-none'
                              : 'px-2 py-0.5 text-[9px]'
                          }`}
                        >
                          {locale === 'ms' ? 'CABARAN BIASA' : 'COMMON FRUSTRATION'}
                        </span>
                        <p
                          className={`text-rose-100 break-words [overflow-wrap:anywhere] ${
                            is45
                              ? 'mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] leading-tight sm:leading-snug line-clamp-2 sm:line-clamp-none'
                              : 'mt-1 text-[11px] leading-snug'
                          }`}
                        >
                          {activeSlide.subheadline.includes('→')
                            ? activeSlide.subheadline.split('→')[0]?.trim()
                            : locale === 'ms'
                              ? 'Pilihan kabur, harga tak jelas & lambat dapat jawapan.'
                              : 'Unclear options, hidden fees & slow replies.'}
                        </p>
                      </div>

                      <div
                        className={`rounded-xl border-2 bg-slate-950/90 shadow-lg min-w-0 ${
                          is45
                            ? 'p-1.5 sm:p-3 space-y-0.5 sm:space-y-1.5'
                            : 'p-3 space-y-1.5'
                        }`}
                        style={{ borderColor: themeColor }}
                      >
                        <span
                          className={`inline-block rounded-full font-bold ${
                            is45
                              ? 'px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] leading-none'
                              : 'px-2 py-0.5 text-[9px]'
                          }`}
                          style={{ backgroundColor: themeColor, color: contrastTextColor }}
                        >
                          {locale === 'ms' ? 'SOLUSI KAMI' : 'OUR SOLUTION'}
                        </span>
                        <button
                          type="button"
                          onClick={() => headlineInputRef.current?.focus()}
                          title={
                            locale === 'ms'
                              ? 'Klik untuk sunting tajuk'
                              : 'Click to edit headline'
                          }
                          className="w-full text-left cursor-text rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 min-w-0 block"
                        >
                          <div
                            className={`font-extrabold text-white break-words [overflow-wrap:anywhere] ${
                              is45
                                ? 'text-xs sm:text-sm leading-tight sm:leading-snug line-clamp-2 sm:line-clamp-none'
                                : 'text-sm leading-snug'
                            }`}
                          >
                            {activeSlide.headline || '\u00A0'}
                          </div>
                          {activeSlide.subheadline.trim() ? (
                            <div
                              className={`text-slate-300 break-words [overflow-wrap:anywhere] ${
                                is45
                                  ? 'mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] leading-tight sm:leading-snug line-clamp-2 sm:line-clamp-none'
                                  : 'mt-1 text-[11px] leading-snug'
                              }`}
                            >
                              {activeSlide.subheadline.includes('→')
                                ? activeSlide.subheadline.split('→').slice(1).join(' ').trim()
                                : activeSlide.subheadline}
                            </div>
                          ) : null}
                        </button>
                        {activeSlide.ctaText.trim() ? (
                          <span
                            className={`inline-block max-w-full rounded-xl font-bold whitespace-normal break-words ${
                              is45
                                ? 'px-2 sm:px-2.5 py-0.5 text-[9px] sm:text-[10px] leading-tight'
                                : 'px-2.5 py-0.5 text-[10px]'
                            }`}
                            style={{ backgroundColor: themeColor, color: contrastTextColor }}
                          >
                            {activeSlide.ctaText}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* Layout 3: feature_grid — 2x2 Feature/Value Highlight Grid */}
                  {layoutVariant === 'feature_grid' ? (
                    <div className={is45 ? 'space-y-1 sm:space-y-2 min-w-0' : 'space-y-2 min-w-0'}>
                      <button
                        type="button"
                        onClick={() => headlineInputRef.current?.focus()}
                        title={
                          locale === 'ms'
                            ? 'Klik untuk sunting tajuk'
                            : 'Click to edit headline'
                        }
                        className="w-full text-left cursor-text rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 min-w-0 block"
                      >
                        <div
                          className={`font-extrabold text-white break-words [overflow-wrap:anywhere] ${
                            is45
                              ? 'text-xs sm:text-sm leading-tight sm:leading-snug line-clamp-2 sm:line-clamp-none'
                              : 'text-sm leading-snug'
                          }`}
                        >
                          {activeSlide.headline || '\u00A0'}
                        </div>
                        {activeSlide.subheadline.trim() ? (
                          <div
                            className={`mt-0.5 text-slate-300 break-words [overflow-wrap:anywhere] ${
                              is45
                                ? 'text-[10px] sm:text-[11px] leading-tight sm:leading-snug line-clamp-1 sm:line-clamp-none'
                                : 'text-[11px] leading-snug'
                            }`}
                          >
                            {activeSlide.subheadline}
                          </div>
                        ) : null}
                      </button>

                      <div
                        className={`grid grid-cols-2 min-w-0 ${
                          is45 ? 'gap-1 sm:gap-1.5' : 'gap-1.5'
                        }`}
                      >
                        {(activeSlide.highlightPoints && activeSlide.highlightPoints.length > 0
                          ? activeSlide.highlightPoints
                          : [
                              'Kualiti konsisten',
                              'Harga telus jelas',
                              'Mesra pengguna',
                              'Tempahan pantas',
                            ]
                        )
                          .slice(0, 4)
                          .map((pt, idx) => (
                            <div
                              key={`${activeSlide.id}-pt-${idx}`}
                              className={`rounded-lg border bg-slate-950/90 min-w-0 ${
                                is45 ? 'p-1.5 sm:p-2' : 'p-2'
                              }`}
                              style={{ borderColor: themeColor }}
                            >
                              <span
                                className={`inline-block rounded font-extrabold ${
                                  is45
                                    ? 'px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[9px] leading-none'
                                    : 'px-1.5 py-0.5 text-[9px]'
                                }`}
                                style={{ backgroundColor: themeColor, color: contrastTextColor }}
                              >
                                0{idx + 1}
                              </span>
                              <p
                                className={`font-semibold text-slate-100 leading-tight break-words [overflow-wrap:anywhere] ${
                                  is45
                                    ? 'mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] line-clamp-2 sm:line-clamp-none'
                                    : 'mt-1 text-[10px]'
                                }`}
                              >
                                {pt}
                              </p>
                            </div>
                          ))}
                      </div>

                      {activeSlide.ctaText.trim() ? (
                        <span
                          className={`inline-block max-w-full rounded-xl font-bold whitespace-normal break-words ${
                            is45
                              ? 'px-2 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-[10px] leading-tight'
                              : 'px-2.5 py-1 text-[10px]'
                          }`}
                          style={{ backgroundColor: themeColor, color: contrastTextColor }}
                        >
                          {activeSlide.ctaText}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Layout 4: urgent_cta — Urgent Callout Card + WhatsApp CTA Pill */}
                  {layoutVariant === 'urgent_cta' ? (
                    <div
                      className={`rounded-2xl border-2 bg-slate-950/95 shadow-xl min-w-0 text-center ${
                        is45 ? 'p-2 sm:p-3.5 space-y-1.5 sm:space-y-2.5' : 'p-3.5 space-y-2.5'
                      }`}
                      style={{ borderColor: themeColor }}
                    >
                      <button
                        type="button"
                        onClick={() => headlineInputRef.current?.focus()}
                        title={
                          locale === 'ms'
                            ? 'Klik untuk sunting tajuk'
                            : 'Click to edit headline'
                        }
                        className="w-full text-center cursor-text rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 min-w-0 block"
                      >
                        <div
                          className={`font-extrabold text-white break-words [overflow-wrap:anywhere] ${
                            is45
                              ? 'text-sm sm:text-base leading-tight sm:leading-snug line-clamp-2 sm:line-clamp-none'
                              : 'text-base leading-snug'
                          }`}
                        >
                          {activeSlide.headline || '\u00A0'}
                        </div>
                        {activeSlide.subheadline.trim() ? (
                          <div
                            className={`font-semibold text-emerald-300 break-words [overflow-wrap:anywhere] ${
                              is45
                                ? 'mt-0.5 sm:mt-1 text-[11px] sm:text-xs leading-tight line-clamp-2 sm:line-clamp-none'
                                : 'mt-1 text-xs'
                            }`}
                          >
                            {activeSlide.subheadline}
                          </div>
                        ) : null}
                      </button>

                      {activeSlide.ctaText.trim() ? (
                        <div className={is45 ? 'pt-0.5 sm:pt-1 min-w-0' : 'pt-1 min-w-0'}>
                          <span
                            className={`inline-block w-full rounded-full border-2 bg-emerald-600 font-extrabold text-white whitespace-normal break-words [overflow-wrap:anywhere] ${
                              is45 ? 'px-2.5 sm:px-3 py-1 sm:py-2 text-[11px] sm:text-xs' : 'px-3 py-2 text-xs'
                            }`}
                            style={{ borderColor: themeColor }}
                          >
                            {activeSlide.ctaText}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {/* Preview-Only Safe-Zone Overlay (Unmounted when OFF) */}
                {showSafeZone ? (
                  <div
                    data-testid="safezone-overlay"
                    className="pointer-events-none absolute inset-0 z-20"
                  >
                    {safeZoneMode === '9:16' ? (
                      <>
                        <div className="absolute top-0 left-0 right-0 h-[14%] border-b border-dashed border-amber-400/90 bg-amber-500/20 flex items-end justify-center pb-1">
                          <span className="rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                            {locale === 'ms' ? 'Zon Atas Reels/TikTok (14%)' : 'Reels/TikTok Top UI (14%)'}
                          </span>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-[28%] border-t border-dashed border-amber-400/90 bg-amber-500/20 flex items-start justify-center pt-1.5">
                          <span className="rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                            {locale === 'ms'
                              ? 'Zon Kapsyen Bawah (28%)'
                              : 'Bottom Caption & CTA Rail (28%)'}
                          </span>
                        </div>
                        <div className="absolute top-[14%] bottom-[28%] right-0 w-[15%] border-l border-dashed border-rose-400/90 bg-rose-500/20 flex items-center justify-center">
                          <span className="-rotate-90 whitespace-nowrap text-[9px] font-semibold text-rose-200">
                            15%
                          </span>
                        </div>
                        <div className="absolute top-[14%] bottom-[28%] left-0 w-[5%] border-r border-dashed border-amber-400/70 bg-amber-500/10" />
                        <div className="absolute top-[14%] bottom-[28%] left-[5%] right-[15%] border border-dashed border-emerald-400/80 flex items-center justify-center">
                          <span className="rounded bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            {locale === 'ms' ? 'Zon Selamat 9:16' : '9:16 Safe Zone'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="absolute inset-[6%] border-2 border-dashed border-emerald-400/90 rounded-lg" />
                        <div className="absolute top-[10%] bottom-[10%] left-0 right-0 border-y border-dashed border-sky-400/90 flex items-start justify-end p-2">
                          <span className="rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-semibold text-sky-200">
                            {locale === 'ms' ? 'Panduan Potongan 1:1' : '1:1 Feed Crop Guide'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <p className="text-xs text-slate-400 flex items-start gap-1.5 min-w-0">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <span>{t('tab2.safeZoneNotice')}</span>
            </p>
          </div>

          {/* Right Column: Layer 1 & Layer 2 Live Controls + PNG Export */}
          <div className="lg:col-span-6 space-y-4 min-w-0">
            {/* Layer 1 Photo Switcher & Keyless AI Background */}
            <div className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                <div className="text-xs font-semibold text-slate-200">{t('tab2.layerBgLabel')}</div>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {locale === 'ms' ? 'Built-in AI Tanpa Kunci' : 'Built-In Keyless AI'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <button
                  type="button"
                  data-testid="carousel-ai-bg-btn"
                  disabled={isGeneratingBg}
                  onClick={() => {
                    void handleGenerateAiBackground();
                  }}
                  className="inline-flex flex-1 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-55 disabled:cursor-not-allowed transition cursor-pointer whitespace-normal break-words leading-snug text-center"
                >
                  {isGeneratingBg ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>
                    {isGeneratingBg
                      ? locale === 'ms'
                        ? 'Menjana Latar AI...'
                        : 'Generating AI Background...'
                      : locale === 'ms'
                        ? '✨ Jana Latar Belakang AI Baru'
                        : '✨ Generate New AI Background'}
                  </span>
                </button>

                {aiBgSrc ? (
                  <button
                    type="button"
                    data-testid="carousel-ai-bg-reset-btn"
                    onClick={() => {
                      setBgError(null);
                      updateSlide(activeSlide.id, {
                        aiBackgroundDataUrl: null,
                        editedByUser: true,
                      });
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-700 bg-[#111827] px-2.5 py-2 text-[11px] font-medium text-slate-300 hover:border-slate-500 hover:text-white transition cursor-pointer whitespace-normal break-words leading-tight"
                  >
                    <RotateCcw className="h-3 w-3 shrink-0" />
                    <span>{locale === 'ms' ? 'Reset ke Foto Produk' : 'Reset to Product Photo'}</span>
                  </button>
                ) : null}
              </div>

              {bgError ? (
                <p
                  role="status"
                  data-testid="carousel-ai-bg-error"
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200 break-words"
                >
                  {bgError}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-2.5 min-w-0">
                {launchedPhotos.map((photo, idx) => {
                  const photoIdx = idx === 0 ? 0 : 1;
                  const isActivePhoto = activeSlide.photoIndex === photoIdx && !aiBgSrc;
                  return (
                    <button
                      key={`${photo.id}-${photoIdx}`}
                      type="button"
                      data-testid={`carousel-photo-btn-${photoIdx}`}
                      aria-pressed={activeSlide.photoIndex === photoIdx}
                      onClick={() => {
                        setBgError(null);
                        updateSlide(activeSlide.id, {
                          photoIndex: photoIdx,
                          aiBackgroundDataUrl: null,
                          editedByUser: true,
                        });
                      }}
                      className={`flex items-center gap-2 rounded-lg border p-2 text-left transition cursor-pointer min-w-0 ${
                        isActivePhoto
                          ? 'border-sky-500 bg-sky-500/15 text-sky-100'
                          : 'border-slate-800 bg-[#111827] text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {photo.src.trim().length > 0 ? (
                        <img
                          src={photo.src}
                          alt={photo.label || (photoIdx === 0 ? t('form.photo1Label') : t('form.photo2Label'))}
                          className="h-10 w-10 rounded object-cover shrink-0 border border-slate-700"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-slate-900 border border-dashed border-slate-700 shrink-0 flex items-center justify-center text-[10px] text-slate-500">
                          —
                        </div>
                      )}
                      <span className="min-w-0 break-words [overflow-wrap:anywhere] whitespace-normal leading-tight text-xs font-medium">
                        {photo.label || (photoIdx === 0 ? t('form.photo1Label') : t('form.photo2Label'))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Layer 2 Text & Brand Controls */}
            <div className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 space-y-3.5 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                <span className="text-xs font-semibold text-slate-200">
                  {t('tab2.layerFgLabel')}
                </span>
                <span
                  data-testid="carousel-layer2-brand-pill"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-[#111827] px-2.5 py-1 text-[11px] text-slate-300 min-w-0 max-w-full"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: themeColor }}
                  />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere] whitespace-normal leading-tight">
                    {launchedBrand.name}
                  </span>
                </span>
              </div>

              <div className="space-y-1.5 min-w-0">
                <label
                  htmlFor="carousel-headline-input"
                  className="block text-xs font-medium text-slate-300"
                >
                  {t('tab2.headlineLabel')}
                </label>
                <input
                  id="carousel-headline-input"
                  ref={headlineInputRef}
                  data-testid="carousel-headline-input"
                  type="text"
                  value={activeSlide.headline}
                  onChange={(e) =>
                    updateSlide(activeSlide.id, {
                      headline: e.target.value,
                      editedByUser: true,
                    })
                  }
                  placeholder={
                    locale === 'ms' ? 'Masukkan tajuk slaid...' : 'Enter slide headline...'
                  }
                  className="w-full rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none min-w-0"
                />
              </div>

              <div className="space-y-1.5 min-w-0">
                <label
                  htmlFor="carousel-subheadline-input"
                  className="block text-xs font-medium text-slate-300"
                >
                  {t('tab2.subheadlineLabel')}
                </label>
                <textarea
                  id="carousel-subheadline-input"
                  data-testid="carousel-subheadline-input"
                  rows={2}
                  value={activeSlide.subheadline}
                  onChange={(e) =>
                    updateSlide(activeSlide.id, {
                      subheadline: e.target.value,
                      editedByUser: true,
                    })
                  }
                  placeholder={
                    locale === 'ms' ? 'Masukkan subtajuk slaid...' : 'Enter slide subheadline...'
                  }
                  className="w-full rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none min-w-0"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                <div className="space-y-1.5 min-w-0">
                  <label
                    htmlFor="carousel-badge-input"
                    className="block text-xs font-medium text-slate-300"
                  >
                    {locale === 'ms' ? 'Label Lencana Atas' : 'Top Badge Label'}
                  </label>
                  <input
                    id="carousel-badge-input"
                    data-testid="carousel-badge-input"
                    type="text"
                    value={activeSlide.badgeText}
                    onChange={(e) =>
                      updateSlide(activeSlide.id, {
                        badgeText: e.target.value,
                        editedByUser: true,
                      })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none min-w-0"
                  />
                </div>

                <div className="space-y-1.5 min-w-0">
                  <label
                    htmlFor="carousel-cta-input"
                    className="block text-xs font-medium text-slate-300"
                  >
                    {t('tab2.ctaLabel')}
                  </label>
                  <input
                    id="carousel-cta-input"
                    data-testid="carousel-cta-input"
                    type="text"
                    value={activeSlide.ctaText}
                    onChange={(e) =>
                      updateSlide(activeSlide.id, {
                        ctaText: e.target.value,
                        editedByUser: true,
                      })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none min-w-0"
                  />
                </div>
              </div>
            </div>

            {exportError ? (
              <div
                role="alert"
                className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
              >
                {exportError}
              </div>
            ) : null}

            <button
              type="button"
              data-testid="carousel-download-btn"
              disabled={isExporting}
              onClick={handleDownloadPng}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>{isExporting ? t('tab2.downloadingBtn') : t('tab2.downloadPngBtn')}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
