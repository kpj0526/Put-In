export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function calculateAccuracy(chargerPosition, targetPosition = 50, options = {}) {
  const distance = Math.abs(chargerPosition - targetPosition);
  const perfectWindow = options.perfectWindow ?? 0.25;
  const distancePenalty = options.distancePenalty ?? 3.4;
  if (distance < perfectWindow) {
    return 100;
  }
  return clamp(Math.round(100 - distance * distancePenalty), 0, 100);
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

export function summarizeChain(phases) {
  const averageAccuracy = Math.round(
    phases.reduce((total, phase) => total + phase.accuracy, 0) / phases.length,
  );
  const perfectCount = phases.filter((phase) => phase.accuracy === 100).length;
  const greatCount = phases.filter((phase) => phase.accuracy >= 90).length;
  const obstacleHits = phases.filter((phase) => phase.obstacleHit).length;
  const consistencyBonus =
    perfectCount === phases.length
      ? 6
      : greatCount === phases.length
        ? 4
        : greatCount >= phases.length - 1
          ? 2
          : 0;

  return {
    averageAccuracy,
    perfectCount,
    greatCount,
    obstacleHits,
    consistencyBonus,
    accuracy: clamp(averageAccuracy + consistencyBonus, 0, 100),
  };
}
