import type { FarinographData, FlourGrade, FlourSample } from './types';

export type FlourAssessmentStatus = 'approved' | 'conditional' | 'rejected';

export interface FlourQualityAssessment {
  status: FlourAssessmentStatus;
  sampleId: string;
  grade: FlourGrade;
  reasons: string[];
  metrics: {
    moisturePct: { value: number; max: number; passed: boolean };
    glutenPct: { value: number; min: number; passed: boolean };
    glutenIdk: { value: number; group: 'I' | 'II' | 'III'; description: string; passed: boolean };
    fallingNumberSec: { value: number; min: number; passed: boolean };
    ashPct?: { value: number; max: number; passed: boolean };
  };
  farinographAssessment?: FarinographAssessment;
}

export type DoughStrength = 'strong' | 'medium' | 'weak';

export interface FarinographAssessment {
  strength: DoughStrength;
  waterAbsorptionPct: number;
  stabilityMin: number;
  softeningFU: number;
  qualityNumber: number;
  passed: boolean;
  notes: string[];
}

/** Минимальное содержание сырой клейковины по ГОСТ 26574-2017, %. */
const MIN_GLUTEN: Record<FlourGrade, number> = {
  extra: 28.0,
  first: 30.0,
  second: 25.0,
};

/** Максимальная влажность муки по ГОСТ, %. */
const MAX_MOISTURE_PCT = 14.5;
/** Критический предел влажности (выше — риск самосогревания и порчи). */
const CRITICAL_MOISTURE_PCT = 15.0;

/** Минимальное число падения по ГОСТ 27676, с. */
const MIN_FALLING_NUMBER_SEC: Record<FlourGrade, number> = {
  extra: 230,
  first: 200,
  second: 160,
};

/** Максимальная зольность по сортам, %. */
const MAX_ASH_PCT: Record<FlourGrade, number> = {
  extra: 0.55,
  first: 0.75,
  second: 1.25,
};

/** Определение группы качества клейковины по ИДК (измеритель деформации клейковины). */
export function classifyGlutenIdk(idk: number): { group: 'I' | 'II' | 'III'; description: string; acceptable: boolean } {
  if (idk < 20) {
    return { group: 'III', description: 'III группа: Неудовлетворительно крепкая (крошащаяся)', acceptable: false };
  }
  if (idk <= 44) {
    return { group: 'II', description: 'II группа: Удовлетворительно крепкая', acceptable: true };
  }
  if (idk <= 75) {
    return { group: 'I', description: 'I группа: Хорошая', acceptable: true };
  }
  if (idk <= 100) {
    return { group: 'II', description: 'II группа: Удовлетворительно слабая', acceptable: true };
  }
  return { group: 'III', description: 'III группа: Неудовлетворительно слабая (текучая)', acceptable: false };
}

/**
 * Валидация лабораторной пробы муки по стандарту ГОСТ 26574-2017 «Мука пшеничная хлебопекарная».
 */
export function assessFlourSample(sample: FlourSample): FlourQualityAssessment {
  const reasons: string[] = [];
  const minGluten = MIN_GLUTEN[sample.grade];
  const minFalling = MIN_FALLING_NUMBER_SEC[sample.grade];
  const maxAsh = MAX_ASH_PCT[sample.grade];

  const moisturePassed = sample.moisturePct <= MAX_MOISTURE_PCT;
  if (sample.moisturePct > CRITICAL_MOISTURE_PCT) {
    reasons.push(`Влажность ${sample.moisturePct} % превышает критический предел ${CRITICAL_MOISTURE_PCT} %`);
  } else if (!moisturePassed) {
    reasons.push(`Влажность ${sample.moisturePct} % выше нормы ГОСТ (${MAX_MOISTURE_PCT} %)`);
  }

  const glutenPassed = sample.glutenPct >= minGluten;
  if (!glutenPassed) {
    reasons.push(`Содержание клейковины ${sample.glutenPct} % ниже нормы (${minGluten} %)`);
  }

  const idkInfo = classifyGlutenIdk(sample.glutenIdk);
  if (!idkInfo.acceptable) {
    reasons.push(`Качество клейковины по ИДК: ${sample.glutenIdk} ед. (${idkInfo.description})`);
  }

  const fallingPassed = sample.fallingNumberSec >= minFalling;
  if (!fallingPassed) {
    reasons.push(`Число падения ${sample.fallingNumberSec} с ниже нормы (${minFalling} с)`);
  }

  let ashPassed = true;
  if (sample.ashPct !== undefined) {
    ashPassed = sample.ashPct <= maxAsh;
    if (!ashPassed) {
      reasons.push(`Зольность ${sample.ashPct} % превышает норму (${maxAsh} %)`);
    }
  }

  let farinographAssessment: FarinographAssessment | undefined;
  if (sample.farinograph) {
    farinographAssessment = assessFarinograph(sample.farinograph);
    if (!farinographAssessment.passed) {
      reasons.push(...farinographAssessment.notes);
    }
  }

  let status: FlourAssessmentStatus = 'approved';
  if (
    sample.moisturePct > CRITICAL_MOISTURE_PCT ||
    !glutenPassed ||
    !idkInfo.acceptable ||
    !fallingPassed ||
    !ashPassed
  ) {
    status = 'rejected';
  } else if (!moisturePassed || idkInfo.group === 'II' || (farinographAssessment && farinographAssessment.strength === 'weak')) {
    status = 'conditional';
  }

  return {
    status,
    sampleId: sample.batchId,
    grade: sample.grade,
    reasons,
    metrics: {
      moisturePct: { value: sample.moisturePct, max: MAX_MOISTURE_PCT, passed: moisturePassed },
      glutenPct: { value: sample.glutenPct, min: minGluten, passed: glutenPassed },
      glutenIdk: { value: sample.glutenIdk, group: idkInfo.group, description: idkInfo.description, passed: idkInfo.acceptable },
      fallingNumberSec: { value: sample.fallingNumberSec, min: minFalling, passed: fallingPassed },
      ashPct: sample.ashPct !== undefined ? { value: sample.ashPct, max: maxAsh, passed: ashPassed } : undefined,
    },
    farinographAssessment,
  };
}

/**
 * Оценка параметров реологической кривой замеса теста на фаринографе Брабендера (Brabender Farinograph).
 */
export function assessFarinograph(data: FarinographData): FarinographAssessment {
  const notes: string[] = [];
  let strength: DoughStrength;

  if (data.stabilityMin >= 7.0 && data.softeningFU <= 50) {
    strength = 'strong';
  } else if (data.stabilityMin >= 4.0 && data.softeningFU <= 100) {
    strength = 'medium';
  } else {
    strength = 'weak';
    notes.push(`Слабая мука по фаринограмме: устойчивость ${data.stabilityMin} мин, разжижение ${data.softeningFU} FU`);
  }

  const qualityNumber = data.qualityNumber ?? Math.round(
    Math.min(100, Math.max(10, data.stabilityMin * 8 + (150 - data.softeningFU) * 0.3))
  );

  return {
    strength,
    waterAbsorptionPct: data.waterAbsorptionPct,
    stabilityMin: data.stabilityMin,
    softeningFU: data.softeningFU,
    qualityNumber,
    passed: strength !== 'weak',
    notes,
  };
}
