export const SPEAKING_LEVELS = ['beginner', 'intermediate', 'advanced'];

export function getSpeakingLevelByScore(score) {
    const numericScore = Number(score) || 700;
    if (numericScore <= 600) return 'beginner';
    if (numericScore === 700) return 'intermediate';
    return 'advanced';
}
