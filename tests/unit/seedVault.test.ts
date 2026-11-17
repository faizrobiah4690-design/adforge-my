import { describe, expect, it } from 'vitest';
import {
  BYOK_GUIDE_VIDEO_URL,
  FALLBACK_AUDIO_URL,
  SAMPLE_CLINIC_PHOTOS,
  SAMPLE_OFFER_CHIP,
  SEEDED_BRAND_ID,
  SEEDED_KLINIK_GIGI_IMPIAN,
  cloneBrand,
  createSeededBrands,
} from '../../src/data/seedVault';

describe('seedVault', () => {
  it('exposes pre-seeded Klinik Gigi Impian with same-origin assets', () => {
    expect(SEEDED_BRAND_ID).toBe('klinik-gigi-impian');
    expect(SEEDED_KLINIK_GIGI_IMPIAN).toMatchObject({
      id: 'klinik-gigi-impian',
      name: 'Klinik Gigi Impian',
      logoDataUrl: '/assets/brands/klinik-gigi-impian-logo.png',
      themeColor: '#0EA5E9',
      tone: 'casual',
      whatsappNumber: '60123456789',
      isSeeded: true,
    });
  });

  it('provides 3 text-free same-origin clinic sample photos and media URLs', () => {
    expect(SAMPLE_CLINIC_PHOTOS).toHaveLength(3);
    for (const photo of SAMPLE_CLINIC_PHOTOS) {
      expect(photo.src.startsWith('/assets/photos/')).toBe(true);
      expect(photo.isSample).toBe(true);
    }
    expect(FALLBACK_AUDIO_URL).toBe('/assets/audio/fallback-jingle.wav');
    expect(BYOK_GUIDE_VIDEO_URL).toBe('/assets/guide/byok-guide.webm');
    expect(SAMPLE_OFFER_CHIP).toBe(
      'Promosi Scaling & Polish sempena minggu gaji, slot terhad, WhatsApp sekarang.'
    );
  });

  it('returns independent clones from cloneBrand and createSeededBrands', () => {
    const brands = createSeededBrands();
    expect(brands).toHaveLength(1);
    brands[0].name = 'Mutated Clinic';
    brands[0].themeColor = '#000000';

    const cloned = cloneBrand(SEEDED_KLINIK_GIGI_IMPIAN);
    expect(cloned.name).toBe('Klinik Gigi Impian');
    expect(cloned.themeColor).toBe('#0EA5E9');
  });
});
