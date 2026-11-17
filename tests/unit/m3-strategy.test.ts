import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateMalaysianWhatsapp } from '../../src/components/BrandVaultScreen';
import { StrategyTab } from '../../src/components/tabs/StrategyTab';
import { SAMPLE_OFFER_CHIP, SEEDED_KLINIK_GIGI_IMPIAN } from '../../src/data/seedVault';
import { I18nProvider, useI18n } from '../../src/i18n/I18nContext';
import { CampaignProvider, useCampaign } from '../../src/state/CampaignContext';
import { WorkbenchProvider, useWorkbench } from '../../src/state/WorkbenchContext';
import type { BrandProfile } from '../../src/types/campaign';
import {
  checkCopyCompliance,
  RISKY_COMPLIANCE_SAMPLE,
  rewriteSafeCopy,
} from '../../src/utils/compliance';
import {
  buildCustomerPsychology,
  enforceRsaLength,
  enhanceCopyWithGemini,
  generateCampaignCopyMap,
  isValidGeminiKeyFormat,
} from '../../src/utils/copyGenerator';
import { calculateCpaMetrics, formatRm } from '../../src/utils/cpa';
import {
  ANGLE_WHATSAPP_TAGS,
  buildWhatsappCtaUrl,
  getSafeWhatsappDigits,
  normalizeWhatsappNumber,
  rewriteWhatsappUrlPhone,
} from '../../src/utils/whatsapp';

function StrategyHarness() {
  const { setLocale } = useI18n();
  const { updateBrand, activeBrandId } = useWorkbench();
  const { setSelectedAngle, editedCopyByAngle } = useCampaign();

  return createElement(
    'div',
    null,
    createElement(
      'span',
      { 'data-testid': 'harness-context-wa' },
      editedCopyByAngle.confidence?.facebook.whatsappUrl ?? ''
    ),
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'harness-update-wa',
        onClick: () => updateBrand(activeBrandId, { whatsappNumber: '018-777 6655' }),
      },
      'updateWa'
    ),
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'harness-update-wa-long',
        onClick: () => updateBrand(activeBrandId, { whatsappNumber: '601234567890' }),
      },
      'updateWaLong'
    ),
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'harness-update-wa-prefix',
        onClick: () => updateBrand(activeBrandId, { whatsappNumber: '60123456789' }),
      },
      'updateWaPrefix'
    ),
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'harness-toggle-en',
        onClick: () => setLocale('en'),
      },
      'EN'
    ),
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'harness-select-payday',
        onClick: () => setSelectedAngle('payday'),
      },
      'payday'
    ),
    createElement(StrategyTab)
  );
}

describe('M3 whatsapp.ts utilities', () => {
  it('normalizes Malaysian mobile/landline and international numbers safely', () => {
    expect(normalizeWhatsappNumber('012-345 6789')).toBe('60123456789');
    expect(normalizeWhatsappNumber('+60 12-345 6789')).toBe('60123456789');
    expect(normalizeWhatsappNumber('03-7788 9900')).toBe('60377889900');
    expect(normalizeWhatsappNumber('+60 012-345 6789')).toBe('60123456789');
    expect(normalizeWhatsappNumber('+65 9123 4567')).toBe('6591234567');
    expect(normalizeWhatsappNumber('0065 9123 4567')).toBe('6591234567');
    expect(normalizeWhatsappNumber('+0065 9123 4567')).toBe('6591234567');
    expect(normalizeWhatsappNumber('000012345678')).toBe('12345678');
    expect(normalizeWhatsappNumber('0060 19-888 7777')).toBe('60198887777');
    expect(normalizeWhatsappNumber('')).toBe('');
    expect(normalizeWhatsappNumber('123')).toBe('');
    expect(normalizeWhatsappNumber('abc-def')).toBe('');
  });

  it('truncates emoji surrogate pairs safely in buildWhatsappCtaUrl without URIError', () => {
    const boundaryOffer = `${'a'.repeat(116)}🦷bbb`;
    const emojiFloodOffer = '🦷'.repeat(120);

    const url1 = buildWhatsappCtaUrl({
      phone: '0123456789',
      brandName: 'Klinik Gigi Impian',
      offerSentence: boundaryOffer,
      angle: 'confidence',
    });
    const url2 = buildWhatsappCtaUrl({
      phone: '0123456789',
      brandName: 'Klinik Gigi Impian',
      offerSentence: emojiFloodOffer,
      angle: 'payday',
    });

    expect(() => decodeURIComponent(url1)).not.toThrow();
    expect(() => decodeURIComponent(url2)).not.toThrow();
    expect(decodeURIComponent(url1)).toContain(ANGLE_WHATSAPP_TAGS.confidence);
    expect(decodeURIComponent(url2)).toContain(ANGLE_WHATSAPP_TAGS.payday);
    expect(/[\uD800-\uDFFF]/.test(url1.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))).toBe(false);
    expect(/[\uD800-\uDFFF]/.test(url2.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))).toBe(false);
  });

  it('uses fallback digits and builds angle-tagged wa.me CTA URLs', () => {
    expect(getSafeWhatsappDigits('bad')).toBe('60123456789');

    const confUrl = buildWhatsappCtaUrl({
      phone: '018-777 6655',
      brandName: 'Klinik Gigi Harmoni',
      offerSentence: 'Promosi Scaling & Polish',
      angle: 'confidence',
    });
    const hygUrl = buildWhatsappCtaUrl({
      phone: '018-777 6655',
      brandName: 'Klinik Gigi Harmoni',
      offerSentence: 'Promosi Scaling & Polish',
      angle: 'hygiene',
    });
    const payUrl = buildWhatsappCtaUrl({
      phone: '018-777 6655',
      brandName: 'Klinik Gigi Harmoni',
      offerSentence: 'Promosi Scaling & Polish',
      angle: 'payday',
    });

    expect(confUrl).toContain('https://wa.me/60187776655?text=');
    expect(decodeURIComponent(confUrl)).toContain(ANGLE_WHATSAPP_TAGS.confidence);
    expect(decodeURIComponent(hygUrl)).toContain(ANGLE_WHATSAPP_TAGS.hygiene);
    expect(decodeURIComponent(payUrl)).toContain(ANGLE_WHATSAPP_TAGS.payday);
    expect(decodeURIComponent(payUrl)).toContain('Klinik Gigi Harmoni');
  });

  it('rewrites phone digits without wiping surrounding copy or angle tag', () => {
    const original =
      'Teks disunting: https://wa.me/60123456789?text=Hai%20Klinik%20%5BKod%3A%20SUDUT-3-MINGGUGAJI%5D';
    const updated = rewriteWhatsappUrlPhone(original, '019-222 3344');
    expect(updated).toContain('Teks disunting: https://wa.me/60192223344?text=');
    expect(decodeURIComponent(updated)).toContain('SUDUT-3-MINGGUGAJI');
  });

  it('normalizes +01x trunk zero, rejects <8/>15/leading-0 numbers, and validates +01x in BrandVaultScreen', () => {
    expect(normalizeWhatsappNumber('+012-345 6789')).toBe('60123456789');
    expect(normalizeWhatsappNumber('0123456789012345')).toBe('');
    expect(normalizeWhatsappNumber('012345')).toBe('');
    expect(normalizeWhatsappNumber('1234567')).toBe('');
    expect(normalizeWhatsappNumber('0212345678')).toBe('');
    expect(validateMalaysianWhatsapp('+012-345 6789')).toEqual({
      valid: true,
      normalized: '60123456789',
    });
  });
});

describe('M3 cpa.ts utilities', () => {
  it('calculates Break-Even CPA, Max CPL, Projected CPA, and threshold statuses', () => {
    const baseline = calculateCpaMetrics({
      servicePriceRm: 180,
      marginPercent: 60,
      closeRatePercent: 30,
      estimatedCplRm: 18,
    });
    expect(baseline.breakEvenCpaRm).toBe(108);
    expect(baseline.maxRecommendedCplRm).toBe(32.4);
    expect(baseline.projectedCpaRm).toBe(60);
    expect(baseline.status).toBe('safe');
    expect(formatRm(baseline.breakEvenCpaRm)).toBe('RM 108.00');
    expect(formatRm(baseline.maxRecommendedCplRm)).toBe('RM 32.40');

    expect(
      calculateCpaMetrics({
        servicePriceRm: 100,
        marginPercent: 50,
        closeRatePercent: 50,
        estimatedCplRm: 17,
      }).status
    ).toBe('safe');

    expect(
      calculateCpaMetrics({
        servicePriceRm: 100,
        marginPercent: 50,
        closeRatePercent: 50,
        estimatedCplRm: 20,
      }).status
    ).toBe('caution');

    expect(
      calculateCpaMetrics({
        servicePriceRm: 100,
        marginPercent: 50,
        closeRatePercent: 50,
        estimatedCplRm: 30,
      }).status
    ).toBe('over_limit');
  });

  it('handles zero, negative, NaN, and Infinity inputs without NaN or Infinity', () => {
    const cases = [
      { servicePriceRm: 100, marginPercent: 50, closeRatePercent: 0, estimatedCplRm: 20 },
      { servicePriceRm: 100, marginPercent: 0, closeRatePercent: 50, estimatedCplRm: 10 },
      { servicePriceRm: -10, marginPercent: 50, closeRatePercent: 30, estimatedCplRm: 10 },
      {
        servicePriceRm: Number.NaN,
        marginPercent: Number.POSITIVE_INFINITY,
        closeRatePercent: 0,
        estimatedCplRm: Number.NaN,
      },
    ];

    for (const c of cases) {
      const res = calculateCpaMetrics(c);
      expect(Number.isFinite(res.breakEvenCpaRm)).toBe(true);
      expect(Number.isFinite(res.maxRecommendedCplRm)).toBe(true);
      expect(Number.isFinite(res.projectedCpaRm)).toBe(true);
      expect(formatRm(res.projectedCpaRm)).toMatch(/^RM \d+\.\d{2}$/);
    }
  });

  it('handles exact 0.75/1.0 ratio boundaries, 100% margin/closeRate, negative inputs, and >1.0 ratio when breakEven=0 & cpl>0', () => {
    const boundarySafe = calculateCpaMetrics({
      servicePriceRm: 100,
      marginPercent: 100,
      closeRatePercent: 100,
      estimatedCplRm: 75,
    });
    expect(boundarySafe.breakEvenCpaRm).toBe(100);
    expect(boundarySafe.ratioToBreakEven).toBe(0.75);
    expect(boundarySafe.status).toBe('safe');

    const boundaryCaution = calculateCpaMetrics({
      servicePriceRm: 100,
      marginPercent: 100,
      closeRatePercent: 100,
      estimatedCplRm: 100,
    });
    expect(boundaryCaution.ratioToBreakEven).toBe(1);
    expect(boundaryCaution.status).toBe('caution');

    const zeroBreakEven = calculateCpaMetrics({
      servicePriceRm: 100,
      marginPercent: 0,
      closeRatePercent: 50,
      estimatedCplRm: 10,
    });
    expect(zeroBreakEven.status).toBe('over_limit');
    expect(zeroBreakEven.ratioToBreakEven).toBeGreaterThan(1);

    const neg = calculateCpaMetrics({
      servicePriceRm: 100,
      marginPercent: -20,
      closeRatePercent: -10,
      estimatedCplRm: -5,
    });
    expect(neg.breakEvenCpaRm).toBe(0);
    expect(neg.projectedCpaRm).toBe(0);
    expect(formatRm(-5)).toBe('RM 0.00');
    expect(formatRm(Number.NaN)).toBe('RM 0.00');
  });
});

describe('M3 compliance.ts utilities', () => {
  it('flags Meta Personal Attributes and MY dental/KKLIU risks in BM and EN', () => {
    const riskyFindings = checkCopyCompliance(RISKY_COMPLIANCE_SAMPLE);
    expect(riskyFindings.some((f) => f.category === 'meta_personal_attributes')).toBe(true);
    expect(riskyFindings.some((f) => f.category === 'my_healthcare_norm')).toBe(true);

    const enFindings = checkCopyCompliance(
      'Are you suffering from bad breath? Cheapest dentist!'
    );
    expect(enFindings.some((f) => f.category === 'meta_personal_attributes')).toBe(true);
    expect(enFindings.some((f) => f.category === 'my_healthcare_norm')).toBe(true);

    const missingKkliu = checkCopyCompliance(
      'Promosi scaling gigi murah di klinik kami bulan ini!'
    );
    expect(missingKkliu.some((f) => f.ruleKey === 'tab1.complianceRuleKkliu')).toBe(true);
  });

  it('passes clean copy and rewrites risky copy into guaranteed-clean text', () => {
    const clean =
      'Penjagaan penskaleran profesional di Klinik Gigi Impian. Tempah sesi konsultasi bersama doktor pergigian bertauliah (patuh KKLIU).';
    expect(checkCopyCompliance(clean)).toHaveLength(0);

    const rewritten = rewriteSafeCopy(RISKY_COMPLIANCE_SAMPLE, 'Klinik Gigi Impian');
    expect(checkCopyCompliance(rewritten)).toHaveLength(0);
    expect(rewritten).not.toMatch(/100%|terbaik|dijamin|kuning/i);
  });

  it('flags (#1), prevents orphaned dan-nafas artifacts, and keeps clean output for regulated brandNames', () => {
    const parenSuperlative = checkCopyCompliance('Promosi scaling (#1) di bandar!');
    expect(parenSuperlative.some((f) => f.id === 'my-superlative')).toBe(true);

    const stackedMultiline =
      'Gigi\nanda\nberkarang dan nafas\nanda\nberbau?\n(#1) klinik!\n100% dijamin!';
    const rewrittenMultiline = rewriteSafeCopy(stackedMultiline, 'Klinik Gigi Impian');
    expect(checkCopyCompliance(rewrittenMultiline)).toHaveLength(0);
    expect(rewrittenMultiline).not.toMatch(/\banda\s+berbau/i);

    for (const riskyBrand of [
      'Klinik Terbaik No. 1',
      'Klinik Gigi 100% Dijamin',
      'Cheapest Dental Clinic',
    ]) {
      const rewrittenBrand = rewriteSafeCopy('Gigi anda kuning! Dijamin 100%!', riskyBrand);
      expect(checkCopyCompliance(rewrittenBrand)).toHaveLength(0);
    }
  });

  it('produces fluent rewrites without garbled phrases, preserves comma CTAs and tema kuning, and detects crooked teeth / Pusat Pergigian offers', () => {
    const rewrittenSample = rewriteSafeCopy(RISKY_COMPLIANCE_SAMPLE, 'Klinik Gigi Impian');
    expect(rewrittenSample).not.toContain('berhemah putih');
    expect(rewrittenSample).not.toContain('dipercayai ramai berpengalaman');
    expect(checkCopyCompliance(rewrittenSample)).toHaveLength(0);

    const preservedCta = rewriteSafeCopy(
      'Anda mengalami sakit gigi, WhatsApp 0123456789 untuk slot',
      'Klinik A'
    );
    expect(preservedCta).toContain('0123456789');
    expect(checkCopyCompliance(preservedCta)).toHaveLength(0);

    const benignTheme = rewriteSafeCopy(
      'Klinik kami berhias tema kuning dan biru untuk keselesaan anda.',
      'Klinik A'
    );
    expect(benignTheme).toContain('tema kuning dan biru');

    expect(
      checkCopyCompliance('You have crooked teeth').some(
        (f) => f.category === 'meta_personal_attributes'
      )
    ).toBe(true);
    expect(
      checkCopyCompliance('Offer Scaling RM99 di Pusat Pergigian').some(
        (f) => f.id === 'my-kkliu-notice'
      )
    ).toBe(true);
  });
});

describe('M3 copyGenerator.ts', () => {
  const proBrand: BrandProfile = {
    ...SEEDED_KLINIK_GIGI_IMPIAN,
    id: 'klinik-korporat-pro',
    name: 'Klinik Korporat Pro',
    tone: 'professional',
    whatsappNumber: '60181234567',
  };

  it('differentiates psychology and copy across angles and brand tones', () => {
    const casualPsych = buildCustomerPsychology(SEEDED_KLINIK_GIGI_IMPIAN, SAMPLE_OFFER_CHIP);
    const proPsych = buildCustomerPsychology(proBrand, SAMPLE_OFFER_CHIP);
    expect(casualPsych.targetPersona).not.toBe(proPsych.targetPersona);
    expect(casualPsych.trustAnchors).not.toBe(proPsych.trustAnchors);

    const casualMap = generateCampaignCopyMap(SEEDED_KLINIK_GIGI_IMPIAN, SAMPLE_OFFER_CHIP);
    const proMap = generateCampaignCopyMap(proBrand, SAMPLE_OFFER_CHIP);

    expect(casualMap.confidence.facebook.primaryText).not.toBe(
      casualMap.hygiene.facebook.primaryText
    );
    expect(casualMap.hygiene.facebook.primaryText).not.toBe(
      casualMap.payday.facebook.primaryText
    );
    expect(casualMap.confidence.facebook.primaryText).not.toBe(
      proMap.confidence.facebook.primaryText
    );

    for (const angle of ['confidence', 'hygiene', 'payday'] as const) {
      expect(checkCopyCompliance(casualMap[angle].facebook.primaryText)).toHaveLength(0);
      expect(checkCopyCompliance(proMap[angle].facebook.primaryText)).toHaveLength(0);
    }
  });

  it('enforces Google RSA <=30 headline and <=90 description limits on extreme inputs', () => {
    const longBrand: BrandProfile = {
      ...SEEDED_KLINIK_GIGI_IMPIAN,
      name: 'Klinik Pergigian Pakar Keluarga Dan Estetik Senyuman Indah Cawangan Kuala Lumpur Tengah',
    };
    const longOffer = `${'Promosi Scaling & Polish Istimewa '.repeat(12)}slot terhad!`;
    const map = generateCampaignCopyMap(longBrand, longOffer);

    for (const angle of ['confidence', 'hygiene', 'payday'] as const) {
      const rsa = map[angle].google_rsa;
      expect(rsa.headlines.length).toBeGreaterThanOrEqual(3);
      expect(rsa.descriptions.length).toBeGreaterThanOrEqual(2);
      expect(rsa.negativeKeywords.length).toBeGreaterThanOrEqual(4);
      for (const h of rsa.headlines) {
        expect(h.length).toBeGreaterThan(0);
        expect(h.length).toBeLessThanOrEqual(30);
      }
      for (const d of rsa.descriptions) {
        expect(d.length).toBeGreaterThan(0);
        expect(d.length).toBeLessThanOrEqual(90);
      }
    }
  });

  it('guards BYOK Gemini enhance in demo mode and falls back cleanly on fetch error', async () => {
    expect(isValidGeminiKeyFormat('AIzaSyDemoTestKey1234567890')).toBe(true);
    expect(isValidGeminiKeyFormat('AIza12345678')).toBe(true); // 12 chars (matches OnboardingScreen)
    expect(isValidGeminiKeyFormat('AIzaSyValidKey12345')).toBe(true); // 19 chars
    expect(isValidGeminiKeyFormat('AIza1234567')).toBe(false); // 11 chars (<12)
    expect(isValidGeminiKeyFormat('short')).toBe(false);

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const demoResult = await enhanceCopyWithGemini({
      apiKey: 'AIzaSyDemoTestKey1234567890',
      isDemoMode: true,
      brand: SEEDED_KLINIK_GIGI_IMPIAN,
      offerSentence: SAMPLE_OFFER_CHIP,
      angle: 'confidence',
    });
    expect(demoResult.source).toBe('baseline');
    expect(fetchSpy).not.toHaveBeenCalled();

    // 14-char key (12-19 char range) must be accepted for live BYOK call rather than silently bypassed
    fetchSpy.mockRejectedValueOnce(new Error('Network down'));
    const midLengthResult = await enhanceCopyWithGemini({
      apiKey: 'AIzaTestKey123',
      isDemoMode: false,
      brand: SEEDED_KLINIK_GIGI_IMPIAN,
      offerSentence: SAMPLE_OFFER_CHIP,
      angle: 'hygiene',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(midLengthResult.source).toBe('baseline');
    expect(midLengthResult.copy.facebook.whatsappUrl).toContain('SUDUT-2-PENCEGAHAN');

    fetchSpy.mockRejectedValueOnce(new Error('Network down'));
    const fallbackResult = await enhanceCopyWithGemini({
      apiKey: 'AIzaSyDemoTestKey1234567890',
      isDemoMode: false,
      brand: SEEDED_KLINIK_GIGI_IMPIAN,
      offerSentence: SAMPLE_OFFER_CHIP,
      angle: 'payday',
    });
    expect(fallbackResult.source).toBe('baseline');
    expect(fallbackResult.copy.facebook.whatsappUrl).toContain('SUDUT-3-MINGGUGAJI');

    fetchSpy.mockRestore();
  });

  it('enforces surrogate-safe RSA truncation without lone UTF-16 surrogates', () => {
    const bounded = enforceRsaLength(`${'a'.repeat(29)}🦷`, 30, 'Fallback');
    expect(bounded.length).toBeLessThanOrEqual(30);
    expect(bounded).toBe('a'.repeat(29));
    expect(/[\uD800-\uDFFF]/.test(bounded.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))).toBe(
      false
    );
  });

  it('produces 0 compliance findings across every baseline angle, tone, channel, and field', () => {
    const brands: BrandProfile[] = [
      SEEDED_KLINIK_GIGI_IMPIAN,
      { ...SEEDED_KLINIK_GIGI_IMPIAN, id: 'pro-seeded', tone: 'professional' },
    ];

    for (const brand of brands) {
      const map = generateCampaignCopyMap(brand, SAMPLE_OFFER_CHIP);
      for (const angle of ['confidence', 'hygiene', 'payday'] as const) {
        const entry = map[angle];
        const fields = [
          entry.facebook.primaryText,
          entry.facebook.headline,
          entry.facebook.description,
          entry.instagram.caption,
          entry.instagram.hashtags,
          entry.tiktok.hook,
          entry.tiktok.script,
          entry.tiktok.caption,
          ...entry.google_rsa.headlines,
          ...entry.google_rsa.descriptions,
        ];
        for (const field of fields) {
          expect(checkCopyCompliance(field), `${brand.tone}/${angle}: ${field}`).toHaveLength(0);
        }
        const channelTexts = [
          `${entry.facebook.primaryText}\n${entry.facebook.headline}\n${entry.facebook.description}`,
          `${entry.instagram.caption}\n${entry.instagram.hashtags}`,
          `${entry.tiktok.hook}\n${entry.tiktok.script}\n${entry.tiktok.caption}`,
          `${entry.google_rsa.headlines.join('\n')}\n${entry.google_rsa.descriptions.join('\n')}`,
        ];
        for (const channelText of channelTexts) {
          expect(checkCopyCompliance(channelText)).toHaveLength(0);
        }
      }
    }
  });

  it('sanitizes risky Gemini BYOK output on google_rsa and instagram.hashtags while keeping RSA limits', async () => {
    const riskyPayload = {
      facebook: {
        primaryText: 'Gigi anda kuning? Klinik terbaik No. 1!',
        headline: 'Dijamin 100% Putih',
        description: 'Testimoni sebelum dan selepas',
      },
      instagram: {
        caption: 'Nafas anda berbau? Datang segera!',
        hashtags: '#KlinikTerbaik #Dijamin100% #No1',
      },
      tiktok: {
        hook: 'Gigi anda kuning?!',
        script: 'Dijamin 100% putih dalam 1 sesi!',
        caption: 'Klinik terbaik No. 1 Malaysia!',
      },
      google_rsa: {
        headlines: [
          'Klinik Terbaik No. 1',
          'Promosi Scaling Gigi Terbaik',
          'Dijamin 100% Putih Bersih',
        ],
        descriptions: [
          'Gigi anda kuning? Klinik terbaik No. 1 dijamin 100% putih!',
          'Cheapest dental clinic with permanent cure before and after!',
        ],
        negativeKeywords: ['percuma', 'diy', 'murah', 'tanpa doktor'],
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(riskyPayload) }] } }],
      }),
    } as Response);

    const result = await enhanceCopyWithGemini({
      apiKey: 'AIzaSyDemoTestKey1234567890',
      isDemoMode: false,
      brand: SEEDED_KLINIK_GIGI_IMPIAN,
      offerSentence: SAMPLE_OFFER_CHIP,
      angle: 'confidence',
    });

    expect(result.source).toBe('gemini');
    expect(checkCopyCompliance(result.copy.instagram.hashtags)).toHaveLength(0);
    for (const h of result.copy.google_rsa.headlines) {
      expect(h.length).toBeLessThanOrEqual(30);
      expect(checkCopyCompliance(h)).toHaveLength(0);
    }
    for (const d of result.copy.google_rsa.descriptions) {
      expect(d.length).toBeLessThanOrEqual(90);
      expect(checkCopyCompliance(d)).toHaveLength(0);
    }

    fetchSpy.mockRestore();
  });

  it('does not append duplicate wa.me links when Gemini payload or baseline fallback already includes waUrl', async () => {
    const expectedWa = buildWhatsappCtaUrl({
      phone: SEEDED_KLINIK_GIGI_IMPIAN.whatsappNumber,
      brandName: SEEDED_KLINIK_GIGI_IMPIAN.name,
      offerSentence: SAMPLE_OFFER_CHIP,
      angle: 'confidence',
    });

    const payloadWithWa = {
      facebook: {
        primaryText: `Jom semak slot konsultasi bersama doktor bertauliah! ${expectedWa}`,
        headline: 'Senyum Yakin',
        description: 'Konsultasi klinikal',
      },
      instagram: {
        // caption omitted -> falls back to baseline.instagram.caption which already includes waUrl
        hashtags: '#KlinikGigi #SenyumYakin',
      },
      tiktok: {
        hook: 'Hook ringkas',
        script: `Skrip dengan pautan ${expectedWa}`,
        caption: `Kapsyen dengan pautan ${expectedWa}`,
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payloadWithWa) }] } }],
      }),
    } as Response);

    const res = await enhanceCopyWithGemini({
      apiKey: 'AIzaSyDemoTestKey1234567890',
      isDemoMode: false,
      brand: SEEDED_KLINIK_GIGI_IMPIAN,
      offerSentence: SAMPLE_OFFER_CHIP,
      angle: 'confidence',
    });

    const countWa = (s: string) => s.match(/https:\/\/wa\.me\//g)?.length ?? 0;
    expect(countWa(res.copy.facebook.primaryText)).toBe(1);
    expect(countWa(res.copy.instagram.caption)).toBe(1);
    expect(countWa(res.copy.tiktok.script)).toBe(1);
    expect(countWa(res.copy.tiktok.caption)).toBe(1);

    fetchSpy.mockRestore();
  });
});

describe('M3 StrategyTab component integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders StrategyTab, allows >30 char RSA warning, live-syncs WhatsApp, copies payload, and preserves edits on BM/EN toggle', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(StrategyHarness))
        )
      )
    );

    expect(screen.getByTestId('strategy-tab')).toBeInTheDocument();
    expect(screen.getByTestId('strategy-psychology-panel')).toBeInTheDocument();
    expect(screen.getByTestId('compliance-status-badge').textContent).toMatch(/Lulus|Pass/i);

    // RSA 35/30 warning check without clamping
    const rsaCard = screen.getByTestId('channel-google_rsa');
    const rsaFirstInput = rsaCard.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(rsaFirstInput, {
      target: { value: '12345678901234567890123456789012345' },
    });
    expect(rsaCard.textContent).toMatch(/35\s*\/\s*30/);

    // Live WhatsApp sync without re-clicking Bina Kempen
    fireEvent.click(screen.getByTestId('harness-update-wa'));
    await waitFor(() => {
      expect(screen.getByTestId('whatsapp-cta-facebook').getAttribute('href')).toContain(
        'https://wa.me/60187776655?text='
      );
      expect(screen.getByTestId('whatsapp-cta-google_rsa').getAttribute('href')).toContain(
        'https://wa.me/60187776655?text='
      );
    });

    // Quick-Copy button copies payload and displays Disalin!
    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-btn-facebook'));
    });
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedText = String(writeTextMock.mock.calls[0][0]);
    expect(copiedText).toContain('https://wa.me/60187776655?text=');
    expect(copiedText).toContain('SUDUT-1-KEYAKINAN');
    expect(screen.getByTestId('copy-btn-facebook').textContent).toMatch(/Disalin|Copied/i);

    // Compliance risky -> rewrite -> BM/EN toggle keeps edited text
    fireEvent.click(screen.getByTestId('compliance-test-risky-btn'));
    expect(screen.getByTestId('compliance-findings').textContent).toMatch(
      /Meta Personal Attributes/i
    );
    fireEvent.click(screen.getByTestId('compliance-apply-rewrite-btn'));
    expect(screen.getByTestId('compliance-status-badge').textContent).toMatch(/Lulus|Pass/i);

    const fbTextarea = screen
      .getByTestId('channel-facebook')
      .querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(fbTextarea, { target: { value: 'Suntingan Kekal BM ke EN' } });
    fireEvent.click(screen.getByTestId('harness-toggle-en'));
    expect(fbTextarea.value).toBe('Suntingan Kekal BM ke EN');
    expect(screen.getByTestId('compliance-status-badge').textContent).toMatch(/Pass/i);
  });

  it('syncs CampaignContext wa.me URLs even when a brand phone number is shortened to a prefix', async () => {
    render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(StrategyHarness))
        )
      )
    );

    fireEvent.click(screen.getByTestId('harness-update-wa-long'));
    await waitFor(() => {
      expect(screen.getByTestId('harness-context-wa').textContent).toContain(
        'https://wa.me/601234567890?text='
      );
    });

    fireEvent.click(screen.getByTestId('harness-update-wa-prefix'));
    await waitFor(() => {
      expect(screen.getByTestId('harness-context-wa').textContent).toContain(
        'https://wa.me/60123456789?text='
      );
    });
  });

  it('falls back to document.execCommand("copy") when navigator.clipboard.writeText rejects', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) },
    });
    const execCommandSpy = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommandSpy,
    });

    render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(StrategyHarness))
        )
      )
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-btn-facebook'));
    });

    expect(execCommandSpy).toHaveBeenCalledWith('copy');
    expect(screen.getByTestId('copy-btn-facebook').textContent).toMatch(/Disalin|Copied/i);
  });

  it('preserves edits made to another angle while async Gemini BYOK enhancement is in flight', async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(pendingFetch);

    function ByokEnhanceHarness() {
      const { loginWithGoogle, saveByokKey } = useWorkbench();
      return createElement(
        'div',
        null,
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'enable-byok',
            onClick: () => {
              loginWithGoogle('pro@studio.my');
              saveByokKey('AIzaSyValidKey1234567890', false);
            },
          },
          'enableByok'
        ),
        createElement(StrategyTab)
      );
    }

    render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(ByokEnhanceHarness))
        )
      )
    );

    fireEvent.click(screen.getByTestId('enable-byok'));
    const enhanceBtn = screen.getByRole('button', { name: /Gemini/i });
    fireEvent.click(enhanceBtn);

    // Switch to payday and edit payday Facebook headline before fetch resolves
    fireEvent.click(screen.getByTestId('angle-payday'));
    const fbInputs = screen.getByTestId('channel-facebook').querySelectorAll('input[type="text"]');
    fireEvent.change(fbInputs[0] as HTMLInputElement, {
      target: { value: 'Payday Suntingan Kekal' },
    });

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      facebook: {
                        primaryText: 'Salinan Gemini untuk sudut keyakinan bersama doktor bertauliah.',
                        headline: 'Gemini Keyakinan',
                        description: 'Konsultasi klinikal',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response);
    });

    await waitFor(() => {
      expect(enhanceBtn).toBeEnabled();
    });
    expect((fbInputs[0] as HTMLInputElement).value).toBe('Payday Suntingan Kekal');

    fireEvent.click(screen.getByTestId('angle-confidence'));
    const confInputs = screen.getByTestId('channel-facebook').querySelectorAll('input[type="text"]');
    expect((confInputs[0] as HTMLInputElement).value).toBe('Gemini Keyakinan');
  });

  it('resets isEnhancing immediately and ignores stale Gemini BYOK response when launchCampaign runs mid-flight', async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(pendingFetch);

    function MidFlightRelaunchHarness() {
      const { loginWithGoogle, saveByokKey } = useWorkbench();
      const { launchCampaign } = useCampaign();
      return createElement(
        'div',
        null,
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'enable-byok-2',
            onClick: () => {
              loginWithGoogle('pro@studio.my');
              saveByokKey('AIzaSyValidKey1234567890', false);
            },
          },
          'enableByok'
        ),
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'relaunch-mid-flight',
            onClick: () => launchCampaign({ offerSentence: 'Kempen Kedua Segar' }),
          },
          'relaunch'
        ),
        createElement(StrategyTab)
      );
    }

    render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(MidFlightRelaunchHarness))
        )
      )
    );

    fireEvent.click(screen.getByTestId('enable-byok-2'));
    const enhanceBtn = screen.getByRole('button', { name: /Gemini/i });
    fireEvent.click(enhanceBtn);

    expect(enhanceBtn).toBeDisabled();
    expect(enhanceBtn.textContent).toMatch(/Menjana/i);

    // Relaunch campaign while BYOK fetch is still pending
    fireEvent.click(screen.getByTestId('relaunch-mid-flight'));

    expect(enhanceBtn).toBeEnabled();
    expect(enhanceBtn.textContent).toMatch(/Tingkatkan dengan Gemini/i);

    // Resolve stale Campaign 1 fetch -> Campaign 2 remains untouched and button stays idle/enabled
    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      facebook: {
                        primaryText: 'Salinan Lama Kempen 1 bersama doktor bertauliah.',
                        headline: 'Gemini Kempen Lama',
                        description: 'Konsultasi klinikal',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response);
    });

    expect(enhanceBtn).toBeEnabled();
    expect(enhanceBtn.textContent).toMatch(/Tingkatkan dengan Gemini/i);
    const fbInputs = screen.getByTestId('channel-facebook').querySelectorAll('input[type="text"]');
    expect((fbInputs[0] as HTMLInputElement).value).not.toBe('Gemini Kempen Lama');
    expect(screen.getByTestId('strategy-psychology-panel').textContent).toContain(
      'Kempen Kedua Segar'
    );
  });

  it('resets isEnhancing and discards stale Gemini BYOK response when launchedBrand tone changes mid-flight', async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(pendingFetch);

    function MidFlightBrandToneHarness() {
      const { loginWithGoogle, saveByokKey, activeBrandId, updateBrand } = useWorkbench();
      return createElement(
        'div',
        null,
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'enable-byok-tone',
            onClick: () => {
              loginWithGoogle('pro@studio.my');
              saveByokKey('AIzaSyValidKey1234567890', false);
            },
          },
          'enableByok'
        ),
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'switch-tone-pro',
            onClick: () => updateBrand(activeBrandId, { tone: 'professional' }),
          },
          'switchTonePro'
        ),
        createElement(StrategyTab)
      );
    }

    render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(MidFlightBrandToneHarness))
        )
      )
    );

    fireEvent.click(screen.getByTestId('enable-byok-tone'));
    const enhanceBtn = screen.getByRole('button', { name: /Gemini/i });
    fireEvent.click(enhanceBtn);
    expect(enhanceBtn).toBeDisabled();

    // Mutate launched brand tone to professional mid-flight
    fireEvent.click(screen.getByTestId('switch-tone-pro'));
    expect(enhanceBtn).toBeEnabled();
    expect(screen.getByTestId('channel-facebook').textContent).toContain('Keyakinan Klinikal');

    // Resolve stale casual Gemini payload -> must NOT overwrite updated professional copy
    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      facebook: {
                        primaryText: 'Salinan santai basi bersama doktor bertauliah.',
                        headline: 'STALE_CASUAL_HEADLINE',
                        description: 'Konsultasi santai',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response);
    });

    expect(enhanceBtn).toBeEnabled();
    const fbCardText = screen.getByTestId('channel-facebook').textContent ?? '';
    expect(fbCardText).toContain('Keyakinan Klinikal');
    expect(fbCardText).not.toContain('STALE_CASUAL_HEADLINE');
  });

  it('isolates mid-flight Gemini BYOK notice to targetAngle and exposes accessible labels for Google RSA H1-H3 & D1-D2', async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(pendingFetch);

    function ByokAngleIsolationHarness() {
      const { loginWithGoogle, saveByokKey } = useWorkbench();
      return createElement(
        'div',
        null,
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'enable-byok-isolation',
            onClick: () => {
              loginWithGoogle('pro@studio.my');
              saveByokKey('AIzaSyValidKey1234567890', false);
            },
          },
          'enableByok'
        ),
        createElement(StrategyTab)
      );
    }

    render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(ByokAngleIsolationHarness))
        )
      )
    );

    // Accessible labels for RSA H1-H3 and D1-D2
    expect(screen.getByLabelText('H1').tagName).toBe('INPUT');
    expect(screen.getByLabelText('H2').tagName).toBe('INPUT');
    expect(screen.getByLabelText('H3').tagName).toBe('INPUT');
    expect(screen.getByLabelText('D1').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('D2').tagName).toBe('TEXTAREA');

    fireEvent.click(screen.getByTestId('enable-byok-isolation'));
    fireEvent.click(screen.getByRole('button', { name: /Gemini/i }));

    // Switch to payday mid-flight
    fireEvent.click(screen.getByTestId('angle-payday'));
    expect(screen.queryByTestId('strategy-enhance-notice')).toBeNull();

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      facebook: {
                        primaryText: 'Salinan Gemini untuk sudut keyakinan bersama doktor bertauliah.',
                        headline: 'Gemini Confidence Only',
                        description: 'Konsultasi klinikal',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response);
    });

    // Payday MUST NOT show Gemini enhancement notice
    expect(screen.queryByTestId('strategy-enhance-notice')).toBeNull();

    // Switching back to confidence shows the notice and enhanced headline
    fireEvent.click(screen.getByTestId('angle-confidence'));
    expect(screen.getByTestId('strategy-enhance-notice')).toHaveTextContent(
      /Salinan dipertingkat oleh Gemini/i
    );
    const confInputs = screen.getByTestId('channel-facebook').querySelectorAll('input[type="text"]');
    expect((confInputs[0] as HTMLInputElement).value).toBe('Gemini Confidence Only');
  });

  it('preserves in-flight Gemini BYOK copy and strategy-enhance-notice across StrategyTab unmount/remount while keeping per-angle isolation', async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(pendingFetch);

    function TabSwitchHarness() {
      const { loginWithGoogle, saveByokKey } = useWorkbench();
      const { activeTab, setActiveTab } = useCampaign();
      return createElement(
        'div',
        null,
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'enable-byok-tabswitch',
            onClick: () => {
              loginWithGoogle('pro@studio.my');
              saveByokKey('AIzaSyValidKey1234567890', false);
            },
          },
          'enableByok'
        ),
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'switch-to-carousel',
            onClick: () => setActiveTab('carousel'),
          },
          'toCarousel'
        ),
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'switch-to-strategy',
            onClick: () => setActiveTab('strategy'),
          },
          'toStrategy'
        ),
        activeTab === 'strategy'
          ? createElement(StrategyTab)
          : createElement('div', { 'data-testid': 'carousel-placeholder' }, 'Carousel')
      );
    }

    render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(TabSwitchHarness))
        )
      )
    );

    fireEvent.click(screen.getByTestId('enable-byok-tabswitch'));
    fireEvent.click(screen.getByRole('button', { name: /Gemini/i }));

    // Unmount StrategyTab mid-flight by switching to carousel tab
    fireEvent.click(screen.getByTestId('switch-to-carousel'));
    expect(screen.queryByTestId('strategy-tab')).toBeNull();
    expect(screen.getByTestId('carousel-placeholder')).toBeInTheDocument();

    // Resolve Gemini fetch while StrategyTab is unmounted
    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      facebook: {
                        primaryText: 'Salinan Gemini semasa tab bertukar bersama doktor bertauliah.',
                        headline: 'GEMINI_ACROSS_TAB_SWITCH',
                        description: 'Konsultasi klinikal',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response);
    });

    // Remount StrategyTab -> enhanced copy and notice are preserved on confidence, isolated from payday
    fireEvent.click(screen.getByTestId('switch-to-strategy'));
    expect(screen.getByTestId('strategy-enhance-notice')).toHaveTextContent(
      /Salinan dipertingkat oleh Gemini/i
    );
    const confInputs = screen.getByTestId('channel-facebook').querySelectorAll('input[type="text"]');
    expect((confInputs[0] as HTMLInputElement).value).toBe('GEMINI_ACROSS_TAB_SWITCH');

    fireEvent.click(screen.getByTestId('angle-payday'));
    expect(screen.queryByTestId('strategy-enhance-notice')).toBeNull();
    fireEvent.click(screen.getByTestId('angle-confidence'));
    expect(screen.getByTestId('strategy-enhance-notice')).toHaveTextContent(
      /Salinan dipertingkat oleh Gemini/i
    );
  });

  it('discards in-flight Gemini BYOK response cleanly when CampaignProvider unmounts mid-flight', async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(pendingFetch);

    function ProviderUnmountHarness() {
      const { loginWithGoogle, saveByokKey } = useWorkbench();
      return createElement(
        'div',
        null,
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'enable-byok-unmount',
            onClick: () => {
              loginWithGoogle('pro@studio.my');
              saveByokKey('AIzaSyValidKey1234567890', false);
            },
          },
          'enableByok'
        ),
        createElement(StrategyTab)
      );
    }

    const { unmount } = render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(ProviderUnmountHarness))
        )
      )
    );

    fireEvent.click(screen.getByTestId('enable-byok-unmount'));
    fireEvent.click(screen.getByRole('button', { name: /Gemini/i }));
    unmount();

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      facebook: {
                        primaryText: 'Salinan selepas provider dinyahlekap.',
                        headline: 'DISCARDED_ON_UNMOUNT',
                        description: 'Konsultasi klinikal',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response);
    });
  });

  it('resets compliance editor to Facebook primaryText when clicking Muat dari Teks Facebook / Load from Facebook Copy', () => {
    render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(StrategyHarness))
        )
      )
    );

    const fbPrimaryTextarea = screen
      .getByTestId('channel-facebook')
      .querySelector('textarea') as HTMLTextAreaElement;
    const complianceInput = screen.getByTestId('compliance-input') as HTMLTextAreaElement;
    expect(complianceInput.value).toBe(fbPrimaryTextarea.value);

    // Load risky copy -> flags appear
    fireEvent.click(screen.getByTestId('compliance-test-risky-btn'));
    expect(screen.getByTestId('compliance-findings').textContent).toMatch(
      /Meta Personal Attributes/i
    );
    expect(complianceInput.value).not.toBe(fbPrimaryTextarea.value);

    // Click Muat dari Teks Facebook -> restores Facebook primaryText & clears findings
    fireEvent.click(screen.getByRole('button', { name: /Muat dari Teks Facebook/i }));
    expect(complianceInput.value).toBe(fbPrimaryTextarea.value);
    expect(screen.getByTestId('compliance-status-badge').textContent).toMatch(/Lulus/i);

    // Toggle to EN -> button translates to Load from Facebook Copy and still resets manual edits
    fireEvent.click(screen.getByTestId('harness-toggle-en'));
    fireEvent.change(complianceInput, { target: { value: 'You have crooked teeth!' } });
    expect(screen.getByTestId('compliance-findings').textContent).toMatch(
      /Meta Personal Attributes/i
    );
    fireEvent.click(screen.getByRole('button', { name: /Load from Facebook Copy/i }));
    expect(complianceInput.value).toBe(fbPrimaryTextarea.value);
    expect(screen.getByTestId('compliance-status-badge').textContent).toMatch(/Pass/i);
  });

  it('resets isEnhancingStrategy immediately and discards stale Gemini response and notice when switching to Demo Mode mid-flight', async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(pendingFetch);

    function DemoSwitchMidFlightHarness() {
      const { loginWithGoogle, saveByokKey } = useWorkbench();
      const { isEnhancingStrategy, strategyEnhanceNoticeByAngle } = useCampaign();
      return createElement(
        'div',
        null,
        createElement(
          'span',
          { 'data-testid': 'is-enhancing-flag' },
          String(isEnhancingStrategy)
        ),
        createElement(
          'span',
          { 'data-testid': 'notice-map-json' },
          JSON.stringify(strategyEnhanceNoticeByAngle)
        ),
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'enable-byok-demo-switch',
            onClick: () => {
              loginWithGoogle('pro@studio.my');
              saveByokKey('AIzaSyValidKey1234567890', false);
            },
          },
          'enableByok'
        ),
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'switch-to-demo-midflight',
            onClick: () => saveByokKey('AIzaSyValidKey1234567890', true),
          },
          'switchDemo'
        ),
        createElement(StrategyTab)
      );
    }

    render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(DemoSwitchMidFlightHarness))
        )
      )
    );

    fireEvent.click(screen.getByTestId('enable-byok-demo-switch'));
    const enhanceBtn = screen.getByRole('button', { name: /Gemini/i });
    fireEvent.click(enhanceBtn);

    expect(screen.getByTestId('is-enhancing-flag').textContent).toBe('true');
    expect(enhanceBtn).toBeDisabled();

    // Switch to Demo Mode mid-flight -> resets isEnhancingStrategy immediately
    fireEvent.click(screen.getByTestId('switch-to-demo-midflight'));
    expect(screen.getByTestId('is-enhancing-flag').textContent).toBe('false');
    expect(screen.queryByRole('button', { name: /Gemini/i })).toBeNull();

    // Resolve stale pre-demo Gemini response -> must be discarded
    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      facebook: {
                        primaryText: 'Salinan basi sebelum mod demo bersama doktor bertauliah.',
                        headline: 'STALE_BEFORE_DEMO_MODE',
                        description: 'Konsultasi klinikal',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response);
    });

    expect(screen.getByTestId('is-enhancing-flag').textContent).toBe('false');
    expect(screen.queryByTestId('strategy-enhance-notice')).toBeNull();
    expect(screen.getByTestId('notice-map-json').textContent).toBe('{}');
    const fbInputs = screen.getByTestId('channel-facebook').querySelectorAll('input[type="text"]');
    expect((fbInputs[0] as HTMLInputElement).value).not.toBe('STALE_BEFORE_DEMO_MODE');
  });

  it('resets isEnhancingStrategy immediately on mid-flight byokKey rotation so a new request is not blocked and stale key response is discarded', async () => {
    let resolveFirstFetch!: (value: Response) => void;
    let resolveSecondFetch!: (value: Response) => void;
    const firstPending = new Promise<Response>((resolve) => {
      resolveFirstFetch = resolve;
    });
    const secondPending = new Promise<Response>((resolve) => {
      resolveSecondFetch = resolve;
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(firstPending)
      .mockReturnValueOnce(secondPending);

    function KeyRotateMidFlightHarness() {
      const { loginWithGoogle, saveByokKey } = useWorkbench();
      const { isEnhancingStrategy } = useCampaign();
      return createElement(
        'div',
        null,
        createElement(
          'span',
          { 'data-testid': 'is-enhancing-rotate' },
          String(isEnhancingStrategy)
        ),
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'set-key-one',
            onClick: () => {
              loginWithGoogle('pro@studio.my');
              saveByokKey('AIzaSyKeyOne1111111111', false);
            },
          },
          'setKeyOne'
        ),
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'rotate-key-two',
            onClick: () => saveByokKey('AIzaSyKeyTwo2222222222', false),
          },
          'rotateKeyTwo'
        ),
        createElement(StrategyTab)
      );
    }

    render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(KeyRotateMidFlightHarness))
        )
      )
    );

    fireEvent.click(screen.getByTestId('set-key-one'));
    const enhanceBtn = screen.getByRole('button', { name: /Gemini/i });
    fireEvent.click(enhanceBtn);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('is-enhancing-rotate').textContent).toBe('true');
    expect(enhanceBtn).toBeDisabled();

    // Rotate BYOK key mid-flight -> immediately resets loading state so new request is unblocked
    fireEvent.click(screen.getByTestId('rotate-key-two'));
    expect(screen.getByTestId('is-enhancing-rotate').textContent).toBe('false');
    expect(enhanceBtn).toBeEnabled();

    // Fire a second request with the rotated key while first fetch is still pending
    fireEvent.click(enhanceBtn);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('is-enhancing-rotate').textContent).toBe('true');
    expect(enhanceBtn).toBeDisabled();

    // Resolve stale Key 1 response -> must be discarded and must not clear Key 2's in-flight state
    await act(async () => {
      resolveFirstFetch({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      facebook: {
                        primaryText: 'Salinan lama kunci pertama bersama doktor bertauliah.',
                        headline: 'STALE_KEY_ONE_HEADLINE',
                        description: 'Konsultasi klinikal',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response);
    });

    expect(screen.getByTestId('is-enhancing-rotate').textContent).toBe('true');
    expect(enhanceBtn).toBeDisabled();
    expect(screen.queryByTestId('strategy-enhance-notice')).toBeNull();
    const fbInputsMid = screen.getByTestId('channel-facebook').querySelectorAll('input[type="text"]');
    expect((fbInputsMid[0] as HTMLInputElement).value).not.toBe('STALE_KEY_ONE_HEADLINE');

    // Resolve Key 2 response -> applied cleanly
    await act(async () => {
      resolveSecondFetch({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      facebook: {
                        primaryText: 'Salinan baharu kunci kedua bersama doktor bertauliah.',
                        headline: 'FRESH_KEY_TWO_HEADLINE',
                        description: 'Konsultasi klinikal',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response);
    });

    expect(screen.getByTestId('is-enhancing-rotate').textContent).toBe('false');
    expect(enhanceBtn).toBeEnabled();
    expect(screen.getByTestId('strategy-enhance-notice')).toHaveTextContent(
      /Salinan dipertingkat oleh Gemini/i
    );
    const fbInputsFinal = screen
      .getByTestId('channel-facebook')
      .querySelectorAll('input[type="text"]');
    expect((fbInputsFinal[0] as HTMLInputElement).value).toBe('FRESH_KEY_TWO_HEADLINE');
  });

  it('resets isEnhancingStrategy, clears strategyEnhanceNoticeByAngle, and discards stale response on mid-flight logout even after logging back in', async () => {
    let resolveSecondFetch!: (value: Response) => void;
    const secondPending = new Promise<Response>((resolve) => {
      resolveSecondFetch = resolve;
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      facebook: {
                        primaryText: 'Salinan payday awal bersama doktor bertauliah.',
                        headline: 'PAYDAY_BEFORE_LOGOUT',
                        description: 'Konsultasi klinikal',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response)
      .mockReturnValueOnce(secondPending);

    function LogoutMidFlightHarness() {
      const { loginWithGoogle, logout, saveByokKey } = useWorkbench();
      const { isEnhancingStrategy, strategyEnhanceNoticeByAngle, enhanceStrategyAngleWithGemini } =
        useCampaign();
      return createElement(
        'div',
        null,
        createElement(
          'span',
          { 'data-testid': 'is-enhancing-logout' },
          String(isEnhancingStrategy)
        ),
        createElement(
          'span',
          { 'data-testid': 'notice-map-logout' },
          JSON.stringify(strategyEnhanceNoticeByAngle)
        ),
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'login-byok-logout-test',
            onClick: () => {
              loginWithGoogle('pro@studio.my');
              saveByokKey('AIzaSyValidKey1234567890', false);
            },
          },
          'loginByok'
        ),
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'relogin-only',
            onClick: () => loginWithGoogle('pro@studio.my'),
          },
          'reloginOnly'
        ),
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'trigger-logout',
            onClick: () => logout(),
          },
          'logout'
        ),
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'direct-enhance-call',
            onClick: () => {
              void enhanceStrategyAngleWithGemini('confidence');
            },
          },
          'directEnhance'
        ),
        createElement(StrategyTab)
      );
    }

    render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(LogoutMidFlightHarness))
        )
      )
    );

    fireEvent.click(screen.getByTestId('login-byok-logout-test'));

    // First complete a payday enhancement so strategyEnhanceNoticeByAngle is populated
    fireEvent.click(screen.getByTestId('angle-payday'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Gemini/i }));
    });
    expect(screen.getByTestId('strategy-enhance-notice')).toHaveTextContent(
      /Salinan dipertingkat oleh Gemini/i
    );
    expect(screen.getByTestId('notice-map-logout').textContent).toBe('{"payday":"gemini"}');

    // Start a second mid-flight enhancement on confidence
    fireEvent.click(screen.getByTestId('angle-confidence'));
    const enhanceBtn = screen.getByRole('button', { name: /Gemini/i });
    fireEvent.click(enhanceBtn);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('is-enhancing-logout').textContent).toBe('true');
    expect(enhanceBtn).toBeDisabled();

    // Log out mid-flight -> resets isEnhancingStrategy and clears strategyEnhanceNoticeByAngle
    fireEvent.click(screen.getByTestId('trigger-logout'));
    expect(screen.getByTestId('is-enhancing-logout').textContent).toBe('false');
    expect(screen.getByTestId('notice-map-logout').textContent).toBe('{}');
    expect(enhanceBtn).toBeEnabled();

    // Direct invocation while logged out must bail out early without calling fetch
    fireEvent.click(screen.getByTestId('direct-enhance-call'));
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Log back in without reloading
    fireEvent.click(screen.getByTestId('relogin-only'));
    expect(screen.getByTestId('is-enhancing-logout').textContent).toBe('false');
    expect(screen.getByTestId('notice-map-logout').textContent).toBe('{}');

    // Resolve the stale pre-logout response -> must still be discarded after re-login
    await act(async () => {
      resolveSecondFetch({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      facebook: {
                        primaryText: 'Salinan basi sebelum log keluar bersama doktor bertauliah.',
                        headline: 'STALE_LOGOUT_HEADLINE',
                        description: 'Konsultasi klinikal',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response);
    });

    expect(screen.getByTestId('is-enhancing-logout').textContent).toBe('false');
    expect(screen.queryByTestId('strategy-enhance-notice')).toBeNull();
    expect(screen.getByTestId('notice-map-logout').textContent).toBe('{}');
    const fbInputs = screen.getByTestId('channel-facebook').querySelectorAll('input[type="text"]');
    expect((fbInputs[0] as HTMLInputElement).value).not.toBe('STALE_LOGOUT_HEADLINE');
  });

  it('flags >90 char RSA D1/D2 over-limit, live-syncs Facebook primaryText to Compliance until user edits compliance, copies edited IG/TikTok payloads, and translates 0% close-rate CPA note', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    render(
      createElement(
        I18nProvider,
        null,
        createElement(
          WorkbenchProvider,
          null,
          createElement(CampaignProvider, null, createElement(StrategyHarness))
        )
      )
    );

    // 1. RSA D1 & D2 >90-char over-limit warning + border-rose-500 without clamping
    const rsaCard = screen.getByTestId('channel-google_rsa');
    const d1Textarea = screen.getByLabelText('D1') as HTMLTextAreaElement;
    const d2Textarea = screen.getByLabelText('D2') as HTMLTextAreaElement;
    const text95 = 'A'.repeat(95);
    fireEvent.change(d1Textarea, { target: { value: text95 } });
    expect(d1Textarea.value).toBe(text95);
    expect(d1Textarea.className).toContain('border-rose-500');
    expect(rsaCard.textContent).toMatch(/95\/90\s*\(Melebihi had\)/i);

    fireEvent.change(d2Textarea, { target: { value: 'B'.repeat(92) } });
    expect(d2Textarea.className).toContain('border-rose-500');
    expect(rsaCard.textContent).toMatch(/92\/90\s*\(Melebihi had\)/i);

    // 2. Live FB primaryText -> Compliance auto-sync when complianceEditedByUser === false
    const fbTextarea = screen
      .getByTestId('channel-facebook')
      .querySelector('textarea') as HTMLTextAreaElement;
    const complianceInput = screen.getByTestId('compliance-input') as HTMLTextAreaElement;
    fireEvent.change(fbTextarea, {
      target: { value: 'Gigi anda kuning! 100% dijamin!' },
    });
    expect(complianceInput.value).toBe('Gigi anda kuning! 100% dijamin!');
    expect(screen.getByTestId('compliance-status-badge').textContent).toMatch(/Amaran Dikesan/i);

    // Once user edits compliance directly, FB edits no longer overwrite complianceInput
    fireEvent.change(complianceInput, {
      target: { value: 'Teks pematuhan tersuai pengguna bersama doktor bertauliah.' },
    });
    fireEvent.change(fbTextarea, {
      target: { value: 'Suntingan Facebook tidak menimpa compliance' },
    });
    expect(complianceInput.value).toBe(
      'Teks pematuhan tersuai pengguna bersama doktor bertauliah.'
    );

    // 3. Edited Instagram caption & hashtags propagate to Quick-Copy
    const igCard = screen.getByTestId('channel-instagram');
    const igCaption = igCard.querySelector('textarea') as HTMLTextAreaElement;
    const igHashtags = igCard.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(igCaption, { target: { value: 'Kapsyen IG Suntingan Tier 5' } });
    fireEvent.change(igHashtags, { target: { value: '#KlinikGigiTier5 #SenyumBersih' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-btn-instagram'));
    });
    const igCopied = String(writeTextMock.mock.calls[0][0]);
    expect(igCopied).toContain('Kapsyen IG Suntingan Tier 5');
    expect(igCopied).toContain('#KlinikGigiTier5 #SenyumBersih');
    expect(igCopied).toContain('https://wa.me/');

    // 4. Edited TikTok hook, script, and caption propagate to Quick-Copy
    const ttCard = screen.getByTestId('channel-tiktok');
    const ttHook = ttCard.querySelector('input[type="text"]') as HTMLInputElement;
    const ttTextareas = ttCard.querySelectorAll('textarea');
    const ttScript = ttTextareas[0] as HTMLTextAreaElement;
    const ttCaption = ttTextareas[1] as HTMLTextAreaElement;
    fireEvent.change(ttHook, { target: { value: 'Hook TikTok Tier 5' } });
    fireEvent.change(ttScript, { target: { value: 'Skrip TikTok Tier 5' } });
    fireEvent.change(ttCaption, { target: { value: 'Kapsyen TikTok Tier 5' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-btn-tiktok'));
    });
    const ttCopied = String(writeTextMock.mock.calls[1][0]);
    expect(ttCopied).toContain('Hook TikTok Tier 5');
    expect(ttCopied).toContain('Skrip TikTok Tier 5');
    expect(ttCopied).toContain('Kapsyen TikTok Tier 5');
    expect(ttCopied).toContain('https://wa.me/');

    // 5. CPA 0% close-rate note translates cleanly across BM <-> EN
    fireEvent.change(screen.getByTestId('cpa-close-rate-input'), { target: { value: '0' } });
    expect(screen.getByTestId('cpa-guardrail').textContent).toContain('Kadar tutup 0%');

    fireEvent.click(screen.getByTestId('harness-toggle-en'));
    expect(screen.getByTestId('cpa-guardrail').textContent).toContain('Close rate is 0%');
    expect(rsaCard.textContent).toMatch(/95\/90\s*\(Over limit\)/i);
  });
});
