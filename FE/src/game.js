export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function calculateAccuracy(chargerPosition) {
  const distance = Math.abs(chargerPosition - 50);
  if (distance < 0.25) {
    return 100;
  }
  return clamp(Math.round(100 - distance * 3.4), 0, 100);
}

export function getJudgement(accuracy) {
  if (accuracy === 100) return 'PERFECT_CHARGE';
  if (accuracy >= 90) return 'GREAT';
  if (accuracy >= 70) return 'GOOD';
  if (accuracy >= 40) return 'WEAK';
  if (accuracy >= 1) return 'BAD';
  return 'MISS';
}

export function getJudgementLabel(judgement) {
  const labels = {
    PERFECT_CHARGE: 'PERFECT CHARGE!',
    GREAT: 'GREAT CHARGE!',
    GOOD: 'GOOD CHARGE',
    WEAK: 'WEAK CHARGE',
    BAD: 'BAD',
    MISS: 'MISS',
  };
  return labels[judgement] ?? judgement;
}
