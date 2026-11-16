export type Choice = {
  label: string;
  text: string;
};

export type PublicQuestion = {
  id: string;
  sourceId: string;
  section: string;
  questionType: string;
  difficulty: string | null;
  scenario: string | null;
  questionText: string;
  choices: Choice[];
  bankOrder: number;
};

export type RevealedAttempt = {
  attemptId: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
  timeTakenSeconds: number;
  submittedAt: string;
  question: PublicQuestion;
};

export type CategoryStat = {
  questionType: string;
  total: number;
  correct: number;
};

export type RecentAttempt = {
  attemptId: string;
  sourceId: string;
  questionType: string;
  difficulty: string | null;
  isCorrect: boolean;
  submittedAt: string;
  timeTakenSeconds: number;
};

export type ProgressSnapshot = {
  displayName: string;
  timezone: string;
  totalCompleted: number;
  totalCorrect: number;
  currentStreak: number;
  longestStreak: number;
  nextAvailableAt: string | null;
  questionAvailable: boolean;
  serverNow: string;
  byCategory: CategoryStat[];
  recent: RecentAttempt[];
};

export type HistoryItem = {
  attemptId: string;
  sourceId: string;
  questionType: string;
  difficulty: string | null;
  section: string;
  isCorrect: boolean;
  submittedAt: string;
  timeTakenSeconds: number;
  bankOrder: number;
};
