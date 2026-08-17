import React, { useEffect, useRef, useState, useMemo } from 'react';
import { FilterMode, FKGSignalMetrics } from '../types';
import {
  getAudioAnalyserNode,
  computeFFTSpectrum,
  SpectrumAnalysisData,
} from '../utils/audioSynth';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  ZoomIn,
  ZoomOut,
  Sliders,
  Activity,
  BarChart3,
  Waves,
  ShieldCheck,
  Radio,
  Zap,
  HelpCircle,
} from 'lucide-react';

interface Props {
  waveform: Float32Array | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  filterMode: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
  bpm: number;
  s3Present?: boolean;
  s4Present?: boolean;
  hasMurmur?: boolean;
  sampleTitle?: string;
  signalMetrics?: FKGSignalMetrics | null;
  onOpenEcgVsFkgModal?: () => void;
}

export const WaveformVisualizer: React.FC<Props> = ({
  waveform,
  isPlaying,
  onTogglePlay,
  onReset,
  filterMode,
  onFilterChange,
  bpm,
  s3Present,
  s4Present,
  hasMurmur,
  sampleTitle,
  signalMetrics,
  onOpenEcgVsFkgModal,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const [displayMode, setDisplayMode] = useState<'dual' | 'waveform' | 'fft'>('dual');
  const [liveDominantFreq, setLiveDominantFreq] = useState<number>(75);

  const animationFrameRef = useRef<number | null>(null);
  const fftAnimationFrameRef = useRef<number | null>(null);
  const playStartTimeRef = useRef<number | null>(null);

  const loopDuration = 8; // seconds

  // Compute static baseline FFT spectrum whenever waveform changes
  const staticSpectrum: SpectrumAnalysisData = useMemo(() => {
    if (!waveform || waveform.length === 0) {
      return {
        frequencies: Array.from({ length: 64 }, (_, i) => Math.round(i * (600 / 64))),
        magnitudes: new Array(64).fill(0),
        dominantFrequencyHz: 75,
        bandEnergies: { infrasound: 15, s1s2: 60, murmurs: 20, highNoise: 5 },
        noiseReductionDb: -28.4,
      };
    }
    return computeFFTSpectrum(waveform, 44100, 64);
  }, [waveform]);

  // Sync playhead animation
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      playStartTimeRef.current = null;
      return;
    }

    const startTimestamp = performance.now() - playbackProgress * loopDuration * 1000;
    playStartTimeRef.current = startTimestamp;

    const animate = (time: number) => {
      const elapsed = (time - startTimestamp) / 1000;
      const progress = (elapsed % loopDuration) / loopDuration;
      setPlaybackProgress(progress);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying]);

  // 1. Draw Phonocardiogram Waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Background Grid
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Minor Grid lines
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
    ctx.lineWidth = 0.5;
    const gridSize = 16;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Major Grid lines (0.2s lines)
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
    ctx.lineWidth = 1;
    const majorGrid = gridSize * 5;
    for (let x = 0; x < width; x += majorGrid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Center Baseline
    const centerY = height / 2;
    ctx.strokeStyle = 'rgba(13, 148, 136, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Render Waveform
    if (waveform && waveform.length > 0) {
      const visibleSamples = Math.floor(waveform.length / zoomLevel);
      const startSample = 0;

      // Glow layer
      ctx.strokeStyle = hasMurmur ? 'rgba(244, 63, 94, 0.25)' : 'rgba(45, 212, 191, 0.18)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        const sampleIdx = Math.floor(startSample + (x / width) * visibleSamples);
        if (sampleIdx >= waveform.length) break;
        const val = waveform[sampleIdx];
        const y = centerY - val * (height * 0.42);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Main signal line
      ctx.strokeStyle =
        filterMode === 'bell'
          ? '#38bdf8'
          : filterMode === 'diaphragm'
          ? '#f43f5e'
          : filterMode === 'bandpass'
          ? '#22c55e'
          : '#2dd4bf';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        const sampleIdx = Math.floor(startSample + (x / width) * visibleSamples);
        if (sampleIdx >= waveform.length) break;
        const val = waveform[sampleIdx];
        const y = centerY - val * (height * 0.42);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Cardiac Cycle Markers
      const cycleDuration = 60 / (bpm || 72);
      const totalVisibleTime = (visibleSamples / waveform.length) * loopDuration;
      const totalCycles = totalVisibleTime / cycleDuration;

      ctx.font = '9px monospace';
      ctx.textBaseline = 'top';

      for (let c = 0; c < totalCycles; c++) {
        const cycleStartTime = c * cycleDuration;
        const s1X = (cycleStartTime / totalVisibleTime) * width;
        const s2Time = cycleStartTime + cycleDuration * 0.35;
        const s2X = (s2Time / totalVisibleTime) * width;

        if (s1X >= 0 && s1X <= width) {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
          ctx.fillRect(s1X - 8, 4, 16, height - 8);
          ctx.fillStyle = '#38bdf8';
          ctx.fillText('S1 (Lub)', s1X - 10, 6);
        }

        if (s2X >= 0 && s2X <= width) {
          ctx.fillStyle = 'rgba(45, 212, 191, 0.12)';
          ctx.fillRect(s2X - 6, 4, 12, height - 8);
          ctx.fillStyle = '#2dd4bf';
          ctx.fillText('S2 (Dub)', s2X - 8, 6);
        }

        if (s1X < width && s2X > 0) {
          const sysStart = Math.max(0, s1X + 8);
          const sysEnd = Math.min(width, s2X - 6);
          if (sysEnd > sysStart) {
            ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
            ctx.fillText('Sistola', (sysStart + sysEnd) / 2 - 14, height - 16);
          }
        }
      }
    }

    // Playhead
    const playheadX = playbackProgress * width;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(playheadX, 8, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [waveform, zoomLevel, playbackProgress, filterMode, bpm, hasMurmur, displayMode]);

  // 2. Draw Real-time FFT Frequency Spectrum
  useEffect(() => {
    const canvas = fftCanvasRef.current;
    if (!canvas || displayMode === 'waveform') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isSubscribed = true;

    const renderFFT = () => {
      if (!isSubscribed) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        fftAnimationFrameRef.current = requestAnimationFrame(renderFFT);
        return;
      }

      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const width = rect.width;
      const height = rect.height;

      // Dark background
      ctx.fillStyle = '#060913';
      ctx.fillRect(0, 0, width, height);

      // Draw Band Zones
      const maxF = 600; // 0 - 600 Hz
      const getX = (freq: number) => Math.min(width, (freq / maxF) * width);

      // Zone 1: Infrasound / S3 S4 (20 - 60 Hz)
      const x20 = getX(20);
      const x60 = getX(60);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.fillRect(x20, 0, x60 - x20, height);

      // Zone 2: Primary S1/S2 Tones (60 - 150 Hz)
      const x150 = getX(150);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.09)';
      ctx.fillRect(x60, 0, x150 - x60, height);

      // Zone 3: Murmur Region (150 - 450 Hz)
      const x450 = getX(450);
      ctx.fillStyle = hasMurmur ? 'rgba(244, 63, 94, 0.12)' : 'rgba(245, 158, 11, 0.08)';
      ctx.fillRect(x150, 0, x450 - x150, height);

      // Zone 4: Noise Cutoff / Attenuation (> 500 Hz)
      const x500 = getX(500);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.07)';
      ctx.fillRect(x500, 0, width - x500, height);

      // Grid Ticks
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
      ctx.lineWidth = 0.5;
      const freqMarkers = [20, 60, 100, 150, 250, 350, 450, 500, 600];

      ctx.font = '8px monospace';
      ctx.fillStyle = '#64748b';
      ctx.textBaseline = 'bottom';

      for (const f of freqMarkers) {
        const x = getX(f);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.fillText(`${f}Hz`, x + 2, height - 2);
      }

      // Collect Frequency Data (Live from AnalyserNode or fallback to static computed spectrum)
      const analyser = getAudioAnalyserNode();
      let bins: number[] = [];
      let dominant = staticSpectrum.dominantFrequencyHz;

      if (isPlaying && analyser) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        // Map audio context sample rate bins to 0-600 Hz
        const ctxSampleRate = 44100;
        const binWidth = ctxSampleRate / (analyser.fftSize || 256);
        const displayBins = 48;
        let maxVal = 0;
        let peakIdx = 0;

        for (let i = 0; i < displayBins; i++) {
          const targetFreq = (i / displayBins) * maxF;
          const rawBinIdx = Math.min(bufferLength - 1, Math.round(targetFreq / binWidth));
          const val = dataArray[rawBinIdx] / 255;
          bins.push(val);
          if (val > maxVal) {
            maxVal = val;
            peakIdx = i;
          }
        }
        dominant = Math.round((peakIdx / displayBins) * maxF) || 75;
        setLiveDominantFreq(dominant);
      } else {
        bins = staticSpectrum.magnitudes.slice(0, 48);
        dominant = staticSpectrum.dominantFrequencyHz;
        setLiveDominantFreq(dominant);
      }

      // Draw FFT Bars & Smooth Curve
      const numBars = bins.length;
      const barWidth = width / numBars;

      // Draw Filled Curve Area
      ctx.beginPath();
      ctx.moveTo(0, height - 14);

      for (let i = 0; i < numBars; i++) {
        const x = i * barWidth;
        const val = bins[i] || 0;
        const barHeight = val * (height - 24);
        const y = Math.max(8, height - 14 - barHeight);

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x + barWidth / 2, y);
      }
      ctx.lineTo(width, height - 14);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
      grad.addColorStop(0.2, 'rgba(34, 197, 94, 0.45)');
      grad.addColorStop(0.6, 'rgba(245, 158, 11, 0.4)');
      grad.addColorStop(0.85, 'rgba(244, 63, 94, 0.4)');
      grad.addColorStop(1, 'rgba(100, 116, 139, 0.1)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Draw Top Line of Spectrum
      ctx.beginPath();
      for (let i = 0; i < numBars; i++) {
        const x = i * barWidth;
        const val = bins[i] || 0;
        const barHeight = val * (height - 24);
        const y = Math.max(8, height - 14 - barHeight);

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x + barWidth / 2, y);
      }
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Highlight Dominant Peak
      const peakX = getX(dominant);
      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(peakX, 0);
      ctx.lineTo(peakX, height - 14);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(peakX, 6, 3, 0, Math.PI * 2);
      ctx.fill();

      if (isPlaying) {
        fftAnimationFrameRef.current = requestAnimationFrame(renderFFT);
      }
    };

    renderFFT();

    return () => {
      isSubscribed = false;
      if (fftAnimationFrameRef.current) {
        cancelAnimationFrame(fftAnimationFrameRef.current);
      }
    };
  }, [isPlaying, displayMode, staticSpectrum, hasMurmur]);

  // Derived metrics
  const systoleMs = signalMetrics?.systoleMs || Math.round((60000 / (bpm || 72)) * 0.35);
  const diastoleMs = signalMetrics?.diastoleMs || Math.round((60000 / (bpm || 72)) * 0.65);
  const rrMs = signalMetrics?.avgRrMs || Math.round(60000 / (bpm || 72));
  const rmssdMs = signalMetrics?.rmssdMs || 32.4;
  const hrvStatus = signalMetrics?.hrvStatus || 'Optimal';

  return (
    <div id="fkg-waveform-panel" className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 text-slate-800 shadow-sm space-y-4">
      {/* Header Info, BPM, View Selector & EKG vs FKG info trigger */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm sm:text-base text-slate-800">
                FKG To&apos;lqin va Real-Vaqt Spektral (FFT) Tahlili
              </h3>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                20-500Hz Band-Pass
              </span>
            </div>
            {sampleTitle && (
              <p className="text-xs text-slate-500 truncate max-w-[220px] sm:max-w-xs">{sampleTitle}</p>
            )}
          </div>
        </div>

        {/* Action triggers & View Toggle */}
        <div className="flex items-center gap-2">
          {/* Display Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              id="view-dual-btn"
              onClick={() => setDisplayMode('dual')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                displayMode === 'dual' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Ikkala grafik (To'lqin + FFT)"
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Dual</span>
            </button>
            <button
              id="view-wave-btn"
              onClick={() => setDisplayMode('waveform')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                displayMode === 'waveform' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Faqat to'lqin oscillogrammasi"
            >
              <Waves className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">To&apos;lqin</span>
            </button>
            <button
              id="view-fft-btn"
              onClick={() => setDisplayMode('fft')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                displayMode === 'fft' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Faqat FFT chastota spektri"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">FFT</span>
            </button>
          </div>

          {onOpenEcgVsFkgModal && (
            <button
              id="open-ecg-fkg-guide-btn"
              onClick={onOpenEcgVsFkgModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-colors"
              title="EKG va FKG farqi haqida ma'lumot"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="hidden md:inline">EKG vs FKG</span>
            </button>
          )}

          <div className="px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-xs font-mono font-bold text-blue-700">{bpm || 72}</span>
            <span className="text-[10px] text-slate-500 font-sans font-semibold">BPM</span>
          </div>
        </div>
      </div>

      {/* Clinical Metrics Overview (RMSSD, HRV, Sistola, Diastola) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-2xl bg-blue-50/80 border border-blue-200 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-blue-900">
            <span>RMSSD (HRV)</span>
            <span className="text-[9px] uppercase px-1.5 py-0.2 bg-blue-200/80 text-blue-900 rounded font-extrabold">Klinik</span>
          </div>
          <div className="text-lg font-mono font-extrabold text-blue-700">
            {rmssdMs} <span className="text-xs font-sans font-semibold text-slate-500">ms</span>
          </div>
          <div className="text-[10px] text-blue-800 font-medium truncate">
            {hrvStatus} ritm
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
            <span>Sistola (S1→S2)</span>
            <span className="text-[9px] text-slate-400 font-mono">250-340ms</span>
          </div>
          <div className="text-lg font-mono font-extrabold text-slate-800">
            {systoleMs} <span className="text-xs font-sans font-semibold text-slate-500">ms</span>
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            Qorinchalar qisqarishi
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
            <span>Diastola (S2→S1)</span>
            <span className="text-[9px] text-slate-400 font-mono">450-650ms</span>
          </div>
          <div className="text-lg font-mono font-extrabold text-slate-800">
            {diastoleMs} <span className="text-xs font-sans font-semibold text-slate-500">ms</span>
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            Bo&apos;shashish va to&apos;lish
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
            <span>Dominant Chastota</span>
            <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-1 rounded">FFT Peak</span>
          </div>
          <div className="text-lg font-mono font-extrabold text-slate-800">
            {liveDominantFreq} <span className="text-xs font-sans font-semibold text-slate-500">Hz</span>
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            {liveDominantFreq < 60 ? 'S3/S4 hududi' : liveDominantFreq <= 150 ? 'S1/S2 asosiy ton' : 'Shovqin/Regurgitatsiya'}
          </div>
        </div>
      </div>

      {/* Main Canvas Waveform Container */}
      {(displayMode === 'dual' || displayMode === 'waveform') && (
        <div
          ref={containerRef}
          className="relative w-full h-44 sm:h-52 bg-[#090d16] rounded-2xl border border-slate-800 overflow-hidden shadow-inner flex flex-col justify-between"
        >
          <canvas ref={canvasRef} className="w-full h-full block cursor-crosshair" />

          {/* Legend overlays */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-2 text-[10px] bg-slate-900/90 backdrop-blur px-2.5 py-1 rounded-lg border border-slate-800 text-slate-200 font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" /> S1 (Mitral/Trikuspid)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" /> S2 (Aorta/Pulmonal)
            </span>
            {s3Present && (
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> S3
              </span>
            )}
            {s4Present && (
              <span className="flex items-center gap-1.5 text-purple-300">
                <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" /> S4
              </span>
            )}
          </div>

          <div className="absolute bottom-1.5 left-2.5 text-[10px] font-mono text-slate-400 flex items-center gap-2">
            <span>0.04s / 0.20s kardiologik katak</span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400">Filtr: {filterMode === 'bandpass' ? 'Band-pass (20-500Hz)' : filterMode.toUpperCase()}</span>
          </div>
        </div>
      )}

      {/* Real-time Spectral FFT Frequency Analysis Component */}
      {(displayMode === 'dual' || displayMode === 'fft') && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-3.5 sm:p-4 space-y-2.5 text-slate-200 shadow-inner">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <span>Real-Vaqt Spektral Tahlil (FFT 20Hz - 600Hz)</span>
              {isPlaying && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800">
                  <Radio className="w-3 h-3 animate-pulse" /> Jonli spektr
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-sky-400" /> 20-60Hz (S3/S4)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-emerald-400" /> 60-150Hz (S1/S2)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-amber-400" /> 150-450Hz (Shovqin)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-rose-500" /> &gt;500Hz (Shovqin kesish)
              </span>
            </div>
          </div>

          {/* FFT Canvas Strip */}
          <div className="relative w-full h-24 sm:h-28 bg-[#060913] rounded-xl border border-slate-800/80 overflow-hidden">
            <canvas ref={fftCanvasRef} className="w-full h-full block" />
            
            {/* Live stats overlay badge */}
            <div className="absolute top-2 left-2 bg-slate-900/90 backdrop-blur px-2 py-0.8 rounded-md border border-slate-700/60 text-[10px] font-mono text-emerald-300 flex items-center gap-1.5">
              <span>Peak: <strong>{liveDominantFreq} Hz</strong></span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300">Shovqin pasayishi: <strong>{staticSpectrum.noiseReductionDb} dB</strong></span>
            </div>
          </div>

          {/* Frequency Energy Breakdown Percentages */}
          <div className="grid grid-cols-4 gap-2 text-[11px] pt-1">
            <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800 flex flex-col">
              <span className="text-slate-400 text-[10px]">Infrasovush (20-60Hz)</span>
              <span className="font-mono font-bold text-sky-400">{staticSpectrum.bandEnergies.infrasound}% quvvat</span>
            </div>
            <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800 flex flex-col">
              <span className="text-slate-400 text-[10px]">Asosiy Tonlar (60-150Hz)</span>
              <span className="font-mono font-bold text-emerald-400">{staticSpectrum.bandEnergies.s1s2}% quvvat</span>
            </div>
            <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800 flex flex-col">
              <span className="text-slate-400 text-[10px]">Shovqinlar (150-450Hz)</span>
              <span className="font-mono font-bold text-amber-400">{staticSpectrum.bandEnergies.murmurs}% quvvat</span>
            </div>
            <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800 flex flex-col">
              <span className="text-slate-400 text-[10px]">Kesilgan (&gt;500Hz)</span>
              <span className="font-mono font-bold text-slate-500">{staticSpectrum.bandEnergies.highNoise}% qoldiq</span>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Digital Stethoscope Filter Selector */}
      <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 text-xs text-slate-700 font-bold uppercase tracking-wider">
          <Sliders className="w-4 h-4 text-blue-600" />
          <span>Raqamli Akustik Filtr:</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 text-xs">
          <button
            id="filter-bandpass"
            onClick={() => onFilterChange('bandpass')}
            className={`px-3 py-1.5 rounded-lg transition-all font-bold flex items-center gap-1.5 ${
              filterMode === 'bandpass'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Tibbiy standart: 20Hz - 500Hz fon shovqinlarini to'liq so'ndiradi"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Band-Pass (20-500Hz)</span>
          </button>
          <button
            id="filter-bell"
            onClick={() => onFilterChange('bell')}
            className={`px-3 py-1.5 rounded-lg transition-all font-bold ${
              filterMode === 'bell'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Qo'ng'iroqcha: Past chastotalar (S3, S4, Mitral stenoz)"
          >
            Qo&apos;ng&apos;iroq (&lt;130Hz)
          </button>
          <button
            id="filter-diaphragm"
            onClick={() => onFilterChange('diaphragm')}
            className={`px-3 py-1.5 rounded-lg transition-all font-bold ${
              filterMode === 'diaphragm'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Diafragma: Yuqori chastotali shovqinlar va regurditatsiya (120-500Hz)"
          >
            Diafragma (120-500Hz)
          </button>
          <button
            id="filter-raw"
            onClick={() => onFilterChange('raw')}
            className={`px-2.5 py-1.5 rounded-lg transition-all font-bold ${
              filterMode === 'raw'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="To'liq spektr / Filtrsiz"
          >
            Filtrsiz (Raw)
          </button>
        </div>
      </div>

      {/* Audio Playback & Zoom Controls Bar */}
      <div className="flex items-center justify-between pt-1">
        {/* Play/Pause & Reset */}
        <div className="flex items-center gap-2.5">
          <button
            id="play-pause-fkg-btn"
            onClick={onTogglePlay}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md active:scale-95 ${
              isPlaying
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>To&apos;xtatish</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Auskultatsiyani tinglash</span>
              </>
            )}
          </button>

          <button
            id="reset-fkg-btn"
            onClick={onReset}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-200 active:scale-95"
            title="Boshiga qaytarish"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
          <button
            id="zoom-out-btn"
            disabled={zoomLevel <= 1}
            onClick={() => setZoomLevel((z) => Math.max(1, z / 2))}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 disabled:opacity-30 transition-colors"
            title="Kichraytirish"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-700 px-1.5 font-bold">{zoomLevel}x</span>
          <button
            id="zoom-in-btn"
            disabled={zoomLevel >= 4}
            onClick={() => setZoomLevel((z) => Math.min(4, z * 2))}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 disabled:opacity-30 transition-colors"
            title="Kattalashtirish"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
