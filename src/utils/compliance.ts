import type { ComplianceFinding } from '../types/campaign';

export const RISKY_COMPLIANCE_SAMPLE =
  'Anda ada masalah kulit kusam atau kewangan? Produk terbaik No. 1 di Malaysia, dijamin 100% berkesan serta-merta dengan testimoni sebelum dan selepas!';

const META_PERSONAL_ATTR_RX =
  /\b(?:(?:kulit|wajah|badan|rambut|kewangan|bisnes|hidup)\s+anda\s+(?:kusam|rosak|bermasalah|teruk|gagal|lemah|berhutang)|masalah\s+(?:peribadi|kewangan|kesihatan|kulit|berat\s+badan)\s+anda|anda\s+(?:ada\s+masalah|mengalami|menghidap|menderita|malu\s+dengan|sering\s+sakit|bermasalah|gemuk|kurus|botak|berhutang)|are\s+you\s+suffering(?:\s+from)?|do\s+you\s+have\s+(?:debt|acne|hair\s+loss|bad|poor|low)|your\s+(?:bad|broken|failing|ugly|damaged)\s+(?:skin|credit|finances|business|hair|body)|you\s+have\s+(?:bad\s+credit|acne|hair\s+loss|debt))\b/i;

const OUTCOME_GUARANTEE_RX =
  /(?:\b(?:dijamin|gerenti|guaranteed|permanent\s+results?|pasti\s+(?:berjaya|berkesan|untung|hilang|selesai|putih|sembuh)|confirm\s+(?:berjaya|berkesan|untung|jadi)|kesan\s+(?:serta[- ]merta|ajaib|kekal)|instant\s+(?:miracle|results?))\b|(?<!\d)100\s*%)/i;

const SUPERLATIVE_RX =
  /(?:\b(?:terbaik|nombor\s*(?:satu|1)|paling\s+(?:murah|hebat|bagus|berkesan|popular|laris)|termurah|best\s+(?:in\s+malaysia|brand|shop|product|service)|cheapest(?:\s+(?:in\s+malaysia|price|deal))?|number\s+one)\b|\bno\.?\s*1\b|(?<!\w)#1\b)/i;

const BEFORE_AFTER_RX =
  /\b(?:sebelum\s*(?:dan|&)\s*selepas|before\s*(?:and|&)\s*after|transformasi\s+segera|hasil\s+dalam\s+1\s+hari)\b/i;

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
      category: 'my_advertising_norm',
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
      category: 'my_advertising_norm',
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
      category: 'my_advertising_norm',
      severity: 'warning',
      matchedText: beforeAfterMatch[0],
      ruleKey: 'tab1.complianceRuleBeforeAfter',
      suggestionKey: 'tab1.complianceSuggestBeforeAfter',
    });
  }

  return findings;
}

export function rewriteSafeCopy(
  text: string,
  brandName: string = 'Bisnes Saya'
): string {
  const rawBrand = brandName.trim() || 'Bisnes Saya';
  const safeBrand =
    checkCopyCompliance(rawBrand).length > 0 ||
    /100\s*%|terbaik|dijamin|gerenti|guaranteed|cheapest|no\.?\s*1|(?<!\w)#1\b/i.test(
      rawBrand
    )
      ? 'jenama kami'
      : rawBrand;
  let cleaned = text.trim();

  if (!cleaned) {
    return `Tawaran produk dan servis berkualiti di ${safeBrand}. Hubungi kami melalui WhatsApp untuk maklumat lanjut.`;
  }

  // Neutralize Meta personal attributes
  cleaned = cleaned
    .replace(
      /\b(?:kulit|wajah|badan|rambut|kewangan|bisnes|hidup)\s+anda\s+(?:kusam|rosak|bermasalah|teruk|gagal|lemah|berhutang)(?:\s+atau\s+\w+)?/gi,
      'Sedang mencari pilihan yang lebih baik untuk keperluan harian anda'
    )
    .replace(
      /\bmasalah\s+(?:peribadi|kewangan|kesihatan|kulit|berat\s+badan)\s+anda(?:\s+atau\s+\w+)?/gi,
      'keperluan anda'
    )
    .replace(
      /\banda\s+(?:ada\s+masalah[^.!?\n,;]*|(?:mengalami|menghidap|menderita|malu\s+dengan|sering\s+sakit|bermasalah|gemuk|kurus|botak|berhutang)[^.!?\n,;]*)/gi,
      'Sedang mencari penyelesaian praktikal untuk keperluan anda'
    )
    .replace(
      /\bare\s+you\s+suffering(?:\s+from)?[^.!?\n,;]*/gi,
      'Looking for a practical solution for your needs'
    )
    .replace(
      /\bdo\s+you\s+have\s+(?:debt|acne|hair\s+loss|bad|poor|low)[^.!?\n,;]*/gi,
      'Looking for reliable everyday solutions'
    )
    .replace(
      /\byour\s+(?:bad|broken|failing|ugly|damaged)\s+(?:skin|credit|finances|business|hair|body)/gi,
      'your everyday goals'
    )
    .replace(
      /\byou\s+have\s+(?:bad\s+credit|acne|hair\s+loss|debt)/gi,
      'seeking better everyday options'
    );

  // Neutralize outcome guarantees, superlatives, and unrealistic claims
  cleaned = cleaned
    .replace(
      /(?:\b(?:dijamin|gerenti|guaranteed|pasti|confirm)\b\s*)?(?<!\d)100\s*%(?:\s*\b(?:berkesan|berjaya|untung|hilang|selamat|putih|sembuh|dijamin|guaranteed)\b)?/gi,
      'direka untuk nilai berbaloi'
    )
    .replace(
      /\b(?:dijamin|gerenti|guaranteed|permanent\s+results?|pasti\s+(?:berjaya|berkesan|untung|hilang|selesai|putih|sembuh)|confirm\s+(?:berjaya|berkesan|untung|jadi)|kesan\s+(?:serta[- ]merta|ajaib|kekal)|instant\s+(?:miracle|results?))\b/gi,
      'direka untuk kualiti konsisten'
    )
    .replace(
      /\bterbaik(?:\s+(?:no\.?\s*1|nombor\s*(?:satu|1)|#1))?(?:\s+di\s+malaysia)?\b/gi,
      'dipercayai ramai'
    )
    .replace(/\b(?:nombor\s*(?:satu|1)|no\.?\s*1)\b/gi, 'berpengalaman')
    .replace(/(?<!\w)#1\b/gi, 'berpengalaman')
    .replace(
      /\b(?:paling\s+(?:murah|hebat|bagus|berkesan|popular|laris)|termurah|best\s+(?:in\s+malaysia|brand|shop|product|service)|cheapest(?:\s+(?:in\s+malaysia|price|deal))?|number\s+one)\b/gi,
      'berfokus pada kepuasan pelanggan'
    )
    .replace(
      /\b(?:dengan\s+)?(?:testimoni\s+)?(?:sebelum\s*(?:dan|&)\s*selepas|before\s*(?:and|&)\s*after|transformasi\s+segera|hasil\s+dalam\s+1\s+hari)\b/gi,
      'berdasarkan maklum balas pelanggan'
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();

  if (checkCopyCompliance(cleaned).length > 0) {
    return `Produk dan servis berkualiti di ${safeBrand}. Hubungi kami melalui WhatsApp untuk maklumat lanjut.`;
  }

  return cleaned;
}
