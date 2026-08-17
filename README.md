# QALB — Fonokardiografiya (FKG / PCG) va AI Kardiologik Tahlil Tizimi

Ushbu loyiha yurak tovushlari (Fonokardiografiya — FKG / PCG), RMSSD va HRV (Yurak Ritmi O'zgaruvchanligi) dinamikasini real vaqtda tahlil qiluvchi hamda **"FutureTech QALB PCG MONITOR" portativ aqlli stetoskopi** bilan to'liq integratsiyalashgan zamonaviy tibbiy-texnologik platformadir.

---

## 🫀 Apparat Ta'minoti — FutureTech QALB PCG Monitor Qurilmasi

Loyiha uchun maxsus ishlab chiqilgan, ESP32 mikrokontrolleri, rangli LCD displey, I2S raqamli akustik mikrofon va akustik stetoskop membranasi bilan jihozlangan portativ apparat moduli:

### 1. FutureTech QALB PCG Monitor (To'liq apparat majmuasi)
> Portativ korpus, rangli LCD displey, boshqaruv tugmasi va silikon halqali yuqori sezuvchan akustik stetoskop datchigi.

![FutureTech QALB PCG Monitor Qurilmasi](src/assets/images/qalb_hardware_pcg_monitor_1786966510527.jpg)

---

### 2. Qurilmaning O'rnatilgan LCD Displeyi (Real-Vaqt PCG Signali)
> Ekrandagi ko'rsatkichlar: **Yurak urishi soni**, **Ritm holati (Tekis / Notekis)**, **PCG jonli signali** va amplituda spektrining real vaqt dinamikasi.

![Qurilma LCD Displeyi](src/assets/images/qalb_hardware_screen_closeup_1786966522862.jpg)

---

### 3. Akustik Stetoskop Datchigi (Sensor Boshchasi)
> Yurakning past va yuqori chastotali tonlarini (S1—S4) va shovqinlarini aniq ushlab oluvchi membranali akustik boshcha.

![Akustik Stetoskop Datchigi](src/assets/images/qalb_hardware_sensor_head_1786966535367.jpg)

---

## 📸 Veb-Platforma Interfeysi va Skrinshotlari

### 1. Fonokardiogramma (FKG) To'lqin Shakli va Spektrogramma
> Yurak tonlari ($S_1, S_2, S_3, S_4$), real-vaqtda akustik ossilloskop to'lqini, 20—800 Hz FFT chastota spektri va raqamli DSP filtrlash rejimlari (*Mitral, Aortal, Diastolik*).

![QALB FKG To'lqin Shakli va Spektrogramma](src/assets/images/qalb_ui_waveform_fkg_1786966061462.jpg)

---

### 2. RMSSD va HRV (Yurak Ritmi O'zgaruvchanligi) Dinamikasi Trendi
> `Recharts` yordamida har bir yurak siklining *Beat-to-Beat RR* tachogrammasi, RMSSD (32.4 ms), SDNN, vegetativ asab tizimi (Vagus/Simpatik balansi), $S/D$ nisbati va klinik kardiologik tashxislar paneli.

![RMSSD va HRV Trend Grafiki](src/assets/images/qalb_ui_hrv_rmssd_1786966081251.jpg)

---

### 3. ESP32 "QALB" Portativ Stetoskop Qurilmasi Boshqaruvi
> ESP32 mikrokontrolleri bilan Wi-Fi orqali ikki tomonlama telemetriya, masofadan yozish buyruqlari, signal parametrlarini sozlash hamda barcha audio yozuvlarni to'liq metadata va JSON bilan ZIP arxiv ko'rinishida yuklab olish.

![ESP32 QALB Qurilmasi Boshqaruvi](src/assets/images/qalb_ui_esp32_device_1786966099249.jpg)

---

### 4. Anatomik Auskultatsiya Nuqtalari va Yozuv Manbalari
> Inson ko'krak qafasidagi 5 ta asosiy auskultatsiya nuqtasi (*Mitral, Aorta, O'pka arteriyasi, Uch tabaqali qopqoq, Erb nuqtasi*), FKG namunalari (simulyator), jonli mikrofon yozuvi va audio fayllar tahlili.

![Anatomik Auskultatsiya Nuqtalari va Kiritish Rejimlari](src/assets/images/qalb_ui_auscultation_1786966118859.jpg)

---

## 🌟 Asosiy Imkoniyatlar

1. **FKG To'lqin Shakli va FFT Spektrogrammasi**:
   - Web Audio API orqali yuqori aniqlikdagi audio tahlil va shovqinlarni filtrlash.
   - S1, S2, S3, S4 tonlari va sistola/diastola oraliqlarini avtomatik aniqlash.
   - 20 Hz dan 800 Hz gacha bo'lgan yurak akustik chastota spektrini vizualizatsiya qilish.

2. **RMSSD va HRV Dinamikasi (Recharts Trend)**:
   - Ketma-ket RR intervallar mikrotebranishlari (*Beat-to-Beat tachogram*).
   - RMSSD, SDNN, pNN50 va vegetativ nerv balansi (Vagus / Simpatik tonus) bahosi.
   - 3 xil interaktiv rejim: RR trendi (ms), $|\Delta RR|$ farqlar gistogrammasi va lahzalik BPM.

3. **ESP32 "QALB" Qurilmasi Integratsiyasi**:
   - Wi-Fi va HTTP protokollari orqali ESP32 bilan ikki tomonlama real-vaqt aloqa.
   - Masofadan turib yozish buyruqlari (`START_RECORDING`, `SET_GAIN`, `SET_FILTER`).
   - Xom PCM/WAV signallarini qabul qilish va avtomatik ravishda chuqur AI tahliliga yo'naltirish.
   - Yozuvlarni to'liq metadata, audio fayli va JSON xulosalari bilan ZIP arxiv shaklida yuklab olish.

4. **Gemini AI Kardiologik Xulosa va Konsultatsiya**:
   - XXT-10 (ICD-10) xalqaro kodlari bilan differensial tashxislar.
   - S1/S2 patologiyalari, sistolik/diastolik shovqinlar (Levine shkalasi) bahosi.
   - AI Kardiolog bilan interaktiv savol-javob (chat) va tavsiyalar.

---

## 🛠 Texnologiyalar

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons, Recharts, Motion
- **Backend / API**: Node.js, Express, Google GenAI SDK (`@google/genai`), esbuild
- **Audio & DSP**: Web Audio API, Fast Fourier Transform (FFT), STFT Hann Window
- **Apparat Ta'minoti**: ESP32, TFT/LCD Displey, I2S Raqamli Mikrofon, Wi-Fi Telemetriya, Akustik Membrana

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
