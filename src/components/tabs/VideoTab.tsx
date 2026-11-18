import {
  AlertCircle,
  CheckSquare,
  Download,
  Film,
  Loader2,
  Music,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useCampaign } from '../../state/CampaignContext';
import {
  TOTAL_VIDEO_DURATION_SEC,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from '../../utils/videoExport';

function slugifyFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'video-ad'
  );
}

export function VideoTab() {
  const { locale, t } = useI18n();
  const {
    launchedBrand,
    launchedPhotos,
    jingle,
    video,
    setVideo,
    generateVideo,
  } = useCampaign();

  const hasTab3Jingle = jingle.source === 'tab3-generated' && jingle.wavBlob !== null;
  const usingTab3Audio =
    video.status === 'ready' && video.audioSourceUsed !== null
      ? video.audioSourceUsed === 'tab3-jingle'
      : hasTab3Jingle;
  const hasPendingTab3Update =
    video.status === 'ready' &&
    hasTab3Jingle &&
    (video.audioSourceUsed === 'fallback-preseeded' ||
      (video.audioSourceUsed === 'tab3-jingle' &&
        (jingle.version ?? 0) !== (video.jingleVersionUsed ?? 0)));

  const handleFrameFieldChange = (
    frameIndex: number,
    field: 'overlayHeadline' | 'lyricLine',
    value: string
  ) => {
    if (video.status === 'rendering') {
      return;
    }
    setVideo((prev) => {
      if (prev.status === 'rendering') {
        return prev;
      }
      if (
        (prev.status === 'ready' || prev.status === 'error') &&
        prev.videoUrl &&
        prev.videoUrl.startsWith('blob:')
      ) {
        URL.revokeObjectURL(prev.videoUrl);
      }
      const nextStatus =
        prev.status === 'error' || prev.status === 'ready'
          ? 'awaiting-confirmation'
          : prev.status;
      return {
        ...prev,
        isStoryboardConfirmed: false,
        status: nextStatus,
        ...(prev.status === 'ready' || prev.status === 'error'
          ? {
              videoBlob: null,
              videoUrl: null,
              mimeType: null,
              fileExtension: null,
              durationSec: null,
              audioSourceUsed: null,
              jingleVersionUsed: null,
            }
          : {}),
        errorMessage: null,
        errorDetail: null,
        storyboardFrames: prev.storyboardFrames.map((frame, idx) =>
          idx === frameIndex ? { ...frame, [field]: value, editedByUser: true } : frame
        ),
      };
    });
  };

  const handleConfirmToggle = (checked: boolean) => {
    setVideo((prev) => ({
      ...prev,
      isStoryboardConfirmed: checked,
    }));
  };

  const handleGenerateVideo = async () => {
    await generateVideo();
  };

  const handleDownloadVideo = () => {
    if (!video.isStoryboardConfirmed || !video.videoBlob || video.status !== 'ready') {
      return;
    }
    const ext = video.fileExtension ?? 'webm';
    const tempUrl = URL.createObjectURL(video.videoBlob);
    const link = document.createElement('a');
    link.href = tempUrl;
    link.download = `video-9x16-${slugifyFilename(launchedBrand.name)}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => {
      URL.revokeObjectURL(tempUrl);
    }, 10_000);
  };

  const isRendering = video.status === 'rendering';
  const canGenerate = video.isStoryboardConfirmed && !isRendering;
  const canDownload =
    video.isStoryboardConfirmed && video.status === 'ready' && video.videoBlob !== null;

  const localizedRenderError =
    video.status === 'error' && (video.errorDetail !== undefined || video.errorMessage)
      ? (() => {
          const detail = video.errorDetail ?? video.errorMessage ?? '';
          return locale === 'ms'
            ? `Gagal merender video menegak${detail ? `: ${detail}` : '.'}`
            : `Failed to render vertical video${detail ? `: ${detail}` : '.'}`;
        })()
      : null;

  return (
    <div
      data-testid="video-tab"
      role="tabpanel"
      className="rounded-2xl border border-slate-800 bg-[#111827] p-4 sm:p-6 space-y-5 min-w-0"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 min-w-0">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Film className="h-5 w-5 text-sky-400 shrink-0" />
            <h3 className="text-base sm:text-lg font-semibold text-slate-100 break-words [overflow-wrap:anywhere]">
              {t('tab4.title')}
            </h3>
          </div>
          <p className="text-xs text-slate-400 break-words [overflow-wrap:anywhere]">
            {t('tab4.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="rounded-full border border-slate-700 bg-[#0B0F19] px-2.5 py-1 text-xs text-slate-300">
            {t('tab4.durationCapBadge')}
          </span>
          <span
            data-testid="video-audio-source-badge"
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium max-w-full ${
              usingTab3Audio
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
            }`}
          >
            <Music className="h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-normal break-words leading-snug">
              {t('tab4.audioSourceLabel')}:{' '}
              {usingTab3Audio
                ? t('tab4.audioSourceTab3')
                : t('tab4.audioSourceFallback')}
            </span>
          </span>
          {hasPendingTab3Update ? (
            <span
              data-testid="video-pending-tab3-notice"
              className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-200"
            >
              {locale === 'ms'
                ? 'Jingle Tab 3 baharu sedia — jana semula video untuk gunakan'
                : 'New Tab 3 jingle ready — re-render video to apply'}
            </span>
          ) : null}
        </div>
      </div>

      {/* Storyboard Section */}
      <div className="space-y-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
            {t('tab4.storyboardTitle')}
          </h4>
          <span className="text-[11px] text-slate-400">
            {locale === 'ms'
              ? 'Sunting mana-mana bingkai akan menetapkan semula pengesahan.'
              : 'Editing any frame resets storyboard confirmation.'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 min-w-0">
          {video.storyboardFrames.map((frame, idx) => {
            const idx1 = idx + 1;
            const photo = launchedPhotos[frame.photoIndex] ?? launchedPhotos[0];
            return (
              <div
                key={frame.id}
                data-testid={`video-storyboard-frame-${idx1}`}
                className="rounded-xl border border-slate-800 bg-[#0B0F19] p-3 space-y-2.5 min-w-0 flex flex-col"
              >
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-[11px] font-semibold text-sky-400">
                    #{idx1} ({frame.startSec.toFixed(2)}s–{frame.endSec.toFixed(2)}s)
                  </span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 shrink-0">
                    {locale === 'ms'
                      ? `Foto ${frame.photoIndex + 1}`
                      : `Photo ${frame.photoIndex + 1}`}
                  </span>
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                  {photo?.src?.trim() ? (
                    <img
                      src={photo.src}
                      alt={photo.label || `Foto ${frame.photoIndex + 1}`}
                      className="w-full aspect-video object-cover block"
                    />
                  ) : (
                    <div className="flex w-full aspect-video items-center justify-center bg-slate-900 text-[11px] text-slate-500">
                      {locale === 'ms' ? 'Tiada foto' : 'No photo'}
                    </div>
                  )}
                </div>

                <div className="space-y-1 min-w-0">
                  <label
                    htmlFor={`video-frame-headline-${idx1}`}
                    className="block text-[11px] font-medium text-slate-400"
                  >
                    {locale === 'ms' ? 'Tajuk Overlay' : 'Overlay Headline'}
                  </label>
                  <input
                    id={`video-frame-headline-${idx1}`}
                    type="text"
                    data-testid={`video-frame-input-${idx1}`}
                    disabled={isRendering}
                    value={frame.overlayHeadline}
                    onChange={(e) =>
                      handleFrameFieldChange(idx, 'overlayHeadline', e.target.value)
                    }
                    className="w-full max-w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1 min-w-0">
                  <label
                    htmlFor={`video-frame-lyric-${idx1}`}
                    className="block text-[11px] font-medium text-slate-400"
                  >
                    {locale === 'ms' ? 'Sari Kata / Lirik' : 'Caption / Lyric'}
                  </label>
                  <textarea
                    id={`video-frame-lyric-${idx1}`}
                    rows={2}
                    disabled={isRendering}
                    value={frame.lyricLine}
                    onChange={(e) =>
                      handleFrameFieldChange(idx, 'lyricLine', e.target.value)
                    }
                    className="w-full max-w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-2.5 py-1.5 text-[11px] text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirmation Gate */}
      <div className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 space-y-3 min-w-0">
        <label className="flex items-start gap-3 cursor-pointer min-w-0">
          <input
            type="checkbox"
            data-testid="video-confirm-checkbox"
            checked={video.isStoryboardConfirmed}
            disabled={isRendering}
            onChange={(e) => handleConfirmToggle(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500 shrink-0 cursor-pointer"
          />
          <span className="text-xs sm:text-sm font-medium text-slate-100 flex items-center gap-1.5 break-words min-w-0">
            <CheckSquare className="h-4 w-4 text-sky-400 shrink-0 hidden sm:inline" />
            <span>{t('tab4.confirmCheckbox')}</span>
          </span>
        </label>

        {!video.isStoryboardConfirmed ? (
          <div
            data-testid="video-gate-warning"
            className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 min-w-0"
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <span className="break-words min-w-0">{t('tab4.confirmGateNotice')}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-1 min-w-0">
          <button
            type="button"
            data-testid="video-generate-btn"
            disabled={!canGenerate}
            onClick={() => {
              void handleGenerateVideo();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-45 disabled:cursor-not-allowed transition cursor-pointer"
          >
            {isRendering ? (
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            ) : (
              <Sparkles className="h-4 w-4 shrink-0" />
            )}
            <span>
              {isRendering ? t('tab4.generatingBtn') : t('tab4.generateVideoBtn')}
            </span>
          </button>

          <button
            type="button"
            data-testid="video-download-btn"
            disabled={!canDownload}
            onClick={handleDownloadVideo}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#111827] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-sky-500 hover:text-sky-200 disabled:opacity-45 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>{t('tab4.downloadVideoBtn')}</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {localizedRenderError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200 min-w-0"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <span className="break-words min-w-0">{localizedRenderError}</span>
          </div>
          <button
            type="button"
            disabled={!video.isStoryboardConfirmed}
            onClick={() => {
              void handleGenerateVideo();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/50 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/30 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 shrink-0" />
            <span>{t('tab4.errorRetryBtn')}</span>
          </button>
        </div>
      ) : null}

      {/* 9:16 Video Preview — ONLY mounted when confirmed and ready */}
      {video.status === 'ready' && video.isStoryboardConfirmed && video.videoUrl ? (
        <div className="rounded-xl border border-slate-800 bg-[#0B0F19] p-4 space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-200">
              {t('tab4.previewTitle')}
            </h4>
            <span className="text-[11px] font-mono text-slate-400">
              {video.width || VIDEO_WIDTH}×{video.height || VIDEO_HEIGHT} (9:16) •{' '}
              {(video.durationSec ?? TOTAL_VIDEO_DURATION_SEC).toFixed(1)}s •{' '}
              {(video.fileExtension ?? 'webm').toUpperCase()}
            </span>
          </div>

          <div className="flex justify-center min-w-0">
            <video
              data-testid="video-preview-player"
              controls
              playsInline
              src={video.videoUrl}
              className="w-full max-w-[300px] aspect-[9/16] rounded-xl border border-slate-800 bg-black"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
