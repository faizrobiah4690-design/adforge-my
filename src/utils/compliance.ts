import type { ComplianceFinding } from '../types/campaign';

export const RISKY_COMPLIANCE_SAMPLE =
  'Gigi anda kuning dan berkarang? Klinik terbaik No. 1 di Malaysia, dijamin 100% putih dengan testimoni sebelum dan selepas!';

const META_PERSONAL_ATTR_RX =
  /\b(?:gigi\s+anda\s+(?:kuning|rosak|berkarat|berlubang|berkarang|kotor|bermasalah)|(?:nafas|mulut)\s+anda\s+berbau|masalah\s+gigi\s+anda|anda\s+(?:mengalami|menghidap|menderita|malu\s+dengan|sering\s+sakit)|are\s+you\s+suffering(?:\s+from)?|do\s+you\s+have\s+(?:yellow|crooked|stained|damaged|bad\s+breath)|your\s+(?:yellow|crooked|stained|damaged)\s+teeth|you\s+have\s+(?:bad\s+breath|(?:yellow|crooked|stained|damaged)\s+teeth)|bad\s+breath)\b/i;

const OUTCOME_GUARANTEE_RX =
  /(?:\b(?:dijamin|gerenti|guaranteed|permanent\s+cure|sembuh\s+sepenuhnya|pasti\s+(?:putih|sembuh|hilang)|confirm\s+(?:putih|sembuh))\b|(?<!\d)100\s*%)/i;

const SUPERLATIVE_RX =
  /(?:\b(?:terbaik|nombor\s*(?:satu|1)|paling\s+(?:murah|hebat|bagus|berkesan|popular)|termurah|best\s+(?:dentist|clinic|dental)|cheapest(?:\s+dentist)?|number\s+one)\b|\bno\.?\s*1\b|(?<!\w)#1\b)/i;

const BEFORE_AFTER_RX =
  /\b(?:sebelum\s*(?:dan|&)\s*selepas|before\s*(?:and|&)\s*after|testimoni\s+pesakit|patient\s+testimonial|transformasi\s+segera|putih\s+dalam\s+1\s+sesi)\b/i;

const CLINICAL_TERM_RX =
  /\b(?:klinik|gigi|pergigian|dental|dentist|pemutihan|whitening|scaling|penskaleran|braces|implan|veneer|rawatan)\b/i;

const PROMO_CLAIM_RX =
  /\b(?:promosi|promo|diskaun|discount|murah|servis|pakej|package|rawat|putih|sembuh|tawaran|offer|jimat|slot)\b/i;

const KKLIU_OR_CONSULTATION_ANCHOR_RX =
  /\b(?:kkliu|konsultasi|rundingan|pemeriksaan\s+klinikal|doktor\s+(?:pergigian\s+)?bertauliah|qualified\s+dentist|pengamal\s+pergigian)\b/i;

export function checkCopyCompliance(text: string): ComplianceFinding[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const findings: ComplianceFinding[] = [];

  const metaMatch = trimmed.match(META_PERSONAL_ATTR_RX);
  if (metaMatch) {
    findings.push({
      id: 'meta-personal-attributes',
      category: 'meta_personal_attributes',
      severity: 'high',
      matchedText: metaMatch[0],
      ruleKey: 'tab1.complianceRuleMeta',
      suggestionKey: 'tab1.complianceSuggestMeta',
    });
  }

  const outcomeMatch = trimmed.match(OUTCOME_GUARANTEE_RX);
  if (outcomeMatch) {
    findings.push({
      id: 'my-outcome-guarantee',
      category: 'my_healthcare_norm',
      severity: 'high',
      matchedText: outcomeMatch[0],
      ruleKey: 'tab1.complianceRuleOutcome',
      suggestionKey: 'tab1.complianceSuggestOutcome',
    });
  }

  const superlativeMatch = trimmed.match(SUPERLATIVE_RX);
  if (superlativeMatch) {
    findings.push({
      id: 'my-superlative',
      category: 'my_healthcare_norm',
      severity: 'warning',
      matchedText: superlativeMatch[0].trim(),
      ruleKey: 'tab1.complianceRuleSuperlative',
      suggestionKey: 'tab1.complianceSuggestSuperlative',
    });
  }

  const beforeAfterMatch = trimmed.match(BEFORE_AFTER_RX);
  if (beforeAfterMatch) {
    findings.push({
      id: 'my-before-after',
      category: 'my_healthcare_norm',
      severity: 'warning',
      matchedText: beforeAfterMatch[0],
      ruleKey: 'tab1.complianceRuleBeforeAfter',
      suggestionKey: 'tab1.complianceSuggestBeforeAfter',
    });
  }

  if (
    CLINICAL_TERM_RX.test(trimmed) &&
    PROMO_CLAIM_RX.test(trimmed) &&
    !KKLIU_OR_CONSULTATION_ANCHOR_RX.test(trimmed)
  ) {
    findings.push({
      id: 'my-kkliu-notice',
      category: 'my_healthcare_norm',
      severity: 'warning',
      matchedText: 'Tiada rujukan konsultasi klinikal / KKLIU',
      ruleKey: 'tab1.complianceRuleKkliu',
      suggestionKey: 'tab1.complianceSuggestKkliu',
    });
  }

  return findings;
}

export function rewriteSafeCopy(
  text: string,
  brandName: string = 'Klinik Gigi Impian'
): string {
  const rawBrand = brandName.trim() || 'Klinik Gigi Impian';
  const safeBrand =
    checkCopyCompliance(rawBrand).length > 0 ||
    /100\s*%|terbaik|dijamin|kuning|gerenti|guaranteed|cheapest|no\.?\s*1|(?<!\w)#1\b/i.test(
      rawBrand
    )
      ? 'klinik pergigian kami'
      : rawBrand;
  let cleaned = text.trim();

  if (!cleaned) {
    return `Penjagaan kebersihan gigi & konsultasi profesional di ${safeBrand} bersama doktor pergigian bertauliah (patuh KKLIU).`;
  }

  // Neutralize Meta personal attributes
  cleaned = cleaned
    .replace(
      /\bgigi\s+anda\s+(?:kuning|rosak|berkarat|berlubang|berkarang|kotor|bermasalah)(?:\s+dan\s+(?:kuning|rosak|berkarat|berlubang|berkarang|kotor|bermasalah))?/gi,
      'Ingin menjaga kebersihan gigi secara berkala'
    )
    .replace(/\b(?:nafas|mulut)\s+anda\s+berbau/gi, 'Ingin kesegaran nafas harian')
    .replace(/\bmasalah\s+gigi\s+anda/gi, 'keperluan penjagaan gigi')
    .replace(
      /\banda\s+(?:mengalami|menghidap|menderita|malu\s+dengan|sering\s+sakit)[^.!?\n,;]*/gi,
      'Sedang merancang pemeriksaan gigi berkala'
    )
    .replace(
      /\bare\s+you\s+suffering(?:\s+from)?[^.!?\n,;]*/gi,
      'Looking for routine oral hygiene care'
    )
    .replace(/\bdo\s+you\s+have\s+(?:yellow|crooked|stained|damaged|bad\s+breath)[^.!?\n,;]*/gi, 'Looking for routine dental care')
    .replace(/\byour\s+(?:yellow|crooked|stained|damaged)\s+teeth/gi, 'routine dental care')
    .replace(/\byou\s+have\s+(?:bad\s+breath|(?:yellow|crooked|stained|damaged)\s+teeth)/gi, 'routine dental care')
    .replace(/\bbad\s+breath\b/gi, 'oral freshness');

  // Neutralize outcome guarantees & superlatives & before/after claims
  cleaned = cleaned
    .replace(
      /(?:\b(?:dijamin|gerenti|guaranteed|pasti|confirm)\b\s*)?(?<!\d)100\s*%(?:\s*\b(?:putih|sembuh|hilang|berkesan|selamat|dijamin|guaranteed)\b)?/gi,
      'dirancang mengikut penilaian klinikal'
    )
    .replace(
      /\b(?:dijamin|gerenti|guaranteed|permanent\s+cure|sembuh\s+sepenuhnya|pasti\s+(?:putih|sembuh|hilang)|confirm\s+(?:putih|sembuh))\b/gi,
      'dirancang mengikut kesesuaian pesakit'
    )
    .replace(
      /\bterbaik(?:\s+(?:no\.?\s*1|nombor\s*(?:satu|1)|#1))?(?:\s+di\s+malaysia)?\b/gi,
      'dipercayai ramai'
    )
    .replace(/\b(?:nombor\s*(?:satu|1)|no\.?\s*1)\b/gi, 'berpengalaman')
    .replace(/(?<!\w)#1\b/gi, 'berpengalaman')
    .replace(
      /\b(?:paling\s+(?:murah|hebat|bagus|berkesan|popular)|termurah|best\s+(?:dentist|clinic|dental)|cheapest(?:\s+dentist)?|number\s+one)\b/gi,
      'berfokus pada keselesaan pesakit'
    )
    .replace(
      /\b(?:dengan\s+)?(?:testimoni\s+)?(?:sebelum\s*(?:dan|&)\s*selepas|before\s*(?:and|&)\s*after|testimoni\s+pesakit|patient\s+testimonial|transformasi\s+segera|putih\s+dalam\s+1\s+sesi)\b/gi,
      'berpandukan pemeriksaan klinikal'
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();

  if (!KKLIU_OR_CONSULTATION_ANCHOR_RX.test(cleaned)) {
    const suffix = `Tempah sesi konsultasi bersama doktor pergigian bertauliah di ${safeBrand} (patuh KKLIU).`;
    cleaned = cleaned.endsWith('.') || cleaned.endsWith('!') || cleaned.endsWith('?')
      ? `${cleaned} ${suffix}`
      : `${cleaned}. ${suffix}`;
  }

  if (checkCopyCompliance(cleaned).length > 0) {
    return `Penjagaan penskaleran & kebersihan mulut yang selesa di ${safeBrand}. Tempah sesi konsultasi bersama doktor pergigian bertauliah (patuh KKLIU).`;
  }

  return cleaned;
}
