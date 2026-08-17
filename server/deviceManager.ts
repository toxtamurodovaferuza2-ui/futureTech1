import { randomUUID as uuidv4 } from 'crypto';
import { generateClinicalFallbackAnalysis } from './fallbackAnalysis';

export interface QalbDevice {
  id: string; // e.g. "QALB-A1B2C3"
  name: string;
  fw: string;
  last_seen: string;
  status: 'idle' | 'recording' | 'uploading' | 'offline';
  battery?: number;
  owner_id?: string;
}

export interface DeviceCommand {
  id: string; // job uuid
  device_id: string;
  cmd: 'record' | 'idle';
  sec: 15 | 30;
  patient_id?: string;
  patient_data?: PatientRecord;
  state: 'pending' | 'taken' | 'done' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface PatientRecord {
  id: string;
  ism: string;
  familiya: string;
  yosh: number;
  jins: 'Erkak' | 'Ayol';
  homilador?: boolean;
  sistolik?: number;
  diastolik?: number;
  auskultatsiya_nuqtasi?: string;
  owner_id?: string;
}

export interface QalbRecording {
  id: string;
  device_id: string;
  patient_id?: string;
  patient_data?: PatientRecord;
  job_id: string;
  sec: number;
  sample_rate: number;
  bpm: number;
  rhythm: string;
  beats: number;
  quality: number;
  audio_url: string; // WAV base64 data URL
  raw_pcm_base64?: string;
  image_url: string; // Spectrogram SVG/PNG data URL
  ai_result?: any;
  age_assessment: {
    normMin: number;
    normMax: number;
    status: 'past' | 'norma' | 'yuqori';
    label: string;
    description: string;
  };
  created_at: string;
}

// In-Memory Database Store (persists during container runtime)
export const devicesDb = new Map<string, QalbDevice>();
export const deviceCommandsDb = new Map<string, DeviceCommand>();
export const recordingsDb = new Map<string, QalbRecording>();
export const patientsDb = new Map<string, PatientRecord>();

// Pre-seed a default demonstration device so users can immediately test without hardware
devicesDb.set('QALB-DEMO01', {
  id: 'QALB-DEMO01',
  name: 'QALB PCG Monitor (Klinik)',
  fw: 'v14.2-pro',
  last_seen: new Date().toISOString(),
  status: 'idle',
  battery: 92,
  owner_id: 'default',
});

/**
 * Calculates Age-Specific Heart Rate Norms according to pediatric & adult cardiology standards
 */
export function calculateAgeNorm(age: number, isPregnant = false): {
  normMin: number;
  normMax: number;
  status: 'past' | 'norma' | 'yuqori';
  label: string;
  description: string;
  evaluate: (bpm: number) => { status: 'past' | 'norma' | 'yuqori'; label: string };
} {
  let min = 60;
  let max = 100;
  let rangeLabel = 'Katta yoshdagilar (18+)';

  if (age < 1) {
    min = 100;
    max = 150;
    rangeLabel = 'Go\'daklar (< 1 yosh)';
  } else if (age >= 1 && age <= 3) {
    min = 90;
    max = 140;
    rangeLabel = 'Kichik yosh (1–3 yosh)';
  } else if (age > 3 && age <= 6) {
    min = 80;
    max = 120;
    rangeLabel = 'Maktabgacha (3–6 yosh)';
  } else if (age > 6 && age <= 12) {
    min = 70;
    max = 120;
    rangeLabel = 'Maktab yoshi (6–12 yosh)';
  } else if (age > 12 && age < 18) {
    min = 60;
    max = 110;
    rangeLabel = 'O\'smirlar (12–18 yosh)';
  } else {
    min = 60;
    max = 100;
    rangeLabel = 'Katta yosh (18+)';
  }

  // Pregnancy increases cardiovascular output: upper limit +15 bpm
  if (isPregnant) {
    max += 15;
    rangeLabel += ' [Homiladorlik +15 bpm]';
  }

  const evaluate = (bpm: number) => {
    if (bpm < min) {
      return { status: 'past' as const, label: `Past (Bradikardiya — norma: ${min}–${max} bpm)` };
    } else if (bpm > max) {
      return { status: 'yuqori' as const, label: `Yuqori (Taxikardiya — norma: ${min}–${max} bpm)` };
    } else {
      return { status: 'norma' as const, label: `Optimal (Norma: ${min}–${max} bpm)` };
    }
  };

  return {
    normMin: min,
    normMax: max,
    status: 'norma',
    label: `${min}–${max} bpm`,
    description: rangeLabel,
    evaluate,
  };
}

/**
 * Creates a standard 44-byte RIFF/WAVE header around raw 16-bit signed Little-Endian PCM bytes
 */
export function pcmToWavBuffer(pcmBuffer: Buffer, sampleRate = 1000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  // RIFF Chunk Descriptor
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);

  // "fmt " sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // "data" sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Generates an SVG Spectrogram + Time-Domain FKG Waveform visualization
 * STFT Hann window, 0-500Hz heart sound range, dB heat color gradient, with clinical patient header
 */
export function generateSpectrogramSvg(
  pcmBuffer: Buffer,
  sampleRate: number,
  options: {
    patientName: string;
    bpm: number;
    rhythm: string;
    sec: number;
    auscultationPoint?: string;
    quality?: number;
  }
): string {
  const numSamples = Math.floor(pcmBuffer.length / 2);
  const samples = new Float32Array(numSamples);

  // Read Int16 signed
  for (let i = 0; i < numSamples; i++) {
    const val = pcmBuffer.readInt16LE(i * 2);
    samples[i] = val / 32768;
  }

  const width = 1100;
  const height = 650;
  const headerHeight = 90;
  const waveformHeight = 160;
  const specHeight = 340;
  const margin = { left: 70, right: 30, top: 15, bottom: 45 };

  const plotWidth = width - margin.left - margin.right;

  // Waveform polyline points
  const waveformPoints: string[] = [];
  const step = Math.max(1, Math.floor(numSamples / plotWidth));
  const wfCenterY = headerHeight + waveformHeight / 2;

  for (let x = 0; x < plotWidth; x++) {
    const sampleIdx = Math.min(numSamples - 1, x * step);
    let min = 1.0;
    let max = -1.0;
    for (let k = 0; k < step && sampleIdx + k < numSamples; k++) {
      const s = samples[sampleIdx + k];
      if (s < min) min = s;
      if (s > max) max = s;
    }
    const yTop = wfCenterY - max * (waveformHeight / 2 - 12);
    const yBottom = wfCenterY - min * (waveformHeight / 2 - 12);
    waveformPoints.push(`${margin.left + x},${yTop.toFixed(1)} ${margin.left + x},${yBottom.toFixed(1)}`);
  }

  // STFT Spectrogram calculation (Window 256, Hop 64, Hann window)
  const windowSize = 256;
  const hopSize = 64;
  const numHops = Math.max(1, Math.floor((numSamples - windowSize) / hopSize));
  const numFreqBins = 64; // Focus on 0 to 500 Hz

  // Pre-calculate Hann window
  const hann = new Float32Array(windowSize);
  for (let i = 0; i < windowSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
  }

  // Draw Heatmap Columns
  const colWidth = plotWidth / Math.max(1, numHops);
  const binHeight = specHeight / numFreqBins;
  const specTopY = headerHeight + waveformHeight + 20;

  const specRects: string[] = [];

  // Color mapping function: dB scale to Blue/Cyan/Amber/Rose
  const getColor = (dbVal: number) => {
    // dbVal normalized 0 to 1
    const norm = Math.max(0, Math.min(1, (dbVal + 60) / 60)); // -60dB to 0dB
    if (norm < 0.2) {
      const r = Math.round(15 + norm * 50);
      const g = Math.round(23 + norm * 80);
      const b = Math.round(42 + norm * 150);
      return `rgb(${r},${g},${b})`;
    } else if (norm < 0.5) {
      const t = (norm - 0.2) / 0.3;
      const r = Math.round(25 + t * 10);
      const g = Math.round(80 + t * 150);
      const b = Math.round(150 + t * 90);
      return `rgb(${r},${g},${b})`;
    } else if (norm < 0.8) {
      const t = (norm - 0.5) / 0.3;
      const r = Math.round(35 + t * 210);
      const g = Math.round(230 + t * 15);
      const b = Math.round(240 - t * 180);
      return `rgb(${r},${g},${b})`;
    } else {
      const t = (norm - 0.8) / 0.2;
      const r = Math.round(245 + t * 10);
      const g = Math.round(180 - t * 120);
      const b = Math.round(60 - t * 40);
      return `rgb(${r},${g},${b})`;
    }
  };

  for (let h = 0; h < numHops; h += Math.max(1, Math.floor(numHops / 150))) {
    const start = h * hopSize;
    const real = new Float32Array(numFreqBins);

    // Simple DFT for lowest 64 bins (0 - 500 Hz)
    for (let k = 0; k < numFreqBins; k++) {
      let r = 0;
      let im = 0;
      for (let n = 0; n < windowSize && start + n < numSamples; n++) {
        const s = samples[start + n] * hann[n];
        const angle = (2 * Math.PI * k * n) / windowSize;
        r += s * Math.cos(angle);
        im -= s * Math.sin(angle);
      }
      const mag = Math.sqrt(r * r + im * im) + 1e-6;
      const db = 20 * Math.log10(mag);
      real[k] = db;
    }

    const x = margin.left + (h / numHops) * plotWidth;

    for (let k = 0; k < numFreqBins; k++) {
      const y = specTopY + specHeight - (k + 1) * binHeight;
      const color = getColor(real[k]);
      specRects.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(colWidth * 2).toFixed(1)}" height="${(binHeight + 0.5).toFixed(1)}" fill="${color}" opacity="0.95" />`
      );
    }
  }

  // Time grid markers (every 2 seconds)
  const durationSec = options.sec || 15;
  const timeLabels: string[] = [];
  for (let s = 0; s <= durationSec; s += durationSec > 15 ? 5 : 2) {
    const tx = margin.left + (s / durationSec) * plotWidth;
    timeLabels.push(`
      <line x1="${tx}" y1="${headerHeight}" x2="${tx}" y2="${specTopY + specHeight}" stroke="#334155" stroke-dasharray="3,3" stroke-width="1" />
      <text x="${tx}" y="${specTopY + specHeight + 20}" fill="#94a3b8" font-size="11" font-family="monospace" text-anchor="middle">${s}s</text>
    `);
  }

  // Frequency grid labels (50Hz, 100Hz, 200Hz, 300Hz, 500Hz)
  const freqs = [
    { f: 50, y: specTopY + specHeight - (50 / 500) * specHeight },
    { f: 150, y: specTopY + specHeight - (150 / 500) * specHeight },
    { f: 300, y: specTopY + specHeight - (300 / 500) * specHeight },
    { f: 500, y: specTopY },
  ];
  const freqLabels = freqs
    .map(
      (item) => `
    <line x1="${margin.left}" y1="${item.y}" x2="${margin.left + plotWidth}" y2="${item.y}" stroke="#334155" stroke-dasharray="2,4" stroke-width="0.8" />
    <text x="${margin.left - 10}" y="${item.y + 4}" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="end">${item.f} Hz</text>
  `
    )
    .join('');

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <linearGradient id="wfGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="16" />

  <!-- Header Banner -->
  <rect x="20" y="15" width="${width - 40}" height="65" fill="#1e293b" rx="12" stroke="#334155" stroke-width="1" />
  <text x="40" y="42" fill="#38bdf8" font-size="16" font-weight="bold" font-family="sans-serif">QALB PCG MONITOR • FONOKARDIOGRAMMA</text>
  <text x="40" y="64" fill="#cbd5e1" font-size="12" font-family="sans-serif">Bemor: <tspan font-weight="bold" fill="#ffffff">${options.patientName || 'Anonim bemor'}</tspan> • Auskultatsiya: ${options.auscultationPoint || 'Mitral cho\'qqi'}</text>

  <!-- Metric Badges -->
  <rect x="${width - 360}" y="25" width="95" height="45" fill="#0f172a" rx="8" stroke="#0284c7" stroke-width="1" />
  <text x="${width - 312}" y="43" fill="#94a3b8" font-size="10" font-family="sans-serif" text-anchor="middle">YURAK URISHI</text>
  <text x="${width - 312}" y="62" fill="#38bdf8" font-size="16" font-weight="bold" font-family="monospace" text-anchor="middle">${options.bpm} <tspan font-size="10">BPM</tspan></text>

  <rect x="${width - 255}" y="25" width="105" height="45" fill="#0f172a" rx="8" stroke="#334155" stroke-width="1" />
  <text x="${width - 202}" y="43" fill="#94a3b8" font-size="10" font-family="sans-serif" text-anchor="middle">RITM</text>
  <text x="${width - 202}" y="62" fill="#e2e8f0" font-size="12" font-weight="bold" font-family="sans-serif" text-anchor="middle">${options.rhythm || 'Muntazam'}</text>

  <rect x="${width - 140}" y="25" width="100" height="45" fill="#0f172a" rx="8" stroke="#10b981" stroke-width="1" />
  <text x="${width - 90}" y="43" fill="#94a3b8" font-size="10" font-family="sans-serif" text-anchor="middle">SIFAT</text>
  <text x="${width - 90}" y="62" fill="#10b981" font-size="16" font-weight="bold" font-family="monospace" text-anchor="middle">${options.quality || 85}%</text>

  <!-- Section 1: Time-Domain Waveform -->
  <text x="${margin.left}" y="${headerHeight + 10}" fill="#94a3b8" font-size="11" font-weight="bold" font-family="sans-serif">1. AKUSTIK FONOKARDIOGRAMMA TO'LQINI (AMPLITUDA)</text>
  <rect x="${margin.left}" y="${headerHeight + 15}" width="${plotWidth}" height="${waveformHeight}" fill="#0f172a" rx="8" stroke="#334155" stroke-width="1" />
  <line x1="${margin.left}" y1="${wfCenterY}" x2="${margin.left + plotWidth}" y2="${wfCenterY}" stroke="#1e293b" stroke-width="1" />
  <path d="${waveformPoints.map((p, idx) => (idx === 0 ? 'M ' + p : 'L ' + p)).join(' ')}" stroke="url(#wfGrad)" stroke-width="1.2" fill="none" opacity="0.9" />

  <!-- Section 2: Frequency Spectrogram (0 - 500 Hz) -->
  <text x="${margin.left}" y="${specTopY - 6}" fill="#94a3b8" font-size="11" font-weight="bold" font-family="sans-serif">2. FREKVENSIYA SPEKTROGRAMMASI (0–500 Hz • STFT Hann oyna)</text>
  <rect x="${margin.left}" y="${specTopY}" width="${plotWidth}" height="${specHeight}" fill="#020617" rx="8" stroke="#334155" stroke-width="1" />
  
  <!-- Heatmap cells -->
  <g clip-path="url(#specClip)">
    <clipPath id="specClip">
      <rect x="${margin.left}" y="${specTopY}" width="${plotWidth}" height="${specHeight}" rx="8" />
    </clipPath>
    ${specRects.join('\n    ')}
  </g>

  <!-- Grid & Labels -->
  ${timeLabels.join('\n  ')}
  ${freqLabels}

  <!-- Footer Disclaimer -->
  <text x="${width / 2}" y="${height - 12}" fill="#64748b" font-size="10" font-family="sans-serif" text-anchor="middle">
    QALB PCG Sensor v14 • Raqamli Fonokardiogramma Skriningi • Shifokor kardiolog ko'rigi talab etiladi.
  </text>
</svg>
`;
}
