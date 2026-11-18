import type { AspectRatioMode, BrandProfile, CarouselSlide } from '../types/campaign';
import { extractOfferDetails } from './offerDetails';
import {
  POLLINATIONS_IMAGE_BASE_URL,
  canCallBuiltInAiNetwork,
} from './pollinationsAi';

export interface CoverCropRect {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  dx: number;
  dy: number;
  dWidth: number;
  dHeight: number;
}

export interface SafeZoneGeometry {
  topRatio: number;
  bottomRatio: number;
  leftRatio: number;
  rightRatio: number;
  squareCropRatio: number;
  canvasWidth: number;
  canvasHeight: number;
  safeRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface RenderSlideOptions {
  slide: CarouselSlide;
  brand: BrandProfile;
  photoSrc: string;
  aspectMode: AspectRatioMode;
  totalSlides?: number;
}

export interface ExportSlideOptions extends RenderSlideOptions {}

const FONT_STACK = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function getCanvasDimensions(mode: AspectRatioMode): { width: number; height: number } {
  if (mode === '4:5') {
    return { width: 1080, height: 1350 };
  }
  return { width: 1080, height: 1920 };
}

export function computeCoverCrop(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): CoverCropRect {
  if (
    !Number.isFinite(srcW) ||
    !Number.isFinite(srcH) ||
    !Number.isFinite(dstW) ||
    !Number.isFinite(dstH) ||
    srcW <= 0 ||
    srcH <= 0 ||
    dstW <= 0 ||
    dstH <= 0
  ) {
    return {
      sx: 0,
      sy: 0,
      sWidth: Number.isFinite(srcW) && srcW > 0 ? srcW : 0,
      sHeight: Number.isFinite(srcH) && srcH > 0 ? srcH : 0,
      dx: 0,
      dy: 0,
      dWidth: Number.isFinite(dstW) && dstW > 0 ? dstW : 0,
      dHeight: Number.isFinite(dstH) && dstH > 0 ? dstH : 0,
    };
  }

  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;

  if (srcAspect > dstAspect) {
    const sHeight = srcH;
    const sWidth = srcH * dstAspect;
    const sx = (srcW - sWidth) / 2;
    return {
      sx,
      sy: 0,
      sWidth,
      sHeight,
      dx: 0,
      dy: 0,
      dWidth: dstW,
      dHeight: dstH,
    };
  }

  const sWidth = srcW;
  const sHeight = srcW / dstAspect;
  const sy = (srcH - sHeight) / 2;
  return {
    sx: 0,
    sy,
    sWidth,
    sHeight,
    dx: 0,
    dy: 0,
    dWidth: dstW,
    dHeight: dstH,
  };
}

function computeContainRect(
  srcW: number,
  srcH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
): { dx: number; dy: number; dWidth: number; dHeight: number } {
  if (srcW <= 0 || srcH <= 0 || boxW <= 0 || boxH <= 0) {
    return { dx: boxX, dy: boxY, dWidth: boxW, dHeight: boxH };
  }
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const dWidth = srcW * scale;
  const dHeight = srcH * scale;
  const dx = boxX + (boxW - dWidth) / 2;
  const dy = boxY + (boxH - dHeight) / 2;
  return { dx, dy, dWidth, dHeight };
}

function linearizeSrgbChannel(channel255: number): number {
  const v = channel255 / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function getContrastTextColor(hexColor: string): '#0F172A' | '#FFFFFF' {
  const cleaned = hexColor.trim();
  const match3 = /^#([0-9a-fA-F]{3})$/.exec(cleaned);
  const match6 = /^#([0-9a-fA-F]{6})$/.exec(cleaned);

  let hex6: string;
  if (match6) {
    hex6 = match6[1];
  } else if (match3) {
    hex6 = match3[1]
      .split('')
      .map((ch) => ch + ch)
      .join('');
  } else {
    return '#FFFFFF';
  }

  const r = Number.parseInt(hex6.slice(0, 2), 16);
  const g = Number.parseInt(hex6.slice(2, 4), 16);
  const b = Number.parseInt(hex6.slice(4, 6), 16);

  const luminance =
    0.2126 * linearizeSrgbChannel(r) +
    0.7152 * linearizeSrgbChannel(g) +
    0.0722 * linearizeSrgbChannel(b);

  return luminance > 0.179 ? '#0F172A' : '#FFFFFF';
}

function splitLongToken(
  measureFn: (text: string) => number,
  token: string,
  maxWidth: number
): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const ch of token) {
    if (measureFn(ch) > maxWidth) {
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }
      continue;
    }
    const candidate = current + ch;
    if (current.length > 0 && measureFn(candidate) > maxWidth) {
      chunks.push(current);
      current = ch;
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

export function wrapTextLines(
  measureFn: (text: string) => number,
  text: string,
  maxWidth: number,
  maxLines?: number
): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized || !Number.isFinite(maxWidth) || maxWidth <= 0) {
    return [];
  }
  if (maxLines !== undefined && maxLines <= 0) {
    return [];
  }

  const lines: string[] = [];
  const paragraphs = normalized.split('\n');

  for (const paragraph of paragraphs) {
    const tokens = paragraph.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      continue;
    }

    let currentLine = '';

    for (const token of tokens) {
      if (currentLine.length === 0) {
        if (measureFn(token) <= maxWidth) {
          currentLine = token;
        } else {
          const splitParts = splitLongToken(measureFn, token, maxWidth);
          for (let i = 0; i < splitParts.length - 1; i += 1) {
            lines.push(splitParts[i]);
          }
          currentLine = splitParts[splitParts.length - 1] ?? '';
        }
      } else {
        const candidate = `${currentLine} ${token}`;
        if (measureFn(candidate) <= maxWidth) {
          currentLine = candidate;
        } else {
          lines.push(currentLine);
          if (measureFn(token) <= maxWidth) {
            currentLine = token;
          } else {
            const splitParts = splitLongToken(measureFn, token, maxWidth);
            for (let i = 0; i < splitParts.length - 1; i += 1) {
              lines.push(splitParts[i]);
            }
            currentLine = splitParts[splitParts.length - 1] ?? '';
          }
        }
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }

  if (maxLines !== undefined && lines.length > maxLines) {
    const truncated = lines.slice(0, maxLines);
    const ellipsis = '...';
    const chars = Array.from(truncated[maxLines - 1] ?? '');

    while (chars.length > 0 && /\s/.test(chars[chars.length - 1] ?? '')) {
      chars.pop();
    }

    while (chars.length > 0 && measureFn(`${chars.join('')}${ellipsis}`) > maxWidth) {
      chars.pop();
      while (chars.length > 0 && /\s/.test(chars[chars.length - 1] ?? '')) {
        chars.pop();
      }
    }

    const last = chars.join('');
    if (last.length > 0) {
      truncated[maxLines - 1] = `${last}${ellipsis}`;
    } else if (measureFn(ellipsis) <= maxWidth) {
      truncated[maxLines - 1] = ellipsis;
    } else if (measureFn('.') <= maxWidth) {
      truncated[maxLines - 1] = '.';
    } else {
      truncated.pop();
    }

    return truncated;
  }

  return lines;
}

export function getSafeZoneInsets(mode: AspectRatioMode): SafeZoneGeometry {
  const { width: canvasWidth, height: canvasHeight } = getCanvasDimensions(mode);

  if (mode === '4:5') {
    const topRatio = 0.06;
    const bottomRatio = 0.06;
    const leftRatio = 0.06;
    const rightRatio = 0.06;
    const squareCropRatio = 0.1;

    const left = Math.round(canvasWidth * leftRatio);
    const right = Math.round(canvasWidth * rightRatio);
    const top = Math.round(canvasHeight * topRatio);
    const bottom = Math.round(canvasHeight * bottomRatio);

    return {
      topRatio,
      bottomRatio,
      leftRatio,
      rightRatio,
      squareCropRatio,
      canvasWidth,
      canvasHeight,
      safeRect: {
        x: left,
        y: top,
        width: canvasWidth - left - right,
        height: canvasHeight - top - bottom,
      },
    };
  }

  const topRatio = 0.14;
  const bottomRatio = 0.28;
  const leftRatio = 0.05;
  const rightRatio = 0.15;
  const squareCropRatio = 0;

  const left = Math.round(canvasWidth * leftRatio);
  const right = Math.round(canvasWidth * rightRatio);
  const top = Math.round(canvasHeight * topRatio);
  const bottom = Math.round(canvasHeight * bottomRatio);

  return {
    topRatio,
    bottomRatio,
    leftRatio,
    rightRatio,
    squareCropRatio,
    canvasWidth,
    canvasHeight,
    safeRect: {
      x: left,
      y: top,
      width: canvasWidth - left - right,
      height: canvasHeight - top - bottom,
    },
  };
}

export function isAllowedImageSrc(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed) {
    return false;
  }
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.startsWith('\\\\') ||
    trimmed.startsWith('\\')
  ) {
    return false;
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('data:image/')) {
    return /^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i.test(trimmed);
  }
  if (lower.startsWith('blob:')) {
    if (
      typeof window === 'undefined' ||
      !window.location?.origin ||
      window.location.origin === 'null'
    ) {
      return false;
    }
    const inner = trimmed.slice(5);
    if (/[\r\n\t\\]/.test(inner)) {
      return false;
    }
    try {
      const parsedInner = new URL(inner);
      return (
        (parsedInner.protocol === 'http:' || parsedInner.protocol === 'https:') &&
        inner.slice(parsedInner.protocol.length).startsWith('//') &&
        parsedInner.origin === window.location.origin
      );
    } catch {
      return false;
    }
  }
  if (trimmed.startsWith('/')) {
    if (/^\/[\s\\]*[\/\\]/.test(trimmed)) {
      return false;
    }
    if (
      typeof window !== 'undefined' &&
      window.location?.origin &&
      window.location.origin !== 'null'
    ) {
      try {
        return new URL(trimmed, window.location.origin).origin === window.location.origin;
      } catch {
        return false;
      }
    }
    return true;
  }
  if (lower.startsWith('http:') || lower.startsWith('https:')) {
    if (
      trimmed.startsWith('//') ||
      (lower.startsWith('http:/') && !lower.startsWith('http:' + '//')) ||
      (lower.startsWith('https:/') && !lower.startsWith('https:' + '//'))
    ) {
      return false;
    }
    if (typeof window === 'undefined' || !window.location?.origin || window.location.origin === 'null') {
      return false;
    }
    try {
      const parsed = new URL(trimmed);
      return parsed.origin === window.location.origin;
    } catch {
      return false;
    }
  }
  return false;
}

export function loadDecodedImage(src: string): Promise<HTMLImageElement | null> {
  if (!isAllowedImageSrc(src) || typeof Image === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    let timer = 0;

    const finish = (result: HTMLImageElement | null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer && typeof clearTimeout === 'function') {
        clearTimeout(timer);
      }
      resolve(result);
    };

    if (typeof setTimeout === 'function') {
      timer = setTimeout(() => {
        finish(null);
      }, 4000) as unknown as number;
    }

    img.decoding = 'async';
    img.onload = async () => {
      if (typeof img.decode === 'function') {
        await img.decode().catch(() => undefined);
      }
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        finish(img);
      } else {
        finish(null);
      }
    };
    img.onerror = () => {
      finish(null);
    };
    img.src = src;
  });
}

export function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
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

function resolveThemeColor(color: string): string {
  const cleaned = color.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cleaned)) {
    return cleaned;
  }
  return '#0EA5E9';
}

export type SlideLayoutVariant =
  | 'hero_hook'
  | 'problem_solution'
  | 'feature_grid'
  | 'urgent_cta';

export function resolveSlideLayoutVariant(slide: CarouselSlide): SlideLayoutVariant {
  if (slide.role === 'hook') return 'hero_hook';
  if (slide.role === 'offer') return 'problem_solution';
  if (slide.role === 'proof') return 'feature_grid';
  if (slide.role === 'cta') return 'urgent_cta';
  const mod = Math.abs(slide.index) % 4;
  if (mod === 0) return 'hero_hook';
  if (mod === 1) return 'problem_solution';
  if (mod === 2) return 'feature_grid';
  return 'urgent_cta';
}

export function buildPollinationsBackgroundPrompt(
  brand: BrandProfile,
  offerSentence: string,
  slide: CarouselSlide,
  uspAndAudience?: string
): string {
  const details = extractOfferDetails(brand.name, offerSentence, uspAndAudience);
  const verticalMood =
    details.vertical === 'beauty'
      ? 'minimalist luxury beauty studio, soft rose and pearl rim lighting, marble podium'
      : details.vertical === 'fnb'
        ? 'warm artisan cafe studio backdrop, dramatic golden hour lighting, dark slate texture'
        : details.vertical === 'fashion'
          ? 'editorial fashion boutique studio backdrop, architectural shadows, warm spotlight'
          : details.vertical === 'services'
            ? 'sleek modern automotive and workshop studio, metallic dark charcoal glow, rim lights'
            : 'premium commercial product photography studio, dark gradient backdrop, subtle spotlight';
  const slideMood =
    slide.role === 'hook'
      ? 'eye-catching hero composition'
      : slide.role === 'offer'
        ? 'clean split depth backdrop'
        : slide.role === 'proof'
          ? 'structured dark textured backdrop'
          : 'bold high-contrast dark studio glow';
  const uspHint = details.uspSummary ? `, ${details.uspSummary}` : '';
  return `Commercial studio product photography background for ${details.productTopic}${uspHint}, ${verticalMood}, ${slideMood}, soft depth of field, clean negative space, no text, no letters, no watermark`;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

export async function generateAiCarouselBackground(options: {
  prompt: string;
  aspectMode?: AspectRatioMode;
  width?: number;
  height?: number;
  seed?: number;
  isDemoMode?: boolean;
  signal?: AbortSignal;
}): Promise<{ ok: true; dataUrl: string } | { ok: false; reason: string; isTestGuard?: boolean }> {
  if (options.isDemoMode || !canCallBuiltInAiNetwork()) {
    return {
      ok: false,
      reason: 'demo_or_test_guard',
      isTestGuard: true,
    };
  }

  const dims = getCanvasDimensions(options.aspectMode ?? '9:16');
  const width = options.width ?? dims.width;
  const height = options.height ?? dims.height;
  const seed = options.seed ?? Math.floor(Date.now() % 1_000_000);
  const url = `${POLLINATIONS_IMAGE_BASE_URL}${encodeURIComponent(options.prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;

  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      return { ok: false, reason: 'aborted' };
    }
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timerId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 20_000);

  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!response.ok) {
      return {
        ok: false,
        reason: `HTTP ${response.status}`,
      };
    }

    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      return { ok: false, reason: 'empty_image_blob' };
    }

    const rawType = (blob.type || response.headers?.get?.('content-type') || 'image/jpeg')
      .toLowerCase()
      .split(';')[0]
      .trim();
    if (rawType && !rawType.startsWith('image/')) {
      return { ok: false, reason: `invalid_mime:${rawType}` };
    }

    const normalizedMime =
      rawType === 'image/png'
        ? 'image/png'
        : rawType === 'image/webp'
          ? 'image/webp'
          : 'image/jpeg';
    const buffer = await blob.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      return { ok: false, reason: 'empty_image_buffer' };
    }
    const base64 = bytesToBase64(new Uint8Array(buffer));
    return {
      ok: true,
      dataUrl: `data:${normalizedMime};base64,${base64}`,
    };
  } catch (err) {
    if (timedOut) {
      return { ok: false, reason: 'timeout' };
    }
    return {
      ok: false,
      reason: err instanceof Error && err.message ? err.message : 'network_error',
    };
  } finally {
    clearTimeout(timerId);
    if (options.signal) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

function drawBadgePill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  maxWidth: number,
  text: string,
  fillColor: string,
  textColor: string,
  pillHeight = 44,
  fontSize = 22
): number {
  const clean = text.trim();
  if (!clean) return 0;
  ctx.font = `700 ${fontSize}px ${FONT_STACK}`;
  const lines = wrapTextLines((s) => ctx.measureText(s).width, clean, maxWidth - 44, 1);
  const label = lines[0] ?? clean;
  const textW = ctx.measureText(label).width;
  const pillW = Math.min(maxWidth, textW + 44);
  drawRoundedRectPath(ctx, x, y, pillW, pillHeight, Math.round(pillHeight / 2));
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 22, y + pillHeight / 2 + 1);
  return pillW;
}

export async function renderSlideToCanvas(
  canvas: HTMLCanvasElement,
  options: RenderSlideOptions
): Promise<void> {
  const { slide, brand, photoSrc, aspectMode, totalSlides = 4 } = options;
  const { width, height } = getCanvasDimensions(aspectMode);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable');
  }

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }

  const aiBgSrc = slide.aiBackgroundDataUrl?.trim() ?? '';
  const effectiveBgSrc = aiBgSrc.length > 0 ? aiBgSrc : photoSrc;

  const [bgImg, productImg, logoImg] = await Promise.all([
    loadDecodedImage(effectiveBgSrc),
    aiBgSrc.length > 0 && photoSrc.trim().length > 0
      ? loadDecodedImage(photoSrc)
      : Promise.resolve(null),
    loadDecodedImage(brand.logoDataUrl),
  ]);
  const insetProductImg = productImg ?? bgImg;

  const themeColor = resolveThemeColor(brand.themeColor);
  const themeContrastColor = getContrastTextColor(themeColor);
  const layoutVariant = resolveSlideLayoutVariant(slide);

  // Layer 1: Dark base + cover-cropped photo/AI bg (or deterministic fallback) + dark scrims
  ctx.fillStyle = '#0B0F19';
  ctx.fillRect(0, 0, width, height);

  if (bgImg && bgImg.naturalWidth > 0 && bgImg.naturalHeight > 0) {
    const crop = computeCoverCrop(bgImg.naturalWidth, bgImg.naturalHeight, width, height);
    ctx.drawImage(
      bgImg,
      crop.sx,
      crop.sy,
      crop.sWidth,
      crop.sHeight,
      crop.dx,
      crop.dy,
      crop.dWidth,
      crop.dHeight
    );
  } else {
    const fallbackGrad = ctx.createLinearGradient(0, 0, width, height);
    fallbackGrad.addColorStop(0, '#0F172A');
    fallbackGrad.addColorStop(0.55, '#1E293B');
    fallbackGrad.addColorStop(1, '#0B0F19');
    ctx.fillStyle = fallbackGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = themeColor;
    const glowSize = width * 0.76;
    drawRoundedRectPath(
      ctx,
      width * 0.72 - glowSize / 2,
      height * 0.34 - glowSize / 2,
      glowSize,
      glowSize,
      glowSize / 2
    );
    ctx.fill();
    ctx.restore();
  }

  const topScrim = ctx.createLinearGradient(0, 0, 0, height * 0.36);
  topScrim.addColorStop(0, 'rgba(4, 9, 20, 0.78)');
  topScrim.addColorStop(1, 'rgba(4, 9, 20, 0)');
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, width, height * 0.36);

  const bottomScrim = ctx.createLinearGradient(0, height * 0.32, 0, height);
  bottomScrim.addColorStop(0, 'rgba(4, 9, 20, 0.12)');
  bottomScrim.addColorStop(0.55, 'rgba(4, 9, 20, 0.74)');
  bottomScrim.addColorStop(1, 'rgba(4, 9, 20, 0.95)');
  ctx.fillStyle = bottomScrim;
  ctx.fillRect(0, height * 0.32, width, height * 0.68);

  // Layer 2: Foreground strictly inside safe content box (safe-zone guides are NEVER drawn)
  const insets = getSafeZoneInsets(aspectMode);
  const squarePadY = aspectMode === '4:5' ? Math.round(height * insets.squareCropRatio) : 0;
  const contentLeft = insets.safeRect.x;
  const contentWidth = insets.safeRect.width;
  const contentTop = Math.max(insets.safeRect.y, squarePadY);
  const contentBottom = Math.min(insets.safeRect.y + insets.safeRect.height, height - squarePadY);

  // Top theme accent bar inside safe zone
  drawRoundedRectPath(ctx, contentLeft, contentTop, contentWidth, 8, 4);
  ctx.fillStyle = themeColor;
  ctx.fill();

  // Header row: 84x84 logo badge + brand name + slide counter
  const headerY = contentTop + 22;
  const logoBoxSize = 84;

  drawRoundedRectPath(ctx, contentLeft, headerY, logoBoxSize, logoBoxSize, 18);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = themeColor;
  ctx.stroke();

  if (logoImg && logoImg.naturalWidth > 0 && logoImg.naturalHeight > 0) {
    const logoRect = computeContainRect(
      logoImg.naturalWidth,
      logoImg.naturalHeight,
      contentLeft + 8,
      headerY + 8,
      logoBoxSize - 16,
      logoBoxSize - 16
    );
    ctx.drawImage(logoImg, logoRect.dx, logoRect.dy, logoRect.dWidth, logoRect.dHeight);
  } else {
    const monogram =
      brand.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => Array.from(w)[0]?.toUpperCase() ?? '')
        .join('') || 'BS';
    ctx.fillStyle = themeColor;
    ctx.font = `800 30px ${FONT_STACK}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(monogram, contentLeft + 20, headerY + logoBoxSize / 2);
  }

  const brandTextX = contentLeft + logoBoxSize + 20;
  const brandTextMaxW = Math.max(120, contentWidth - logoBoxSize - 20);
  ctx.font = `700 30px ${FONT_STACK}`;
  const brandNameLines = wrapTextLines(
    (s) => ctx.measureText(s).width,
    brand.name || 'Brand',
    brandTextMaxW,
    1
  );
  ctx.fillStyle = '#F8FAFC';
  ctx.textBaseline = 'top';
  ctx.fillText(brandNameLines[0] ?? 'Brand', brandTextX, headerY + 10);

  ctx.font = `600 22px ${FONT_STACK}`;
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText(`Slide ${slide.index + 1} / ${totalSlides}`, brandTextX, headerY + 50);

  const badgeText = slide.badgeText.trim();
  const ctaText = slide.ctaText.trim();
  const afterHeaderY = headerY + logoBoxSize + 18;

  // ============================================================================
  // LAYOUT 1: hero_hook (Slide 1 — Promo Ribbon + Product Photo Inset + Bold Hook)
  // ============================================================================
  if (layoutVariant === 'hero_hook') {
    let cursorTop = afterHeaderY;
    if (badgeText.length > 0) {
      drawBadgePill(
        ctx,
        contentLeft,
        cursorTop,
        contentWidth,
        badgeText,
        themeColor,
        themeContrastColor,
        46,
        22
      );
      cursorTop += 64;
    }

    // Card height calculation first so inset card fits cleanly above it
    const cardPadX = 34;
    const cardPadY = 28;
    const cardInnerX = contentLeft + cardPadX + 20;
    const cardInnerWidth = Math.max(180, contentWidth - cardPadX * 2 - 20);
    const headlineFontSize = aspectMode === '9:16' ? 48 : 42;
    const headlineLH = Math.round(headlineFontSize * 1.22);
    const subFontSize = aspectMode === '9:16' ? 27 : 24;
    const subLH = Math.round(subFontSize * 1.3);

    ctx.font = `800 ${headlineFontSize}px ${FONT_STACK}`;
    const headlineLines = wrapTextLines((s) => ctx.measureText(s).width, slide.headline, cardInnerWidth, 3);
    ctx.font = `500 ${subFontSize}px ${FONT_STACK}`;
    const subLines = wrapTextLines((s) => ctx.measureText(s).width, slide.subheadline, cardInnerWidth, 3);
    const ctaH = ctaText.length > 0 ? 52 : 0;

    let bodyH = headlineLines.length * headlineLH;
    if (subLines.length > 0) bodyH += (bodyH > 0 ? 14 : 0) + subLines.length * subLH;
    if (ctaH > 0) bodyH += (bodyH > 0 ? 20 : 0) + ctaH;
    const cardHeight = cardPadY * 2 + Math.max(44, bodyH);
    const cardY = Math.max(cursorTop + 120, contentBottom - cardHeight);

    // Product Photo Inset Card between badge and bottom card
    const insetMaxH = cardY - cursorTop - 22;
    if (insetProductImg && insetMaxH >= 150) {
      const insetH = Math.min(aspectMode === '9:16' ? 320 : 250, insetMaxH);
      const insetW = Math.min(contentWidth, Math.round(insetH * 1.15));
      const insetX = contentLeft + Math.round((contentWidth - insetW) / 2);
      const insetY = cursorTop + Math.round((insetMaxH - insetH) / 2);

      drawRoundedRectPath(ctx, insetX, insetY, insetW, insetH, 24);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fill();

      ctx.save();
      drawRoundedRectPath(ctx, insetX + 6, insetY + 6, insetW - 12, insetH - 12, 18);
      if (typeof ctx.clip === 'function') {
        ctx.clip();
      }
      const crop = computeCoverCrop(
        insetProductImg.naturalWidth,
        insetProductImg.naturalHeight,
        insetW - 12,
        insetH - 12
      );
      ctx.drawImage(
        insetProductImg,
        crop.sx,
        crop.sy,
        crop.sWidth,
        crop.sHeight,
        insetX + 6,
        insetY + 6,
        insetW - 12,
        insetH - 12
      );
      ctx.restore();

      drawRoundedRectPath(ctx, insetX, insetY, insetW, insetH, 24);
      ctx.lineWidth = 3;
      ctx.strokeStyle = themeColor;
      ctx.stroke();
    }

    drawRoundedRectPath(ctx, contentLeft, cardY, contentWidth, cardHeight, 28);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = themeColor;
    ctx.stroke();

    drawRoundedRectPath(ctx, contentLeft + 22, cardY + 24, 8, Math.max(24, cardHeight - 48), 4);
    ctx.fillStyle = themeColor;
    ctx.fill();

    let cy = cardY + cardPadY;
    ctx.textBaseline = 'top';
    if (headlineLines.length > 0) {
      ctx.font = `800 ${headlineFontSize}px ${FONT_STACK}`;
      ctx.fillStyle = '#FFFFFF';
      for (const line of headlineLines) {
        ctx.fillText(line, cardInnerX, cy);
        cy += headlineLH;
      }
    }
    if (subLines.length > 0) {
      if (headlineLines.length > 0) cy += 14;
      ctx.font = `500 ${subFontSize}px ${FONT_STACK}`;
      ctx.fillStyle = '#CBD5E1';
      for (const line of subLines) {
        ctx.fillText(line, cardInnerX, cy);
        cy += subLH;
      }
    }
    if (ctaText.length > 0) {
      if (headlineLines.length > 0 || subLines.length > 0) cy += 20;
      drawBadgePill(
        ctx,
        cardInnerX,
        cy,
        cardInnerWidth,
        ctaText,
        themeColor,
        themeContrastColor,
        52,
        24
      );
    }
    return;
  }

  // ============================================================================
  // LAYOUT 2: problem_solution (Slide 2 — Contrasting Problem vs Solution Split)
  // ============================================================================
  if (layoutVariant === 'problem_solution') {
    let cursorY = afterHeaderY;
    if (badgeText.length > 0) {
      drawBadgePill(
        ctx,
        contentLeft,
        cursorY,
        contentWidth,
        badgeText,
        themeColor,
        themeContrastColor,
        44,
        22
      );
      cursorY += 62;
    }

    const splitParts = slide.subheadline.split(/\s*(?:→|->|vs)\s*/i).filter(Boolean);
    const problemText =
      splitParts.length >= 2
        ? splitParts[0]
        : 'Pilihan kurang jelas, harga kabur & respons mesej yang perlahan.';
    const solutionSub =
      splitParts.length >= 2 ? splitParts.slice(1).join(' • ') : slide.subheadline;

    const availH = Math.max(360, contentBottom - cursorY);
    const problemCardH = Math.min(250, Math.round(availH * 0.36));

    // Top Problem Card (rose border)
    drawRoundedRectPath(ctx, contentLeft, cursorY, contentWidth, problemCardH, 24);
    ctx.fillStyle = 'rgba(30, 27, 46, 0.90)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#F43F5E';
    ctx.stroke();

    drawBadgePill(
      ctx,
      contentLeft + 24,
      cursorY + 22,
      contentWidth - 48,
      'CABARAN BIASA',
      '#F43F5E',
      '#FFFFFF',
      36,
      19
    );

    ctx.font = `600 26px ${FONT_STACK}`;
    const probLines = wrapTextLines(
      (s) => ctx.measureText(s).width,
      problemText,
      contentWidth - 52,
      3
    );
    ctx.fillStyle = '#FECDD3';
    ctx.textBaseline = 'top';
    let py = cursorY + 74;
    for (const line of probLines) {
      ctx.fillText(line, contentLeft + 26, py);
      py += 34;
    }

    // Bottom Solution Card (themeColor border)
    const solY = cursorY + problemCardH + 22;
    const solH = Math.max(240, contentBottom - solY);
    drawRoundedRectPath(ctx, contentLeft, solY, contentWidth, solH, 26);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = themeColor;
    ctx.stroke();

    drawBadgePill(
      ctx,
      contentLeft + 26,
      solY + 24,
      contentWidth - 52,
      'SOLUSI KAMI',
      themeColor,
      themeContrastColor,
      38,
      20
    );

    const solInnerW = contentWidth - 56;
    const hSize = aspectMode === '9:16' ? 42 : 36;
    const hLH = Math.round(hSize * 1.24);
    ctx.font = `800 ${hSize}px ${FONT_STACK}`;
    const solHeadLines = wrapTextLines((s) => ctx.measureText(s).width, slide.headline, solInnerW, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top';
    let sy = solY + 80;
    for (const line of solHeadLines) {
      ctx.fillText(line, contentLeft + 28, sy);
      sy += hLH;
    }

    if (solutionSub.trim()) {
      sy += 12;
      ctx.font = `500 25px ${FONT_STACK}`;
      ctx.fillStyle = '#CBD5E1';
      const solSubLines = wrapTextLines((s) => ctx.measureText(s).width, solutionSub, solInnerW, 3);
      for (const line of solSubLines) {
        ctx.fillText(line, contentLeft + 28, sy);
        sy += 33;
      }
    }

    if (ctaText.length > 0) {
      drawBadgePill(
        ctx,
        contentLeft + 28,
        Math.min(solY + solH - 76, sy + 20),
        solInnerW,
        ctaText,
        themeColor,
        themeContrastColor,
        52,
        22
      );
    }
    return;
  }

  // ============================================================================
  // LAYOUT 3: feature_grid (Slide 3 — Title Header + 2x2 Feature Highlight Grid)
  // ============================================================================
  if (layoutVariant === 'feature_grid') {
    let cursorY = afterHeaderY;
    if (badgeText.length > 0) {
      drawBadgePill(
        ctx,
        contentLeft,
        cursorY,
        contentWidth,
        badgeText,
        themeColor,
        themeContrastColor,
        44,
        22
      );
      cursorY += 58;
    }

    const hSize = aspectMode === '9:16' ? 42 : 36;
    const hLH = Math.round(hSize * 1.22);
    ctx.font = `800 ${hSize}px ${FONT_STACK}`;
    const headLines = wrapTextLines((s) => ctx.measureText(s).width, slide.headline, contentWidth, 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top';
    for (const line of headLines) {
      ctx.fillText(line, contentLeft, cursorY);
      cursorY += hLH;
    }

    if (slide.subheadline.trim()) {
      cursorY += 8;
      ctx.font = `500 24px ${FONT_STACK}`;
      ctx.fillStyle = '#CBD5E1';
      const subLines = wrapTextLines(
        (s) => ctx.measureText(s).width,
        slide.subheadline,
        contentWidth,
        2
      );
      for (const line of subLines) {
        ctx.fillText(line, contentLeft, cursorY);
        cursorY += 32;
      }
    }

    cursorY += 20;
    const footerH = ctaText.length > 0 ? 64 : 0;
    const gridAvailH = Math.max(240, contentBottom - cursorY - footerH);
    const gap = 18;
    const cellW = Math.floor((contentWidth - gap) / 2);
    const cellH = Math.min(220, Math.floor((gridAvailH - gap) / 2));

    const points =
      slide.highlightPoints && slide.highlightPoints.length > 0
        ? slide.highlightPoints
        : slide.subheadline
            .split(/[|,;•.]+/)
            .map((p) => p.trim())
            .filter((p) => p.length >= 3);
    const gridItems = [0, 1, 2, 3].map(
      (i) =>
        points[i] ??
        ['Kualiti konsisten', 'Harga telus jelas', 'Mesra pengguna', 'Tempahan pantas'][i]
    );

    for (let i = 0; i < 4; i += 1) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const gx = contentLeft + col * (cellW + gap);
      const gy = cursorY + row * (cellH + gap);

      drawRoundedRectPath(ctx, gx, gy, cellW, cellH, 22);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = themeColor;
      ctx.stroke();

      drawRoundedRectPath(ctx, gx + 18, gy + 18, 52, 36, 12);
      ctx.fillStyle = themeColor;
      ctx.fill();
      ctx.fillStyle = themeContrastColor;
      ctx.font = `800 20px ${FONT_STACK}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(`0${i + 1}`, gx + 31, gy + 36);

      ctx.font = `700 23px ${FONT_STACK}`;
      ctx.fillStyle = '#F8FAFC';
      ctx.textBaseline = 'top';
      const itemLines = wrapTextLines(
        (s) => ctx.measureText(s).width,
        gridItems[i],
        cellW - 36,
        3
      );
      let iy = gy + 70;
      for (const line of itemLines) {
        ctx.fillText(line, gx + 18, iy);
        iy += 30;
      }
    }

    if (ctaText.length > 0) {
      drawBadgePill(
        ctx,
        contentLeft,
        contentBottom - 54,
        contentWidth,
        ctaText,
        themeColor,
        themeContrastColor,
        54,
        24
      );
    }
    return;
  }

  // ============================================================================
  // LAYOUT 4: urgent_cta (Slide 4 — Centered Urgent Offer Card + WhatsApp CTA Pill)
  // ============================================================================
  const cardPadX = 36;
  const cardPadY = 38;
  const innerW = Math.max(180, contentWidth - cardPadX * 2);
  const headlineSize = aspectMode === '9:16' ? 50 : 44;
  const headlineLH = Math.round(headlineSize * 1.22);

  ctx.font = `800 ${headlineSize}px ${FONT_STACK}`;
  const ctaHeadLines = wrapTextLines((s) => ctx.measureText(s).width, slide.headline, innerW, 3);
  ctx.font = `600 28px ${FONT_STACK}`;
  const ctaSubLines = wrapTextLines((s) => ctx.measureText(s).width, slide.subheadline, innerW, 2);

  const badgeBlockH = badgeText.length > 0 ? 64 : 0;
  const ctaBtnH = ctaText.length > 0 ? 78 : 0;
  const totalContentH =
    cardPadY * 2 +
    badgeBlockH +
    ctaHeadLines.length * headlineLH +
    (ctaSubLines.length > 0 ? 18 + ctaSubLines.length * 36 : 0) +
    (ctaBtnH > 0 ? 28 + ctaBtnH : 0);

  const cardH = Math.max(300, totalContentH);
  const cardY = Math.max(afterHeaderY + 32, Math.round((afterHeaderY + contentBottom - cardH) / 2));

  // Outer glow frame + Dark Callout Card
  drawRoundedRectPath(ctx, contentLeft - 4, cardY - 4, contentWidth + 8, cardH + 8, 34);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = themeColor;
  ctx.stroke();

  drawRoundedRectPath(ctx, contentLeft, cardY, contentWidth, cardH, 30);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = themeColor;
  ctx.stroke();

  let cy = cardY + cardPadY;
  if (badgeText.length > 0) {
    drawBadgePill(
      ctx,
      contentLeft + cardPadX,
      cy,
      innerW,
      badgeText,
      themeColor,
      themeContrastColor,
      46,
      22
    );
    cy += 64;
  }

  ctx.textBaseline = 'top';
  ctx.font = `800 ${headlineSize}px ${FONT_STACK}`;
  ctx.fillStyle = '#FFFFFF';
  for (const line of ctaHeadLines) {
    ctx.fillText(line, contentLeft + cardPadX, cy);
    cy += headlineLH;
  }

  if (ctaSubLines.length > 0) {
    cy += 18;
    ctx.font = `600 28px ${FONT_STACK}`;
    ctx.fillStyle = '#A7F3D0';
    for (const line of ctaSubLines) {
      ctx.fillText(line, contentLeft + cardPadX, cy);
      cy += 36;
    }
  }

  if (ctaText.length > 0) {
    cy += 28;
    const waPillW = Math.min(innerW, Math.max(300, innerW));
    drawRoundedRectPath(ctx, contentLeft + cardPadX, cy, waPillW, 68, 34);
    ctx.fillStyle = '#16A34A';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = themeColor;
    ctx.stroke();

    ctx.font = `800 26px ${FONT_STACK}`;
    const btnLines = wrapTextLines((s) => ctx.measureText(s).width, ctaText, waPillW - 44, 1);
    const btnLabel = btnLines[0] ?? ctaText;
    const btnTextW = ctx.measureText(btnLabel).width;
    const textX = contentLeft + cardPadX + Math.max(22, (waPillW - btnTextW) / 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(btnLabel, textX, cy + 34);
  }
}

export async function exportSlideAsPng(
  options: ExportSlideOptions
): Promise<{ blob: Blob; filename: string }> {
  const canvas = document.createElement('canvas');
  await renderSlideToCanvas(canvas, options);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result || result.size === 0) {
        reject(new Error('Failed to export PNG image blob'));
        return;
      }
      resolve(result);
    }, 'image/png');
  });

  const ratioTag = options.aspectMode === '9:16' ? '9x16' : '4x5';
  const filename = `carousel-slide-${options.slide.index + 1}-${ratioTag}.png`;

  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(() => {
        if (typeof URL.revokeObjectURL === 'function') {
          URL.revokeObjectURL(blobUrl);
        }
      }, 10_000);
    }
  }

  return { blob, filename };
}
