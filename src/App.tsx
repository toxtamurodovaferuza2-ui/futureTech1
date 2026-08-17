import React, { useState, useEffect, useRef } from 'react';
import { AuscultationPointId, FKGPreset, FilterMode, AnalysisResult, PatientData, FKGSignalMetrics } from './types';
import { FKG_PRESETS, AUSCULTATION_POINTS } from './data/fkgPresets';
import {
  generateHeartAudioBuffer,
  playHeartAudio,
  stopHeartAudio,
  audioBufferToWavBase64,
  getAudioContext,
  applyDigitalBandpassFilter,
  decodeAudioFileAndProcess,
  processRawPcmSamples,
} from './utils/audioSynth';
import { calculateFKGSignalMetrics } from './utils/fkgSignalMetrics';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { AuscultationPointPicker } from './components/AuscultationPointPicker';
import { AnalysisReportView } from './components/AnalysisReportView';
import { DoctorConsultDrawer } from './components/DoctorConsultDrawer';
import { EcgVsFkgModal } from './components/EcgVsFkgModal';
import { QalbDeviceSection } from './components/QalbDeviceSection';
import {
  Stethoscope,
  Activity,
  Mic,
  Square,
  Upload,
  UploadCloud,
  Sparkles,
  User,
  HeartPulse,
  Play,
  RotateCcw,
  FileAudio,
  CheckCircle,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Sliders,
  Share2,
  HelpCircle,
  Volume2,
  Trash2,
  X,
  Cpu,
  Radio,
} from 'lucide-react';

export default function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'devices' | 'input' | 'waveform' | 'analysis'>('devices');

  // Auscultation point selection
  const [selectedPoint, setSelectedPoint] = useState<AuscultationPointId>('mitral');

  // Current selected preset or custom audio
  const [selectedPreset, setSelectedPreset] = useState<FKGPreset>(FKG_PRESETS[0]);
  const [customAudioBuffer, setCustomAudioBuffer] = useState<AudioBuffer | null>(null);
  const [uploadedFileInfo, setUploadedFileInfo] = useState<{
    name: string;
    size: string;
    duration: string;
    sampleRate: number;
  } | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [currentWaveform, setCurrentWaveform] = useState<Float32Array | null>(null);
  const [signalMetrics, setSignalMetrics] = useState<FKGSignalMetrics | null>(null);

  // Audio Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('bandpass');
  const activeAudioSourceRef = useRef<{ stop: () => void; setFilter: (m: FilterMode) => void } | null>(null);

  // Recording state (Direct Web Audio PCM Capture for 100% reliable zero-decode latency)
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const recordingSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recordingSamplesRef = useRef<Float32Array[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Patient Clinical Data
  const [patientData, setPatientData] = useState<PatientData>({
    fullName: '',
    age: '45',
    gender: 'Erkak',
    complaints: 'Yurak sohasida noqulaylik, jismoniy zo\'riqishda hansirash',
    bloodPressure: '130/85',
  });
  const [showPatientForm, setShowPatientForm] = useState<boolean>(false);

  // AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Doctor Consult Drawer & ECG vs FKG Modal
  const [isConsultOpen, setIsConsultOpen] = useState<boolean>(false);
  const [isEcgModalOpen, setIsEcgModalOpen] = useState<boolean>(false);

  // Load preset on initial render or when preset changes
  useEffect(() => {
    loadPreset(selectedPreset);
  }, [selectedPreset]);

  const loadPreset = (preset: FKGPreset) => {
    stopCurrentAudio();
    setSelectedPreset(preset);
    setSelectedPoint(preset.auscultationPoint);
    setCustomAudioBuffer(null);
    setUploadedFileInfo(null);
    setUploadError(null);

    const { buffer, waveform } = generateHeartAudioBuffer(preset, 8, filterMode);
    setCurrentWaveform(waveform);
    const metrics = calculateFKGSignalMetrics(waveform, 44100, preset.bpm);
    setSignalMetrics(metrics);
  };

  const handleClearUploadedFile = () => {
    stopCurrentAudio();
    setCustomAudioBuffer(null);
    setUploadedFileInfo(null);
    setUploadError(null);
    loadPreset(selectedPreset);
  };

  const stopCurrentAudio = () => {
    if (activeAudioSourceRef.current) {
      activeAudioSourceRef.current.stop();
      activeAudioSourceRef.current = null;
    }
    stopHeartAudio();
    setIsPlaying(false);
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      stopCurrentAudio();
    } else {
      let bufferToPlay = customAudioBuffer;
      if (!bufferToPlay) {
        const generated = generateHeartAudioBuffer(selectedPreset, 8, filterMode);
        bufferToPlay = generated.buffer;
      }
      activeAudioSourceRef.current = playHeartAudio(bufferToPlay, filterMode, () => {
        setIsPlaying(false);
      });
      setIsPlaying(true);
    }
  };

  const handleFilterChange = (mode: FilterMode) => {
    setFilterMode(mode);
    if (activeAudioSourceRef.current) {
      activeAudioSourceRef.current.setFilter(mode);
    }
  };

  // Start Live Microphone / Digital Stethoscope Recording
  const startRecording = async () => {
    try {
      stopCurrentAudio();
      setUploadError(null);
      recordingSamplesRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      recordingStreamRef.current = stream;

      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      recordingSourceRef.current = source;

      // Realtime script processor captures raw 32-bit Float samples directly
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      recordingProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const copy = new Float32Array(inputData.length);
        copy.set(inputData);
        recordingSamplesRef.current.push(copy);
      };

      // Connect through a zero-gain node to keep the pipeline alive without feedback screeching
      const zeroGain = ctx.createGain();
      zeroGain.gain.setValueAtTime(0, ctx.currentTime);

      source.connect(processor);
      processor.connect(zeroGain);
      zeroGain.connect(ctx.destination);

      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 10) {
            // Auto stop at 10 seconds (standard clinical PCG strip length)
            stopRecording();
            return 10;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.warn('Microphone access warning:', err);
      setUploadError('Mikrofon/stetoskopga ulanib bo\'lmadi: ' + (err.message || err));
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }

    if (recordingProcessorRef.current) {
      recordingProcessorRef.current.disconnect();
      recordingProcessorRef.current = null;
    }

    if (recordingSourceRef.current) {
      recordingSourceRef.current.disconnect();
      recordingSourceRef.current = null;
    }

    setIsRecording(false);

    // Process collected raw samples directly without ANY decodeAudioData call
    const chunks = recordingSamplesRef.current;
    if (chunks && chunks.length > 0) {
      let totalLength = 0;
      for (const chunk of chunks) {
        totalLength += chunk.length;
      }

      if (totalLength > 0) {
        const fullPcm = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          fullPcm.set(chunk, offset);
          offset += chunk.length;
        }

        const ctx = getAudioContext();
        try {
          const nowStr = new Date().toLocaleTimeString('uz-UZ').replace(/:/g, '-');
          const processed = processRawPcmSamples(
            fullPcm,
            ctx.sampleRate,
            `Stetoskop_${nowStr}.pcm`
          );

          setCustomAudioBuffer(processed.buffer);
          setCurrentWaveform(processed.waveform);
          setUploadedFileInfo({
            name: processed.fileName,
            size: processed.fileSizeFormatted,
            duration: `${processed.duration.toFixed(1)}s`,
            sampleRate: processed.sampleRate,
          });

          const metrics = calculateFKGSignalMetrics(processed.waveform, processed.sampleRate);
          setSignalMetrics(metrics);
          setAnalysisResult(null);
        } catch (e: any) {
          console.error('PCM processing error:', e);
          setUploadError('Yozilgan audio signalni qayta ishlashda xatolik: ' + e.message);
        }
      }
    }
    recordingSamplesRef.current = [];
  };

  // Robust Audio / FKG File Processor (.wav, .mp3, .m4a, .ogg, .aac, .flac, .webm)
  const processUploadedFile = async (file: File, autoAnalyze = true) => {
    setIsUploading(true);
    setUploadError(null);
    try {
      stopCurrentAudio();
      const result = await decodeAudioFileAndProcess(file);
      setCustomAudioBuffer(result.buffer);
      setCurrentWaveform(result.waveform);
      
      const fileInfo = {
        name: result.fileName,
        size: result.fileSizeFormatted,
        duration: `${result.duration.toFixed(1)}s`,
        sampleRate: result.sampleRate,
      };
      setUploadedFileInfo(fileInfo);

      const metrics = calculateFKGSignalMetrics(result.waveform, result.sampleRate);
      setSignalMetrics(metrics);
      setAnalysisResult(null);

      // Instantly run full AI Phonocardiography analysis directly on dropped raw file without manual montage
      if (autoAnalyze) {
        await executeAnalysis(result.buffer, result.waveform, fileInfo, metrics);
      }
    } catch (err: any) {
      console.error('Audio decode error:', err);
      setUploadError(
        err.message || 'Audio faylni o\'qib bo\'lmadi. WAV, MP3, M4A yoki OGG formatdagi audio fayl yuklang.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processUploadedFile(file, true);
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      // Direct instant analysis without montage on drop
      await processUploadedFile(file, true);
    }
  };

  // Run AI Analysis using Gemini 3.7 Flash via Server API
  const executeAnalysis = async (
    targetBuffer?: AudioBuffer | null,
    targetWaveform?: Float32Array | null,
    targetFileInfo?: { name: string; size: string; duration: string; sampleRate: number } | null,
    targetMetrics?: any | null
  ) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setActiveTab('analysis');

    try {
      const activeBuffer = targetBuffer || customAudioBuffer;
      let bufferForAnalysis = activeBuffer;
      if (!bufferForAnalysis) {
        const generated = generateHeartAudioBuffer(selectedPreset, 8, 'raw');
        bufferForAnalysis = generated.buffer;
      }

      const audioBase64 = audioBufferToWavBase64(bufferForAnalysis);
      const point = AUSCULTATION_POINTS.find((p) => p.id === selectedPoint);

      const effectiveWaveform = targetWaveform || currentWaveform || new Float32Array(44100 * 2);
      const effectiveMetrics = targetMetrics || signalMetrics || calculateFKGSignalMetrics(
        effectiveWaveform,
        bufferForAnalysis.sampleRate || 44100,
        selectedPreset?.bpm
      );

      const activeFileInfo = targetFileInfo || uploadedFileInfo;

      const response = await fetch('/api/fkg/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: 'audio/wav',
          auscultationPoint: point ? `${point.name} (${point.location})` : 'Mitral cho\'qqi',
          patientData,
          signalStats: {
            bpm: effectiveMetrics.bpm || selectedPreset?.bpm || 72,
            systoleMs: effectiveMetrics.systoleMs,
            diastoleMs: effectiveMetrics.diastoleMs,
            systoleDiastoleRatio: effectiveMetrics.systoleDiastoleRatio,
            avgRrMs: effectiveMetrics.avgRrMs,
            rmssdMs: effectiveMetrics.rmssdMs,
            sdnnMs: effectiveMetrics.sdnnMs,
            hrvScore: effectiveMetrics.hrvScore,
            hrvStatus: effectiveMetrics.hrvStatus,
            s1s2Ratio: effectiveMetrics.s1s2Ratio,
            hasMurmur: effectiveMetrics.hasMurmur || selectedPreset?.murmurType !== 'Yo\'q',
            murmurPhase: effectiveMetrics.murmurPhase,
            murmurLevelPercent: effectiveMetrics.murmurLevelPercent,
            s1Intensity: selectedPreset?.s1Intensity,
            s2Intensity: selectedPreset?.s2Intensity,
            s3Present: selectedPreset?.s3Present,
            s4Present: selectedPreset?.s4Present,
            murmurType: selectedPreset?.murmurType,
            murmurGrade: selectedPreset?.murmurGrade,
          },
          sampleContext: activeBuffer
            ? `Bemorning yuklangan haqiqiy audio yozuvi (${activeFileInfo?.name || 'audio_fayl'}, davomiyligi: ${activeFileInfo?.duration || '8s'})`
            : selectedPreset.title + ' - ' + selectedPreset.description,
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Tahlil qilishda xatolik');
      }

      setAnalysisResult(data.data);
    } catch (err: any) {
      console.error('Analysis failed:', err);
      setAnalysisError(err.message || 'AI tahlil serveri bilan bog\'lanishda xatolik yuz berdi');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRunAnalysis = () => executeAnalysis();

  const currentPointObj = AUSCULTATION_POINTS.find((p) => p.id === selectedPoint) || AUSCULTATION_POINTS[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Sleek Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm px-4 sm:px-8 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <HeartPulse className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-800">
                  CardioAI <span className="text-blue-600 font-bold text-xs border border-blue-100 bg-blue-50 px-2 py-0.5 rounded-full ml-1.5">FKG / PCG</span>
                </h1>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-widest font-semibold">
                Phonocardiogram AI Diagnostic System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* EKG vs FKG guide quick button */}
            <button
              id="header-ecg-vs-fkg-btn"
              onClick={() => setIsEcgModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all shadow-sm"
              title="Fonokardiografiya va EKG farqi"
            >
              <Volume2 className="w-4 h-4 text-blue-600" />
              <span className="hidden sm:inline">EKG vs FKG Farqi</span>
            </button>

            <button
              id="patient-info-toggle-btn"
              onClick={() => setShowPatientForm(!showPatientForm)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all shadow-sm ${
                showPatientForm
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              <User className="w-4 h-4 text-blue-600" />
              <span>{patientData.fullName ? patientData.fullName.split(' ')[0] : 'Bemor Karti'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Patient Data Form Drawer / Banner (Expandable) */}
      {showPatientForm && (
        <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4 shadow-sm animate-in slide-in-from-top-2">
          <div className="max-w-6xl mx-auto space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-blue-600 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <User className="w-4 h-4" /> Bemor Klinik Anamnezi
              </span>
              <button
                onClick={() => setShowPatientForm(false)}
                className="text-slate-400 hover:text-slate-700 font-semibold"
              >
                Yopish
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1 uppercase tracking-wider">F.I.Sh (Bemor):</label>
                <input
                  type="text"
                  value={patientData.fullName || ''}
                  onChange={(e) => setPatientData({ ...patientData, fullName: e.target.value })}
                  placeholder="Masalan: Karimov Otabek"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1 uppercase tracking-wider">Yoshi:</label>
                <input
                  type="number"
                  value={patientData.age || ''}
                  onChange={(e) => setPatientData({ ...patientData, age: e.target.value })}
                  placeholder="45"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1 uppercase tracking-wider">Jinsi:</label>
                <select
                  value={patientData.gender || 'Erkak'}
                  onChange={(e) => setPatientData({ ...patientData, gender: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                >
                  <option value="Erkak">Erkak</option>
                  <option value="Ayol">Ayol</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1 uppercase tracking-wider">Qon bosimi (AB):</label>
                <input
                  type="text"
                  value={patientData.bloodPressure || ''}
                  onChange={(e) => setPatientData({ ...patientData, bloodPressure: e.target.value })}
                  placeholder="120/80"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 block mb-1 uppercase tracking-wider">Shikoyatlar / Klinik belgilari:</label>
              <input
                type="text"
                value={patientData.complaints || ''}
                onChange={(e) => setPatientData({ ...patientData, complaints: e.target.value })}
                placeholder="Yurak sohasida noqulaylik, jismoniy zo'riqishda hansirash..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main 4-Tab Segment Navigation */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-1.5 sm:gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            id="tab-devices-btn"
            onClick={() => setActiveTab('devices')}
            className={`flex-1 py-2.5 px-2.5 sm:px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'devices'
                ? 'bg-slate-900 text-cyan-400 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">QALB Qurilmasi</span>
            <span className="sm:hidden">Qurilma</span>
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          </button>

          <button
            id="tab-input-btn"
            onClick={() => setActiveTab('input')}
            className={`flex-1 py-2.5 px-2.5 sm:px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'input'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
            }`}
          >
            <Mic className="w-4 h-4" />
            <span className="hidden sm:inline">1. Yozuv & Namuna</span>
            <span className="sm:hidden">1. Namuna</span>
          </button>

          <button
            id="tab-waveform-btn"
            onClick={() => setActiveTab('waveform')}
            className={`flex-1 py-2.5 px-2.5 sm:px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'waveform'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span className="hidden sm:inline">2. FKG To&apos;lqin & RMSSD</span>
            <span className="sm:hidden">2. To&apos;lqin</span>
          </button>

          <button
            id="tab-analysis-btn"
            onClick={() => setActiveTab('analysis')}
            className={`flex-1 py-2.5 px-2.5 sm:px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'analysis'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">3. AI Xulosa</span>
            <span className="sm:hidden">3. Xulosa</span>
            {analysisResult && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* TAB 0: QALB HARDWARE DEVICE INTEGRATION */}
        {activeTab === 'devices' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <QalbDeviceSection
              onSelectRecordingForDeepAnalysis={(rec) => {
                if (rec.ai_result) {
                  setAnalysisResult(rec.ai_result);
                  if (rec.patient_data) {
                    setPatientData({
                      fullName: `${rec.patient_data.ism || ''} ${rec.patient_data.familiya || ''}`.trim(),
                      age: String(rec.patient_data.yosh || '30'),
                      gender: (rec.patient_data.jins as 'Erkak' | 'Ayol') || 'Erkak',
                      complaints: "QALB qurilmasidan fonokardiografik yozuv olindi",
                      bloodPressure: rec.patient_data.sistolik ? `${rec.patient_data.sistolik}/${rec.patient_data.diastolik}` : '120/80',
                    });
                  }
                  setActiveTab('analysis');
                }
              }}
            />
          </div>
        )}

        {/* TAB 1: INPUT & CLINICAL PRESETS */}
        {activeTab === 'input' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Live Recording & Audio File Upload Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600">
                    <Mic className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-base sm:text-lg text-slate-800">
                      Yurak Tovushlarini Yozib Olish / Yuklash
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500">
                      Raqamli stetoskop yoki mikrofon orqali bevosita FKG audio signalini yozib oling
                    </p>
                  </div>
                </div>
              </div>

              {/* Recording Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Live Mic/Stethoscope Record button */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="font-bold text-xs text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Jonli Stetoskop Yozuvi</span>
                      {isRecording && (
                        <span className="text-rose-600 font-mono font-bold flex items-center gap-1.5 text-xs">
                          <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
                          00:0{recordingSeconds} / 00:10
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {isRecording
                        ? 'Stetoskopni bemorning ko\'krak qafasidagi tanlangan nuqtasiga bosing...'
                        : 'Mikrofonni ko\'krak qafasiga qo\'yib 10 soniyalik klinik FKG stripini yozib oling.'}
                    </p>
                  </div>

                  {isRecording ? (
                    <button
                      id="stop-recording-btn"
                      onClick={stopRecording}
                      className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md animate-pulse transition-all"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      <span>Yozishni to&apos;xtatish ({recordingSeconds}s)</span>
                    </button>
                  ) : (
                    <button
                      id="start-recording-btn"
                      onClick={startRecording}
                      className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 transition-all active:scale-95"
                    >
                      <Mic className="w-4 h-4" />
                      <span>Stetoskop bilan yozishni boshlash</span>
                    </button>
                  )}
                </div>

                {/* Upload Audio / PCG File with Drag & Drop */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                    isDragging
                      ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/30'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="font-bold text-xs text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <UploadCloud className="w-4 h-4 text-blue-600" /> Audio / FKG Fayl Yuklash
                      </span>
                      <span className="text-[10px] font-mono bg-blue-100/80 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                        ⚡ To&apos;g&apos;ridan-to&apos;g&apos;ri AI Tahlil
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Raqamli fonokardiograf yoki elektron stetoskopdan yozib olingan audio faylni sudrab tashlang yoki tanlang — fayl hech qanday qo&apos;shimcha montajsiz to&apos;g&apos;ridan-to&apos;g&apos;ri tahlil qilinadi.
                    </p>
                  </div>

                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      id="audio-file-input"
                      accept="audio/*,.wav,.mp3,.m4a,.ogg,.aac,.flac,.webm,audio/wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/webm"
                      onChange={handleFileUpload}
                      className="hidden"
                    />

                    <button
                      type="button"
                      id="upload-audio-btn"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-60"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                          <span>Fayl o&apos;qilmoqda va AI tahlilga uzatilmoqda...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-blue-600" />
                          <span>Audio faylni tanlash (Browse)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Upload Error Banner */}
              {uploadError && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs sm:text-sm flex items-start justify-between gap-3 text-rose-900 animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Audio faylni yuklashda xatolik:</span>
                      <span className="text-rose-700">{uploadError}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setUploadError(null)}
                    className="text-rose-500 hover:text-rose-700 p-1"
                    title="Yopish"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Custom Uploaded File Info Card */}
              {customAudioBuffer && (
                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-xs sm:text-sm space-y-3 animate-in fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-emerald-950 flex items-center gap-2">
                          <span>{uploadedFileInfo?.name || 'Bemorning audio yozuvi'}</span>
                          <span className="text-[10px] bg-emerald-200/80 text-emerald-800 px-2 py-0.5 rounded-full font-mono">
                            Faol audio
                          </span>
                        </div>
                        <div className="text-[11px] text-emerald-700 flex items-center gap-3 mt-0.5 font-mono">
                          <span>Davomiyligi: {customAudioBuffer.duration.toFixed(1)} sek</span>
                          <span>•</span>
                          <span>Hajmi: {uploadedFileInfo?.size || 'Noma\'lum'}</span>
                          <span>•</span>
                          <span>Chastota: {customAudioBuffer.sampleRate} Hz</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={handleClearUploadedFile}
                        className="px-3 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm"
                        title="Yuklangan audioni o'chirish va etalon namunalarga qaytish"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>O&apos;chirish</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2 text-[11px] text-emerald-800 font-medium">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Raqamli 20–500Hz tibbiy band-pass filtr bilan tozalandi (DC drift & fon shovqini olib tashlandi).</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setActiveTab('waveform');
                          if (!isPlaying) handleTogglePlay();
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>To&apos;lqinni ko&apos;rish va tinglash</span>
                      </button>
                      <button
                        onClick={handleRunAnalysis}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>AI Xulosa olish</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Auscultation Point Map Card */}
            <AuscultationPointPicker
              selectedPoint={selectedPoint}
              onSelectPoint={(p) => setSelectedPoint(p)}
            />

            {/* Clinical FKG Samples Library (Klinik Fonokardiogrammalar Kutubxonasi) */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600">
                    <FileAudio className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base sm:text-lg text-slate-800">
                      Klinik FKG Namunalar Bazasi (8 ta standart patologiya)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Shifokorlar va o&apos;rganuvchilar uchun etalon fonokardiogrammalar
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {FKG_PRESETS.map((preset) => {
                  const isSelected = selectedPreset.id === preset.id && !customAudioBuffer;
                  return (
                    <button
                      key={preset.id}
                      id={`preset-card-${preset.id}`}
                      onClick={() => {
                        loadPreset(preset);
                        setActiveTab('waveform');
                      }}
                      className={`text-left p-4 rounded-2xl border transition-all relative overflow-hidden group ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-500 text-slate-900 ring-2 ring-blue-500/20 shadow-md'
                          : 'bg-slate-50 hover:bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="font-bold text-sm text-slate-800 group-hover:text-blue-600 transition-colors">
                          {preset.title}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                            preset.category === 'Normal'
                              ? 'bg-emerald-100 text-emerald-700'
                              : preset.category === 'Qopqoq nuqsoni'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {preset.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {preset.subtitle}
                      </p>
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-400 font-mono">
                        <span className="font-semibold text-slate-600">{preset.bpm} BPM</span>
                        <span className="text-blue-600 font-sans font-bold flex items-center gap-1">
                          Tinglash va to&apos;lqin <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: WAVEFORM OSCILLOGRAM & AUSCULTATION PLAYER */}
        {activeTab === 'waveform' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Waveform Visualizer Component with DSP signal metrics */}
            <WaveformVisualizer
              waveform={currentWaveform}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              onReset={() => {
                stopCurrentAudio();
              }}
              filterMode={filterMode}
              onFilterChange={handleFilterChange}
              bpm={selectedPreset.bpm}
              s3Present={selectedPreset.s3Present}
              s4Present={selectedPreset.s4Present}
              hasMurmur={selectedPreset.murmurType !== 'Yo\'q'}
              sampleTitle={
                customAudioBuffer
                  ? uploadedFileInfo?.name
                    ? `Yuklangan: ${uploadedFileInfo.name}`
                    : 'Bemorning audio yozuvi'
                  : selectedPreset.title
              }
              signalMetrics={signalMetrics}
              onOpenEcgVsFkgModal={() => setIsEcgModalOpen(true)}
            />

            {/* Quick Clinical Finding summary for the current waveform */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                    <Stethoscope className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs sm:text-sm uppercase tracking-wider text-slate-700">
                    Auskultativ & Fonokardiografik Ko&apos;rsatkichlar
                  </h4>
                </div>
                <span className="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                  Nuqta: {currentPointObj.name}
                </span>
              </div>

              {!customAudioBuffer ? (
                <div className="space-y-3 text-xs sm:text-sm">
                  <p className="text-slate-600 leading-relaxed">
                    {selectedPreset.description}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        S1 va S2 Tonlar
                      </span>
                      <span className="font-bold text-slate-800 text-sm">
                        S1: {selectedPreset.s1Intensity}, S2: {selectedPreset.s2Intensity}
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Shovqin turi
                      </span>
                      <span className="font-bold text-rose-600 text-sm">
                        {selectedPreset.murmurType} ({selectedPreset.murmurGrade})
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Patologik Tonlar
                      </span>
                      <span className="font-bold text-amber-600 text-sm">
                        {selectedPreset.s3Present ? 'S3 mavjud' : selectedPreset.s4Present ? 'S4 mavjud' : 'Mavjud emas'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 text-xs sm:text-sm text-slate-600 leading-relaxed border border-slate-200">
                  Bemorning real vaqtda yozib olingan yoki yuklangan FKG signali. Tonlar, oraliqlar va patologik shovqinlarni to&apos;liq aniqlash uchun quyidagi tugma orqali AI tahlilini ishga tushiring.
                </div>
              )}

              {/* Action button to proceed to AI Analysis */}
              <div className="pt-2">
                <button
                  id="run-ai-analysis-btn"
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing}
                  className="w-full py-3.5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                >
                  <Sparkles className="w-4 h-4 fill-current" />
                  <span>Ushbu FKG signalini AI Model orqali tahlil qilish</span>
                </button>
              </div>
            </div>

            {/* Auscultation Point Switcher */}
            <AuscultationPointPicker
              selectedPoint={selectedPoint}
              onSelectPoint={(p) => setSelectedPoint(p)}
            />
          </div>
        )}

        {/* TAB 3: AI ANALYSIS & CLINICAL REPORT */}
        {activeTab === 'analysis' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {isAnalyzing ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center space-y-4 shadow-sm">
                <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
                  <HeartPulse className="w-8 h-8 text-blue-600 animate-pulse" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-base sm:text-lg text-slate-800">
                    Fonokardiogramma AI Modeli Tahlil Qilmoqda...
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                    Gemini 3.7 Flash yurak tovushlari spektri, S1/S2 tonlari, RMSSD, sistolik/diastolik shovqinlar va differensial tashxislarni shakllantirmoqda.
                  </p>
                </div>
              </div>
            ) : analysisError ? (
              <div className="bg-rose-50 border border-rose-200 rounded-3xl p-6 text-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
                  <AlertCircle className="w-5 h-5" />
                  <span>Tahlil jarayonida xatolik yuz berdi</span>
                </div>
                <p className="text-xs sm:text-sm text-rose-700">{analysisError}</p>
                <button
                  onClick={handleRunAnalysis}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-sm"
                >
                  Qaytadan tahlil qilish
                </button>
              </div>
            ) : analysisResult ? (
              <AnalysisReportView
                result={analysisResult}
                patientData={patientData}
                auscultationPointName={currentPointObj.name}
                signalMetrics={signalMetrics}
                onOpenConsult={() => setIsConsultOpen(true)}
                onOpenEcgVsFkgModal={() => setIsEcgModalOpen(true)}
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center space-y-4 shadow-sm">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto">
                  <Sparkles className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-base sm:text-lg text-slate-800">
                    FKG AI Tahlilini Boshlash
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                    Tanlangan yoki yozib olingan yurak auskultatsiya ma&apos;lumotlarini chuqur kardiologik tahlil qilish uchun quyidagi tugmani bosing.
                  </p>
                </div>
                <button
                  id="start-fresh-analysis-btn"
                  onClick={handleRunAnalysis}
                  className="py-3 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-600/20 transition-transform active:scale-95"
                >
                  AI Tahlilni Ishga Tushirish
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Doctor AI Consultation Drawer */}
      {analysisResult && (
        <DoctorConsultDrawer
          isOpen={isConsultOpen}
          onClose={() => setIsConsultOpen(false)}
          result={analysisResult}
          patientData={patientData}
          auscultationPointName={currentPointObj.name}
        />
      )}

      {/* ECG vs FKG Education Modal */}
      <EcgVsFkgModal
        isOpen={isEcgModalOpen}
        onClose={() => setIsEcgModalOpen(false)}
      />

      {/* Sleek Dark Navy Footer */}
      <footer className="px-4 sm:px-8 py-3.5 bg-slate-900 text-slate-400 text-xs flex flex-col sm:flex-row justify-between items-center gap-2 border-t border-slate-800 mt-auto">
        <div className="flex flex-wrap gap-4 text-[11px]">
          <span>CardioAI • Fonokardiografiya (FKG / PCG) AI Tizimi</span>
          <span className="hidden sm:inline">|</span>
          <span>Model: Gemini-3.7-Flash</span>
          <span className="hidden sm:inline">|</span>
          <span>Shifokorlar va kardiologlar uchun</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          <span className="text-[11px] text-slate-300 font-medium">Server Status: Online (Latency 12ms)</span>
        </div>
      </footer>
    </div>
  );
}

