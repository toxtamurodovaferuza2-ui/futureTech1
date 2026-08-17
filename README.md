# QALB — Fonokardiografiya (FKG / PCG) va AI Kardiologik Tahlil Tizimi

Ushbu loyiha yurak tovushlari (Fonokardiografiya — FKG), RMSSD va HRV (Yurak Ritmi O'zgaruvchanligi) dinamikasini real vaqtda tahlil qiluvchi hamda **ESP32 asosidagi "QALB" portativ stetoskopi** bilan to'liq integratsiyalashgan aqlli tibbiy platformadir.

---

## 🌟 Asosiy Imkoniyatlar

1. **FKG To'lqin Shakli va FFT Spektrogrammasi**:
   - Web Audio API orqali yuqori aniqlikdagi audio tahlil.
   - S1, S2, S3, S4 tonlari va sistola/diastola oraliqlarini avtomatik ajratish.
   - 20 Hz dan 800 Hz gacha bo'lgan yurak akustik spektrini vizualizatsiya qilish.

2. **RMSSD va HRV Dinamikasi (Recharts Trend)**:
   - Ketma-ket RR intervallar mikrotebranishlari (*Beat-to-Beat tachogram*).
   - RMSSD, SDNN, pNN50 va vegetativ nerv balansi (Vagus / Simpatik tonus) bahosi.
   - Interaktiv grafiklar: RR trendi, $|\Delta RR|$ farqlar gistogrammasi va lahzalik BPM.

3. **ESP32 "QALB" Qurilmasi Integratsiyasi**:
   - Wi-Fi va HTTP protokollari orqali ESP32 bilan ikki tomonlama aloqa.
   - Masofadan turib yozish buyruqlari (`START_RECORDING`, `SET_GAIN`, `SET_FILTER`).
   - Xom PCM/WAV signallarini qabul qilish va avtomatik ravishda chuqur AI tahliliga yo'naltirish.
   - Yozuvlarni to'liq metadata, audio va JSON ma'lumotlari bilan ZIP arxiv shaklida yuklab olish.

4. **Gemini AI Kardiologik Xulosa va Konsultatsiya**:
   - XXT-10 (ICD-10) kodlari bilan differensial tashxislar.
   - S1/S2 patologiyalari, sistolik/diastolik shovqinlar (Levine shkalasi) tahlili.
   - AI Kardiolog bilan interaktiv savol-javob (chat) rejimi.

---

## 🛠 Texnologiyalar

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons, Recharts, Motion
- **Backend / API**: Node.js, Express, Google GenAI SDK (`@google/genai`), esbuild
- **Audio & DSP**: Web Audio API, Fast Fourier Transform (FFT), STFT Hann Window

---

## 🚀 O'rnatish va Mahalliy Ishga Tushirish

### 1. Repozitoriyani klonlash
```bash
git clone https://github.com/<sizning-username>/qalb-cardio-ai.git
cd qalb-cardio-ai
```

### 2. Bog'liqliklarni o'rnatish
```bash
npm install
```

### 3. Muhit o'zgaruvchilarini sozlash
`.env.example` faylidan nusxa olib, `.env` faylini yarating:
```bash
cp .env.example .env
```
`.env` faylida o'zingizning Google Gemini API kalitingizni kiriting:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Dasturni ishga tushirish (Dev rejimida)
```bash
npm run dev
```
Dastur `http://localhost:3000` manzilida ishga tushadi.

### 5. Ishlab chiqarish (Production build)
```bash
npm run build
npm start
```

---

## 📄 Litsenziya
MIT License
