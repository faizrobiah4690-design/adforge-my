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
  cleanOfferText,
  extractOfferDetails,
  extractOfferFocus,
  getFrameworkForVariation,
  stripDuplicateTawaran,
} from './offerDetails';
import {
  buildWhatsappCtaUrl,
  sliceSafeUtf16,
  stripLoneSurrogates,
} from './whatsapp';

export type { CustomerPsychologyProfile };
export { VARIATION_FRAMEWORKS, extractOfferDetails, getFrameworkForVariation };

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

  const sliced = sliceSafeUtf16(source, maxLen).trimEnd();
  const lastSpace = sliced.lastIndexOf(' ');
  const wordTrimmed =
    lastSpace >= Math.floor(maxLen * 0.55) ? sliced.slice(0, lastSpace).trimEnd() : sliced;

  if (wordTrimmed.length > 0 && wordTrimmed.length <= maxLen) {
    return wordTrimmed;
  }

  return sliceSafeUtf16(cleanFallback, maxLen).trimEnd();
}

function formatOfferSubject(details: OfferDetails): string {
  if (details.collabTag && !details.productTopic.toLowerCase().includes(details.collabTag.toLowerCase())) {
    return `${details.productTopic} (${details.collabTag})`.trim();
  }
  return details.productTopic;
}

function formatOfferHighlight(details: OfferDetails): string {
  const parts = [
    details.discountPercent ? `diskaun ${details.discountPercent}` : null,
    details.priceTag ? `harga ${details.priceTag}` : null,
    details.bundleOrFreebie,
    details.occasion,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' • ') : details.productTopic;
}

function getVerticalPainAndDesire(vertical: OfferDetails['vertical']): {
  painCasual: string;
  painPro: string;
  desireCasual: string;
  desirePro: string;
  trustVertical: string;
} {
  switch (vertical) {
    case 'beauty':
      return {
        painCasual: 'Penat keluar kos tinggi di luar atau beli produk yang rumit nak guna di rumah',
        painPro: 'Keperluan rutin penjagaan diri yang praktikal, selesa di rumah, dan mudah diurus',
        desireCasual: 'rutin penjagaan diri lebih selesa di rumah dengan hasil yang kemas',
        desirePro: 'penjagaan diri berstruktur dengan pengalaman penggunaan yang konsisten',
        trustVertical: 'spesifikasi jelas, kemasan tulen, dan panduan penggunaan mesra pelanggan',
      };
    case 'fnb':
      return {
        painCasual: 'Susah nak cari hidangan segar yang betul-betul sedap dan cepat sampai tanpa caj merepek',
        painPro: 'Keperluan sajian berkualiti dengan penyediaan bersih serta penghantaran menepati masa',
        desireCasual: 'nikmati rasa padu dan bahan segar untuk seisi keluarga atau rakan sekerja',
        desirePro: 'penyediaan makanan yang konsisten, bersih, dan sesuai untuk tempahan berkumpulan',
        trustVertical: 'penyediaan segar harian, pembungkusan kemas, dan maklum balas pelanggan berulang',
      };
    case 'fashion':
      return {
        painCasual: 'Selalu kecewa bila saiz tak kena atau material nampak cantik dalam gambar saja',
        painPro: 'Keperluan gaya kemasan pakaian yang selesa dipakai sepanjang hari dan tahan lasak',
        desireCasual: 'gaya kemas dan selesa digayakan untuk kerja, santai, atau acara khas',
        desirePro: 'potongan kemas serta pilihan material berkualiti untuk penampilan profesional',
        trustVertical: 'panduan saiz tepat, perincian material telus, dan pertukaran mesra pelanggan',
      };
    case 'services':
      return {
        painCasual: 'Serik tunggu sebut harga lambat atau kerja siap separuh jalan dengan caj tambahan',
        painPro: 'Keperluan khidmat teratur dengan jadual kerja tepat serta sebut harga telus',
        desireCasual: 'urusan selesai cepat tanpa pening kepala atau kos tersembunyi',
        desirePro: 'pelaksanaan servis yang terancang, telus, dan dipantau hingga selesai',
        trustVertical: 'sebut harga jelas sebelum mula, jadual temu janji tepat, dan sokongan selepas servis',
      };
    default:
      return {
        painCasual: 'Sering keliru pilih tawaran mana yang betul-betul berbaloi dan senang nak order',
        painPro: 'Keperluan pilihan produk dan perkhidmatan yang telus, teratur, dan diyakini',
        desireCasual: 'urusan pembelian lebih mudah dengan nilai yang jelas untuk bajet harian',
        desirePro: 'perolehan yang teratur, spesifikasi jelas, dan sokongan pelanggan pantas',
        trustVertical: 'penerangan pakej telus, sokongan WhatsApp pantas, dan rekod kepuasan pelanggan',
      };
  }
}

export function buildCustomerPsychology(
  brand: BrandProfile,
  offerSentence: string,
  variationIndex = 1
): CustomerPsychologyProfile {
  const brandName = brand.name.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(offerSentence);
  const details = extractOfferDetails(brandName, cleanOffer);
  const framework = getFrameworkForVariation(variationIndex);
  const focus = extractOfferFocus(cleanOffer);
  const subject = formatOfferSubject(details);
  const highlight = formatOfferHighlight(details);
  const verticalCopy = getVerticalPainAndDesire(details.vertical);
  const shortOffer =
    cleanOffer.length > 90
      ? `${sliceSafeUtf16(cleanOffer, 87).trimEnd()}...`
      : stripLoneSurrogates(cleanOffer);
  const isCasual = brand.tone === 'casual';

  let profile: CustomerPsychologyProfile;

  switch (framework) {
    case 'pas':
      profile = isCasual
        ? {
            targetPersona: `Pembeli aktif di Malaysia yang mencari ${subject} daripada ${brandName} (${focus}) tanpa proses tempahan yang rumit.`,
            coreTrigger: `${verticalCopy.painCasual} — tawaran "${shortOffer}" memberi penyelesaian terus melalui WhatsApp.`,
            frictionObjections: `Bimbang kos tersembunyi, stok ${subject} cepat habis, atau respons mesej yang lambat.`,
            trustAnchors: `Layanan mesra ${brandName}, ${verticalCopy.trustVertical}, serta pengesahan pantas di WhatsApp rasmi.`,
          }
        : {
            targetPersona: `Golongan profesional dan pembeli berorientasikan kualiti yang menilai ${subject} di ${brandName} untuk ${verticalCopy.desirePro}.`,
            coreTrigger: `${verticalCopy.painPro}; nilai rasmi ("${shortOffer}") memudahkan keputusan pembelian hari ini.`,
            frictionObjections: `Pertimbangan terhadap ketelusan harga ${highlight}, konsistensi kualiti, dan jaminan sokongan selepas jualan.`,
            trustAnchors: `Reputasi ${brandName}, ${verticalCopy.trustVertical}, dan komunikasi rasmi yang jelas.`,
          };
      break;

    case 'bab':
      profile = isCasual
        ? {
            targetPersona: `Pengguna gaya hidup moden yang mahu ubah rutin harian kepada pengalaman lebih lancar dengan ${subject} daripada ${brandName}.`,
            coreTrigger: `Bayangkan peralihan daripada cara lama yang leceh kepada ${verticalCopy.desireCasual} bersama ${brandName} (${highlight}).`,
            frictionObjections: `Ragu sama ada ${subject} benar-benar praktikal digunakan setiap hari berbanding pilihan biasa.`,
            trustAnchors: `${brandName} menonjolkan ${verticalCopy.trustVertical} serta panduan langkah demi langkah di WhatsApp.`,
          }
        : {
            targetPersona: `Pelanggan berfokuskan gaya hidup teratur yang mahu menaik taraf rutin kerja atau harian melalui ${subject} di ${brandName}.`,
            coreTrigger: `Jambatan jelas dari rutin sedia ada yang memakan masa kepada ${verticalCopy.desirePro} dengan ${highlight}.`,
            frictionObjections: `Keperluan kepastian tentang kemudahan adaptasi, jadual penyerahan, dan piawaian ${brandName}.`,
            trustAnchors: `Standard pengurusan ${brandName}, ${verticalCopy.trustVertical}, dan konsultasi terus sebelum pengesahan.`,
          };
      break;

    case 'pov_ugc':
      profile = isCasual
        ? {
            targetPersona: `Pembeli media sosial yang gemar ulasan jujur, video unboxing, dan pengalaman sebenar sebelum mendapatkan ${subject} di ${brandName}.`,
            coreTrigger: `POV pelanggan sebenar yang berkongsi mengapa ${subject}${details.collabTag ? ` (${details.collabTag})` : ''} menjadi pilihan utama (${shortOffer}).`,
            frictionObjections: `Risau iklan terlalu melambung atau produk sebenar tidak sepadan dengan jangkaan visual.`,
            trustAnchors: `Perkongsian jujur pelanggan ${brandName}, paparan foto sebenar tanpa suntingan berlebihan, serta semakan stok telus.`,
          }
        : {
            targetPersona: `Pembeli teliti yang merujuk ulasan berfakta dan maklum balas pengguna sebenar mengenai ${subject} daripada ${brandName}.`,
            coreTrigger: `Penilaian praktikal pengguna terdahulu terhadap prestasi ${subject} serta nilai pakej "${shortOffer}".`,
            frictionObjections: `Keperluan bukti pengalaman pengguna yang sahih dan kejelasan terma sebelum membuat komitmen.`,
            trustAnchors: `Rekod maklum balas pelanggan ${brandName}, ${verticalCopy.trustVertical}, dan saluran WhatsApp rasmi.`,
          };
      break;

    case 'smart_buyer':
      profile = isCasual
        ? {
            targetPersona: `Pembeli bijak bajet di Malaysia yang membandingkan harga, ${details.discountPercent ?? 'diskaun'}, dan nilai ekstra sebelum membeli ${subject} daripada ${brandName}.`,
            coreTrigger: `Pecahan nilai jelas (${highlight}) menjadikan ${brandName} jauh lebih jimat berbanding beli secara berasingan.`,
            frictionObjections: `Ingin memastikan setiap sen berbaloi, tiada caj tambahan tersembunyi, dan betul-betul dapat ${details.bundleOrFreebie ?? highlight}.`,
            trustAnchors: `Senarai harga telus daripada ${brandName}, pecahan nilai mudah difahami, dan semakan terus melalui WhatsApp.`,
          }
        : {
            targetPersona: `Pembuat keputusan berasaskan pulangan nilai yang menilai nisbah kos-kepada-manfaat ${subject} di ${brandName}.`,
            coreTrigger: `Analisis kos berbaloi: ${highlight} menawarkan penjimatan terukur untuk kegunaan jangka panjang.`,
            frictionObjections: `Memerlukan butiran penuh komponen pakej, terma ${details.discountPercent ?? 'harga'}, dan nilai tambah sebenar.`,
            trustAnchors: `Struktur harga telus ${brandName}, ${verticalCopy.trustVertical}, dan pengesahan bertulis melalui WhatsApp rasmi.`,
          };
      break;

    case 'fomo_drop':
      profile = isCasual
        ? {
            targetPersona: `Peminat edisi terhad dan pembeli pantas yang memburu ${details.occasion ?? 'peluang terawal'}${details.collabTag ? ` ${details.collabTag}` : ''} di ${brandName}.`,
            coreTrigger: `Gelombang ${details.occasion ?? 'jualan terawal'} dengan ${details.scarcityCue ?? 'kuota terhad'} (${shortOffer}) mendorong tempahan segera.`,
            frictionObjections: `Takut terlepas unit terawal atau terlambat sahkan tempahan sebelum kuota ${details.occasion ?? 'minggu ini'} ditutup.`,
            trustAnchors: `Kemaskini stok masa nyata di WhatsApp ${brandName}, proses tempahan pantas, dan keutamaan pelanggan terawal.`,
          }
        : {
            targetPersona: `Pembeli awal yang mengutamakan akses eksklusif untuk ${details.occasion ?? 'pelancaran terhad'} ${subject} daripada ${brandName}.`,
            coreTrigger: `Peruntukan terhad bagi ${details.occasion ?? 'tempoh promosi'} (${highlight}) menggalakkan pengesahan awal sebelum penutupan kuota.`,
            frictionObjections: `Kepastian ketersediaan peruntukan terkini serta tempoh pengesahan rasmi bersama ${brandName}.`,
            trustAnchors: `Pengurusan tempahan terawal ${brandName}, ${verticalCopy.trustVertical}, dan respons pantas pasukan rasmi.`,
          };
      break;
  }

  return {
    targetPersona: ensureSafeField(profile.targetPersona, brandName),
    coreTrigger: ensureSafeField(profile.coreTrigger, brandName),
    frictionObjections: ensureSafeField(profile.frictionObjections, brandName),
    trustAnchors: ensureSafeField(profile.trustAnchors, brandName),
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
  angle: AngleId,
  variationIndex = 1
): ChannelCopy {
  const brandName = brand.name.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(offerSentence);
  const details = extractOfferDetails(brandName, cleanOffer);
  const framework = getFrameworkForVariation(variationIndex);
  const focus = extractOfferFocus(cleanOffer);
  const subject = formatOfferSubject(details);
  const highlight = formatOfferHighlight(details);
  const verticalCopy = getVerticalPainAndDesire(details.vertical);
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
    : '#PilihanLokal';
  const occasionLabel = details.occasion ?? 'Minggu Ini';
  const scarcityLabel = details.scarcityCue ?? 'Kuota Terawal Terhad';

  // Framework-specific copy per angle & channel
  const buildForFramework = (): ChannelCopy => {
    // 1. PAS (Problem - Agitate - Solve)
    if (framework === 'pas') {
      if (angle === 'urgency') {
        const fbHeadline = isCasual
          ? `${brandName} — Selesaikan Masalah ${subject} Hari Ini`
          : `${brandName} — Promosi Masa Terhad`;
        const fbDesc = isCasual
          ? `${scarcityLabel} • Sahkan ${highlight} di WhatsApp`
          : `Penyelesaian ${subject} teratur melalui WhatsApp rasmi`;
        const fbPrimary = isCasual
          ? `${verticalCopy.painCasual}? Jangan biar masalah tu berlarutan! ${brandName} hadir dengan ${subject} (${highlight}) supaya urusan anda terus selesai. ${cleanOffer} Tekan WhatsApp sebelum ${scarcityLabel.toLowerCase()}: ${waUrl}`
          : `${verticalCopy.painPro}. Usah tangguhkan keperluan anda — ${brandName} menawarkan penyelesaian ${subject} (${highlight}) dengan ${scarcityLabel.toLowerCase()}. ${cleanOffer} Hubungi pasukan kami melalui WhatsApp rasmi untuk pengesahan hari ini: ${waUrl}`;

        return {
          facebook: {
            primaryText: fbPrimary,
            headline: fbHeadline,
            description: fbDesc,
            whatsappUrl: waUrl,
          },
          instagram: {
            caption: isCasual
              ? `Penat cari ${subject} yang kena dengan bajet? ⚡\n${brandName} selesaikan terus: ${cleanOffer}\nKlik WhatsApp sebelum penuh: ${waUrl}`
              : `Penyelesaian praktikal ${subject} daripada ${brandName} untuk tempoh terhad.\n${cleanOffer}\nHubungi WhatsApp rasmi kami: ${waUrl}`,
            hashtags: isCasual
              ? `#${hashBrand} ${hashCollab} #SolusiPantas #KuotaTerhad #BisnesMalaysia`
              : `#${hashBrand} ${hashCollab} #PromosiRasmi #SolusiTeratur #SMEMalaysia`,
            whatsappUrl: waUrl,
          },
          tiktok: {
            hook: isCasual
              ? `Penat hadap isu ${subject} yang mahal & leceh? Ini jalan pintas di ${brandName}!`
              : `Mengapa menunda keperluan ${subject} apabila penyelesaian ${brandName} sedia membantu.`,
            script: isCasual
              ? `0-2s: Masalah biasa bila cari ${subject}. 2-4s: Solusi ${brandName} (${cleanOffer}). 4-6s: Klik WhatsApp di bio sebelum slot penuh (${waUrl}).`
              : `0-2s: Cabaran rutin pelanggan. 2-4s: Pendekatan ${brandName} — ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi (${waUrl}).`,
            caption: isCasual
              ? `Solusi pantas ${subject} di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`
              : `Promosi masa terhad ${focus} di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
            whatsappUrl: waUrl,
          },
          google_rsa: {
            headlines: [
              enforceRsaLength(isCasual ? `${shortBrand14} Solusi Kini` : `${shortBrand14} Rasmi`, 30, 'Promosi Terhad Kini'),
              enforceRsaLength(isCasual ? `Atasi Isu ${details.productTopic}` : `Solusi ${details.productTopic}`, 30, 'Pilihan Utama Hari Ini'),
              enforceRsaLength(isCasual ? 'WhatsApp Sebelum Habis' : 'Sahkan Slot WhatsApp Kini', 30, 'Tempah WhatsApp Segera'),
            ],
            descriptions: [
              enforceRsaLength(`${shortBrand12}: ${cleanOffer}`, 90, 'Pilihan terhad untuk pelanggan terawal. Hubungi kami sekarang.'),
              enforceRsaLength(
                isCasual
                  ? `Selesaikan keperluan ${details.productTopic} di ${shortBrand12}. WhatsApp terus.`
                  : `Penyelesaian ${details.productTopic} teratur bersama ${shortBrand12} di WhatsApp rasmi.`,
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
          ? `${brandName} — Solusi ${subject} Paling Berbaloi`
          : `${brandName} — Piawaian Nilai & Penyelesaian`;
        const fbDesc = isCasual
          ? `Tiada caj tersembunyi • ${highlight}`
          : `Ketelusan harga dan mutu teratur di ${brandName}`;
        const fbPrimary = isCasual
          ? `Sering risau bayar mahal tapi hasil tak seberapa? Di ${brandName}, anda dapat ${subject} dengan nilai jelas (${highlight}). ${cleanOffer} Tanya pecahan penuh di WhatsApp sekarang: ${waUrl}`
          : `Elakkan kos berulang dengan memilih ${subject} yang telus bersama ${brandName} (${highlight}). ${cleanOffer} Dapatkan butiran lengkap melalui WhatsApp rasmi kami: ${waUrl}`;

        return {
          facebook: { primaryText: fbPrimary, headline: fbHeadline, description: fbDesc, whatsappUrl: waUrl },
          instagram: {
            caption: isCasual
              ? `Tak perlu risau caj tersorok bila pilih ${brandName} ✨\n${cleanOffer}\nJom semak detail di WhatsApp: ${waUrl}`
              : `Nilai telus & kualiti konsisten untuk ${subject} di ${brandName}.\n${cleanOffer}\nHubungi WhatsApp rasmi: ${waUrl}`,
            hashtags: isCasual
              ? `#${hashBrand} ${hashCollab} #HargaTelus #Berbaloi #SupportLokal`
              : `#${hashBrand} ${hashCollab} #NilaiKorporat #KualitiKonsisten #PerniagaanMalaysia`,
            whatsappUrl: waUrl,
          },
          tiktok: {
            hook: isCasual
              ? `Jangan tersalah bayar lebih! Ini cara ${brandName} jimatkan kos ${subject} anda.`
              : `Bagaimana ${brandName} memastikan setiap ringgit untuk ${subject} memberi pulangan nilai.`,
            script: isCasual
              ? `0-2s: Masalah kos tersorok. 2-4s: Pecahan ${brandName} (${cleanOffer}). 4-6s: WhatsApp kami untuk senarai harga (${waUrl}).`
              : `0-2s: Kriteria pemilihan pintar. 2-4s: Piawaian ${brandName} — ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi (${waUrl}).`,
            caption: isCasual
              ? `Penyelesaian nilai ${subject} di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`
              : `Piawaian kualiti & harga telus di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
            whatsappUrl: waUrl,
          },
          google_rsa: {
            headlines: [
              enforceRsaLength(isCasual ? `${shortBrand14} Berbaloi` : `${shortBrand14} Berkualiti`, 30, 'Kualiti & Nilai Berbaloi'),
              enforceRsaLength(isCasual ? `Jelas ${highlight}` : `Piawaian ${focus} Jelas`, 30, 'Harga Telus & Jelas'),
              enforceRsaLength(isCasual ? 'Semak Harga di WhatsApp' : 'Dapatkan Sebut Harga Rasmi', 30, 'Semak Pakej WhatsApp'),
            ],
            descriptions: [
              enforceRsaLength(`Nilai ${shortBrand12}: ${cleanOffer}`, 90, 'Kualiti konsisten dan harga telus untuk pelanggan Malaysia.'),
              enforceRsaLength(
                isCasual
                  ? `Tiada caj tersembunyi di ${shortBrand12}. Klik WhatsApp untuk senarai pilihan.`
                  : `Ketelusan harga dan mutu teratur di ${shortBrand12}. Hubungi WhatsApp rasmi.`,
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
            ? `Ramai yang dulu pening cari ${subject}, lepas cuba ${brandName} terus jadi pelanggan tetap! ${cleanOffer} Tengok sendiri kenapa ramai rekomen — WhatsApp kami sekarang: ${waUrl}`
            : `Ramai pelanggan menyelesaikan keperluan ${subject} mereka bersama ${brandName} dengan rekod kepuasan yang konsisten. ${cleanOffer} Hubungi WhatsApp rasmi untuk maklumat lanjut: ${waUrl}`,
          headline: isCasual ? `${brandName} — Pilihan Ramai Pelanggan` : `${brandName} — Dipercayai Pelanggan Tempatan`,
          description: isCasual
            ? `Maklum balas positif untuk ${subject} • WhatsApp kami`
            : `Rekod kepuasan pelanggan yang konsisten di Malaysia`,
          whatsappUrl: waUrl,
        },
        instagram: {
          caption: isCasual
            ? `Bila pelanggan dah jumpa solusi ${subject} di ${brandName}, memang repeat 💙\n${cleanOffer}\nJom WhatsApp kami: ${waUrl}`
            : `Dipercayai oleh pelanggan individu dan organisasi di ${brandName}.\n${cleanOffer}\nHubungi WhatsApp rasmi: ${waUrl}`,
          hashtags: isCasual
            ? `#${hashBrand} ${hashCollab} #PilihanRamai #RepeatOrder #BisnesMalaysia`
            : `#${hashBrand} ${hashCollab} #KepercayaanPelanggan #RekodPositif #SMEMalaysia`,
          whatsappUrl: waUrl,
        },
        tiktok: {
          hook: isCasual
            ? `Kenapa ramai pelanggan tetap balik semula ke ${brandName} untuk ${subject}?`
            : `Mengapa pelanggan terus mempercayai ${brandName} untuk keperluan ${subject}.`,
          script: isCasual
            ? `0-2s: Keluhan lama pelanggan. 2-4s: Pengalaman di ${brandName} (${cleanOffer}). 4-6s: Tekan WhatsApp sekarang (${waUrl}).`
            : `0-2s: Standard khidmat ${brandName}. 2-4s: ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi (${waUrl}).`,
          caption: isCasual
            ? `Pilihan ramai pelanggan di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`
            : `Dipercayai ramai di ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
          whatsappUrl: waUrl,
        },
        google_rsa: {
          headlines: [
            enforceRsaLength(isCasual ? `${shortBrand14} Pilihan Ramai` : `${shortBrand14} Dipercayai`, 30, 'Pilihan Ramai Pelanggan'),
            enforceRsaLength(isCasual ? `Disukai Ramai ${focus}` : `Rekod Positif ${focus}`, 30, 'Dipercayai Pelanggan MY'),
            enforceRsaLength(isCasual ? 'Tanya Pilihan Popular Kini' : 'Hubungi Wakil Rasmi Kini', 30, 'Tanya Pakej WhatsApp'),
          ],
          descriptions: [
            enforceRsaLength(`Pilihan ramai ${shortBrand12}: ${cleanOffer}`, 90, 'Dipercayai pelanggan Malaysia dengan layanan pantas dan mesra.'),
            enforceRsaLength(
              isCasual
                ? `Ramai pelanggan berpuas hati dengan ${shortBrand12}. WhatsApp kami sekarang.`
                : `Khidmat pelanggan yang konsisten di ${shortBrand12}. Hubungi WhatsApp rasmi.`,
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
              ? `Dulu kena bersusah payah dengan cara lama yang memakan masa — kini beralih ke ${verticalCopy.desireCasual} bersama ${brandName}! Jambatannya mudah: ${cleanOffer}. Rebut sementara ${scarcityLabel.toLowerCase()} di WhatsApp: ${waUrl}`
              : `Daripada proses lama yang tidak teratur kepada ${verticalCopy.desirePro} bersama ${brandName}. Manfaatkan ${highlight} untuk tempoh ${occasionLabel} ini. ${cleanOffer} Hubungi WhatsApp rasmi kami: ${waUrl}`,
            headline: `${brandName} — Naik Taraf Gaya Hidup ${subject}`,
            description: `Peralihan lebih selesa dengan ${highlight} • ${scarcityLabel}`,
            whatsappUrl: waUrl,
          },
          instagram: {
            caption: isCasual
              ? `Tinggalkan rutin lama yang leceh! Masa untuk ${verticalCopy.desireCasual} dengan ${brandName} ✨\n${cleanOffer}\nWhatsApp sekarang: ${waUrl}`
              : `Naik taraf pengalaman harian anda kepada ${verticalCopy.desirePro} di ${brandName}.\n${cleanOffer}\nHubungi WhatsApp rasmi: ${waUrl}`,
            hashtags: `#${hashBrand} ${hashCollab} #GayaHidupModen #NaikTarafRutin #Malaysia`,
            whatsappUrl: waUrl,
          },
          tiktok: {
            hook: isCasual
              ? `Cara lama vs rutin baharu dengan ${brandName} — beza rasa ketara!`
              : `Perbandingan rutin tradisional berbanding pendekatan moden bersama ${brandName}.`,
            script: isCasual
              ? `0-2s: Rutin lama yang leceh. 2-4s: Gaya hidup baharu dengan ${subject} (${cleanOffer}). 4-6s: WhatsApp ${brandName} (${waUrl}).`
              : `0-2s: Cabaran aliran kerja lama. 2-4s: Kelebihan ${brandName} (${cleanOffer}). 4-6s: Tempah melalui WhatsApp rasmi (${waUrl}).`,
            caption: `Transformasi rutin harian bersama ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
            whatsappUrl: waUrl,
          },
          google_rsa: {
            headlines: [
              enforceRsaLength(`${shortBrand14} Gaya Moden`, 30, 'Naik Taraf Gaya Hidup'),
              enforceRsaLength(`Rutin Baru ${details.productTopic}`, 30, 'Pengalaman Lebih Selesa'),
              enforceRsaLength('Tanya Jambatan Pakej Kini', 30, 'WhatsApp Info Kini'),
            ],
            descriptions: [
              enforceRsaLength(`Ubah rutin lama ke ${verticalCopy.desireCasual} bersama ${shortBrand12}.`, 90, 'Pengalaman lebih kemas dan selesa untuk rutin harian anda.'),
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
              ? `Bayangkan jimat masa & wang setiap minggu berbanding rutin lama! ${brandName} bawakan ${subject} dengan ${highlight}. ${cleanOffer} Jom mula langkah baru di WhatsApp: ${waUrl}`
              : `Peralihan daripada kos berulang yang tinggi kepada ${verticalCopy.desirePro} melalui ${brandName} (${highlight}). ${cleanOffer} Dapatkan perincian pakej di WhatsApp rasmi: ${waUrl}`,
            headline: `${brandName} — Nilai Gaya Hidup Lebih Teratur`,
            description: `Rutin harian lebih ringan dengan ${highlight}`,
            whatsappUrl: waUrl,
          },
          instagram: {
            caption: isCasual
              ? `Lebih tenang, lebih teratur dengan ${subject} daripada ${brandName} 🌿\n${cleanOffer}\nKlik WhatsApp untuk info: ${waUrl}`
              : `Rutin lebih efisien dan nilai terjaga bersama ${brandName}.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
            hashtags: `#${hashBrand} ${hashCollab} #RutinTeratur #NilaiGayaHidup #BisnesLokal`,
            whatsappUrl: waUrl,
          },
          tiktok: {
            hook: isCasual
              ? `Macam mana ${subject} di ${brandName} buat rutin harian jadi dua kali lebih senang!`
              : `Bagaimana ${brandName} membantu pelanggan beralih kepada sistem yang lebih efisien.`,
            script: isCasual
              ? `0-2s: Masa banyak habis cara lama. 2-4s: Kemudahan ${brandName} (${cleanOffer}). 4-6s: Klik WhatsApp (${waUrl}).`
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
              enforceRsaLength(`Ketahui bagaimana ${shortBrand12} mudahkan rutin anda melalui WhatsApp.`, 90, 'Hubungi wakil kami untuk penerangan pakej.'),
            ],
            negativeKeywords: ['percuma', 'susah guna', 'kualiti rendah', 'borong', 'terpakai'],
            whatsappUrl: waUrl,
          },
        };
      }

      return {
        facebook: {
          primaryText: isCasual
            ? `Ramai pelanggan kongsi betapa leganya lepas tukar ke ${brandName} untuk ${subject}! Daripada pening kepala dulu, sekarang rutin rasa lebih kemas. ${cleanOffer} Jom sembang di WhatsApp: ${waUrl}`
            : `Pelanggan kami menghargai peralihan kepada ${verticalCopy.desirePro} selepas memilih ${brandName}. ${cleanOffer} Sertai mereka melalui WhatsApp rasmi: ${waUrl}`,
          headline: `${brandName} — Pengalaman Baharu Pilihan Ramai`,
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
            ? `Dulu ragu nak tukar, lepas cuba ${brandName} terus rasa beza rutin harian!`
            : `Mengapa ramai pengguna beralih kepada ${brandName} untuk rutin lebih teratur.`,
          script: isCasual
            ? `0-2s: Keraguan sebelum mencuba. 2-4s: Suasana selesa dengan ${subject} (${cleanOffer}). 4-6s: Tanya kami di WhatsApp (${waUrl}).`
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
              ? `POV: Unboxing & cuba sendiri ${subject} daripada ${brandName} — jujur cakap, memang patut grab awal sebelum ${scarcityLabel.toLowerCase()}! ${cleanOffer} Kalau nak check stok live, terus WhatsApp sini: ${waUrl}`
              : `Ulasan terperinci pengguna: Mengapa tempahan awal ${subject} di ${brandName} (${highlight}) wajar dibuat sebelum kuota ${occasionLabel} tamat. ${cleanOffer} Hubungi WhatsApp rasmi: ${waUrl}`,
            headline: `${brandName} — Review Jujur & Unboxing ${occasionLabel}`,
            description: `Perkongsian sebenar ${subject} • ${scarcityLabel}`,
            whatsappUrl: waUrl,
          },
          instagram: {
            caption: isCasual
              ? `Review jujur tanpa filter! Baru unboxing ${subject} dari ${brandName} 📦✨\n${cleanOffer}\nCepat WhatsApp tanya stok: ${waUrl}`
              : `Perkongsian pengalaman sebenar menggunakan ${subject} daripada ${brandName}.\n${cleanOffer}\nWhatsApp rasmi untuk semakan stok: ${waUrl}`,
            hashtags: `#${hashBrand} ${hashCollab} #UnboxingMalaysia #ReviewJujur #UGCStyle`,
            whatsappUrl: waUrl,
          },
          tiktok: {
            hook: isCasual
              ? `POV: Kenapa aku menyesal tak grab ${brandName}${details.collabTag ? ` ${details.collabTag}` : ''} dari awal lagi!`
              : `Ulasan ringkas 6 saat: Apa yang membuatkan ${brandName} menonjol minggu ini.`,
            script: isCasual
              ? `0-2s: Buka kotak / close-up ${subject}. 2-4s: Tunjuk detail sebenar (${cleanOffer}). 4-6s: Tekan link WhatsApp sebelum habis (${waUrl}).`
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
              ? `Ramai tanya berbaloi ke beli ${subject} di ${brandName}? Lepas tengok kualiti fizikal & dapat ${highlight}, memang puas hati! ${cleanOffer} Nak tengok gambar sebenar? WhatsApp terus: ${waUrl}`
              : `Penilaian pengguna terhadap nilai sebenar ${subject} di ${brandName}: kemasan teliti sepadan dengan ${highlight}. ${cleanOffer} Dapatkan info lanjut di WhatsApp rasmi: ${waUrl}`,
            headline: `${brandName} — Ulasan Nilai Sebenar Pengguna`,
            description: `Foto sebenar & pecahan ${highlight} • Tanya di WhatsApp`,
            whatsappUrl: waUrl,
          },
          instagram: {
            caption: isCasual
              ? `Real talk: Berbaloi ke ${subject} dari ${brandName}? Jawapannya ya, tengok saja kemasan & ${highlight} ni 👀\n${cleanOffer}\nWhatsApp sini: ${waUrl}`
              : `Penilaian jujur terhadap mutu dan nilai ${subject} di ${brandName}.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
            hashtags: `#${hashBrand} ${hashCollab} #ReviewBerbaloi #RealTalkMY #SupportLokal`,
            whatsappUrl: waUrl,
          },
          tiktok: {
            hook: isCasual
              ? `Jujur cakap, ini benda yang orang tak bagitahu pasal ${subject} di ${brandName}...`
              : `3 perkara yang kami perhatikan selepas menguji ${subject} daripada ${brandName}.`,
            script: isCasual
              ? `0-2s: Tunjuk tekstur/kemasan sebenar. 2-4s: Beritahu nilai ${highlight} (${cleanOffer}). 4-6s: WhatsApp untuk info penuh (${waUrl}).`
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
            ? `Bukan cakap kosong — tengok sendiri kenapa feed ramai penuh dengan unboxing ${brandName}${details.collabTag ? ` ${details.collabTag}` : ''}! ${cleanOffer} Nak join gelombang pengguna puas hati? WhatsApp kami: ${waUrl}`
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
              ? `Kiraan pembeli bijak untuk ${occasionLabel}: Dengan ${brandName}, anda dapat ${subject} pada ${mathBreakdown}! Bandingkan sendiri kos jangka panjang sebelum promosi tamat. ${cleanOffer} Kunci harga ini di WhatsApp: ${waUrl}`
              : `Analisis nilai segera ${brandName}: Perolehan ${subject} dengan ${mathBreakdown} bagi tempoh ${occasionLabel}. ${cleanOffer} Sahkan kadar istimewa ini melalui WhatsApp rasmi: ${waUrl}`,
            headline: `${brandName} — Kiraan Berbaloi (${mathBreakdown})`,
            description: `Bandingkan nilai sebenar sebelum tamat • WhatsApp sekarang`,
            whatsappUrl: waUrl,
          },
          instagram: {
            caption: isCasual
              ? `Pembeli bijak buat kiraan dulu! 🧮✨\n${subject} di ${brandName}: ${mathBreakdown}\n${cleanOffer}\nKunci harga anda di WhatsApp: ${waUrl}`
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
              enforceRsaLength(details.discountPercent ? `Jimat ${details.discountPercent} ${details.priceTag ?? ''}`.trim() : `Nilai ${details.priceTag ?? focus}`, 30, 'Penjimatan Jelas Kini'),
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
              ? `Kenapa bayar berulang kali kalau sekali ambil di ${brandName} anda terus dapat ${mathBreakdown}? Setiap sen dikira untuk kualiti ${subject}. ${cleanOffer} Minta jadual harga penuh di WhatsApp: ${waUrl}`
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
              enforceRsaLength(`Pecahan ${details.priceTag ?? focus}`, 30, 'Harga Telus Setiap Sen'),
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
            ? `Ramai pembeli bijak pilih ${brandName} lepas buat perbandingan sendiri — sebab ${mathBreakdown} memang sukar ditandingi untuk ${subject}! ${cleanOffer} Semak pilihan paling laku di WhatsApp: ${waUrl}`
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
            : `Mengapa pembeli korporat dan pengguna bijak memilih pakej ${brandName}.`,
          script: isCasual
            ? `0-2s: Reaksi pembeli lepas banding harga. 2-4s: ${mathBreakdown} (${cleanOffer}). 4-6s: Tanya di WhatsApp (${waUrl}).`
            : `0-2s: Kriteria pembeli teliti. 2-4s: ${cleanOffer}. 4-6s: Hubungi WhatsApp rasmi (${waUrl}).`,
          caption: `Pilihan pembeli bijak ${brandName} • ${cleanOffer} • WhatsApp: ${waUrl}`,
          whatsappUrl: waUrl,
        },
        google_rsa: {
          headlines: [
            enforceRsaLength(`Bijak Pilih ${shortBrand14}`, 30, 'Pilihan Pembeli Bijak'),
            enforceRsaLength(`Rekod Nilai ${details.priceTag ?? focus}`, 30, 'Berbaloi & Dipercayai'),
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
    const dropTag = details.collabTag ? `${occasionLabel} ${details.collabTag}` : occasionLabel;
    if (angle === 'urgency') {
      return {
        facebook: {
          primaryText: isCasual
            ? `DROP ${dropTag.toUpperCase()} KINI DIBUKA! 🚨 ${brandName} lepaskan kuota awal untuk ${subject} (${highlight}) — ${scarcityLabel.toLowerCase()} untuk batch kali ini! ${cleanOffer} Terus masuk line di WhatsApp sekarang: ${waUrl}`
            : `PELANCARAN ${dropTag.toUpperCase()} ${brandName}: Peruntukan awal ${subject} (${highlight}) dibuka dengan ${scarcityLabel.toLowerCase()}. ${cleanOffer} Sahkan giliran anda melalui WhatsApp rasmi: ${waUrl}`,
          headline: `${brandName} — Drop ${dropTag} (${scarcityLabel})`,
          description: `Akses awal ${highlight} • Rebut sebelum batch ditutup`,
          whatsappUrl: waUrl,
        },
        instagram: {
          caption: isCasual
            ? `🚨 ${dropTag} DROP di ${brandName}! Stok batch awal bergerak laju 🔥\n${cleanOffer}\nLocked slot anda di WhatsApp: ${waUrl}`
            : `Edisi ${dropTag} daripada ${brandName} kini dibuka untuk tempahan awal.\n${cleanOffer}\nWhatsApp rasmi: ${waUrl}`,
          hashtags: `#${hashBrand} ${hashCollab} #EdisiKhas #DropTerhad #MingguGaji`,
          whatsappUrl: waUrl,
        },
        tiktok: {
          hook: isCasual
            ? `AMARAN ${dropTag.toUpperCase()}! Batch awal ${brandName} ni memang tak tunggu orang lambat!`
            : `Pengumuman pelancaran ${dropTag}: Peruntukan awal ${brandName} kini dibuka.`,
            script: isCasual
            ? `0-2s: Visual hype ${dropTag} ${brandName}. 2-4s: ${cleanOffer}. 4-6s: Laju tekan WhatsApp sebelum sold out (${waUrl}).`
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
            ? `Pelanggan terawal ${dropTag} di ${brandName} paling untung sebab dapat ${highlight} sekali gus! ${cleanOffer} Jangan tunggu batch biasa harga penuh — WhatsApp sekarang: ${waUrl}`
            : `Kelebihan tempahan awal ${dropTag} di ${brandName}: Akses kepada ${highlight} dengan peruntukan terhad. ${cleanOffer} Hubungi WhatsApp rasmi: ${waUrl}`,
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
          ? `Setiap kali ${brandName} buka drop ${dropTag}, pelanggan tetap memang paling laju masuk mesej! ${cleanOffer} Jangan tengok saja orang lain grab — WhatsApp sekarang: ${waUrl}`
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
  variationIndex = 1
): Record<AngleId, ChannelCopy> {
  return {
    urgency: generateCampaignCopyForAngle(brand, offerSentence, 'urgency', variationIndex),
    value: generateCampaignCopyForAngle(brand, offerSentence, 'value', variationIndex),
    social_proof: generateCampaignCopyForAngle(brand, offerSentence, 'social_proof', variationIndex),
  };
}

export function buildCarouselSlides(
  brand: BrandProfile,
  offerSentence: string,
  variationIndex = 1,
  productVisionSummary?: string | null
): CarouselSlide[] {
  const brandName = brand.name.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(offerSentence);
  const details = extractOfferDetails(brandName, cleanOffer);
  const framework = getFrameworkForVariation(variationIndex);
  const subject = formatOfferSubject(details);
  const highlight = formatOfferHighlight(details);
  const isCasual = brand.tone === 'casual';
  const shortOffer = cleanOffer.length > 62 ? `${sliceSafeUtf16(cleanOffer, 59).trimEnd()}...` : cleanOffer;
  const visionNote = productVisionSummary?.trim()
    ? sliceSafeUtf16(productVisionSummary.trim(), 70)
    : null;

  const s = (text: string) => ensureSafeField(text, brandName);

  switch (framework) {
    case 'pas':
      return [
        {
          id: 'slide-1',
          index: 0,
          role: 'hook',
          photoIndex: 0,
          badgeText: s(brandName),
          headline: s(isCasual ? `Penat Cari ${subject}?` : `Solusi ${subject} — ${brandName}`),
          subheadline: s(visionNote ?? `${brandName} mudahkan urusan anda dengan harga telus.`),
          ctaText: 'Slide 1 / 4',
          editedByUser: false,
        },
        {
          id: 'slide-2',
          index: 1,
          role: 'offer',
          photoIndex: 1,
          badgeText: s(details.discountPercent ? `JIMAT ${details.discountPercent}` : 'SOLUSI UTAMA'),
          headline: s(shortOffer),
          subheadline: s(`Eksklusif di ${brandName} (${highlight})`),
          ctaText: s(details.scarcityCue ?? 'Kuota Terawal'),
          editedByUser: false,
        },
        {
          id: 'slide-3',
          index: 2,
          role: 'proof',
          photoIndex: 0,
          badgeText: 'KEPERCAYAAN',
          headline: s(isCasual ? `Pilihan Ramai Untuk ${details.productTopic}` : 'Rekod Kepuasan Pelanggan'),
          subheadline: s(isCasual ? 'Layanan mesra, respons pantas & jelas.' : 'Piawaian konsisten & telus.'),
          ctaText: 'Dipercayai Ramai',
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
          headline: s(`Tinggalkan Rutin Lama Yang Leceh`),
          subheadline: s(visionNote ?? `Naik taraf pengalaman harian bersama ${subject}.`),
          ctaText: 'Slide 1 / 4',
          editedByUser: false,
        },
        {
          id: 'slide-2',
          index: 1,
          role: 'offer',
          photoIndex: 1,
          badgeText: 'JAMBATAN SOLUSI',
          headline: s(`Rutin Lebih Kemas: ${highlight}`),
          subheadline: s(shortOffer),
          ctaText: s(details.occasion ?? 'Mula Hari Ini'),
          editedByUser: false,
        },
        {
          id: 'slide-3',
          index: 2,
          role: 'proof',
          photoIndex: 0,
          badgeText: 'PENGALAMAN NYATA',
          headline: s(`Lebih Selesa & Menjimatkan Masa`),
          subheadline: s(`Pelanggan ${brandName} nikmati rutin lebih teratur setiap hari.`),
          ctaText: 'Gaya Hidup Teratur',
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
          subheadline: s(visionNote ?? `Kenapa ramai cakap pasal ${details.collabTag ?? brandName}?`),
          ctaText: 'Slide 1 / 4',
          editedByUser: false,
        },
        {
          id: 'slide-2',
          index: 1,
          role: 'offer',
          photoIndex: 1,
          badgeText: 'APA YANG DAPAT',
          headline: s(details.bundleOrFreebie ? `${details.bundleOrFreebie} (${highlight})` : shortOffer),
          subheadline: s(`Foto sebenar produk & servis di ${brandName}`),
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
          subheadline: s(`Kemasan kemas, layanan pantas, dan ${highlight}.`),
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
          subheadline: s(visionNote ?? `Bandingkan setiap sen sebelum buat keputusan.`),
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
          subheadline: s(shortOffer),
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
          subheadline: s(`Kualiti konsisten ${brandName} dengan harga telus.`),
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
          subheadline: `WhatsApp rasmi: +${brand.whatsappNumber}`,
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
          headline: s(`${brandName} ${details.collabTag ?? ''}: Batch Awal Dibuka!`.trim()),
          subheadline: s(visionNote ?? `${details.scarcityCue ?? 'Kuota terhad'} untuk pelanggan pantas.`),
          ctaText: 'Slide 1 / 4',
          editedByUser: false,
        },
        {
          id: 'slide-2',
          index: 1,
          role: 'offer',
          photoIndex: 1,
          badgeText: s(details.scarcityCue ?? 'TERHAD'),
          headline: s(shortOffer),
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
          subheadline: s(`Jangan tunggu stok batch ${details.occasion ?? 'ini'} ditutup.`),
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
          subheadline: `WhatsApp rasmi: +${brand.whatsappNumber}`,
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
  productVisionSummary?: string | null
): StoryboardFrame[] {
  const brandName = brand.name.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(offerSentence);
  const details = extractOfferDetails(brandName, cleanOffer);
  const framework = getFrameworkForVariation(variationIndex);
  const subject = formatOfferSubject(details);
  const highlight = formatOfferHighlight(details);
  const lines = lyrics
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const shortOffer = cleanOffer.length > 48 ? `${sliceSafeUtf16(cleanOffer, 45).trimEnd()}...` : cleanOffer;
  const s = (text: string) => ensureSafeField(text, brandName);

  const visionBit = productVisionSummary?.trim()
    ? sliceSafeUtf16(productVisionSummary.trim(), 44)
    : null;

  let headlines: [string, string, string, string];
  switch (framework) {
    case 'pas':
      headlines = [
        `${brandName}: Solusi ${subject}`,
        visionBit ?? `Mudah & Kemas Untuk Rutin Anda`,
        shortOffer,
        `WhatsApp +${brand.whatsappNumber}`,
      ];
      break;
    case 'bab':
      headlines = [
        `${brandName}: Rutin Baru Lebih Selesa`,
        visionBit ?? `Tinggalkan Cara Lama Yang Leceh`,
        `${highlight} — ${details.occasion ?? 'Hari Ini'}`,
        `WhatsApp +${brand.whatsappNumber}`,
      ];
      break;
    case 'pov_ugc':
      headlines = [
        `POV Unboxing ${brandName}`,
        visionBit ?? `Review Jujur ${subject}`,
        details.bundleOrFreebie ?? highlight,
        `WhatsApp +${brand.whatsappNumber}`,
      ];
      break;
    case 'smart_buyer':
      headlines = [
        `Kiraan Bijak ${brandName}`,
        `Banding Nilai: ${highlight}`,
        shortOffer,
        `WhatsApp +${brand.whatsappNumber}`,
      ];
      break;
    case 'fomo_drop':
      headlines = [
        `Drop ${details.occasion ?? 'Khas'} ${brandName}`,
        details.scarcityCue ?? `Kuota Terawal Bergerak Laju`,
        `${highlight} — ${shortOffer}`,
        `WhatsApp +${brand.whatsappNumber}`,
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
      lyricLine: lines[0] ?? `Pilihan tepat bersama ${brandName},`,
    },
    {
      id: 'frame-2',
      index: 1,
      startSec: 1.35,
      endSec: 2.75,
      photoIndex: 1,
      overlayHeadline: s(headlines[1]),
      lyricLine: lines[1] ?? `Nilai jelas untuk ${subject},`,
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
    checkCopyCompliance(fallback).length === 0 ? fallback : 'Pilihan Utama';
  const sanitized = sanitizeChannelText(candidate, safeFallback, brandName);
  const bounded = enforceRsaLength(sanitized, maxLen, safeFallback);
  if (checkCopyCompliance(bounded).length > 0) {
    return enforceRsaLength(safeFallback, maxLen, 'Pilihan Utama');
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
    rawHeadlines.push(baseline.google_rsa.headlines[rawHeadlines.length] ?? 'Pilihan Utama');
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

function stripJsonCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
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
      return 'Variasi #1 — Masalah -> Penyelesaian (PAS): Mulakan dengan kesukaran harian sebenar pembeli tanpa melanggar polisi Meta, tunjukkan impaknya, lalu tawarkan produk/servis ini sebagai penyelesaian praktikal.';
    case 'bab':
      return 'Variasi #2 — Transformasi & Gaya Hidup (Before-After-Bridge): Bandingkan rutin lama yang rumit dengan gaya hidup baharu yang lebih selesa. DILARANG menulis frasa literal "sebelum dan selepas" atau "before and after".';
    case 'pov_ugc':
      return 'Variasi #3 — POV / Review Jujur & Unboxing (Gaya UGC): Gunakan suara orang pertama Malaysia yang autentik, bercerita tentang ciri fizikal produk yang dilihat dalam foto serta pengalaman penggunaan sebenar.';
    case 'smart_buyer':
      return 'Variasi #4 — Kiraan Berbaloi & Perbandingan Nilai (Smart Buyer): Pecahkan nilai sebenar berdasarkan peratus diskaun, harga RM, bundle/percuma, atau penjimatan kos per penggunaan.';
    case 'fomo_drop':
      return 'Variasi #5 — Edisi Khas / FOMO Pelanggan Terawal: Tonjolkan tenaga pelancaran terhad, minggu gaji/edisi khas, kolaborasi, dan kepentingan mengesahkan kuota awal.';
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
  }>;
  jingleLyrics: string;
  storyboardFrames: Array<{
    overlayHeadline: string;
    lyricLine: string;
  }>;
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
  }>;
  jingleLyrics?: unknown;
  storyboardFrames?: Array<{
    overlayHeadline?: unknown;
    lyricLine?: unknown;
  }>;
}

export async function generateMultimodalCampaignWithGemini(params: {
  apiKey: string;
  isDemoMode: boolean;
  brand: BrandProfile;
  offerSentence: string;
  photos: [PhotoAsset, PhotoAsset];
  variationIndex: number;
  signal?: AbortSignal;
}): Promise<MultimodalCampaignResult> {
  const brandName = params.brand.name.trim() || 'Bisnes Saya';
  const cleanOffer = cleanOfferText(params.offerSentence);
  const variationIndex = Math.max(1, Math.floor(params.variationIndex || 1));
  const framework = getFrameworkForVariation(variationIndex);
  const details = extractOfferDetails(brandName, cleanOffer);

  const baselinePsych = buildCustomerPsychology(params.brand, cleanOffer, variationIndex);
  const baselineCopyMap = generateCampaignCopyMap(params.brand, cleanOffer, variationIndex);
  const baselineSlides = buildCarouselSlides(params.brand, cleanOffer, variationIndex);
  const baselineLyrics = buildJingleLyrics(brandName, cleanOffer, variationIndex);
  const baselineFrames = buildStoryboardFrames(
    params.brand,
    cleanOffer,
    baselineLyrics,
    variationIndex
  );

  const buildOfflineResult = (source: CampaignGenerationSource): MultimodalCampaignResult => ({
    source,
    visualSummary: null,
    psychology: baselinePsych,
    copyByAngle: baselineCopyMap,
    carouselSlides: baselineSlides.map((slide) => ({
      badgeText: slide.badgeText,
      headline: slide.headline,
      subheadline: slide.subheadline,
      ctaText: slide.ctaText,
    })),
    jingleLyrics: baselineLyrics,
    storyboardFrames: baselineFrames.map((frame) => ({
      overlayHeadline: frame.overlayHeadline,
      lyricLine: frame.lyricLine,
    })),
  });

  if (params.isDemoMode) {
    return buildOfflineResult('offline-smart-demo');
  }

  if (!isValidGeminiKeyFormat(params.apiKey)) {
    return buildOfflineResult('offline-smart-fallback');
  }

  if (params.signal?.aborted) {
    return buildOfflineResult('offline-smart-fallback');
  }

  // Convert both uploaded/sample photos into inlineData parts
  const resolvedParts = await Promise.all([
    resolvePhotoInlineDataPart(params.photos[0], params.signal),
    resolvePhotoInlineDataPart(params.photos[1], params.signal),
  ]);
  const photoParts = resolvedParts.filter((part): part is GeminiInlineDataPart => part !== null);

  if (params.signal?.aborted) {
    return buildOfflineResult('offline-smart-fallback');
  }

  const prompt = [
    'Anda ialah Pakar Strategi Kreatif & Penulis Iklan Berprestasi Tinggi Malaysia (Bahasa Melayu natural, bukan templat klise).',
    'Teliti kedua-dua gambar produk yang dilampirkan (jika ada) untuk mengenal pasti kategori produk, ciri visual, warna/kolaborasi, dan nilai jualan unik (USP).',
    `Jenama: ${brandName}. Nada: ${params.brand.tone}. Nombor WhatsApp: +${params.brand.whatsappNumber}.`,
    `Tawaran Pengguna: ${cleanOffer}`,
    `Butiran Dikesan: topik="${details.productTopic}", kolaborasi="${details.collabTag ?? '-'}", diskaun="${details.discountPercent ?? '-'}", harga="${details.priceTag ?? '-'}", pakej/percuma="${details.bundleOrFreebie ?? '-'}", acara="${details.occasion ?? '-'}".`,
    `Rangka Kerja Wajib (Variasi #${variationIndex}): ${getFrameworkPromptDirective(framework)}`,
    'Pulangkan SATU objek JSON sahaja dengan struktur tepat:',
    '{',
    '  "visualSummary": "Ringkasan 1 ayat produk & ciri visual daripada foto",',
    '  "psychology": { "targetPersona": "...", "coreTrigger": "...", "frictionObjections": "...", "trustAnchors": "..." },',
    '  "angles": {',
    '    "urgency": { "facebook": {"primaryText","headline","description"}, "instagram": {"caption","hashtags"}, "tiktok": {"hook","script","caption"}, "google_rsa": {"headlines":[3],"descriptions":[2],"negativeKeywords":[5]} },',
    '    "value": { ... },',
    '    "social_proof": { ... }',
    '  },',
    '  "carouselSlides": [4 objek {"badgeText","headline","subheadline","ctaText"}],',
    '  "jingleLyrics": "Korus 4 baris Bahasa Melayu yang menyebut nama jenama",',
    '  "storyboardFrames": [4 objek {"overlayHeadline","lyricLine"}]',
    '}',
    'Peraturan ketat:',
    '- DILARANG mengulang perkataan "Tawaran Tawaran".',
    '- DILARANG melanggar Meta Personal Attributes atau Polisi Iklan MY: elakkan "anda kusam", "anda bermasalah", "100%", "dijamin", "terbaik", "No. 1", "#1", "sebelum dan selepas", "before and after".',
    '- google_rsa.headlines setiap satu <= 30 aksara; google_rsa.descriptions setiap satu <= 90 aksara.',
  ].join('\n');

  const requestParts: Array<{ text: string } | GeminiInlineDataPart> = [
    { text: prompt },
    ...photoParts,
  ];

  const modelsToTry: readonly GeminiModelId[] = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  for (const model of modelsToTry) {
    if (params.signal?.aborted) {
      return buildOfflineResult('offline-smart-fallback');
    }

    const { controller, cleanup } = linkAbortSignals(params.signal, 15_000);
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
        continue;
      }

      const json = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        continue;
      }

      const parsed = JSON.parse(stripJsonCodeFence(rawText)) as RawGeminiMultimodalPayload;
      if (!parsed || typeof parsed !== 'object') {
        continue;
      }

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
        return {
          badgeText: sanitizeChannelText(candidate?.badgeText, baseSlide.badgeText, brandName),
          headline: sanitizeChannelText(candidate?.headline, baseSlide.headline, brandName),
          subheadline: sanitizeChannelText(
            candidate?.subheadline,
            baseSlide.subheadline,
            brandName
          ),
          ctaText: sanitizeChannelText(candidate?.ctaText, baseSlide.ctaText, brandName),
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
        if (idx === 3 && !overlayHeadline.includes(`+${params.brand.whatsappNumber}`)) {
          overlayHeadline = `WhatsApp +${params.brand.whatsappNumber}`;
        }
        const lyricLine = sanitizeChannelText(
          candidate?.lyricLine,
          baseFrame.lyricLine,
          brandName
        );
        return { overlayHeadline, lyricLine };
      });

      return {
        source: model,
        visualSummary,
        psychology,
        copyByAngle,
        carouselSlides,
        jingleLyrics,
        storyboardFrames,
      };
    } catch {
      if (params.signal?.aborted) {
        return buildOfflineResult('offline-smart-fallback');
      }
      // Try next model in fallback chain
    } finally {
      cleanup();
    }
  }

  return buildOfflineResult('offline-smart-fallback');
}

export async function enhanceCopyWithGemini(params: {
  apiKey: string;
  isDemoMode: boolean;
  brand: BrandProfile;
  offerSentence: string;
  angle: AngleId;
  variationIndex?: number;
  photos?: [PhotoAsset, PhotoAsset];
}): Promise<{ copy: ChannelCopy; source: 'gemini' | 'baseline' }> {
  const variationIndex = params.variationIndex ?? 1;
  const baseline = generateCampaignCopyForAngle(
    params.brand,
    params.offerSentence,
    params.angle,
    variationIndex
  );

  if (params.isDemoMode || !isValidGeminiKeyFormat(params.apiKey)) {
    return { copy: baseline, source: 'baseline' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const framework = getFrameworkForVariation(variationIndex);
    const prompt = [
      `Anda ialah penulis iklan pemasaran digital SME Malaysia yang mematuhi polisi Meta Personal Attributes & etika pengiklanan Malaysia.`,
      `Jenama: ${params.brand.name}. Nada: ${params.brand.tone}. Sudut: ${params.angle}.`,
      `Rangka Kerja: ${getFrameworkPromptDirective(framework)}`,
      `Tawaran: ${cleanOfferText(params.offerSentence)}.`,
      `Pulangkan JSON sahaja mengikut struktur ChannelCopy (facebook, instagram, tiktok, google_rsa).`,
      `Had wajib: google_rsa.headlines setiap satu <= 30 aksara; google_rsa.descriptions setiap satu <= 90 aksara.`,
      `Dilarang menggunakan: dakwaan ciri peribadi (seperti kulit anda kusam/anda bermasalah), 100%, dijamin, terbaik, No. 1, sebelum dan selepas, atau perkataan berulang "Tawaran Tawaran".`,
    ].join('\n');

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

    const parsed = JSON.parse(stripJsonCodeFence(rawText)) as Partial<ChannelCopy>;
    const enhanced = sanitizeSingleAngleCopy(parsed, baseline, params.brand.name);
    return { copy: enhanced, source: 'gemini' };
  } catch {
    return { copy: baseline, source: 'baseline' };
  } finally {
    clearTimeout(timeoutId);
  }
}
