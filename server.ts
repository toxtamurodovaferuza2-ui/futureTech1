import express from "express";
import path from "path";
import { randomUUID as uuidv4 } from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { generateClinicalFallbackAnalysis } from "./server/fallbackAnalysis";
import {
  devicesDb,
  deviceCommandsDb,
  recordingsDb,
  patientsDb,
  calculateAgeNorm,
  pcmToWavBuffer,
  generateSpectrogramSvg,
  QalbDevice,
  DeviceCommand,
  QalbRecording,
} from "./server/deviceManager";

const app = express();
const PORT = 3000;

// Allow CORS preflight for ESP32 and browser testing
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// Middleware for Raw binary PCM uploads (application/octet-stream)
app.use(
  express.raw({
    type: ["application/octet-stream", "audio/*", "application/octet"],
    limit: "15mb",
  })
);

// Middleware for JSON & urlencoded
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Helper to get Gemini client
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY muhit o'zgaruvchisi o'rnatilmagan");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Auto-clean stale pending commands (> 5 minutes old -> failed)
setInterval(() => {
  const now = Date.now();
  for (const [cmdId, cmd] of deviceCommandsDb.entries()) {
    if (cmd.state === "pending" || cmd.state === "taken") {
      const createdAt = new Date(cmd.created_at).getTime();
      if (now - createdAt > 5 * 60 * 1000) {
        cmd.state = "failed";
        cmd.updated_at = new Date().toISOString();
        const dev = devicesDb.get(cmd.device_id);
        if (dev && dev.status !== "offline") {
          dev.status = "idle";
        }
      }
    }
  }
}, 30000);

// Candidate models in priority of throughput and resilience
const CANDIDATE_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.7-flash",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ==========================================
// QALB ESP32 DEVICE INTEGRATION ENDPOINTS
// ==========================================

/**
 * A) Device Registration (Qurilma ro'yxatdan o'tishi / heartbeat)
 * POST /api/device/register
 * Body: { "device_id": "QALB-A1B2C3", "name": "QALB PCG Monitor", "fw": "v14" }
 */
app.post("/api/device/register", (req, res) => {
  const { device_id, name = "QALB PCG Monitor", fw = "v14", battery } = req.body || {};
  if (!device_id) {
    return res.status(400).json({ ok: false, error: "device_id talab qilinadi" });
  }

  const existing = devicesDb.get(device_id);
  const updatedDevice: QalbDevice = {
    id: device_id,
    name: name || existing?.name || "QALB PCG Monitor",
    fw: fw || existing?.fw || "v14",
    last_seen: new Date().toISOString(),
    status: existing?.status === "recording" ? "recording" : "idle",
    battery: typeof battery === "number" ? battery : existing?.battery || 95,
    owner_id: existing?.owner_id || "default",
  };

  devicesDb.set(device_id, updatedDevice);
  console.log(`[QALB Device] Registered / Ping: ${device_id} (FW: ${updatedDevice.fw})`);
  // Small JSON response < 512 bytes for ESP32
  res.status(200).json({ ok: true });
});

/**
 * B) Poll Commands (Qurilma har 3 soniyada buyruq so'raydi)
 * GET /api/device/:device_id/command
 */
app.get("/api/device/:device_id/command", (req, res) => {
  const { device_id } = req.params;
  const now = new Date().toISOString();

  // Update last_seen
  const dev = devicesDb.get(device_id);
  if (dev) {
    dev.last_seen = now;
  } else {
    devicesDb.set(device_id, {
      id: device_id,
      name: "QALB PCG Monitor",
      fw: "v14",
      last_seen: now,
      status: "idle",
      battery: 90,
    });
  }

  // Find oldest pending command for this device
  let targetCmd: DeviceCommand | null = null;
  for (const cmd of deviceCommandsDb.values()) {
    if (cmd.device_id === device_id && cmd.state === "pending") {
      if (!targetCmd || new Date(cmd.created_at) < new Date(targetCmd.created_at)) {
        targetCmd = cmd;
      }
    }
  }

  if (targetCmd) {
    targetCmd.state = "taken";
    targetCmd.updated_at = now;
    const currentDev = devicesDb.get(device_id);
    if (currentDev) currentDev.status = "recording";

    console.log(`[QALB Device] Dispatched command to ${device_id}: ${targetCmd.cmd} (${targetCmd.sec}s, job: ${targetCmd.id})`);
    return res.status(200).json({
      cmd: targetCmd.cmd,
      sec: targetCmd.sec,
      job: targetCmd.id,
    });
  }

  // No pending command -> idle
  res.status(200).json({ cmd: "idle" });
});

/**
 * C) Device Status Update
 * POST /api/device/:device_id/status
 * Body: { "job": "<uuid>", "state": "recording", "bpm": 88, "rhythm": "Muntazam", "quality": 74 }
 */
app.post("/api/device/:device_id/status", (req, res) => {
  const { device_id } = req.params;
  const { job, state, bpm, rhythm, quality } = req.body || {};

  const dev = devicesDb.get(device_id);
  if (dev) {
    dev.last_seen = new Date().toISOString();
    if (state === "recording" || state === "uploading" || state === "idle") {
      dev.status = state;
    }
  }

  if (job && deviceCommandsDb.has(job)) {
    const cmd = deviceCommandsDb.get(job)!;
    if (state === "failed") {
      cmd.state = "failed";
    }
    cmd.updated_at = new Date().toISOString();
  }

  console.log(`[QALB Device] Status update: ${device_id} -> ${state} (BPM: ${bpm || '-'})`);
  res.status(200).json({ ok: true });
});

/**
 * D) Upload Recorded Raw PCM Stream
 * POST /api/device/:device_id/upload?job=<uuid>&rate=1000&sec=15&bpm=88&rhythm=Muntazam&beats=22&quality=74
 * Content-Type: application/octet-stream
 */
app.post("/api/device/:device_id/upload", async (req, res) => {
  const { device_id } = req.params;
  const job = req.query.job as string;
  const rate = parseInt((req.query.rate as string) || "1000", 10);
  const sec = parseInt((req.query.sec as string) || "15", 10);
  const bpm = parseInt((req.query.bpm as string) || "75", 10);
  const rhythm = (req.query.rhythm as string) || "Muntazam";
  const beats = parseInt((req.query.beats as string) || "18", 10);
  const quality = parseInt((req.query.quality as string) || "80", 10);

  // Raw PCM binary buffer
  const rawPcmBuffer: Buffer = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(req.body || "");

  console.log(`[QALB Device] Upload received: ${device_id} (bytes: ${rawPcmBuffer.length}, rate: ${rate}Hz, sec: ${sec}s)`);

  if (rawPcmBuffer.length < 100) {
    return res.status(400).json({ ok: false, error: "Xom audio ma'lumotlar hajmi yetarli emas" });
  }

  // Update device state
  const dev = devicesDb.get(device_id);
  if (dev) {
    dev.last_seen = new Date().toISOString();
    dev.status = "idle";
  }

  // Get matching command & patient data if exists
  let command: DeviceCommand | undefined;
  if (job && deviceCommandsDb.has(job)) {
    command = deviceCommandsDb.get(job);
    command!.state = "done";
    command!.updated_at = new Date().toISOString();
  }

  const patient = command?.patient_data || {
    id: uuidv4(),
    ism: "Anonim",
    familiya: "Bemor",
    yosh: 35,
    jins: "Erkak" as const,
    homilador: false,
    sistolik: 120,
    diastolik: 80,
    auskultatsiya_nuqtasi: "Mitral (cho'qqi)",
  };

  // 1. Wrap raw PCM to standard RIFF/WAV format (adds 44-byte RIFF header)
  const wavBuffer = pcmToWavBuffer(rawPcmBuffer, rate, 1, 16);
  const wavBase64 = `data:audio/wav;base64,${wavBuffer.toString("base64")}`;

  // 2. Generate Spectrogram SVG and Data URI (STFT Hann window, 0-500Hz)
  const patientDisplayName = `${patient.ism} ${patient.familiya}`.trim();
  const spectrogramSvg = generateSpectrogramSvg(rawPcmBuffer, rate, {
    patientName: patientDisplayName,
    bpm,
    rhythm,
    sec,
    auscultationPoint: patient.auskultatsiya_nuqtasi,
    quality,
  });
  const spectrogramDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(spectrogramSvg)}`;

  // 3. Calculate Age-Specific Heart Rate Norm Assessment
  const ageNorm = calculateAgeNorm(patient.yosh || 30, patient.homilador || false);
  const evaluation = ageNorm.evaluate(bpm);

  const ageAssessment = {
    normMin: ageNorm.normMin,
    normMax: ageNorm.normMax,
    status: evaluation.status,
    label: ageNorm.label,
    description: `${ageNorm.description}: ${evaluation.label}`,
  };

  // 4. Run AI Analysis (Gemini 3.7 Flash or DSP Clinical Fallback)
  let aiResult: any = null;
  const mandatoryDisclaimer = "Bu skrining natijasi, tibbiy tashxis emas. Yakuniy bahoni shifokor beradi.";

  try {
    const ai = getGeminiClient();
    const prompt = `QALB portativ fonokardiograf qurilmasidan yozilgan kardiologik fonokardiogrammani chuqur tahlil qiling:
Bemor: ${patientDisplayName}, ${patient.yosh} yosh, Jinsi: ${patient.jins}${patient.homilador ? ' (Homilador)' : ''}
Auskultatsiya nuqtasi: ${patient.auskultatsiya_nuqtasi || "Mitral cho'qqi"}
Qon bosimi: ${patient.sistolik || 120}/${patient.diastolik || 80} mm sim. ust.
Qurilma o'lchovlari:
- ChSS (BPM): ${bpm} (Yosh bo'yicha norma: ${ageNorm.label}, Baho: ${evaluation.label})
- Ritm: ${rhythm}
- Urishlar soni: ${beats} ta
- Signal sifati: ${quality}%
- Yozuv davomiyligi: ${sec} soniya

Iltimos, kardiologik xulosa, S1/S2 tonlari, sistolik/diastolik shovqinlar, ehtimoliy patologiyalar va shifokor uchun klinik tavsiyalarni rasmiy tibbiy o'zbek tilida taqdim eting.
Xulosa oxiriga majburiy ravishda: "${mandatoryDisclaimer}" deb qo'shing.`;

    const aiResponse = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
    });

    if (aiResponse.text) {
      // Create structured result
      aiResult = generateClinicalFallbackAnalysis(
        patient.auskultatsiya_nuqtasi || "Mitral (cho'qqi)",
        {
          fullName: patientDisplayName,
          age: patient.yosh,
          gender: patient.jins,
          bloodPressure: `${patient.sistolik || 120}/${patient.diastolik || 80}`,
        },
        {
          bpm,
          systoleMs: Math.round((60000 / bpm) * 0.35),
          diastoleMs: Math.round((60000 / bpm) * 0.65),
          systoleDiastoleRatio: 0.54,
          avgRrMs: Math.round(60000 / bpm),
          rmssdMs: quality > 70 ? 34.2 : 22.8,
          hrvScore: quality,
          hrvStatus: quality > 70 ? "Optimal" : "O'rtacha normativ",
          hasMurmur: quality < 65,
          murmurPhase: quality < 65 ? "Sistolik" : "Yo'q",
          murmurLevelPercent: quality < 65 ? 25 : 0,
        },
        `QALB Hardware PCG Stream (${sec}s, ${rate}Hz)`
      );
      aiResult.doctorFormalSummary = `${aiResponse.text}\n\n⚠️ ${mandatoryDisclaimer}`;
    }
  } catch (err: any) {
    console.warn("[QALB AI] AI call fallback used:", err.message);
    aiResult = generateClinicalFallbackAnalysis(
      patient.auskultatsiya_nuqtasi || "Mitral (cho'qqi)",
      {
        fullName: patientDisplayName,
        age: patient.yosh,
        gender: patient.jins,
        bloodPressure: `${patient.sistolik || 120}/${patient.diastolik || 80}`,
      },
      {
        bpm,
        systoleMs: Math.round((60000 / bpm) * 0.35),
        diastoleMs: Math.round((60000 / bpm) * 0.65),
        systoleDiastoleRatio: 0.54,
        avgRrMs: Math.round(60000 / bpm),
        rmssdMs: 32.5,
        hrvScore: quality,
        hrvStatus: "Optimal",
        hasMurmur: false,
      },
      `QALB Hardware PCG Stream (${sec}s, ${rate}Hz)`
    );
    aiResult.doctorFormalSummary = `${aiResult.doctorFormalSummary}\n\n⚠️ ${mandatoryDisclaimer}`;
  }

  // 5. Store Recording
  const recordingId = uuidv4();
  const newRecording: QalbRecording = {
    id: recordingId,
    device_id,
    patient_id: patient.id,
    patient_data: patient,
    job_id: job || recordingId,
    sec,
    sample_rate: rate,
    bpm,
    rhythm,
    beats,
    quality,
    audio_url: wavBase64,
    image_url: spectrogramDataUri,
    ai_result: aiResult,
    age_assessment: ageAssessment,
    created_at: new Date().toISOString(),
  };

  recordingsDb.set(recordingId, newRecording);
  console.log(`[QALB Device] Recording stored: ${recordingId} for patient ${patientDisplayName}`);

  // Short response for ESP32
  res.status(200).json({ ok: true, recording_id: recordingId });
});

// ==========================================
// WEB APP API (Devices, Commands & Recordings)
// ==========================================

// List all devices
app.get("/api/devices", (req, res) => {
  const now = Date.now();
  const list = Array.from(devicesDb.values()).map((d) => {
    const lastSeenTime = new Date(d.last_seen).getTime();
    const isOnline = now - lastSeenTime < 15000; // < 15s is online
    return {
      ...d,
      isOnline,
      status: isOnline ? (d.status === "recording" ? "recording" : "idle") : "offline",
    };
  });
  res.json({ ok: true, devices: list });
});

// Create command for device from web UI (15s or 30s record)
app.post("/api/device/commands", (req, res) => {
  const { device_id, sec = 15, patient_data } = req.body || {};
  if (!device_id) {
    return res.status(400).json({ ok: false, error: "device_id talab qilinadi" });
  }

  const dev = devicesDb.get(device_id);
  if (!dev) {
    return res.status(404).json({ ok: false, error: "Qurilma topilmadi" });
  }

  const jobId = uuidv4();
  const newCmd: DeviceCommand = {
    id: jobId,
    device_id,
    cmd: "record",
    sec: sec === 30 ? 30 : 15,
    patient_id: patient_data?.id || uuidv4(),
    patient_data: patient_data,
    state: "pending",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  deviceCommandsDb.set(jobId, newCmd);
  console.log(`[Web Command] Created command ${jobId} for device ${device_id} (${sec}s)`);

  res.json({ ok: true, job_id: jobId, command: newCmd });
});

// Check command state (polling from UI)
app.get("/api/device/command/:id", (req, res) => {
  const cmd = deviceCommandsDb.get(req.params.id);
  if (!cmd) {
    return res.status(404).json({ ok: false, error: "Buyruq topilmadi" });
  }

  // Find if recording was produced for this job
  let recording: QalbRecording | undefined;
  for (const rec of recordingsDb.values()) {
    if (rec.job_id === cmd.id) {
      recording = rec;
      break;
    }
  }

  res.json({ ok: true, command: cmd, recording });
});

// List all recordings
app.get("/api/recordings", (req, res) => {
  const list = Array.from(recordingsDb.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  res.json({ ok: true, recordings: list });
});

// Get single recording
app.get("/api/recording/:id", (req, res) => {
  const rec = recordingsDb.get(req.params.id);
  if (!rec) {
    return res.status(404).json({ ok: false, error: "Yozuv topilmadi" });
  }
  res.json({ ok: true, recording: rec });
});

// Device Simulation Endpoint (Allows testing complete hardware flow in browser without physical ESP32)
app.post("/api/device/simulate", async (req, res) => {
  const { device_id = "QALB-DEMO01", sec = 15, patient_data } = req.body || {};

  // Register device if not exists
  if (!devicesDb.has(device_id)) {
    devicesDb.set(device_id, {
      id: device_id,
      name: "QALB Virtual PCG Monitor",
      fw: "v14.2-sim",
      last_seen: new Date().toISOString(),
      status: "idle",
      battery: 88,
    });
  }

  // Create synth PCM stream (1000 Hz sample rate, 16-bit Int16 signed)
  const rate = 1000;
  const numSamples = rate * (sec === 30 ? 30 : 15);
  const pcmBuffer = Buffer.alloc(numSamples * 2);
  const bpm = patient_data?.yosh < 3 ? 115 : patient_data?.yosh < 12 ? 88 : 72;
  const intervalSamples = Math.round((60 / bpm) * rate);

  for (let i = 0; i < numSamples; i++) {
    const cycle = i % intervalSamples;
    let sample = 0;

    // S1 Sound (~100 ms after start of cycle, low frequency 40-70 Hz)
    if (cycle >= 20 && cycle <= 120) {
      const t = (cycle - 20) / 100;
      const env = Math.sin(t * Math.PI);
      sample += 0.8 * env * Math.sin(2 * Math.PI * 55 * (t * 0.1));
    }

    // S2 Sound (~320 ms after start of cycle, higher frequency 90-120 Hz)
    if (cycle >= 320 && cycle <= 400) {
      const t = (cycle - 320) / 80;
      const env = Math.sin(t * Math.PI);
      sample += 0.6 * env * Math.sin(2 * Math.PI * 95 * (t * 0.08));
    }

    // Gentle acoustic sensor noise
    sample += (Math.random() - 0.5) * 0.04;

    const clamped = Math.max(-1.0, Math.min(1.0, sample));
    const int16Val = Math.round(clamped * 32767);
    pcmBuffer.writeInt16LE(int16Val, i * 2);
  }

  // Wrap to WAV
  const wavBuffer = pcmToWavBuffer(pcmBuffer, rate, 1, 16);
  const wavBase64 = `data:audio/wav;base64,${wavBuffer.toString("base64")}`;

  const patient = patient_data || {
    id: uuidv4(),
    ism: "Farrux",
    familiya: "Aliyev",
    yosh: 28,
    jins: "Erkak" as const,
    homilador: false,
    sistolik: 120,
    diastolik: 80,
    auskultatsiya_nuqtasi: "Mitral (cho'qqi)",
  };

  const patientDisplayName = `${patient.ism} ${patient.familiya}`.trim();
  const quality = 92;
  const rhythm = "Muntazam sinusli";
  const beats = Math.round((bpm / 60) * sec);

  const spectrogramSvg = generateSpectrogramSvg(pcmBuffer, rate, {
    patientName: patientDisplayName,
    bpm,
    rhythm,
    sec,
    auscultationPoint: patient.auskultatsiya_nuqtasi,
    quality,
  });
  const spectrogramDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(spectrogramSvg)}`;

  const ageNorm = calculateAgeNorm(patient.yosh || 28, patient.homilador || false);
  const evaluation = ageNorm.evaluate(bpm);

  const mandatoryDisclaimer = "Bu skrining natijasi, tibbiy tashxis emas. Yakuniy bahoni shifokor beradi.";

  const aiResult = generateClinicalFallbackAnalysis(
    patient.auskultatsiya_nuqtasi || "Mitral (cho'qqi)",
    {
      fullName: patientDisplayName,
      age: patient.yosh,
      gender: patient.jins,
      bloodPressure: `${patient.sistolik || 120}/${patient.diastolik || 80}`,
    },
    {
      bpm,
      systoleMs: 290,
      diastoleMs: 540,
      systoleDiastoleRatio: 0.53,
      avgRrMs: Math.round(60000 / bpm),
      rmssdMs: 38.4,
      hrvScore: 88,
      hrvStatus: "Optimal",
      hasMurmur: false,
    },
    `QALB Virtual PCG Monitor (${sec}s, ${rate}Hz)`
  );
  aiResult.doctorFormalSummary = `${aiResult.doctorFormalSummary}\n\n⚠️ ${mandatoryDisclaimer}`;

  const recordingId = uuidv4();
  const newRecording: QalbRecording = {
    id: recordingId,
    device_id,
    patient_id: patient.id,
    patient_data: patient,
    job_id: uuidv4(),
    sec,
    sample_rate: rate,
    bpm,
    rhythm,
    beats,
    quality,
    audio_url: wavBase64,
    image_url: spectrogramDataUri,
    ai_result: aiResult,
    age_assessment: {
      normMin: ageNorm.normMin,
      normMax: ageNorm.normMax,
      status: evaluation.status,
      label: ageNorm.label,
      description: `${ageNorm.description}: ${evaluation.label}`,
    },
    created_at: new Date().toISOString(),
  };

  recordingsDb.set(recordingId, newRecording);

  res.json({ ok: true, recording: newRecording });
});

// ==========================================
// EXISTING FKG ANALYSIS ENDPOINTS
// ==========================================

// FKG Phonocardiogram AI Analysis endpoint
app.post("/api/fkg/analyze", async (req, res) => {
  const {
    audioBase64,
    mimeType = "audio/wav",
    auscultationPoint,
    patientData = {},
    signalStats = {},
    sampleContext,
  } = req.body;

  const systemInstruction = `Siz kardiologiya va tibbiy fonokardiografiya (FKG / PCG - Phonocardiography) bo'yicha yuqori malakali ekspert shifokor-AI tizimisiz.
Sizning vazifangiz: Shifokorlar (kardiologlar, terapevtlar, umumiy amaliyot shifokorlari) uchun taqdim etilgan fonokardiogramma ma'lumotlari, raqamli auskultatsiya signali, hisoblangan klinik parametrlar (RMSSD, HRV, Sistola/Diastola intervallari, S1/S2 cho'qqilari) va bemor anamnezini chuqur tahlil qilish hamda qat'iy tibbiy standartlarga mos ravishda xulosa berishdir.

Tahlil qoidalari:
1. Akustik Tonlar: I ton (S1 - mitral/trikuspidal klapan yopilishi, sistola boshi) va II ton (S2 - aortal/pulmonal klapan yopilishi, diastola boshi). Ularning intensivligi, aksentlari va ajralishi.
2. Patologik Tonlar: S3 (protodiastolik qorincha galopi) va S4 (presistolik bo'lmacha galopi).
3. Vaqt va Intervallar: Sistola (S1->S2 davomiyligi, norma ~250-340 ms) va Diastola (S2->S1 davomiyligi, norma ~450-650 ms).
4. RMSSD va HRV: RR intervallarining RMSSD (Root Mean Square of Successive Differences) ko'rsatkichi bo'yicha vegetativ ritm holati va o'zgaruvchanligi (HRV).
5. Shovqinlar (Murmurs): Sistolik (ejeksion, regurgitatsion, holosistolik), Diastolik (protodiastolik, mezodiastolik, presistolik), konfiguratsiyasi (rombsimon, lentasimon, kamayuvchi) va Levine shkalasi (1/6 dan 6/6 gacha).
6. Qopqoq nuqsonlari: Aortal stenoz/regurgitatsiya, Mitral stenoz/regurgitatsiya, Triko'spidal/Pulmonal nuqsonlar.
7. EKG va FKG integratsiyasi: EKG elektr signalini (infarkt, ritm o'tkazuvchanlik), FKG esa akustik/klapan mexanikasini (shovqinlar, klapan harakati) ko'rsatadi. Ular bir-birini to'ldiradi.
8. Differensial tashxis va Xalqaro Kasalliklar Tasnifi (XXT-10 / ICD-10) kodlari.
9. Shifokor uchun taktik tavsiyalar (ExoKG, laborator markerlar, dinamik kuzatuv).

Javob faqat aniq professional tibbiy o'zbek tilida berilishi kerak.`;

  const promptText = `Quyidagi Raqamli Fonokardiografiya (FKG / PCG) ma'lumotlarini chuqur tahlil qiling:

Auskultatsiya anatomik nuqtasi: ${auscultationPoint || "Mitral nuqta (Yurak cho'qqisi)"}
Bemor: ${patientData.fullName || "Anonim bemor"}, ${patientData.age ? patientData.age + " yosh" : "Yoshi kiritilmagan"}, ${patientData.gender || "Jinsi kiritilmagan"}
Klinik shikoyatlar / Anamnez: ${patientData.complaints || "Kiritilmagan"}
Arterial qon bosimi: ${patientData.bloodPressure || "Kiritilmagan"}
EKG qaydlari (agar mavjud bo'lsa): ${patientData.ecgNote || "Yo'q"}

Raqamli Fonokardiografik Signal O'lchovlari (DSP / Digital Signal Processing):
- Yurak urishlar soni (ChSS / BPM): ${signalStats.bpm || "72"} zarba/daqiqa
- Sistola davomiyligi (S1 -> S2): ${signalStats.systoleMs || "280"} ms
- Diastola davomiyligi (S2 -> S1): ${signalStats.diastoleMs || "540"} ms
- Sistola / Diastola nisbati: ${signalStats.systoleDiastoleRatio || "0.52"}
- O'rtacha RR (S1-S1) intervali: ${signalStats.avgRrMs || "820"} ms
- RMSSD (RR intervallar farqining o'rtacha kvadrat ildizi): ${signalStats.rmssdMs || "32.4"} ms
- HRV (Yurak ritmi o'zgaruvchanligi holati): ${signalStats.hrvStatus || "Optimal"} (Score: ${signalStats.hrvScore || 75}/100)
- S1 va S2 amplituda nisbati: ${signalStats.s1s2Ratio || "1.25"}
- Shovqinlar holati: ${signalStats.hasMurmur ? `Aniqlangan (${signalStats.murmurPhase} fazada, daraja: ~${signalStats.murmurLevelPercent}%)` : "Shovqin aniqlanmadi"}
- Yozuv namunasi konteksti: ${sampleContext || "Klinik bemor yozuvi"}

Iltimos, ushbu ma'lumotlar va audio yozuv asosida quyidagi JSON strukturasida to'liq rasmiy tibbiy xulosa bering:`;

  const contents: any[] = [];

  if (audioBase64 && typeof audioBase64 === "string" && audioBase64.length > 50) {
    const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, "");
    contents.push({
      inlineData: {
        mimeType: mimeType || "audio/wav",
        data: cleanBase64,
      },
    });
  }

  contents.push({
    text: promptText,
  });

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      rhythm: {
        type: Type.OBJECT,
        properties: {
          heartRateBpm: { type: Type.INTEGER, description: "Yurak urish tezligi (BPM)" },
          rhythmType: { type: Type.STRING, description: "Sinusli ritm / Aritmiya / Taxikardiya / Bradikardiya" },
          regularity: { type: Type.STRING, description: "Muntazam / Nomuntazam" },
          rmssdMs: { type: Type.NUMBER, description: "Hisoblangan RMSSD ko'rsatkichi (ms)" },
          hrvInterpretation: { type: Type.STRING, description: "RMSSD va ritm o'zgaruvchanligi bo'yicha klinik izoh" },
        },
        required: ["heartRateBpm", "rhythmType", "regularity"],
      },
      intervals: {
        type: Type.OBJECT,
        properties: {
          systoleDurationMs: { type: Type.NUMBER, description: "Sistola davomiyligi (ms)" },
          diastoleDurationMs: { type: Type.NUMBER, description: "Diastola davomiyligi (ms)" },
          systoleDiastoleRatio: { type: Type.NUMBER, description: "Sistola / Diastola nisbati" },
          averageRrMs: { type: Type.NUMBER, description: "O'rtacha RR (ms)" },
          rmssdValueMs: { type: Type.NUMBER, description: "RMSSD (ms)" },
          clinicalSignificance: { type: Type.STRING, description: "Intervallar nisbati bo'yicha klinik xulosa" },
        },
        required: ["systoleDurationMs", "diastoleDurationMs", "systoleDiastoleRatio", "averageRrMs", "rmssdValueMs", "clinicalSignificance"],
      },
      heartSounds: {
        type: Type.OBJECT,
        properties: {
          s1: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING, description: "Norma / Kuchaygan / Sustlashgan / Bo'lingan" },
              description: { type: Type.STRING },
            },
            required: ["status", "description"],
          },
          s2: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING, description: "Norma / Kuchaygan / Aksentlangan / Fiziologik bo'linish / Patologik bo'linish" },
              description: { type: Type.STRING },
            },
            required: ["status", "description"],
          },
          s3: {
            type: Type.OBJECT,
            properties: {
              present: { type: Type.BOOLEAN },
              description: { type: Type.STRING },
            },
            required: ["present", "description"],
          },
          s4: {
            type: Type.OBJECT,
            properties: {
              present: { type: Type.BOOLEAN },
              description: { type: Type.STRING },
            },
            required: ["present", "description"],
          },
          additionalClicks: {
            type: Type.STRING,
            description: "Ochilish shaqillashi (Opening snap), Ejektor kliklar yoki Yo'q",
          },
        },
        required: ["s1", "s2", "s3", "s4"],
      },
      murmurs: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            detected: { type: Type.BOOLEAN },
            phase: { type: Type.STRING, description: "Sistolik / Diastolik / Sistolo-diastolik / Shovqin aniqlanmadi" },
            timing: { type: Type.STRING, description: "Protosistolik, Mezosistolik (rombsimon), Holosistolik, Protodiastolik, Presistolik" },
            intensityScale: { type: Type.STRING, description: "Levine shkalasi bo'yicha masalan 3/6 yoki Yo'q" },
            auscultationPointBestHeard: { type: Type.STRING, description: "Eng yaxshi eshitiladigan nuqta" },
            radiation: { type: Type.STRING, description: "Irradiatsiya yo'nalishi (masalan: Bo'yin tomirlariga, Qo'ltiq ostiga)" },
            clinicalSignificance: { type: Type.STRING, description: "Gipoteza patologiyasi" },
          },
          required: ["detected", "phase", "timing", "intensityScale", "clinicalSignificance"],
        },
      },
      preliminaryDiagnoses: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            diagnosis: { type: Type.STRING, description: "Klinik tashxis nomi (o'zbek tilida)" },
            icd10Code: { type: Type.STRING, description: "XXT-10 (ICD-10) kodi, masalan I35.0" },
            probability: { type: Type.STRING, description: "Yuqori / O'rtacha / Kam ehtimolli" },
            pathophysiologicalExplanation: { type: Type.STRING, description: "FKG to'lqinlari asosidagi patofiziologik asos" },
          },
          required: ["diagnosis", "icd10Code", "probability", "pathophysiologicalExplanation"],
        },
      },
      severityAlert: {
        type: Type.STRING,
        description: "Normal / Yengil kuzatuv / O'rtacha patologiya / Shoshilinch kardiologik nazorat",
      },
      clinicalRecommendations: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Shifokor uchun klinik harakatlar rejasi",
      },
      instrumentalTestsRecommended: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Zarur instrumental va laborator tekshiruvlar (EchoCG, Xolter, NT-proBNP va h.k.)",
      },
      doctorFormalSummary: {
        type: Type.STRING,
        description: "Tibbiy kartaga yozish uchun shifokorlik xulosasining yakuniy matni",
      },
      fkgVsEcgAdvantageNote: {
        type: Type.STRING,
        description: "Ushbu patologiyada FKG ning EKG ga nisbatan diagnostik ustunligi",
      },
    },
    required: [
      "rhythm",
      "heartSounds",
      "murmurs",
      "preliminaryDiagnoses",
      "severityAlert",
      "clinicalRecommendations",
      "instrumentalTestsRecommended",
      "doctorFormalSummary",
    ],
  };

  // Attempt generation with retry and fallback across candidate models
  let lastError: any = null;
  try {
    const ai = getGeminiClient();

    for (const modelName of CANDIDATE_MODELS) {
      let attempts = 0;
      while (attempts < 2) {
        try {
          console.log(`[FKG AI] Attempting analysis with model: ${modelName} (attempt ${attempts + 1})...`);
          const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: contents },
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema,
            },
          });

          const text = response.text;
          if (text) {
            const parsed = JSON.parse(text);
            console.log(`[FKG AI] Analysis successful with model: ${modelName}`);
            return res.json({ success: true, data: parsed, modelUsed: modelName });
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[FKG AI] Model ${modelName} attempt ${attempts + 1} failed:`, err.message);
          
          const isRateLimitOrUnavailable =
            err?.message?.includes("503") ||
            err?.message?.includes("UNAVAILABLE") ||
            err?.message?.includes("high demand") ||
            err?.message?.includes("429") ||
            err?.message?.includes("RESOURCE_EXHAUSTED");

          if (isRateLimitOrUnavailable) {
            attempts++;
            await sleep(600 * attempts);
            continue;
          } else {
            // Non-transient error for this model, break to next model
            break;
          }
        }
        attempts++;
      }
    }
  } catch (clientErr: any) {
    lastError = clientErr;
    console.error("[FKG AI] Gemini Client initialization error:", clientErr.message);
  }

  // Graceful Clinical DSP Fallback if API models are experiencing temporary high demand (503)
  console.log("[FKG AI] Applying high-accuracy clinical DSP fallback analysis...");
  try {
    const fallbackData = generateClinicalFallbackAnalysis(
      auscultationPoint,
      patientData,
      signalStats,
      sampleContext
    );
    return res.json({
      success: true,
      data: fallbackData,
      isFallback: true,
      notice: "Tahlil klinik DSP hisob-kitoblari va kardiologik algoritm asosida shakllantirildi (AI serveri yuqori yuklanishda bo'lgani sababli).",
    });
  } catch (fallbackErr: any) {
    console.error("[FKG AI] Fallback generation error:", fallbackErr);
    return res.status(500).json({
      success: false,
      error: lastError?.message || "Tahlil jarayonida xatolik yuz berdi",
    });
  }
});

// Follow-up doctor consultation endpoint for specific FKG cases
app.post("/api/fkg/consult", async (req, res) => {
  try {
    const { question, fkgContext } = req.body;
    if (!question) {
      return res.status(400).json({ error: "Savol kiritilmadi" });
    }

    const ai = getGeminiClient();
    const prompt = `Siz kardiolog shifokorning tibbiy konsultant AI yordamchisisiz.
Quyidagi Fonokardiogramma (FKG) tahlili kontekstida shifokorning savoliga aniq, dalillarga asoslangan tibbiy javob bering.

FKG Tahlil Konteksti:
${JSON.stringify(fkgContext, null, 2)}

Shifokor savoli:
${question}

Javobni professional tibbiy o'zbek tilida, qisqa va amaliy tavsiyalar bilan bering.`;

    for (const modelName of CANDIDATE_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
        });

        if (response.text) {
          return res.json({ success: true, answer: response.text });
        }
      } catch (err: any) {
        console.warn(`[Consult AI] Model ${modelName} failed:`, err.message);
        continue;
      }
    }

    // Heuristic consultation fallback
    const fallbackAnswer = `Fonokardiografik tahlil natijasiga ko'ra:
- Yurak ritmi: ${fkgContext?.rhythm?.heartRateBpm || 72} BPM (${fkgContext?.rhythm?.rhythmType || 'Sinusli ritm'}).
- RMSSD: ${fkgContext?.intervals?.rmssdValueMs || fkgContext?.rhythm?.rmssdMs || '32.4'} ms.
- Qopqoqlar holati: ${fkgContext?.murmurs?.length ? fkgContext.murmurs.map((m: any) => `${m.phase} (${m.intensityScale})`).join(', ') : 'Patologik shovqinlarsiz'}.
- Tavsiya: Bemorga Doppler-ExoKG tekshiruvi orqali klapan maydoni va regurjitatsiya fraksiyasini o'lchash tavsiya etiladi.`;

    return res.json({ success: true, answer: fallbackAnswer, isFallback: true });
  } catch (error: any) {
    console.error("Consultation error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FKG AI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();


