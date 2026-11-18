import type {
  AngleId,
  BrandProfile,
  CampaignGenerationSource,
  CarouselSlide,
  ChannelCopy,
  CustomerPsychologyProfile,
  OfferDetails,
  PhotoAsset,
  StoryboardFrame,
  VariationFrameworkId,
} from '../types/campaign';
import { buildJingleLyrics } from './audioExport';
import { checkCopyCompliance, rewriteSafeCopy } from './compliance';
import {
  VARIATION_FRAMEWORKS,
  appendCollabIfAbsent,
  cleanOfferText,
  containsTokenCaseInsensitive,
  extractOfferDetails,
  extractOfferFocus,
  extractUspAndAudience,
  getFrameworkForVariation,
  resolveDistinctSubject,
  stripDuplicateTawaran,
} from './offerDetails';
import {
  POLLINATIONS_COOLDOWN_MS,
  POLLINATIONS_TEXT_ENDPOINT,
  callPollinationsJson,
  formatByokErrorReason,
  getPollinationsCooldownUntil,
  resetPollinationsCooldown,
  stripJsonCodeFenceAndExtract,
} from './pollinationsAi';
import {
  buildWhatsappCtaUrl,
  sliceSafeUtf16,
  stripLoneSurrogates,
  truncateAtWordBoundary,
} from './whatsapp';

export type { CustomerPsychologyProfile };
export {
  POLLINATIONS_COOLDOWN_MS,
  POLLINATIONS_TEXT_ENDPOINT,
  VARIATION_FRAMEWORKS,
  extractOfferDetails,
  getFrameworkForVariation,
  getPollinationsCooldownUntil,
  resetPollinationsCooldown,
};

type GeminiModelId = 'gemini-2.5-flash' | 'gemini-2.0-flash';

function buildGeminiGenerateEndpoint(model: GeminiModelId): string {
  return [
    'https:/',
    'generativelanguage.googleapis.com',
    'v1beta',
    'models',
    `${model}:generateContent`,
  ].join('/');
}

const GEMINI_ENDPOINT = buildGeminiGenerateEndpoint('gemini-2.0-flash');

function ensureSafeField(text: string, brandName: string): string {
  const deduped = stripDuplicateTawaran(stripLoneSurrogates(text));
  if (checkCopyCompliance(deduped).length > 0) {
    return stripDuplicateTawaran(rewriteSafeCopy(deduped, brandName));
  }
  return deduped;
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

  const wordTrimmed = truncateAtWordBoundary(source, maxLen);
  if (wordTrimmed.length > 0 && wordTrimmed.length <= maxLen) {
    return wordTrimmed;
  }

  return (
    truncateAtWordBoundary(cleanFallback, maxLen) ||
    sliceSafeUtf16(cleanFallback, maxLen).trimEnd()
  );
}

function getDistinctSubject(details: OfferDetails, cleanOffer: string): string {
  return resolveDistinctSubject(details, cleanOffer);
}

function formatOfferHighlight(details: OfferDetails): string {
  const parts = [
    details.discountPercent ? `diskaun ${details.discountPercent}` : null,
    details.priceTag ? `harga ${details.priceTag}` : null,
    details.bundleOrFreebie,
    details.occasion,
  ].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' • ');
  }
  if (details.uspSummary) {
    return truncateAtWordBoundary(details.uspSummary, 48);
  }
  if (
    containsTokenCaseInsensitive(details.productTopic, details.brandName) ||
    containsTokenCaseInsensitive(details.brandName, details.productTopic)
  ) {
    return details.scarcityCue ?? 'harga telus tanpa caj tersembunyi';
  }
  return details.productTopic;
}

function getVerticalPerformanceCues(
  vertical: OfferDetails['vertical'],
  uspSummary: string | null | undefined,
  targetAudience: string | null | undefined
): {
  audienceCasual: string;
  audiencePro: string;
  painCasual: string;
  painPro: string;
  desireCasual: string;
  desirePro: string;
  trustVertical: string;
  uspHook: string;
} {
  const customAudience = targetAudience?.trim();
  const customUsp = uspSummary?.trim();

  switch (vertical) {
    case 'beauty':
      return {
        audienceCasual:
          customAudience || 'Wanita sibuk & pencinta rutin kecantikan di rumah',
        audiencePro:
          customAudience || 'Pengguna moden yang mementingkan penjagaan diri praktikal di rumah',
        painCasual:
          'Habis ratusan ringgit sekali walk-in, lepas tu kena tunggu giliran berjam-jam pulak',
        painPro:
          'Kos rawatan luar yang berulang serta jadual temu janji yang sukar disesuaikan',
        desireCasual:
          customUsp || 'set penjagaan diri ringkas dari rumah dengan rasa selesa setiap minggu',
        desirePro:
          customUsp || 'penjagaan diri tersusun di rumah dengan kemasan kemas & jimat masa',
        trustVertical:
          customUsp || 'spesifikasi jelas, set lengkap terus guna & panduan langkah mudah',
        uspHook: customUsp || 'buat sendiri di rumah tanpa tunggu slot luar',
      };
    case 'fnb':
      return {
        audienceCasual:
          customAudience || 'Peminat kopi, pelajar & geng ofis yang nak port makan padu',
        audiencePro:
          customAudience || 'Pelanggan pejabat, keluarga & penganjur jamuan sekitar Malaysia',
        painCasual:
          'Order mahal-mahal tapi rasa cair, portion kecik dan sampai pun dah sejuk',
        painPro:
          'Sukar mendapatkan hidangan segar yang konsisten untuk jamuan atau tempahan pasukan',
        desireCasual:
          customUsp || 'menu segar panas-panas dengan portion puas hati untuk kongsi ramai',
        desirePro:
          customUsp || 'sajian segar harian dengan pembungkusan kemas dan penghantaran tepat masa',
        trustVertical:
          customUsp || 'bahan segar harian, bungkusan kemas & tempahan pantas via WhatsApp',
        uspHook: customUsp || 'sediakan segar setiap pagi terus ke meja anda',
      };
    case 'fashion':
      return {
        audienceCasual:
          customAudience || 'Pencinta OOTD & pembeli online yang pentingkan cutting kemas',
        audiencePro:
          customAudience || 'Profesional & pembeli gaya moden yang mengutamakan keselesaan material',
        painCasual:
          'Beli online nampak lawa, bila sampai kain panas, jarang & cutting lari terus',
        painPro:
          'Ketidakpastian ukuran saiz serta ketahanan fabrik bagi kegunaan kerja sepanjang hari',
        desireCasual:
          customUsp || 'kain sejuk jatuh elok, sarung terus nampak kemas dari pagi sampai malam',
        desirePro:
          customUsp || 'potongan rapi dan fabrik selesa bernafas untuk penampilan yakin',
        trustVertical:
          customUsp || 'carta saiz tepat, gambar kain sebenar & sokongan tukar saiz mesra',
        uspHook: customUsp || 'cutting kemas & material selesa dipakai seharian',
      };
    case 'services':
      return {
        audienceCasual:
          customAudience || 'Pemilik kereta, rumah & bisnes yang nak kerja siap kemas cepat',
        audiencePro:
          customAudience || 'Pemilik aset & pengurus operasi yang perlukan vendor menepati jadual',
        painCasual:
          'Serik tunggu quote sampai esok, lepas tu tiba-tiba ada caj tambahan masa bayar',
        painPro:
          'Kelewatan sebut harga serta ketidaktentuan jadual siap kerja yang mengganggu operasi',
        desireCasual:
          customUsp || 'kerja siap kemas ikut bajet yang dah dipersetujui dari awal lagi',
        desirePro:
          customUsp || 'pelaksanaan terancang dengan pecahan harga jelas sebelum kerja dimulakan',
        trustVertical:
          customUsp || 'pecahan kos telus sebelum mula, slot tepati masa & follow-up selepas siap',
        uspHook: customUsp || 'sebut harga jelas awal-awal, kerja siap ikut masa',
      };
    default:
      return {
        audienceCasual:
          customAudience || 'Pembeli bijak Malaysia yang nak order terus tanpa tanya panjang',
        audiencePro:
          customAudience || 'Pembeli korporat & pengguna Malaysia yang menilai ketelusan tawaran',
        painCasual:
          'Penat DM banyak kedai tapi harga tak jelas, stok pula main teka-teka',
        painPro:
          'Kesukaran membandingkan spesifikasi pakej serta mendapatkan pengesahan stok pantas',
        desireCasual:
          customUsp || 'pakej lengkap dengan harga jelas terus depan mata & order dalam 1 minit',
        desirePro:
          customUsp || 'perolehan mudah dengan butiran pakej terperinci dan respons pantas',
        trustVertical:
          customUsp || 'info pakej telus, foto produk sebenar & semakan stok terus di WhatsApp',
        uspHook: customUsp || 'nilai jelas depan mata tanpa drama harga tersembunyi',
      };
  }
}

export function buildCustomerPsychology(
  brand: BrandProfile,
  offerSentence: string,
  variationIndex = 1,
  uspAndAudience?: string
): CustomerPsychologyProfile {
  const brandName = brand.name.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(offerSentence);
  const details = extractOfferDetails(brandName, cleanOffer, uspAndAudience);
  const framework = getFrameworkForVariation(variationIndex);
  const subject = getDistinctSubject(details, cleanOffer);
  const highlight = formatOfferHighlight(details);
  const cues = getVerticalPerformanceCues(
    details.vertical,
    details.uspSummary,
    details.targetAudience
  );
  const shortOffer =
    cleanOffer.length > 90
      ? `${truncateAtWordBoundary(cleanOffer, 87)}...`
      : stripLoneSurrogates(cleanOffer);
  const isCasual = brand.tone === 'casual';
  const uspLine = details.uspSummary
    ? ` (${truncateAtWordBoundary(details.uspSummary, 64)})`
    : '';

  let profile: CustomerPsychologyProfile;

  switch (framework) {
    case 'pas':
      profile = isCasual
        ? {
            targetPersona: `${cues.audienceCasual} yang mahu dapatkan ${subject} daripada ${brandName}${uspLine}.`,
            coreTrigger: `${cues.painCasual} — tawaran "${shortOffer}" bagi jalan pintas terus order di WhatsApp.`,
            frictionObjections: `Takut stok ${subject} cepat licin atau info pakej tak sama macam dalam gambar.`,
            trustAnchors: `${brandName} tunjuk info telus: ${cues.trustVertical}, terus semak stok di WhatsApp.`,
          }
        : {
            targetPersona: `${cues.audiencePro} yang menilai ${subject} di ${brandName}${uspLine}.`,
            coreTrigger: `${cues.painPro}; tawaran "${shortOffer}" memudahkan pengesahan terus tanpa berlengah.`,
            frictionObjections: `Perlukan kepastian pecahan harga ${highlight}, kualiti sebenar dan tempoh serahan.`,
            trustAnchors: `Reputasi ${brandName} bersama ${cues.trustVertical} melalui WhatsApp rasmi.`,
          };
      break;

    case 'bab':
      profile = isCasual
        ? {
            targetPersona: `${cues.audienceCasual} yang nak tukar cara lama yang memenatkan kepada ${cues.desireCasual}.`,
            coreTrigger: `Visual jelas bagaimana ${brandName} (${highlight}) bantu urusan harian rasa jauh lebih ringan.`,
            frictionObjections: `Tertanya-tanya sama ada ${subject} betul-betul berbaloi dipakai setiap minggu.`,
            trustAnchors: `${brandName} buktikan dengan ${cues.trustVertical} dan sokongan pantas sebelum bayar.`,
          }
        : {
            targetPersona: `${cues.audiencePro} yang ingin menaik taraf aliran harian kepada ${cues.desirePro}.`,
            coreTrigger: `Peralihan praktikal daripada kos luar berulang kepada ${subject} (${highlight}) bersama ${brandName}.`,
            frictionObjections: `Menilai kesesuaian spesifikasi${uspLine}, jadual penghantaran serta terma pakej.`,
            trustAnchors: `Piawaian ${brandName}: ${cues.trustVertical} dan pengesahan terus pasukan rasmi.`,
          };
      break;

    case 'pov_ugc': {
      const povSubject = containsTokenCaseInsensitive(brandName, details.collabTag)
        ? subject
        : appendCollabIfAbsent(subject, details.collabTag, 'parens');
      profile = isCasual
        ? {
            targetPersona: `${cues.audienceCasual} yang selalu tengok unboxing & review jujur sebelum tekan link beli.`,
            coreTrigger: `Cerita jujur pengguna bila nampak sendiri kemasan ${povSubject}${uspLine} + promo "${shortOffer}".`,
            frictionObjections: `Ragu gambar iklan terlebih edit atau kualiti binaan tak padan dengan harga.`,
            trustAnchors: `Foto dekat produk sebenar ${brandName}, ${cues.trustVertical} & respon pantas tanpa skrip kaku.`,
          }
        : {
            targetPersona: `${cues.audiencePro} yang merujuk maklum balas pengguna sebenar mengenai ${subject} di ${brandName}.`,
            coreTrigger: `Sorotan pengalaman pelanggan terhadap ${cues.uspHook} serta nilai "${shortOffer}".`,
            frictionObjections: `Memerlukan gambaran fizikal sebenar dan perincian terma sebelum membuat tempahan.`,
            trustAnchors: `Testimoni seimbang pelanggan ${brandName} serta ${cues.trustVertical}.`,
          };
      break;
    }

    case 'smart_buyer':
      profile = isCasual
        ? {
            targetPersona: `${cues.audienceCasual} jenis teliti kira kos per penggunaan sebelum keluarkan duit.`,
            coreTrigger: `Pecahan matematik jelas (${highlight}${uspLine}) nampakkan penjimatan ketara berbanding beli asing.`,
            frictionObjections: `Nak pastikan harga akhir dah termasuk semua item (${details.bundleOrFreebie ?? highlight}) tanpa caj mengejut.`,
            trustAnchors: `Senarai harga terbuka ${brandName}, ${cues.trustVertical} & pengesahan bertulis di WhatsApp.`,
          }
        : {
            targetPersona: `${cues.audiencePro} yang mengira nisbah nilai-kepada-kos untuk ${subject} di ${brandName}.`,
            coreTrigger: `Kelebihan kewangan ${highlight}${uspLine} memberi pulangan lebih berbaloi untuk tempoh panjang.`,
            frictionObjections: `Menyemak perincian komponen pakej, syarat ${details.discountPercent ?? 'harga'} dan sokongan selepas jualan.`,
            trustAnchors: `Struktur harga telus ${brandName} (${cues.trustVertical}) melalui WhatsApp rasmi.`,
          };
      break;

    case 'fomo_drop': {
      const fomoOccasion = containsTokenCaseInsensitive(brandName, details.collabTag)
        ? (details.occasion ?? 'batch awal')
        : appendCollabIfAbsent(details.occasion ?? 'batch awal', details.collabTag);
      profile = isCasual
        ? {
            targetPersona: `${cues.audienceCasual} yang pantas sambar ${fomoOccasion} di ${brandName} sebelum sold out.`,
            coreTrigger: `Mood ${details.occasion ?? 'minggu gaji'} + ${details.scarcityCue ?? 'kuota batch awal'} (${shortOffer})${uspLine}.`,
            frictionObjections: `Risau slot/stok habis sementara tunggu gaji masuk atau lambat dapat balasan WhatsApp.`,
            trustAnchors: `Update baki stok terus di WhatsApp ${brandName} & keutamaan penghantaran untuk tempahan awal.`,
          }
        : {
            targetPersona: `${cues.audiencePro} yang mahukan peruntukan terawal untuk ${details.occasion ?? 'edisi terhad'} ${brandName}.`,
            coreTrigger: `Peruntukan terhad bagi ${details.occasion ?? 'kempen semasa'} (${highlight})${uspLine} menggalakkan pengesahan segera.`,
            frictionObjections: `Kepastian ketersediaan unit terkini dan garis masa penyerahan rasmi.`,
            trustAnchors: `Pengurusan giliran telus ${brandName} bersama ${cues.trustVertical}.`,
          };
      break;
    }
  }

  return {
    targetPersona: ensureSafeField(profile.targetPersona, brandName),
    coreTrigger: ensureSafeField(profile.coreTrigger, brandName),
    frictionObjections: ensureSafeField(profile.frictionObjections, brandName),
    trustAnchors: ensureSafeField(profile.trustAnchors, brandName),
  };
}

const SHORT_BRAND_CONNECTOR_RX = /^(?:x|×|&|-|\+|dan)$/i;

function buildShortBrandTag(brandName: string, maxLen: number): string {
  const trimmed = stripLoneSurrogates(brandName.trim()) || 'Bisnes';
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && !SHORT_BRAND_CONNECTOR_RX.test(words[1])) {
    const twoWords = `${words[0]} ${words[1]}`;
    if (twoWords.length <= maxLen) {
      return twoWords;
    }
  }
  if (words.length >= 1) {
    if (words[0].length <= maxLen) {
      return words[0];
    }
    return (
      truncateAtWordBoundary(words[0], maxLen) ||
      sliceSafeUtf16(words[0], maxLen).trimEnd() ||
      'Bisnes'
    );
  }
  return sliceSafeUtf16(trimmed, maxLen).trimEnd() || 'Bisnes';
}

export function generateCampaignCopyForAngle(
  brand: BrandProfile,
  offerSentence: string,
  angle: AngleId,
  variationIndex = 1,
  uspAndAudience?: string
): ChannelCopy {
  const brandName = brand.name.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(offerSentence);
  const details = extractOfferDetails(brandName, cleanOffer, uspAndAudience);
  const framework = getFrameworkForVariation(variationIndex);
  const focus = extractOfferFocus(cleanOffer);
  const subject = getDistinctSubject(details, cleanOffer);
  const rsaSubject = truncateAtWordBoundary(subject, 18) || focus;
  const rsaValueTag =
    details.priceTag ??
    (details.discountPercent ? `Diskaun ${details.discountPercent}` : rsaSubject);
  const highlight = formatOfferHighlight(details);
  const cues = getVerticalPerformanceCues(
    details.vertical,
    details.uspSummary,
    details.targetAudience
  );
  const isCasual = brand.tone === 'casual';
  const waUrl = buildWhatsappCtaUrl({
    phone: brand.whatsappNumber,
    brandName,
    offerSentence: cleanOffer,
    angle,
  });

  const shortBrand14 = buildShortBrandTag(brandName, 14);
  const shortBrand12 = buildShortBrandTag(brandName, 12);
  const hashBrand = shortBrand14.replace(/[^A-Za-z0-9]/g, '') || 'BisnesMY';
  const hashCollab = details.collabTag
    ? `#${details.collabTag.replace(/[^A-Za-z0-9]/g, '')}`
    : '#SmeMalaysia';
  const occasionLabel = details.occasion ?? 'Minggu Ini';
  const scarcityLabel = details.scarcityCue ?? 'Slot Awal Terhad';
  const uspBullet = details.uspSummary
    ? truncateAtWordBoundary(details.uspSummary, 80)
    : cues.uspHook;
  const audienceTag = details.targetAudience
    ? truncateAtWordBoundary(details.targetAudience, 56)
    : isCasual
      ? cues.audienceCasual
      : cues.audiencePro;

  const buildForFramework = (): ChannelCopy => {
    // 1. PAS (Problem - Agitate - Solve)
    if (framework === 'pas') {
      if (angle === 'urgency') {
        const fbHeadline = isCasual
          ? `${brandName} — Jangan Tunggu ${subject} Habis Baru Nak Cari!`
          : `${brandName} — Promosi Masa Terhad`;
        const fbDesc = isCasual
          ? `🔥 ${highlight} • ${scarcityLabel} — Terus WhatsApp`
          : `Tempahan awal ${subject} • Hubungi WhatsApp rasmi`;
        const fbPrimary = isCasual
          ? `${cues.painCasual}! 😩\n\nSebab tu ramai tukar ke ${brandName} untuk ${subject}:\n✅ ${uspBullet}\n✅ ${highlight}\n✅ Sesuai untuk ${audienceTag}\n\n⚡ ${cleanOffer}\nKlik WhatsApp sekarang sebelum ${scarcityLabel.toLowerCase()}: ${waUrl}`
          : `${cues.painPro}.\n\n${brandName} membawakan ${subject} dengan kelebihan utama:\n• ${uspBullet}\n• ${highlight}\n• Direka untuk ${audienceTag}\n\n${cleanOffer} Hubungi pasukan kami melalui WhatsApp rasmi untuk pengesahan segera: ${waUrl}`;

        return {
          facebook: {
            primaryText: fbPrimary,
            headline: fbHeadline,
            description: fbDesc,
            whatsappUrl: waUrl,
          },
          instagram: {
            caption: isCasual
              ? `Masih hadap masalah ${subject} yang mahal & renyah? ⚡\n\n${brandName} terus bagi jalan mudah:\n✨ ${uspBullet}\n🔥 ${cleanOffer}\n\nTap link WhatsApp sebelum batch ni penuh: ${waUrl}`
              : `Penyelesaian ${subject} bersama ${brandName} (${uspBullet}).\n${cleanOffer}\nTempah slot melalui WhatsApp rasmi: ${waUrl}`,
            hashtags: isCasual
              ? `#${hashBrand} ${hashCollab} #SolusiPantas #SlotTerhad #SupportLokal`
              : `#${hashBrand} ${hashCollab} #PromosiRasmi #SMEMalaysia #KualitiJelas`,
            whatsappUrl: waUrl,
          },
          tiktok: {
            hook: isCasual
              ? `Stop buat silap yang sama bila cari ${subject} — tengok solusi ${brandName} ni dalam 5 saat!`
              : `Mengapa ${audienceTag} memilih ${brandName} untuk ${subject} minggu ini.`,
            script: isCasual
              ? `0-2s: Hook "${cues.painCasual}". 2-4s: Close-up ${brandName} (${uspBullet}) + ${cleanOffer}. 4-6s: Tekan link WhatsApp di bio sebelum habis (${waUrl}).`
              : `0-2s: Cabaran pelanggan. 2-4s: Kelebihan ${brandName} — ${uspBullet} (${cleanOffer}). 4-6s: WhatsApp rasmi (${waUrl}).`,
            caption: isCasual
              ? `Jalan pintas ${subject} di ${brandName} ⚡ ${cleanOffer} • WhatsApp: ${waUrl}`
              : `Promosi masa terhad ${subject} di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
            whatsappUrl: waUrl,
          },
          google_rsa: {
            headlines: [
              enforceRsaLength(isCasual ? `${shortBrand14} Promo Kini` : `${shortBrand14} Rasmi`, 30, 'Promosi Terhad Kini'),
              enforceRsaLength(isCasual ? `${details.productTopic} Mudah` : `Pakej ${details.productTopic}`, 30, 'Harga Jelas Hari Ini'),
              enforceRsaLength(isCasual ? 'WhatsApp Sebelum Habis' : 'Tempah Slot WhatsApp', 30, 'WhatsApp Kami Segera'),
            ],
            descriptions: [
              enforceRsaLength(`${shortBrand12}: ${cleanOffer}`, 90, 'Slot terawal dibuka. Hubungi kami di WhatsApp sekarang.'),
              enforceRsaLength(
                isCasual
                  ? `${uspBullet} di ${shortBrand12}. Klik WhatsApp untuk semak stok.`
                  : `${uspBullet} bersama ${shortBrand12} di WhatsApp rasmi.`,
                90,
                'Hubungi WhatsApp rasmi kami untuk menyemak ketersediaan hari ini.'
              ),
            ],
            negativeKeywords: ['percuma', 'produk tiruan', 'jualan borong', 'tiada waranti', 'terpakai'],
            whatsappUrl: waUrl,
          },
        };
      }

      if (angle === 'value') {
        const fbHeadline = isCasual
          ? `${brandName} — Berbaloi Habis: ${highlight}`
          : `${brandName} — Nilai Telus ${subject}`;
        const fbDesc = isCasual
          ? `✨ ${uspBullet} • Harga jelas dari awal`
          : `Pecahan pakej jelas & kualiti konsisten di ${brandName}`;
        const fbPrimary = isCasual
          ? `Pernah rasa bayar mahal tapi rasa tak padan langsung? 💸\n\nDengan ${brandName}, setiap ringgit jelas:\n✅ ${uspBullet}\n✅ ${highlight}\n✅ Memang ngam untuk ${audienceTag}\n\n${cleanOffer} Minta pecahan harga penuh di WhatsApp: ${waUrl}`
          : `Bandingkan nilai sebenar sebelum membuat komitmen bersama ${brandName}:\n• ${uspBullet}\n• ${highlight}\n• Sesuai untuk ${audienceTag}\n\n${cleanOffer} Dapatkan perincian penuh di WhatsApp rasmi: ${waUrl}`;

        return {
          facebook: { primaryText: fbPrimary, headline: fbHeadline, description: fbDesc, whatsappUrl: waUrl },
          instagram: {
            caption: isCasual
              ? `Tak payah risau caj tersorok bila order dengan ${brandName} 💡\n✅ ${uspBullet}\n✅ ${cleanOffer}\n\nDM/WhatsApp terus untuk senarai pakej: ${waUrl}`
              : `Nilai telus dan kemasan rapi untuk ${subject} di ${brandName} (${uspBullet}).\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
            hashtags: isCasual
              ? `#${hashBrand} ${hashCollab} #HargaTelus #BerbaloiMY #SupportLokal`
              : `#${hashBrand} ${hashCollab} #NilaiJelas #KualitiKonsisten #PerniagaanMalaysia`,
            whatsappUrl: waUrl,
          },
          tiktok: {
            hook: isCasual
              ? `Jangan terkejut tengok berapa banyak boleh jimat bila ambil ${subject} di ${brandName}!`
              : `Pecahan nilai ${brandName}: apa yang anda dapat dengan ${highlight}.`,
            script: isCasual
              ? `0-2s: Benda yang orang selalu terlepas pandang. 2-4s: ${uspBullet} + ${cleanOffer}. 4-6s: Klik WhatsApp minta price list (${waUrl}).`
              : `0-2s: Kriteria nilai penting. 2-4s: Tawaran ${brandName} — ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi (${waUrl}).`,
            caption: isCasual
              ? `Nilai sebenar ${subject} di ${brandName} ✨ ${cleanOffer} • WhatsApp: ${waUrl}`
              : `Nilai & kualiti ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
            whatsappUrl: waUrl,
          },
          google_rsa: {
            headlines: [
              enforceRsaLength(isCasual ? `${shortBrand14} Berbaloi` : `${shortBrand14} Berkualiti`, 30, 'Kualiti & Nilai Jelas'),
              enforceRsaLength(isCasual ? `${highlight}` : `Harga ${rsaSubject} Telus`, 30, 'Harga Telus & Jelas'),
              enforceRsaLength(isCasual ? 'Semak Harga di WhatsApp' : 'Minta Sebut Harga Rasmi', 30, 'Semak Pakej WhatsApp'),
            ],
            descriptions: [
              enforceRsaLength(`Nilai ${shortBrand12}: ${cleanOffer}`, 90, 'Kualiti konsisten dan harga telus untuk pelanggan Malaysia.'),
              enforceRsaLength(
                isCasual
                  ? `${uspBullet}. Klik WhatsApp ${shortBrand12} untuk harga penuh.`
                  : `Ketelusan harga ${uspBullet} di ${shortBrand12}. WhatsApp rasmi.`,
                90,
                'Dapatkan penerangan pakej dan harga penuh melalui WhatsApp hari ini.'
              ),
            ],
            negativeKeywords: ['percuma', 'murah sangat', 'kualiti rendah', 'barang rosak', 'tiada jaminan'],
            whatsappUrl: waUrl,
          },
        };
      }

      // pas + social_proof
      return {
        facebook: {
          primaryText: isCasual
            ? `Ramai yang dulu pening cari ${subject}, lepas cuba ${brandName} terus rekomen kat kawan! 💙\n\nApa yang buat pelanggan suka:\n✅ ${uspBullet}\n✅ ${highlight}\n✅ Respon WhatsApp laju & mesra\n\n${cleanOffer} Jom tanya stok hari ini: ${waUrl}`
            : `Ramai pelanggan di Malaysia memilih ${brandName} untuk ${subject} kerana ${uspBullet} dan layanan mesra pelanggan.\n\n${cleanOffer} Hubungi WhatsApp rasmi kami untuk semakan lanjut: ${waUrl}`,
          headline: isCasual ? `${brandName} — Ramai Dah Repeat Order!` : `${brandName} — Dipercayai Pelanggan Malaysia`,
          description: isCasual
            ? `⭐ Digemari ${audienceTag} • WhatsApp terus`
            : `Maklum balas positif & sokongan pantas melalui WhatsApp rasmi`,
          whatsappUrl: waUrl,
        },
        instagram: {
          caption: isCasual
            ? `Bila pelanggan dah rasa sendiri ${uspBullet} di ${brandName}, memang senang repeat 💙\n${cleanOffer}\nKlik WhatsApp kami sekarang: ${waUrl}`
            : `Dipercayai oleh ${audienceTag} di ${brandName}.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
          hashtags: isCasual
            ? `#${hashBrand} ${hashCollab} #PilihanRamai #RepeatOrder #BisnesMalaysia`
            : `#${hashBrand} ${hashCollab} #KepercayaanPelanggan #MaklumBalasPositif #SMEMalaysia`,
          whatsappUrl: waUrl,
        },
        tiktok: {
          hook: isCasual
            ? `Kenapa ramai pelanggan tetap balik semula ke ${brandName} untuk ${subject}?`
            : `Mengapa pelanggan terus mempercayai ${brandName} untuk keperluan ${subject}.`,
          script: isCasual
            ? `0-2s: Reaksi pelanggan bila guna ${brandName}. 2-4s: ${uspBullet} (${cleanOffer}). 4-6s: Tekan WhatsApp sekarang (${waUrl}).`
            : `0-2s: Sorotan kepuasan pelanggan. 2-4s: ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi (${waUrl}).`,
          caption: isCasual
            ? `Ramai dah cuba ${brandName} 💙 ${cleanOffer} • WhatsApp: ${waUrl}`
            : `Dipercayai pelanggan ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
          whatsappUrl: waUrl,
        },
        google_rsa: {
          headlines: [
            enforceRsaLength(isCasual ? `${shortBrand14} Disukai Ramai` : `${shortBrand14} Dipercayai`, 30, 'Disukai Ramai Pelanggan'),
            enforceRsaLength(isCasual ? `Ramai Pilih ${rsaSubject}` : `Ulasan Positif ${rsaSubject}`, 30, 'Dipercayai Pelanggan MY'),
            enforceRsaLength(isCasual ? 'Tanya Pilihan Popular' : 'Hubungi Wakil Rasmi', 30, 'Tanya Pakej WhatsApp'),
          ],
          descriptions: [
            enforceRsaLength(`Ramai pilih ${shortBrand12}: ${cleanOffer}`, 90, 'Dipercayai pelanggan Malaysia dengan layanan pantas dan mesra.'),
            enforceRsaLength(
              isCasual
                ? `${uspBullet} — WhatsApp ${shortBrand12} sekarang.`
                : `Layanan konsisten di ${shortBrand12}. Hubungi WhatsApp rasmi.`,
              90,
              'Ketahui pakej paling popular kami melalui saluran WhatsApp rasmi.'
            ),
          ],
          negativeKeywords: ['percuma', 'ulasan palsu', 'scam', 'kedai tidak sah', 'tiada sokongan'],
          whatsappUrl: waUrl,
        },
      };
    }

    // 2. BAB (Before-After-Bridge — Lifestyle contrast WITHOUT forbidden compliance strings)
    if (framework === 'bab') {
      if (angle === 'urgency') {
        return {
          facebook: {
            primaryText: isCasual
              ? `Bayangkan tak perlu lagi penat hadap cara lama yang makan masa — sekarang ${audienceTag} boleh nikmati ${cues.desireCasual} dengan ${brandName}! ✨\n\n🎁 ${highlight}\n🔥 ${cleanOffer}\n\nRebut sementara ${scarcityLabel.toLowerCase()} di WhatsApp: ${waUrl}`
              : `Tukarkan rutin lama yang memenatkan kepada ${cues.desirePro} bersama ${brandName}.\n\nManfaatkan ${highlight} untuk tempoh ${occasionLabel} (${uspBullet}).\n${cleanOffer} Sahkan slot anda melalui WhatsApp rasmi: ${waUrl}`,
            headline: `${brandName} — Naik Taraf Pengalaman ${subject}`,
            description: `✨ ${uspBullet} • ${scarcityLabel}`,
            whatsappUrl: waUrl,
          },
          instagram: {
            caption: isCasual
              ? `Cukup-cukuplah cara lama yang renyah! Masa untuk ${cues.desireCasual} dengan ${brandName} ✨\n${cleanOffer}\nWhatsApp sekarang: ${waUrl}`
              : `Naik taraf rutin harian kepada ${cues.desirePro} di ${brandName}.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
            hashtags: `#${hashBrand} ${hashCollab} #GayaHidupModen #NaikTarafRutin #Malaysia`,
            whatsappUrl: waUrl,
          },
          tiktok: {
            hook: isCasual
              ? `Cara lama yang leceh vs rutin baru dengan ${brandName} — memang lain macam senang dia!`
              : `Perbandingan aliran lama berbanding pengalaman moden bersama ${brandName}.`,
            script: isCasual
              ? `0-2s: Cara lama yang makan masa. 2-4s: Tukar ke ${brandName} (${uspBullet}) — ${cleanOffer}. 4-6s: Tekan link WhatsApp sekarang (${waUrl}).`
              : `0-2s: Cabaran rutin lama. 2-4s: Kelebihan ${brandName} (${cleanOffer}). 4-6s: Tempah melalui WhatsApp rasmi (${waUrl}).`,
            caption: `Rutin baru lebih ringan bersama ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
            whatsappUrl: waUrl,
          },
          google_rsa: {
            headlines: [
              enforceRsaLength(`${shortBrand14} Gaya Moden`, 30, 'Naik Taraf Gaya Hidup'),
              enforceRsaLength(`Rutin Baru ${details.productTopic}`, 30, 'Pengalaman Lebih Selesa'),
              enforceRsaLength('WhatsApp Tukar Sekarang', 30, 'WhatsApp Info Kini'),
            ],
            descriptions: [
              enforceRsaLength(`Nikmati ${cues.desireCasual} bersama ${shortBrand12}.`, 90, 'Pengalaman lebih kemas dan selesa untuk rutin harian anda.'),
              enforceRsaLength(`${cleanOffer} — WhatsApp ${shortBrand12} untuk slot ${occasionLabel}.`, 90, 'Hubungi kami di WhatsApp untuk maklumat penuh.'),
            ],
            negativeKeywords: ['percuma', 'tiruan', 'cara lama', 'rosak', 'terpakai'],
            whatsappUrl: waUrl,
          },
        };
      }

      if (angle === 'value') {
        return {
          facebook: {
            primaryText: isCasual
              ? `Cuba kira berapa banyak masa & duit selamat tiap bulan bila tukar ke ${brandName}! 💡\n\n✅ ${uspBullet}\n✅ ${highlight}\n\n${cleanOffer} Jom mula langkah baru di WhatsApp: ${waUrl}`
              : `Beralih daripada perbelanjaan berulang kepada ${cues.desirePro} bersama ${brandName} (${highlight}).\n\n${cleanOffer} Dapatkan pecahan pakej di WhatsApp rasmi: ${waUrl}`,
            headline: `${brandName} — Lebih Senang & Lebih Berbaloi`,
            description: `Rutin harian lebih ringan dengan ${highlight}`,
            whatsappUrl: waUrl,
          },
          instagram: {
            caption: isCasual
              ? `Lebih tenang, lebih jimat masa dengan ${subject} daripada ${brandName} 🌿\n${uspBullet}\n${cleanOffer}\nKlik WhatsApp untuk info: ${waUrl}`
              : `Rutin lebih teratur dan nilai jelas bersama ${brandName}.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
            hashtags: `#${hashBrand} ${hashCollab} #RutinTeratur #NilaiGayaHidup #BisnesLokal`,
            whatsappUrl: waUrl,
          },
          tiktok: {
            hook: isCasual
              ? `Macam mana ${brandName} buat kerja yang dulu makan masa sejam jadi siap dalam sekelip mata!`
              : `Bagaimana ${brandName} bantu pelanggan menjimatkan masa dan kos harian.`,
            script: isCasual
              ? `0-2s: Masa habis dengan cara lama. 2-4s: Senangnya ${brandName} (${uspBullet}) — ${cleanOffer}. 4-6s: Klik WhatsApp (${waUrl}).`
              : `0-2s: Kos masa cara lama. 2-4s: Nilai ${brandName} (${cleanOffer}). 4-6s: Hubungi WhatsApp rasmi (${waUrl}).`,
            caption: `Rutin baru lebih jimat bersama ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
            whatsappUrl: waUrl,
          },
          google_rsa: {
            headlines: [
              enforceRsaLength(`${shortBrand14} Lebih Mudah`, 30, 'Pengalaman Lebih Lancar'),
              enforceRsaLength(`Nikmati ${highlight}`, 30, 'Nilai Gaya Hidup Baru'),
              enforceRsaLength('Mula Hari Ini Di WhatsApp', 30, 'Semak Pakej WhatsApp'),
            ],
            descriptions: [
              enforceRsaLength(`Beralih dari cara rumit ke ${shortBrand12}: ${cleanOffer}`, 90, 'Lebih mudah diurus dengan nilai yang jelas setiap hari.'),
              enforceRsaLength(`Ketahui bagaimana ${shortBrand12} ringankan rutin anda via WhatsApp.`, 90, 'Hubungi wakil kami untuk penerangan pakej.'),
            ],
            negativeKeywords: ['percuma', 'susah guna', 'kualiti rendah', 'borong', 'terpakai'],
            whatsappUrl: waUrl,
          },
        };
      }

      return {
        facebook: {
          primaryText: isCasual
            ? `Ramai pelanggan cerita betapa leganya lepas tukar ke ${brandName} untuk ${subject}! Daripada serabut dulu, sekarang semuanya rasa lebih lancar. 💙\n\n${cleanOffer} Jom sembang di WhatsApp: ${waUrl}`
            : `Pelanggan kami menghargai peralihan kepada ${cues.desirePro} selepas memilih ${brandName}. ${cleanOffer} Sertai mereka melalui WhatsApp rasmi: ${waUrl}`,
          headline: `${brandName} — Pengalaman Baharu Yang Ramai Suka`,
          description: `Kisah peralihan pelanggan bersama ${brandName}`,
          whatsappUrl: waUrl,
        },
        instagram: {
          caption: isCasual
            ? `Ramai dah beralih ke rutin lebih selesa dengan ${brandName} 💙\n${cleanOffer}\nWhatsApp sekarang: ${waUrl}`
            : `Peralihan ke arah standard lebih kemas bersama ${brandName}.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
          hashtags: `#${hashBrand} ${hashCollab} #PengalamanBaru #PilihanRamai #SMEMalaysia`,
          whatsappUrl: waUrl,
        },
        tiktok: {
          hook: isCasual
            ? `Dulu ragu-ragu nak tukar, sekali dah cuba ${brandName} terus rasa beza rutin harian!`
            : `Mengapa ramai pengguna beralih kepada ${brandName} untuk rutin lebih teratur.`,
          script: isCasual
            ? `0-2s: Keraguan sebelum mencuba. 2-4s: Pengalaman selesa dengan ${subject} (${cleanOffer}). 4-6s: Tanya kami di WhatsApp (${waUrl}).`
            : `0-2s: Maklum balas peralihan pelanggan. 2-4s: ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi (${waUrl}).`,
          caption: `Kisah gaya hidup baru bersama ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
          whatsappUrl: waUrl,
        },
        google_rsa: {
          headlines: [
            enforceRsaLength(`${shortBrand14} Lebih Selesa`, 30, 'Pengalaman Lebih Baik'),
            enforceRsaLength(`Ramai Pilih ${details.productTopic}`, 30, 'Pilihan Pelanggan MY'),
            enforceRsaLength('WhatsApp Tanya Sekarang', 30, 'Hubungi WhatsApp Kini'),
          ],
          descriptions: [
            enforceRsaLength(`Ramai pelanggan menikmati rutin lebih kemas bersama ${shortBrand12}.`, 90, 'Pengalaman teratur dan sokongan pantas melalui WhatsApp.'),
            enforceRsaLength(`${cleanOffer} — tanya kami di WhatsApp hari ini.`, 90, 'Hubungi WhatsApp rasmi untuk maklumat penuh.'),
          ],
          negativeKeywords: ['percuma', 'ulasan palsu', 'scam', 'rosak', 'tiada waranti'],
          whatsappUrl: waUrl,
        },
      };
    }

    // 3. POV_UGC (Honest Review / Unboxing / Creator First-Person POV)
    if (framework === 'pov_ugc') {
      if (angle === 'urgency') {
        return {
          facebook: {
            primaryText: isCasual
              ? `POV: Unboxing & test sendiri ${subject} dari ${brandName} — jujur cakap, menyesal tak grab awal! 📦✨\n\nYang paling power:\n👉 ${uspBullet}\n👉 ${highlight}\n\n${cleanOffer} Nak tengok stok live, terus WhatsApp sini: ${waUrl}`
              : `Ulasan terperinci pengguna: Mengapa tempahan awal ${subject} di ${brandName} (${highlight}) berbaloi dibuat sebelum kuota ${occasionLabel} tamat. ${cleanOffer} Hubungi WhatsApp rasmi: ${waUrl}`,
            headline: `${brandName} — Review Jujur & Unboxing ${occasionLabel}`,
            description: `📦 Testimoni sebenar ${subject} • ${scarcityLabel}`,
            whatsappUrl: waUrl,
          },
          instagram: {
            caption: isCasual
              ? `Review jujur tanpa filter! Baru unboxing ${subject} dari ${brandName} 📦✨\n${uspBullet}\n${cleanOffer}\nCepat WhatsApp tanya stok: ${waUrl}`
              : `Perkongsian pengalaman sebenar menggunakan ${subject} daripada ${brandName}.\n${cleanOffer}\nWhatsApp rasmi untuk semakan stok: ${waUrl}`,
            hashtags: `#${hashBrand} ${hashCollab} #UnboxingMalaysia #ReviewJujur #UGCStyle`,
            whatsappUrl: waUrl,
          },
          tiktok: {
            hook: isCasual
              ? `POV: Kenapa aku menyesal tak grab ${appendCollabIfAbsent(brandName, details.collabTag)} dari awal lagi!`
              : `Ulasan ringkas 6 saat: Apa yang membuatkan ${brandName} menonjol minggu ini.`,
            script: isCasual
              ? `0-2s: Buka kotak / close-up ${subject}. 2-4s: Tunjuk detail sebenar — ${uspBullet} (${cleanOffer}). 4-6s: Tekan link WhatsApp sebelum habis (${waUrl}).`
              : `0-2s: Paparan dekat ciri utama ${brandName}. 2-4s: ${cleanOffer}. 4-6s: Sahkan pesanan melalui WhatsApp rasmi (${waUrl}).`,
            caption: `Unboxing & POV jujur ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
            whatsappUrl: waUrl,
          },
          google_rsa: {
            headlines: [
              enforceRsaLength(`Review ${shortBrand14}`, 30, 'Ulasan Jujur Pelanggan'),
              enforceRsaLength(`Unboxing ${details.productTopic}`, 30, 'Paparan Sebenar Produk'),
              enforceRsaLength('Semak Stok Di WhatsApp', 30, 'Tanya Stok WhatsApp'),
            ],
            descriptions: [
              enforceRsaLength(`Perkongsian jujur ${shortBrand12}: ${cleanOffer}`, 90, 'Lihat pengalaman sebenar pelanggan sebelum membuat tempahan.'),
              enforceRsaLength(`Tanya stok terkini ${details.productTopic} terus di WhatsApp ${shortBrand12}.`, 90, 'Respons pantas dan jujur terus dari pasukan kami.'),
            ],
            negativeKeywords: ['percuma', 'palsu', 'reviu berbayar', 'scam', 'terpakai'],
            whatsappUrl: waUrl,
          },
        };
      }

      if (angle === 'value') {
        return {
          facebook: {
            primaryText: isCasual
              ? `Ramai DM tanya: "Betul ke berbaloi ${subject} di ${brandName}?" Lepas pegang sendiri kualiti dia & dapat ${highlight}, memang puas hati! 😍\n\n✅ ${uspBullet}\n✅ ${cleanOffer}\n\nNak gambar/video sebenar? WhatsApp terus: ${waUrl}`
              : `Penilaian pengguna terhadap nilai sebenar ${subject} di ${brandName}: kemasan teliti sepadan dengan ${highlight}. ${cleanOffer} Dapatkan info lanjut di WhatsApp rasmi: ${waUrl}`,
            headline: `${brandName} — Ulasan Nilai Sebenar Pengguna`,
            description: `Foto sebenar & pecahan ${highlight} • Tanya di WhatsApp`,
            whatsappUrl: waUrl,
          },
          instagram: {
            caption: isCasual
              ? `Real talk: Berbaloi ke ${subject} dari ${brandName}? Jawapannya ya, tengok saja ${uspBullet} & ${highlight} ni 👀\n${cleanOffer}\nWhatsApp sini: ${waUrl}`
              : `Penilaian jujur terhadap mutu dan nilai ${subject} di ${brandName}.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
            hashtags: `#${hashBrand} ${hashCollab} #ReviewBerbaloi #RealTalkMY #SupportLokal`,
            whatsappUrl: waUrl,
          },
          tiktok: {
            hook: isCasual
              ? `Jujur cakap, ini benda yang orang jarang bagitahu pasal ${subject} di ${brandName}...`
              : `3 perkara yang kami perhatikan selepas menguji ${subject} daripada ${brandName}.`,
            script: isCasual
              ? `0-2s: Tunjuk tekstur/kemasan sebenar. 2-4s: ${uspBullet} + nilai ${highlight} (${cleanOffer}). 4-6s: WhatsApp untuk info penuh (${waUrl}).`
              : `0-2s: Pemerhatian kualiti binaan. 2-4s: ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi (${waUrl}).`,
            caption: `Review jujur nilai ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
            whatsappUrl: waUrl,
          },
          google_rsa: {
            headlines: [
              enforceRsaLength(`Ulasan ${shortBrand14} MY`, 30, 'Ulasan Nilai Sebenar'),
              enforceRsaLength(`Kualiti ${details.productTopic}`, 30, 'Kemasan & Nilai Jelas'),
              enforceRsaLength('Tanya Gambar Sebenar Kini', 30, 'WhatsApp Info Produk'),
            ],
            descriptions: [
              enforceRsaLength(`Ulasan sebenar ${shortBrand12}: ${cleanOffer}`, 90, 'Ketahui kualiti sebenar dan nilai pakej sebelum membeli.'),
              enforceRsaLength(`Klik WhatsApp untuk foto sebenar & butiran dari ${shortBrand12}.`, 90, 'Penerangan jujur dan telus daripada wakil kami.'),
            ],
            negativeKeywords: ['percuma', 'gambar tipu', 'kualiti rendah', 'tiruan', 'terpakai'],
            whatsappUrl: waUrl,
          },
        };
      }

      return {
        facebook: {
          primaryText: isCasual
            ? `Bukan cakap kosong — tengok sendiri kenapa feed ramai penuh dengan unboxing ${appendCollabIfAbsent(brandName, details.collabTag)}! 🔥\n${uspBullet}\n\n${cleanOffer} Nak join gelombang pengguna puas hati? WhatsApp kami: ${waUrl}`
            : `Perkongsian komuniti pengguna mengenai pengalaman mereka bersama ${brandName} untuk ${subject}. ${cleanOffer} Hubungi WhatsApp rasmi untuk pertanyaan: ${waUrl}`,
          headline: `${brandName} — Pilihan Komuniti & Pencipta Konten`,
          description: `Ulasan pengguna sebenar seluruh Malaysia • WhatsApp kami`,
          whatsappUrl: waUrl,
        },
        instagram: {
          caption: isCasual
            ? `Feed penuh dengan ${brandName} minggu ni! Faham sangat kenapa ramai suka 💙\n${cleanOffer}\nJom WhatsApp: ${waUrl}`
            : `Dipercayai dan dikongsi oleh komuniti pelanggan ${brandName}.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
          hashtags: `#${hashBrand} ${hashCollab} #KomunitiMY #UGCMalaysia #PilihanRamai`,
          whatsappUrl: waUrl,
        },
        tiktok: {
          hook: isCasual
            ? `POV: Bila kawan sendiri pun rekomen ${brandName} lepas tengok unboxing ni!`
            : `Mengapa ulasan pengguna tentang ${brandName} terus meningkat minggu ini.`,
          script: isCasual
            ? `0-2s: Reaksi teruja buka bungkusan. 2-4s: Kongsi ${cleanOffer}. 4-6s: Klik WhatsApp di bio (${waUrl}).`
            : `0-2s: Sorotan maklum balas pelanggan. 2-4s: ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi (${waUrl}).`,
          caption: `POV komuniti ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
          whatsappUrl: waUrl,
        },
        google_rsa: {
          headlines: [
            enforceRsaLength(`Komuniti ${shortBrand14}`, 30, 'Pilihan Komuniti MY'),
            enforceRsaLength(`Maklum Balas ${details.productTopic}`, 30, 'Pengalaman Pelanggan'),
            enforceRsaLength('WhatsApp Tanya Pilihan Kini', 30, 'Hubungi WhatsApp Kini'),
          ],
          descriptions: [
            enforceRsaLength(`Ramai kongsi pengalaman positif dengan ${shortBrand12}: ${cleanOffer}`, 90, 'Maklum balas sebenar pelanggan di seluruh Malaysia.'),
            enforceRsaLength(`Sertai pelanggan ${shortBrand12} — tanya melalui WhatsApp hari ini.`, 90, 'Saluran WhatsApp rasmi sedia membantu anda.'),
          ],
          negativeKeywords: ['percuma', 'ulasan palsu', 'bot', 'scam', 'tidak sah'],
          whatsappUrl: waUrl,
        },
      };
    }

    // 4. SMART_BUYER (Value Breakdown & Cost-Benefit Math)
    if (framework === 'smart_buyer') {
      const mathBreakdown = [
        details.discountPercent ? `jimat ${details.discountPercent}` : null,
        details.priceTag ? `nilai ${details.priceTag}` : null,
        details.bundleOrFreebie ? `bonus ${details.bundleOrFreebie}` : null,
      ]
        .filter(Boolean)
        .join(' + ') || 'pecahan kos telus tanpa caj tambahan';

      if (angle === 'urgency') {
        return {
          facebook: {
            primaryText: isCasual
              ? `Kiraan pembeli bijak untuk ${occasionLabel} 🧮:\nDengan ${brandName}, anda terus dapat ${subject} pada ${mathBreakdown}!\n✅ ${uspBullet}\n\nBandingkan sendiri sebelum promo tamat. ${cleanOffer} Kunci harga ini di WhatsApp: ${waUrl}`
              : `Analisis nilai segera ${brandName}: Perolehan ${subject} dengan ${mathBreakdown} bagi tempoh ${occasionLabel} (${uspBullet}). ${cleanOffer} Sahkan kadar istimewa ini melalui WhatsApp rasmi: ${waUrl}`,
            headline: `${brandName} — Kiraan Berbaloi (${mathBreakdown})`,
            description: `Bandingkan nilai sebenar sebelum tamat • WhatsApp sekarang`,
            whatsappUrl: waUrl,
          },
          instagram: {
            caption: isCasual
              ? `Pembeli bijak buat kiraan dulu! 🧮✨\n${subject} di ${brandName}: ${mathBreakdown}\n${uspBullet}\n${cleanOffer}\nKunci harga anda di WhatsApp: ${waUrl}`
              : `Pecahan nilai telus ${brandName} untuk tempoh terhad: ${mathBreakdown}.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
            hashtags: `#${hashBrand} ${hashCollab} #PembeliBijak #KiraanBerbaloi #JimatCermat`,
            whatsappUrl: waUrl,
          },
          tiktok: {
            hook: isCasual
              ? `Jom buat kiraan mudah: Kenapa ${subject} di ${brandName} (${mathBreakdown}) lagi jimat!`
              : `Pecahan kos sebenar: Mengapa tawaran ${brandName} ini menguntungkan pengguna bijak.`,
            script: isCasual
              ? `0-2s: Banding kos luar vs ${brandName}. 2-4s: Tunjuk ${mathBreakdown} (${cleanOffer}). 4-6s: WhatsApp untuk kunci harga (${waUrl}).`
              : `0-2s: Jadual perbandingan nilai. 2-4s: ${cleanOffer}. 4-6s: Sahkan di WhatsApp rasmi (${waUrl}).`,
            caption: `Kiraan berbaloi ${brandName} (${mathBreakdown}) • ${cleanOffer} • WhatsApp: ${waUrl}`,
            whatsappUrl: waUrl,
          },
          google_rsa: {
            headlines: [
              enforceRsaLength(`Kiraan ${shortBrand14}`, 30, 'Kiraan Nilai Berbaloi'),
              enforceRsaLength(details.discountPercent ? `Jimat ${details.discountPercent} ${details.priceTag ?? ''}`.trim() : `Nilai ${rsaValueTag}`, 30, 'Penjimatan Jelas Kini'),
              enforceRsaLength('Kunci Harga Di WhatsApp', 30, 'Semak Harga WhatsApp'),
            ],
            descriptions: [
              enforceRsaLength(`Pecahan nilai ${shortBrand12}: ${mathBreakdown}. ${cleanOffer}`, 90, 'Bandingkan penjimatan sebenar sebelum kuota ditutup.'),
              enforceRsaLength(`Tiada caj tersembunyi di ${shortBrand12}. Semak butiran kos di WhatsApp.`, 90, 'Hubungi WhatsApp rasmi untuk pengiraan pakej anda.'),
            ],
            negativeKeywords: ['percuma', 'caj tersembunyi', 'mahal', 'kos tambahan', 'terpakai'],
            whatsappUrl: waUrl,
          },
        };
      }

      if (angle === 'value') {
        return {
          facebook: {
            primaryText: isCasual
              ? `Kenapa bayar berulang kali kalau sekali ambil di ${brandName} anda terus dapat ${mathBreakdown}? 💡\n\n✅ ${uspBullet}\n✅ Setiap sen dikira untuk kualiti ${subject}\n\n${cleanOffer} Minta jadual harga penuh di WhatsApp: ${waUrl}`
              : `Perbandingan pulangan pelaburan: Memilih ${subject} di ${brandName} (${mathBreakdown}) menjimatkan perbelanjaan jangka panjang. ${cleanOffer} Hubungi WhatsApp rasmi untuk sebut harga: ${waUrl}`,
            headline: `${brandName} — Perbandingan Nilai & Penjimatan`,
            description: `Pecahan ${mathBreakdown} yang telus & jelas`,
            whatsappUrl: waUrl,
          },
          instagram: {
            caption: isCasual
              ? `Bandingkan nilai setiap ringgit: ${mathBreakdown} hanya di ${brandName} 💡\n${cleanOffer}\nMinta pecahan harga di WhatsApp: ${waUrl}`
              : `Struktur harga telus dengan ${mathBreakdown} bersama ${brandName}.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
            hashtags: `#${hashBrand} ${hashCollab} #NilaiMaksimum #BandingHarga #SmartBuyerMY`,
            whatsappUrl: waUrl,
          },
          tiktok: {
            hook: isCasual
              ? `Kalau anda jenis kira setiap sen sebelum beli, wajib tengok pecahan ${brandName} ni!`
              : `Analisis kos-per-manfaat untuk ${subject} daripada ${brandName}.`,
            script: isCasual
              ? `0-2s: Kira kos penggunaan harian. 2-4s: Bonus ${mathBreakdown} (${cleanOffer}). 4-6s: WhatsApp tanya senarai penuh (${waUrl}).`
              : `0-2s: Pecahan komponen pakej. 2-4s: ${cleanOffer}. 4-6s: WhatsApp rasmi untuk sebut harga (${waUrl}).`,
            caption: `Perbandingan nilai ${brandName} • ${mathBreakdown} • WhatsApp: ${waUrl}`,
            whatsappUrl: waUrl,
          },
          google_rsa: {
            headlines: [
              enforceRsaLength(`Nilai ${shortBrand14}`, 30, 'Banding Nilai Terbaik'),
              enforceRsaLength(`Pecahan ${rsaValueTag}`, 30, 'Harga Telus Setiap Sen'),
              enforceRsaLength('Semak Jadual Harga Kini', 30, 'Tanya Sebut Harga'),
            ],
            descriptions: [
              enforceRsaLength(`Analisis nilai ${shortBrand12}: ${mathBreakdown}. ${cleanOffer}`, 90, 'Setiap ringgit jelas dan berbaloi tanpa caj tambahan.'),
              enforceRsaLength(`Bandingkan pilihan ${details.productTopic} di WhatsApp ${shortBrand12}.`, 90, 'Dapatkan pecahan pakej rasmi hari ini.'),
            ],
            negativeKeywords: ['percuma', 'murah sangat', 'kualiti rendah', 'caj tersorok', 'terpakai'],
            whatsappUrl: waUrl,
          },
        };
      }

      return {
        facebook: {
          primaryText: isCasual
            ? `Ramai pembeli bijak pilih ${brandName} lepas buat perbandingan sendiri — sebab ${mathBreakdown} memang padu untuk ${subject}! ${cleanOffer} Semak pilihan paling laku di WhatsApp: ${waUrl}`
            : `Pelanggan yang membuat perbandingan terperinci memilih ${brandName} atas ketelusan ${mathBreakdown}. ${cleanOffer} Hubungi WhatsApp rasmi untuk konsultasi: ${waUrl}`,
          headline: `${brandName} — Pilihan Pembeli Bijak Malaysia`,
          description: `Terbukti berbaloi dengan ${mathBreakdown} • WhatsApp kami`,
          whatsappUrl: waUrl,
        },
        instagram: {
          caption: isCasual
            ? `Sebab kenapa pembeli teliti pilih ${brandName}: ${mathBreakdown} 🧾💙\n${cleanOffer}\nWhatsApp kami sekarang: ${waUrl}`
            : `Pilihan rasional pembeli yang mengutamakan nilai bersama ${brandName}.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
          hashtags: `#${hashBrand} ${hashCollab} #SmartBuyer #PilihanBijak #SMEMalaysia`,
          whatsappUrl: waUrl,
        },
        tiktok: {
          hook: isCasual
            ? `Orang yang jenis teliti harga pun akhirnya pilih ${brandName} — ini sebabnya!`
            : `Mengapa pembeli yang teliti memilih pakej nilai ${brandName}.`,
          script: isCasual
            ? `0-2s: Reaksi pembeli lepas banding harga. 2-4s: ${mathBreakdown} (${cleanOffer}). 4-6s: Tanya di WhatsApp (${waUrl}).`
            : `0-2s: Kriteria pembeli teliti. 2-4s: ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi (${waUrl}).`,
          caption: `Pilihan pembeli bijak ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
          whatsappUrl: waUrl,
        },
        google_rsa: {
          headlines: [
            enforceRsaLength(`Bijak Pilih ${shortBrand14}`, 30, 'Pilihan Pembeli Bijak'),
            enforceRsaLength(`Rekod Nilai ${rsaValueTag}`, 30, 'Berbaloi & Dipercayai'),
            enforceRsaLength('Banding Pakej Di WhatsApp', 30, 'Tanya Pakej WhatsApp'),
          ],
          descriptions: [
            enforceRsaLength(`Pembeli teliti pilih ${shortBrand12} untuk ${mathBreakdown}.`, 90, 'Pecahan kos jelas dan sokongan pelanggan pantas.'),
            enforceRsaLength(`${cleanOffer} — WhatsApp ${shortBrand12} sekarang.`, 90, 'Hubungi saluran WhatsApp rasmi kami.'),
          ],
          negativeKeywords: ['percuma', 'scam', 'ulasan palsu', 'caj tambahan', 'tidak sah'],
          whatsappUrl: waUrl,
        },
      };
    }

    // 5. FOMO_DROP (Special Edition / Early-Bird Payday Drop)
    const dropTag = containsTokenCaseInsensitive(brandName, details.collabTag)
      ? occasionLabel
      : appendCollabIfAbsent(occasionLabel, details.collabTag);
    if (angle === 'urgency') {
      return {
        facebook: {
          primaryText: isCasual
            ? `DROP ${dropTag.toUpperCase()} KINI DIBUKA! 🚨\n${brandName} lepaskan kuota awal untuk ${subject} (${highlight}) — ${scarcityLabel.toLowerCase()} untuk batch kali ini!\n✨ ${uspBullet}\n\n${cleanOffer} Terus masuk line di WhatsApp sekarang: ${waUrl}`
            : `PELANCARAN ${dropTag.toUpperCase()} ${brandName}: Peruntukan awal ${subject} (${highlight}) dibuka dengan ${scarcityLabel.toLowerCase()} (${uspBullet}). ${cleanOffer} Sahkan giliran anda melalui WhatsApp rasmi: ${waUrl}`,
          headline: `${brandName} — Drop ${dropTag} (${scarcityLabel})`,
          description: `Akses awal ${highlight} • Rebut sebelum batch ditutup`,
          whatsappUrl: waUrl,
        },
        instagram: {
          caption: isCasual
            ? `🚨 ${dropTag} DROP di ${brandName}! Stok batch awal bergerak laju 🔥\n${uspBullet}\n${cleanOffer}\nLock slot anda di WhatsApp: ${waUrl}`
            : `Edisi ${dropTag} daripada ${brandName} kini dibuka untuk tempahan awal.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
          hashtags: `#${hashBrand} ${hashCollab} #EdisiKhas #DropTerhad #MingguGaji`,
          whatsappUrl: waUrl,
        },
        tiktok: {
          hook: isCasual
            ? `AMARAN ${dropTag.toUpperCase()}! Batch awal ${brandName} ni memang tak tunggu orang lambat!`
            : `Pengumuman pelancaran ${dropTag}: Peruntukan awal ${brandName} kini dibuka.`,
          script: isCasual
            ? `0-2s: Visual hype ${dropTag} ${brandName}. 2-4s: ${uspBullet} — ${cleanOffer}. 4-6s: Laju tekan WhatsApp sebelum sold out (${waUrl}).`
            : `0-2s: Pengumuman edisi ${dropTag}. 2-4s: ${cleanOffer}. 4-6s: Sahkan peruntukan di WhatsApp rasmi (${waUrl}).`,
          caption: `Drop ${dropTag} di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
          whatsappUrl: waUrl,
        },
        google_rsa: {
          headlines: [
            enforceRsaLength(`${shortBrand14} ${occasionLabel}`, 30, 'Edisi Khas Kini Dibuka'),
            enforceRsaLength(details.collabTag ? `Edisi ${details.collabTag}` : `Drop ${details.productTopic}`, 30, 'Stok Batch Terawal'),
            enforceRsaLength('Rebut Slot Awal WhatsApp', 30, 'Tempah Awal WhatsApp'),
          ],
          descriptions: [
            enforceRsaLength(`Drop ${dropTag} di ${shortBrand12}: ${cleanOffer}`, 90, 'Peruntukan awal dibuka untuk tempahan pantas.'),
            enforceRsaLength(`${scarcityLabel} di ${shortBrand12}. Hubungi WhatsApp sebelum ditutup.`, 90, 'Sahkan ketersediaan batch awal hari ini.'),
          ],
          negativeKeywords: ['percuma', 'stok lama', 'tiruan', 'lelong', 'terpakai'],
          whatsappUrl: waUrl,
        },
      };
    }

    if (angle === 'value') {
      return {
        facebook: {
          primaryText: isCasual
            ? `Pelanggan terawal ${dropTag} di ${brandName} paling untung sebab dapat ${highlight} sekali gus! 🎁\n✅ ${uspBullet}\n\n${cleanOffer} Jangan tunggu batch biasa harga penuh — WhatsApp sekarang: ${waUrl}`
            : `Kelebihan tempahan awal ${dropTag} di ${brandName}: Akses kepada ${highlight} dengan peruntukan terhad (${uspBullet}). ${cleanOffer} Hubungi WhatsApp rasmi: ${waUrl}`,
          headline: `${brandName} — Kelebihan Terawal ${dropTag}`,
          description: `Dapatkan ${highlight} sebelum harga kembali normal`,
          whatsappUrl: waUrl,
        },
        instagram: {
          caption: isCasual
            ? `Pelanggan awal ${dropTag} dapat ekstra nilai di ${brandName} 🎁\n${cleanOffer}\nTanya di WhatsApp: ${waUrl}`
            : `Nilai istimewa sempena ${dropTag} hanya di ${brandName}.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
          hashtags: `#${hashBrand} ${hashCollab} #EarlyBirdMY #NilaiEdisiKhas #PromosiGaji`,
          whatsappUrl: waUrl,
        },
        tiktok: {
          hook: isCasual
            ? `Siapa cepat masuk list ${dropTag} di ${brandName}, dia dapat ${highlight} paling padu!`
            : `Mengapa tempahan awal edisi ${dropTag} di ${brandName} memberi nilai tambahan.`,
          script: isCasual
            ? `0-2s: Sorotan keistimewaan ${dropTag}. 2-4s: ${cleanOffer}. 4-6s: WhatsApp sekarang (${waUrl}).`
            : `0-2s: Nilai eksklusif pelanggan awal. 2-4s: ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi (${waUrl}).`,
          caption: `Kelebihan terawal ${dropTag} ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
          whatsappUrl: waUrl,
        },
        google_rsa: {
          headlines: [
            enforceRsaLength(`Awal ${shortBrand14} ${details.discountPercent ?? ''}`.trim(), 30, 'Kelebihan Pelanggan Awal'),
            enforceRsaLength(`Pakej ${dropTag}`, 30, 'Nilai Edisi Terhad'),
            enforceRsaLength('Kunci Nilai Awal WhatsApp', 30, 'Semak Pakej Awal'),
          ],
          descriptions: [
            enforceRsaLength(`Pelanggan awal ${shortBrand12} nikmati ${highlight}: ${cleanOffer}`, 90, 'Nilai khas tersedia sementara peruntukan awal dibuka.'),
            enforceRsaLength(`WhatsApp ${shortBrand12} hari ini untuk keutamaan ${dropTag}.`, 90, 'Pengesahan cepat daripada wakil kami.'),
          ],
          negativeKeywords: ['percuma', 'harga biasa', 'kualiti rendah', 'rosak', 'terpakai'],
          whatsappUrl: waUrl,
        },
      };
    }

    return {
      facebook: {
        primaryText: isCasual
          ? `Setiap kali ${brandName} buka drop ${dropTag}, pelanggan tetap memang paling laju masuk mesej! 🔥\n${cleanOffer} Jangan tengok saja orang lain grab — WhatsApp sekarang: ${waUrl}`
          : `Sambutan hangat pelanggan setia terhadap setiap pelancaran ${dropTag} di ${brandName}. ${cleanOffer} Sertai senarai terawal melalui WhatsApp rasmi: ${waUrl}`,
        headline: `${brandName} — Rebutan Drop ${dropTag}`,
        description: `Sentiasa jadi pilihan pelanggan terawal • WhatsApp sekarang`,
        whatsappUrl: waUrl,
      },
      instagram: {
        caption: isCasual
          ? `Ramai dah masuk senarai terawal untuk ${dropTag} di ${brandName} 🔥\n${cleanOffer}\nKlik WhatsApp sekarang: ${waUrl}`
          : `Permintaan tinggi untuk edisi ${dropTag} di ${brandName}.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
        hashtags: `#${hashBrand} ${hashCollab} #LakuKeras #PelangganTerawal #BisnesMalaysia`,
        whatsappUrl: waUrl,
      },
      tiktok: {
        hook: isCasual
          ? `Tengok betapa lajunya slot ${dropTag} di ${brandName} penuh setiap kali dibuka!`
          : `Mengapa edisi ${dropTag} di ${brandName} sering mendapat sambutan awal pelanggan.`,
        script: isCasual
          ? `0-2s: Sambutan pelanggan terawal. 2-4s: ${cleanOffer}. 4-6s: Tekan WhatsApp sebelum habis (${waUrl}).`
          : `0-2s: Sorotan permintaan pelanggan. 2-4s: ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi (${waUrl}).`,
        caption: `Sambutan ${dropTag} di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
        whatsappUrl: waUrl,
      },
      google_rsa: {
        headlines: [
          enforceRsaLength(`Rebutan ${shortBrand14}`, 30, 'Sambutan Hangat Kini'),
          enforceRsaLength(`Laris ${dropTag}`, 30, 'Edisi Pilihan Ramai'),
          enforceRsaLength('Masuk Senarai Awal Kini', 30, 'Tempah Awal WhatsApp'),
        ],
        descriptions: [
          enforceRsaLength(`Pelanggan setia ${shortBrand12} sudah mula menempah: ${cleanOffer}`, 90, 'Sertai pelanggan terawal sebelum kuota ditutup.'),
          enforceRsaLength(`WhatsApp ${shortBrand12} untuk semak baki unit ${dropTag}.`, 90, 'Respons pantas dari pasukan rasmi kami.'),
        ],
        negativeKeywords: ['percuma', 'ulasan palsu', 'scam', 'stok tiruan', 'tidak sah'],
        whatsappUrl: waUrl,
      },
    };
  };

  const rawCopy = buildForFramework();

  return {
    facebook: {
      primaryText: ensureSafeField(rawCopy.facebook.primaryText, brandName),
      headline: ensureSafeField(rawCopy.facebook.headline, brandName),
      description: ensureSafeField(rawCopy.facebook.description, brandName),
      whatsappUrl: waUrl,
    },
    instagram: {
      caption: ensureSafeField(rawCopy.instagram.caption, brandName),
      hashtags: ensureSafeField(rawCopy.instagram.hashtags, brandName),
      whatsappUrl: waUrl,
    },
    tiktok: {
      hook: ensureSafeField(rawCopy.tiktok.hook, brandName),
      script: ensureSafeField(rawCopy.tiktok.script, brandName),
      caption: ensureSafeField(rawCopy.tiktok.caption, brandName),
      whatsappUrl: waUrl,
    },
    google_rsa: {
      headlines: rawCopy.google_rsa.headlines.map((h, idx) =>
        sanitizeRsaItem(h, 30, `Promosi ${shortBrand12}` || `Pilihan ${idx + 1}`, brandName)
      ),
      descriptions: rawCopy.google_rsa.descriptions.map((d) =>
        sanitizeRsaItem(d, 90, `Hubungi ${shortBrand12} di WhatsApp hari ini.`, brandName)
      ),
      negativeKeywords: rawCopy.google_rsa.negativeKeywords,
      whatsappUrl: waUrl,
    },
  };
}

export function generateCampaignCopyMap(
  brand: BrandProfile,
  offerSentence: string,
  variationIndex = 1,
  uspAndAudience?: string
): Record<AngleId, ChannelCopy> {
  return {
    urgency: generateCampaignCopyForAngle(brand, offerSentence, 'urgency', variationIndex, uspAndAudience),
    value: generateCampaignCopyForAngle(brand, offerSentence, 'value', variationIndex, uspAndAudience),
    social_proof: generateCampaignCopyForAngle(brand, offerSentence, 'social_proof', variationIndex, uspAndAudience),
  };
}

function buildFeatureGridPoints(params: {
  details: OfferDetails;
  cues: ReturnType<typeof getVerticalPerformanceCues>;
  uspHighlightPoints: string[];
  brandName: string;
}): string[] {
  const { details, cues, uspHighlightPoints } = params;
  const candidates = [
    ...uspHighlightPoints,
    details.discountPercent ? `Jimat ${details.discountPercent}` : '',
    details.priceTag ? `Hanya ${details.priceTag}` : '',
    details.bundleOrFreebie ? `${details.bundleOrFreebie}` : '',
    details.scarcityCue ? `${details.scarcityCue}` : '',
    cues.uspHook,
    'Info harga telus & jelas',
    'Order pantas via WhatsApp',
  ]
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);

  const unique: string[] = [];
  for (const item of candidates) {
    const clean = ensureSafeField(truncateAtWordBoundary(item, 48), params.brandName);
    if (clean && !unique.some((u) => u.toLowerCase() === clean.toLowerCase())) {
      unique.push(clean);
    }
    if (unique.length >= 4) break;
  }

  while (unique.length < 4) {
    const fallback = [
      'Kualiti terjamin & kemas',
      'Sesuai kegunaan harian',
      'Respon WhatsApp pantas',
      'Stok sedia dihantar',
    ][unique.length];
    unique.push(fallback);
  }

  return unique;
}

export function buildCarouselSlides(
  brand: BrandProfile,
  offerSentence: string,
  variationIndex = 1,
  productVisionSummary?: string | null,
  uspAndAudience?: string
): CarouselSlide[] {
  const brandName = brand.name.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(offerSentence);
  const details = extractOfferDetails(brandName, cleanOffer, uspAndAudience);
  const uspParsed = extractUspAndAudience(uspAndAudience);
  const cues = getVerticalPerformanceCues(
    details.vertical,
    details.uspSummary,
    details.targetAudience
  );
  const framework = getFrameworkForVariation(variationIndex);
  const subject = getDistinctSubject(details, cleanOffer);
  const highlight = formatOfferHighlight(details);
  const isCasual = brand.tone === 'casual';
  const shortOffer =
    cleanOffer.length > 56 ? `${truncateAtWordBoundary(cleanOffer, 53)}...` : cleanOffer;
  const visionNote = productVisionSummary?.trim()
    ? truncateAtWordBoundary(productVisionSummary.trim(), 62)
    : null;
  const uspSub = details.uspSummary
    ? truncateAtWordBoundary(details.uspSummary, 58)
    : null;
  const collabMention = containsTokenCaseInsensitive(brandName, details.collabTag)
    ? brandName
    : (details.collabTag ?? brandName);
  const dropTitleBrand = appendCollabIfAbsent(brandName, details.collabTag);
  const highlightPoints = buildFeatureGridPoints({
    details,
    cues,
    uspHighlightPoints: uspParsed.highlightPoints,
    brandName,
  });

  const s = (text: string) => ensureSafeField(text, brandName);

  switch (framework) {
    case 'pas':
      return [
        {
          id: 'slide-1',
          index: 0,
          role: 'hook',
          photoIndex: 0,
          badgeText: s(details.discountPercent ? `${brandName} • ${details.discountPercent}` : brandName),
          headline: s(isCasual ? `Penat Cari ${subject}?` : `Solusi ${subject} — ${brandName}`),
          subheadline: s(
            visionNote
              ? `Fokus: ${visionNote}`
              : uspSub ?? `${brandName} tawarkan ${cues.uspHook}`
          ),
          ctaText: 'Slide 1 / 4',
          editedByUser: false,
        },
        {
          id: 'slide-2',
          index: 1,
          role: 'offer',
          photoIndex: 1,
          badgeText: s(details.discountPercent ? `JIMAT ${details.discountPercent}` : 'MASALAH → SOLUSI'),
          headline: s(`Terus Selesai: ${shortOffer}`),
          subheadline: s(`${cues.painCasual} → ${highlight}`),
          ctaText: s(details.scarcityCue ?? 'Kuota Terawal'),
          editedByUser: false,
        },
        {
          id: 'slide-3',
          index: 2,
          role: 'proof',
          photoIndex: 0,
          badgeText: 'KELEBIHAN UTAMA',
          headline: s(isCasual ? `Kenapa Ramai Pilih ${subject}` : `Kelebihan ${subject} ${brandName}`),
          subheadline: s(uspSub ?? `${cues.trustVertical}`),
          highlightPoints,
          ctaText: 'Pilihan Berbaloi',
          editedByUser: false,
        },
        {
          id: 'slide-4',
          index: 3,
          role: 'cta',
          photoIndex: 1,
          badgeText: 'TEMPAH SEKARANG',
          headline: s(`WhatsApp ${brandName} Hari Ini`),
          subheadline: `Nombor rasmi: +${brand.whatsappNumber}`,
          ctaText: 'WhatsApp Sekarang',
          editedByUser: false,
        },
      ];

    case 'bab':
      return [
        {
          id: 'slide-1',
          index: 0,
          role: 'hook',
          photoIndex: 0,
          badgeText: s(`${brandName} • GAYA BAHARU`),
          headline: s(`Upgrade Rutin Harian Anda`),
          subheadline: s(
            visionNote
              ? `Gaya baharu: ${visionNote}`
              : uspSub ?? cues.desireCasual
          ),
          ctaText: 'Slide 1 / 4',
          editedByUser: false,
        },
        {
          id: 'slide-2',
          index: 1,
          role: 'offer',
          photoIndex: 1,
          badgeText: 'CARA LAMA VS BARU',
          headline: s(`Rutin Lebih Ringan: ${highlight}`),
          subheadline: s(`Tukar hari ini — ${shortOffer}`),
          ctaText: s(details.occasion ?? 'Mula Hari Ini'),
          editedByUser: false,
        },
        {
          id: 'slide-3',
          index: 2,
          role: 'proof',
          photoIndex: 0,
          badgeText: 'PENGALAMAN NYATA',
          headline: s(`Lebih Selesa & Jimat Masa`),
          subheadline: s(uspSub ?? `Pelanggan ${brandName} nikmati ${cues.desireCasual}.`),
          highlightPoints,
          ctaText: 'Rutin Lebih Kemas',
          editedByUser: false,
        },
        {
          id: 'slide-4',
          index: 3,
          role: 'cta',
          photoIndex: 1,
          badgeText: 'BERALIH SEKARANG',
          headline: s(`Mulakan Dengan ${brandName}`),
          subheadline: `WhatsApp rasmi: +${brand.whatsappNumber}`,
          ctaText: 'Tanya di WhatsApp',
          editedByUser: false,
        },
      ];

    case 'pov_ugc':
      return [
        {
          id: 'slide-1',
          index: 0,
          role: 'hook',
          photoIndex: 0,
          badgeText: s(`POV • ${brandName}`),
          headline: s(`Unboxing & Review Jujur ${subject}`),
          subheadline: s(
            visionNote
              ? `Foto sebenar: ${visionNote}`
              : uspSub ?? `Kenapa ramai cakap pasal ${collabMention}?`
          ),
          ctaText: 'Slide 1 / 4',
          editedByUser: false,
        },
        {
          id: 'slide-2',
          index: 1,
          role: 'offer',
          photoIndex: 1,
          badgeText: 'APA YANG DAPAT',
          headline: s(
            details.bundleOrFreebie
              ? `Apa Dalam Set: ${details.bundleOrFreebie} (${highlight})`
              : `Apa Yang Anda Dapat: ${highlight}`
          ),
          subheadline: s(`Foto sebenar produk & ciri di ${brandName}`),
          ctaText: 'Lihat Perincian',
          editedByUser: false,
        },
        {
          id: 'slide-3',
          index: 2,
          role: 'proof',
          photoIndex: 0,
          badgeText: 'ULASAN KOMUNITI',
          headline: s(`Maklum Balas Jujur Pelanggan Sebenar`),
          subheadline: s(uspSub ?? `Kemasan rapi, respon pantas & ${highlight}.`),
          highlightPoints,
          ctaText: 'Ulasan Sebenar',
          editedByUser: false,
        },
        {
          id: 'slide-4',
          index: 3,
          role: 'cta',
          photoIndex: 1,
          badgeText: 'SEMAK STOK',
          headline: s(`Tanya Stok Live ${brandName}`),
          subheadline: `WhatsApp terus: +${brand.whatsappNumber}`,
          ctaText: 'Klik WhatsApp',
          editedByUser: false,
        },
      ];

    case 'smart_buyer':
      return [
        {
          id: 'slide-1',
          index: 0,
          role: 'hook',
          photoIndex: 0,
          badgeText: s(`KIRAAN NILAI • ${brandName}`),
          headline: s(`Pembeli Bijak Kira Nilai ${subject}`),
          subheadline: s(
            visionNote
              ? `Nilai fizikal: ${visionNote}`
              : uspSub ?? `Bandingkan setiap sen sebelum buat keputusan.`
          ),
          ctaText: 'Slide 1 / 4',
          editedByUser: false,
        },
        {
          id: 'slide-2',
          index: 1,
          role: 'offer',
          photoIndex: 1,
          badgeText: s(details.discountPercent ?? details.priceTag ?? 'PECAHAN KOS'),
          headline: s(`Nilai Jelas: ${highlight}`),
          subheadline: s(`Pecahan telus — ${shortOffer}`),
          ctaText: 'Tiada Caj Tersorok',
          editedByUser: false,
        },
        {
          id: 'slide-3',
          index: 2,
          role: 'proof',
          photoIndex: 0,
          badgeText: 'BERBALOI',
          headline: s(`Lebih Jimat Berbanding Beli Asing`),
          subheadline: s(uspSub ?? `Kualiti terjamin ${brandName} pada harga berpatutan.`),
          highlightPoints,
          ctaText: 'Pulangan Nilai',
          editedByUser: false,
        },
        {
          id: 'slide-4',
          index: 3,
          role: 'cta',
          photoIndex: 1,
          badgeText: 'KUNCI HARGA',
          headline: s(`Minta Sebut Harga ${brandName}`),
          subheadline: `Semak harga di +${brand.whatsappNumber}`,
          ctaText: 'Semak Harga',
          editedByUser: false,
        },
      ];

    case 'fomo_drop':
      return [
        {
          id: 'slide-1',
          index: 0,
          role: 'hook',
          photoIndex: 0,
          badgeText: s(details.occasion ? `DROP ${details.occasion.toUpperCase()}` : 'EDISI KHAS'),
          headline: s(`${dropTitleBrand}: Batch Awal Dibuka!`),
          subheadline: s(
            visionNote
              ? `Batch terawal: ${visionNote}`
              : uspSub ?? `${details.scarcityCue ?? 'Kuota terhad'} untuk pelanggan pantas.`
          ),
          ctaText: 'Slide 1 / 4',
          editedByUser: false,
        },
        {
          id: 'slide-2',
          index: 1,
          role: 'offer',
          photoIndex: 1,
          badgeText: s(details.scarcityCue ?? 'TERHAD'),
          headline: s(`Rebut Awal (${details.occasion ?? 'Edisi Terhad'}): ${highlight}`),
          subheadline: s(`Keutamaan batch ${details.occasion ?? 'terawal'} di ${brandName}`),
          ctaText: 'Masuk Senarai Awal',
          editedByUser: false,
        },
        {
          id: 'slide-3',
          index: 2,
          role: 'proof',
          photoIndex: 0,
          badgeText: 'SAMBUTAN HANGAT',
          headline: s(`Pelanggan Setia Sudah Mula Tempah`),
          subheadline: s(uspSub ?? `Jangan tunggu stok batch ${details.occasion ?? 'ini'} ditutup.`),
          highlightPoints,
          ctaText: 'Stok Bergerak Laju',
          editedByUser: false,
        },
        {
          id: 'slide-4',
          index: 3,
          role: 'cta',
          photoIndex: 1,
          badgeText: 'LOCKED SLOT',
          headline: s(`Sahkan Giliran di ${brandName}`),
          subheadline: `Tempah awal di +${brand.whatsappNumber}`,
          ctaText: 'Grab Sekarang',
          editedByUser: false,
        },
      ];
  }
}

export function buildStoryboardFrames(
  brand: BrandProfile,
  offerSentence: string,
  lyrics: string,
  variationIndex = 1,
  productVisionSummary?: string | null,
  uspAndAudience?: string
): StoryboardFrame[] {
  const brandName = brand.name.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(offerSentence);
  const details = extractOfferDetails(brandName, cleanOffer, uspAndAudience);
  const cues = getVerticalPerformanceCues(
    details.vertical,
    details.uspSummary,
    details.targetAudience
  );
  const framework = getFrameworkForVariation(variationIndex);
  const subject = getDistinctSubject(details, cleanOffer);
  const highlight = formatOfferHighlight(details);
  const lines = lyrics
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const shortOffer =
    cleanOffer.length > 48 ? `${truncateAtWordBoundary(cleanOffer, 45)}...` : cleanOffer;
  const s = (text: string) => ensureSafeField(text, brandName);

  const visionBit = productVisionSummary?.trim()
    ? truncateAtWordBoundary(productVisionSummary.trim(), 40)
    : null;
  const uspFrameBit = details.uspSummary ? truncateAtWordBoundary(details.uspSummary, 32) : null;

  let headlines: [string, string, string, string];
  switch (framework) {
    case 'pas':
      headlines = [
        `${brandName}: Solusi ${subject}`,
        visionBit
          ? `Sorotan: ${visionBit}`
          : uspFrameBit
            ? `Solusi: ${uspFrameBit}`
            : cues.uspHook,
        `Tawaran Kini: ${shortOffer}`,
        `WhatsApp +${brand.whatsappNumber} Sekarang`,
      ];
      break;
    case 'bab':
      headlines = [
        `${brandName}: Cara Baru Lebih Senang`,
        visionBit
          ? `Rutin Baru: ${visionBit}`
          : uspFrameBit
            ? `Rutin Baru: ${uspFrameBit}`
            : cues.desireCasual,
        `Gaya Baharu: ${highlight}`,
        `Tukar Sekarang: WA +${brand.whatsappNumber}`,
      ];
      break;
    case 'pov_ugc':
      headlines = [
        `POV Unboxing ${brandName}`,
        visionBit
          ? `Foto Nyata: ${visionBit}`
          : uspFrameBit
            ? `Review Nyata: ${uspFrameBit}`
            : `Review Jujur ${subject}`,
        details.bundleOrFreebie
          ? `Dalam Kotak: ${details.bundleOrFreebie}`
          : `Ulasan Nyata: ${highlight}`,
        `Cuba Sekarang — WA +${brand.whatsappNumber}`,
      ];
      break;
    case 'smart_buyer':
      headlines = [
        `Kiraan Bijak ${brandName}`,
        uspFrameBit ? `USP: ${uspFrameBit}` : `Banding Nilai: ${highlight}`,
        `Kiraan Jimat: ${highlight}`,
        `Kunci Nilai: WA +${brand.whatsappNumber}`,
      ];
      break;
    case 'fomo_drop':
      headlines = [
        `Drop ${details.occasion ?? 'Khas'} ${brandName}`,
        details.scarcityCue
          ? `Pantas: ${details.scarcityCue}`
          : uspFrameBit
            ? `Rebut: ${uspFrameBit}`
            : `Kuota Terawal Bergerak Laju`,
        `Drop Terawal: ${shortOffer}`,
        `Slot Terawal: WA +${brand.whatsappNumber}`,
      ];
      break;
  }

  return [
    {
      id: 'frame-1',
      index: 0,
      startSec: 0.0,
      endSec: 1.35,
      photoIndex: 0,
      overlayHeadline: s(headlines[0]),
      lyricLine: lines[0] ?? `${brandName} pilihan tepat anda,`,
    },
    {
      id: 'frame-2',
      index: 1,
      startSec: 1.35,
      endSec: 2.75,
      photoIndex: 1,
      overlayHeadline: s(headlines[1]),
      lyricLine: lines[1] ?? `${cues.uspHook},`,
    },
    {
      id: 'frame-3',
      index: 2,
      startSec: 2.75,
      endSec: 4.15,
      photoIndex: 0,
      overlayHeadline: s(headlines[2]),
      lyricLine: lines[2] ?? shortOffer,
    },
    {
      id: 'frame-4',
      index: 3,
      startSec: 4.15,
      endSec: 5.5,
      photoIndex: 1,
      overlayHeadline: s(headlines[3]),
      lyricLine: lines[3] ?? `Jom WhatsApp ${brandName} sekarang!`,
    },
  ];
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
    return ensureSafeField(fallback, brandName);
  }
  const trimmed = stripDuplicateTawaran(stripLoneSurrogates(candidate.trim()));
  if (!trimmed) {
    return ensureSafeField(fallback, brandName);
  }
  if (checkCopyCompliance(trimmed).length > 0) {
    return stripDuplicateTawaran(rewriteSafeCopy(trimmed, brandName));
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
    checkCopyCompliance(fallback).length === 0 ? fallback : 'Tawaran Terhad';
  const sanitized = sanitizeChannelText(candidate, safeFallback, brandName);
  const bounded = enforceRsaLength(sanitized, maxLen, safeFallback);
  if (checkCopyCompliance(bounded).length > 0) {
    return enforceRsaLength(safeFallback, maxLen, 'Tawaran Terhad');
  }
  return bounded;
}

function sanitizeSingleAngleCopy(
  parsed: Partial<ChannelCopy> | undefined,
  baseline: ChannelCopy,
  brandName: string
): ChannelCopy {
  const waUrl = baseline.facebook.whatsappUrl;

  const rawHeadlines = Array.isArray(parsed?.google_rsa?.headlines)
    ? parsed.google_rsa.headlines.slice(0, 3)
    : baseline.google_rsa.headlines;
  while (rawHeadlines.length < 3) {
    rawHeadlines.push(baseline.google_rsa.headlines[rawHeadlines.length] ?? 'Tawaran Terhad');
  }

  const rawDescriptions = Array.isArray(parsed?.google_rsa?.descriptions)
    ? parsed.google_rsa.descriptions.slice(0, 2)
    : baseline.google_rsa.descriptions;
  while (rawDescriptions.length < 2) {
    rawDescriptions.push(
      baseline.google_rsa.descriptions[rawDescriptions.length] ??
        'Hubungi kami di WhatsApp untuk maklumat lanjut.'
    );
  }

  const rawNegatives =
    Array.isArray(parsed?.google_rsa?.negativeKeywords) &&
    parsed.google_rsa.negativeKeywords.length >= 4
      ? parsed.google_rsa.negativeKeywords.map((k) => String(k).trim()).filter(Boolean)
      : baseline.google_rsa.negativeKeywords;

  return {
    facebook: {
      primaryText: ensureSingleWhatsappUrl(
        sanitizeChannelText(parsed?.facebook?.primaryText, baseline.facebook.primaryText, brandName),
        waUrl,
        (t, u) => `${t} ${u}`
      ),
      headline: sanitizeChannelText(parsed?.facebook?.headline, baseline.facebook.headline, brandName),
      description: sanitizeChannelText(
        parsed?.facebook?.description,
        baseline.facebook.description,
        brandName
      ),
      whatsappUrl: waUrl,
    },
    instagram: {
      caption: ensureSingleWhatsappUrl(
        sanitizeChannelText(parsed?.instagram?.caption, baseline.instagram.caption, brandName),
        waUrl,
        (t, u) => `${t}\n${u}`
      ),
      hashtags: sanitizeChannelText(
        parsed?.instagram?.hashtags,
        baseline.instagram.hashtags,
        brandName
      ),
      whatsappUrl: waUrl,
    },
    tiktok: {
      hook: sanitizeChannelText(parsed?.tiktok?.hook, baseline.tiktok.hook, brandName),
      script: ensureSingleWhatsappUrl(
        sanitizeChannelText(parsed?.tiktok?.script, baseline.tiktok.script, brandName),
        waUrl,
        (t, u) => `${t} (${u})`
      ),
      caption: ensureSingleWhatsappUrl(
        sanitizeChannelText(parsed?.tiktok?.caption, baseline.tiktok.caption, brandName),
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
          brandName
        )
      ),
      descriptions: rawDescriptions.map((d, idx) =>
        sanitizeRsaItem(
          d,
          90,
          baseline.google_rsa.descriptions[idx] ?? 'Produk & servis berkualiti untuk anda.',
          brandName
        )
      ),
      negativeKeywords:
        rawNegatives.length >= 4 ? rawNegatives : baseline.google_rsa.negativeKeywords,
      whatsappUrl: waUrl,
    },
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
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

function inferImageMimeFromPath(path: string, headerMime: string | null): string {
  if (headerMime && /^image\/(?:png|jpeg|webp)$/i.test(headerMime.split(';')[0].trim())) {
    return headerMime.split(';')[0].trim().toLowerCase();
  }
  if (/\.webp(?:\?|$)/i.test(path)) return 'image/webp';
  if (/\.jpe?g(?:\?|$)/i.test(path)) return 'image/jpeg';
  return 'image/png';
}

export interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export async function resolvePhotoInlineDataPart(
  photo: PhotoAsset | undefined,
  signal?: AbortSignal
): Promise<GeminiInlineDataPart | null> {
  const src = photo?.src?.trim();
  if (!src) return null;

  const dataMatch = src.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (dataMatch) {
    const rawMime = dataMatch[1].toLowerCase();
    const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
    const data = dataMatch[2].replace(/\s+/g, '');
    if (data.length > 0) {
      return { inlineData: { mimeType, data } };
    }
    return null;
  }

  // Only allow strict same-origin relative URLs like /assets/...
  if (src.startsWith('/') && !src.startsWith('//') && !src.startsWith('/\\')) {
    try {
      const response = await fetch(src, { signal });
      if (!response.ok) {
        return null;
      }
      const bytes = await response.arrayBuffer();
      if (!bytes || bytes.byteLength === 0) {
        return null;
      }
      const mimeType = inferImageMimeFromPath(src, response.headers.get('content-type'));
      const data = arrayBufferToBase64(bytes);
      return data ? { inlineData: { mimeType, data } } : null;
    } catch {
      return null;
    }
  }

  return null;
}

function linkAbortSignals(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number
): { controller: AbortController; wasTimeout: () => boolean; cleanup: () => void } {
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timerId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    controller,
    wasTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timerId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

function getFrameworkPromptDirective(framework: VariationFrameworkId): string {
  switch (framework) {
    case 'pas':
      return 'Variasi #1 — Masalah -> Solusi (PAS): Hook pada masalah harian yang dekat dengan audiens Malaysia, tambah emosi/impak, lalu beri penyelesaian pantas + CTA WhatsApp.';
    case 'bab':
      return 'Variasi #2 — Transformasi & Gaya Hidup (BAB): Bandingkan rutin lama yang memenatkan dengan kehidupan baru yang jauh lebih senang. DILARANG menulis frasa literal "sebelum dan selepas" atau "before and after".';
    case 'pov_ugc':
      return 'Variasi #3 — POV / Review Jujur & Unboxing (Gaya UGC): Suara orang pertama Malaysia yang natural ("Jujur cakap...", "Menyesal tak grab awal..."), ceritakan ciri fizikal & USP sebenar.';
    case 'smart_buyer':
      return 'Variasi #4 — Kiraan Berbaloi & Perbandingan Nilai (Smart Buyer): Pecahkan penjimatan sebenar guna nombor (% diskaun, harga RM, bundle/percuma, kos per penggunaan).';
    case 'fomo_drop':
      return 'Variasi #5 — Edisi Khas / FOMO Pelanggan Terawal: Tenaga pelancaran batch awal, minggu gaji/edisi khas, kolaborasi, dan gesaan kunci slot awal.';
  }
}

export interface MultimodalCampaignResult {
  source: CampaignGenerationSource;
  visualSummary: string | null;
  psychology: CustomerPsychologyProfile;
  copyByAngle: Record<AngleId, ChannelCopy>;
  carouselSlides: Array<{
    badgeText: string;
    headline: string;
    subheadline: string;
    ctaText: string;
    highlightPoints?: string[];
  }>;
  jingleLyrics: string;
  storyboardFrames: Array<{
    overlayHeadline: string;
    lyricLine: string;
  }>;
  byokErrorReason?: string | null;
  pollinationsErrorReason?: string | null;
  cooldownUntilMs?: number | null;
}

interface RawGeminiMultimodalPayload {
  visualSummary?: unknown;
  psychology?: Partial<CustomerPsychologyProfile>;
  angles?: Partial<Record<AngleId, Partial<ChannelCopy>>>;
  carouselSlides?: Array<{
    badgeText?: unknown;
    headline?: unknown;
    subheadline?: unknown;
    ctaText?: unknown;
    highlightPoints?: unknown;
  }>;
  jingleLyrics?: unknown;
  storyboardFrames?: Array<{
    overlayHeadline?: unknown;
    lyricLine?: unknown;
  }>;
}

function buildBaselineSnapshotResult(params: {
  brand: BrandProfile;
  cleanOffer: string;
  variationIndex: number;
  uspAndAudience?: string;
}): {
  baselinePsych: CustomerPsychologyProfile;
  baselineCopyMap: Record<AngleId, ChannelCopy>;
  baselineSlides: CarouselSlide[];
  baselineLyrics: string;
  baselineFrames: StoryboardFrame[];
} {
  const baselinePsych = buildCustomerPsychology(
    params.brand,
    params.cleanOffer,
    params.variationIndex,
    params.uspAndAudience
  );
  const baselineCopyMap = generateCampaignCopyMap(
    params.brand,
    params.cleanOffer,
    params.variationIndex,
    params.uspAndAudience
  );
  const baselineSlides = buildCarouselSlides(
    params.brand,
    params.cleanOffer,
    params.variationIndex,
    null,
    params.uspAndAudience
  );
  const baselineLyrics = buildJingleLyrics(
    params.brand.name,
    params.cleanOffer,
    params.variationIndex,
    params.uspAndAudience
  );
  const baselineFrames = buildStoryboardFrames(
    params.brand,
    params.cleanOffer,
    baselineLyrics,
    params.variationIndex,
    null,
    params.uspAndAudience
  );
  return {
    baselinePsych,
    baselineCopyMap,
    baselineSlides,
    baselineLyrics,
    baselineFrames,
  };
}

function hydratePayloadToCampaignResult(params: {
  source: CampaignGenerationSource;
  parsed: RawGeminiMultimodalPayload;
  brand: BrandProfile;
  baselinePsych: CustomerPsychologyProfile;
  baselineCopyMap: Record<AngleId, ChannelCopy>;
  baselineSlides: CarouselSlide[];
  baselineLyrics: string;
  baselineFrames: StoryboardFrame[];
  byokErrorReason?: string | null;
  cooldownUntilMs?: number | null;
}): MultimodalCampaignResult {
  const { parsed, brand, baselinePsych, baselineCopyMap, baselineSlides, baselineLyrics, baselineFrames } =
    params;
  const brandName = brand.name.trim() || 'Bisnes Saya';

  const visualSummaryRaw =
    typeof parsed.visualSummary === 'string' && parsed.visualSummary.trim()
      ? sanitizeChannelText(parsed.visualSummary, '', brandName)
      : null;
  const visualSummary = visualSummaryRaw || null;

  const psychology: CustomerPsychologyProfile = {
    targetPersona: sanitizeChannelText(
      parsed.psychology?.targetPersona,
      baselinePsych.targetPersona,
      brandName
    ),
    coreTrigger: sanitizeChannelText(
      parsed.psychology?.coreTrigger,
      baselinePsych.coreTrigger,
      brandName
    ),
    frictionObjections: sanitizeChannelText(
      parsed.psychology?.frictionObjections,
      baselinePsych.frictionObjections,
      brandName
    ),
    trustAnchors: sanitizeChannelText(
      parsed.psychology?.trustAnchors,
      baselinePsych.trustAnchors,
      brandName
    ),
    ...(visualSummary ? { productVisionSummary: visualSummary } : {}),
  };

  const copyByAngle: Record<AngleId, ChannelCopy> = {
    urgency: sanitizeSingleAngleCopy(
      parsed.angles?.urgency,
      baselineCopyMap.urgency,
      brandName
    ),
    value: sanitizeSingleAngleCopy(
      parsed.angles?.value,
      baselineCopyMap.value,
      brandName
    ),
    social_proof: sanitizeSingleAngleCopy(
      parsed.angles?.social_proof,
      baselineCopyMap.social_proof,
      brandName
    ),
  };

  const carouselSlides = baselineSlides.map((baseSlide, idx) => {
    const candidate = Array.isArray(parsed.carouselSlides)
      ? parsed.carouselSlides[idx]
      : undefined;
    const candidatePoints = Array.isArray(candidate?.highlightPoints)
      ? candidate.highlightPoints
          .map((p) => (typeof p === 'string' ? sanitizeChannelText(p, '', brandName) : ''))
          .filter(Boolean)
          .slice(0, 4)
      : undefined;

    return {
      badgeText: sanitizeChannelText(candidate?.badgeText, baseSlide.badgeText, brandName),
      headline: sanitizeChannelText(candidate?.headline, baseSlide.headline, brandName),
      subheadline: sanitizeChannelText(
        candidate?.subheadline,
        baseSlide.subheadline,
        brandName
      ),
      ctaText: sanitizeChannelText(candidate?.ctaText, baseSlide.ctaText, brandName),
      ...(candidatePoints && candidatePoints.length > 0
        ? { highlightPoints: candidatePoints }
        : baseSlide.highlightPoints
          ? { highlightPoints: baseSlide.highlightPoints }
          : {}),
    };
  });

  let jingleLyrics = sanitizeChannelText(parsed.jingleLyrics, baselineLyrics, brandName);
  if (!jingleLyrics.toLowerCase().includes(brandName.toLowerCase())) {
    jingleLyrics = `${brandName} — ${jingleLyrics}`;
  }

  const storyboardFrames = baselineFrames.map((baseFrame, idx) => {
    const candidate = Array.isArray(parsed.storyboardFrames)
      ? parsed.storyboardFrames[idx]
      : undefined;
    let overlayHeadline = sanitizeChannelText(
      candidate?.overlayHeadline,
      baseFrame.overlayHeadline,
      brandName
    );
    if (idx === 0 && !overlayHeadline.toLowerCase().includes(brandName.toLowerCase())) {
      overlayHeadline = `${brandName}: ${overlayHeadline}`;
    }
    if (idx === 3 && !overlayHeadline.includes(`+${brand.whatsappNumber}`)) {
      overlayHeadline = baseFrame.overlayHeadline;
    }
    const lyricLine = sanitizeChannelText(
      candidate?.lyricLine,
      baseFrame.lyricLine,
      brandName
    );
    return { overlayHeadline, lyricLine };
  });

  return {
    source: params.source,
    visualSummary,
    psychology,
    copyByAngle,
    carouselSlides,
    jingleLyrics,
    storyboardFrames,
    byokErrorReason: params.byokErrorReason ?? null,
    cooldownUntilMs: params.cooldownUntilMs ?? null,
  };
}

const MALAYSIAN_PERFORMANCE_SYSTEM_PROMPT = [
  'Anda ialah Pengarah Kreatif & Pakar Copywriting Direct-Response Performance Marketing Malaysia.',
  'Gaya penulisan WAJIB kedengaran seperti marketer Malaysia sebenar (padat, scroll-stopping, emosional, jelas pecahan nilai & emoji berstruktur) — DILARANG sama sekali bahasa surat rasmi kaku atau ayat templat klise seperti "Daripada proses lama yang tidak teratur", "Risau caj tersembunyi", atau "Pelanggan aktif di Malaysia yang mencari".',
  'Sentiasa patuhi polisi iklan Meta Personal Attributes & etika pengiklanan Malaysia.',
  'Pulangkan SATU objek JSON sah sahaja tanpa teks pengenalan atau penutup.',
].join(' ');

function buildSingleCallCampaignPrompt(params: {
  brand: BrandProfile;
  cleanOffer: string;
  details: OfferDetails;
  uspAndAudience?: string;
  variationIndex: number;
  framework: VariationFrameworkId;
  withPhotosNote: boolean;
}): string {
  const { brand, cleanOffer, details, uspAndAudience, variationIndex, framework, withPhotosNote } =
    params;
  const brandName = brand.name.trim() || 'Bisnes Saya';
  return [
    withPhotosNote
      ? 'Teliti kedua-dua gambar produk yang dilampirkan (jika ada) untuk mengenal pasti kategori produk, ciri visual, warna/kolaborasi, dan kelebihan utama.'
      : 'Gunakan konteks jenama, tawaran, dan USP/sasaran pelanggan di bawah untuk menghasilkan aset kempen yang tajam & khusus.',
    `Jenama: ${brandName}. Nada: ${brand.tone === 'casual' ? 'Santai & Mesra Malaysia (guna bullet/emoji yang kemas)' : 'Profesional & Meyakinkan (korporat moden, bukan kaku)'}. WhatsApp: +${brand.whatsappNumber}.`,
    `Tawaran Kempen: ${cleanOffer}`,
    `USP & Sasaran Pelanggan: ${uspAndAudience?.trim() || 'Rujuk butiran tawaran & kategori produk'}`,
    `Butiran Dikesan: topik="${details.productTopic}", kolaborasi="${details.collabTag ?? '-'}", diskaun="${details.discountPercent ?? '-'}", harga="${details.priceTag ?? '-'}", pakej/percuma="${details.bundleOrFreebie ?? '-'}", acara="${details.occasion ?? '-'}".`,
    `Rangka Kerja Wajib (Variasi #${variationIndex}): ${getFrameworkPromptDirective(framework)}`,
    'Pulangkan SATU objek JSON sahaja dengan struktur tepat:',
    '{',
    '  "visualSummary": "Ringkasan 1 ayat produk & kelebihan utama yang dikesan",',
    '  "psychology": { "targetPersona": "...", "coreTrigger": "...", "frictionObjections": "...", "trustAnchors": "..." },',
    '  "angles": {',
    '    "urgency": { "facebook": {"primaryText","headline","description"}, "instagram": {"caption","hashtags"}, "tiktok": {"hook","script","caption"}, "google_rsa": {"headlines":[3],"descriptions":[2],"negativeKeywords":[5]} },',
    '    "value": { ... },',
    '    "social_proof": { ... }',
    '  },',
    '  "carouselSlides": [',
    '    {"badgeText","headline","subheadline","ctaText"},',
    '    {"badgeText","headline","subheadline","ctaText"},',
    '    {"badgeText","headline","subheadline","ctaText","highlightPoints":[4 point ringkas <=6 patah perkataan]},',
    '    {"badgeText","headline","subheadline","ctaText"}',
    '  ],',
    '  "jingleLyrics": "Korus 4 baris Bahasa Melayu berirama yang menyebut nama jenama",',
    '  "storyboardFrames": [4 objek {"overlayHeadline","lyricLine"} — Frame 1 mesti ada nama jenama, Frame 4 mesti ada +' + brand.whatsappNumber + ']',
    '}',
    'Peraturan ketat:',
    '- DILARANG mengulang perkataan "Tawaran Tawaran".',
    '- DILARANG guna frasa klise: "Daripada proses lama", "Risau caj tersembunyi", "Pelanggan aktif di Malaysia", "Tanya Jambatan Pakej Kini", "Pilihan Utama".',
    '- DILARANG melanggar Meta Personal Attributes atau Polisi Iklan MY: elakkan "kulit anda kusam", "anda bermasalah", "100%", "dijamin", "terbaik", "No. 1", "#1", "sebelum dan selepas", "before and after".',
    '- google_rsa.headlines setiap satu <= 30 aksara; google_rsa.descriptions setiap satu <= 90 aksara.',
  ].join('\n');
}

export async function generateMultimodalCampaignWithGemini(params: {
  apiKey: string;
  isDemoMode: boolean;
  brand: BrandProfile;
  offerSentence: string;
  uspAndAudience?: string;
  photos: [PhotoAsset, PhotoAsset];
  variationIndex: number;
  signal?: AbortSignal;
}): Promise<MultimodalCampaignResult> {
  const brandName = params.brand.name.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(params.offerSentence);
  const variationIndex = Math.max(1, Math.floor(params.variationIndex || 1));
  const framework = getFrameworkForVariation(variationIndex);
  const details = extractOfferDetails(brandName, cleanOffer, params.uspAndAudience);

  const {
    baselinePsych,
    baselineCopyMap,
    baselineSlides,
    baselineLyrics,
    baselineFrames,
  } = buildBaselineSnapshotResult({
    brand: params.brand,
    cleanOffer,
    variationIndex,
    uspAndAudience: params.uspAndAudience,
  });

  const buildOfflineResult = (
    source: CampaignGenerationSource,
    byokErrorReason: string | null = null
  ): MultimodalCampaignResult => ({
    source,
    visualSummary: null,
    psychology: baselinePsych,
    copyByAngle: baselineCopyMap,
    carouselSlides: baselineSlides.map((slide) => ({
      badgeText: slide.badgeText,
      headline: slide.headline,
      subheadline: slide.subheadline,
      ctaText: slide.ctaText,
      ...(slide.highlightPoints ? { highlightPoints: slide.highlightPoints } : {}),
    })),
    jingleLyrics: baselineLyrics,
    storyboardFrames: baselineFrames.map((frame) => ({
      overlayHeadline: frame.overlayHeadline,
      lyricLine: frame.lyricLine,
    })),
    byokErrorReason,
    cooldownUntilMs: null,
  });

  if (params.isDemoMode) {
    return buildOfflineResult('offline-smart-demo', null);
  }

  if (!isValidGeminiKeyFormat(params.apiKey)) {
    return buildOfflineResult('offline-smart-fallback', null);
  }

  if (params.signal?.aborted) {
    return buildOfflineResult('offline-smart-fallback', null);
  }

  const resolvedParts = await Promise.all([
    resolvePhotoInlineDataPart(params.photos[0], params.signal),
    resolvePhotoInlineDataPart(params.photos[1], params.signal),
  ]);
  const photoParts = resolvedParts.filter((part): part is GeminiInlineDataPart => part !== null);

  if (params.signal?.aborted) {
    return buildOfflineResult('offline-smart-fallback', null);
  }

  const prompt = buildSingleCallCampaignPrompt({
    brand: params.brand,
    cleanOffer,
    details,
    uspAndAudience: params.uspAndAudience,
    variationIndex,
    framework,
    withPhotosNote: true,
  });

  const requestParts: Array<{ text: string } | GeminiInlineDataPart> = [
    { text: prompt },
    ...photoParts,
  ];

  const modelsToTry: readonly GeminiModelId[] = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastByokError: string | null = null;

  for (const model of modelsToTry) {
    if (params.signal?.aborted) {
      return buildOfflineResult('offline-smart-fallback', lastByokError);
    }

    const { controller, wasTimeout, cleanup } = linkAbortSignals(params.signal, 15_000);
    try {
      const response = await fetch(buildGeminiGenerateEndpoint(model), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': params.apiKey.trim(),
        },
        body: JSON.stringify({
          contents: [{ parts: requestParts }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        lastByokError = formatByokErrorReason({
          provider: 'Google BYOK',
          status: response.status,
        });
        continue;
      }

      const json = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        lastByokError = formatByokErrorReason({
          provider: 'Google BYOK',
          detail: 'invalid_json',
        });
        continue;
      }

      const parsed = JSON.parse(
        stripJsonCodeFenceAndExtract(rawText)
      ) as RawGeminiMultimodalPayload;
      if (!parsed || typeof parsed !== 'object') {
        lastByokError = formatByokErrorReason({
          provider: 'Google BYOK',
          detail: 'invalid_json',
        });
        continue;
      }

      return hydratePayloadToCampaignResult({
        source: model,
        parsed,
        brand: params.brand,
        baselinePsych,
        baselineCopyMap,
        baselineSlides,
        baselineLyrics,
        baselineFrames,
        byokErrorReason: null,
      });
    } catch (err) {
      if (params.signal?.aborted && !wasTimeout()) {
        return buildOfflineResult('offline-smart-fallback', lastByokError);
      }
      lastByokError = formatByokErrorReason({
        provider: 'Google BYOK',
        timedOut: wasTimeout(),
        detail: err instanceof Error && err.message ? err.message : undefined,
      });
    } finally {
      cleanup();
    }
  }

  return buildOfflineResult(
    'offline-smart-fallback',
    lastByokError ?? formatByokErrorReason({ provider: 'Google BYOK' })
  );
}

export async function generateCampaignWithPollinations(params: {
  isDemoMode: boolean;
  brand: BrandProfile;
  offerSentence: string;
  uspAndAudience?: string;
  variationIndex: number;
  byokErrorReason?: string | null;
  signal?: AbortSignal;
}): Promise<MultimodalCampaignResult> {
  const brandName = params.brand.name.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(params.offerSentence);
  const variationIndex = Math.max(1, Math.floor(params.variationIndex || 1));
  const framework = getFrameworkForVariation(variationIndex);
  const details = extractOfferDetails(brandName, cleanOffer, params.uspAndAudience);

  const {
    baselinePsych,
    baselineCopyMap,
    baselineSlides,
    baselineLyrics,
    baselineFrames,
  } = buildBaselineSnapshotResult({
    brand: params.brand,
    cleanOffer,
    variationIndex,
    uspAndAudience: params.uspAndAudience,
  });

  const buildFallbackResult = (
    source: CampaignGenerationSource,
    pollinationsErrorReason: string | null,
    cooldownUntilMs: number | null
  ): MultimodalCampaignResult => ({
    source,
    visualSummary: null,
    psychology: baselinePsych,
    copyByAngle: baselineCopyMap,
    carouselSlides: baselineSlides.map((slide) => ({
      badgeText: slide.badgeText,
      headline: slide.headline,
      subheadline: slide.subheadline,
      ctaText: slide.ctaText,
      ...(slide.highlightPoints ? { highlightPoints: slide.highlightPoints } : {}),
    })),
    jingleLyrics: baselineLyrics,
    storyboardFrames: baselineFrames.map((frame) => ({
      overlayHeadline: frame.overlayHeadline,
      lyricLine: frame.lyricLine,
    })),
    byokErrorReason: params.byokErrorReason ?? null,
    pollinationsErrorReason,
    cooldownUntilMs,
  });

  if (params.isDemoMode) {
    return buildFallbackResult('offline-smart-demo', null, null);
  }

  const userPrompt = buildSingleCallCampaignPrompt({
    brand: params.brand,
    cleanOffer,
    details,
    uspAndAudience: params.uspAndAudience,
    variationIndex,
    framework,
    withPhotosNote: false,
  });

  const apiRes = await callPollinationsJson<RawGeminiMultimodalPayload>({
    isDemoMode: params.isDemoMode,
    systemPrompt: MALAYSIAN_PERFORMANCE_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.75,
    timeoutMs: 24_000,
    signal: params.signal,
  });

  if (!apiRes.ok) {
    const errorMsg = apiRes.skippedByGuard ? null : apiRes.reason;
    return buildFallbackResult(
      'offline-smart-fallback',
      errorMsg,
      apiRes.cooldownUntilMs
    );
  }

  return hydratePayloadToCampaignResult({
    source: 'pollinations-openai-fast',
    parsed: apiRes.data,
    brand: params.brand,
    baselinePsych,
    baselineCopyMap,
    baselineSlides,
    baselineLyrics,
    baselineFrames,
    byokErrorReason: params.byokErrorReason ?? null,
    cooldownUntilMs: apiRes.cooldownUntilMs,
  });
}

export async function generateCampaignWithAiCascade(params: {
  apiKey: string;
  isDemoMode: boolean;
  brand: BrandProfile;
  offerSentence: string;
  uspAndAudience?: string;
  photos: [PhotoAsset, PhotoAsset];
  variationIndex: number;
  signal?: AbortSignal;
}): Promise<MultimodalCampaignResult> {
  if (params.isDemoMode) {
    return generateCampaignWithPollinations({
      isDemoMode: true,
      brand: params.brand,
      offerSentence: params.offerSentence,
      uspAndAudience: params.uspAndAudience,
      variationIndex: params.variationIndex,
      signal: params.signal,
    });
  }

  let byokErrorReason: string | null = null;

  if (isValidGeminiKeyFormat(params.apiKey)) {
    const geminiResult = await generateMultimodalCampaignWithGemini(params);
    if (
      geminiResult.source === 'gemini-2.5-flash' ||
      geminiResult.source === 'gemini-2.0-flash'
    ) {
      return geminiResult;
    }
    byokErrorReason =
      geminiResult.byokErrorReason ??
      formatByokErrorReason({ provider: 'Google BYOK' });
  }

  return generateCampaignWithPollinations({
    isDemoMode: params.isDemoMode,
    brand: params.brand,
    offerSentence: params.offerSentence,
    uspAndAudience: params.uspAndAudience,
    variationIndex: params.variationIndex,
    byokErrorReason,
    signal: params.signal,
  });
}

export async function enhanceCopyWithGemini(params: {
  apiKey: string;
  isDemoMode: boolean;
  brand: BrandProfile;
  offerSentence: string;
  uspAndAudience?: string;
  angle: AngleId;
  variationIndex?: number;
  photos?: [PhotoAsset, PhotoAsset];
}): Promise<{
  copy: ChannelCopy;
  source: 'gemini' | 'pollinations' | 'baseline';
  errorReason?: string | null;
  cooldownUntilMs?: number | null;
}> {
  const variationIndex = params.variationIndex ?? 1;
  const baseline = generateCampaignCopyForAngle(
    params.brand,
    params.offerSentence,
    params.angle,
    variationIndex,
    params.uspAndAudience
  );

  if (params.isDemoMode) {
    return { copy: baseline, source: 'baseline', errorReason: null };
  }

  const framework = getFrameworkForVariation(variationIndex);
  const prompt = [
    MALAYSIAN_PERFORMANCE_SYSTEM_PROMPT,
    `Jenama: ${params.brand.name}. Nada: ${params.brand.tone}. Sudut: ${params.angle}.`,
    `Rangka Kerja: ${getFrameworkPromptDirective(framework)}`,
    `Tawaran: ${cleanOfferText(params.offerSentence)}.`,
    `USP & Sasaran: ${params.uspAndAudience?.trim() || '-'}.`,
    `Pulangkan JSON sahaja mengikut struktur ChannelCopy (facebook, instagram, tiktok, google_rsa).`,
    `Had wajib: google_rsa.headlines setiap satu <= 30 aksara; google_rsa.descriptions setiap satu <= 90 aksara.`,
    `Dilarang menggunakan: dakwaan ciri peribadi (kulit anda kusam/anda bermasalah), 100%, dijamin, terbaik, No. 1, sebelum dan selepas, atau perkataan berulang "Tawaran Tawaran".`,
  ].join('\n');

  let byokError: string | null = null;

  if (isValidGeminiKeyFormat(params.apiKey)) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const parts: Array<{ text: string } | GeminiInlineDataPart> = [{ text: prompt }];
      if (params.photos) {
        for (const p of params.photos) {
          if (p?.src?.startsWith('data:')) {
            const part = await resolvePhotoInlineDataPart(p, controller.signal);
            if (part) parts.push(part);
          }
        }
      }

      const response = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': params.apiKey.trim(),
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const json = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(
            stripJsonCodeFenceAndExtract(rawText)
          ) as Partial<ChannelCopy>;
          const enhanced = sanitizeSingleAngleCopy(parsed, baseline, params.brand.name);
          return { copy: enhanced, source: 'gemini', errorReason: null };
        }
        byokError = formatByokErrorReason({
          provider: 'Google BYOK',
          detail: 'invalid_json',
        });
      } else {
        byokError = formatByokErrorReason({
          provider: 'Google BYOK',
          status: response.status,
        });
      }
    } catch (err) {
      byokError = formatByokErrorReason({
        provider: 'Google BYOK',
        detail: err instanceof Error && err.message ? err.message : undefined,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Built-in Pollinations fallback / primary when no BYOK key or BYOK failed
  const pollRes = await callPollinationsJson<Partial<ChannelCopy>>({
    isDemoMode: params.isDemoMode,
    systemPrompt: MALAYSIAN_PERFORMANCE_SYSTEM_PROMPT,
    userPrompt: prompt,
    temperature: 0.75,
    timeoutMs: 16_000,
  });

  if (pollRes.ok) {
    const enhanced = sanitizeSingleAngleCopy(pollRes.data, baseline, params.brand.name);
    return {
      copy: enhanced,
      source: 'pollinations',
      errorReason: byokError,
      cooldownUntilMs: pollRes.cooldownUntilMs,
    };
  }

  return {
    copy: baseline,
    source: 'baseline',
    errorReason: byokError ?? (pollRes.skippedByGuard ? null : pollRes.reason),
    cooldownUntilMs: pollRes.cooldownUntilMs,
  };
}
