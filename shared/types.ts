export const GRADES = ["pre2"] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_LABELS: Record<Grade, string> = {
  pre2: "準2級",
};

export const QUESTION_TYPES = ["vocab", "conversation", "cloze", "reading"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  vocab: "語彙・熟語",
  conversation: "会話文",
  cloze: "長文の語句空所補充",
  reading: "長文の内容一致",
};

// cloze / reading は1つの長文に複数の設問が付く「長文型」
export const PASSAGE_TYPES: readonly QuestionType[] = ["cloze", "reading"];
export const isPassageType = (t: QuestionType) => PASSAGE_TYPES.includes(t);

export type PassageGenre = "email" | "explanation" | "story";

export type ItemStatus = "pending" | "approved" | "review" | "reported" | "disabled";

export interface Question {
  // `${itemId}:${index}`
  id: string;
  stem: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

export interface Verification {
  passed: boolean;
  model: string;
  notes: string;
  verifiedAt: string;
}

// 出題単位。語彙・会話文は設問1つ、長文型は本文1つに設問が複数
export interface Item {
  id: string;
  grade: Grade;
  type: QuestionType;
  status: ItemStatus;
  genre?: PassageGenre;
  title?: string;
  passage?: string;
  questions: Question[];
  topic?: string;
  source: "ai" | "manual";
  model?: string;
  verification?: Verification;
  createdAt: string;
  updatedAt: string;
}

export type PublicQuestion = Omit<Question, "answerIndex" | "explanation">;
export type PublicItem = Pick<Item, "id" | "type" | "genre" | "title" | "passage"> & {
  questions: PublicQuestion[];
};

export interface AnswerResult {
  correct: boolean;
  answerIndex: number;
  explanation: string;
}

export interface TypeStat {
  total: number;
  correct: number;
}

export type Role = "teacher" | "student";

export interface Streak {
  count: number;
  lastDate?: string;
}

export interface CurriculumProgress {
  cycle: number;
  day: number;
  // その日の分を最後に完了した学習日（YYYY-MM-DD、午前3時区切り）。同じ日に2日分は進めない
  lastCompletedDate?: string;
}

export interface UserProfile {
  sub: string;
  username: string;
  nickname: string;
  role: Role;
  grade: Grade;
  examDate?: string;
  startDate: string;
  progress: CurriculumProgress;
  streak: Streak;
  lastStudiedAt?: string;
  stats: Record<QuestionType, TypeStat>;
  createdAt: string;
}

export type JobStatus = "queued" | "running" | "done" | "error";

export interface GenerateJob {
  id: string;
  grade: Grade;
  type: QuestionType;
  genre?: PassageGenre;
  topic?: string;
  count: number;
  status: JobStatus;
  approved: number;
  review: number;
  rejected: number;
  usd: number;
  error?: string;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UsageSummary {
  totalUsd: number;
  totalJpy: number;
  budgetJpy: number;
  stopAtJpy: number;
  canGenerate: boolean;
}

export interface Settings {
  budgetJpy: number;
  usdJpy: number;
  inactiveAlertDays: number;
  spotCheckRate: number;
  generationModel: string;
  verificationModel: string;
}

export const DEFAULT_SETTINGS: Settings = {
  budgetJpy: 5000,
  usdJpy: 150,
  inactiveAlertDays: 3,
  spotCheckRate: 0.1,
  generationModel: "claude-opus-5-5",
  verificationModel: "claude-opus-5-5",
};
