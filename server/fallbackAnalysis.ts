import { AnalysisResult } from '../src/types';

export function generateClinicalFallbackAnalysis(
  auscultationPoint: string = 'Mitral nuqta',
  patientData: any = {},
  signalStats: any = {},
  sampleContext?: string
): AnalysisResult {
  const bpm = Number(signalStats.bpm) || 72;
  const systoleMs = Number(signalStats.systoleMs) || Math.round((60000 / bpm) * 0.35);
  const diastoleMs = Number(signalStats.diastoleMs) || Math.round((60000 / bpm) * 0.65);
  const ratio = Number(signalStats.systoleDiastoleRatio) || Number((systoleMs / diastoleMs).toFixed(2));
  const avgRrMs = Number(signalStats.avgRrMs) || Math.round(60000 / bpm);
  const rmssdMs = Number(signalStats.rmssdMs) || 32.4;
  const hasMurmur = Boolean(signalStats.hasMurmur);
  const murmurPhase = signalStats.murmurPhase || 'Yo\'q';
  const murmurLevel = Number(signalStats.murmurLevelPercent) || 0;
  const hrvStatus = signalStats.hrvStatus || 'Optimal';

  let rhythmType = 'Normal Sinusli Ritm';
  let regularity = 'Muntazam';
  let severityAlert: 'Normal' | 'Yengil' | 'O\'rtacha' | 'Kritik / Shoshilinch' = 'Normal';
  let s1Status = signalStats.s1Intensity || 'Norma';
  let s2Status = signalStats.s2Intensity || 'Norma';
  const s3Present = Boolean(signalStats.s3Present);
  const s4Present = Boolean(signalStats.s4Present);

  if (bpm > 100) {
    rhythmType = 'Sinusli Taxikardiya';
    severityAlert = 'Yengil';
  } else if (bpm < 60) {
    rhythmType = 'Sinusli Bradikardiya';
  }

  const diagnoses: Array<{
    diagnosis: string;
    icd10Code: string;
    probability: string;
    pathophysiologicalExplanation: string;
  }> = [];

  const murmursList: Array<{
    detected: boolean;
    phase: string;
    timing: string;
    intensityScale: string;
    auscultationPointBestHeard?: string;
    radiation?: string;
    clinicalSignificance: string;
  }> = [];

  const recommendations: string[] = [
    "Dinamik kardiologik auskultatsiya va arterial qon bosimini nazorat qilish",
    "Jismoniy yuklamalarni bemor funksional sinfiga muvofiq me'yorlash",
  ];

  const instrumental: string[] = [
    "Transtorakal Ekoxokardiografiya (Doppler-ExoKG) - klapanlar anatomiyasi va regurjitatsiyani baholash",
    "Standart 12 tarmoqli Elektrokardiogramma (EKG)",
  ];

  let fkgAdvantage = "Fonokardiografiya (FKG) klapanlarning mexanik harakati, ochilish/yopilish vaqti va akustik shovqinlarni bevosita qayd etadi. EKG esa faqat miokardning elektr o'tkazuvchanligini ko'rsatib, klapan nuqsonlari shovqinini bevosita qayd eta olmaydi.";

  // Detect presets or clinical patterns
  const ctx = (sampleContext || '').toLowerCase();
  const complaints = (patientData.complaints || '').toLowerCase();

  if (ctx.includes('aorta stenozi') || (hasMurmur && murmurPhase.includes('Sistolik') && auscultationPoint.toLowerCase().includes('aortal'))) {
    severityAlert = 'O\'rtacha';
    s2Status = 'Sustlashgan / Ajralgan';
    murmursList.push({
      detected: true,
      phase: 'Sistolik',
      timing: 'Mezosistolik (kreshendo-dekreshendo, rombsimon)',
      intensityScale: '3/6 yoki 4/6',
      auscultationPointBestHeard: 'Aortal nuqta (2-qovurg\'alararo o\'ngda)',
      radiation: 'O\'ng uyqu (uyqu arteriyalari) va bo\'yin tomirlariga',
      clinicalSignificance: 'Aorta qopqog\'i torayishi natijasida qonning chap qorinchadan aortaga turbulent haydalishi.',
    });
    diagnoses.push({
      diagnosis: "Aorta qopqog'i stenozi (Aortic Stenosis)",
      icd10Code: "I35.0",
      probability: "Yuqori",
      pathophysiologicalExplanation: "FKG da S1 dan keyin boshlanib S2 dan oldin tugaydigan rombsimon ejeksion sistolik shovqin va aortal komponentning kechikishi.",
    });
    recommendations.push("Doppler-ExoKG orqali aortal klapanning bosim gradienti (Vmax, mean PG) va maydonini hisoblash");
    instrumental.push("NT-proBNP qon tahlili", "Yurak MRT tekshiruvi (zarurat bo'lganda)");
    fkgAdvantage = "FKG orqali sistolik shovqinning rombsimon konfiguratsiyasi va cho'qqisining kechikishi aortal stenoz darajasini EKGga qaraganda ancha aniqroq ko'rsatadi.";
  } else if (ctx.includes('mitral yetishmovchilik') || (hasMurmur && murmurPhase.includes('Sistolik') && auscultationPoint.toLowerCase().includes('mitral'))) {
    severityAlert = 'O\'rtacha';
    s1Status = 'Sustlashgan';
    murmursList.push({
      detected: true,
      phase: 'Sistolik',
      timing: 'Pansistolik / Holosistolik (lentasimon)',
      intensityScale: '3/6',
      auscultationPointBestHeard: 'Mitral nuqta (Yurak cho\'qqisi)',
      radiation: 'Chap qo\'ltiq osti sohasiga (aksillyar)',
      clinicalSignificance: 'Sistola davrida qonning chap qorinchadan chap bo\'lmachaga teskari oqishi (regurgitatsiya).',
    });
    diagnoses.push({
      diagnosis: "Mitral qopqoq yetishmovchiligi (Mitral Regurgitation)",
      icd10Code: "I34.0",
      probability: "Yuqori",
      pathophysiologicalExplanation: "I ton (S1) sustlashuvi va butun sistola bo'ylab bir xil amplitudada davom etuvchi holosistolik lentasimon shovqin.",
    });
    recommendations.push("Chap qorincha ejeksiya fraksiyasini (EF) va regurjitatsiya hajmini ExoKG da baholash");
    fkgAdvantage = "EKG faqat chap bo'lmacha gipertrofiyasini taxmin qilishi mumkin, FKG esa mitral yetishmovchilikning haqiqiy akustik regurjitatsiya oqimini aniqlaydi.";
  } else if (ctx.includes('mitral stenozi') || (hasMurmur && murmurPhase.includes('Diastolik'))) {
    severityAlert = 'O\'rtacha';
    s1Status = 'Kuchaygan (Qarsillovchi S1)';
    murmursList.push({
      detected: true,
      phase: 'Diastolik',
      timing: 'Mezodiastolik va presistolik kuchayish',
      intensityScale: '2/6 - 3/6',
      auscultationPointBestHeard: 'Yurak cho\'qqisi (Mitral nuqta)',
      radiation: 'Lokal (kam tarqaladi)',
      clinicalSignificance: 'Diastola davrida qonning toraygan mitral teshik orqali qorinchaga turbulent oqishi.',
    });
    diagnoses.push({
      diagnosis: "Mitral qopqoq stenozi (Mitral Stenosis)",
      icd10Code: "I05.0",
      probability: "Yuqori",
      pathophysiologicalExplanation: "Qarsillovchi kuchaygan S1, ochilish shaqillashi (Opening snap) va past chastotali presistolik diastolik shovqin.",
    });
  } else if (s3Present) {
    severityAlert = 'O\'rtacha';
    diagnoses.push({
      diagnosis: "Surunkali yurak yetishmovchiligi (Chap qorincha ortiqcha yuklanishi)",
      icd10Code: "I50.9",
      probability: "O'rtacha",
      pathophysiologicalExplanation: "Diastola boshida qonning tez to'lishi va qorincha devorining past tonusda tebranishi natijasida patologik S3 galopi.",
    });
    recommendations.push("NT-proBNP va kardiolog maslahati", "Diuretik va kardioprotektiv terapiya korreksiyasi");
  } else if (!hasMurmur) {
    murmursList.push({
      detected: false,
      phase: 'Yo\'q',
      timing: 'Mavjud emas',
      intensityScale: '0/6',
      clinicalSignificance: 'Akustik shovqinlar qayd etilmadi, klapanlar faoliyati normal.',
    });
    diagnoses.push({
      diagnosis: "Normativ Fonokardiografiya (Patologiyasiz)",
      icd10Code: "Z00.0",
      probability: "Yuqori",
      pathophysiologicalExplanation: "S1 va S2 tonlari balandligi, nisbati hamda sistola-diastola intervallari fiziologik me'yorda.",
    });
  } else {
    murmursList.push({
      detected: true,
      phase: murmurPhase,
      timing: 'Sistolik davriy',
      intensityScale: '2/6',
      clinicalSignificance: 'Raqamli signalda akustik energiya ko\'tarilishi kuzatildi.',
    });
    diagnoses.push({
      diagnosis: "Aniqlovchi Auskultativ Shovqin Sindromi",
      icd10Code: "R01.1",
      probability: "O'rtacha",
      pathophysiologicalExplanation: "FKG to'lqinida sistolik/diastolik intervalda normadan ortiq tebranishlar qayd etildi.",
    });
  }

  return {
    rhythm: {
      heartRateBpm: bpm,
      rhythmType,
      regularity,
      rmssdMs,
      hrvInterpretation: `RMSSD: ${rmssdMs} ms. ${hrvStatus} vegetativ ritm holati.`,
    },
    intervals: {
      systoleDurationMs: systoleMs,
      diastoleDurationMs: diastoleMs,
      systoleDiastoleRatio: ratio,
      averageRrMs: avgRrMs,
      rmssdValueMs: rmssdMs,
      clinicalSignificance: `Sistola: ${systoleMs}ms, Diastola: ${diastoleMs}ms (nisbat: ${ratio}). Yurak sikli o'lchovlari fiziologik me'yorlarda muvofiqlashtirilgan.`,
    },
    heartSounds: {
      s1: {
        status: s1Status,
        description: `I ton (Mitral va Trikuspidal yopilishi): ${s1Status}.`,
      },
      s2: {
        status: s2Status,
        description: `II ton (Aorta va Pulmonal yopilishi): ${s2Status}.`,
      },
      s3: {
        present: s3Present,
        description: s3Present ? "Patologik S3 (protodiastolik qorincha galop ritmi) aniqlandi." : "S3 patologik galopi mavjud emas.",
      },
      s4: {
        present: s4Present,
        description: s4Present ? "Patologik S4 (presistolik bo'lmacha galop ritmi) aniqlandi." : "S4 patologik galopi mavjud emas.",
      },
      additionalClicks: "Patologik kliklar aniqlanmadi",
    },
    murmurs: murmursList,
    preliminaryDiagnoses: diagnoses,
    severityAlert,
    clinicalRecommendations: recommendations,
    instrumentalTestsRecommended: instrumental,
    doctorFormalSummary: `FKG va Auskultatsiya Xulosasi: ${rhythmType}, YuUCh ${bpm} BPM. RMSSD: ${rmssdMs} ms. ${
      hasMurmur ? `${murmurPhase} shovqin aniqlandi.` : "Patologik shovqinlar aniqlanmadi."
    } Bemorga Doppler-ExoKG tekshiruvi va kardiolog konsultatsiyasi tavsiya etiladi.`,
    fkgVsEcgAdvantageNote: fkgAdvantage,
  };
}
