export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatTimeTaken(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes <= 0) return `${remainder} sec`;
  return `${minutes} min ${remainder} sec`;
}

export function difficultyLabel(difficulty: string | null | undefined): string {
  if (!difficulty) return "Unrated";
  return difficulty;
}
