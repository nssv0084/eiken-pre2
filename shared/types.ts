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

// dialogue は会話文の長い会話（本文に空所2つ）
export type PassageGenre = "email" | "explanation" | "story" | "dialogue";

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

// 語彙問題の出題の観点
export type VocabFocus = "word" | "idiom" | "grammar";

export interface LevelCheck {
  verdict: "pass" | "review" | "fail";
  notes: string[];
  answerLevel?: string;
  distractorLevels?: string[];
  aboveB1Rate?: number;
  hardWords?: string[];
  tokens?: number;
}

// 出題単位。語彙・会話文は設問1つ、長文型は本文1つに設問が複数
export interface Item {
  id: string;
  grade: Grade;
  type: QuestionType;
  status: ItemStatus;
  focus?: VocabFocus;
  level?: LevelCheck;
  difficulty?: number;
  exemplar?: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  genre?: PassageGenre;
  title?: string;
  passage?: string;
  questions: Question[];
  topic?: string;
  source: "ai" | "manual";
  model?: string;
  verification?: Verification;
  reports?: ItemReport[];
  // 生徒の正答率による見直しのメモ
  usageNote?: string;
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
  dayCompleted?: boolean;
}

export interface ItemReport {
  by: string;
  reason: ReportReason;
  comment?: string;
  questionId: string;
  at: string;
}

export const REPORT_REASONS = ["wrong-answer", "multiple-answers", "bad-explanation", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  "wrong-answer": "正解が違う",
  "multiple-answers": "正解が2つ以上ある",
  "bad-explanation": "解説がまちがっている・わかりにくい",
  other: "その他",
};

export type AnswerContext = "curriculum" | "review" | "free" | "assignment";

export interface Assignment {
  id: string;
  title: string;
  type: QuestionType;
  entries: StudyEntry[];
  questionCount: number;
  dueDate: string;
  targets: string[];
  createdBy: string;
  createdAt: string;
}

export interface AssignmentProgress {
  sub: string;
  answered: number;
  correct: number;
  completedAt?: string;
}

// 出題の1単位。長文は本文1つに対して、出題する設問だけを questionIds に入れる
export interface StudyEntry {
  itemId: string;
  questionIds: string[];
}

export interface StudySet {
  kind: QuestionType | "review";
  label: string;
  entries: StudyEntry[];
}

export interface SessionView {
  cycle: number;
  day: number;
  phase: string;
  isMock: boolean;
  sets: StudySet[];
  items: Record<string, PublicItem>;
  answered: Record<string, boolean>;
  shortage: boolean;
}

export interface DailyStat {
  date: string;
  total: number;
  correct: number;
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

// 周回ごとの成績（周回の振り返り・前の周との比較に使う）
export type CycleStats = Record<string, Record<QuestionType, TypeStat>>;

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
  pushSubscriptions?: PushSubscriptionRecord[];
  createdAt: string;
}

// ブラウザの PushSubscription（端末ごと）
export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
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
  stockAlertDays: number;
  spotCheckRate: number;
  generationModel: string;
  verificationModel: string;
}

export const DEFAULT_SETTINGS: Settings = {
  budgetJpy: 5000,
  usdJpy: 150,
  inactiveAlertDays: 3,
  stockAlertDays: 7,
  spotCheckRate: 0.1,
  generationModel: "claude-opus-5-5",
  verificationModel: "claude-opus-5-5",
};
