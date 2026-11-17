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
  return normalized || 'Promosi Scaling & Polish serta pemeriksaan klinikal berkala.';
}

function extractOfferFocus(offerSentence: string): string {
  const lower = offerSentence.toLowerCase();
  if (lower.includes('braces')) return 'Braces';
  if (lower.includes('whitening') || lower.includes('putih')) return 'Pemutihan Gigi';
  if (lower.includes('scaling') || lower.includes('polish')) return 'Scaling & Polish';
  if (lower.includes('implan')) return 'Implan Pergigian';
  if (lower.includes('veneer')) return 'Veneer';
  return 'Penjagaan Pergigian';
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
  const brandName = brand.name.trim() || 'Klinik Gigi Impian';
  const cleanOffer = cleanOfferText(offerSentence);
  const focus = extractOfferFocus(cleanOffer);
  const shortOffer =
    cleanOffer.length > 90
      ? `${sliceSafeUtf16(cleanOffer, 87).trimEnd()}...`
      : stripLoneSurrogates(cleanOffer);

  if (brand.tone === 'casual') {
    return {
      targetPersona: `Dewasa bekerja & keluarga muda sekitar ${brandName} yang mahukan ${focus} tanpa rasa kekok atau jadual rumit.`,
      coreTrigger: `Tawaran mesra poket ("${shortOffer}") yang senang ditempah terus melalui WhatsApp apabila slot masih ada.`,
      frictionObjections:
        'Risau kos tersembunyi, takut rasa ngilu semasa rawatan, atau bertangguh kerana tiada masa menunggu lama di kaunter.',
      trustAnchors: `Gaya komunikasi santai di ${brandName}, penerangan harga telus sebelum rawatan, dan konsultasi bersama doktor pergigian bertauliah.`,
    };
  }

  return {
    targetPersona: `Golongan profesional dan isi rumah berorientasikan kualiti yang memilih ${brandName} untuk rawatan ${focus} yang teratur dan beretika.`,
    coreTrigger: `Keperluan penjagaan kesihatan oral berjadual berpandukan tawaran klinikal ("${shortOffer}") dengan pengesahan temujanji pantas.`,
    frictionObjections:
      'Keraguan terhadap piawaian kebersihan klinikal, ketidaktentuan tempoh prosedur, dan keperluan jaminan komunikasi profesional.',
    trustAnchors: `Reputasi klinikal ${brandName}, protokol konsultasi berstruktur oleh doktor pergigian bertauliah, serta pematuhan garis panduan KKLIU.`,
  };
}

function buildShortBrandTag(brandName: string, maxLen: number): string {
  const trimmed = stripLoneSurrogates(brandName.trim()) || 'Klinik Gigi';
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
  return sliceSafeUtf16(trimmed, maxLen).trimEnd() || 'Klinik Gigi';
}

export function generateCampaignCopyForAngle(
  brand: BrandProfile,
  offerSentence: string,
  angle: AngleId
): ChannelCopy {
  const brandName = brand.name.trim() || 'Klinik Gigi Impian';
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

  if (angle === 'confidence') {
    const fbHeadline = isCasual
      ? `${brandName} — Senyum Yakin Santai`
      : `${brandName} — Keyakinan Klinikal`;
    const fbDesc = isCasual
      ? `Slot ${focus} selesa • Konsultasi doktor gigi bertauliah`
      : `Penilaian profesional ${focus} oleh pengamal pergigian bertauliah`;
    const fbPrimary = isCasual
      ? `Nak rasa lebih yakin bila senyum dan jumpa klien atau kawan? Jom singgah ke ${brandName}! ${cleanOffer} Kami sediakan sesi konsultasi santai bersama doktor pergigian bertauliah (patuh KKLIU). Klik WhatsApp untuk semak slot: ${waUrl}`
      : `Tingkatkan keyakinan penampilan diri melalui penjagaan ${focus} yang teratur di ${brandName}. ${cleanOffer} Setiap rawatan dimulakan dengan konsultasi profesional oleh doktor pergigian bertauliah selaras piawaian KKLIU. Hubungi kami di WhatsApp: ${waUrl}`;

    return {
      facebook: {
        primaryText: fbPrimary,
        headline: fbHeadline,
        description: fbDesc,
        whatsappUrl: waUrl,
      },
      instagram: {
        caption: isCasual
          ? `Senyum lebih selesa bila bergambar & berjumpa orang di ${brandName} ✨\n${cleanOffer}\nKonsultasi bersama doktor gigi bertauliah menanti anda. Tekan WhatsApp: ${waUrl}`
          : `Penjagaan ${focus} yang teliti untuk senyuman kemas dan meyakinkan di ${brandName}.\n${cleanOffer}\nTempah konsultasi klinikal melalui WhatsApp rasmi kami: ${waUrl}`,
        hashtags: isCasual
          ? `#${shortBrand14.replace(/\s+/g, '')} #SenyumYakin #KlinikGigi #ScalingPolish #KeyakinanDiri`
          : `#${shortBrand14.replace(/\s+/g, '')} #PergigianProfesional #PenjagaanOral #KonsultasiGigi`,
        whatsappUrl: waUrl,
      },
      tiktok: {
        hook: isCasual
          ? `POV: Lepas sesi konsultasi & ${focus} santai di ${brandName}, terus rasa lagi yakin nak senyum depan kamera!`
          : `3 perkara yang dinilai doktor pergigian bertauliah sebelum rawatan ${focus} di ${brandName}.`,
        script: isCasual
          ? `0-2s: Visual senyuman kemas di kaunter ${brandName}. 2-4s: ${cleanOffer}. 4-6s: Tekan pautan WhatsApp di bio untuk tanya slot konsultasi (${waUrl}).`
          : `0-2s: Paparan ruang klinikal ${brandName}. 2-4s: Penerangan ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi untuk temujanji konsultasi (${waUrl}).`,
        caption: isCasual
          ? `Senyum lebih yakin dengan konsultasi ${focus} di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`
          : `Temujanji konsultasi ${focus} di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
        whatsappUrl: waUrl,
      },
      google_rsa: {
        headlines: [
          enforceRsaLength(
            isCasual ? `${shortBrand14} Senyum Yakin` : `${shortBrand14} Profesional`,
            30,
            'Klinik Gigi Pilihan Anda'
          ),
          enforceRsaLength(
            isCasual ? `Jom ${focus} Selesa` : `Konsultasi ${focus} Klinikal`,
            30,
            'Konsultasi Pergigian'
          ),
          enforceRsaLength(
            isCasual ? 'Tempah Slot WhatsApp Mudah' : 'Temujanji Doktor Bertauliah',
            30,
            'Tempah Slot Klinik'
          ),
        ],
        descriptions: [
          enforceRsaLength(
            `Konsultasi ${shortBrand12}: ${cleanOffer}`,
            90,
            'Penjagaan gigi selesa bersama doktor bertauliah.'
          ),
          enforceRsaLength(
            isCasual
              ? `Sesi konsultasi santai di ${shortBrand12}. Semak slot kosong melalui WhatsApp hari ini.`
              : `Pemeriksaan klinikal berstruktur di ${shortBrand12}. Tempah konsultasi WhatsApp rasmi.`,
            90,
            'Tempah sesi konsultasi pergigian bersama doktor bertauliah hari ini.'
          ),
        ],
        negativeKeywords: [
          'percuma',
          'diy pemutih',
          'ubat sakit gigi murah',
          'braces shopee',
          'tanpa doktor',
        ],
        whatsappUrl: waUrl,
      },
    };
  }

  if (angle === 'hygiene') {
    const fbHeadline = isCasual
      ? `${brandName} — Nafas Segar & Bersih`
      : `${brandName} — Penjagaan Pencegahan`;
    const fbDesc = isCasual
      ? `Buang plak & karang lembut • Konsultasi doktor gigi bertauliah`
      : `Penskaleran berkala & pemeriksaan gusi secara klinikal`;
    const fbPrimary = isCasual
      ? `Dah lama tak buat pemeriksaan kebersihan gigi berkala? Jom segarkan senyuman di ${brandName}! ${cleanOffer} Rawatan lembut dengan sesi konsultasi doktor pergigian bertauliah (patuh KKLIU). WhatsApp kami sekarang: ${waUrl}`
      : `Pencegahan awal karang gigi dan penjagaan kesihatan gusi membantu mengekalkan kebersihan oral jangka panjang di ${brandName}. ${cleanOffer} Dapatkan pemeriksaan serta konsultasi bersama doktor pergigian bertauliah mengikut garis panduan KKLIU: ${waUrl}`;

    return {
      facebook: {
        primaryText: fbPrimary,
        headline: fbHeadline,
        description: fbDesc,
        whatsappUrl: waUrl,
      },
      instagram: {
        caption: isCasual
          ? `Servis berkala 6 bulan sekali buat mulut rasa lebih bersih & ringan di ${brandName} 🪥\n${cleanOffer}\nTanya slot konsultasi melalui WhatsApp: ${waUrl}`
          : `Penjagaan pencegahan oral dan kebersihan gusi menyeluruh di ${brandName}.\n${cleanOffer}\nJadualkan pemeriksaan klinikal melalui WhatsApp: ${waUrl}`,
        hashtags: isCasual
          ? `#${shortBrand14.replace(/\s+/g, '')} #KebersihanGigi #ScalingGigi #NafasSegar #PenjagaanOral`
          : `#${shortBrand14.replace(/\s+/g, '')} #PencegahanPergigian #KesihatanGusi #KlinikPergigian`,
        whatsappUrl: waUrl,
      },
      tiktok: {
        hook: isCasual
          ? `Kenapa doktor gigi selalu pesan buat ${focus} berkala setiap 6 bulan? Ini sebabnya!`
          : `Kepentingan pemeriksaan berkala dan penskaleran klinikal di ${brandName}.`,
        script: isCasual
          ? `0-2s: Visual kebersihan peralatan moden di ${brandName}. 2-4s: ${cleanOffer}. 4-6s: Klik WhatsApp untuk sesi konsultasi & pilih masa yang sesuai (${waUrl}).`
          : `0-2s: Penerangan kebersihan oral di ${brandName}. 2-4s: ${cleanOffer}. 4-6s: Hubungi WhatsApp untuk konsultasi berjadual (${waUrl}).`,
        caption: isCasual
          ? `Jaga kebersihan mulut & konsultasi berkala di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`
          : `Pemeriksaan klinikal & pencegahan oral di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
        whatsappUrl: waUrl,
      },
      google_rsa: {
        headlines: [
          enforceRsaLength(
            isCasual ? `${shortBrand14} Bersih Segar` : `${shortBrand14} Pencegahan`,
            30,
            'Klinik Pergigian Bersih'
          ),
          enforceRsaLength(
            isCasual ? `Sesi ${focus} Lembut` : `Pemeriksaan Gusi & Karang`,
            30,
            'Konsultasi Scaling Lembut'
          ),
          enforceRsaLength(
            isCasual ? 'Semak Slot Pemeriksaan' : 'Doktor Pergigian Bertauliah',
            30,
            'Konsultasi Berkala'
          ),
        ],
        descriptions: [
          enforceRsaLength(
            `Konsultasi ${shortBrand12}: ${cleanOffer}`,
            90,
            'Rawatan kebersihan mulut berkala bersama doktor bertauliah.'
          ),
          enforceRsaLength(
            isCasual
              ? `Penjagaan gusi & gigi lebih bersih di ${shortBrand12}. Klik WhatsApp untuk konsultasi.`
              : `Penilaian kebersihan oral menyeluruh di ${shortBrand12}. Temujanji WhatsApp rasmi.`,
            90,
            'Jadualkan pemeriksaan kebersihan gigi berkala bersama kami.'
          ),
        ],
        negativeKeywords: [
          'percuma',
          'petua kampung',
          'alat scaling sendiri',
          'murah sangat',
          'klinik tidak berdaftar',
        ],
        whatsappUrl: waUrl,
      },
    };
  }

  // angle === 'payday'
  const fbHeadline = isCasual
    ? `${brandName} — Promosi & Konsultasi Gaji`
    : `${brandName} — Pakej Konsultasi Gaji`;
  const fbDesc = isCasual
    ? `Nilai berbaloi minggu gaji • Slot terhad • Konsultasi doktor gigi`
    : `Penjadualan keutamaan minggu gaji bersama doktor bertauliah`;
  const fbPrimary = isCasual
    ? `Gaji baru masuk? Ini masa sesuai untuk manjakan diri dengan penjagaan gigi di ${brandName}! ${cleanOffer} Harga jelas selepas konsultasi bersama doktor pergigian bertauliah (patuh KKLIU). Tempah slot minggu gaji via WhatsApp: ${waUrl}`
    : `Rancang perbelanjaan kesihatan keluarga anda sempena minggu gaji di ${brandName}. ${cleanOffer} Nikmati penjadualan teratur serta konsultasi telus oleh doktor pergigian bertauliah selaras piawaian KKLIU. Hubungi WhatsApp rasmi: ${waUrl}`;

  return {
    facebook: {
      primaryText: fbPrimary,
      headline: fbHeadline,
      description: fbDesc,
      whatsappUrl: waUrl,
    },
    instagram: {
      caption: isCasual
        ? `Checklist Minggu Gaji: 1) Bayar bil 2) Reward diri servis ${focus} di ${brandName} 💙\n${cleanOffer}\nSlot terhad — WhatsApp terus untuk konsultasi: ${waUrl}`
        : `Peruntukan kesihatan oral berkala sempena Minggu Gaji di ${brandName}.\n${cleanOffer}\nSahkan temujanji konsultasi anda melalui WhatsApp: ${waUrl}`,
      hashtags: isCasual
        ? `#${shortBrand14.replace(/\s+/g, '')} #MingguGaji #PaydayPromo #ScalingPolish #KlinikGigi`
        : `#${shortBrand14.replace(/\s+/g, '')} #KesihatanKeluarga #PakejMingguGaji #Pergigian`,
      whatsappUrl: waUrl,
    },
    tiktok: {
      hook: isCasual
        ? `Gaji dah masuk? Jangan lupa masukkan bajet ${focus} dalam list minggu gaji anda di ${brandName}!`
        : `Cara bijak merancang pemeriksaan pergigian berkala sempena Minggu Gaji di ${brandName}.`,
      script: isCasual
        ? `0-2s: Visual checklist Minggu Gaji di ${brandName}. 2-4s: ${cleanOffer}. 4-6s: Tekan WhatsApp sekarang untuk konsultasi sebelum slot minggu ini penuh (${waUrl}).`
        : `0-2s: Paparan jadual temujanji ${brandName}. 2-4s: ${cleanOffer}. 4-6s: Tempah konsultasi melalui WhatsApp rasmi (${waUrl}).`,
      caption: isCasual
        ? `Slot konsultasi Minggu Gaji di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`
        : `Temujanji konsultasi Minggu Gaji ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
      whatsappUrl: waUrl,
    },
    google_rsa: {
      headlines: [
        enforceRsaLength(
          isCasual ? `${shortBrand14} Minggu Gaji` : `${shortBrand14} Nilai Gaji`,
          30,
          'Konsultasi Minggu Gaji'
        ),
        enforceRsaLength(
          isCasual ? `Nilai Berbaloi ${focus}` : `Jadual ${focus} Teratur`,
          30,
          'Tempah Slot Terhad'
        ),
        enforceRsaLength(
          isCasual ? 'Lock Slot WhatsApp Kini' : 'Konsultasi Telus Bertauliah',
          30,
          'WhatsApp Klinik Kini'
        ),
      ],
      descriptions: [
        enforceRsaLength(
          `Konsultasi ${shortBrand12}: ${cleanOffer}`,
          90,
          'Nilai berbaloi minggu gaji di klinik pergigian bertauliah.'
        ),
        enforceRsaLength(
          isCasual
            ? `Slot Minggu Gaji terhad di ${shortBrand12}. WhatsApp kami untuk konsultasi & tempahan.`
            : `Susun temujanji Minggu Gaji anda di ${shortBrand12} bersama doktor bertauliah.`,
          90,
          'Tempah slot konsultasi minggu gaji anda melalui WhatsApp hari ini.'
        ),
      ],
      negativeKeywords: [
        'percuma',
        'ansuran tanpa lesen',
        'diy braces',
        'ubat murah online',
        'tiada doktor',
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
    confidence: generateCampaignCopyForAngle(brand, offerSentence, 'confidence'),
    hygiene: generateCampaignCopyForAngle(brand, offerSentence, 'hygiene'),
    payday: generateCampaignCopyForAngle(brand, offerSentence, 'payday'),
  };
}

export function isValidGeminiKeyFormat(apiKey: string): boolean {
  return /^AIza[0-9A-Za-z_-]{8,}$/.test(apiKey.trim());
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
    checkCopyCompliance(fallback).length === 0 ? fallback : 'Konsultasi Pergigian';
  const sanitized = sanitizeChannelText(candidate, safeFallback, brandName);
  const bounded = enforceRsaLength(sanitized, maxLen, safeFallback);
  if (checkCopyCompliance(bounded).length > 0) {
    return enforceRsaLength(safeFallback, maxLen, 'Konsultasi Pergigian');
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
      `Anda ialah penulis iklan pergigian Malaysia yang mematuhi polisi Meta Personal Attributes & KKLIU.`,
      `Jenama: ${params.brand.name}. Nada: ${params.brand.tone}. Sudut: ${params.angle}.`,
      `Tawaran: ${cleanOfferText(params.offerSentence)}.`,
      `Pulangkan JSON sahaja mengikut struktur ChannelCopy (facebook, instagram, tiktok, google_rsa).`,
      `Had wajib: google_rsa.headlines setiap satu <= 30 aksara; google_rsa.descriptions setiap satu <= 90 aksara.`,
      `Dilarang menggunakan: gigi anda kuning, 100%, dijamin, terbaik, No. 1, sebelum dan selepas.`,
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
      rawHeadlines.push(baseline.google_rsa.headlines[rawHeadlines.length] ?? 'Konsultasi Pergigian');
    }

    const rawDescriptions = Array.isArray(parsed.google_rsa?.descriptions)
      ? parsed.google_rsa.descriptions.slice(0, 2)
      : baseline.google_rsa.descriptions;
    while (rawDescriptions.length < 2) {
      rawDescriptions.push(
        baseline.google_rsa.descriptions[rawDescriptions.length] ??
          'Tempah konsultasi bersama doktor pergigian bertauliah.'
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
            baseline.google_rsa.headlines[idx] ?? 'Klinik Pergigian',
            params.brand.name
          )
        ),
        descriptions: rawDescriptions.map((d, idx) =>
          sanitizeRsaItem(
            d,
            90,
            baseline.google_rsa.descriptions[idx] ?? 'Konsultasi bersama doktor bertauliah.',
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
