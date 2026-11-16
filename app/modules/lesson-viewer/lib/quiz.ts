import {
  quizzes,
  quizQuestions,
  quizOptions,
  quizAttempts,
  quizAnswers,
  QuestionType,
} from "~/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./lesson-data";

export function getQuizByLessonId(database: Db, lessonId: number) {
  return database
    .select()
    .from(quizzes)
    .where(eq(quizzes.lessonId, lessonId))
    .get();
}

export function getQuizById(database: Db, quizId: number) {
  return database.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
}

export function getQuizWithQuestions(database: Db, quizId: number) {
  const quiz = database
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .get();
  if (!quiz) return null;

  const questions = database
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();

  const options =
    questions.length === 0
      ? []
      : database
          .select()
          .from(quizOptions)
          .where(
            inArray(
              quizOptions.questionId,
              questions.map((q) => q.id)
            )
          )
          .orderBy(quizOptions.id)
          .all();

  const questionsWithOptions = questions.map((question) => ({
    ...question,
    options: options.filter((o) => o.questionId === question.id),
  }));

  return { ...quiz, questions: questionsWithOptions };
}

export function getBestAttempt(database: Db, userId: number, quizId: number) {
  return database
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.score))
    .limit(1)
    .get();
}

function calculateGrade(score: number): string {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

export type QuestionResult = {
  questionId: number;
  correct: boolean;
  selectedOptionId: number | null;
  correctOptionId: number | null;
};

const SCORED_QUESTION_TYPES: string[] = [
  QuestionType.MultipleChoice,
  QuestionType.TrueFalse,
];

function correctOptionIds(
  database: Db,
  questions: Array<{ id: number; questionType: string }>
) {
  const scored = questions
    .filter((q) => SCORED_QUESTION_TYPES.includes(q.questionType))
    .map((q) => q.id);
  const byQuestion = new Map<number, number>();
  if (scored.length === 0) return byQuestion;

  const correctOptions = database
    .select({ id: quizOptions.id, questionId: quizOptions.questionId })
    .from(quizOptions)
    .where(
      and(
        inArray(quizOptions.questionId, scored),
        eq(quizOptions.isCorrect, true)
      )
    )
    .orderBy(quizOptions.id)
    .all();
  for (const option of correctOptions) {
    if (!byQuestion.has(option.questionId)) {
      byQuestion.set(option.questionId, option.id);
    }
  }
  return byQuestion;
}

export function submitQuizAttempt(
  database: Db,
  userId: number,
  quizId: number,
  selectedAnswers: Record<number, number>
) {
  const quiz = database
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .get();
  if (!quiz) return null;

  const questions = database
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();
  const correctByQuestion = correctOptionIds(database, questions);

  const questionResults: QuestionResult[] = questions.map((q) => {
    const selected = selectedAnswers[q.id];
    if (!selected) {
      return {
        questionId: q.id,
        correct: false,
        selectedOptionId: null,
        correctOptionId: null,
      };
    }
    const correctOptionId = correctByQuestion.get(q.id) ?? null;
    return {
      questionId: q.id,
      correct: selected === correctOptionId,
      selectedOptionId: selected,
      correctOptionId,
    };
  });

  const correct = questionResults.filter((r) => r.correct).length;
  const total = questions.length;
  const scoreValue = total > 0 ? correct / total : 0;
  const passed = scoreValue > 0.7;

  // The attempt and its answers land together, or not at all.
  const attempt = database.transaction((tx) => {
    const inserted = tx
      .insert(quizAttempts)
      .values({ userId, quizId, score: scoreValue, passed })
      .returning()
      .get();
    const answers = questionResults.flatMap((r) =>
      r.selectedOptionId === null
        ? []
        : [
            {
              attemptId: inserted.id,
              questionId: r.questionId,
              selectedOptionId: r.selectedOptionId,
            },
          ]
    );
    if (answers.length > 0) tx.insert(quizAnswers).values(answers).run();
    return inserted;
  });

  return {
    attemptId: attempt.id,
    score: scoreValue,
    passed,
    grade: calculateGrade(scoreValue),
    totalCorrect: correct,
    totalQuestions: total,
    questionResults,
  };
}
