import type { OfferDetails, VariationFrameworkId } from '../types/campaign';

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

export function extractOfferFocus(offerSentence: string): string {
  const lower = offerSentence.toLowerCase();
  if (/diskaun|promo|jimat|potongan|sale|rebate/.test(lower)) return 'Penjimatan Istimewa';
  if (/pakej|kombo|bundle|set/.test(lower)) return 'Pakej Kombo';
  if (/servis|khidmat|tempahan|booking|penghantaran|bengkel/.test(lower)) return 'Servis Pilihan';
  if (/makanan|minuman|menu|kopi|kek|kafe|restoran/.test(lower)) return 'Menu Istimewa';
  if (/produk|koleksi|stok|item|edisi|fesyen|baju|butik/.test(lower)) return 'Koleksi Pilihan';
  return 'Pilihan Utama';
}

const STOPWORD_RX =
  /^(?:promosi|promo|diskaun|potongan|sale|rebate|harga|untuk|sempena|pelanggan|terawal|whatsapp|wasap|ws|sekarang|hari|ini|sahaja|cepat|stok|slot|kuota|terhad|tawaran|istimewa|khas|edisi|terbaru|baharu|grab|order|tempah|minggu|gaji|payday|di|dan|yang|dengan|ke|dari|anda|kami|jom|unit|kini|jimat)$/i;

const COLLAB_TRAILING_STOP_RX =
  /\b(?:untuk|sempena|edisi|diskaun|harga|rm\s*\d+|di|minggu|gaji|stok|slot|terhad|whatsapp|sekarang)\b.*$/i;

export function extractOfferDetails(brandName: string, offerSentence: string): OfferDetails {
  const cleanBrand = brandName.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(offerSentence);
  const combined = `${cleanBrand} ${cleanOffer}`;

  // 1. Collaboration tag e.g. "X HelloKitty"
  let collabTag: string | null = null;
  const collabMatch = combined.match(
    /(?:^|[\s(])[x×]\s*([A-Za-z0-9][A-Za-z0-9&+-]*(?:\s+[A-Za-z0-9&+-]+){0,2})/i
  );
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

  // 4. Bundle / Freebie cue
  const bundleMatch = cleanOffer.match(
    /\b(?:beli\s+\d+\s+percuma\s+\d+|percuma\s+[^,.;—\n-]+|kombo\s+[^,.;—\n-]+|pakej\s+[^,.;—\n-]+|bundle\s+[^,.;—\n-]+)\b/i
  );
  const bundleOrFreebie = bundleMatch?.[0]
    ? bundleMatch[0].trim().slice(0, 44).trim()
    : null;

  // 5. Occasion
  const occasionMatch = combined.match(
    /\b(?:minggu\s+gaji|hari\s+gaji|payday|raya|aidilfitri|ramadan|merdeka|hujung\s+minggu|edisi\s+(?:khas|terhad|baharu)|11\.11|12\.12)\b/i
  );
  const occasion = occasionMatch?.[0] ? occasionMatch[0].trim() : null;

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
  };
}
