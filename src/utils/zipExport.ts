import JSZip from 'jszip';
import { QalbRecording } from '../types';

export async function downloadQalbRecordingZip(recording: QalbRecording): Promise<void> {
  const zip = new JSZip();
  const p = recording.patient_data || {
    ism: 'Anonim',
    familiya: 'Bemor',
    yosh: 30,
    jins: 'Erkak',
    auskultatsiya_nuqtasi: 'Mitral (cho\'qqi)',
  };

  const patientFullName = `${p.ism || 'Anonim'} ${p.familiya || 'Bemor'}`.trim();

  // 1. bemor.txt
  const textSummary = `======================================================
QALB PCG MONITOR - RAQAMLI FONOKARDIOGRAMMA HISOBOTI
======================================================
Qurilma ID: ${recording.device_id}
Job ID: ${recording.job_id}
Sana va vaqt: ${new Date(recording.created_at).toLocaleString('uz-UZ')}

BEMOR MA'LUMOTLARI:
- F.I.Sh: ${patientFullName}
- Yoshi: ${p.yosh || '-'} yosh
- Jinsi: ${p.jins || '-'}${p.homilador ? ' (Homiladorlik holati mavjud)' : ''}
- Qon bosimi: ${p.sistolik ? `${p.sistolik}/${p.diastolik} mm sim. ust.` : 'Kiritilmagan'}
- Auskultatsiya nuqtasi: ${p.auskultatsiya_nuqtasi || 'Mitral (cho\'qqi)'}

QURILMA KO'RSATKICHLARI:
- Yurak urishi (ChSS): ${recording.bpm} BPM
- Ritm turi: ${recording.rhythm}
- Jami urishlar soni: ${recording.beats} ta
- Signal sifati: ${recording.quality}%
- Yozuv davomiyligi: ${recording.sec} soniya
- Diskretlash chastotasi: ${recording.sample_rate} Hz

YOSH NORMASI BAHOSI:
- Me'yoriy diapazon: ${recording.age_assessment?.label || '60–100 bpm'}
- Holati: ${recording.age_assessment?.description || 'Optimal'}

AI KARDIOLOGIK XULOSASI:
${recording.ai_result?.doctorFormalSummary || 'Xulosa shakllantirilmadi'}

TAVSIYALAR:
${recording.ai_result?.clinicalRecommendations?.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n') || '-'}

DIQQAT (OGOHLANTIRISH):
Bu skrining natijasi, tibbiy tashxis emas. Yakuniy bahoni shifokor beradi.
======================================================`;

  zip.file('bemor.txt', textSummary);

  // 2. bemor.json
  const jsonExport = {
    app: 'QALB PCG Phonocardiography System',
    version: 'v14.2',
    timestamp: recording.created_at,
    device: {
      id: recording.device_id,
      sample_rate_hz: recording.sample_rate,
      duration_sec: recording.sec,
    },
    patient: {
      ...p,
      full_name: patientFullName,
    },
    measurements: {
      bpm: recording.bpm,
      rhythm: recording.rhythm,
      total_beats: recording.beats,
      signal_quality_percent: recording.quality,
      age_assessment: recording.age_assessment,
    },
    ai_analysis: recording.ai_result,
    disclaimer: 'Bu skrining natijasi, tibbiy tashxis emas. Yakuniy bahoni shifokor beradi.',
  };

  zip.file('bemor.json', JSON.stringify(jsonExport, null, 2));

  // 3. Audio file: yurak_tovushi.wav
  if (recording.audio_url && recording.audio_url.startsWith('data:')) {
    const base64Data = recording.audio_url.split(',')[1];
    if (base64Data) {
      zip.file('yurak_tovushi.wav', base64Data, { base64: true });
    }
  }

  // 4. Spectrogram Image: fonokardiogramma.svg / fonokardiogramma.png
  if (recording.image_url && recording.image_url.startsWith('data:image/svg+xml')) {
    const svgContent = decodeURIComponent(recording.image_url.split(',')[1]);
    zip.file('fonokardiogramma.svg', svgContent);
  } else if (recording.image_url && recording.image_url.startsWith('data:')) {
    const base64Img = recording.image_url.split(',')[1];
    zip.file('fonokardiogramma.png', base64Img, { base64: true });
  }

  // Generate ZIP blob and trigger browser download
  const blob = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = patientFullName.replace(/\s+/g, '_') || 'bemor';
  anchor.href = downloadUrl;
  anchor.download = `QALB_FKG_${safeName}_${recording.bpm}BPM.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
