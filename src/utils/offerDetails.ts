import type { OfferDetails, VariationFrameworkId } from '../types/campaign';
import { truncateAtWordBoundary } from './whatsapp';

export const VARIATION_FRAMEWORKS: readonly VariationFrameworkId[] = [
  'pas',
  'bab',
  'pov_ugc',
  'smart_buyer',
  'fomo_drop',
];

export function getFrameworkForVariation(variationIndex: number): VariationFrameworkId {
  const safeIndex =
    Number.isFinite(variationIndex) && variationIndex >= 1
      ? Math.floor(variationIndex)
      : 1;
  return VARIATION_FRAMEWORKS[(safeIndex - 1) % VARIATION_FRAMEWORKS.length];
}

export function cleanOfferText(offerSentence: string): string {
  const normalized = offerSentence.trim().replace(/\s+/g, ' ');
  return normalized || 'Promosi istimewa minggu ini — pilihan terhad untuk pelanggan terawal.';
}

export function stripDuplicateTawaran(text: string): string {
  return text.replace(/\b(tawaran)(?:\s+\1)+\b/gi, '$1').replace(/\s{2,}/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsTokenCaseInsensitive(
  haystack: string,
  needle: string | null | undefined
): boolean {
  const cleanNeedle = needle?.replace(/\s+/g, ' ').trim();
  if (!cleanNeedle) return false;
  const cleanHaystack = haystack.replace(/\s+/g, ' ').trim();
  if (!cleanHaystack) return false;
  const pattern = new RegExp(
    `(?:^|[\\s(,.;:!?—–\\-•|/+"'])${escapeRegExp(cleanNeedle)}(?:$|[\\s),.;:!?—–\\-•|/+"'])`,
    'i'
  );
  return pattern.test(cleanHaystack);
}

export function appendCollabIfAbsent(
  base: string,
  collabTag: string | null | undefined,
  format: 'space' | 'parens' = 'space'
): string {
  const cleanBase = base.trim();
  const cleanCollab = collabTag?.trim();
  if (!cleanCollab) return cleanBase;
  if (containsTokenCaseInsensitive(cleanBase, cleanCollab)) {
    return cleanBase;
  }
  return format === 'parens'
    ? `${cleanBase} (${cleanCollab})`.trim()
    : `${cleanBase} ${cleanCollab}`.trim();
}

export function appendTokenIfAbsent(
  base: string,
  token: string | null | undefined,
  separator = ' '
): string {
  const cleanBase = base.trim();
  const cleanToken = token?.trim();
  if (!cleanToken) return cleanBase;
  if (!cleanBase) return cleanToken;
  if (containsTokenCaseInsensitive(cleanBase, cleanToken)) {
    return cleanBase;
  }
  return `${cleanBase}${separator}${cleanToken}`.trim();
}

export function extractOfferFocus(offerSentence: string): string {
  const lower = offerSentence.toLowerCase();
  if (/diskaun|promo|jimat|potongan|sale|rebate/.test(lower)) return 'Harga Promo Berbaloi';
  if (/pakej|kombo|bundle|set/.test(lower)) return 'Set Kombo Jimat';
  if (/servis|khidmat|tempahan|booking|penghantaran|bengkel/.test(lower)) return 'Servis Terus Siap';
  if (/makanan|minuman|menu|kopi|kek|kafe|restoran/.test(lower)) return 'Menu Segar Hari Ini';
  if (/produk|koleksi|stok|item|edisi|fesyen|baju|butik/.test(lower)) return 'Edisi Terkini';
  return 'Tawaran Eksklusif';
}

export function extractUspAndAudience(uspAndAudience?: string): {
  uspSummary: string | null;
  targetAudience: string | null;
  highlightPoints: string[];
} {
  const raw = (uspAndAudience ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) {
    return { uspSummary: null, targetAudience: null, highlightPoints: [] };
  }

  // Split by common separators (e.g. "untuk ...", "|", ";", ",", "•")
  const audienceSplit = raw.match(/^(.*?)\b(?:untuk|for|sasaran|target)\b[:\s-]*(.+)$/i);
  let uspSummary: string | null = raw;
  let targetAudience: string | null = null;

  if (audienceSplit) {
    const left = audienceSplit[1]?.replace(/[|,;•-]+$/g, '').trim();
    const right = audienceSplit[2]?.replace(/^[|,;•-]+/g, '').trim();
    if (left) {
      uspSummary = left;
    }
    if (right) {
      targetAudience = right;
    }
  } else {
    const segments = raw
      .split(/[|;•]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length >= 2) {
      uspSummary = segments[0];
      targetAudience = segments.slice(1).join(', ');
    }
  }

  const highlightPoints = raw
    .split(/[|,;•\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3)
    .slice(0, 4);

  return {
    uspSummary: uspSummary || null,
    targetAudience: targetAudience || null,
    highlightPoints,
  };
}

const STOPWORD_RX =
  /^(?:promosi|promo|diskaun|potongan|sale|rebate|harga|untuk|sempena|pelanggan|terawal|whatsapp|wasap|ws|sekarang|hari|ini|sahaja|cepat|stok|slot|kuota|terhad|tawaran|istimewa|khas|edisi|terbaru|baharu|hebat|grab|order|tempah|minggu|gaji|payday|di|dan|yang|dengan|ke|dari|anda|kami|jom|unit|kini|jimat)$/i;

const COLLAB_TRAILING_STOP_RX =
  /\b(?:untuk|sempena|edisi|promosi|promo|diskaun|harga|rm\s*\d+|di|minggu|gaji|stok|slot|terhad|hebat|istimewa|terbaru|baharu|pakej|kombo|percuma|beli|whatsapp|sekarang)\b.*$/i;

export function extractOfferDetails(
  brandName: string,
  offerSentence: string,
  uspAndAudience?: string
): OfferDetails {
  const cleanBrand = brandName.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(offerSentence);
  const uspParsed = extractUspAndAudience(uspAndAudience);
  const combined = `${cleanBrand} ${cleanOffer} ${uspAndAudience ?? ''}`;

  // 1. Collaboration tag e.g. "X HelloKitty" (requires whitespace after x/× so "Xiaomi" / "Xpress" are never misparsed)
  // Match brandName and offerSentence separately so a collab in brandName never bleeds into offer words.
  let collabTag: string | null = null;
  const collabRx = /(?:^|[\s(])[x×]\s+([A-Za-z0-9][A-Za-z0-9&+-]*(?:\s+[A-Za-z0-9&+-]+){0,2})/i;
  const collabMatch = cleanBrand.match(collabRx) ?? cleanOffer.match(collabRx);
  if (collabMatch?.[1]) {
    const cleanedCollab = collabMatch[1]
      .replace(COLLAB_TRAILING_STOP_RX, '')
      .replace(/[,.;:!?]+$/g, '')
      .trim();
    if (cleanedCollab) {
      collabTag = `X ${cleanedCollab}`;
    }
  }

  // 2. Discount percentage (1-99% only, never 100% to avoid compliance trigger)
  let discountPercent: string | null = null;
  const pctMatches = combined.match(/\b([1-9]\d?\s*%)/g);
  if (pctMatches) {
    for (const m of pctMatches) {
      const normalizedPct = m.replace(/\s+/g, '');
      const num = Number.parseInt(normalizedPct, 10);
      if (num > 0 && num < 100) {
        discountPercent = normalizedPct;
        break;
      }
    }
  }

  // 3. RM price tag e.g. RM899, RM19.90
  const priceMatch = combined.match(/\bRM\s*(\d+(?:[.,]\d{1,2})?)\b/i);
  const priceTag = priceMatch?.[1] ? `RM${priceMatch[1]}` : null;

  // 4. Bundle / Freebie cue (preserve decimal prices like RM12.90 while still stopping at sentence dots)
  const bundleMatch = cleanOffer.match(
    /\b(?:beli\s+\d+\s+percuma\s+\d+|percuma\s+(?:\.(?=\d)|[^,.;—\n-])+|kombo\s+(?:\.(?=\d)|[^,.;—\n-])+|pakej\s+(?:\.(?=\d)|[^,.;—\n-])+|bundle\s+(?:\.(?=\d)|[^,.;—\n-])+)\b/i
  );
  const bundleOrFreebie = bundleMatch?.[0]
    ? truncateAtWordBoundary(bundleMatch[0], 44) || null
    : null;

  // 5. Occasion (prioritize specific seasonal/payday occasions before generic edition labels)
  const seasonalOccasionMatch = combined.match(
    /\b(?:minggu\s+gaji|hari\s+gaji|payday|raya|aidilfitri|ramadan|merdeka|11\.11|12\.12|hujung\s+minggu)\b/i
  );
  const genericEditionMatch = combined.match(/\b(?:edisi\s+(?:khas|terhad|baharu))\b/i);
  const occasion =
    seasonalOccasionMatch?.[0]?.trim() ?? genericEditionMatch?.[0]?.trim() ?? null;

  // 6. Scarcity cue
  const scarcityMatch = combined.match(
    /\b(?:stok\s*&\s*slot\s+terhad|stok\s+terhad|slot\s+terhad|kuota\s+terhad|pelanggan\s+terawal|unit\s+terhad)\b/i
  );
  const scarcityCue = scarcityMatch?.[0] ? scarcityMatch[0].trim() : null;

  // 7. Substantive product topic nouns
  const topicRaw = cleanOffer
    .replace(/\bRM\s*\d+(?:[.,]\d{1,2})?\b/gi, ' ')
    .replace(/\b\d{1,3}\s*%/g, ' ')
    .replace(/[—–\-•|:;,."'!/?()[\]{}]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOPWORD_RX.test(w));

  const uniqueWords: string[] = [];
  for (const w of topicRaw) {
    if (!uniqueWords.some((existing) => existing.toLowerCase() === w.toLowerCase())) {
      uniqueWords.push(w);
    }
    if (uniqueWords.length >= 4) break;
  }

  const productTopic =
    uniqueWords.length > 0
      ? uniqueWords.join(' ')
      : collabTag
        ? `${cleanBrand}`
        : bundleOrFreebie ?? extractOfferFocus(cleanOffer);

  // 8. Vertical classification (zero dental/clinic hardcoding)
  const lower = combined.toLowerCase();
  let vertical: OfferDetails['vertical'] = 'general';
  if (
    /\b(?:ipl|skincare|serum|kosmetik|kecantikan|rambut|salon|spa|makeup|gincu|sunscreen|facial|kulit|wajah|ulike|hellokitty)\b/.test(
      lower
    ) ||
    /hello\s*kitty/.test(lower)
  ) {
    vertical = 'beauty';
  } else if (
    /\b(?:kopi|kafe|cafe|kek|roti|makanan|minuman|menu|restoran|boba|teh|matcha|nasi|lauk|sambal|dapur|biskut|dessert|pastri)\b/.test(
      lower
    )
  ) {
    vertical = 'fnb';
  } else if (
    /\b(?:baju|tudung|shawl|jubah|kasut|beg|fesyen|butik|koleksi|pakaian|kain|sneakers|jam|aksesori)\b/.test(
      lower
    )
  ) {
    vertical = 'fashion';
  } else if (
    /\b(?:servis|khidmat|bengkel|auto|kereta|aircond|cuci|pembersihan|baiki|repair|konsultasi|akaun|fotografi|percetakan|penghantaran)\b/.test(
      lower
    )
  ) {
    vertical = 'services';
  }

  return {
    brandName: cleanBrand,
    collabTag,
    discountPercent,
    priceTag,
    bundleOrFreebie,
    occasion,
    scarcityCue,
    productTopic,
    vertical,
    uspSummary: uspParsed.uspSummary,
    targetAudience: uspParsed.targetAudience,
  };
}

const BRAND_TOKEN_STOPWORDS_RX = /^(?:x|dan|di|ke|for|the|and|of|my|sdn|bhd)$/i;

function extractDistinctBrandTokens(brandName: string, collabTag?: string | null): string[] {
  const raw = `${brandName} ${collabTag ?? ''}`;
  const tokens = raw
    .split(/[\s(),.;:!?—–\-•|/+]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !BRAND_TOKEN_STOPWORDS_RX.test(t));

  const unique: string[] = [];
  for (const t of tokens) {
    if (!unique.some((existing) => existing.toLowerCase() === t.toLowerCase())) {
      unique.push(t);
    }
  }
  return unique;
}

function stripOverlappingBrandTokens(
  text: string,
  brandName: string,
  collabTag?: string | null
): string {
  let cleaned = text.trim();
  if (!cleaned) return '';

  if (collabTag) {
    const collabCore = collabTag.replace(/^[x×]\s+/i, '').trim();
    cleaned = cleaned.replace(
      new RegExp(`\\(\\s*${escapeRegExp(collabTag)}\\s*\\)`, 'gi'),
      ' '
    );
    cleaned = cleaned.replace(
      new RegExp(`(?:^|\\s)${escapeRegExp(collabTag)}(?:$|\\s)`, 'gi'),
      ' '
    );
    if (collabCore && collabCore.length >= 2) {
      cleaned = cleaned.replace(
        new RegExp(`(?:^|\\s)${escapeRegExp(collabCore)}(?:$|\\s)`, 'gi'),
        ' '
      );
    }
  }

  const brandTokens = extractDistinctBrandTokens(brandName, collabTag);
  for (const token of brandTokens) {
    cleaned = cleaned.replace(
      new RegExp(`(?:^|[\\s(])${escapeRegExp(token)}(?=$|[\\s),.;:!?])`, 'gi'),
      ' '
    );
  }

  return cleaned
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:!?—–\-•|/+(]+|[\s,.;:!?—–\-•|/+(]+$/g, '')
    .trim();
}

function hasBrandOrCollabOverlap(
  candidate: string,
  brandName: string,
  collabTag?: string | null
): boolean {
  if (!candidate.trim()) return true;
  if (
    containsTokenCaseInsensitive(candidate, brandName) ||
    containsTokenCaseInsensitive(brandName, candidate)
  ) {
    return true;
  }
  if (collabTag && containsTokenCaseInsensitive(brandName, collabTag)) {
    const collabCore = collabTag.replace(/^[x×]\s+/i, '').trim();
    if (
      containsTokenCaseInsensitive(candidate, collabTag) ||
      (collabCore.length >= 2 && containsTokenCaseInsensitive(candidate, collabCore))
    ) {
      return true;
    }
  }
  const brandTokens = extractDistinctBrandTokens(brandName, collabTag);
  const matchedBrandTokens = brandTokens.filter((tok) =>
    containsTokenCaseInsensitive(candidate, tok)
  );
  return matchedBrandTokens.length >= 2;
}

export function resolveDistinctSubject(
  details: OfferDetails,
  cleanOffer: string
): string {
  const rawSubject =
    details.collabTag && !containsTokenCaseInsensitive(details.brandName, details.collabTag)
      ? appendCollabIfAbsent(details.productTopic, details.collabTag, 'parens')
      : details.productTopic;

  if (!hasBrandOrCollabOverlap(rawSubject, details.brandName, details.collabTag)) {
    return rawSubject;
  }

  const stripped = stripOverlappingBrandTokens(
    rawSubject,
    details.brandName,
    details.collabTag
  );
  if (
    stripped &&
    !hasBrandOrCollabOverlap(stripped, details.brandName, details.collabTag)
  ) {
    return stripped;
  }

  if (details.uspSummary) {
    const firstClause = details.uspSummary.split(/[,;|•—–]+/)[0]?.trim() ?? '';
    const cleanClause = hasBrandOrCollabOverlap(
      firstClause,
      details.brandName,
      details.collabTag
    )
      ? stripOverlappingBrandTokens(firstClause, details.brandName, details.collabTag)
      : firstClause;
    const uspShort = truncateAtWordBoundary(cleanClause, 26);
    if (
      uspShort &&
      !hasBrandOrCollabOverlap(uspShort, details.brandName, details.collabTag)
    ) {
      return uspShort;
    }
  }

  if (
    details.bundleOrFreebie &&
    !hasBrandOrCollabOverlap(details.bundleOrFreebie, details.brandName, details.collabTag)
  ) {
    return details.bundleOrFreebie;
  }

  return extractOfferFocus(cleanOffer);
}
