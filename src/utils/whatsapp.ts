import type { AngleId } from '../types/campaign';

export const FALLBACK_WHATSAPP_DIGITS = '60123456789';

export const ANGLE_WHATSAPP_TAGS: Record<AngleId, string> = {
  urgency: '[Kod: SUDUT-1-SEGERA]',
  value: '[Kod: SUDUT-2-NILAI]',
  social_proof: '[Kod: SUDUT-3-BUKTISOSIAL]',
};

/**
 * Strips unpaired UTF-16 surrogates so encodeURIComponent never throws URIError.
 */
export function stripLoneSurrogates(text: string): string {
  let out = '';
  for (const cp of text) {
    if (cp.length === 1) {
      const code = cp.charCodeAt(0);
      if (code >= 0xd800 && code <= 0xdfff) {
        continue;
      }
    }
    out += cp;
  }
  return out;
}

/**
 * Slices a string to at most `maxUnits` UTF-16 code units without splitting surrogate pairs
 * or emitting lone surrogates.
 */
export function sliceSafeUtf16(text: string, maxUnits: number): string {
  if (maxUnits <= 0) {
    return '';
  }
  let out = '';
  let units = 0;
  for (const cp of text) {
    if (cp.length === 1) {
      const code = cp.charCodeAt(0);
      if (code >= 0xd800 && code <= 0xdfff) {
        continue;
      }
    }
    if (units + cp.length > maxUnits) {
      break;
    }
    out += cp;
    units += cp.length;
  }
  return out;
}

const DANGLING_TRAILING_WORDS_RX =
  /(?:\b(?:di|ke|dari|dan|atau|serta|untuk|dengan|pada|dalam|yang|tanpa|edisi|kolaborasi|rasa|itu|x)|(?:^|\s)×)$/i;

const TIME_OR_UNIT_NOUN_RX =
  /\b(?:hari|minggu|bulan|tahun|kali|edisi|batch)$/i;

const TRAILING_TRUNCATION_PUNCT_RX = /[\s,.;:!?—–\-•|/(&+]+$/g;

/**
 * Truncates text at a safe UTF-16 and word boundary without cutting words mid-character
 * or leaving trailing punctuation/dangling connectors.
 */
export function truncateAtWordBoundary(text: string, maxLen: number): string {
  const normalized = stripLoneSurrogates(text).replace(/\s+/g, ' ').trim();
  if (!normalized || maxLen <= 0) {
    return '';
  }
  if (normalized.length <= maxLen) {
    return normalized;
  }

  const sliced = sliceSafeUtf16(normalized, maxLen);
  const nextChar = normalized.slice(sliced.length, sliced.length + 1);

  let cut = sliced;
  const cutsMidWord = nextChar.length > 0 && !/[\s,.;:!?—–\-)(\]/]/.test(nextChar);
  if (cutsMidWord) {
    const lastSpace = sliced.lastIndexOf(' ');
    if (lastSpace >= Math.floor(maxLen * 0.4)) {
      cut = sliced.slice(0, lastSpace);
    }
  }

  cut = cut.replace(TRAILING_TRUNCATION_PUNCT_RX, '').trim();

  const minRetainedLen = Math.max(4, Math.floor(maxLen * 0.35));
  let prev = '';
  while (cut !== prev) {
    prev = cut;
    let stripped = cut
      .replace(DANGLING_TRAILING_WORDS_RX, '')
      .replace(TRAILING_TRUNCATION_PUNCT_RX, '')
      .trim();

    if (/\bini$/i.test(stripped)) {
      const beforeIni = stripped.replace(/\bini$/i, '').trim();
      if (!TIME_OR_UNIT_NOUN_RX.test(beforeIni)) {
        stripped = beforeIni.replace(TRAILING_TRUNCATION_PUNCT_RX, '').trim();
      }
    }

    if (stripped.length >= minRetainedLen) {
      cut = stripped;
    }
  }

  return cut || sliced.trimEnd();
}

/**
 * Normalizes Malaysian (01x, 03-09, +60, 60, +60 01x) and international (+65, 0065, +0065)
 * WhatsApp numbers into bare E.164-like digit strings without enforcing length bounds.
 */
export function normalizeWhatsappDigits(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  let digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  // Strip international 00-prefix even when preceded by '+' (e.g. +0065 -> 65),
  // before handling Malaysian local 0-prefix so 0065... isn't turned into 60065...
  while (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (/^0[13-9]/.test(digits)) {
    digits = `60${digits.slice(1)}`;
  }

  // Strip redundant trunk zero after Malaysian country code (+60 012... -> 6012...)
  if (/^600[13-9]/.test(digits)) {
    digits = `60${digits.slice(3)}`;
  }

  return digits;
}

/**
 * Normalizes Malaysian (01x, 03-09, +60, 60, +60 01x) and international (+65, 0065, +0065)
 * WhatsApp numbers into bare E.164-like digit strings (8-15 digits).
 * Returns '' for invalid or too-short inputs.
 */
export function normalizeWhatsappNumber(raw: string): string {
  const digits = normalizeWhatsappDigits(raw);

  if (digits.startsWith('0') || digits.length < 8 || digits.length > 15) {
    return '';
  }

  return digits;
}

export function getSafeWhatsappDigits(
  raw: string,
  fallback: string = FALLBACK_WHATSAPP_DIGITS
): string {
  return normalizeWhatsappNumber(raw) || fallback;
}

export function buildWhatsappCtaUrl(params: {
  phone: string;
  brandName: string;
  offerSentence: string;
  angle: AngleId;
}): string {
  const digits = getSafeWhatsappDigits(params.phone);
  const tag = ANGLE_WHATSAPP_TAGS[params.angle];
  const brand = stripLoneSurrogates(params.brandName.trim()) || 'Bisnes Saya';
  const cleanOffer = stripLoneSurrogates(params.offerSentence.trim().replace(/\s+/g, ' '));
  const shortOffer =
    cleanOffer.length > 120
      ? `${sliceSafeUtf16(cleanOffer, 117).trimEnd()}...`
      : cleanOffer;

  const text = shortOffer
    ? `Hai ${brand}, saya berminat dengan "${shortOffer}". ${tag}`
    : `Hai ${brand}, boleh kongsi maklumat promosi terkini? ${tag}`;

  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * Replaces the phone digits in any `https://wa.me/<digits>` URL (standalone or embedded inside copy)
 * while preserving the rest of the user's edited copy and angle query parameter.
 */
export function rewriteWhatsappUrlPhone(textOrUrl: string, nextPhone: string): string {
  const digits = getSafeWhatsappDigits(nextPhone);
  return textOrUrl.replace(/https:\/\/wa\.me\/\d+/g, `https://wa.me/${digits}`);
}
