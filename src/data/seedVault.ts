import type { BrandProfile, CpaInputs, PhotoAsset } from '../types/campaign';

export const SEEDED_BRAND_ID = 'demo-bisnes-saya';

export const SAMPLE_OFFER_CHIP =
  'Promosi Minggu Gaji: Diskaun 20% untuk pelanggan terawal, stok & slot terhad — WhatsApp sekarang.';

export interface SmeOfferPreset {
  id: 'fnb' | 'retail' | 'services';
  labelMs: string;
  labelEn: string;
  offer: string;
  uspHint: string;
}

export const SME_OFFER_PRESETS: readonly SmeOfferPreset[] = [
  {
    id: 'fnb',
    labelMs: 'F&B / Kafe',
    labelEn: 'F&B / Cafe',
    offer:
      'Kombo Kopi & Kek Istimewa RM19.90 untuk 2 orang — tempah awal atau WhatsApp untuk delivery hari ini.',
    uspHint:
      'Kopi biji panggang segar + kek bakar harian, siap bungkus rapi untuk pekerja pejabat & pasangan santai',
  },
  {
    id: 'retail',
    labelMs: 'Runcit & Fesyen',
    labelEn: 'Retail & Fashion',
    offer:
      'Koleksi Edisi Baharu: Beli 2 Percuma 1 penghantaran Semenanjung — stok saiz terhad, WhatsApp sekarang.',
    uspHint:
      'Kain sejuk tak mudah berkedut, potongan kemas saiz S–XXL untuk kegunaan harian & majlis',
  },
  {
    id: 'services',
    labelMs: 'Servis & Bengkel',
    labelEn: 'Services & Workshop',
    offer:
      'Pakej Servis Penuh & Pemeriksaan Awal sempena minggu gaji — slot harian terhad, WhatsApp terus.',
    uspHint:
      'Semakan teliti siap 45 minit dengan pecahan harga jelas sebelum mula — untuk pemilik kereta harian',
  },
];

export const FALLBACK_AUDIO_URL = '/assets/audio/fallback-jingle.wav';
export const BYOK_GUIDE_VIDEO_URL = '/assets/guide/byok-guide.webm';

export const SEEDED_DEMO_BRAND: BrandProfile = {
  id: SEEDED_BRAND_ID,
  name: 'Demo Bisnes Saya',
  logoDataUrl: '/assets/brands/demo-brand-logo.png',
  themeColor: '#0EA5E9',
  tone: 'casual',
  whatsappNumber: '60123456789',
  isSeeded: true,
  updatedAt: '2026-11-17T00:00:00.000Z',
};

export const SAMPLE_BUSINESS_PHOTOS: PhotoAsset[] = [
  {
    id: 'sample-business-showcase-1',
    label: 'Paparan Produk & Servis Utama',
    src: '/assets/photos/business-showcase-1.png',
    isSample: true,
  },
  {
    id: 'sample-business-product-2',
    label: 'Kualiti & Pakej Pilihan',
    src: '/assets/photos/business-product-2.png',
    isSample: true,
  },
  {
    id: 'sample-business-service-3',
    label: 'Suasana Kedai & Servis Mesra',
    src: '/assets/photos/business-service-3.png',
    isSample: true,
  },
];

export const DEFAULT_CPA_INPUTS: CpaInputs = {
  servicePriceRm: 180,
  marginPercent: 60,
  closeRatePercent: 30,
  estimatedCplRm: 18,
};

export const THEME_COLOR_PRESETS: string[] = [
  '#0EA5E9',
  '#10B981',
  '#8B5CF6',
  '#F59E0B',
  '#EC4899',
  '#EF4444',
];

export function cloneBrand(brand: BrandProfile): BrandProfile {
  return {
    id: brand.id,
    name: brand.name,
    logoDataUrl: brand.logoDataUrl,
    themeColor: brand.themeColor,
    tone: brand.tone,
    whatsappNumber: brand.whatsappNumber,
    isSeeded: brand.isSeeded,
    updatedAt: brand.updatedAt,
  };
}

export function createSeededBrands(): BrandProfile[] {
  return [cloneBrand(SEEDED_DEMO_BRAND)];
}
