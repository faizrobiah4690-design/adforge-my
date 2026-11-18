import { FALLBACK_AUDIO_URL, SAMPLE_OFFER_CHIP } from '../data/seedVault';
import type { JingleState, JingleStyleId } from '../types/campaign';
import {
  extractOfferDetails,
  getFrameworkForVariation,
  resolveDistinctSubject,
  stripDuplicateTawaran,
} from './offerDetails';
import { truncateAtWordBoundary } from './whatsapp';

export const JINGLE_DURATION_SEC = 5.5;
export const JINGLE_SAMPLE_RATE = 48000;
export const JINGLE_CHANNELS = 2;

export interface GeneratedJingleResult {
  audioBuffer: AudioBuffer | null;
  wavBlob: Blob;
  previewUrl: string;
  durationSec: number;
  sampleRate: number;
}

export interface ResolvedVideoAudio {
  audioBuffer: AudioBuffer;
  audioSourceUsed: 'tab3-jingle' | 'fallback-preseeded';
}

interface StyleArrangement {
  bpm: number;
  chords: number[][];
  bassRoots: number[];
  bassMultipliers: number[];
  melodyPhraseA: number[];
  melodyPhraseB: number[];
  waveform: 'bright' | 'warm' | 'marimba';
  hatDensity: number;
  kickGain: number;
  snareGain: number;
}

const STYLE_ARRANGEMENTS: Record<JingleStyleId, StyleArrangement> = {
  'pop-ceria': {
    bpm: 124,
    // Cmaj - Gmaj - Am - Fmaj - Cmaj - Gmaj - Fmaj - Gmaj (energetic 8-slot pop progression)
    chords: [
      [261.63, 329.63, 392.0, 523.25],
      [196.0, 246.94, 293.66, 392.0],
      [220.0, 261.63, 329.63, 440.0],
      [174.61, 220.0, 261.63, 349.23],
      [261.63, 329.63, 392.0, 523.25],
      [196.0, 246.94, 293.66, 392.0],
      [174.61, 220.0, 261.63, 349.23],
      [196.0, 246.94, 293.66, 392.0],
    ],
    bassRoots: [130.81, 98.0, 110.0, 87.31, 130.81, 98.0, 87.31, 98.0],
    bassMultipliers: [1, 1, 2, 1.5],
    melodyPhraseA: [523.25, 659.25, 783.99, 659.25, 587.33, 659.25, 783.99, 880.0],
    melodyPhraseB: [783.99, 880.0, 1046.5, 880.0, 783.99, 659.25, 783.99, 1046.5],
    waveform: 'bright',
    hatDensity: 4,
    kickGain: 0.36,
    snareGain: 0.24,
  },
  'santai-akustik': {
    bpm: 90,
    // Fmaj7 - Em7 - Dm7 - Cmaj7 - Fmaj7 - Em7 - Dm7 - G7sus4
    chords: [
      [174.61, 220.0, 261.63, 329.63],
      [164.81, 196.0, 246.94, 293.66],
      [146.83, 174.61, 220.0, 261.63],
      [130.81, 164.81, 196.0, 246.94],
      [174.61, 220.0, 261.63, 329.63],
      [164.81, 196.0, 246.94, 293.66],
      [146.83, 174.61, 220.0, 261.63],
      [196.0, 261.63, 293.66, 349.23],
    ],
    bassRoots: [87.31, 82.41, 73.42, 65.41, 87.31, 82.41, 73.42, 98.0],
    bassMultipliers: [1, 1.5, 1, 2],
    melodyPhraseA: [329.63, 392.0, 440.0, 392.0, 349.23, 329.63, 293.66, 261.63],
    melodyPhraseB: [392.0, 440.0, 523.25, 440.0, 392.0, 349.23, 329.63, 523.25],
    waveform: 'warm',
    hatDensity: 2,
    kickGain: 0.24,
    snareGain: 0.16,
  },
  'korporat-segar': {
    bpm: 108,
    // Dmaj - Amaj - Bm - Gmaj - Dmaj - F#m - Gmaj - Amaj
    chords: [
      [293.66, 369.99, 440.0, 587.33],
      [220.0, 277.18, 329.63, 440.0],
      [246.94, 293.66, 369.99, 493.88],
      [196.0, 246.94, 293.66, 392.0],
      [293.66, 369.99, 440.0, 587.33],
      [185.0, 220.0, 277.18, 369.99],
      [196.0, 246.94, 293.66, 392.0],
      [220.0, 277.18, 329.63, 440.0],
    ],
    bassRoots: [146.83, 110.0, 123.47, 98.0, 146.83, 92.5, 98.0, 110.0],
    bassMultipliers: [1, 1, 1.5, 2],
    melodyPhraseA: [587.33, 440.0, 554.37, 440.0, 493.88, 587.33, 659.25, 587.33],
    melodyPhraseB: [587.33, 659.25, 739.99, 659.25, 587.33, 554.37, 659.25, 880.0],
    waveform: 'marimba',
    hatDensity: 4,
    kickGain: 0.32,
    snareGain: 0.21,
  },
};

export function buildJingleLyrics(
  brandName: string,
  offerSentence: string,
  variationIndex = 1,
  uspAndAudience?: string
): string {
  const safeBrand = brandName.trim() || 'Bisnes Saya';
  const conciseOffer = offerSentence.trim() || SAMPLE_OFFER_CHIP;
  const details = extractOfferDetails(safeBrand, conciseOffer, uspAndAudience);
  const framework = getFrameworkForVariation(variationIndex);
  const valueBadge = [details.discountPercent, details.priceTag, details.bundleOrFreebie]
    .filter(Boolean)
    .join(' • ');
  const nonDupTopic = resolveDistinctSubject(details, conciseOffer);
  const occasionCue = details.occasion ?? 'hari ini';
  const uspLine = details.uspSummary?.trim()
    ? truncateAtWordBoundary(details.uspSummary, 52)
    : null;

  let lines: string[];
  switch (framework) {
    case 'pas':
      lines = [
        `Penat cari ${nonDupTopic}? Terus ke ${safeBrand},`,
        uspLine ? `${uspLine} — memang puas hati,` : `Harga jelas & kualiti padu menanti,`,
        `${conciseOffer}`,
        `WhatsApp ${safeBrand} sekarang, jangan tunggu lagi!`,
      ];
      break;
    case 'bab':
      lines = [
        `Tinggal cara lama, tukar gaya baru dengan ${safeBrand},`,
        uspLine ? `${uspLine} setiap hari,` : `${nonDupTopic} lebih pantas dan berbaloi,`,
        valueBadge ? `${valueBadge} — ${occasionCue}!` : `${conciseOffer}`,
        `Tempah di WhatsApp ${safeBrand} hari ini juga!`,
      ];
      break;
    case 'pov_ugc':
      lines = [
        `POV cuba sendiri ${safeBrand}, memang jatuh hati!`,
        uspLine ? `Ramai puji ${uspLine},` : `Ramai puji ${nonDupTopic},`,
        valueBadge ? `Berbaloi sungguh dengan ${valueBadge},` : `${conciseOffer}`,
        `Klik WhatsApp ${safeBrand}, tanya stok sebelum habis!`,
      ];
      break;
    case 'smart_buyer':
      lines = [
        `Pembeli bijak kira nilai di ${safeBrand},`,
        valueBadge
          ? `Nikmati ${valueBadge} terus depan mata,`
          : uspLine
            ? `${uspLine} dengan harga jelas,`
            : `Harga jelas untuk ${nonDupTopic} idaman anda,`,
        `${conciseOffer}`,
        `Banding & WhatsApp ${safeBrand} sekarang!`,
      ];
      break;
    case 'fomo_drop':
      lines = [
        `Rebut ${occasionCue} di ${safeBrand} sekarang!`,
        `${nonDupTopic} kuota terawal bergerak laju,`,
        valueBadge ? `Hanya ${valueBadge} untuk yang pantas bertindak,` : `${conciseOffer}`,
        `Tekan WhatsApp ${safeBrand} sebelum stok ditutup!`,
      ];
      break;
  }

  return stripDuplicateTawaran(lines.join('\n'));
}

export function computeRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i];
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / samples.length);
}

function clampDuration(durationSec: number): number {
  if (!Number.isFinite(durationSec)) return JINGLE_DURATION_SEC;
  return Math.min(6.0, Math.max(1.5, durationSec));
}

function normalizeStereoChannels(left: Float32Array, right: Float32Array, targetPeak = 0.88): void {
  let maxAbs = 0;
  for (let i = 0; i < left.length; i += 1) {
    const absL = Math.abs(left[i]);
    const absR = Math.abs(right[i]);
    if (absL > maxAbs) maxAbs = absL;
    if (absR > maxAbs) maxAbs = absR;
  }
  if (maxAbs < 1e-6) return;
  const gain = targetPeak / maxAbs;
  for (let i = 0; i < left.length; i += 1) {
    left[i] = Math.max(-1, Math.min(1, left[i] * gain));
    right[i] = Math.max(-1, Math.min(1, right[i] * gain));
  }
}

/**
 * Pure-TS deterministic multi-track PCM synthesizer.
 * Works both as a standalone pure-TS renderer (unit tests in jsdom) and as a safe
 * fallback when browser OfflineAudioContext is unavailable.
 */
export function synthesizeJinglePcm(
  style: JingleStyleId,
  durationSec = JINGLE_DURATION_SEC,
  sampleRate = JINGLE_SAMPLE_RATE
): [Float32Array, Float32Array] {
  const safeDuration = clampDuration(durationSec);
  const totalFrames = Math.round(safeDuration * sampleRate);
  const left = new Float32Array(totalFrames);
  const right = new Float32Array(totalFrames);

  const spec = STYLE_ARRANGEMENTS[style];
  const beatDur = 60 / spec.bpm;
  const chordDur = safeDuration / spec.chords.length;
  const eighthDur = beatDur / 2;
  const halfSec = safeDuration * 0.5;
  const fadeInSamples = Math.round(0.02 * sampleRate);
  const fadeOutSamples = Math.round(0.18 * sampleRate);

  for (let i = 0; i < totalFrames; i += 1) {
    const t = i / sampleRate;
    const chordIdx = Math.min(spec.chords.length - 1, Math.floor(t / chordDur));
    const chord = spec.chords[chordIdx];
    const baseBassFreq = spec.bassRoots[chordIdx];

    const beatIdx = Math.floor(t / beatDur);
    const beatInBar = beatIdx % 4;
    const beatPos = (t % beatDur) / beatDur;
    const eighthIdx = Math.floor(t / eighthDur);
    const eighthPos = (t % eighthDur) / eighthDur;
    const isPhraseB = t >= halfSec;
    const activeMelody = isPhraseB ? spec.melodyPhraseB : spec.melodyPhraseA;
    const melodyFreq = activeMelody[eighthIdx % activeMelody.length];

    // Sidechain pump synced to kick beats (ducks on beat start, swells cleanly)
    const sidechainPump = 0.68 + 0.32 * Math.min(1, beatPos * 2.2);

    // Rich stereo chord pad with detuned warmth
    let padL = 0;
    let padR = 0;
    for (let c = 0; c < chord.length; c += 1) {
      const f = chord[c];
      const panSpread = c % 2 === 0 ? 0.88 : 1.12;
      const sample =
        spec.waveform === 'bright'
          ? Math.sin(2 * Math.PI * f * t) * 0.22 + Math.sin(4 * Math.PI * f * t) * 0.08
          : spec.waveform === 'warm'
            ? Math.sin(2 * Math.PI * f * t) * 0.24 * Math.exp(-beatPos * 1.15)
            : Math.sin(2 * Math.PI * f * t) * 0.2 + Math.sin(6 * Math.PI * f * t) * 0.06;
      padL += sample * panSpread;
      padR += sample * (2 - panSpread);
    }
    padL = (padL / chord.length) * sidechainPump;
    padR = (padR / chord.length) * sidechainPump;

    // Syncopated octave/fifth bass groove
    const bassMult = spec.bassMultipliers[eighthIdx % spec.bassMultipliers.length];
    const bassFreq = baseBassFreq * bassMult;
    const bassEnv = Math.exp(-eighthPos * (spec.waveform === 'warm' ? 2.2 : 2.9));
    const bass =
      (Math.sin(2 * Math.PI * bassFreq * t) * 0.82 +
        Math.sin(4 * Math.PI * bassFreq * t) * 0.22) *
      bassEnv *
      0.3;

    // Two-phrase commercial melody hook + final resolution chime
    const melEnv =
      Math.min(1, eighthPos / 0.035) *
      Math.exp(-eighthPos * (spec.waveform === 'warm' ? 3.2 : 3.8));
    const melHarmonic =
      spec.waveform === 'bright'
        ? Math.sin(4 * Math.PI * melodyFreq * t) * 0.34
        : spec.waveform === 'marimba'
          ? Math.sin(6 * Math.PI * melodyFreq * t) * 0.22
          : Math.sin(4 * Math.PI * melodyFreq * t) * 0.14;
    const melody =
      (Math.sin(2 * Math.PI * melodyFreq * t) * 0.72 + melHarmonic) *
      melEnv *
      (isPhraseB ? 0.36 : 0.31);

    // Final resolution sting at 4.95s
    let sting = 0;
    if (t >= 4.95) {
      const st = t - 4.95;
      const stingFreq = spec.melodyPhraseB[spec.melodyPhraseB.length - 1];
      sting =
        (Math.sin(2 * Math.PI * stingFreq * st) * 0.7 +
          Math.sin(3 * Math.PI * stingFreq * st) * 0.3) *
        Math.exp(-st * 4.5) *
        0.24;
    }

    // Punchy Kick on beats 1 & 3 (plus syncopated push on '&' of 3 in upbeat/corporate)
    const isKickBeat = beatInBar === 0 || beatInBar === 2;
    const kickEnv = isKickBeat ? Math.exp(-beatPos * 15) : 0;
    const kickFreq = 46 + 102 * Math.exp(-beatPos * 26);
    const kick =
      Math.sin(2 * Math.PI * kickFreq * (beatPos * beatDur)) *
      kickEnv *
      spec.kickGain;

    // Crisp Snare + Clap on beats 2 & 4
    const isSnareBeat = beatInBar === 1 || beatInBar === 3;
    const pseudoSnareNoise = Math.sin((i + 1) * 37.13 + beatIdx * 91.7) * 43758.5453;
    const snareWhite = (pseudoSnareNoise - Math.floor(pseudoSnareNoise)) * 2 - 1;
    const snareBody =
      Math.sin(2 * Math.PI * (185 - 65 * Math.min(1, beatPos * 8)) * (beatPos * beatDur)) *
      Math.exp(-beatPos * 18);
    const snareCrisp = snareWhite * Math.exp(-beatPos * 14);
    const snare = isSnareBeat ? (snareBody * 0.48 + snareCrisp * 0.52) * spec.snareGain : 0;

    // Velocity-accented hi-hat pattern
    const hatStepDur = beatDur / spec.hatDensity;
    const hatStep = Math.floor(t / hatStepDur);
    const hatPos = (t % hatStepDur) / hatStepDur;
    const pseudoNoise = Math.sin((i + 1) * 12.9898 + hatStep * 78.233) * 43758.5453;
    const white = (pseudoNoise - Math.floor(pseudoNoise)) * 2 - 1;
    const isOffbeatHat = hatStep % 2 === 1;
    const hatDecay = isOffbeatHat ? 14 : 22;
    const hatVelocity = isOffbeatHat ? 1.15 : 0.72;
    const hat =
      white *
      Math.exp(-hatPos * hatDecay) *
      hatVelocity *
      (spec.waveform === 'warm' ? 0.045 : 0.085);

    const monoDrumsAndBass = bass + kick + snare + sting;
    const stereoMelL = melody * (0.9 + 0.1 * Math.sin(t * 1.9));
    const stereoMelR = melody * (0.9 - 0.1 * Math.sin(t * 1.9));
    const rawL = Math.tanh((padL + monoDrumsAndBass + stereoMelL + hat * 0.85) * 1.32);
    const rawR = Math.tanh((padR + monoDrumsAndBass + stereoMelR + hat * 1.15) * 1.32);

    let env = 1;
    if (i < fadeInSamples) {
      env = i / Math.max(1, fadeInSamples);
    } else if (i > totalFrames - fadeOutSamples) {
      env = Math.max(0, (totalFrames - i) / Math.max(1, fadeOutSamples));
    }

    left[i] = rawL * env;
    right[i] = rawR * env;
  }

  normalizeStereoChannels(left, right, 0.88);
  return [left, right];
}

/**
 * Encodes multi-channel Float32Array PCM samples into a standard 44-byte RIFF/WAVE
 * 16-bit signed little-endian PCM ArrayBuffer.
 */
export function encodeWavFromPcm(
  channels: readonly Float32Array[],
  sampleRate: number
): ArrayBuffer {
  const numChannels = Math.max(1, channels.length);
  const frameCount = channels[0]?.length ?? 0;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM subchunk size
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  let byteOffset = 44;
  for (let i = 0; i < frameCount; i += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      const sample = channels[ch]?.[i] ?? 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      const int16 = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
      view.setInt16(byteOffset, Math.max(-32768, Math.min(32767, int16)), true);
      byteOffset += 2;
    }
  }

  return buffer;
}

export function encodeAudioBufferToWav(buffer: AudioBuffer): Blob {
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    channels.push(buffer.getChannelData(ch));
  }
  const wavArrayBuffer = encodeWavFromPcm(channels, buffer.sampleRate);
  return new Blob([wavArrayBuffer], { type: 'audio/wav' });
}

function createAudioBufferFromStereo(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number
): AudioBuffer {
  const ctx = new OfflineAudioContext(2, left.length, sampleRate);
  const buffer = ctx.createBuffer(2, left.length, sampleRate);
  buffer.getChannelData(0).set(left);
  buffer.getChannelData(1).set(right);
  return buffer;
}

/**
 * Renders a multi-track musical jingle via browser OfflineAudioContext with
 * DynamicsCompressorNode + lowpass mastering + peak normalization.
 */
export async function renderJingleAudioBuffer(
  style: JingleStyleId,
  durationSec = JINGLE_DURATION_SEC,
  sampleRate = JINGLE_SAMPLE_RATE
): Promise<AudioBuffer> {
  const safeDuration = clampDuration(durationSec);
  const totalFrames = Math.round(safeDuration * sampleRate);

  if (typeof OfflineAudioContext === 'undefined') {
    throw new Error('OfflineAudioContext is not available in this environment.');
  }

  const offlineCtx = new OfflineAudioContext(JINGLE_CHANNELS, totalFrames, sampleRate);
  const spec = STYLE_ARRANGEMENTS[style];
  const beatDur = 60 / spec.bpm;
  const chordDur = safeDuration / spec.chords.length;
  const eighthDur = beatDur / 2;

  // Mastering bus: Compressor -> Master Gain -> Destination
  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-16, 0);
  compressor.knee.setValueAtTime(18, 0);
  compressor.ratio.setValueAtTime(4, 0);
  compressor.attack.setValueAtTime(0.005, 0);
  compressor.release.setValueAtTime(0.15, 0);

  const masterGain = offlineCtx.createGain();
  masterGain.gain.setValueAtTime(0.001, 0);
  masterGain.gain.linearRampToValueAtTime(0.9, 0.03);
  masterGain.gain.setValueAtTime(0.9, Math.max(0.05, safeDuration - 0.2));
  masterGain.gain.linearRampToValueAtTime(0.001, safeDuration);

  compressor.connect(masterGain);
  masterGain.connect(offlineCtx.destination);

  // Track 1: Stereo chord voices
  spec.chords.forEach((chord, idx) => {
    const start = idx * chordDur;
    const end = Math.min(safeDuration, start + chordDur);
    chord.forEach((freq, voiceIdx) => {
      const osc = offlineCtx.createOscillator();
      const filter = offlineCtx.createBiquadFilter();
      const gain = offlineCtx.createGain();

      osc.type =
        spec.waveform === 'bright'
          ? voiceIdx % 2 === 0
            ? 'triangle'
            : 'sawtooth'
          : spec.waveform === 'warm'
            ? 'sine'
            : 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(spec.waveform === 'bright' ? 2400 : 1400, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.04, Math.max(start + 0.06, end - 0.04));
      gain.gain.linearRampToValueAtTime(0.001, end);

      osc.connect(filter);
      filter.connect(gain);

      if (typeof offlineCtx.createStereoPanner === 'function') {
        const panner = offlineCtx.createStereoPanner();
        panner.pan.setValueAtTime(voiceIdx % 2 === 0 ? -0.35 : 0.35, start);
        gain.connect(panner);
        panner.connect(compressor);
      } else {
        gain.connect(compressor);
      }

      osc.start(start);
      osc.stop(end + 0.02);
    });
  });

  // Track 2: Syncopated octave/fifth bass groove
  let bassStepIdx = 0;
  for (let t = 0; t < safeDuration - 0.04; t += eighthDur) {
    const chordIdx = Math.min(spec.chords.length - 1, Math.floor(t / chordDur));
    const mult = spec.bassMultipliers[bassStepIdx % spec.bassMultipliers.length];
    const bassFreq = spec.bassRoots[chordIdx] * mult;
    const end = Math.min(safeDuration, t + eighthDur * 0.92);
    const osc = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();
    osc.type = spec.waveform === 'warm' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(bassFreq, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.005, end);
    osc.connect(gain);
    gain.connect(compressor);
    osc.start(t);
    osc.stop(end + 0.01);
    bassStepIdx += 1;
  }

  // Track 3: Two-phrase lead melody hook + final resolution sting
  let stepIdx = 0;
  const halfSec = safeDuration * 0.5;
  for (let t = 0; t < safeDuration - 0.04; t += eighthDur) {
    const phrase = t >= halfSec ? spec.melodyPhraseB : spec.melodyPhraseA;
    const freq = phrase[stepIdx % phrase.length];
    const end = Math.min(safeDuration, t + eighthDur * 0.92);
    const osc = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();
    osc.type = spec.waveform === 'bright' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(t >= halfSec ? 0.27 : 0.23, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.01, end);

    osc.connect(gain);
    gain.connect(compressor);
    osc.start(t);
    osc.stop(end + 0.01);
    stepIdx += 1;
  }

  // Track 4: Multi-track drum groove (Kick beats 1&3, Snare+Clap beats 2&4, Velocity Hats)
  const noiseFrames = Math.round(0.09 * sampleRate);
  const noiseBuf = offlineCtx.createBuffer(1, noiseFrames, sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseFrames; i += 1) {
    const pseudo = Math.sin((i + 1) * 19.317) * 43758.5453;
    noiseData[i] = ((pseudo - Math.floor(pseudo)) * 2 - 1) * Math.exp(-i / (noiseFrames * 0.35));
  }

  let beatNum = 0;
  for (let t = 0; t < safeDuration - 0.05; t += beatDur) {
    const beatInBar = beatNum % 4;
    if (beatInBar === 0 || beatInBar === 2) {
      const kickOsc = offlineCtx.createOscillator();
      const kickGain = offlineCtx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(145, t);
      kickOsc.frequency.exponentialRampToValueAtTime(46, Math.min(safeDuration, t + 0.12));
      kickGain.gain.setValueAtTime(spec.kickGain, t);
      kickGain.gain.exponentialRampToValueAtTime(0.001, Math.min(safeDuration, t + 0.17));
      kickOsc.connect(kickGain);
      kickGain.connect(compressor);
      kickOsc.start(t);
      kickOsc.stop(Math.min(safeDuration, t + 0.19));
    } else {
      // Snare body + crisp noise clap on beats 2 & 4
      const snareOsc = offlineCtx.createOscillator();
      const snareBodyGain = offlineCtx.createGain();
      snareOsc.type = 'triangle';
      snareOsc.frequency.setValueAtTime(185, t);
      snareOsc.frequency.exponentialRampToValueAtTime(120, Math.min(safeDuration, t + 0.08));
      snareBodyGain.gain.setValueAtTime(spec.snareGain * 0.65, t);
      snareBodyGain.gain.exponentialRampToValueAtTime(0.001, Math.min(safeDuration, t + 0.12));
      snareOsc.connect(snareBodyGain);
      snareBodyGain.connect(compressor);
      snareOsc.start(t);
      snareOsc.stop(Math.min(safeDuration, t + 0.14));

      const clapSrc = offlineCtx.createBufferSource();
      clapSrc.buffer = noiseBuf;
      const clapBp = offlineCtx.createBiquadFilter();
      clapBp.type = 'bandpass';
      clapBp.frequency.setValueAtTime(2200, t);
      const clapGain = offlineCtx.createGain();
      clapGain.gain.setValueAtTime(spec.snareGain * 0.85, t);
      clapGain.gain.exponentialRampToValueAtTime(0.001, Math.min(safeDuration, t + 0.11));
      clapSrc.connect(clapBp);
      clapBp.connect(clapGain);
      clapGain.connect(compressor);
      clapSrc.start(t);
    }

    const hatStepDur = beatDur / spec.hatDensity;
    for (let h = 0; h < spec.hatDensity; h += 1) {
      const ht = t + h * hatStepDur;
      if (ht >= safeDuration - 0.04) break;
      const src = offlineCtx.createBufferSource();
      src.buffer = noiseBuf;
      const hp = offlineCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(6000, ht);
      const hg = offlineCtx.createGain();
      const vel = h % 2 === 1 ? 1.15 : 0.7;
      hg.gain.setValueAtTime((spec.waveform === 'warm' ? 0.04 : 0.085) * vel, ht);
      hg.gain.exponentialRampToValueAtTime(0.001, Math.min(safeDuration, ht + 0.04));
      src.connect(hp);
      hp.connect(hg);
      hg.connect(compressor);
      src.start(ht);
    }
    beatNum += 1;
  }

  const rendered = await offlineCtx.startRendering();
  const ch0 = rendered.getChannelData(0);
  const ch1 = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : ch0;

  if (computeRms(ch0) < 0.05) {
    const [pcmL, pcmR] = synthesizeJinglePcm(style, safeDuration, sampleRate);
    return createAudioBufferFromStereo(pcmL, pcmR, sampleRate);
  }

  normalizeStereoChannels(ch0, ch1, 0.88);
  return rendered;
}

export async function generateJingleAudio(
  style: JingleStyleId,
  durationSec = JINGLE_DURATION_SEC
): Promise<GeneratedJingleResult> {
  const safeDuration = clampDuration(durationSec);

  if (typeof OfflineAudioContext !== 'undefined') {
    try {
      const audioBuffer = await renderJingleAudioBuffer(style, safeDuration, JINGLE_SAMPLE_RATE);
      const wavBlob = encodeAudioBufferToWav(audioBuffer);
      const previewUrl = URL.createObjectURL(wavBlob);
      return {
        audioBuffer,
        wavBlob,
        previewUrl,
        durationSec: safeDuration,
        sampleRate: audioBuffer.sampleRate,
      };
    } catch {
      // Fall through to pure-TS PCM synth if OfflineAudioContext fails
    }
  }

  const [left, right] = synthesizeJinglePcm(style, safeDuration, JINGLE_SAMPLE_RATE);
  const wavArrayBuffer = encodeWavFromPcm([left, right], JINGLE_SAMPLE_RATE);
  const wavBlob = new Blob([wavArrayBuffer], { type: 'audio/wav' });
  const previewUrl = URL.createObjectURL(wavBlob);

  return {
    audioBuffer: null,
    wavBlob,
    previewUrl,
    durationSec: safeDuration,
    sampleRate: JINGLE_SAMPLE_RATE,
  };
}

function parsePcmWavFallback(wavBytes: ArrayBuffer): AudioBuffer | null {
  if (wavBytes.byteLength < 44 || typeof OfflineAudioContext === 'undefined') {
    return null;
  }
  const view = new DataView(wavBytes);
  const riff = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );
  const wave = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11)
  );
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    return null;
  }

  let offset = 12;
  let channels = 2;
  let sampleRate = JINGLE_SAMPLE_RATE;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= wavBytes.byteLength) {
    const id = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ' && offset + 24 <= wavBytes.byteLength) {
      const audioFormat = view.getUint16(offset + 8, true);
      if (audioFormat !== 1) return null;
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(size, wavBytes.byteLength - dataOffset);
      break;
    }
    offset += 8 + size + (size % 2);
  }

  if (dataOffset < 0 || bitsPerSample !== 16 || channels < 1) {
    return null;
  }

  const frameCount = Math.floor(dataSize / (channels * 2));
  if (frameCount <= 0) return null;

  const ctx = new OfflineAudioContext(channels, frameCount, sampleRate);
  const audioBuffer = ctx.createBuffer(channels, frameCount, sampleRate);
  let pos = dataOffset;
  for (let i = 0; i < frameCount; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = view.getInt16(pos, true) / 32768;
      audioBuffer.getChannelData(ch)[i] = sample;
      pos += 2;
    }
  }
  return audioBuffer;
}

async function decodeAudioArrayBuffer(bytes: ArrayBuffer): Promise<AudioBuffer> {
  try {
    if (typeof OfflineAudioContext !== 'undefined') {
      const ctx = new OfflineAudioContext(2, 1, JINGLE_SAMPLE_RATE);
      return await ctx.decodeAudioData(bytes.slice(0));
    }
  } catch {
    // Fallback to WAV parser or standard AudioContext
  }

  if (typeof AudioContext !== 'undefined') {
    const ctx = new AudioContext({ sampleRate: JINGLE_SAMPLE_RATE });
    try {
      return await ctx.decodeAudioData(bytes.slice(0));
    } catch {
      // Fall through to WAV parser
    } finally {
      await ctx.close().catch(() => {});
    }
  }

  const parsed = parsePcmWavFallback(bytes);
  if (parsed) return parsed;
  throw new Error('Unable to decode audio buffer.');
}

/**
 * Resolves the audio track for Tab 4 Video Studio:
 * - Uses Tab 3's synthesized `wavBlob` when `jingle.source === 'tab3-generated'`
 * - Otherwise fetches `/assets/audio/fallback-jingle.wav`
 * - Falls back to synthesized 5.5s 48kHz stereo audio if fetch or decode fails.
 */
export async function resolveVideoAudioBuffer(
  jingle: JingleState
): Promise<ResolvedVideoAudio> {
  if (jingle.source === 'tab3-generated' && jingle.wavBlob !== null) {
    try {
      const bytes = await jingle.wavBlob.arrayBuffer();
      const audioBuffer = await decodeAudioArrayBuffer(bytes);
      return { audioBuffer, audioSourceUsed: 'tab3-jingle' };
    } catch {
      // Fall through to fallback track or safety synthesis
    }
  }

  try {
    const response = await fetch(FALLBACK_AUDIO_URL);
    if (response.ok) {
      const bytes = await response.arrayBuffer();
      const audioBuffer = await decodeAudioArrayBuffer(bytes);
      return { audioBuffer, audioSourceUsed: 'fallback-preseeded' };
    }
  } catch {
    // Fall through to synthesized 5.5s stereo safety audio
  }

  try {
    const synthBuffer = await renderJingleAudioBuffer(
      jingle.style,
      JINGLE_DURATION_SEC,
      JINGLE_SAMPLE_RATE
    );
    return { audioBuffer: synthBuffer, audioSourceUsed: 'fallback-preseeded' };
  } catch {
    const [left, right] = synthesizeJinglePcm(
      jingle.style,
      JINGLE_DURATION_SEC,
      JINGLE_SAMPLE_RATE
    );
    return {
      audioBuffer: createAudioBufferFromStereo(left, right, JINGLE_SAMPLE_RATE),
      audioSourceUsed: 'fallback-preseeded',
    };
  }
}
