import React, { useState, useEffect, useRef } from 'react';
import {
  Cpu,
  Wifi,
  WifiOff,
  Radio,
  Play,
  Pause,
  Clock,
  BatteryCharging,
  Activity,
  Heart,
  Download,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  HelpCircle,
  RefreshCw,
  Terminal,
  Volume2,
  FileText,
  Layers,
  ChevronRight,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { QalbDevice, PatientRecord, QalbRecording, DeviceCommand } from '../types';
import { getAgeNorm, evaluateHeartRate } from '../utils/ageNorms';
import { downloadQalbRecordingZip } from '../utils/zipExport';

interface QalbDeviceSectionProps {
  onSelectRecordingForDeepAnalysis?: (recording: QalbRecording) => void;
}

export const QalbDeviceSection: React.FC<QalbDeviceSectionProps> = ({
  onSelectRecordingForDeepAnalysis,
}) => {
  // State
  const [devices, setDevices] = useState<QalbDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<QalbDevice | null>(null);
  const [recordings, setRecordings] = useState<QalbRecording[]>([]);
  const [currentRecording, setCurrentRecording] = useState<QalbRecording | null>(null);
  const [loadingDevices, setLoadingDevices] = useState(false);

  // Patient Form
  const [patient, setPatient] = useState<PatientRecord>({
    ism: 'Nodir',
    familiya: 'Karimov',
    yosh: 34,
    jins: 'Erkak',
    homilador: false,
    sistolik: 120,
    diastolik: 80,
    auskultatsiya_nuqtasi: "Mitral (cho'qqi)",
  });

  // Command Execution State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<'idle' | 'pending' | 'taken' | 'recording' | 'uploading' | 'done' | 'failed'>('idle');
  const [countdown, setCountdown] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Audio Playback
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Modals
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [showCurlModal, setShowCurlModal] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // Age Norms Calculation
  const ageNorm = getAgeNorm(patient.yosh || 30, patient.homilador || false);

  // Fetch devices
  const fetchDevices = async () => {
    try {
      setLoadingDevices(true);
      const res = await fetch('/api/devices');
      const data = await res.json();
      if (data.ok && Array.isArray(data.devices)) {
        setDevices(data.devices);
        if (!selectedDevice && data.devices.length > 0) {
          setSelectedDevice(data.devices[0]);
        } else if (selectedDevice) {
          const updated = data.devices.find((d: QalbDevice) => d.id === selectedDevice.id);
          if (updated) setSelectedDevice(updated);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch devices:', err);
    } finally {
      setLoadingDevices(false);
    }
  };

  // Fetch recordings
  const fetchRecordings = async () => {
    try {
      const res = await fetch('/api/recordings');
      const data = await res.json();
      if (data.ok && Array.isArray(data.recordings)) {
        setRecordings(data.recordings);
        if (!currentRecording && data.recordings.length > 0) {
          setCurrentRecording(data.recordings[0]);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch recordings:', err);
    }
  };

  // Initial Load & Periodic Polling (every 4s)
  useEffect(() => {
    fetchDevices();
    fetchRecordings();
    const interval = setInterval(() => {
      fetchDevices();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Poll Active Job
  useEffect(() => {
    if (!activeJobId || jobState === 'done' || jobState === 'failed') return;

    const pollJob = async () => {
      try {
        const res = await fetch(`/api/device/command/${activeJobId}`);
        const data = await res.json();
        if (data.ok && data.command) {
          const cmd: DeviceCommand = data.command;
          if (cmd.state === 'pending') {
            setJobState('pending');
            setStatusMessage("Buyruq yuborildi. Qurilma so'rovini kutmoqda...");
          } else if (cmd.state === 'taken') {
            setJobState('recording');
            setStatusMessage(`Qurilma yozmoqda... (${cmd.sec} soniya)`);
          } else if (cmd.state === 'done') {
            setJobState('done');
            setStatusMessage('Yozuv muvaffaqiyatli qabul qilindi va AI tahlili yakunlandi!');
            if (data.recording) {
              setCurrentRecording(data.recording);
              fetchRecordings();
            }
            setActiveJobId(null);
          } else if (cmd.state === 'failed') {
            setJobState('failed');
            setStatusMessage('Kutilmagan xatolik: Qurilma javob bermadi.');
            setActiveJobId(null);
          }
        }
      } catch (e) {
        console.warn('Job polling error:', e);
      }
    };

    const timer = setInterval(pollJob, 1000);
    return () => clearInterval(timer);
  }, [activeJobId, jobState]);

  // Countdown timer for recording progress
  useEffect(() => {
    if (countdown > 0 && (jobState === 'recording' || jobState === 'taken')) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown, jobState]);

  // Handle Command Trigger (15s or 30s)
  const handleStartRecording = async (sec: 15 | 30) => {
    if (!selectedDevice) {
      alert("Iltimos, avval ro'yxatdan QALB qurilmasini tanlang.");
      return;
    }

    try {
      setJobState('pending');
      setStatusMessage("Buyruq yuborilmoqda...");
      setCountdown(sec);

      const res = await fetch('/api/device/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: selectedDevice.id,
          sec,
          patient_data: patient,
        }),
      });

      const data = await res.json();
      if (data.ok && data.job_id) {
        setActiveJobId(data.job_id);
        setStatusMessage(`Buyruq navbatga qo'yildi (${sec} s). Qurilma har 3s da tekshirmoqda...`);
      } else {
        setJobState('failed');
        setStatusMessage(data.error || 'Buyruq yuborishda xatolik');
      }
    } catch (err: any) {
      setJobState('failed');
      setStatusMessage('Server bilan aloqa uzildi: ' + err.message);
    }
  };

  // Hardware Simulation Test
  const handleRunSimulation = async (sec: 15 | 30 = 15) => {
    try {
      setIsSimulating(true);
      setJobState('recording');
      setStatusMessage(`QALB apparat simulyatori yozuv olmoqda (${sec} s)...`);
      setCountdown(sec);

      const res = await fetch('/api/device/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: selectedDevice?.id || 'QALB-DEMO01',
          sec,
          patient_data: patient,
        }),
      });

      const data = await res.json();
      if (data.ok && data.recording) {
        setJobState('done');
        setStatusMessage('Simulyator o\'lchovi muvaffaqiyatli yakunlandi!');
        setCurrentRecording(data.recording);
        fetchDevices();
        fetchRecordings();
      }
    } catch (e: any) {
      setJobState('failed');
      setStatusMessage('Simulyatsiya xatosi: ' + e.message);
    } finally {
      setIsSimulating(false);
      setTimeout(() => {
        if (jobState === 'done') setJobState('idle');
      }, 4000);
    }
  };

  // Play / Pause WAV audio
  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  return (
    <div id="qalb-device-integration" className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
                ESP32 Hardware Integratsiyasi
              </span>
              <span className="text-xs text-slate-400">Firmware v14 • Polling Protocol</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <Cpu className="w-7 h-7 text-cyan-400" />
              QALB — Portativ Fonokardiograf Qurilmasi
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl mt-1">
              WiFi orqali to'g'ridan-to'g'ri ulangan ESP32 qurilmasidan fonokardiogramma va yurak tonlarini real vaqtda qabul qilish, avtonom spektrogramma chizish va chuqur AI tahlilini amalga oshirish.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              id="btn-setup-guide"
              onClick={() => setShowSetupGuide(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition flex items-center gap-1.5"
            >
              <HelpCircle className="w-4 h-4 text-cyan-400" />
              Sozlash yo'riqnomasi
            </button>
            <button
              id="btn-curl-guide"
              onClick={() => setShowCurlModal(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition flex items-center gap-1.5"
            >
              <Terminal className="w-4 h-4 text-emerald-400" />
              cURL / Test buyruqlari
            </button>
            <button
              id="btn-refresh-devices"
              onClick={() => {
                fetchDevices();
                fetchRecordings();
              }}
              disabled={loadingDevices}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Yangilash"
            >
              <RefreshCw className={`w-4 h-4 ${loadingDevices ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Device Picker & Patient Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Devices List (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                Faol QALB Qurilmalari
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                {devices.length} ta qurilma
              </span>
            </div>

            {devices.length === 0 ? (
              <div className="p-5 bg-slate-950/60 rounded-xl border border-dashed border-slate-800 text-center">
                <WifiOff className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-300">Hozircha faol qurilma ulanmagan</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Qurilmani WiFi ga ulang yoki test simulyatoridan foydalaning.
                </p>
                <button
                  onClick={() => handleRunSimulation(15)}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-medium border border-cyan-500/30 hover:bg-cyan-500/30 transition"
                >
                  Test qurilmasini yaratish
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {devices.map((dev) => {
                  const isSelected = selectedDevice?.id === dev.id;
                  const isOnline = dev.isOnline;
                  const isRecording = dev.status === 'recording';

                  return (
                    <div
                      key={dev.id}
                      id={`device-card-${dev.id}`}
                      onClick={() => setSelectedDevice(dev)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer relative ${
                        isSelected
                          ? 'bg-cyan-950/40 border-cyan-500/60 shadow-md shadow-cyan-950/40'
                          : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-white tracking-wider">
                              {dev.id}
                            </span>
                            {isRecording ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-500/30 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                Yozmoqda
                              </span>
                            ) : isOnline ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                Onlayn
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                Oflayn
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{dev.name}</p>
                        </div>

                        {dev.battery !== undefined && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                            <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
                            {dev.battery}%
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-500">
                        <span>FW: {dev.fw}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(dev.last_seen).toLocaleTimeString('uz-UZ')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Simulation Quick Launcher */}
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="p-3 bg-slate-950/80 rounded-xl border border-cyan-900/30 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    Apparat Simulyatori
                  </span>
                  <p className="text-[10px] text-slate-400">Jismoniy qurilmasiz to'liq oqimni sinash</p>
                </div>
                <button
                  id="btn-run-simulation"
                  onClick={() => handleRunSimulation(15)}
                  disabled={isSimulating}
                  className="px-2.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition flex items-center gap-1 disabled:opacity-50 shadow-sm"
                >
                  {isSimulating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Sinash
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Patient Blank & Measure Trigger (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  Bemor Blankasi va O'lchov Sozlamalari
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Qurilmadan kelgan yozuv avtomatik tarzda ushbu bemor kartasiga biriktiriladi.
                </p>
              </div>
              {selectedDevice && (
                <div className="text-right">
                  <span className="text-xs text-slate-400">Tanlangan:</span>{' '}
                  <span className="font-mono text-xs font-bold text-cyan-400">{selectedDevice.id}</span>
                </div>
              )}
            </div>

            {/* Patient Form Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Ism</label>
                <input
                  type="text"
                  value={patient.ism}
                  onChange={(e) => setPatient({ ...patient, ism: e.target.value })}
                  placeholder="Ism"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Familiya</label>
                <input
                  type="text"
                  value={patient.familiya}
                  onChange={(e) => setPatient({ ...patient, familiya: e.target.value })}
                  placeholder="Familiya"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Yoshi: <span className="font-bold text-cyan-300">{patient.yosh} yosh</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={patient.yosh}
                  onChange={(e) => setPatient({ ...patient, yosh: parseInt(e.target.value, 10) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Jinsi</label>
                <select
                  value={patient.jins}
                  onChange={(e) => setPatient({ ...patient, jins: e.target.value as any, homilador: e.target.value === 'Erkak' ? false : patient.homilador })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="Erkak">Erkak</option>
                  <option value="Ayol">Ayol</option>
                </select>
              </div>
            </div>

            {/* Secondary Row: Pregnancy (conditional), Blood Pressure, Auscultation Point */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {patient.jins === 'Ayol' ? (
                <div className="flex items-center gap-2.5 p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                  <input
                    type="checkbox"
                    id="pregnant-check"
                    checked={!!patient.homilador}
                    onChange={(e) => setPatient({ ...patient, homilador: e.target.checked })}
                    className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
                  />
                  <label htmlFor="pregnant-check" className="text-xs text-slate-300 cursor-pointer select-none">
                    <span className="font-semibold text-rose-300">Homiladorlik holati</span>
                    <span className="block text-[10px] text-slate-400">(Norma yuqori chegarasi +15 bpm)</span>
                  </label>
                </div>
              ) : (
                <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Klinik kategoriya:</span>
                  <span className="text-xs font-medium text-slate-300">{ageNorm.category}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Qon bosimi (Sist / Diast)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={patient.sistolik || 120}
                    onChange={(e) => setPatient({ ...patient, sistolik: parseInt(e.target.value, 10) || 120 })}
                    placeholder="120"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white text-center"
                  />
                  <input
                    type="number"
                    value={patient.diastolik || 80}
                    onChange={(e) => setPatient({ ...patient, diastolik: parseInt(e.target.value, 10) || 80 })}
                    placeholder="80"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Auskultatsiya Nuqtasi</label>
                <select
                  value={patient.auskultatsiya_nuqtasi}
                  onChange={(e) => setPatient({ ...patient, auskultatsiya_nuqtasi: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="Mitral (cho'qqi)">Mitral (cho'qqi) — Standart S1</option>
                  <option value="Trikuspidal (4-qovurg'a orasi)">Trikuspidal (4-qovurg'a)</option>
                  <option value="Aortal (o'ng 2-qovurg'a)">Aortal (o'ng 2-qovurg'a)</option>
                  <option value="Pulmonal (chap 2-qovurg'a)">Pulmonal (chap 2-qovurg'a)</option>
                  <option value="Botkin-Erb nuqtasi">Botkin-Erb nuqtasi</option>
                </select>
              </div>
            </div>

            {/* Dynamic Age Norm Banner */}
            <div className="p-3.5 bg-gradient-to-r from-slate-950 via-cyan-950/20 to-slate-950 rounded-xl border border-cyan-800/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Heart className="w-5 h-5 text-rose-400 animate-pulse" />
                <div>
                  <span className="text-xs font-semibold text-slate-200">
                    Yosh bo'yicha yurak urish me'yori ({ageNorm.category}):
                  </span>
                  <span className="ml-2 font-mono text-sm font-bold text-cyan-400">{ageNorm.label}</span>
                </div>
              </div>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Ogohlantirishlar aynan shu normaga nisbatan hisoblanadi
              </span>
            </div>

            {/* Execution Buttons: 15s & 30s */}
            <div className="pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  id="btn-record-15s"
                  onClick={() => handleStartRecording(15)}
                  disabled={jobState === 'recording' || jobState === 'pending' || !selectedDevice}
                  className="py-3.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 font-bold text-sm transition shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Clock className="w-4 h-4" />
                  15 Soniya Yozish (Ekspress)
                </button>

                <button
                  id="btn-record-30s"
                  onClick={() => handleStartRecording(30)}
                  disabled={jobState === 'recording' || jobState === 'pending' || !selectedDevice}
                  className="py-3.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white font-bold text-sm border border-slate-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Activity className="w-4 h-4 text-cyan-400" />
                  30 Soniya Yozish (Klinik chuqur)
                </button>
              </div>

              {/* Status & Progress tracker */}
              {statusMessage && (
                <div
                  className={`mt-3 p-3 rounded-xl border text-xs flex items-center justify-between ${
                    jobState === 'recording' || jobState === 'pending'
                      ? 'bg-cyan-950/60 border-cyan-500/40 text-cyan-200'
                      : jobState === 'done'
                      ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                      : jobState === 'failed'
                      ? 'bg-rose-950/60 border-rose-500/40 text-rose-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {jobState === 'recording' || jobState === 'pending' ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                    ) : jobState === 'done' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>{statusMessage}</span>
                  </div>

                  {countdown > 0 && (jobState === 'recording' || jobState === 'taken') && (
                    <span className="font-mono font-bold text-cyan-300 text-sm px-2 py-0.5 bg-cyan-900/40 rounded-lg">
                      {countdown} s
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RESULT SECTION: Spectrogram, Audio Player, Metrics, AI Result & ZIP Export */}
      {currentRecording && (
        <div id="qalb-result-card" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  QALB Yozuvi Tayyor
                </span>
                <span className="text-xs text-slate-400 font-mono">Job: {currentRecording.job_id?.slice(0, 8)}...</span>
              </div>
              <h3 className="text-xl font-bold text-white mt-1">
                {currentRecording.patient_data?.ism} {currentRecording.patient_data?.familiya} — Fonokardiogramma Natijasi
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Qurilma: <span className="font-mono text-cyan-400">{currentRecording.device_id}</span> • Sana:{' '}
                {new Date(currentRecording.created_at).toLocaleString('uz-UZ')} • Davomiyligi:{' '}
                {currentRecording.sec} soniya
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onSelectRecordingForDeepAnalysis && (
                <button
                  id="btn-deep-analysis-qalb"
                  onClick={() => onSelectRecordingForDeepAnalysis(currentRecording)}
                  className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/20 flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  Chuqur Tahlilga O'tish
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                id="btn-download-zip"
                onClick={() => downloadQalbRecordingZip(currentRecording)}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                ZIP Yuklab Olish (Paket)
              </button>
            </div>
          </div>

          {/* Metric Cards Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {/* BPM & Age Norm */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
              <span className="text-xs text-slate-400 font-medium">Yurak Urishi (ChSS)</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black font-mono text-cyan-400">{currentRecording.bpm}</span>
                <span className="text-xs text-slate-400">BPM</span>
              </div>
              <div className="mt-2">
                {(() => {
                  const ev = evaluateHeartRate(
                    currentRecording.bpm,
                    currentRecording.patient_data?.yosh || 30,
                    currentRecording.patient_data?.homilador || false
                  );
                  return (
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ev.badgeClass}`}>
                      {ev.label}
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Rhythm */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
              <span className="text-xs text-slate-400 font-medium">Ritm Holati</span>
              <div className="text-lg font-bold text-white mt-1 truncate">
                {currentRecording.rhythm || 'Muntazam'}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Sinusli ritmika</p>
            </div>

            {/* Beats Count */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
              <span className="text-xs text-slate-400 font-medium">Urishlar Soni</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black font-mono text-white">{currentRecording.beats}</span>
                <span className="text-xs text-slate-400">ta zarba</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">{currentRecording.sec} soniyalik oraliqda</p>
            </div>

            {/* Quality */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
              <span className="text-xs text-slate-400 font-medium">Signal Sifati</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black font-mono text-emerald-400">{currentRecording.quality}%</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-emerald-400 h-full rounded-full"
                  style={{ width: `${currentRecording.quality}%` }}
                />
              </div>
            </div>
          </div>

          {/* Audio Player */}
          {currentRecording.audio_url && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  id="btn-play-audio"
                  onClick={toggleAudio}
                  className="w-11 h-11 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center shadow-md transition"
                >
                  {isPlayingAudio ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>
                <div>
                  <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-cyan-400" />
                    QALB Auskultatsiya Audio Yozuvi (16-bit PCM WAV)
                  </h4>
                  <p className="text-xs text-slate-400">
                    Diskretlash: {currentRecording.sample_rate} Hz • Nuqta: {currentRecording.patient_data?.auskultatsiya_nuqtasi || "Mitral cho'qqi"}
                  </p>
                </div>
              </div>

              <audio
                ref={audioRef}
                src={currentRecording.audio_url}
                onEnded={() => setIsPlayingAudio(false)}
                className="hidden"
              />
              <span className="text-xs font-mono text-slate-400">
                {currentRecording.sec} soniya
              </span>
            </div>
          )}

          {/* Spectrogram & Waveform Visualization */}
          {currentRecording.image_url && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Raqamli Spektrogramma va To'lqin Shakli (0–500 Hz STFT Hann)
                </span>
                <span className="text-[11px] text-slate-500">1100x650 px vektor formati</span>
              </div>
              <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex justify-center p-2">
                <img
                  src={currentRecording.image_url}
                  alt="QALB Fonokardiogramma Spektrogrammasi"
                  className="w-full max-h-[550px] object-contain rounded-lg shadow-md"
                />
              </div>
            </div>
          )}

          {/* AI Clinical Diagnosis Report */}
          {currentRecording.ai_result && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  <h4 className="text-base font-bold text-white">AI Kardiologik Tahlil Xulosasi</h4>
                </div>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Klinik Baholash
                </span>
              </div>

              <div className="prose prose-invert max-w-none text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                {currentRecording.ai_result.doctorFormalSummary}
              </div>

              {/* Recommendations */}
              {currentRecording.ai_result.clinicalRecommendations?.length > 0 && (
                <div className="pt-3 border-t border-slate-800">
                  <h5 className="text-xs font-semibold text-slate-200 mb-2">Tavsiya etilgan klinik choralar:</h5>
                  <ul className="space-y-1.5">
                    {currentRecording.ai_result.clinicalRecommendations.map((rec: string, idx: number) => (
                      <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                        <span className="text-cyan-400 font-bold">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Mandatory Medical Disclaimer */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2.5 text-amber-200 text-xs">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                <span>
                  <strong>Eslatma:</strong> Bu skrining natijasi, tibbiy tashxis emas. Yakuniy bahoni shifokor beradi.
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PAST RECORDINGS LIST */}
      {recordings.length > 1 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            Oldingi QALB Yozuvlari Tarixi ({recordings.length} ta)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {recordings.map((rec) => (
              <div
                key={rec.id}
                onClick={() => setCurrentRecording(rec)}
                className={`p-3 rounded-xl border transition cursor-pointer ${
                  currentRecording?.id === rec.id
                    ? 'bg-cyan-950/40 border-cyan-500/60'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">
                    {rec.patient_data?.ism} {rec.patient_data?.familiya}
                  </span>
                  <span className="font-mono text-cyan-400 font-bold">{rec.bpm} BPM</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                  <span>{rec.patient_data?.auskultatsiya_nuqtasi || 'Mitral'}</span>
                  <span>{new Date(rec.created_at).toLocaleTimeString('uz-UZ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SETUP GUIDE MODAL */}
      {showSetupGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-cyan-400" />
                QALB Qurilmasini Sozlash Yo'riqnomasi
              </h3>
              <button
                onClick={() => setShowSetupGuide(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm text-slate-300">
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
                <h4 className="font-bold text-white flex items-center gap-2 mb-1 text-cyan-300">
                  <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs">1</span>
                  1-qadam: Qurilma WiFi nuqtasiga ulanish
                </h4>
                <p className="text-xs text-slate-400 ml-8">
                  QALB qurilmasini yoqing. Telefonda yoki noutbukda Wi-Fi sozlamalarini ochib, <code className="text-cyan-300 font-mono">PCG-Monitor</code> nomli tarmoqqa ulaning.
                  <br />
                  Parol: <code className="text-cyan-300 font-mono">12345678</code>
                </p>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
                <h4 className="font-bold text-white flex items-center gap-2 mb-1 text-cyan-300">
                  <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs">2</span>
                  2-qadam: Sozlash sahifasini ochish
                </h4>
                <p className="text-xs text-slate-400 ml-8">
                  Brauzerda <code className="text-cyan-300 font-mono">http://192.168.4.1</code> manziliga kiring. Qurilmaning veb-boshqaruv paneli ochiladi.
                </p>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
                <h4 className="font-bold text-white flex items-center gap-2 mb-1 text-cyan-300">
                  <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs">3</span>
                  3-qadam: Internet va Platforma manzilini kiritish
                </h4>
                <p className="text-xs text-slate-400 ml-8">
                  Klinika yoki uydagi Wi-Fi nomi va parolini kiriting hamda Platforma server manziliga quyidagini nusxalang:
                </p>
                <div className="ml-8 mt-2 p-2.5 bg-slate-900 rounded-lg border border-slate-800 font-mono text-xs text-emerald-400 flex items-center justify-between">
                  <span>https://fkg-tahlil-fonokardiogramma-ai.ai.studio</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowSetupGuide(false)}
                className="px-5 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition"
              >
                Tushundim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CURL / HARDWARE TEST MODAL */}
      {showCurlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Terminal className="w-5 h-5 text-emerald-400" />
                ESP32 & cURL Test Buyruqlari
              </h3>
              <button
                onClick={() => setShowCurlModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              ESP32 firmware yoki terminaldan to'g'ridan-to'g'ri test qilish buyruqlari:
            </p>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-500"># 1. Ro'yxatdan o'tish (Register)</span>
                <pre className="text-emerald-400 mt-1 whitespace-pre-wrap">
                  {`curl -X POST http://localhost:3000/api/device/register \\
  -H 'Content-Type: application/json' \\
  -d '{"device_id":"QALB-TEST01","name":"QALB Test Monitor","fw":"v14"}'`}
                </pre>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-500"># 2. Buyruq so'rash (Command Polling)</span>
                <pre className="text-cyan-400 mt-1 whitespace-pre-wrap">
                  {`curl http://localhost:3000/api/device/QALB-TEST01/command`}
                </pre>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-500"># 3. Xom 16-bit PCM yuklash (Upload Raw Audio)</span>
                <pre className="text-amber-400 mt-1 whitespace-pre-wrap">
                  {`head -c 30000 /dev/urandom > test.pcm
curl -X POST "http://localhost:3000/api/device/QALB-TEST01/upload?rate=1000&sec=15&bpm=78&rhythm=Muntazam&beats=20&quality=85" \\
  -H 'Content-Type: application/octet-stream' \\
  --data-binary @test.pcm`}
                </pre>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowCurlModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
