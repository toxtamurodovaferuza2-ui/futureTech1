export type AuscultationPointId = 'mitral' | 'aortic' | 'pulmonic' | 'tricuspid' | 'erb';

export interface AuscultationPoint {
  id: AuscultationPointId;
  name: string;
  latinName: string;
  location: string;
  anatomicalDescription: string;
  bestFor: string;
  coords: { x: number; y: number }; // % on chest model
}

export interface PatientData {
  fullName?: string;
  age?: number | string;
  gender?: 'Erkak' | 'Ayol' | 'Boshqa';
  complaints?: string;
  bloodPressure?: string;
  ecgNote?: string;
}

export interface FKGSignalMetrics {
  bpm: number;
  systoleMs: number;
  diastoleMs: number;
  systoleDiastoleRatio: number;
  avgRrMs: number;
  rrIntervalsMs: number[];
  rmssdMs: number;
  sdnnMs: number;
  hrvScore: number; // 0 - 100
  hrvStatus: 'Optimal' | 'O\'rtacha normativ' | 'Past (Simpatik zo\'riqish)' | 'Nomuntazam (Aritmiya)';
  s1Amplitude: number;
  s2Amplitude: number;
  s1s2Ratio: number;
  hasMurmur: boolean;
  murmurPhase: 'Sistolik' | 'Diastolik' | 'Sistolo-diastolik' | 'Yo\'q';
  murmurLevelPercent: number;
  samplingRate: number;
  signalDurationSec: number;
}

export interface FKGPreset {
  id: string;
  title: string;
  subtitle: string;
  category: 'Normal' | 'Qopqoq nuqsoni' | 'Ritm buzilishi' | 'Miokard kasalligi';
  auscultationPoint: AuscultationPointId;
  bpm: number;
  description: string;
  s1Intensity: 'Normal' | 'Kuchaygan' | 'Sustlashgan';
  s2Intensity: 'Normal' | 'Kuchaygan' | 'Sustlashgan' | 'Ajralgan';
  s3Present: boolean;
  s4Present: boolean;
  murmurType: 'Yo\'q' | 'Sistolik' | 'Diastolik' | 'Sistolo-diastolik';
  murmurTiming: string;
  murmurGrade: string; // e.g. "3/6"
  keyFindings: string[];
  audioConfig: {
    baseFreqS1: number;
    baseFreqS2: number;
    murmurFreq: number;
    murmurIntensity: number;
    s3Time?: number;
    s4Time?: number;
    clickTime?: number;
    irregularity?: number;
  };
}

export interface AnalysisResult {
  rhythm: {
    heartRateBpm: number;
    rhythmType: string;
    regularity: string;
    rmssdMs?: number;
    hrvInterpretation?: string;
  };
  intervals?: {
    systoleDurationMs: number;
    diastoleDurationMs: number;
    systoleDiastoleRatio: number;
    averageRrMs: number;
    rmssdValueMs: number;
    clinicalSignificance: string;
  };
  heartSounds: {
    s1: {
      status: string;
      description: string;
    };
    s2: {
      status: string;
      description: string;
    };
    s3: {
      present: boolean;
      description: string;
    };
    s4: {
      present: boolean;
      description: string;
    };
    additionalClicks?: string;
  };
  murmurs: Array<{
    detected: boolean;
    phase: string;
    timing: string;
    intensityScale: string;
    auscultationPointBestHeard?: string;
    radiation?: string;
    clinicalSignificance: string;
  }>;
  preliminaryDiagnoses: Array<{
    diagnosis: string;
    icd10Code: string;
    probability: string;
    pathophysiologicalExplanation: string;
  }>;
  severityAlert: 'Normal' | 'Yengil' | 'O\'rtacha' | 'Kritik / Shoshilinch' | string;
  clinicalRecommendations: string[];
  instrumentalTestsRecommended: string[];
  doctorFormalSummary: string;
  fkgVsEcgAdvantageNote?: string;
}

export type FilterMode = 'bandpass' | 'bell' | 'diaphragm' | 'raw';

export interface QalbDevice {
  id: string;
  name: string;
  fw: string;
  last_seen: string;
  status: 'idle' | 'recording' | 'uploading' | 'offline';
  battery?: number;
  owner_id?: string;
  isOnline?: boolean;
}

export interface PatientRecord {
  id?: string;
  ism: string;
  familiya: string;
  yosh: number;
  jins: 'Erkak' | 'Ayol';
  homilador?: boolean;
  sistolik?: number;
  diastolik?: number;
  auskultatsiya_nuqtasi?: string;
}

export interface DeviceCommand {
  id: string;
  device_id: string;
  cmd: 'record' | 'idle';
  sec: 15 | 30;
  patient_id?: string;
  patient_data?: PatientRecord;
  state: 'pending' | 'taken' | 'done' | 'failed';
  created_at: string;
  updated_at: string;
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
  audio_url: string;
  image_url: string;
  ai_result?: AnalysisResult;
  age_assessment?: {
    normMin: number;
    normMax: number;
    status: 'past' | 'norma' | 'yuqori';
    label: string;
    description: string;
  };
  created_at: string;
}


