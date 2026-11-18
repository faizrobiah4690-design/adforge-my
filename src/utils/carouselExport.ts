import type { AspectRatioMode, BrandProfile, CarouselSlide } from '../types/campaign';

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

  const [photoImg, logoImg] = await Promise.all([
    loadDecodedImage(photoSrc),
    loadDecodedImage(brand.logoDataUrl),
  ]);

  const themeColor = resolveThemeColor(brand.themeColor);
  const themeContrastColor = getContrastTextColor(themeColor);

  // Layer 1: Dark base + cover-cropped photo (or deterministic fallback) + dark scrims
  ctx.fillStyle = '#0B0F19';
  ctx.fillRect(0, 0, width, height);

  if (photoImg && photoImg.naturalWidth > 0 && photoImg.naturalHeight > 0) {
    const crop = computeCoverCrop(photoImg.naturalWidth, photoImg.naturalHeight, width, height);
    ctx.drawImage(
      photoImg,
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
    ctx.beginPath();
    ctx.arc(width * 0.72, height * 0.34, width * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const topScrim = ctx.createLinearGradient(0, 0, 0, height * 0.36);
  topScrim.addColorStop(0, 'rgba(4, 9, 20, 0.74)');
  topScrim.addColorStop(1, 'rgba(4, 9, 20, 0)');
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, width, height * 0.36);

  const bottomScrim = ctx.createLinearGradient(0, height * 0.36, 0, height);
  bottomScrim.addColorStop(0, 'rgba(4, 9, 20, 0.08)');
  bottomScrim.addColorStop(0.6, 'rgba(4, 9, 20, 0.72)');
  bottomScrim.addColorStop(1, 'rgba(4, 9, 20, 0.94)');
  ctx.fillStyle = bottomScrim;
  ctx.fillRect(0, height * 0.36, width, height * 0.64);

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
  const headerY = contentTop + 24;
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

  // Badge pill below header
  const badgeText = slide.badgeText.trim();
  if (badgeText.length > 0) {
    const badgeY = headerY + logoBoxSize + 20;
    ctx.font = `700 22px ${FONT_STACK}`;
    const maxBadgeTextW = contentWidth - 44;
    const badgeLines = wrapTextLines((s) => ctx.measureText(s).width, badgeText, maxBadgeTextW, 1);
    const badgeLabel = badgeLines[0] ?? badgeText;
    const badgeTextW = ctx.measureText(badgeLabel).width;
    const badgePillW = Math.min(contentWidth, badgeTextW + 44);
    const badgePillH = 44;

    drawRoundedRectPath(ctx, contentLeft, badgeY, badgePillW, badgePillH, 22);
    ctx.fillStyle = themeColor;
    ctx.fill();

    ctx.fillStyle = themeContrastColor;
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeLabel, contentLeft + 22, badgeY + badgePillH / 2 + 1);
  }

  // Bottom foreground accent card
  const cardPadX = 36;
  const cardPadY = 32;
  const accentStripOffset = 22;
  const cardInnerX = contentLeft + cardPadX + accentStripOffset;
  const cardInnerWidth = Math.max(180, contentWidth - cardPadX * 2 - accentStripOffset);

  const headlineFontSize = aspectMode === '9:16' ? 48 : 42;
  const headlineLineHeight = Math.round(headlineFontSize * 1.24);
  const subFontSize = aspectMode === '9:16' ? 27 : 25;
  const subLineHeight = Math.round(subFontSize * 1.32);

  ctx.font = `800 ${headlineFontSize}px ${FONT_STACK}`;
  const headlineLines = wrapTextLines(
    (s) => ctx.measureText(s).width,
    slide.headline,
    cardInnerWidth,
    4
  );

  ctx.font = `500 ${subFontSize}px ${FONT_STACK}`;
  const subheadlineLines = wrapTextLines(
    (s) => ctx.measureText(s).width,
    slide.subheadline,
    cardInnerWidth,
    3
  );

  const ctaText = slide.ctaText.trim();
  const ctaHeight = ctaText.length > 0 ? 56 : 0;

  let bodyHeight = 0;
  if (headlineLines.length > 0) {
    bodyHeight += headlineLines.length * headlineLineHeight;
  }
  if (subheadlineLines.length > 0) {
    if (bodyHeight > 0) bodyHeight += 16;
    bodyHeight += subheadlineLines.length * subLineHeight;
  }
  if (ctaHeight > 0) {
    if (bodyHeight > 0) bodyHeight += 24;
    bodyHeight += ctaHeight;
  }
  if (bodyHeight === 0) {
    bodyHeight = 40;
  }

  const cardHeight = cardPadY * 2 + bodyHeight;
  const cardY = Math.max(headerY + logoBoxSize + 84, contentBottom - cardHeight);

  drawRoundedRectPath(ctx, contentLeft, cardY, contentWidth, cardHeight, 28);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = themeColor;
  ctx.stroke();

  // Prominent theme color accent strip inside the card
  drawRoundedRectPath(ctx, contentLeft + 22, cardY + 26, 8, Math.max(24, cardHeight - 52), 4);
  ctx.fillStyle = themeColor;
  ctx.fill();

  let cursorY = cardY + cardPadY;
  ctx.textBaseline = 'top';

  if (headlineLines.length > 0) {
    ctx.font = `800 ${headlineFontSize}px ${FONT_STACK}`;
    ctx.fillStyle = '#FFFFFF';
    for (const line of headlineLines) {
      ctx.fillText(line, cardInnerX, cursorY);
      cursorY += headlineLineHeight;
    }
  }

  if (subheadlineLines.length > 0) {
    if (headlineLines.length > 0) {
      cursorY += 16;
    }
    ctx.font = `500 ${subFontSize}px ${FONT_STACK}`;
    ctx.fillStyle = '#CBD5E1';
    for (const line of subheadlineLines) {
      ctx.fillText(line, cardInnerX, cursorY);
      cursorY += subLineHeight;
    }
  }

  if (ctaText.length > 0) {
    if (headlineLines.length > 0 || subheadlineLines.length > 0) {
      cursorY += 24;
    }
    ctx.font = `700 24px ${FONT_STACK}`;
    const ctaLines = wrapTextLines(
      (s) => ctx.measureText(s).width,
      ctaText,
      cardInnerWidth - 48,
      1
    );
    const ctaLabel = ctaLines[0] ?? ctaText;
    const ctaTextW = ctx.measureText(ctaLabel).width;
    const ctaPillW = Math.min(cardInnerWidth, ctaTextW + 52);

    drawRoundedRectPath(ctx, cardInnerX, cursorY, ctaPillW, ctaHeight, 28);
    ctx.fillStyle = themeColor;
    ctx.fill();

    ctx.fillStyle = themeContrastColor;
    ctx.textBaseline = 'middle';
    ctx.fillText(ctaLabel, cardInnerX + 26, cursorY + ctaHeight / 2 + 1);
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
