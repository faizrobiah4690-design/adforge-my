import {
  AlertCircle,
  Cpu,
  Download,
  Loader2,
  Music,
  RotateCcw,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useCampaign } from '../../state/CampaignContext';
import { useWorkbench } from '../../state/WorkbenchContext';
import type { JingleStyleId, MusicEngineId } from '../../types/campaign';
import { buildJingleLyrics } from '../../utils/audioExport';
import { hasLiveApiAccess } from '../../utils/interactionsApi';

interface EngineOption {
  id: MusicEngineId;
  testId: string;
  labelKey: string;
  descKey: string;
  tag: string;
  requiresLiveApi: boolean;
}

const ENGINE_OPTIONS: EngineOption[] = [
  {
    id: 'lyria-3-clip-preview',
    testId: 'jingle-engine-lyria-3-clip-preview',
    labelKey: 'tab3.engineLyriaClip',
    descKey: 'tab3.engineLyriaClipDesc',
    tag: 'API',
    requiresLiveApi: true,
  },
  {
    id: 'lyria-3.5',
    testId: 'jingle-engine-lyria-3-5',
    labelKey: 'tab3.engineLyria35',
    descKey: 'tab3.engineLyria35Desc',
    tag: 'API',
    requiresLiveApi: true,
  },
  {
    id: 'local',
    testId: 'jingle-engine-local',
    labelKey: 'tab3.engineLocal',
    descKey: 'tab3.engineLocalDesc',
    tag: 'RM0',
    requiresLiveApi: false,
  },
];

interface StyleOption {
  id: JingleStyleId;
  labelKey: string;
  bpm: number;
  descMs: string;
  descEn: string;
}

const STYLE_OPTIONS: StyleOption[] = [
  {
    id: 'pop-ceria',
    labelKey: 'tab3.stylePopCeria',
    bpm: 124,
    descMs: 'Arpeggio rancak & rentak ceria mesra media sosial',
    descEn: 'Upbeat arpeggio & cheerful social-ready groove',
  },
  {
    id: 'santai-akustik',
    labelKey: 'tab3.styleSantaiAkustik',
    bpm: 90,
    descMs: 'Petikan akustik lembut & suasana mesra pelanggan',
    descEn: 'Warm acoustic plucks & relaxed welcoming mood',
  },
  {
    id: 'korporat-segar',
    labelKey: 'tab3.styleKorporatSegar',
    bpm: 108,
    descMs: 'Melodi marimba moden, kemas & profesional',
    descEn: 'Crisp modern marimba, clean & trustworthy pulse',
  },
];

function slugifyFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'jingle'
  );
}

export function JingleTab() {
  const { locale, t } = useI18n();
  const { byokKey, isDemoMode } = useWorkbench();
  const {
    launchedBrand,
    launchedOfferSentence,
    jingle,
    setJingle,
    isGeneratingJingle,
    jingleError,
    clearJingleError,
    generateJingle,
  } = useCampaign();

  const liveApiReady = hasLiveApiAccess(isDemoMode, byokKey);
  const activeEngine: MusicEngineId = liveApiReady
    ? (jingle.engine ?? 'lyria-3-clip-preview')
    : 'local';
  const isGenerating = isGeneratingJingle;
  const errorState = jingleError;

  const errorMessage =
    errorState === null
      ? null
      : errorState.code === 'empty_lyrics'
        ? locale === 'ms'
          ? 'Sila masukkan lirik korus jingle sebelum menjana audio.'
          : 'Please enter jingle chorus lyrics before generating audio.'
        : locale === 'ms'
          ? `Gagal mensintesis audio jingle${errorState.detail ? `: ${errorState.detail}` : '.'}`
          : `Failed to synthesize jingle audio${errorState.detail ? `: ${errorState.detail}` : '.'}`;

  const handleEngineSelect = (engineId: MusicEngineId) => {
    if (isGenerating) return;
    if (engineId !== 'local' && !liveApiReady) return;
    clearJingleError();
    setJingle((prev) => ({
      ...prev,
      engine: engineId,
      engineEditedByUser: true,
    }));
  };

  const handleStyleSelect = (styleId: JingleStyleId) => {
    if (isGenerating) return;
    clearJingleError();
    setJingle((prev) => ({
      ...prev,
      style: styleId,
    }));
  };

  const handleLyricsChange = (nextLyrics: string) => {
    if (nextLyrics.trim().length > 0 && errorState) {
      clearJingleError();
    }
    setJingle((prev) => ({
      ...prev,
      lyrics: nextLyrics,
      lyricsEditedByUser: true,
    }));
  };

  const handleResetLyrics = () => {
    clearJingleError();
    const baseline = buildJingleLyrics(launchedBrand.name, launchedOfferSentence);
    setJingle((prev) => ({
      ...prev,
      lyrics: baseline,
      lyricsEditedByUser: false,
    }));
  };

  const handleGenerateJingle = async () => {
    await generateJingle();
  };

  const displayedStyle = jingle.generatedStyle ?? jingle.style;
  const activeAudioExt = jingle.audioExtension ?? 'wav';
  const audioFormatTag =
    activeAudioExt === 'wav'
      ? `${(jingle.sampleRate / 1000).toFixed(0)}kHz WAV`
      : activeAudioExt.toUpperCase();
  const hasStaleStyle =
    jingle.source === 'tab3-generated' &&
    jingle.wavBlob !== null &&
    Boolean(jingle.generatedStyle) &&
    jingle.generatedStyle !== jingle.style;

  const engineStatusVariant =
    jingle.generationSource === 'lyria-api'
      ? 'live'
      : jingle.generationSource === 'local-fallback'
        ? 'fallback'
        : 'local';

  const engineStatusText =
    engineStatusVariant === 'live'
      ? t('tab3.statusLiveLyria')
      : engineStatusVariant === 'fallback'
        ? t('tab3.statusLocalFallback')
        : t('tab3.statusLocalSelected');

  const handleDownloadAudio = () => {
    if (!jingle.wavBlob) return;
    const tempUrl = URL.createObjectURL(jingle.wavBlob);
    const link = document.createElement('a');
    link.href = tempUrl;
    link.download = `jingle-${slugifyFilename(launchedBrand.name)}-${displayedStyle}.${activeAudioExt}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => {
      URL.revokeObjectURL(tempUrl);
    }, 10_000);
  };

  return (
    <div
      data-testid="jingle-tab"
      role="tabpanel"
      className="rounded-2xl border border-slate-800 bg-[#111827] p-4 sm:p-6 space-y-5 min-w-0"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 min-w-0">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Music className="h-5 w-5 text-sky-400 shrink-0" />
            <h3 className="text-base sm:text-lg font-semibold text-slate-100 break-words">
              {t('tab3.title')}
            </h3>
          </div>
          <p className="text-xs text-slate-400 break-words">{t('tab3.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
          <span className="inline-flex items-center rounded-xl border border-slate-700 bg-[#0B0F19] px-2.5 py-1 text-xs text-slate-300 max-w-full min-w-0">
            <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere] leading-snug">
              {t('tab3.durationBadge')}
            </span>
          </span>
          <span
            className={`inline-flex items-center rounded-xl border px-2.5 py-1 text-xs font-medium max-w-full min-w-0 ${
              jingle.source === 'tab3-generated' && jingle.wavBlob
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700 bg-[#0B0F19] text-slate-400'
            }`}
          >
            <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere] leading-snug">
              {jingle.source === 'tab3-generated' && jingle.wavBlob
                ? locale === 'ms'
                  ? 'Jingle Tersuai Aktif'
                  : 'Custom Jingle Ready'
                : locale === 'ms'
                  ? 'Belum Dijana (Sandaran Sedia)'
                  : 'Not Generated (Fallback Ready)'}
            </span>
          </span>
          <span
            data-testid="jingle-engine-status-badge"
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium max-w-full min-w-0 ${
              engineStatusVariant === 'live'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : engineStatusVariant === 'fallback'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                  : 'border-slate-700 bg-[#0B0F19] text-slate-300'
            }`}
          >
            <Cpu className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 whitespace-normal break-words [overflow-wrap:anywhere] leading-snug">
              {engineStatusText}
            </span>
          </span>
        </div>
      </div>

      {/* Active Brand & Offer Context Pill */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-[#0B0F19] px-3 py-2.5 text-xs text-slate-300 min-w-0">
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: launchedBrand.themeColor }}
        />
        <span className="font-semibold text-slate-100 break-words [overflow-wrap:anywhere] max-w-full min-w-0">
          {launchedBrand.name}
        </span>
        <span className="text-slate-600">•</span>
        <span className="text-slate-400 break-words [overflow-wrap:anywhere] max-w-full min-w-0">
          {launchedOfferSentence}
        </span>
      </div>

      {/* AI Music Engine Selector */}
      <div data-testid="jingle-engine-selector" className="space-y-2 min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-300 break-words">
          {t('tab3.engineLabel')}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 min-w-0">
          {ENGINE_OPTIONS.map((opt) => {
            const isSelected = activeEngine === opt.id;
            const isDisabled = isGenerating || (opt.requiresLiveApi && !liveApiReady);
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={opt.testId}
                data-model={opt.id}
                aria-pressed={isSelected}
                data-active={isSelected ? 'true' : 'false'}
                disabled={isDisabled}
                onClick={() => handleEngineSelect(opt.id)}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed min-w-0 max-w-full ${
                  isSelected
                    ? 'border-sky-500 bg-sky-500/15 text-sky-100 ring-1 ring-sky-500/40'
                    : 'border-slate-800 bg-[#0B0F19] text-slate-300 hover:border-slate-700 hover:text-slate-100'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5 w-full min-w-0">
                  <span className="min-w-0 flex-1 text-xs sm:text-sm font-semibold whitespace-normal break-words [overflow-wrap:anywhere] leading-snug text-left">
                    {t(opt.labelKey)}
                    {opt.requiresLiveApi ? (
                      <span
                        aria-hidden="true"
                        className="ml-1 font-mono text-[11px] font-normal text-slate-400"
                      >
                        ({opt.id})
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono shrink-0 max-w-full whitespace-normal ${
                      isSelected
                        ? 'bg-sky-500/30 text-sky-200'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {opt.tag}
                  </span>
                </div>
                <span className="w-full min-w-0 text-[11px] text-slate-400 leading-snug whitespace-normal break-words [overflow-wrap:anywhere]">
                  {t(opt.descKey)}
                </span>
              </button>
            );
          })}
        </div>
        {!liveApiReady ? (
          <p
            data-testid="jingle-engine-demo-note"
            className="text-[11px] text-amber-200/90 break-words [overflow-wrap:anywhere] leading-snug"
          >
            {t('tab3.engineDemoNote')}
          </p>
        ) : null}
      </div>

      {/* Music Style Selector */}
      <div className="space-y-2 min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          {t('tab3.styleLabel')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 min-w-0">
          {STYLE_OPTIONS.map((opt) => {
            const isSelected = jingle.style === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`jingle-style-${opt.id}`}
                aria-pressed={isSelected}
                data-active={isSelected ? 'true' : 'false'}
                disabled={isGenerating}
                onClick={() => handleStyleSelect(opt.id)}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed min-w-0 ${
                  isSelected
                    ? 'border-sky-500 bg-sky-500/15 text-sky-100 ring-1 ring-sky-500/40'
                    : 'border-slate-800 bg-[#0B0F19] text-slate-300 hover:border-slate-700 hover:text-slate-100'
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2 min-w-0">
                  <span className="text-sm font-semibold break-words leading-tight text-left">
                    {t(opt.labelKey)}
                  </span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono shrink-0 ${
                      isSelected
                        ? 'bg-sky-500/30 text-sky-200'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {opt.bpm} BPM
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 leading-snug break-words">
                  {locale === 'ms' ? opt.descMs : opt.descEn}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lyrics Editor */}
      <div className="space-y-2 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <label
            htmlFor="jingle-lyrics-textarea"
            className="text-xs font-semibold uppercase tracking-wide text-slate-300"
          >
            {t('tab3.lyricsLabel')}
          </label>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {jingle.lyricsEditedByUser ? (
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
                {locale === 'ms' ? 'Lirik Disunting Pengguna' : 'User-Edited Lyrics'}
              </span>
            ) : null}
            <button
              type="button"
              data-testid="jingle-reset-lyrics-btn"
              onClick={handleResetLyrics}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B0F19] px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100 transition cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
              <span>{t('tab3.resetLyricsBtn')}</span>
            </button>
          </div>
        </div>

        <textarea
          id="jingle-lyrics-textarea"
          data-testid="jingle-lyrics-input"
          rows={4}
          value={jingle.lyrics}
          onChange={(e) => handleLyricsChange(e.target.value)}
          placeholder={
            locale === 'ms'
              ? 'Tulis lirik korus jingle Bahasa Melayu...'
              : 'Write your Bahasa Melayu jingle chorus lyrics...'
          }
          className="w-full max-w-full min-w-0 rounded-xl border border-slate-800 bg-[#0B0F19] p-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 break-words"
        />
      </div>

      {/* Error Alert */}
      {errorMessage ? (
        <div
          data-testid="jingle-error"
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200 min-w-0"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
          <span className="break-words min-w-0">{errorMessage}</span>
        </div>
      ) : null}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <button
          type="button"
          data-testid="jingle-generate-btn"
          disabled={isGenerating}
          onClick={() => {
            void handleGenerateJingle();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed transition cursor-pointer"
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          ) : (
            <Sparkles className="h-4 w-4 shrink-0" />
          )}
          <span>{isGenerating ? t('tab3.generatingBtn') : t('tab3.generateBtn')}</span>
        </button>

        <button
          type="button"
          data-testid="jingle-download-btn"
          disabled={!jingle.wavBlob || isGenerating}
          onClick={handleDownloadAudio}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#0B0F19] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-sky-500 hover:text-sky-200 disabled:opacity-45 disabled:cursor-not-allowed transition cursor-pointer max-w-full min-w-0"
        >
          <Download className="h-4 w-4 shrink-0" />
          <span className="whitespace-normal break-words [overflow-wrap:anywhere] leading-snug">
            {t('tab3.downloadAudioBtn')} (.{activeAudioExt})
          </span>
        </button>
      </div>

      {/* Audio Preview Player — mounted ONLY after jingle.previewUrl is generated */}
      {jingle.previewUrl ? (
        <div className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 space-y-2.5 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 min-w-0">
              <Volume2 className="h-4 w-4 text-sky-400 shrink-0" />
              <span className="break-words">{t('tab3.previewLabel')}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {hasStaleStyle ? (
                <span
                  data-testid="jingle-stale-style-notice"
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200"
                >
                  {locale === 'ms'
                    ? 'Gaya ditukar — jana semula untuk kemas kini'
                    : 'Style changed — regenerate to update'}
                </span>
              ) : null}
              <span className="text-[11px] font-mono text-slate-400 break-words [overflow-wrap:anywhere]">
                {displayedStyle} • {jingle.durationSec.toFixed(1)}s • {audioFormatTag}
              </span>
            </div>
          </div>
          <audio
            data-testid="jingle-audio-player"
            controls
            preload="auto"
            src={jingle.previewUrl}
            className="w-full max-w-full"
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-800 bg-[#0B0F19]/60 px-4 py-3 text-xs text-slate-400">
          {locale === 'ms'
            ? 'Klik "Jana Pratonton Jingle" untuk mensintesis audio WAV 48kHz (5.5s) dan mengaktifkan pemain serta muat turun.'
            : 'Click "Generate Jingle Preview" to synthesize 48kHz WAV audio (5.5s) and unlock playback and download.'}
        </div>
      )}
    </div>
  );
}
