import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const LOGO_PATH = path.join(PROJECT_ROOT, 'public', 'assets', 'brands', 'klinik-gigi-impian-logo.png');
const PHOTO_SCALING_PATH = path.join(PROJECT_ROOT, 'public', 'assets', 'photos', 'clinic-scaling-1.png');
const PHOTO_SMILE_PATH = path.join(PROJECT_ROOT, 'public', 'assets', 'photos', 'clinic-smile-2.png');
const PHOTO_CHAIR_PATH = path.join(PROJECT_ROOT, 'public', 'assets', 'photos', 'clinic-chair-3.png');
const GUIDE_VIDEO_PATH = path.join(PROJECT_ROOT, 'public', 'assets', 'guide', 'byok-guide.webm');
const FALLBACK_WAV_PATH = path.join(PROJECT_ROOT, 'public', 'assets', 'audio', 'fallback-jingle.wav');

const CACHED_CHROMIUM_1223 = path.join(
  process.env.LOCALAPPDATA || '',
  'ms-playwright',
  'chromium-1223',
  'chrome-win64',
  'chrome.exe'
);

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    if (fs.existsSync(CACHED_CHROMIUM_1223)) {
      return await chromium.launch({ executablePath: CACHED_CHROMIUM_1223, headless: true });
    }
    return await chromium.launch({ headless: true });
  }
}

function generateFallbackJingleWav(outPath) {
  ensureDir(outPath);
  const sampleRate = 48000;
  const channels = 2;
  const bitsPerSample = 16;
  const durationSec = 5.5;
  const totalFrames = Math.round(sampleRate * durationSec);
  const dataSize = totalFrames * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const chords = [
    { start: 0.0, end: 1.375, root: 130.81, notes: [261.63, 329.63, 392.0, 493.88] }, // Cmaj7
    { start: 1.375, end: 2.75, root: 110.0, notes: [220.0, 261.63, 329.63, 392.0] }, // Am7
    { start: 2.75, end: 4.125, root: 87.31, notes: [174.61, 220.0, 261.63, 329.63] }, // Fmaj7
    { start: 4.125, end: 5.5, root: 98.0, notes: [196.0, 246.94, 293.66, 329.63] }, // G6
  ];

  const left = new Float64Array(totalFrames);
  const right = new Float64Array(totalFrames);
  const arpStepSec = 0.171875;

  for (let i = 0; i < totalFrames; i += 1) {
    const t = i / sampleRate;
    const chord = chords.find((c) => t >= c.start && t < c.end) ?? chords[chords.length - 1];
    const localT = t - chord.start;
    const chordLen = chord.end - chord.start;

    const padEnv = Math.min(1, localT / 0.08) * Math.min(1, (chordLen - localT) / 0.12);
    const bassEnv = Math.exp(-localT * 2.2) * 0.42;
    const bassSample = Math.sin(2 * Math.PI * chord.root * t) * bassEnv;

    let padL = 0;
    let padR = 0;
    for (let n = 0; n < chord.notes.length; n += 1) {
      const freq = chord.notes[n];
      const pan = n % 2 === 0 ? 0.65 : 0.35;
      const osc =
        (Math.sin(2 * Math.PI * freq * t) * 0.7 +
          Math.sin(2 * Math.PI * freq * 2 * t) * 0.15) *
        0.14 *
        padEnv;
      padL += osc * pan;
      padR += osc * (1 - pan);
    }

    const arpIdx = Math.floor(localT / arpStepSec);
    const arpLocal = localT - arpIdx * arpStepSec;
    const arpFreq = chord.notes[arpIdx % chord.notes.length] * 2;
    const arpEnv = Math.exp(-arpLocal * 11.0) * Math.min(1, arpLocal / 0.008);
    const arpTone =
      (Math.sin(2 * Math.PI * arpFreq * t) + 0.3 * Math.sin(2 * Math.PI * arpFreq * 2 * t)) *
      0.24 *
      arpEnv;
    const arpPan = 0.5 + 0.25 * Math.sin(arpIdx * 1.4);

    const masterFade = Math.min(1, t / 0.05) * Math.min(1, (durationSec - t) / 0.22);

    left[i] = (bassSample + padL + arpTone * (1 - arpPan)) * masterFade;
    right[i] = (bassSample + padR + arpTone * arpPan) * masterFade;
  }

  let maxPeak = 0;
  for (let i = 0; i < totalFrames; i += 1) {
    maxPeak = Math.max(maxPeak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const scale = maxPeak > 0 ? 0.85 / maxPeak : 1;

  for (let i = 0; i < totalFrames; i += 1) {
    const lInt = Math.max(-32767, Math.min(32767, Math.round(left[i] * scale * 32767)));
    const rInt = Math.max(-32767, Math.min(32767, Math.round(right[i] * scale * 32767)));
    const offset = 44 + i * 4;
    buffer.writeInt16LE(lInt, offset);
    buffer.writeInt16LE(rInt, offset + 2);
  }

  fs.writeFileSync(outPath, buffer);
}

function logoHtml() {
  return `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:transparent;width:512px;height:512px;overflow:hidden;">
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0EA5E9" />
        <stop offset="55%" stop-color="#0284C7" />
        <stop offset="100%" stop-color="#0F172A" />
      </linearGradient>
      <linearGradient id="toothGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" />
        <stop offset="100%" stop-color="#E0F2FE" />
      </linearGradient>
      <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#38BDF8" />
        <stop offset="100%" stop-color="#2DD4BF" />
      </linearGradient>
    </defs>

    <rect x="28" y="28" width="456" height="456" rx="108" fill="url(#bgGrad)" />
    <rect x="36" y="36" width="440" height="440" rx="100" fill="none" stroke="#BAE6FD" stroke-opacity="0.35" stroke-width="3" />

    <circle cx="256" cy="212" r="134" fill="#38BDF8" fill-opacity="0.16" />

    <path d="M188 148
             C160 148, 142 174, 146 212
             C150 250, 168 308, 186 332
             C197 346, 212 342, 220 318
             L234 274
             C240 256, 272 256, 278 274
             L292 318
             C300 342, 315 346, 326 332
             C344 308, 362 250, 366 212
             C370 174, 352 148, 324 148
             C302 148, 282 162, 256 162
             C230 162, 210 148, 188 148 Z"
          fill="url(#toothGrad)" />

    <path d="M198 220 Q256 266 314 220" fill="none" stroke="url(#accentGrad)" stroke-width="11" stroke-linecap="round" />

    <path d="M358 118 L366 142 L390 150 L366 158 L358 182 L350 158 L326 150 L350 142 Z" fill="#FDE047" />
    <circle cx="152" cy="134" r="8" fill="#7DD3FC" />

    <text x="256" y="400" text-anchor="middle" fill="#FFFFFF" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="31" letter-spacing="2">KLINIK GIGI</text>
    <text x="256" y="436" text-anchor="middle" fill="#7DD3FC" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="25" letter-spacing="5">IMPIAN</text>
  </svg>
</body>
</html>`;
}

function clinicScalingHtml() {
  return `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;width:1080px;height:1350px;overflow:hidden;background:#07131E;">
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <defs>
      <radialGradient id="topGlow" cx="52%" cy="22%" r="65%">
        <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.55" />
        <stop offset="48%" stop-color="#0E7490" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#07131E" stop-opacity="1" />
      </radialGradient>
      <linearGradient id="glassPane" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#E0F2FE" stop-opacity="0.20" />
        <stop offset="100%" stop-color="#0EA5E9" stop-opacity="0.04" />
      </linearGradient>
      <linearGradient id="enamel" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#F8FAFC" />
        <stop offset="65%" stop-color="#E0F2FE" />
        <stop offset="100%" stop-color="#BAE6FD" />
      </linearGradient>
      <filter id="softBlur" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="28" />
      </filter>
    </defs>

    <rect width="1080" height="1350" fill="#07131E" />
    <rect width="1080" height="1350" fill="url(#topGlow)" />

    <rect x="190" y="96" width="700" height="22" rx="11" fill="#E0F2FE" fill-opacity="0.85" />
    <rect x="250" y="114" width="580" height="65" rx="32" fill="#38BDF8" fill-opacity="0.26" filter="url(#softBlur)" />

    <circle cx="220" cy="430" r="140" fill="#2DD4BF" fill-opacity="0.18" filter="url(#softBlur)" />
    <circle cx="880" cy="520" r="170" fill="#38BDF8" fill-opacity="0.22" filter="url(#softBlur)" />
    <circle cx="540" cy="700" r="240" fill="#0284C7" fill-opacity="0.20" filter="url(#softBlur)" />

    <polygon points="110,250 970,180 970,1180 110,1240" fill="url(#glassPane)" stroke="#7DD3FC" stroke-opacity="0.16" stroke-width="2" />

    <path d="M350 470
             C275 470, 225 538, 238 638
             C252 745, 298 898, 344 962
             C374 1002, 412 992, 434 926
             L470 812
             C488 762, 592 762, 610 812
             L646 926
             C668 992, 706 1002, 736 962
             C782 898, 828 745, 842 638
             C855 538, 805 470, 730 470
             C668 470, 614 508, 540 508
             C466 508, 412 470, 350 470 Z"
          fill="url(#enamel)" fill-opacity="0.92" />

    <path d="M180 860 C380 780, 690 930, 920 800" fill="none" stroke="#67E8F9" stroke-width="8" stroke-opacity="0.48" />
    <path d="M150 915 C410 825, 710 985, 950 855" fill="none" stroke="#2DD4BF" stroke-width="5" stroke-opacity="0.35" />

    <circle cx="760" cy="400" r="26" fill="#E0F2FE" fill-opacity="0.45" />
    <circle cx="815" cy="360" r="14" fill="#A5F3FC" fill-opacity="0.55" />
    <circle cx="300" cy="410" r="18" fill="#5EEAD4" fill-opacity="0.42" />
    <circle cx="670" cy="1060" r="22" fill="#BAE6FD" fill-opacity="0.32" />

    <rect x="0" y="1090" width="1080" height="260" fill="#040A12" fill-opacity="0.72" />
  </svg>
</body>
</html>`;
}

function clinicSmileHtml() {
  return `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;width:1080px;height:1350px;overflow:hidden;background:#091526;">
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <defs>
      <radialGradient id="smileAura" cx="50%" cy="46%" r="62%">
        <stop offset="0%" stop-color="#7DD3FC" stop-opacity="0.48" />
        <stop offset="45%" stop-color="#1D4ED8" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#091526" stop-opacity="1" />
      </radialGradient>
      <linearGradient id="pearlArc" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#E0F2FE" />
        <stop offset="50%" stop-color="#FFFFFF" />
        <stop offset="100%" stop-color="#BAE6FD" />
      </linearGradient>
      <filter id="bokehBlur" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="32" />
      </filter>
    </defs>

    <rect width="1080" height="1350" fill="#091526" />
    <rect width="1080" height="1350" fill="url(#smileAura)" />

    <circle cx="290" cy="360" r="175" fill="#FDE68A" fill-opacity="0.16" filter="url(#bokehBlur)" />
    <circle cx="805" cy="400" r="195" fill="#38BDF8" fill-opacity="0.24" filter="url(#bokehBlur)" />
    <circle cx="540" cy="840" r="260" fill="#60A5FA" fill-opacity="0.18" filter="url(#bokehBlur)" />

    <circle cx="540" cy="605" r="345" fill="none" stroke="#BAE6FD" stroke-opacity="0.22" stroke-width="3" />
    <circle cx="540" cy="605" r="265" fill="none" stroke="#7DD3FC" stroke-opacity="0.28" stroke-width="2" />

    <path d="M235 615 Q540 895 845 615 Q540 775 235 615 Z" fill="url(#pearlArc)" fill-opacity="0.94" />
    <path d="M285 685 Q540 890 795 685" fill="none" stroke="#38BDF8" stroke-width="10" stroke-linecap="round" stroke-opacity="0.7" />

    <path d="M540 270 L554 318 L602 332 L554 346 L540 394 L526 346 L478 332 L526 318 Z" fill="#FEF08A" fill-opacity="0.88" />
    <path d="M775 435 L784 462 L811 471 L784 480 L775 507 L766 480 L739 471 L766 462 Z" fill="#E0F2FE" fill-opacity="0.82" />
    <path d="M305 465 L312 486 L333 493 L312 500 L305 521 L298 500 L277 493 L298 486 Z" fill="#A5F3FC" fill-opacity="0.78" />

    <circle cx="205" cy="850" r="24" fill="#93C5FD" fill-opacity="0.34" />
    <circle cx="885" cy="825" r="30" fill="#FDE68A" fill-opacity="0.25" />

    <rect x="0" y="1080" width="1080" height="270" fill="#050B16" fill-opacity="0.75" />
  </svg>
</body>
</html>`;
}

function clinicChairHtml() {
  return `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;width:1080px;height:1350px;overflow:hidden;background:#08101C;">
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <defs>
      <linearGradient id="wallGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0F172A" />
        <stop offset="50%" stop-color="#0C2238" />
        <stop offset="100%" stop-color="#08101C" />
      </linearGradient>
      <linearGradient id="chairCushion" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38BDF8" />
        <stop offset="100%" stop-color="#0369A1" />
      </linearGradient>
      <filter id="ambientBlur" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="24" />
      </filter>
    </defs>

    <rect width="1080" height="1350" fill="url(#wallGrad)" />

    <polygon points="0,0 320,160 320,1040 0,1210" fill="#1E293B" fill-opacity="0.45" />
    <polygon points="1080,0 760,160 760,1040 1080,1210" fill="#0F172A" fill-opacity="0.65" />
    <rect x="320" y="160" width="440" height="880" fill="#0B192C" stroke="#38BDF8" stroke-opacity="0.18" stroke-width="2" />

    <rect x="355" y="210" width="370" height="14" rx="7" fill="#7DD3FC" fill-opacity="0.85" />
    <rect x="370" y="220" width="340" height="58" rx="28" fill="#38BDF8" fill-opacity="0.28" filter="url(#ambientBlur)" />

    <circle cx="540" cy="430" r="95" fill="#E0F2FE" fill-opacity="0.16" />
    <path d="M540 160 L540 310 L620 385" fill="none" stroke="#94A3B8" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
    <ellipse cx="635" cy="405" rx="68" ry="30" transform="rotate(-18 635 405)" fill="#E0F2FE" fill-opacity="0.92" />
    <ellipse cx="635" cy="405" rx="95" ry="44" transform="rotate(-18 635 405)" fill="#38BDF8" fill-opacity="0.22" filter="url(#ambientBlur)" />

    <path d="M350 960 L690 960 L640 1030 L390 1030 Z" fill="#1E293B" />
    <rect x="460" y="830" width="120" height="135" rx="20" fill="#334155" />

    <path d="M275 605 C325 585, 395 625, 445 735 L685 755 C740 760, 775 795, 760 838 C745 876, 695 882, 625 876 L410 858 C345 850, 305 805, 275 715 C258 660, 250 618, 275 605 Z"
          fill="url(#chairCushion)" />
    <rect x="242" y="555" width="95" height="52" rx="24" transform="rotate(-14 242 555)" fill="#E0F2FE" />

    <rect x="0" y="1060" width="1080" height="290" fill="#040912" fill-opacity="0.78" />
  </svg>
</body>
</html>`;
}

function guideStepHtml(stepNum, title, subtitle, pillText, codeText, highlightBtn) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;width:960px;height:540px;background:#0B0F19;color:#F8FAFC;font-family:'Segoe UI',Arial,sans-serif;display:flex;align-items:center;justify-content:center;">
  <div style="width:860px;height:440px;border-radius:24px;background:#111827;border:1px solid #1E293B;box-shadow:0 24px 60px rgba(0,0,0,0.55);display:flex;flex-direction:column;overflow:hidden;">
    <div style="height:52px;background:#0F172A;border-bottom:1px solid #1E293B;display:flex;align-items:center;justify-content:space-between;padding:0 22px;">
      <div style="display:flex;gap:8px;align-items:center;">
        <span style="width:12px;height:12px;border-radius:999px;background:#EF4444;display:inline-block;"></span>
        <span style="width:12px;height:12px;border-radius:999px;background:#F59E0B;display:inline-block;"></span>
        <span style="width:12px;height:12px;border-radius:999px;background:#10B981;display:inline-block;"></span>
        <span style="margin-left:14px;padding:4px 12px;border-radius:999px;background:#1E293B;color:#94A3B8;font-family:'Consolas',monospace;font-size:13px;">${pillText}</span>
      </div>
      <span style="padding:4px 12px;border-radius:999px;background:#0EA5E9;color:#082F49;font-weight:700;font-size:12px;">LANGKAH ${stepNum} / 4</span>
    </div>

    <div style="flex:1;padding:36px 44px;display:flex;flex-direction:column;justify-content:space-between;">
      <div>
        <div style="color:#38BDF8;font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Panduan Ringkas Google AI Studio (BYOK)</div>
        <h1 style="margin:12px 0 8px 0;font-size:34px;line-height:1.15;color:#F8FAFC;">${title}</h1>
        <p style="margin:0;font-size:18px;color:#94A3B8;line-height:1.45;">${subtitle}</p>
      </div>

      <div style="background:#0B0F19;border:1px solid #334155;border-radius:16px;padding:22px 24px;display:flex;align-items:center;justify-content:space-between;gap:20px;">
        <code style="font-family:'Consolas',monospace;font-size:19px;color:#7DD3FC;">${codeText}</code>
        <div style="padding:12px 22px;border-radius:12px;background:#0EA5E9;color:#082F49;font-weight:800;font-size:16px;white-space:nowrap;">${highlightBtn}</div>
      </div>

      <div style="display:flex;gap:10px;">
        ${[1, 2, 3, 4]
          .map(
            (idx) =>
              `<div style="flex:1;height:8px;border-radius:999px;background:${idx <= stepNum ? '#0EA5E9' : '#1E293B'};"></div>`
          )
          .join('')}
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function generatePngAssets(browser) {
  ensureDir(LOGO_PATH);
  ensureDir(PHOTO_SCALING_PATH);

  const logoPage = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  await logoPage.setContent(logoHtml());
  await logoPage.screenshot({ path: LOGO_PATH, omitBackground: true });
  await logoPage.close();

  const photoSpecs = [
    { path: PHOTO_SCALING_PATH, html: clinicScalingHtml() },
    { path: PHOTO_SMILE_PATH, html: clinicSmileHtml() },
    { path: PHOTO_CHAIR_PATH, html: clinicChairHtml() },
  ];

  const photoPage = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  for (const spec of photoSpecs) {
    await photoPage.setContent(spec.html);
    await photoPage.screenshot({ path: spec.path });
  }
  await photoPage.close();
}

async function generateGuideVideo(browser) {
  ensureDir(GUIDE_VIDEO_PATH);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kks-byok-guide-'));
  const stepPaths = [
    path.join(tmpDir, 'step1.png'),
    path.join(tmpDir, 'step2.png'),
    path.join(tmpDir, 'step3.png'),
    path.join(tmpDir, 'step4.png'),
  ];

  const steps = [
    {
      num: 1,
      title: 'Buka Google AI Studio API Keys',
      subtitle: 'Log masuk dengan akaun Google freelancer anda di portal rasmi Google AI Studio.',
      pill: 'aistudio.google.com/app/apikey',
      code: 'aistudio.google.com/app/apikey',
      btn: 'Buka Portal',
    },
    {
      num: 2,
      title: 'Klik "Create API Key"',
      subtitle: 'Pilih projek atau cipta kunci API baharu khas untuk workbench anda.',
      pill: 'aistudio.google.com — API Keys',
      code: 'Project: kilang-kempen-workbench',
      btn: '+ Create API key',
    },
    {
      num: 3,
      title: 'Salin Kunci BYOK Anda',
      subtitle: 'Kunci disimpan secara tempatan pada pelayar anda sahaja (Bring Your Own Key).',
      pill: 'API Key Created',
      code: 'AIzaSyDemoKey-FreelancerWorkbench-8821',
      btn: 'Copy API Key',
    },
    {
      num: 4,
      title: 'Tampal & Aktifkan Workbench',
      subtitle: 'Tampal kunci ke dalam skrin onboarding atau gunakan Mod Demo untuk pratonton pantas.',
      pill: 'workbench://onboarding/byok',
      code: 'BYOK Key -> Simpan & Teruskan',
      btn: 'Aktifkan Sekarang',
    },
  ];

  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    for (let i = 0; i < steps.length; i += 1) {
      const s = steps[i];
      await page.setContent(guideStepHtml(s.num, s.title, s.subtitle, s.pill, s.code, s.btn));
      await page.screenshot({ path: stepPaths[i] });
    }
    await page.close();

    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-framerate',
        '24',
        '-loop',
        '1',
        '-t',
        '3.3',
        '-i',
        stepPaths[0],
        '-framerate',
        '24',
        '-loop',
        '1',
        '-t',
        '3.3',
        '-i',
        stepPaths[1],
        '-framerate',
        '24',
        '-loop',
        '1',
        '-t',
        '3.3',
        '-i',
        stepPaths[2],
        '-framerate',
        '24',
        '-loop',
        '1',
        '-t',
        '3.3',
        '-i',
        stepPaths[3],
        '-filter_complex',
        '[0:v][1:v]xfade=transition=fade:duration=0.4:offset=2.9[v01];' +
          '[v01][2:v]xfade=transition=fade:duration=0.4:offset=5.8[v012];' +
          '[v012][3:v]xfade=transition=fade:duration=0.4:offset=8.7,format=yuv420p[vout]',
        '-map',
        '[vout]',
        '-r',
        '24',
        '-c:v',
        'libvpx',
        '-b:v',
        '600k',
        '-deadline',
        'good',
        '-cpu-used',
        '2',
        GUIDE_VIDEO_PATH,
      ],
      { stdio: 'inherit' }
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log('Generating fallback-jingle.wav...');
  generateFallbackJingleWav(FALLBACK_WAV_PATH);

  console.log('Launching headless browser for PNG & WebM frame generation...');
  const browser = await launchBrowser();
  try {
    await generatePngAssets(browser);
    await generateGuideVideo(browser);
  } finally {
    await browser.close();
  }
  console.log('All same-origin pre-seeded assets generated in public/assets/.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
