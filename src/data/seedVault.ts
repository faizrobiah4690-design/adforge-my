import type { BrandProfile, CpaInputs, PhotoAsset } from '../types/campaign';

export const SEEDED_BRAND_ID = 'klinik-gigi-impian';

export const SAMPLE_OFFER_CHIP =
  'Promosi Scaling & Polish sempena minggu gaji, slot terhad, WhatsApp sekarang.';

export const FALLBACK_AUDIO_URL = '/assets/audio/fallback-jingle.wav';
export const BYOK_GUIDE_VIDEO_URL = '/assets/guide/byok-guide.webm';

export const SEEDED_KLINIK_GIGI_IMPIAN: BrandProfile = {
  id: SEEDED_BRAND_ID,
  name: 'Klinik Gigi Impian',
  logoDataUrl: '/assets/brands/klinik-gigi-impian-logo.png',
  themeColor: '#0EA5E9',
  tone: 'casual',
  whatsappNumber: '60123456789',
  isSeeded: true,
  updatedAt: '2026-11-17T00:00:00.000Z',
};

export const SAMPLE_CLINIC_PHOTOS: PhotoAsset[] = [
  {
    id: 'sample-clinic-scaling-1',
    label: 'Rawatan Scaling & Polish',
    src: '/assets/photos/clinic-scaling-1.png',
    isSample: true,
  },
  {
    id: 'sample-clinic-smile-2',
    label: 'Senyuman Bersih & Sihat',
    src: '/assets/photos/clinic-smile-2.png',
    isSample: true,
  },
  {
    id: 'sample-clinic-chair-3',
    label: 'Ruang Klinik Moden',
    src: '/assets/photos/clinic-chair-3.png',
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
  return [cloneBrand(SEEDED_KLINIK_GIGI_IMPIAN)];
}
