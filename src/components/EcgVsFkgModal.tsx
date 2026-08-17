import React from 'react';
import { X, Activity, Volume2, ShieldCheck, Check, Sparkles, AlertCircle, HeartPulse, HelpCircle } from 'lucide-react';

interface EcgVsFkgModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EcgVsFkgModal({ isOpen, onClose }: EcgVsFkgModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        id="ecg-vs-fkg-modal"
        className="w-full max-w-3xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600">
              <Volume2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg text-slate-800">
                  Fonokardiografiya (FKG / PCG) va EKG Farqi
                </h3>
                <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  Klinik Standart
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Raqamli auskultatsiya, RMSSD ko'rsatkichi va klapan diagnostikasi
              </p>
            </div>
          </div>
          <button
            id="close-ecg-vs-fkg-modal-btn"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 bg-slate-50/50 text-xs sm:text-sm">
          {/* Pitch & Jury Quick Response Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-blue-50/90 border border-blue-200 text-blue-950 space-y-2.5 shadow-sm">
            <div className="flex items-center gap-2 text-blue-800 font-bold text-sm">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Juri yoki Shifokor: &quot;Bu EKG mi?&quot; deb so&apos;rasa:</span>
            </div>
            <blockquote className="p-3.5 rounded-xl bg-white border border-blue-200 font-medium text-slate-800 italic leading-relaxed shadow-sm">
              &quot;Yo&apos;q, bu <strong className="text-blue-700 font-bold">Fonokardiografiya (FKG / Phonocardiography)</strong>. EKG yurakning elektr faoliyatini yozsa, biz <strong className="text-blue-700 font-bold">akustik signalni (klapanlar yopilish tovushi va turbulent shovqinlarni)</strong> raqamli stetoskop orqali yozamiz. Klapan nuqsonlari, stenozi va yetishmovchiligida FKG eng yuqori klinik axborotlilikka ega.&quot;
            </blockquote>
          </div>

          {/* Core Measured Clinical Metrics Table */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-blue-600" />
              <span>Platformamizda Aynan O&apos;lchanadigan va Hisoblanadigan Ko&apos;rsatkichlar</span>
            </h4>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase">
                    <th className="py-2.5 px-3 font-semibold">Atama</th>
                    <th className="py-2.5 px-3 font-semibold">Klinik Ma&apos;nosi</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Platformadagi Holati</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-900">Yurak tonlari</td>
                    <td className="py-2.5 px-3">Klapanlar yopilish mexanik tovushi</td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-600">✅ Asosiy signal</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-blue-700">I ton (S1)</td>
                    <td className="py-2.5 px-3">Mitral va trikuspidal klapan yopilishi — sistola boshi</td>
                    <td className="py-2.5 px-3 text-right font-bold text-blue-600">✅ Katta cho&apos;qqi</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-teal-700">II ton (S2)</td>
                    <td className="py-2.5 px-3">Aortal va pulmonal klapan yopilishi — diastola boshi</td>
                    <td className="py-2.5 px-3 text-right font-bold text-teal-600">✅ Kichik cho&apos;qqi</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-900">Sistola oralig&apos;i</td>
                    <td className="py-2.5 px-3">S1 → S2 oralig&apos;i (qorinchalar qisqarishi)</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900">✅ ms larda hisoblanadi</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-900">Diastola oralig&apos;i</td>
                    <td className="py-2.5 px-3">S2 → S1 oralig&apos;i (yurak to&apos;lishi va dam olishi)</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900">✅ ms larda hisoblanadi</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-900">ChSS / YuUCh</td>
                    <td className="py-2.5 px-3">Yurak urishlari chastotasi (zarba/daqiqa)</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900">✅ Avtokorrelyatsiya bilan</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-900">RR interval</td>
                    <td className="py-2.5 px-3">Ketma-ket urishlar orasidagi vaqt (ms)</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900">✅ S1-S1 aniq o&apos;lchanadi</td>
                  </tr>
                  <tr className="bg-blue-50/50">
                    <td className="py-2.5 px-3 font-extrabold text-blue-800">RMSSD</td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">RR intervallar farqining o&apos;rtacha kvadrat ildizi</td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-blue-700">✅ Haqiqiy klinik ko&apos;rsatkich</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-900">HRV (Ritmi o&apos;zgaruvchanligi)</td>
                    <td className="py-2.5 px-3">Yurak vegetativ boshqaruvi va stress holati</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900">✅ RMSSD & SDNN orqali</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-rose-700">Shovqin (Murmur)</td>
                    <td className="py-2.5 px-3">Sistola yoki diastolada turbulent oqim tovushi</td>
                    <td className="py-2.5 px-3 text-right font-bold text-rose-600">✅ Levine 1/6 - 6/6 shkalasi</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* EKG vs FKG Comparative Analysis */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                <Activity className="w-4 h-4 text-emerald-600" />
                <span>Elektrokardiografiya (EKG)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Yurakning <strong>elektr o&apos;tkazuvchanligi va depolyarizatsiyasini</strong> (P-QRS-T tishchalarini) o&apos;lchaydi.
              </p>
              <ul className="space-y-1.5 text-xs text-slate-600">
                <li className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Miokard infarkti va ishemiyani aniqlaydi</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Ekstrasistoliya va blokadalarni ko&apos;rsatadi</span>
                </li>
                <li className="flex items-start gap-1.5 text-slate-400">
                  <X className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                  <span className="line-through">Klapan shovqinlarini ko&apos;rmaydi</span>
                </li>
              </ul>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-blue-50/70 border border-blue-200 shadow-sm space-y-3">
              <div className="flex items-center gap-2 font-bold text-blue-900 text-sm">
                <Volume2 className="w-4 h-4 text-blue-600" />
                <span>Fonokardiografiya (FKG / PCG)</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                Yurakning <strong>akustik va gidrodinamik faoliyatini</strong> (tonlar, shovqinlar, klapan yopilishini) yozadi.
              </p>
              <ul className="space-y-1.5 text-xs text-slate-700">
                <li className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <span>Klapan stenozi va yetishmovchiligini aniq ko&apos;rsatadi</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <span>Sistolik/diastolik shovqinlarni grafik vizuallashtiradi</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <span>S1, S2, S3, S4 va RMSSD bo&apos;yicha yurak ritmini baholaydi</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Conclusion Note */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 text-xs text-slate-600 flex items-start gap-3 shadow-sm">
            <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800">Xulosa: </span>
              EKG va FKG bir-birini almashtirmaydi, aksincha mukammal to&apos;ldiradi. Ushbu platforma orqali olingan fonokardiogramma va RMSSD ko&apos;rsatkichlari Gemini AI orqali real vaqtda tahlil qilinib, shifokorga aniq klinik differensial tashxisni taqdim etadi.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-white flex justify-end">
          <button
            id="close-ecg-fkg-info-btn"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-all"
          >
            Tushunarli, Davom Etish
          </button>
        </div>
      </div>
    </div>
  );
}
