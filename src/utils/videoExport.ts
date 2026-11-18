import { ArrayBufferTarget, Muxer } from 'webm-muxer';
import type { BrandProfile, PhotoAsset, StoryboardFrame } from '../types/campaign';
import { getContrastTextColor, isAllowedImageSrc } from './carouselExport';
import { extractOfferDetails } from './offerDetails';

export const VIDEO_WIDTH = 540;
export const VIDEO_HEIGHT = 960;
export const VIDEO_FPS = 30;
export const TOTAL_VIDEO_DURATION_SEC = 5.5;

const TARGET_AUDIO_SAMPLE_RATE = 48000;
const OPUS_FRAME_SAMPLES = 960;

export interface ExportVideoInput {
  frames: readonly StoryboardFrame[];
  photos: [PhotoAsset, PhotoAsset];
  brand: BrandProfile;
  audioBuffer: AudioBuffer;
  durationSec?: number;
  offerSentence?: string;
  uspAndAudience?: string;
}

export interface ExportVideoResult {
  blob: Blob;
  mimeType: string;
  fileExtension: 'webm' | 'mp4';
  durationSec: number;
  width: number;
  height: number;
}

export interface CoverCropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface NormalizedStereoAudio {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  numberOfFrames: number;
}

const MEDIARECORDER_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const;

export function selectMediaRecorderMimeType(
  isTypeSupported: (mime: string) => boolean
): string {
  for (const candidate of MEDIARECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore probe error and test next candidate
    }
  }
  return '';
}

export function getActiveStoryboardFrame(
  frames: readonly StoryboardFrame[],
  tSec: number
): StoryboardFrame {
  if (frames.length === 0) {
    return {
      id: 'frame-fallback',
      index: 0,
      startSec: 0,
      endSec: TOTAL_VIDEO_DURATION_SEC,
      photoIndex: 0,
      overlayHeadline: '',
      lyricLine: '',
    };
  }

  if (tSec <= frames[0].startSec) {
    return frames[0];
  }

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    if (tSec >= frame.startSec && tSec < frame.endSec) {
      return frame;
    }
  }

  return frames[frames.length - 1];
}

export function computeCoverCropRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): CoverCropRect {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(1, srcW), sh: Math.max(1, srcH) };
  }

  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;

  if (srcRatio > dstRatio) {
    // Source is wider than target: crop horizontally
    const sw = srcH * dstRatio;
    const sx = (srcW - sw) / 2;
    return { sx, sy: 0, sw, sh: srcH };
  }

  // Source is taller or equal: crop vertically
  const sh = srcW / dstRatio;
  const sy = (srcH - sh) / 2;
  return { sx: 0, sy, sw: srcW, sh };
}

export function computeContainRect(
  srcW: number,
  srcH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
): { dx: number; dy: number; dWidth: number; dHeight: number } {
  if (!Number.isFinite(srcW) || !Number.isFinite(srcH) || srcW <= 0 || srcH <= 0 || boxW <= 0 || boxH <= 0) {
    return { dx: boxX, dy: boxY, dWidth: boxW, dHeight: boxH };
  }
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const dWidth = srcW * scale;
  const dHeight = srcH * scale;
  const dx = boxX + (boxW - dWidth) / 2;
  const dy = boxY + (boxH - dHeight) / 2;
  return { dx, dy, dWidth, dHeight };
}

export function wrapTextLines(
  measureWidth: (text: string) => number,
  text: string,
  maxWidth: number,
  maxLines = 4
): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned || !Number.isFinite(maxWidth) || maxWidth <= 0) return [];
  if (maxLines !== undefined && maxLines <= 0) return [];

  const words = cleaned.split(' ');
  const lines: string[] = [];
  let current = '';

  const pushWrappedToken = (token: string) => {
    let chunk = '';
    for (const char of Array.from(token)) {
      if (measureWidth(char) > maxWidth) {
        if (chunk.length > 0) {
          lines.push(chunk);
          chunk = '';
        }
        continue;
      }
      const candidate = chunk + char;
      if (chunk.length > 0 && measureWidth(candidate) > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk = candidate;
      }
    }
    current = chunk;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureWidth(candidate) <= maxWidth) {
      current = candidate;
    } else if (!current) {
      pushWrappedToken(word);
    } else {
      lines.push(current);
      if (measureWidth(word) <= maxWidth) {
        current = word;
      } else {
        current = '';
        pushWrappedToken(word);
      }
    }
  }

  if (current) {
    lines.push(current);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const truncated = lines.slice(0, maxLines);
  const ellipsis = '...';
  const chars = Array.from(truncated[maxLines - 1] ?? '');

  while (chars.length > 0 && /\s/.test(chars[chars.length - 1] ?? '')) {
    chars.pop();
  }
  while (chars.length > 0 && measureWidth(`${chars.join('')}${ellipsis}`) > maxWidth) {
    chars.pop();
    while (chars.length > 0 && /\s/.test(chars[chars.length - 1] ?? '')) {
      chars.pop();
    }
  }

  const last = chars.join('');
  if (last.length > 0) {
    truncated[maxLines - 1] = `${last}${ellipsis}`;
  } else if (measureWidth(ellipsis) <= maxWidth) {
    truncated[maxLines - 1] = ellipsis;
  } else if (measureWidth('.') <= maxWidth) {
    truncated[maxLines - 1] = '.';
  } else {
    truncated.pop();
  }
  return truncated;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const DEFAULT_THEME_COLOR = '#0EA5E9';

export function resolveThemeColor(color: string | undefined | null): string {
  const cleaned = (color ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
    return cleaned;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(cleaned)) {
    const [, r, g, b] = cleaned;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return DEFAULT_THEME_COLOR;
}

function hexToRgba(hex: string, alpha: number): string {
  const resolved = resolveThemeColor(hex);
  const clean = resolved.slice(1);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function easeOutCubic(t: number): number {
  const clamped = clamp01(t);
  return 1 - (1 - clamped) ** 3;
}

function drawImageCoverZoom(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dstX: number,
  dstY: number,
  dstW: number,
  dstH: number,
  zoom: number,
  panXNorm = 0,
  panYNorm = 0
): void {
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  if (naturalW <= 0 || naturalH <= 0) return;

  const crop = computeCoverCropRect(naturalW, naturalH, dstW, dstH);
  const safeZoom = Math.max(1, zoom);
  const zoomedW = crop.sw / safeZoom;
  const zoomedH = crop.sh / safeZoom;
  const maxOffsetX = Math.max(0, (crop.sw - zoomedW) / 2);
  const maxOffsetY = Math.max(0, (crop.sh - zoomedH) / 2);
  const zoomedX = crop.sx + maxOffsetX * (1 + Math.max(-1, Math.min(1, panXNorm)));
  const zoomedY = crop.sy + maxOffsetY * (1 + Math.max(-1, Math.min(1, panYNorm)));

  ctx.drawImage(img, zoomedX, zoomedY, zoomedW, zoomedH, dstX, dstY, dstW, dstH);
}

interface LoadedAssets {
  photos: [HTMLImageElement | null, HTMLImageElement | null];
  logo: HTMLImageElement | null;
}

interface CachedFrameLayout {
  headlineLines: string[];
  lyricLines: string[];
  cardH: number;
  cardY: number;
}

interface StoryboardRenderCache {
  baseGrad: CanvasGradient;
  topScrim: CanvasGradient;
  bottomScrim: CanvasGradient;
  brandLine: string;
  promoBadgeText: string;
  whatsappPillText: string;
  frameLayouts: Map<string, CachedFrameLayout>;
}

function createStoryboardRenderCache(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frames: readonly StoryboardFrame[],
  brand: BrandProfile,
  offerSentence?: string,
  uspAndAudience?: string
): StoryboardRenderCache {
  const baseGrad = ctx.createLinearGradient(0, 0, 0, height);
  baseGrad.addColorStop(0, '#0B0F19');
  baseGrad.addColorStop(0.55, hexToRgba(brand.themeColor, 0.24));
  baseGrad.addColorStop(1, '#090D16');

  const topScrim = ctx.createLinearGradient(0, 0, 0, 230);
  topScrim.addColorStop(0, 'rgba(11, 15, 25, 0.88)');
  topScrim.addColorStop(1, 'rgba(11, 15, 25, 0)');

  const bottomScrim = ctx.createLinearGradient(0, 440, 0, height);
  bottomScrim.addColorStop(0, 'rgba(11, 15, 25, 0)');
  bottomScrim.addColorStop(0.42, 'rgba(11, 15, 25, 0.84)');
  bottomScrim.addColorStop(1, 'rgba(11, 15, 25, 0.96)');

  const pillW = width - 56;
  ctx.font = '700 19px system-ui, -apple-system, sans-serif';
  const brandLines = wrapTextLines(
    (s) => ctx.measureText(s).width,
    brand.name,
    pillW - 150,
    1
  );
  const brandLine = brandLines[0] ?? brand.name;

  const details = extractOfferDetails(
    brand.name,
    offerSentence || frames[2]?.overlayHeadline || '',
    uspAndAudience
  );
  const promoBadgeText = details.discountPercent
    ? `DISKAUN ${details.discountPercent}`
    : details.priceTag
      ? `HANYA ${details.priceTag}`
      : details.occasion
        ? details.occasion.toUpperCase()
        : 'PROMO KHAS';
  const whatsappPillText = `WhatsApp +${brand.whatsappNumber}`;

  const cardW = width - 56;
  const textPadX = 20;
  const maxTextW = cardW - textPadX * 2;
  const frameLayouts = new Map<string, CachedFrameLayout>();

  const layoutFrame = (frame: StoryboardFrame) => {
    if (frameLayouts.has(frame.id)) return;
    ctx.font = '800 28px system-ui, -apple-system, sans-serif';
    const headlineLines = wrapTextLines(
      (s) => ctx.measureText(s).width,
      frame.overlayHeadline,
      maxTextW,
      3
    );

    ctx.font = '500 19px system-ui, -apple-system, sans-serif';
    const lyricLines = wrapTextLines(
      (s) => ctx.measureText(s).width,
      frame.lyricLine,
      maxTextW,
      2
    );

    const headlineHeight = headlineLines.length * 36;
    const lyricHeight = lyricLines.length * 26;
    const cardH = Math.max(
      110,
      36 + headlineHeight + (lyricLines.length > 0 ? 12 + lyricHeight : 0)
    );
    const cardY = Math.min(788 - cardH, height - 172 - cardH);
    frameLayouts.set(frame.id, { headlineLines, lyricLines, cardH, cardY });
  };

  if (frames.length === 0) {
    layoutFrame(getActiveStoryboardFrame(frames, 0));
  } else {
    for (const frame of frames) {
      layoutFrame(frame);
    }
  }

  return {
    baseGrad,
    topScrim,
    bottomScrim,
    brandLine,
    promoBadgeText,
    whatsappPillText,
    frameLayouts,
  };
}

async function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  if (!isAllowedImageSrc(src) || typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    if (src.startsWith('http:') || src.startsWith('https:')) {
      img.crossOrigin = 'anonymous';
    }
    let settled = false;
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = window.setTimeout(() => finish(null), 4000);
    const finalizeLoaded = () => {
      const w = img.naturalWidth !== undefined ? img.naturalWidth : img.width;
      const h = img.naturalHeight !== undefined ? img.naturalHeight : img.height;
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        finish(img);
      } else {
        finish(null);
      }
    };
    img.onload = () => {
      window.clearTimeout(timer);
      if (typeof img.decode === 'function') {
        img
          .decode()
          .then(finalizeLoaded)
          .catch(finalizeLoaded);
      } else {
        finalizeLoaded();
      }
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    img.src = src;
  });
}

function drawStoryboardFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tSec: number,
  durationSec: number,
  frames: readonly StoryboardFrame[],
  brand: BrandProfile,
  assets: LoadedAssets,
  renderCache?: StoryboardRenderCache
): void {
  const cache =
    renderCache ?? createStoryboardRenderCache(ctx, width, height, frames, brand);
  const frame = getActiveStoryboardFrame(frames, tSec);
  const frameIdx = Math.max(0, frames.findIndex((f) => f.id === frame.id));
  const frameSpan = Math.max(0.05, frame.endSec - frame.startSec);
  const tInFrame = Math.max(0, tSec - frame.startSec);
  const frameProgress = clamp01(tInFrame / frameSpan);

  // Base dark gradient backdrop tinted with active brand themeColor
  ctx.fillStyle = cache.baseGrad;
  ctx.fillRect(0, 0, width, height);

  // Ambient background photo layer with gentle Ken Burns zoom + 0.25s crossfade
  const currentImg = assets.photos[frame.photoIndex] ?? assets.photos[0] ?? assets.photos[1];
  const prevFrame = frameIdx > 0 ? frames[frameIdx - 1] : null;
  const prevImg = prevFrame
    ? assets.photos[prevFrame.photoIndex] ?? assets.photos[0]
    : null;
  const fadeAlpha =
    prevFrame && tInFrame < 0.25 ? clamp01(tInFrame / 0.25) : 1;

  const isEvenFrame = frameIdx % 2 === 0;
  const kenBurnsZoom = isEvenFrame
    ? 1.03 + 0.12 * frameProgress
    : 1.15 - 0.11 * frameProgress;
  const kenBurnsPanX = isEvenFrame
    ? -0.35 + 0.7 * frameProgress
    : 0.35 - 0.7 * frameProgress;
  const kenBurnsPanY = isEvenFrame
    ? -0.2 + 0.4 * frameProgress
    : 0.2 - 0.4 * frameProgress;

  if (prevImg && fadeAlpha < 1) {
    ctx.save();
    ctx.globalAlpha = 1;
    drawImageCoverZoom(ctx, prevImg, 0, 0, width, height, 1.08, 0.2, 0);
    ctx.restore();
  }

  if (currentImg) {
    ctx.save();
    ctx.globalAlpha = fadeAlpha * 0.52;
    drawImageCoverZoom(ctx, currentImg, 0, 0, width, height, kenBurnsZoom, kenBurnsPanX * 0.4, 0);
    ctx.restore();
  }

  // Soft ambient dark veil + top/bottom contrast scrims
  ctx.fillStyle = 'rgba(6, 10, 20, 0.48)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = cache.topScrim;
  ctx.fillRect(0, 0, width, 230);

  ctx.fillStyle = cache.bottomScrim;
  ctx.fillRect(0, 440, width, height - 440);

  const safeThemeColor = resolveThemeColor(brand.themeColor);
  const contrastText = getContrastTextColor(safeThemeColor);

  // Segmented 4-part story progress bar (CapCut / TikTok story style)
  const totalSegments = Math.max(1, frames.length);
  const segBarMargin = 20;
  const segGap = 6;
  const segWidth =
    (width - segBarMargin * 2 - segGap * (totalSegments - 1)) / totalSegments;
  for (let sIdx = 0; sIdx < totalSegments; sIdx += 1) {
    const sx = segBarMargin + sIdx * (segWidth + segGap);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(sx, 10, segWidth, 5);
    const segFillRatio =
      sIdx < frameIdx ? 1 : sIdx === frameIdx ? frameProgress : 0;
    if (segFillRatio > 0) {
      ctx.fillStyle = safeThemeColor;
      ctx.fillRect(sx, 10, segWidth * segFillRatio, 5);
    }
  }
  // Overall subtle timeline indicator at y=0
  ctx.fillStyle = safeThemeColor;
  ctx.fillRect(0, 0, width * clamp01(tSec / Math.max(0.1, durationSec)), 4);

  // Top brand header pill (9:16 safe margin)
  const pillX = 28;
  const pillY = 26;
  const pillW = width - 56;
  const pillH = 62;
  ctx.save();
  drawRoundedRectPath(ctx, pillX, pillY, pillW, pillH, 16);
  ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = hexToRgba(safeThemeColor, 0.65);
  ctx.stroke();

  const logoW = assets.logo ? assets.logo.naturalWidth || assets.logo.width : 0;
  const logoH = assets.logo ? assets.logo.naturalHeight || assets.logo.height : 0;
  if (assets.logo && logoW > 0 && logoH > 0) {
    ctx.save();
    drawRoundedRectPath(ctx, pillX + 10, pillY + 10, 42, 42, 10);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.fill();
    ctx.clip();
    const logoRect = computeContainRect(
      logoW,
      logoH,
      pillX + 12,
      pillY + 12,
      38,
      38
    );
    ctx.drawImage(
      assets.logo,
      logoRect.dx,
      logoRect.dy,
      logoRect.dWidth,
      logoRect.dHeight
    );
    ctx.restore();
  } else {
    drawRoundedRectPath(ctx, pillX + 10, pillY + 10, 42, 42, 10);
    ctx.fillStyle = safeThemeColor;
    ctx.fill();
  }

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 19px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(cache.brandLine, pillX + 64, pillY + pillH / 2);

  // Frame badge (#1/4 .. #4/4)
  const badgeText = `${frameIdx + 1}/${Math.max(1, frames.length)}`;
  ctx.font = '600 14px system-ui, -apple-system, sans-serif';
  const badgeW = 54;
  drawRoundedRectPath(ctx, pillX + pillW - badgeW - 12, pillY + 16, badgeW, 30, 10);
  ctx.fillStyle = hexToRgba(safeThemeColor, 0.28);
  ctx.fill();
  ctx.fillStyle = '#E0F2FE';
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, pillX + pillW - badgeW / 2 - 12, pillY + pillH / 2);
  ctx.restore();

  // Product Photo Spotlight Card (Ken Burns zoom + pan inside rounded frame)
  const spotX = 36;
  const spotY = 108;
  const spotW = width - 72;
  const spotH = 386;

  ctx.save();
  drawRoundedRectPath(ctx, spotX, spotY, spotW, spotH, 24);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fill();

  if (currentImg) {
    ctx.save();
    drawRoundedRectPath(ctx, spotX + 4, spotY + 4, spotW - 8, spotH - 8, 20);
    ctx.clip();
    ctx.globalAlpha = fadeAlpha;
    drawImageCoverZoom(
      ctx,
      currentImg,
      spotX + 4,
      spotY + 4,
      spotW - 8,
      spotH - 8,
      kenBurnsZoom,
      kenBurnsPanX,
      kenBurnsPanY
    );
    ctx.restore();
  }

  drawRoundedRectPath(ctx, spotX, spotY, spotW, spotH, 24);
  ctx.lineWidth = 3;
  ctx.strokeStyle = safeThemeColor;
  ctx.stroke();

  // Pop-In Promo / Price Badge on top-right of Spotlight Card
  const badgeEase = easeOutCubic(tInFrame / 0.28);
  ctx.save();
  ctx.globalAlpha = 0.2 + 0.8 * badgeEase;
  ctx.font = '800 16px system-ui, -apple-system, sans-serif';
  const promoW = Math.min(spotW - 36, Math.max(130, ctx.measureText(cache.promoBadgeText).width + 32));
  const promoX = spotX + spotW - promoW - 14;
  const promoY = spotY + 14 + (1 - badgeEase) * -10;
  drawRoundedRectPath(ctx, promoX, promoY, promoW, 34, 17);
  ctx.fillStyle = safeThemeColor;
  ctx.fill();
  ctx.fillStyle = contrastText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cache.promoBadgeText, promoX + promoW / 2, promoY + 17);
  ctx.restore();
  ctx.restore();

  // Animated Slide-In Headline + Lyric Card (above TikTok/Reels bottom UI)
  const slideEase = easeOutCubic(tInFrame / 0.25);
  const slideOffsetX = (1 - slideEase) * 40;
  const cardX = 28 + slideOffsetX;
  const cardW = width - 56;
  const textPadX = 20;
  const layout = cache.frameLayouts.get(frame.id) ?? {
    headlineLines: [],
    lyricLines: [],
    cardH: 110,
    cardY: Math.min(788 - 110, height - 172 - 110),
  };
  const { headlineLines, lyricLines, cardH, cardY } = layout;

  ctx.save();
  ctx.globalAlpha = 0.25 + 0.75 * slideEase;
  drawRoundedRectPath(ctx, cardX, cardY, cardW, cardH, 18);
  ctx.fillStyle = 'rgba(11, 15, 25, 0.88)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = hexToRgba(safeThemeColor, 0.45);
  ctx.stroke();

  // Brand theme accent bar on left edge of card
  drawRoundedRectPath(ctx, cardX, cardY + 14, 6, Math.max(20, cardH - 28), 3);
  ctx.fillStyle = safeThemeColor;
  ctx.fill();

  let cursorY = cardY + 18;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 28px system-ui, -apple-system, sans-serif';
  for (const line of headlineLines) {
    ctx.fillText(line, cardX + textPadX, cursorY);
    cursorY += 36;
  }

  if (lyricLines.length > 0) {
    cursorY += 6;
    ctx.fillStyle = '#CBD5E1';
    ctx.font = '500 19px system-ui, -apple-system, sans-serif';
    for (const line of lyricLines) {
      ctx.fillText(line, cardX + textPadX, cursorY);
      cursorY += 26;
    }
  }
  ctx.restore();

  // Pulsing WhatsApp CTA Pill (bottom safe anchor, extra vivid on Frame 4)
  const ctaW = 360;
  const ctaH = 52;
  const ctaX = Math.round((width - ctaW) / 2);
  const ctaY = 810;
  const pulseOsc = 0.5 + 0.5 * Math.sin(tSec * 9);
  const isFinalFrame = frameIdx === totalSegments - 1;

  ctx.save();
  ctx.globalAlpha = (isFinalFrame ? 0.34 : 0.18) + 0.22 * pulseOsc;
  drawRoundedRectPath(ctx, ctaX - 5, ctaY - 5, ctaW + 10, ctaH + 10, 31);
  ctx.fillStyle = safeThemeColor;
  ctx.fill();

  ctx.globalAlpha = 1;
  drawRoundedRectPath(ctx, ctaX, ctaY, ctaW, ctaH, 26);
  ctx.fillStyle = '#16A34A';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = safeThemeColor;
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cache.whatsappPillText, ctaX + ctaW / 2, ctaY + ctaH / 2);
  ctx.restore();
}

export async function normalizeAudioBufferToStereo48k(
  audioBuffer: AudioBuffer,
  targetDurationSec: number
): Promise<NormalizedStereoAudio> {
  const safeDuration = Number.isFinite(targetDurationSec)
    ? Math.min(6.0, Math.max(1.5, targetDurationSec))
    : TOTAL_VIDEO_DURATION_SEC;
  const targetFrames = Math.round(safeDuration * TARGET_AUDIO_SAMPLE_RATE);

  let workingBuffer = audioBuffer;
  if (audioBuffer.sampleRate !== TARGET_AUDIO_SAMPLE_RATE && typeof OfflineAudioContext !== 'undefined') {
    const resampledLength = Math.max(
      1,
      Math.round(audioBuffer.duration * TARGET_AUDIO_SAMPLE_RATE)
    );
    const resampler = new OfflineAudioContext(
      2,
      resampledLength,
      TARGET_AUDIO_SAMPLE_RATE
    );
    const src = resampler.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(resampler.destination);
    src.start(0);
    workingBuffer = await resampler.startRendering();
  }

  const left = new Float32Array(targetFrames);
  const right = new Float32Array(targetFrames);
  const ch0 = workingBuffer.getChannelData(0);
  const ch1 =
    workingBuffer.numberOfChannels > 1 ? workingBuffer.getChannelData(1) : ch0;
  const copyLen = Math.min(targetFrames, ch0.length);

  left.set(ch0.subarray(0, copyLen), 0);
  right.set(ch1.subarray(0, copyLen), 0);

  return {
    left,
    right,
    sampleRate: TARGET_AUDIO_SAMPLE_RATE,
    numberOfFrames: targetFrames,
  };
}

function yieldTick(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function isWebCodecsMuxingSupported(): Promise<boolean> {
  if (
    typeof VideoEncoder === 'undefined' ||
    typeof AudioEncoder === 'undefined' ||
    typeof VideoFrame === 'undefined' ||
    typeof AudioData === 'undefined'
  ) {
    return false;
  }

  try {
    const [videoSupport, audioSupport] = await Promise.all([
      VideoEncoder.isConfigSupported({
        codec: 'vp8',
        width: VIDEO_WIDTH,
        height: VIDEO_HEIGHT,
        bitrate: 1_200_000,
        framerate: VIDEO_FPS,
      }),
      AudioEncoder.isConfigSupported({
        codec: 'opus',
        sampleRate: TARGET_AUDIO_SAMPLE_RATE,
        numberOfChannels: 2,
        bitrate: 96_000,
      }),
    ]);
    return Boolean(videoSupport.supported && audioSupport.supported);
  } catch {
    return false;
  }
}

const WEBCODECS_ENCODE_TIMEOUT_MS = 20_000;
const WEBCODECS_FLUSH_TIMEOUT_MS = 10_000;

async function encodeWithWebCodecsMuxer(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  durationSec: number,
  frames: readonly StoryboardFrame[],
  brand: BrandProfile,
  assets: LoadedAssets,
  audio: NormalizedStereoAudio,
  renderCache: StoryboardRenderCache
): Promise<ExportVideoResult> {
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: 'V_VP8',
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
      frameRate: VIDEO_FPS,
    },
    audio: {
      codec: 'A_OPUS',
      numberOfChannels: 2,
      sampleRate: TARGET_AUDIO_SAMPLE_RATE,
    },
    type: 'webm',
    firstTimestampBehavior: 'strict',
  });

  let encodeError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      encodeError = err instanceof Error ? err : new Error(String(err));
    },
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      muxer.addAudioChunk(chunk, meta);
    },
    error: (err) => {
      encodeError = err instanceof Error ? err : new Error(String(err));
    },
  });

  const encodeDeadlineMs = performance.now() + WEBCODECS_ENCODE_TIMEOUT_MS;

  try {
    videoEncoder.configure({
      codec: 'vp8',
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
      bitrate: 1_200_000,
      framerate: VIDEO_FPS,
    });

    audioEncoder.configure({
      codec: 'opus',
      sampleRate: TARGET_AUDIO_SAMPLE_RATE,
      numberOfChannels: 2,
      bitrate: 96_000,
    });

    const totalVideoFrames = Math.round(durationSec * VIDEO_FPS);
    const frameDurationUs = Math.round(1_000_000 / VIDEO_FPS);

    for (let frameIndex = 0; frameIndex < totalVideoFrames; frameIndex += 1) {
      if (encodeError) throw encodeError;
      if (performance.now() > encodeDeadlineMs) {
        throw new Error('WebCodecs video encode timed out.');
      }

      const tSec = frameIndex / VIDEO_FPS;
      drawStoryboardFrame(
        ctx,
        VIDEO_WIDTH,
        VIDEO_HEIGHT,
        tSec,
        durationSec,
        frames,
        brand,
        assets,
        renderCache
      );

      const timestampUs = Math.round((frameIndex * 1_000_000) / VIDEO_FPS);
      const videoFrame = new VideoFrame(canvas, {
        timestamp: timestampUs,
        duration: frameDurationUs,
      });

      try {
        while (videoEncoder.encodeQueueSize > 8) {
          if (encodeError) throw encodeError;
          if (performance.now() > encodeDeadlineMs) {
            throw new Error('WebCodecs video encode backpressure timed out.');
          }
          await yieldTick();
        }
        if (encodeError) throw encodeError;
        videoEncoder.encode(videoFrame, { keyFrame: frameIndex % VIDEO_FPS === 0 });
      } finally {
        videoFrame.close();
      }
    }

    for (
      let offset = 0;
      offset < audio.numberOfFrames;
      offset += OPUS_FRAME_SAMPLES
    ) {
      if (encodeError) throw encodeError;
      if (performance.now() > encodeDeadlineMs) {
        throw new Error('WebCodecs audio encode timed out.');
      }

      const count = Math.min(OPUS_FRAME_SAMPLES, audio.numberOfFrames - offset);
      const planar = new Float32Array(count * 2);
      planar.set(audio.left.subarray(offset, offset + count), 0);
      planar.set(audio.right.subarray(offset, offset + count), count);

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: TARGET_AUDIO_SAMPLE_RATE,
        numberOfFrames: count,
        numberOfChannels: 2,
        timestamp: Math.round((offset * 1_000_000) / TARGET_AUDIO_SAMPLE_RATE),
        data: planar,
      });

      try {
        while (audioEncoder.encodeQueueSize > 16) {
          if (encodeError) throw encodeError;
          if (performance.now() > encodeDeadlineMs) {
            throw new Error('WebCodecs audio encode backpressure timed out.');
          }
          await yieldTick();
        }
        if (encodeError) throw encodeError;
        audioEncoder.encode(audioData);
      } finally {
        audioData.close();
      }
    }

    let flushTimer = 0;
    try {
      await Promise.race([
        Promise.all([videoEncoder.flush(), audioEncoder.flush()]),
        new Promise<never>((_, reject) => {
          flushTimer = window.setTimeout(() => {
            reject(new Error('WebCodecs flush timed out.'));
          }, WEBCODECS_FLUSH_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (flushTimer) {
        window.clearTimeout(flushTimer);
      }
    }

    if (encodeError) {
      throw encodeError;
    }
  } finally {
    try {
      if (videoEncoder.state !== 'closed') {
        videoEncoder.close();
      }
    } catch {
      // Ignore already-closed encoder
    }
    try {
      if (audioEncoder.state !== 'closed') {
        audioEncoder.close();
      }
    } catch {
      // Ignore already-closed encoder
    }
  }

  muxer.finalize();

  const blob = new Blob([target.buffer], { type: 'video/webm' });
  return {
    blob,
    mimeType: 'video/webm',
    fileExtension: 'webm',
    durationSec,
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
  };
}

async function encodeWithMediaRecorderFallback(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  durationSec: number,
  frames: readonly StoryboardFrame[],
  brand: BrandProfile,
  assets: LoadedAssets,
  audioBuffer: AudioBuffer,
  renderCache: StoryboardRenderCache
): Promise<ExportVideoResult> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Neither WebCodecs nor MediaRecorder is available in this browser.');
  }

  const selectedMime = selectMediaRecorderMimeType((mime) =>
    MediaRecorder.isTypeSupported(mime)
  );
  const fileExtension: 'mp4' | 'webm' = selectedMime.includes('mp4') ? 'mp4' : 'webm';
  const durationMs = Math.min(6000, Math.round(durationSec * 1000));

  drawStoryboardFrame(
    ctx,
    VIDEO_WIDTH,
    VIDEO_HEIGHT,
    0,
    durationSec,
    frames,
    brand,
    assets,
    renderCache
  );

  let canvasStream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let combinedStream: MediaStream | null = null;
  let srcNode: AudioBufferSourceNode | null = null;
  let recorder: MediaRecorder;

  try {
    canvasStream = canvas.captureStream(VIDEO_FPS);
    audioCtx = new AudioContext({ sampleRate: TARGET_AUDIO_SAMPLE_RATE });
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const dest = audioCtx.createMediaStreamDestination();
    srcNode = audioCtx.createBufferSource();
    srcNode.buffer = audioBuffer;
    srcNode.connect(dest);

    combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    recorder = new MediaRecorder(
      combinedStream,
      selectedMime ? { mimeType: selectedMime } : undefined
    );
  } catch (err) {
    combinedStream?.getTracks?.().forEach((track) => track.stop());
    canvasStream?.getTracks?.().forEach((track) => track.stop());
    void audioCtx?.close?.().catch(() => {});
    throw err;
  }

  const chunks: BlobPart[] = [];

  return new Promise<ExportVideoResult>((resolve, reject) => {
    let finished = false;
    let drawTimer = 0;
    let hardStopTimer = 0;

    const cleanup = () => {
      window.clearInterval(drawTimer);
      window.clearTimeout(hardStopTimer);
      try {
        srcNode?.stop();
      } catch {
        // Ignore already-stopped source
      }
      combinedStream?.getTracks?.().forEach((track) => track.stop());
      canvasStream?.getTracks?.().forEach((track) => track.stop());
      void audioCtx?.close?.().catch(() => {});
    };

    const stopRecording = () => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    };

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunks.push(ev.data);
      }
    };

    recorder.onerror = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error('MediaRecorder failed during video export.'));
    };

    recorder.onstop = () => {
      if (finished) return;
      finished = true;
      cleanup();
      const outputMime = selectedMime || (fileExtension === 'mp4' ? 'video/mp4' : 'video/webm');
      const blob = new Blob(chunks, { type: outputMime });
      if (chunks.length === 0 || blob.size === 0) {
        reject(new Error('MediaRecorder produced an empty video blob.'));
        return;
      }
      resolve({
        blob,
        mimeType: outputMime,
        fileExtension,
        durationSec,
        width: VIDEO_WIDTH,
        height: VIDEO_HEIGHT,
      });
    };

    const startMs = performance.now();
    try {
      recorder.start(200);
      srcNode?.start(0);
    } catch (err) {
      if (!finished) {
        finished = true;
        cleanup();
        try {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        } catch {
          // Ignore stop errors during abort
        }
        reject(err);
      }
      return;
    }

    drawTimer = window.setInterval(() => {
      const elapsedSec = (performance.now() - startMs) / 1000;
      if (elapsedSec >= durationSec) {
        drawStoryboardFrame(
          ctx,
          VIDEO_WIDTH,
          VIDEO_HEIGHT,
          durationSec,
          durationSec,
          frames,
          brand,
          assets,
          renderCache
        );
        stopRecording();
        return;
      }
      drawStoryboardFrame(
        ctx,
        VIDEO_WIDTH,
        VIDEO_HEIGHT,
        elapsedSec,
        durationSec,
        frames,
        brand,
        assets,
        renderCache
      );
    }, Math.round(1000 / VIDEO_FPS));

    hardStopTimer = window.setTimeout(stopRecording, durationMs);
  });
}

export async function exportVerticalVideo({
  frames,
  photos,
  brand,
  audioBuffer,
  durationSec = TOTAL_VIDEO_DURATION_SEC,
  offerSentence,
  uspAndAudience,
}: ExportVideoInput): Promise<ExportVideoResult> {
  const safeDuration = Number.isFinite(durationSec)
    ? Math.min(6.0, Math.max(1.5, durationSec))
    : TOTAL_VIDEO_DURATION_SEC;

  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D canvas context for video rendering.');
  }

  await document.fonts?.ready?.catch(() => {});

  const [photo0, photo1, logo] = await Promise.all([
    loadImageSafe(photos[0]?.src ?? ''),
    loadImageSafe(photos[1]?.src ?? ''),
    loadImageSafe(brand.logoDataUrl ?? ''),
  ]);
  const assets: LoadedAssets = { photos: [photo0, photo1], logo };
  const renderCache = createStoryboardRenderCache(
    ctx,
    VIDEO_WIDTH,
    VIDEO_HEIGHT,
    frames,
    brand,
    offerSentence,
    uspAndAudience
  );

  const normalizedAudio = await normalizeAudioBufferToStereo48k(
    audioBuffer,
    safeDuration
  );

  if (await isWebCodecsMuxingSupported()) {
    try {
      return await encodeWithWebCodecsMuxer(
        canvas,
        ctx,
        safeDuration,
        frames,
        brand,
        assets,
        normalizedAudio,
        renderCache
      );
    } catch {
      // Fall back to MediaRecorder if WebCodecs fails at runtime
    }
  }

  return encodeWithMediaRecorderFallback(
    canvas,
    ctx,
    safeDuration,
    frames,
    brand,
    assets,
    audioBuffer,
    renderCache
  );
}
