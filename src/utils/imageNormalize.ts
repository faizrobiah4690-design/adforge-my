export type ImageNormalizeKind = 'logo' | 'photo';

export type ImageNormalizeErrorCode =
  | 'NO_FILE'
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_TYPE'
  | 'READ_FAILED'
  | 'CORRUPT_IMAGE'
  | 'CANVAS_UNAVAILABLE'
  | 'EXPORT_FAILED';

export class ImageNormalizeError extends Error {
  public readonly code: ImageNormalizeErrorCode;

  constructor(code: ImageNormalizeErrorCode, message: string) {
    super(message);
    this.name = 'ImageNormalizeError';
    this.code = code;
  }
}

export interface NormalizedImageResult {
  dataUrl: string;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  wasResized: boolean;
}

export interface ImageNormalizeDeps {
  createFileReader?: () => FileReader;
  createImage?: () => HTMLImageElement;
  createCanvas?: () => HTMLCanvasElement;
}

export interface NormalizeImageOptions {
  kind: ImageNormalizeKind;
  maxDimension?: number;
  maxFileBytes?: number;
  jpegQuality?: number;
  deps?: ImageNormalizeDeps;
}

export const DEFAULT_MAX_DIMENSION = 1600;
export const DEFAULT_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const DEFAULT_JPEG_QUALITY = 0.9;

type AllowedSourceMime = 'image/png' | 'image/jpeg' | 'image/webp';

function extractLowerExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const dotIdx = trimmed.lastIndexOf('.');
  if (dotIdx < 0 || dotIdx === trimmed.length - 1) {
    return '';
  }
  return trimmed.slice(dotIdx + 1).toLowerCase();
}

export function isDataImageUrl(value: string): boolean {
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(value.trim());
}

export function validateImageFile(
  file: File | null | undefined,
  kind: ImageNormalizeKind,
  maxFileBytes: number = DEFAULT_MAX_FILE_BYTES
): { resolvedMime: AllowedSourceMime } {
  if (!file) {
    throw new ImageNormalizeError('NO_FILE', 'Tiada fail imej dipilih.');
  }
  if (file.size <= 0) {
    throw new ImageNormalizeError('EMPTY_FILE', 'Fail imej adalah kosong (0 bait).');
  }
  if (file.size > maxFileBytes) {
    throw new ImageNormalizeError(
      'FILE_TOO_LARGE',
      `Saiz fail melebihi had maksimum (${Math.round(maxFileBytes / (1024 * 1024))} MB).`
    );
  }

  const rawMime = (file.type || '').trim().toLowerCase();
  const ext = extractLowerExtension(file.name || '');

  if (kind === 'logo') {
    const mimeOk = rawMime === '' || rawMime === 'image/png';
    const extOk = ext === '' || ext === 'png';
    if (!mimeOk || !extOk || (rawMime === '' && ext === '')) {
      throw new ImageNormalizeError(
        'INVALID_TYPE',
        'Logo jenama mestilah fail imej PNG (.png) yang sah.'
      );
    }
    return { resolvedMime: 'image/png' };
  }

  const allowedPhotoMimes: Record<string, AllowedSourceMime> = {
    'image/png': 'image/png',
    'image/jpeg': 'image/jpeg',
    'image/jpg': 'image/jpeg',
    'image/webp': 'image/webp',
  };
  const allowedPhotoExts: Record<string, AllowedSourceMime> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };

  if (rawMime !== '' && !allowedPhotoMimes[rawMime]) {
    throw new ImageNormalizeError(
      'INVALID_TYPE',
      'Format foto tidak disokong. Sila pilih PNG, JPG, atau WEBP.'
    );
  }
  if (ext !== '' && !allowedPhotoExts[ext]) {
    throw new ImageNormalizeError(
      'INVALID_TYPE',
      'Sambungan fail foto tidak disokong. Sila pilih .png, .jpg, atau .webp.'
    );
  }

  const resolvedMime = allowedPhotoMimes[rawMime] ?? allowedPhotoExts[ext];
  if (!resolvedMime) {
    throw new ImageNormalizeError(
      'INVALID_TYPE',
      'Format foto tidak dapat dikenal pasti. Sila pilih PNG, JPG, atau WEBP.'
    );
  }

  return { resolvedMime };
}

export function computeContainedDimensions(
  width: number,
  height: number,
  maxDimension: number = DEFAULT_MAX_DIMENSION
): { width: number; height: number; wasResized: boolean } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new ImageNormalizeError(
      'CORRUPT_IMAGE',
      'Dimensi imej tidak sah atau fail rosak.'
    );
  }

  const safeMax = Number.isFinite(maxDimension) && maxDimension > 0 ? maxDimension : DEFAULT_MAX_DIMENSION;

  if (width <= safeMax && height <= safeMax) {
    return {
      width: Math.round(width),
      height: Math.round(height),
      wasResized: false,
    };
  }

  const scale = safeMax / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    wasResized: true,
  };
}

export function readFileAsDataUrl(
  file: File,
  createFileReader?: () => FileReader
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = createFileReader ? createFileReader() : new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
        resolve(reader.result);
      } else {
        reject(new ImageNormalizeError('READ_FAILED', 'Gagal membaca data imej.'));
      }
    };

    reader.onerror = () => {
      reject(new ImageNormalizeError('READ_FAILED', 'Ralat berlaku semasa membaca fail imej.'));
    };

    reader.onabort = () => {
      reject(new ImageNormalizeError('READ_FAILED', 'Pembacaan fail imej dibatalkan.'));
    };

    try {
      reader.readAsDataURL(file);
    } catch {
      reject(new ImageNormalizeError('READ_FAILED', 'Tidak dapat memulakan pembacaan fail imej.'));
    }
  });
}

export function loadImageElement(
  dataUrl: string,
  createImage?: () => HTMLImageElement
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = createImage ? createImage() : new Image();

    img.onload = () => {
      const rawW = img.naturalWidth !== undefined ? img.naturalWidth : img.width;
      const rawH = img.naturalHeight !== undefined ? img.naturalHeight : img.height;
      if (!Number.isFinite(rawW) || !Number.isFinite(rawH) || rawW <= 0 || rawH <= 0) {
        reject(
          new ImageNormalizeError(
            'CORRUPT_IMAGE',
            'Imej rosak atau mempunyai dimensi sifar.'
          )
        );
        return;
      }
      resolve(img);
    };

    img.onerror = () => {
      reject(
        new ImageNormalizeError(
          'CORRUPT_IMAGE',
          'Gagal menyahkod fail imej. Sila cuba fail lain.'
        )
      );
    };

    img.src = dataUrl;
  });
}

export async function normalizeImageFile(
  file: File | null | undefined,
  options: NormalizeImageOptions
): Promise<NormalizedImageResult> {
  const {
    kind,
    maxDimension = DEFAULT_MAX_DIMENSION,
    maxFileBytes = DEFAULT_MAX_FILE_BYTES,
    jpegQuality = DEFAULT_JPEG_QUALITY,
    deps,
  } = options;

  const { resolvedMime } = validateImageFile(file, kind, maxFileBytes);
  const sourceDataUrl = await readFileAsDataUrl(file as File, deps?.createFileReader);
  const img = await loadImageElement(sourceDataUrl, deps?.createImage);

  const originalWidth = img.naturalWidth !== undefined ? img.naturalWidth : img.width;
  const originalHeight = img.naturalHeight !== undefined ? img.naturalHeight : img.height;

  const { width, height, wasResized } = computeContainedDimensions(
    originalWidth,
    originalHeight,
    maxDimension
  );

  const canvas = deps?.createCanvas
    ? deps.createCanvas()
    : document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new ImageNormalizeError(
      'CANVAS_UNAVAILABLE',
      'Konteks kanvas 2D tidak tersedia untuk memproses imej.'
    );
  }

  ctx.clearRect(0, 0, width, height);

  const outputMime: 'image/png' | 'image/jpeg' =
    kind === 'logo' || resolvedMime === 'image/png' ? 'image/png' : 'image/jpeg';

  if (outputMime === 'image/jpeg') {
    ctx.fillStyle = '#0B0F19';
    ctx.fillRect(0, 0, width, height);
  }

  ctx.drawImage(img, 0, 0, width, height);

  let dataUrl = '';
  try {
    dataUrl =
      outputMime === 'image/jpeg'
        ? canvas.toDataURL('image/jpeg', jpegQuality)
        : canvas.toDataURL('image/png');
  } catch {
    throw new ImageNormalizeError('EXPORT_FAILED', 'Gagal mengeksport data imej.');
  }

  if (
    typeof dataUrl !== 'string' ||
    !dataUrl.startsWith(`data:${outputMime}`) ||
    dataUrl.startsWith('blob:') ||
    dataUrl.length <= 32
  ) {
    throw new ImageNormalizeError(
      'EXPORT_FAILED',
      'Hasil eksport imej tidak sah atau kosong.'
    );
  }

  return {
    dataUrl,
    mimeType: outputMime,
    width,
    height,
    originalWidth,
    originalHeight,
    wasResized,
  };
}

export function normalizeLogoFile(
  file: File | null | undefined,
  deps?: ImageNormalizeDeps
): Promise<NormalizedImageResult> {
  return normalizeImageFile(file, {
    kind: 'logo',
    maxDimension: DEFAULT_MAX_DIMENSION,
    deps,
  });
}

export function normalizePhotoFile(
  file: File | null | undefined,
  deps?: ImageNormalizeDeps
): Promise<NormalizedImageResult> {
  return normalizeImageFile(file, {
    kind: 'photo',
    maxDimension: DEFAULT_MAX_DIMENSION,
    deps,
  });
}
