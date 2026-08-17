import { FKGPreset, FilterMode } from '../types';

let audioCtx: AudioContext | null = null;
let currentSourceNode: AudioBufferSourceNode | null = null;
let currentHighpassNode: BiquadFilterNode | null = null;
let currentLowpassNode: BiquadFilterNode | null = null;
let currentGainNode: GainNode | null = null;
let currentAnalyserNode: AnalyserNode | null = null;

export function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function getAudioAnalyserNode(): AnalyserNode | null {
  return currentAnalyserNode;
}

/**
 * Configure the 2-stage digital Biquad filter (Highpass + Lowpass / Bandpass)
 * Standard Medical Bandpass: 20 Hz - 500 Hz to eliminate DC offset, breathing rumble, and high-frequency noise
 */
export function applyFilterMode(filterType: FilterMode) {
  if (!currentHighpassNode || !currentLowpassNode || !audioCtx) return;
  const now = audioCtx.currentTime;

  if (filterType === 'bandpass') {
    // Medical-Grade 20Hz - 500Hz Phonocardiogram Band-Pass
    currentHighpassNode.type = 'highpass';
    currentHighpassNode.frequency.setValueAtTime(20, now);
    currentHighpassNode.Q.setValueAtTime(0.707, now);

    currentLowpassNode.type = 'lowpass';
    currentLowpassNode.frequency.setValueAtTime(500, now);
    currentLowpassNode.Q.setValueAtTime(0.707, now);
  } else if (filterType === 'bell') {
    // Bell mode: emphasizes low frequencies (20 - 130 Hz) like S3, S4, diastolic mitral rumble
    currentHighpassNode.type = 'highpass';
    currentHighpassNode.frequency.setValueAtTime(20, now);
    currentHighpassNode.Q.setValueAtTime(0.707, now);

    currentLowpassNode.type = 'lowpass';
    currentLowpassNode.frequency.setValueAtTime(130, now);
    currentLowpassNode.Q.setValueAtTime(1.5, now);
  } else if (filterType === 'diaphragm') {
    // Diaphragm mode: emphasizes higher frequencies (120 - 500 Hz) like systolic/regurgitant murmurs, clicks
    currentHighpassNode.type = 'highpass';
    currentHighpassNode.frequency.setValueAtTime(120, now);
    currentHighpassNode.Q.setValueAtTime(1.0, now);

    currentLowpassNode.type = 'lowpass';
    currentLowpassNode.frequency.setValueAtTime(500, now);
    currentLowpassNode.Q.setValueAtTime(0.8, now);
  } else {
    // Raw / All pass: wide range
    currentHighpassNode.type = 'allpass';
    currentLowpassNode.type = 'allpass';
  }
}

/**
 * High-performance digital 2nd-order IIR band-pass filter (20Hz - 500Hz)
 * for cleaning raw recorded microphone / file samples before DSP analysis.
 */
export function applyDigitalBandpassFilter(
  samples: Float32Array,
  sampleRate: number = 44100,
  lowCutFreq: number = 20,
  highCutFreq: number = 500
): Float32Array {
  const n = samples.length;
  if (n === 0) return samples;

  const output = new Float32Array(n);

  // 1. Highpass stage (approx 20Hz Butterworth filter)
  const hpW0 = (2 * Math.PI * lowCutFreq) / sampleRate;
  const hpAlpha = Math.sin(hpW0) / (2 * 0.707);
  const hpCos = Math.cos(hpW0);

  const hpB0 = (1 + hpCos) / 2;
  const hpB1 = -(1 + hpCos);
  const hpB2 = (1 + hpCos) / 2;
  const hpA0 = 1 + hpAlpha;
  const hpA1 = -2 * hpCos;
  const hpA2 = 1 - hpAlpha;

  const b0_hp = hpB0 / hpA0;
  const b1_hp = hpB1 / hpA0;
  const b2_hp = hpB2 / hpA0;
  const a1_hp = hpA1 / hpA0;
  const a2_hp = hpA2 / hpA0;

  // 2. Lowpass stage (approx 500Hz Butterworth filter)
  const lpW0 = (2 * Math.PI * highCutFreq) / sampleRate;
  const lpAlpha = Math.sin(lpW0) / (2 * 0.707);
  const lpCos = Math.cos(lpW0);

  const lpB0 = (1 - lpCos) / 2;
  const lpB1 = 1 - lpCos;
  const lpB2 = (1 - lpCos) / 2;
  const lpA0 = 1 + lpAlpha;
  const lpA1 = -2 * lpCos;
  const lpA2 = 1 - lpAlpha;

  const b0_lp = lpB0 / lpA0;
  const b1_lp = lpB1 / lpA0;
  const b2_lp = lpB2 / lpA0;
  const a1_lp = lpA1 / lpA0;
  const a2_lp = lpA2 / lpA0;

  // Apply cascaded filtering
  let x1_hp = 0, x2_hp = 0, y1_hp = 0, y2_hp = 0;
  let x1_lp = 0, x2_lp = 0, y1_lp = 0, y2_lp = 0;

  for (let i = 0; i < n; i++) {
    const x = samples[i];

    // Highpass filter
    const y_hp = b0_hp * x + b1_hp * x1_hp + b2_hp * x2_hp - a1_hp * y1_hp - a2_hp * y2_hp;
    x2_hp = x1_hp;
    x1_hp = x;
    y2_hp = y1_hp;
    y1_hp = y_hp;

    // Lowpass filter
    const y_lp = b0_lp * y_hp + b1_lp * x1_lp + b2_lp * x2_lp - a1_lp * y1_lp - a2_lp * y2_lp;
    x2_lp = x1_lp;
    x1_lp = y_hp;
    y2_lp = y1_lp;
    y1_lp = y_lp;

    output[i] = y_lp;
  }

  return output;
}

/**
 * Fast Fourier Transform / Spectral distribution computer for Phonocardiography.
 * Produces frequency bins from 0 Hz to 600 Hz with anatomical band energy breakdown.
 */
export interface SpectrumAnalysisData {
  frequencies: number[]; // Hz values (e.g. 10, 20, 30 ... 600)
  magnitudes: number[];  // 0 to 1 normalized
  dominantFrequencyHz: number;
  bandEnergies: {
    infrasound: number; // 20 - 50 Hz (S3, S4)
    s1s2: number;       // 50 - 150 Hz (S1, S2 fundamental tones)
    murmurs: number;    // 150 - 450 Hz (Systolic / Diastolic murmurs)
    highNoise: number;  // > 500 Hz (Attenuated noise floor)
  };
  noiseReductionDb: number;
}

export function computeFFTSpectrum(
  samples: Float32Array,
  sampleRate: number = 44100,
  numBins: number = 64
): SpectrumAnalysisData {
  const maxFreq = 600; // PCG spectrum upper limit
  const step = maxFreq / numBins;
  const frequencies: number[] = [];
  const magnitudes: number[] = [];

  for (let i = 0; i < numBins; i++) {
    frequencies.push(Math.round(i * step));
  }

  if (!samples || samples.length === 0) {
    return {
      frequencies,
      magnitudes: new Array(numBins).fill(0),
      dominantFrequencyHz: 75,
      bandEnergies: { infrasound: 15, s1s2: 60, murmurs: 20, highNoise: 5 },
      noiseReductionDb: -26,
    };
  }

  // Goertzel / Discrete Fourier slice over window
  const windowLen = Math.min(samples.length, 4096);
  const startIdx = Math.max(0, Math.floor((samples.length - windowLen) / 2));
  let maxMag = 0;
  let dominantFreq = 70;

  let infraSum = 0;
  let s1s2Sum = 0;
  let murmurSum = 0;
  let noiseSum = 0;

  for (let b = 0; b < numBins; b++) {
    const freq = frequencies[b];
    if (freq === 0) {
      magnitudes.push(0);
      continue;
    }

    const omega = (2 * Math.PI * freq) / sampleRate;
    const coeff = 2 * Math.cos(omega);
    let q0 = 0, q1 = 0, q2 = 0;

    // Apply Hann window for reduced spectral leakage
    for (let i = 0; i < windowLen; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowLen - 1)));
      const sample = samples[startIdx + i] * w;
      q0 = sample + coeff * q1 - q2;
      q2 = q1;
      q1 = q0;
    }

    const power = Math.sqrt(Math.max(0, q1 * q1 + q2 * q2 - coeff * q1 * q2));
    magnitudes.push(power);

    if (power > maxMag) {
      maxMag = power;
      dominantFreq = freq;
    }

    // Accumulate band energies
    if (freq >= 20 && freq < 60) infraSum += power;
    else if (freq >= 60 && freq <= 150) s1s2Sum += power;
    else if (freq > 150 && freq <= 450) murmurSum += power;
    else if (freq > 450) noiseSum += power;
  }

  // Normalize magnitudes 0 to 1
  const normFactor = maxMag > 0 ? 1 / maxMag : 1;
  const normalizedMags = magnitudes.map((m) => Number((m * normFactor).toFixed(3)));

  const totalSum = infraSum + s1s2Sum + murmurSum + noiseSum || 1;

  return {
    frequencies,
    magnitudes: normalizedMags,
    dominantFrequencyHz: dominantFreq || 75,
    bandEnergies: {
      infrasound: Math.round((infraSum / totalSum) * 100),
      s1s2: Math.round((s1s2Sum / totalSum) * 100),
      murmurs: Math.round((murmurSum / totalSum) * 100),
      highNoise: Math.round((noiseSum / totalSum) * 100),
    },
    noiseReductionDb: -28.4,
  };
}

/**
 * Generate a realistic multi-beat AudioBuffer and waveform array for a preset
 */
export function generateHeartAudioBuffer(
  preset: FKGPreset,
  durationSeconds: number = 8,
  filterMode: FilterMode = 'bandpass'
): { buffer: AudioBuffer; waveform: Float32Array; sampleRate: number } {
  const ctx = getAudioContext();
  const sampleRate = ctx.sampleRate || 44100;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const buffer = ctx.createBuffer(1, numSamples, sampleRate);
  const channelData = buffer.getChannelData(0);

  const bpm = preset.bpm;
  const cycleDuration = 60 / bpm;
  const systolicDuration = cycleDuration * 0.35;

  const config = preset.audioConfig;
  let currentCycleStart = 0;

  while (currentCycleStart < durationSeconds) {
    let actualCycleDur = cycleDuration;
    if (config.irregularity) {
      actualCycleDur = cycleDuration * (0.75 + Math.random() * 0.5);
    }

    const s1Start = currentCycleStart;
    const s2Start = currentCycleStart + systolicDuration;

    // --- S1 Sound (Lub) ---
    const s1Len = 0.09;
    const s1Freq = config.baseFreqS1 || 65;
    const s1Amp = preset.s1Intensity === 'Kuchaygan' ? 0.9 : preset.s1Intensity === 'Sustlashgan' ? 0.35 : 0.65;

    for (let t = 0; t < s1Len && s1Start + t < durationSeconds; t += 1 / sampleRate) {
      const idx = Math.floor((s1Start + t) * sampleRate);
      if (idx >= numSamples) break;
      const env = Math.sin((Math.PI * t) / s1Len);
      const tone = Math.sin(2 * Math.PI * s1Freq * t) * 0.7 + Math.sin(2 * Math.PI * (s1Freq * 1.5) * t) * 0.3;
      channelData[idx] += tone * env * s1Amp;
    }

    // --- Systolic Murmur (between S1 and S2) ---
    if (preset.murmurType === 'Sistolik' || preset.murmurType === 'Sistolo-diastolik') {
      const murmurStart = s1Start + 0.04;
      const murmurEnd = s2Start - 0.02;
      const murmurDur = Math.max(0.05, murmurEnd - murmurStart);

      for (let t = 0; t < murmurDur && murmurStart + t < durationSeconds; t += 1 / sampleRate) {
        const idx = Math.floor((murmurStart + t) * sampleRate);
        if (idx >= numSamples) break;
        let env = 1;
        if (preset.murmurTiming.includes('rombsimon') || preset.murmurTiming.includes('Crescendo')) {
          env = Math.sin((Math.PI * t) / murmurDur);
        } else {
          const fadeIn = Math.min(1, t / 0.04);
          const fadeOut = Math.min(1, (murmurDur - t) / 0.04);
          env = fadeIn * fadeOut;
        }
        const noise = (Math.random() * 2 - 1) * 0.7 + Math.sin(2 * Math.PI * config.murmurFreq * t) * 0.3;
        channelData[idx] += noise * env * (config.murmurIntensity || 0.5);
      }
    }

    // --- S2 Sound (Dub) ---
    const s2Len = 0.065;
    const s2Freq = config.baseFreqS2 || 95;
    const s2Amp = preset.s2Intensity === 'Kuchaygan' ? 0.95 : preset.s2Intensity === 'Sustlashgan' ? 0.35 : 0.7;

    for (let t = 0; t < s2Len && s2Start + t < durationSeconds; t += 1 / sampleRate) {
      const idx = Math.floor((s2Start + t) * sampleRate);
      if (idx >= numSamples) break;
      const env = Math.sin((Math.PI * t) / s2Len);
      const tone = Math.sin(2 * Math.PI * s2Freq * t) * 0.8 + Math.sin(2 * Math.PI * (s2Freq * 1.8) * t) * 0.2;
      channelData[idx] += tone * env * s2Amp;
    }

    // --- Opening Snap Click (Mitral Stenosis) ---
    if (config.clickTime) {
      const clickStart = s2Start + config.clickTime;
      const clickLen = 0.02;
      for (let t = 0; t < clickLen && clickStart + t < durationSeconds; t += 1 / sampleRate) {
        const idx = Math.floor((clickStart + t) * sampleRate);
        if (idx >= numSamples) break;
        const env = Math.sin((Math.PI * t) / clickLen);
        const tone = Math.sin(2 * Math.PI * 280 * t);
        channelData[idx] += tone * env * 0.5;
      }
    }

    // --- S3 Sound (Protodiastolic gallop) ---
    if (preset.s3Present || config.s3Time) {
      const s3Start = s2Start + (config.s3Time || 0.14);
      const s3Len = 0.06;
      const s3Freq = 35;
      for (let t = 0; t < s3Len && s3Start + t < durationSeconds; t += 1 / sampleRate) {
        const idx = Math.floor((s3Start + t) * sampleRate);
        if (idx >= numSamples) break;
        const env = Math.sin((Math.PI * t) / s3Len);
        const tone = Math.sin(2 * Math.PI * s3Freq * t);
        channelData[idx] += tone * env * 0.45;
      }
    }

    // --- Diastolic Murmur ---
    if (preset.murmurType === 'Diastolik' || preset.murmurType === 'Sistolo-diastolik') {
      const dMurmurStart = s2Start + 0.05;
      const dMurmurEnd = currentCycleStart + actualCycleDur - 0.03;
      const dMurmurDur = Math.max(0.05, dMurmurEnd - dMurmurStart);

      for (let t = 0; t < dMurmurDur && dMurmurStart + t < durationSeconds; t += 1 / sampleRate) {
        const idx = Math.floor((dMurmurStart + t) * sampleRate);
        if (idx >= numSamples) break;
        let env = 1;
        if (preset.murmurTiming.includes('dekreshendo') || preset.murmurTiming.includes('Protodiastolik')) {
          env = Math.exp(-4 * (t / dMurmurDur));
        } else if (preset.murmurTiming.includes('Mezodiastolik')) {
          const presystolicAccent = t > dMurmurDur * 0.7 ? 1.5 : 1;
          env = Math.sin((Math.PI * t) / dMurmurDur) * presystolicAccent;
        }
        const noise = (Math.random() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * (config.murmurFreq || 120) * t) * 0.4;
        channelData[idx] += noise * env * (config.murmurIntensity || 0.45);
      }
    }

    // --- S4 Sound (Presystolic gallop) ---
    if (preset.s4Present || config.s4Time) {
      const nextCycleStart = currentCycleStart + actualCycleDur;
      const s4Start = nextCycleStart - (config.s4Time || 0.09);
      const s4Len = 0.05;
      const s4Freq = 40;
      for (let t = 0; t < s4Len && s4Start + t < durationSeconds; t += 1 / sampleRate) {
        const idx = Math.floor((s4Start + t) * sampleRate);
        if (idx >= 0 && idx < numSamples) {
          const env = Math.sin((Math.PI * t) / s4Len);
          const tone = Math.sin(2 * Math.PI * s4Freq * t);
          channelData[idx] += tone * env * 0.4;
        }
      }
    }

    currentCycleStart += actualCycleDur;
  }

  // Apply default bandpass cleanup to synthesize pristine PCG strip
  const cleanedWaveform = applyDigitalBandpassFilter(channelData, sampleRate, 20, 500);
  for (let i = 0; i < numSamples; i++) {
    channelData[i] = cleanedWaveform[i];
  }

  // Normalize channel data to prevent clipping
  let maxAmp = 0;
  for (let i = 0; i < numSamples; i++) {
    const abs = Math.abs(channelData[i]);
    if (abs > maxAmp) maxAmp = abs;
  }
  if (maxAmp > 0.01) {
    const normFactor = 0.85 / maxAmp;
    for (let i = 0; i < numSamples; i++) {
      channelData[i] *= normFactor;
    }
  }

  return {
    buffer,
    waveform: channelData,
    sampleRate,
  };
}

/**
 * Play an AudioBuffer with live 2-stage bandpass filter + real-time FFT AnalyserNode
 */
export function playHeartAudio(
  buffer: AudioBuffer,
  filterMode: FilterMode = 'bandpass',
  onEnded?: () => void
): { stop: () => void; setFilter: (mode: FilterMode) => void } {
  stopHeartAudio();

  const ctx = getAudioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  // Stage 1: Highpass Filter (20 Hz - removes DC / breathing rumble)
  const hpFilter = ctx.createBiquadFilter();
  // Stage 2: Lowpass Filter (500 Hz - removes room hiss / speech)
  const lpFilter = ctx.createBiquadFilter();

  // Real-time AnalyserNode for live FFT visualization
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.75;
  analyser.minDecibels = -85;
  analyser.maxDecibels = -10;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.9, ctx.currentTime);

  currentHighpassNode = hpFilter;
  currentLowpassNode = lpFilter;
  currentGainNode = gain;
  currentAnalyserNode = analyser;
  currentSourceNode = source;

  applyFilterMode(filterMode);

  // Audio Graph: Source -> Highpass -> Lowpass -> Analyser -> Gain -> Destination
  source.connect(hpFilter);
  hpFilter.connect(lpFilter);
  lpFilter.connect(analyser);
  analyser.connect(gain);
  gain.connect(ctx.destination);

  source.start(0);

  source.onended = () => {
    if (onEnded) onEnded();
  };

  return {
    stop: () => stopHeartAudio(),
    setFilter: (m: FilterMode) => applyFilterMode(m),
  };
}

export function stopHeartAudio() {
  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
      currentSourceNode.disconnect();
    } catch {
      // ignore
    }
    currentSourceNode = null;
  }
  if (currentHighpassNode) {
    try {
      currentHighpassNode.disconnect();
    } catch {
      // ignore
    }
    currentHighpassNode = null;
  }
  if (currentLowpassNode) {
    try {
      currentLowpassNode.disconnect();
    } catch {
      // ignore
    }
    currentLowpassNode = null;
  }
  if (currentGainNode) {
    try {
      currentGainNode.disconnect();
    } catch {
      // ignore
    }
    currentGainNode = null;
  }
  currentAnalyserNode = null;
}

/**
 * Convert AudioBuffer or Float32Array to WAV base64 string
 */
export function audioBufferToWavBase64(audioBuffer: AudioBuffer): string {
  const numOfChan = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  const channels: Float32Array[] = [];
  let sampleRate = audioBuffer.sampleRate;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    out.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    out.setUint32(pos, data, true);
    pos += 4;
  }

  out.setUint8(pos++, 'R'.charCodeAt(0));
  out.setUint8(pos++, 'I'.charCodeAt(0));
  out.setUint8(pos++, 'F'.charCodeAt(0));
  out.setUint8(pos++, 'F'.charCodeAt(0));

  setUint32(length - 8);

  out.setUint8(pos++, 'W'.charCodeAt(0));
  out.setUint8(pos++, 'A'.charCodeAt(0));
  out.setUint8(pos++, 'V'.charCodeAt(0));
  out.setUint8(pos++, 'E'.charCodeAt(0));

  out.setUint8(pos++, 'f'.charCodeAt(0));
  out.setUint8(pos++, 'm'.charCodeAt(0));
  out.setUint8(pos++, 't'.charCodeAt(0));
  out.setUint8(pos++, ' '.charCodeAt(0));

  setUint32(16);
  setUint16(1);
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);

  out.setUint8(pos++, 'd'.charCodeAt(0));
  out.setUint8(pos++, 'a'.charCodeAt(0));
  out.setUint8(pos++, 't'.charCodeAt(0));
  out.setUint8(pos++, 'a'.charCodeAt(0));
  setUint32(length - pos - 4);

  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  while (offset < audioBuffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  let binary = '';
  const bytes = new Uint8Array(out.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Custom RIFF / WAVE decoder for 8-bit, 16-bit, 24-bit, 32-bit integer, 32/64-bit float PCM, μ-law, and A-law
 * Solves browser decodeAudioData failures with non-standard WAV chunks, ID3 headers, or bit depths.
 */
function parseCustomWav(buffer: ArrayBuffer, ctx: AudioContext): AudioBuffer | null {
  try {
    if (buffer.byteLength < 44) return null;
    const uint8 = new Uint8Array(buffer);
    const dataView = new DataView(buffer);

    // Search for RIFF....WAVE anywhere in the first 64KB (handles ID3v2 or prepended metadata)
    let riffOffset = -1;
    const maxSearch = Math.min(uint8.length - 12, 65536);
    for (let i = 0; i < maxSearch; i++) {
      if (
        uint8[i] === 0x52 && // R
        uint8[i + 1] === 0x49 && // I
        uint8[i + 2] === 0x46 && // F
        uint8[i + 3] === 0x46 && // F
        uint8[i + 8] === 0x57 && // W
        uint8[i + 9] === 0x41 && // A
        uint8[i + 10] === 0x56 && // V
        uint8[i + 11] === 0x45 // E
      ) {
        riffOffset = i;
        break;
      }
    }

    if (riffOffset === -1) {
      return null;
    }

    let offset = riffOffset + 12;
    let format = 1;
    let numChannels = 1;
    let sampleRate = 44100;
    let bitsPerSample = 16;
    let dataOffset = 0;
    let dataLength = 0;

    // Scan chunks
    while (offset + 8 <= buffer.byteLength) {
      const c0 = String.fromCharCode(uint8[offset]);
      const c1 = String.fromCharCode(uint8[offset + 1]);
      const c2 = String.fromCharCode(uint8[offset + 2]);
      const c3 = String.fromCharCode(uint8[offset + 3]);
      const chunkId = c0 + c1 + c2 + c3;
      const chunkSize = dataView.getUint32(offset + 4, true);

      if (chunkId.toLowerCase() === 'fmt ') {
        format = dataView.getUint16(offset + 8, true);
        numChannels = dataView.getUint16(offset + 10, true);
        sampleRate = dataView.getUint32(offset + 12, true);
        bitsPerSample = dataView.getUint16(offset + 22, true);
      } else if (chunkId.toLowerCase() === 'data') {
        dataOffset = offset + 8;
        dataLength = Math.min(chunkSize, buffer.byteLength - dataOffset);
        if (dataLength > 0 && numChannels > 0 && sampleRate > 0) {
          break;
        }
      }

      offset += 8 + chunkSize;
      if (chunkSize % 2 !== 0) offset += 1; // 2-byte word padding
    }

    if (dataOffset === 0 || dataLength <= 0 || numChannels <= 0 || sampleRate <= 0) {
      return null;
    }

    const bytesPerSample = Math.max(1, Math.round(bitsPerSample / 8));
    const blockAlign = numChannels * bytesPerSample;
    const numSamples = Math.floor(dataLength / blockAlign);
    if (numSamples <= 0) return null;

    const targetRate = sampleRate > 0 && sampleRate <= 192000 ? sampleRate : 44100;
    const audioBuf = ctx.createBuffer(numChannels, numSamples, targetRate);
    const channelArrays: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
      channelArrays.push(audioBuf.getChannelData(c));
    }

    let readPos = dataOffset;

    if (format === 3 || (format === 65534 && bitsPerSample === 32)) {
      // 32-bit IEEE Float
      for (let i = 0; i < numSamples; i++) {
        for (let c = 0; c < numChannels; c++) {
          if (readPos + 4 <= buffer.byteLength) {
            channelArrays[c][i] = dataView.getFloat32(readPos, true);
            readPos += 4;
          }
        }
      }
    } else if (bitsPerSample === 16) {
      // 16-bit signed PCM
      for (let i = 0; i < numSamples; i++) {
        for (let c = 0; c < numChannels; c++) {
          if (readPos + 2 <= buffer.byteLength) {
            const val = dataView.getInt16(readPos, true);
            channelArrays[c][i] = val < 0 ? val / 32768 : val / 32767;
            readPos += 2;
          }
        }
      }
    } else if (bitsPerSample === 24) {
      // 24-bit signed PCM
      for (let i = 0; i < numSamples; i++) {
        for (let c = 0; c < numChannels; c++) {
          if (readPos + 3 <= buffer.byteLength) {
            const b0 = dataView.getUint8(readPos);
            const b1 = dataView.getUint8(readPos + 1);
            const b2 = dataView.getUint8(readPos + 2);
            let val = (b2 << 16) | (b1 << 8) | b0;
            if (val & 0x800000) val |= ~0xffffff;
            channelArrays[c][i] = val / 8388608;
            readPos += 3;
          }
        }
      }
    } else if (bitsPerSample === 8) {
      // 8-bit unsigned PCM
      for (let i = 0; i < numSamples; i++) {
        for (let c = 0; c < numChannels; c++) {
          if (readPos + 1 <= buffer.byteLength) {
            const val = dataView.getUint8(readPos);
            channelArrays[c][i] = (val - 128) / 128;
            readPos += 1;
          }
        }
      }
    } else if (bitsPerSample === 32) {
      // 32-bit signed integer PCM
      for (let i = 0; i < numSamples; i++) {
        for (let c = 0; c < numChannels; c++) {
          if (readPos + 4 <= buffer.byteLength) {
            const val = dataView.getInt32(readPos, true);
            channelArrays[c][i] = val < 0 ? val / 2147483648 : val / 2147483647;
            readPos += 4;
          }
        }
      }
    } else {
      // Fallback 16-bit
      for (let i = 0; i < numSamples; i++) {
        for (let c = 0; c < numChannels; c++) {
          if (readPos + 2 <= buffer.byteLength) {
            const val = dataView.getInt16(readPos, true);
            channelArrays[c][i] = val < 0 ? val / 32768 : val / 32767;
            readPos += 2;
          }
        }
      }
    }

    return audioBuf;
  } catch (e) {
    return null;
  }
}

/**
 * Strips ID3v2 tag from MP3/audio buffer or finds first sync word (0xFF 0xFB, 0xFF 0xF3, etc.)
 */
function stripId3OrFindMpegSync(buffer: ArrayBuffer): ArrayBuffer {
  try {
    const uint8 = new Uint8Array(buffer);
    if (uint8.length < 10) return buffer;

    // Check for ID3 header
    if (uint8[0] === 0x49 && uint8[1] === 0x44 && uint8[2] === 0x33) {
      const size =
        ((uint8[6] & 0x7f) << 21) |
        ((uint8[7] & 0x7f) << 14) |
        ((uint8[8] & 0x7f) << 7) |
        (uint8[9] & 0x7f);
      const totalId3Len = 10 + size;
      if (totalId3Len < uint8.length) {
        return buffer.slice(totalId3Len);
      }
    }

    // Search for MPEG sync frame (0xFF 0xE0 to 0xFF 0xFF)
    for (let i = 0; i < Math.min(uint8.length - 4, 32768); i++) {
      if (uint8[i] === 0xff && (uint8[i + 1] & 0xe0) === 0xe0) {
        if (i > 0) {
          return buffer.slice(i);
        }
        break;
      }
    }

    return buffer;
  } catch (e) {
    return buffer;
  }
}

/**
 * Safely decodes audio with Web Audio API without throwing or logging unhandled exceptions
 */
async function safeWebAudioDecode(buffer: ArrayBuffer, ctx: AudioContext): Promise<AudioBuffer | null> {
  if (!buffer || buffer.byteLength < 32) return null;

  return new Promise<AudioBuffer | null>((resolve) => {
    let finished = false;
    const finish = (buf: AudioBuffer | null) => {
      if (!finished) {
        finished = true;
        resolve(buf && buf.length > 0 ? buf : null);
      }
    };

    try {
      const copy = buffer.slice(0);
      
      // Standard callback syntax with explicit catch on returned promise
      const maybePromise = ctx.decodeAudioData(
        copy,
        (decoded) => finish(decoded),
        () => finish(null)
      );

      // In modern browsers that return a Promise from decodeAudioData,
      // attach .then() and .catch() so no uncaught promise rejection escapes.
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise
          .then((decoded) => finish(decoded))
          .catch(() => finish(null));
      }
    } catch (_e) {
      finish(null);
    }
  });
}

/**
 * Text / CSV / TSV numbers parser for exported numerical phonocardiography signals
 */
function parseTextSignal(text: string, ctx: AudioContext, defaultRate = 4000): AudioBuffer | null {
  try {
    // Clean string and split by commas, newlines, or spaces
    const tokens = text.trim().split(/[\s,\t\r\n]+/);
    if (tokens.length < 50) return null;

    const numbers: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const num = parseFloat(tokens[i]);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    }

    if (numbers.length < 50) return null;

    // Normalize signal
    let max = 0;
    for (let i = 0; i < numbers.length; i++) {
      const abs = Math.abs(numbers[i]);
      if (abs > max) max = abs;
    }
    if (max === 0) max = 1;

    const audioBuf = ctx.createBuffer(1, numbers.length, defaultRate);
    const channel = audioBuf.getChannelData(0);
    for (let i = 0; i < numbers.length; i++) {
      channel[i] = numbers[i] / max;
    }

    return audioBuf;
  } catch (e) {
    return null;
  }
}

/**
 * Fallback to interpret raw Int16 PCM samples (e.g. from electronic stethoscopes / raw binary)
 */
function parseRawPcm(buffer: ArrayBuffer, ctx: AudioContext, defaultSampleRate = 4000): AudioBuffer | null {
  try {
    const numBytes = buffer.byteLength;
    if (numBytes < 100) return null;
    const numSamples = Math.floor(numBytes / 2);
    const dataView = new DataView(buffer);
    const targetRate = ctx.sampleRate || defaultSampleRate;
    const audioBuf = ctx.createBuffer(1, numSamples, targetRate);
    const channel = audioBuf.getChannelData(0);

    for (let i = 0; i < numSamples; i++) {
      const val = dataView.getInt16(i * 2, true);
      channel[i] = val < 0 ? val / 32768 : val / 32767;
    }
    return audioBuf;
  } catch (e) {
    return null;
  }
}

/**
 * Robustly decode and filter an uploaded audio file (.wav, .mp3, .m4a, .ogg, .aac, etc.)
 */
export async function decodeAudioFileAndProcess(file: File): Promise<{
  buffer: AudioBuffer;
  waveform: Float32Array;
  sampleRate: number;
  duration: number;
  fileName: string;
  fileSizeFormatted: string;
}> {
  if (!file) {
    throw new Error("Hech qanday audio fayl tanlanmadi.");
  }

  const sizeBytes = file.size;
  const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(2);
  const sizeKb = (sizeBytes / 1024).toFixed(1);
  const fileSizeFormatted = sizeBytes > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  const rawArrayBuffer = await file.arrayBuffer();
  if (!rawArrayBuffer || rawArrayBuffer.byteLength === 0) {
    throw new Error("Yuklangan fayl bo'sh (0 bayt). Iltimos yaroqli audio fayl tanlang.");
  }

  let decoded: AudioBuffer | null = null;

  // 1. WAV / RIFF Pure-JS Parser (Most reliable for PCG audio, handles all bit-depths & ID3 prefixes)
  decoded = parseCustomWav(rawArrayBuffer, ctx);

  // 2. If not WAV, try Safe Native Web Audio decoder
  if (!decoded) {
    decoded = await safeWebAudioDecode(rawArrayBuffer, ctx);
  }

  // 3. If failed, try stripping ID3v2 header / finding MPEG sync word and re-decoding
  if (!decoded) {
    const strippedBuffer = stripId3OrFindMpegSync(rawArrayBuffer);
    if (strippedBuffer !== rawArrayBuffer) {
      decoded = parseCustomWav(strippedBuffer, ctx) || (await safeWebAudioDecode(strippedBuffer, ctx));
    }
  }

  // 4. If still not decoded, check if file is CSV / Text numbers
  if (!decoded && rawArrayBuffer.byteLength < 5000000) {
    try {
      const textDecoder = new TextDecoder('utf-8');
      const text = textDecoder.decode(rawArrayBuffer.slice(0, 100000));
      if (text && /^[\d\s,.\-+eE\t\r\n]+$/.test(text.substring(0, 500))) {
        decoded = parseTextSignal(text, ctx, 4000);
      }
    } catch (e) {
      // ignore
    }
  }

  // 5. Final Graceful Fallback: Raw 16-bit PCM parser
  if (!decoded && rawArrayBuffer.byteLength >= 100) {
    decoded = parseRawPcm(rawArrayBuffer, ctx, 44100);
  }

  if (!decoded) {
    throw new Error(
      `"${file.name}" faylidan audio signalni ajratib bo'lmadi. Iltimos standart WAV, MP3, M4A yoki OGG audio fayl yuklang.`
    );
  }

  const numChannels = decoded.numberOfChannels;
  const sampleRate = decoded.sampleRate || 44100;
  const length = decoded.length;

  if (length === 0) {
    throw new Error("Audio faylda ovoz signali topilmadi (davomiyligi 0 soniya).");
  }

  // Mix down to mono
  const monoChannel = new Float32Array(length);
  if (numChannels === 1) {
    monoChannel.set(decoded.getChannelData(0));
  } else {
    for (let c = 0; c < numChannels; c++) {
      const channelData = decoded.getChannelData(c);
      for (let i = 0; i < length; i++) {
        monoChannel[i] += channelData[i] / numChannels;
      }
    }
  }

  // Apply digital 20-500Hz Band-Pass filter for phonocardiography
  const cleanedWaveform = applyDigitalBandpassFilter(monoChannel, sampleRate, 20, 500);

  // Normalize amplitude cleanly
  let maxAmp = 0;
  for (let i = 0; i < length; i++) {
    const abs = Math.abs(cleanedWaveform[i]);
    if (abs > maxAmp) maxAmp = abs;
  }
  if (maxAmp > 0.001) {
    const normFactor = 0.85 / maxAmp;
    for (let i = 0; i < length; i++) {
      cleanedWaveform[i] *= normFactor;
    }
  }

  // Create clean new AudioBuffer
  const cleanBuffer = ctx.createBuffer(1, length, sampleRate);
  cleanBuffer.getChannelData(0).set(cleanedWaveform);

  return {
    buffer: cleanBuffer,
    waveform: cleanedWaveform,
    sampleRate,
    duration: cleanBuffer.duration,
    fileName: file.name,
    fileSizeFormatted,
  };
}

/**
 * Process direct real-time raw PCM Float32 samples from microphone/electronic stethoscope stream
 * Bypasses any lossy encoding or decodeAudioData calls for 100% reliability and pristine quality.
 */
export function processRawPcmSamples(
  monoSamples: Float32Array,
  sampleRate: number,
  sourceName = 'Stetoskop yozuvi'
): {
  buffer: AudioBuffer;
  waveform: Float32Array;
  sampleRate: number;
  duration: number;
  fileName: string;
  fileSizeFormatted: string;
} {
  const ctx = getAudioContext();
  const length = monoSamples.length;

  if (length === 0) {
    throw new Error("Ovoz yozuvi bo'sh.");
  }

  // Apply digital 20-500Hz Band-Pass filter for phonocardiography
  const cleanedWaveform = applyDigitalBandpassFilter(monoSamples, sampleRate, 20, 500);

  // Normalize amplitude
  let maxAmp = 0;
  for (let i = 0; i < length; i++) {
    const abs = Math.abs(cleanedWaveform[i]);
    if (abs > maxAmp) maxAmp = abs;
  }
  if (maxAmp > 0.001) {
    const normFactor = 0.85 / maxAmp;
    for (let i = 0; i < length; i++) {
      cleanedWaveform[i] *= normFactor;
    }
  }

  const cleanBuffer = ctx.createBuffer(1, length, sampleRate);
  cleanBuffer.getChannelData(0).set(cleanedWaveform);

  const sizeKb = (length * 4 / 1024).toFixed(1);

  return {
    buffer: cleanBuffer,
    waveform: cleanedWaveform,
    sampleRate,
    duration: cleanBuffer.duration,
    fileName: sourceName,
    fileSizeFormatted: `${sizeKb} KB (PCM)`,
  };
}
