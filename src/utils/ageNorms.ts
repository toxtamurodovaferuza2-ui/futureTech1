export interface AgeNormInfo {
  min: number;
  max: number;
  label: string;
  category: string;
}

export function getAgeNorm(age: number, isPregnant = false): AgeNormInfo {
  let min = 60;
  let max = 100;
  let category = 'Katta yosh (18+)';

  if (age < 1) {
    min = 100;
    max = 150;
    category = 'Go\'daklar (< 1 yosh)';
  } else if (age >= 1 && age <= 3) {
    min = 90;
    max = 140;
    category = 'Kichik yosh (1–3 yosh)';
  } else if (age > 3 && age <= 6) {
    min = 80;
    max = 120;
    category = 'Maktabgacha (3–6 yosh)';
  } else if (age > 6 && age <= 12) {
    min = 70;
    max = 120;
    category = 'Maktab yoshi (6–12 yosh)';
  } else if (age > 12 && age < 18) {
    min = 60;
    max = 110;
    category = 'O\'smirlar (12–18 yosh)';
  } else {
    min = 60;
    max = 100;
    category = 'Katta yosh (18+)';
  }

  if (isPregnant) {
    max += 15;
    category += ' [Homiladorlik +15]';
  }

  return {
    min,
    max,
    label: `${min}–${max} zarba/daq`,
    category,
  };
}

export function evaluateHeartRate(bpm: number, age: number, isPregnant = false): {
  status: 'past' | 'norma' | 'yuqori';
  badgeClass: string;
  label: string;
  advice: string;
} {
  const norm = getAgeNorm(age, isPregnant);

  if (bpm < norm.min) {
    return {
      status: 'past',
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      label: `Past (Bradikardiya) — norma: ${norm.label}`,
      advice: 'Yurak qisqarishlar chastotasi yosh normasidan past. Bradikardiya sababini tekshirish tavsiya etiladi.',
    };
  } else if (bpm > norm.max) {
    return {
      status: 'yuqori',
      badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      label: `Yuqori (Taxikardiya) — norma: ${norm.label}`,
      advice: 'Yurak qisqarishlar chastotasi yosh normasidan yuqori. Sinusli taxikardiya yoki aritmiya xavfini baholang.',
    };
  }

  return {
    status: 'norma',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    label: `Normativ (Optimal) — norma: ${norm.label}`,
    advice: 'Yurak urish tezligi yosh mezonlariga to\'liq muvofiq.',
  };
}
