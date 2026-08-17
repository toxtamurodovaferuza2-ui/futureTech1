import React from 'react';
import { AUSCULTATION_POINTS } from '../data/fkgPresets';
import { AuscultationPointId } from '../types';
import { Activity, Info, Stethoscope } from 'lucide-react';

interface Props {
  selectedPoint: AuscultationPointId;
  onSelectPoint: (id: AuscultationPointId) => void;
}

export const AuscultationPointPicker: React.FC<Props> = ({ selectedPoint, onSelectPoint }) => {
  const currentPoint = AUSCULTATION_POINTS.find((p) => p.id === selectedPoint) || AUSCULTATION_POINTS[0];

  return (
    <div id="auscultation-point-selector" className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 text-slate-800 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-slate-800">
              Auskultatsiya va FKG Nuqtasi
            </h3>
            <p className="text-xs text-slate-500">
              Standart 5 ta kardiologik anatomik nuqta
            </p>
          </div>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-100">
          5 ta nuqta
        </span>
      </div>

      {/* Anatomical Chest & Heart Visual Representation */}
      <div className="relative w-full aspect-[16/9] sm:aspect-[2/1] bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex items-center justify-center p-2 select-none shadow-inner">
        {/* Subtle Torso Grid & Outline */}
        <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] opacity-30" />
        
        {/* Heart & Sternum Silhouette vector */}
        <svg className="absolute inset-0 w-full h-full text-slate-700 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Ribcage lines */}
          <path d="M 20,25 Q 50,30 80,25" stroke="currentColor" strokeWidth="0.75" fill="none" opacity="0.6" />
          <path d="M 18,35 Q 50,42 82,35" stroke="currentColor" strokeWidth="0.75" fill="none" opacity="0.6" />
          <path d="M 16,48 Q 50,56 84,48" stroke="currentColor" strokeWidth="0.75" fill="none" opacity="0.6" />
          <path d="M 15,64 Q 50,72 85,64" stroke="currentColor" strokeWidth="0.75" fill="none" opacity="0.6" />
          {/* Sternum (To'sh suyagi) */}
          <rect x="47.5" y="20" width="5" height="50" rx="2" fill="rgba(71, 85, 105, 0.4)" stroke="rgba(148, 163, 184, 0.4)" strokeWidth="0.5" />
          {/* Heart Contours */}
          <path
            d="M 45,35 C 35,32 30,48 42,65 C 48,74 65,68 62,50 C 60,38 52,35 45,35 Z"
            fill="rgba(59, 130, 246, 0.12)"
            stroke="rgba(59, 130, 246, 0.4)"
            strokeWidth="0.8"
            strokeDasharray="2 1.5"
          />
        </svg>

        {/* Auscultation Point Target Buttons */}
        {AUSCULTATION_POINTS.map((point) => {
          const isSelected = point.id === selectedPoint;
          return (
            <button
              key={point.id}
              id={`point-btn-${point.id}`}
              onClick={() => onSelectPoint(point.id)}
              style={{ left: `${point.coords.x}%`, top: `${point.coords.y}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 group z-10 flex flex-col items-center focus:outline-none transition-transform duration-200 ${
                isSelected ? 'scale-110' : 'hover:scale-105 opacity-85'
              }`}
              title={point.name}
            >
              <div
                className={`relative flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full border shadow-lg transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white border-white ring-4 ring-blue-500/30'
                    : 'bg-slate-800 text-blue-300 border-slate-700 hover:border-blue-400'
                }`}
              >
                <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {isSelected && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-400"></span>
                  </span>
                )}
              </div>
              <span
                className={`mt-1 text-[10px] font-bold px-2 py-0.5 rounded shadow whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-900/90 text-slate-300 border border-slate-800'
                }`}
              >
                {point.id === 'mitral' ? '1. Mitral (Cho\'qqi)' :
                 point.id === 'aortic' ? '2. Aorta (II o\'ng)' :
                 point.id === 'pulmonic' ? '3. O\'pka (II chap)' :
                 point.id === 'tricuspid' ? '4. Triko\'spidal' : '5. Botkin-Erb'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Point Selector Pill Tabs for Fast Mobile Access */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {AUSCULTATION_POINTS.map((pt) => {
          const isSelected = pt.id === selectedPoint;
          return (
            <button
              key={pt.id}
              id={`quick-select-${pt.id}`}
              onClick={() => onSelectPoint(pt.id)}
              className={`text-left p-3 rounded-2xl text-xs transition-all border ${
                isSelected
                  ? 'bg-blue-50/80 border-blue-500 text-blue-900 ring-2 ring-blue-500/20 shadow-sm'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="font-bold text-slate-800 truncate">{pt.name}</div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">{pt.location}</div>
            </button>
          );
        })}
      </div>

      {/* Active Point Anatomical Details */}
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="text-slate-800 font-bold">
            <span className="text-blue-700 font-bold">{currentPoint.name}:</span> {currentPoint.location}
          </div>
          <div className="text-slate-600 text-xs leading-relaxed">
            {currentPoint.anatomicalDescription}
          </div>
          <div className="text-xs text-blue-600 font-semibold pt-0.5">
            Tavsiya: {currentPoint.bestFor}
          </div>
        </div>
      </div>
    </div>
  );
};
