import React, { useState } from 'react';
import { AnalysisResult, PatientData } from '../types';
import { X, Send, Sparkles, User, Bot, Loader2, HeartPulse } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  result: AnalysisResult;
  patientData?: PatientData;
  auscultationPointName: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const DoctorConsultDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  result,
  patientData,
  auscultationPointName,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Assalomu alaykum, hurmatli hamkasb. Ushbu ${auscultationPointName} nuqtasidan olingan FKG tahlili bo'yicha qanday qo'shimcha savollaringiz yoki differensial diagnostika shubhalaringiz bor? Masalan: "ExoKG Dopplerda qaysi ko'rsatkichlarga e'tibor qaratish kerak?" yoki "Ushbu bemorga qaysi medikamentoz guruh tavsiya etiladi?"`,
    },
  ]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (questionText?: string) => {
    const q = questionText || inputQuestion.trim();
    if (!q || loading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: q }];
    setMessages(newMessages);
    setInputQuestion('');
    setLoading(true);

    try {
      const response = await fetch('/api/fkg/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          fkgContext: {
            auscultationPoint: auscultationPointName,
            patientData,
            analysisResult: result,
          },
        }),
      });

      const data = await response.json();
      if (data.success && data.answer) {
        setMessages([...newMessages, { role: 'assistant', content: data.answer }]);
      } else {
        setMessages([
          ...newMessages,
          {
            role: 'assistant',
            content: 'Kechirasiz, konsultatsiya javobini shakllantirishda xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.',
          },
        ]);
      }
    } catch (err: any) {
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: 'Server bilan bog\'lanishda xatolik: ' + (err.message || 'Noma\'lum xato'),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickQuestions = [
    'Ushbu porokda ExoKG Doppler parametrlari qanday bo\'lishi kerak?',
    'Ushbu shovqin va tonlar qaysi differensial patologiyalar bilan adashtirilishi mumkin?',
    'Bemorga shoshilinch xirurgik yoki invaziv davolash kerakmi?',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-150">
      <div
        id="doctor-consult-drawer"
        className="w-full sm:max-w-2xl bg-white border border-slate-200 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col h-[85vh] sm:h-[75vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-800 flex items-center gap-2">
                AI Kardiologik Konsultant
              </h3>
              <p className="text-xs text-slate-500">
                FKG tahlili va differensial tashxis bo'yicha yordamchi
              </p>
            </div>
          </div>

          <button
            id="close-consult-btn"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages Body */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 bg-slate-50/50">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0 mt-0.5 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed max-w-[85%] whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none shadow-sm'
                    : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-sm'
                }`}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-blue-700 text-xs font-bold p-3 bg-blue-50 border border-blue-100 rounded-2xl w-fit">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>AI Kardiolog tahlil qilmoqda...</span>
            </div>
          )}
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 sm:px-6 py-2.5 bg-white border-t border-slate-200 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {quickQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSend(q)}
              disabled={loading}
              className="text-xs whitespace-nowrap px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border border-slate-200 transition-colors shrink-0"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 sm:p-4 border-t border-slate-200 bg-white flex items-center gap-2">
          <input
            type="text"
            id="consult-input-field"
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Kardiologik savolingizni yozing..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
          />
          <button
            id="consult-send-btn"
            disabled={!inputQuestion.trim() || loading}
            onClick={() => handleSend()}
            className="p-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition-all shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
