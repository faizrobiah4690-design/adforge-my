import type {
  AngleId,
  BrandProfile,
  ChannelCopy,
} from '../types/campaign';
import { checkCopyCompliance, rewriteSafeCopy } from './compliance';
import {
  buildWhatsappCtaUrl,
  sliceSafeUtf16,
  stripLoneSurrogates,
} from './whatsapp';

export interface CustomerPsychologyProfile {
  targetPersona: string;
  coreTrigger: string;
  frictionObjections: string;
  trustAnchors: string;
}

const GEMINI_ENDPOINT = [
  'https:/',
  'generativelanguage.googleapis.com',
  'v1beta',
  'models',
  'gemini-2.0-flash:generateContent',
].join('/');

function cleanOfferText(offerSentence: string): string {
  const normalized = offerSentence.trim().replace(/\s+/g, ' ');
  return normalized || 'Promosi istimewa minggu ini — tawaran terhad untuk pelanggan terawal.';
}

function extractOfferFocus(offerSentence: string): string {
  const lower = offerSentence.toLowerCase();
  if (/diskaun|promo|jimat|potongan|sale|rebate/.test(lower)) return 'Tawaran Penjimatan';
  if (/pakej|kombo|bundle|set/.test(lower)) return 'Pakej Kombo';
  if (/servis|khidmat|tempahan|booking|penghantaran|bengkel/.test(lower)) return 'Servis Pilihan';
  if (/makanan|minuman|menu|kopi|kek|kafe|restoran/.test(lower)) return 'Menu Istimewa';
  if (/produk|koleksi|stok|item|edisi|fesyen|baju|butik/.test(lower)) return 'Produk Pilihan';
  return 'Tawaran Utama';
}

export function enforceRsaLength(
  text: string,
  maxLen: number,
  fallback: string
): string {
  const cleanFallback = stripLoneSurrogates(fallback.replace(/\s+/g, ' ').trim());
  const normalized = stripLoneSurrogates(text.replace(/\s+/g, ' ').trim());
  if (normalized.length > 0 && normalized.length <= maxLen) {
    return normalized;
  }

  const source = normalized || cleanFallback;
  if (source.length <= maxLen) {
    return source;
  }

  const sliced = sliceSafeUtf16(source, maxLen).trimEnd();
  const lastSpace = sliced.lastIndexOf(' ');
  const wordTrimmed =
    lastSpace >= Math.floor(maxLen * 0.55) ? sliced.slice(0, lastSpace).trimEnd() : sliced;

  if (wordTrimmed.length > 0 && wordTrimmed.length <= maxLen) {
    return wordTrimmed;
  }

  return sliceSafeUtf16(cleanFallback, maxLen).trimEnd();
}

export function buildCustomerPsychology(
  brand: BrandProfile,
  offerSentence: string
): CustomerPsychologyProfile {
  const brandName = brand.name.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(offerSentence);
  const focus = extractOfferFocus(cleanOffer);
  const shortOffer =
    cleanOffer.length > 90
      ? `${sliceSafeUtf16(cleanOffer, 87).trimEnd()}...`
      : stripLoneSurrogates(cleanOffer);

  if (brand.tone === 'casual') {
    return {
      targetPersona: `Pelanggan harian & pembeli pantas di Malaysia yang mencari ${focus} daripada ${brandName} dengan proses pertanyaan yang mudah.`,
      coreTrigger: `Tawaran jelas & berbaloi ("${shortOffer}") yang boleh terus ditempah melalui WhatsApp sebelum stok atau slot habis.`,
      frictionObjections:
        'Risau caj tersembunyi, lambat dapat jawapan di mesej, atau tidak pasti sama ada stok masih ada.',
      trustAnchors: `Komunikasi mesra di ${brandName}, penerangan harga telus, serta maklum balas pantas melalui WhatsApp rasmi.`,
    };
  }

  return {
    targetPersona: `Golongan profesional dan pembeli berorientasikan kualiti yang memilih ${brandName} untuk ${focus} yang teratur dan meyakinkan.`,
    coreTrigger: `Nilai tawaran rasmi ("${shortOffer}") yang mudah disahkan bersama wakil ${brandName} melalui saluran WhatsApp.`,
    frictionObjections:
      'Keraguan terhadap konsistensi kualiti produk atau servis, ketepatan masa penghantaran, dan sokongan selepas jualan.',
    trustAnchors: `Reputasi jenama ${brandName}, standard perkhidmatan yang konsisten, serta komunikasi rasmi yang jelas dan berhemah.`,
  };
}

function buildShortBrandTag(brandName: string, maxLen: number): string {
  const trimmed = stripLoneSurrogates(brandName.trim()) || 'Bisnes';
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const twoWords = `${words[0]} ${words[1]}`;
    if (twoWords.length <= maxLen) {
      return twoWords;
    }
  }
  return sliceSafeUtf16(trimmed, maxLen).trimEnd() || 'Bisnes';
}

export function generateCampaignCopyForAngle(
  brand: BrandProfile,
  offerSentence: string,
  angle: AngleId
): ChannelCopy {
  const brandName = brand.name.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(offerSentence);
  const focus = extractOfferFocus(cleanOffer);
  const isCasual = brand.tone === 'casual';
  const waUrl = buildWhatsappCtaUrl({
    phone: brand.whatsappNumber,
    brandName,
    offerSentence: cleanOffer,
    angle,
  });

  const shortBrand14 = buildShortBrandTag(brandName, 14);
  const shortBrand12 = buildShortBrandTag(brandName, 12);
  const hashBrand = shortBrand14.replace(/\s+/g, '') || 'BisnesMY';

  if (angle === 'urgency') {
    const fbHeadline = isCasual
      ? `${brandName} — Tawaran Terhad Minggu Ini`
      : `${brandName} — Promosi Masa Terhad`;
    const fbDesc = isCasual
      ? `Stok & slot ${focus} terhad • WhatsApp terus`
      : `Penempahan awal ${focus} untuk pelanggan terawal`;
    const fbPrimary = isCasual
      ? `Jangan tunggu saat akhir! ${brandName} tengah buka ${focus} dengan kuota terhad minggu ini. ${cleanOffer} Siapa cepat dia dapat — tekan WhatsApp sekarang untuk sahkan pesanan anda: ${waUrl}`
      : `Rebut peluang ${focus} bersama ${brandName} sementara kuota promosi masih dibuka. ${cleanOffer} Hubungi pasukan kami melalui WhatsApp rasmi untuk pengesahan pantas hari ini: ${waUrl}`;

    return {
      facebook: {
        primaryText: fbPrimary,
        headline: fbHeadline,
        description: fbDesc,
        whatsappUrl: waUrl,
      },
      instagram: {
        caption: isCasual
          ? `Kuota terhad di ${brandName} — jangan sampai terlepas! ⚡\n${cleanOffer}\nKlik WhatsApp sekarang sebelum penuh: ${waUrl}`
          : `Tawaran eksklusif masa terhad daripada ${brandName}.\n${cleanOffer}\nSahkan tempahan atau pertanyaan anda melalui WhatsApp rasmi: ${waUrl}`,
        hashtags: isCasual
          ? `#${hashBrand} #TawaranTerhad #PromosiMalaysia #BisnesLokal #CepatGrab`
          : `#${hashBrand} #PromosiRasmi #TawaranEksklusif #PerniagaanMalaysia`,
        whatsappUrl: waUrl,
      },
      tiktok: {
        hook: isCasual
          ? `Jangan scroll dulu! Tawaran ${focus} di ${brandName} ini hanya untuk kuota terawal minggu ini.`
          : `Makluman rasmi: Tempoh promosi ${focus} di ${brandName} kini hampir tamat.`,
        script: isCasual
          ? `0-2s: Paparan ${focus} ${brandName}. 2-4s: ${cleanOffer}. 4-6s: Tekan pautan WhatsApp di bio sebelum kuota habis (${waUrl}).`
          : `0-2s: Paparan produk & servis ${brandName}. 2-4s: Penerangan ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi untuk pengesahan awal (${waUrl}).`,
        caption: isCasual
          ? `Tawaran terhad ${focus} di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`
          : `Promosi masa terhad ${focus} di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
        whatsappUrl: waUrl,
      },
      google_rsa: {
        headlines: [
          enforceRsaLength(
            isCasual ? `${shortBrand14} Terhad` : `${shortBrand14} Rasmi`,
            30,
            'Promosi Terhad Kini'
          ),
          enforceRsaLength(
            isCasual ? `Rebut ${focus} Kini` : `Tempahan ${focus} Awal`,
            30,
            'Tawaran Utama Hari Ini'
          ),
          enforceRsaLength(
            isCasual ? 'WhatsApp Sebelum Habis' : 'Sahkan Slot WhatsApp Kini',
            30,
            'Tempah WhatsApp Segera'
          ),
        ],
        descriptions: [
          enforceRsaLength(
            `${shortBrand12}: ${cleanOffer}`,
            90,
            'Tawaran terhad untuk pelanggan terawal. Hubungi kami sekarang.'
          ),
          enforceRsaLength(
            isCasual
              ? `Kuota terhad di ${shortBrand12}. Klik WhatsApp untuk semak stok & tempah terus.`
              : `Pengesahan pantas bersama ${shortBrand12} melalui saluran WhatsApp rasmi.`,
            90,
            'Hubungi WhatsApp rasmi kami untuk menyemak ketersediaan hari ini.'
          ),
        ],
        negativeKeywords: [
          'percuma',
          'produk tiruan',
          'jualan borong',
          'tiada waranti',
          'terpakai',
        ],
        whatsappUrl: waUrl,
      },
    };
  }

  if (angle === 'value') {
    const fbHeadline = isCasual
      ? `${brandName} — Berbaloi & Berkualiti`
      : `${brandName} — Piawaian Nilai & Kualiti`;
    const fbDesc = isCasual
      ? `Harga telus & kualiti padu • Tanya terus di WhatsApp`
      : `Kualiti teratur dengan kadar harga telus & berdaya saing`;
    const fbPrimary = isCasual
      ? `Cari pilihan yang betul-betul berbaloi dengan bajet anda? Di ${brandName}, setiap ringgit anda memang berasa nilainya. ${cleanOffer} Harga jelas tanpa caj tersembunyi — jom tanya detail di WhatsApp: ${waUrl}`
      : `Pilih nilai yang konsisten dan mutu perkhidmatan yang telus bersama ${brandName}. ${cleanOffer} Dapatkan pecahan pakej serta maklumat terperinci secara terus melalui WhatsApp rasmi kami: ${waUrl}`;

    return {
      facebook: {
        primaryText: fbPrimary,
        headline: fbHeadline,
        description: fbDesc,
        whatsappUrl: waUrl,
      },
      instagram: {
        caption: isCasual
          ? `Kualiti kemas, harga berbaloi di ${brandName} ✨\n${cleanOffer}\nTanya pakej & pilihan melalui WhatsApp: ${waUrl}`
          : `Nilai dan kualiti yang telus untuk keperluan anda di ${brandName}.\n${cleanOffer}\nHubungi WhatsApp rasmi untuk maklumat pakej: ${waUrl}`,
        hashtags: isCasual
          ? `#${hashBrand} #KualitiMantap #Berbaloi #SupportLokal #SMEMalaysia`
          : `#${hashBrand} #NilaiKorporat #KualitiKonsisten #PerniagaanMalaysia`,
        whatsappUrl: waUrl,
      },
      tiktok: {
        hook: isCasual
          ? `3 sebab kenapa ramai pelanggan pilih ${focus} di ${brandName} sebab sangat berbaloi!`
          : `Bagaimana ${brandName} mengekalkan piawaian kualiti dalam setiap ${focus}.`,
        script: isCasual
          ? `0-2s: Tunjuk perincian kualiti ${brandName}. 2-4s: ${cleanOffer}. 4-6s: WhatsApp kami untuk senarai harga penuh (${waUrl}).`
          : `0-2s: Paparan proses & mutu kerja ${brandName}. 2-4s: ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi untuk sebut harga telus (${waUrl}).`,
        caption: isCasual
          ? `Nilai berbaloi & kualiti ${focus} di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`
          : `Piawaian kualiti & harga telus di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
        whatsappUrl: waUrl,
      },
      google_rsa: {
        headlines: [
          enforceRsaLength(
            isCasual ? `${shortBrand14} Berbaloi` : `${shortBrand14} Berkualiti`,
            30,
            'Kualiti & Nilai Berbaloi'
          ),
          enforceRsaLength(
            isCasual ? `Pakej ${focus} Telus` : `Piawaian ${focus} Jelas`,
            30,
            'Harga Telus & Jelas'
          ),
          enforceRsaLength(
            isCasual ? 'Semak Harga di WhatsApp' : 'Dapatkan Sebut Harga Rasmi',
            30,
            'Semak Pakej WhatsApp'
          ),
        ],
        descriptions: [
          enforceRsaLength(
            `Nilai ${shortBrand12}: ${cleanOffer}`,
            90,
            'Kualiti konsisten dan harga telus untuk pelanggan Malaysia.'
          ),
          enforceRsaLength(
            isCasual
              ? `Tiada caj tersembunyi di ${shortBrand12}. Klik WhatsApp untuk senarai pilihan.`
              : `Ketelusan harga dan mutu teratur di ${shortBrand12}. Hubungi WhatsApp rasmi.`,
            90,
            'Dapatkan penerangan pakej dan harga penuh melalui WhatsApp hari ini.'
          ),
        ],
        negativeKeywords: [
          'percuma',
          'murah sangat',
          'kualiti rendah',
          'barang rosak',
          'tiada jaminan',
        ],
        whatsappUrl: waUrl,
      },
    };
  }

  // angle === 'social_proof'
  const fbHeadline = isCasual
    ? `${brandName} — Pilihan Ramai Pelanggan`
    : `${brandName} — Dipercayai Pelanggan Tempatan`;
  const fbDesc = isCasual
    ? `Maklum balas positif & pelanggan berulang • WhatsApp kami`
    : `Rekod kepuasan pelanggan yang konsisten di seluruh Malaysia`;
  const fbPrimary = isCasual
    ? `Ramai pelanggan yang dah cuba ${focus} di ${brandName} terus repeat order sebab layanan mesra & hasil memuaskan! ${cleanOffer} Nak tahu kenapa ramai rekomen? Jom sembang di WhatsApp: ${waUrl}`
    : `Kepercayaan pelanggan menjadi keutamaan kami di ${brandName} dengan rekod maklum balas positif yang konsisten. ${cleanOffer} Sertai pelanggan sedia ada kami dan hubungi WhatsApp rasmi untuk maklumat lanjut: ${waUrl}`;

  return {
    facebook: {
      primaryText: fbPrimary,
      headline: fbHeadline,
      description: fbDesc,
      whatsappUrl: waUrl,
    },
    instagram: {
      caption: isCasual
        ? `Terima kasih kepada semua pelanggan yang sentiasa sokong ${brandName} 💙\n${cleanOffer}\nJom WhatsApp kami untuk cuba sendiri: ${waUrl}`
        : `Dipercayai oleh pelanggan individu dan perniagaan di ${brandName}.\n${cleanOffer}\nHubungi saluran WhatsApp rasmi kami untuk pertanyaan: ${waUrl}`,
      hashtags: isCasual
        ? `#${hashBrand} #PilihanRamai #Dipercayai #SokongLokal #BisnesMalaysia`
        : `#${hashBrand} #KepercayaanPelanggan #RekodPositif #SMEMalaysia`,
      whatsappUrl: waUrl,
    },
    tiktok: {
      hook: isCasual
        ? `Kenapa ramai pelanggan tetap balik semula ke ${brandName}? Ini jawapannya!`
        : `Mengapa pelanggan korporat dan isi rumah terus mempercayai ${brandName}.`,
      script: isCasual
        ? `0-2s: Visual suasana mesra pelanggan di ${brandName}. 2-4s: ${cleanOffer}. 4-6s: Tekan WhatsApp sekarang untuk tanya pilihan popular (${waUrl}).`
        : `0-2s: Paparan operasi profesional ${brandName}. 2-4s: ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi untuk konsultasi pesanan (${waUrl}).`,
      caption: isCasual
        ? `Pilihan ramai pelanggan di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`
        : `Dipercayai ramai di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
      whatsappUrl: waUrl,
    },
    google_rsa: {
      headlines: [
        enforceRsaLength(
          isCasual ? `${shortBrand14} Pilihan Ramai` : `${shortBrand14} Dipercayai`,
          30,
          'Pilihan Ramai Pelanggan'
        ),
        enforceRsaLength(
          isCasual ? `Disukai Pelanggan ${focus}` : `Rekod Positif ${focus}`,
          30,
          'Dipercayai Pelanggan MY'
        ),
        enforceRsaLength(
          isCasual ? 'Tanya Pilihan Popular Kini' : 'Hubungi Wakil Rasmi Kini',
          30,
          'Tanya Pakej WhatsApp'
        ),
      ],
      descriptions: [
        enforceRsaLength(
          `Pilihan ramai ${shortBrand12}: ${cleanOffer}`,
          90,
          'Dipercayai pelanggan Malaysia dengan layanan pantas dan mesra.'
        ),
        enforceRsaLength(
          isCasual
            ? `Ramai pelanggan berpuas hati dengan ${shortBrand12}. WhatsApp kami sekarang.`
            : `Khidmat pelanggan yang konsisten di ${shortBrand12}. Hubungi WhatsApp rasmi.`,
          90,
          'Ketahui pakej paling popular kami melalui saluran WhatsApp rasmi.'
        ),
      ],
      negativeKeywords: [
        'percuma',
        'ulasan palsu',
        'scam',
        'kedai tidak sah',
        'tiada sokongan',
      ],
      whatsappUrl: waUrl,
    },
  };
}

export function generateCampaignCopyMap(
  brand: BrandProfile,
  offerSentence: string
): Record<AngleId, ChannelCopy> {
  return {
    urgency: generateCampaignCopyForAngle(brand, offerSentence, 'urgency'),
    value: generateCampaignCopyForAngle(brand, offerSentence, 'value'),
    social_proof: generateCampaignCopyForAngle(brand, offerSentence, 'social_proof'),
  };
}

export function isValidGeminiKeyFormat(apiKey: string): boolean {
  return /^\S{12,}$/.test(apiKey.trim());
}

function ensureSingleWhatsappUrl(
  text: string,
  waUrl: string,
  appendFn: (cleanText: string, url: string) => string
): string {
  const waRx = /https:\/\/wa\.me\/[^\s)]+/gi;
  const matches = text.match(waRx);
  if (matches && matches.length > 0) {
    let seenFirst = false;
    return text
      .replace(waRx, () => {
        if (!seenFirst) {
          seenFirst = true;
          return waUrl;
        }
        return '';
      })
      .replace(/\(\s*\)/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  return appendFn(text.trim(), waUrl);
}

function sanitizeChannelText(candidate: unknown, fallback: string, brandName: string): string {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    return fallback;
  }
  const trimmed = stripLoneSurrogates(candidate.trim());
  if (!trimmed) {
    return fallback;
  }
  if (checkCopyCompliance(trimmed).length > 0) {
    return rewriteSafeCopy(trimmed, brandName);
  }
  return trimmed;
}

function sanitizeRsaItem(
  candidate: unknown,
  maxLen: number,
  fallback: string,
  brandName: string
): string {
  const safeFallback =
    checkCopyCompliance(fallback).length === 0 ? fallback : 'Tawaran Utama';
  const sanitized = sanitizeChannelText(candidate, safeFallback, brandName);
  const bounded = enforceRsaLength(sanitized, maxLen, safeFallback);
  if (checkCopyCompliance(bounded).length > 0) {
    return enforceRsaLength(safeFallback, maxLen, 'Tawaran Utama');
  }
  return bounded;
}

export async function enhanceCopyWithGemini(params: {
  apiKey: string;
  isDemoMode: boolean;
  brand: BrandProfile;
  offerSentence: string;
  angle: AngleId;
}): Promise<{ copy: ChannelCopy; source: 'gemini' | 'baseline' }> {
  const baseline = generateCampaignCopyForAngle(
    params.brand,
    params.offerSentence,
    params.angle
  );

  if (params.isDemoMode || !isValidGeminiKeyFormat(params.apiKey)) {
    return { copy: baseline, source: 'baseline' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const prompt = [
      `Anda ialah penulis iklan pemasaran digital SME Malaysia yang mematuhi polisi Meta Personal Attributes & etika pengiklanan Malaysia.`,
      `Jenama: ${params.brand.name}. Nada: ${params.brand.tone}. Sudut: ${params.angle}.`,
      `Tawaran: ${cleanOfferText(params.offerSentence)}.`,
      `Pulangkan JSON sahaja mengikut struktur ChannelCopy (facebook, instagram, tiktok, google_rsa).`,
      `Had wajib: google_rsa.headlines setiap satu <= 30 aksara; google_rsa.descriptions setiap satu <= 90 aksara.`,
      `Dilarang menggunakan: dakwaan ciri peribadi (seperti kulit anda kusam/anda bermasalah), 100%, dijamin, terbaik, No. 1, sebelum dan selepas.`,
    ].join('\n');

    const response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': params.apiKey.trim(),
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { copy: baseline, source: 'baseline' };
    }

    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return { copy: baseline, source: 'baseline' };
    }

    const parsed = JSON.parse(rawText) as Partial<ChannelCopy>;
    const waUrl = baseline.facebook.whatsappUrl;

    const rawHeadlines = Array.isArray(parsed.google_rsa?.headlines)
      ? parsed.google_rsa.headlines.slice(0, 3)
      : baseline.google_rsa.headlines;
    while (rawHeadlines.length < 3) {
      rawHeadlines.push(baseline.google_rsa.headlines[rawHeadlines.length] ?? 'Tawaran Utama');
    }

    const rawDescriptions = Array.isArray(parsed.google_rsa?.descriptions)
      ? parsed.google_rsa.descriptions.slice(0, 2)
      : baseline.google_rsa.descriptions;
    while (rawDescriptions.length < 2) {
      rawDescriptions.push(
        baseline.google_rsa.descriptions[rawDescriptions.length] ??
          'Hubungi kami di WhatsApp untuk maklumat lanjut.'
      );
    }

    const rawNegatives =
      Array.isArray(parsed.google_rsa?.negativeKeywords) &&
      parsed.google_rsa.negativeKeywords.length >= 4
        ? parsed.google_rsa.negativeKeywords.map((k) => String(k).trim()).filter(Boolean)
        : baseline.google_rsa.negativeKeywords;

    const enhanced: ChannelCopy = {
      facebook: {
        primaryText: ensureSingleWhatsappUrl(
          sanitizeChannelText(
            parsed.facebook?.primaryText,
            baseline.facebook.primaryText,
            params.brand.name
          ),
          waUrl,
          (t, u) => `${t} ${u}`
        ),
        headline: sanitizeChannelText(
          parsed.facebook?.headline,
          baseline.facebook.headline,
          params.brand.name
        ),
        description: sanitizeChannelText(
          parsed.facebook?.description,
          baseline.facebook.description,
          params.brand.name
        ),
        whatsappUrl: waUrl,
      },
      instagram: {
        caption: ensureSingleWhatsappUrl(
          sanitizeChannelText(
            parsed.instagram?.caption,
            baseline.instagram.caption,
            params.brand.name
          ),
          waUrl,
          (t, u) => `${t}\n${u}`
        ),
        hashtags: sanitizeChannelText(
          parsed.instagram?.hashtags,
          baseline.instagram.hashtags,
          params.brand.name
        ),
        whatsappUrl: waUrl,
      },
      tiktok: {
        hook: sanitizeChannelText(
          parsed.tiktok?.hook,
          baseline.tiktok.hook,
          params.brand.name
        ),
        script: ensureSingleWhatsappUrl(
          sanitizeChannelText(
            parsed.tiktok?.script,
            baseline.tiktok.script,
            params.brand.name
          ),
          waUrl,
          (t, u) => `${t} (${u})`
        ),
        caption: ensureSingleWhatsappUrl(
          sanitizeChannelText(
            parsed.tiktok?.caption,
            baseline.tiktok.caption,
            params.brand.name
          ),
          waUrl,
          (t, u) => `${t} | ${u}`
        ),
        whatsappUrl: waUrl,
      },
      google_rsa: {
        headlines: rawHeadlines.map((h, idx) =>
          sanitizeRsaItem(
            h,
            30,
            baseline.google_rsa.headlines[idx] ?? 'Promosi Bisnes',
            params.brand.name
          )
        ),
        descriptions: rawDescriptions.map((d, idx) =>
          sanitizeRsaItem(
            d,
            90,
            baseline.google_rsa.descriptions[idx] ?? 'Produk & servis berkualiti untuk anda.',
            params.brand.name
          )
        ),
        negativeKeywords:
          rawNegatives.length >= 4 ? rawNegatives : baseline.google_rsa.negativeKeywords,
        whatsappUrl: waUrl,
      },
    };

    return { copy: enhanced, source: 'gemini' };
  } catch {
    return { copy: baseline, source: 'baseline' };
  } finally {
    clearTimeout(timeoutId);
  }
}
