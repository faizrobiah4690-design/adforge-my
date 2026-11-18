import { describe, expect, it } from 'vitest';
import {
  BYOK_GUIDE_VIDEO_URL,
  FALLBACK_AUDIO_URL,
  SAMPLE_BUSINESS_PHOTOS,
  SAMPLE_OFFER_CHIP,
  SEEDED_BRAND_ID,
  SEEDED_DEMO_BRAND,
  SME_OFFER_PRESETS,
  cloneBrand,
  createSeededBrands,
} from '../../src/data/seedVault';

describe('seedVault', () => {
  it('exposes pre-seeded Demo Bisnes Saya with same-origin assets', () => {
    expect(SEEDED_BRAND_ID).toBe('demo-bisnes-saya');
    expect(SEEDED_DEMO_BRAND).toMatchObject({
      id: 'demo-bisnes-saya',
      name: 'Demo Bisnes Saya',
      logoDataUrl: '/assets/brands/demo-brand-logo.png',
      themeColor: '#0EA5E9',
      tone: 'casual',
      whatsappNumber: '60123456789',
      isSeeded: true,
    });
  });

  it('provides 3 text-free same-origin business sample photos, SME presets, and media URLs', () => {
    expect(SAMPLE_BUSINESS_PHOTOS).toHaveLength(3);
    for (const photo of SAMPLE_BUSINESS_PHOTOS) {
      expect(photo.src.startsWith('/assets/photos/')).toBe(true);
      expect(photo.isSample).toBe(true);
    }
    expect(SME_OFFER_PRESETS).toHaveLength(3);
    expect(SME_OFFER_PRESETS.map((p) => p.id)).toEqual(['fnb', 'retail', 'services']);
    expect(FALLBACK_AUDIO_URL).toBe('/assets/audio/fallback-jingle.wav');
    expect(BYOK_GUIDE_VIDEO_URL).toBe('/assets/guide/byok-guide.webm');
    expect(SAMPLE_OFFER_CHIP).toBe(
      'Promosi Minggu Gaji: Diskaun 20% untuk pelanggan terawal, stok & slot terhad — WhatsApp sekarang.'
    );
  });

  it('returns independent clones from cloneBrand and createSeededBrands', () => {
    const brands = createSeededBrands();
    expect(brands).toHaveLength(1);
    brands[0].name = 'Mutated Brand';
    brands[0].themeColor = '#000000';

    const cloned = cloneBrand(SEEDED_DEMO_BRAND);
    expect(cloned.name).toBe('Demo Bisnes Saya');
    expect(cloned.themeColor).toBe('#0EA5E9');
  });
});
