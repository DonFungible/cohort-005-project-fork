import { describe, it, expect, beforeEach, vi } from "vitest";
import { LessonProgressStatus } from "~/db/schema";
import { addQuiz, addWatchEvent, lessonViewerFixture } from "./fixtures";

let fixture: ReturnType<typeof lessonViewerFixture>;

beforeEach(() => {
  fixture = lessonViewerFixture();
});

const NOW = new Date("2026-11-16T10:00:00Z");

describe("lesson progress", () => {
  it("marks a lesson in progress, then complete", () => {
    const { viewer, user, lessons } = fixture;

    viewer.markLessonInProgress(user.id, lessons[0].id);
    expect(viewer.getLessonProgress(user.id, lessons[0].id)?.status).toBe(
      LessonProgressStatus.InProgress
    );

    viewer.markLessonComplete(user.id, lessons[0].id, NOW);
    const progress = viewer.getLessonProgress(user.id, lessons[0].id);
    expect(progress?.status).toBe(LessonProgressStatus.Completed);
    expect(progress?.completedAt).toBe(NOW.toISOString());
  });

  it("does not move a completed lesson back to in progress", () => {
    const { viewer, user, lessons } = fixture;

    viewer.markLessonComplete(user.id, lessons[0].id, NOW);
    viewer.markLessonInProgress(user.id, lessons[0].id);

    expect(viewer.getLessonProgress(user.id, lessons[0].id)?.status).toBe(
      LessonProgressStatus.Completed
    );
  });

  it("lists the learner's progress across every module of the course", () => {
    const { viewer, user, instructor, course, lessons } = fixture;

    viewer.markLessonComplete(user.id, lessons[0].id, NOW);
    viewer.markLessonInProgress(user.id, lessons[2].id);
    viewer.markLessonComplete(instructor.id, lessons[1].id, NOW);

    const records = viewer.getLessonProgressForCourse(user.id, course.id);
    expect(records.map((r) => r.lessonId).sort()).toEqual(
      [lessons[0].id, lessons[2].id].sort()
    );
  });
});

describe("watch progress", () => {
  it("resumes from the latest position and reports the furthest point", () => {
    const { db, viewer, user, lessons } = fixture;
    const lessonId = lessons[0].id;

    expect(viewer.getLastWatchPosition(user.id, lessonId)).toBe(0);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T10:00:00Z"));
    addWatchEvent(db, { userId: user.id, lessonId, positionSeconds: 90 });
    vi.setSystemTime(new Date("2026-11-16T10:05:00Z"));
    addWatchEvent(db, { userId: user.id, lessonId, positionSeconds: 30 });
    vi.useRealTimers();

    expect(viewer.getLastWatchPosition(user.id, lessonId)).toBe(30);
    expect(viewer.calculateWatchProgress(user.id, lessonId, 120)).toBe(75);
  });

  it("caps progress at 100 and reports 0 for a video with no length", () => {
    const { db, viewer, user, lessons } = fixture;
    const lessonId = lessons[0].id;
    addWatchEvent(db, { userId: user.id, lessonId, positionSeconds: 500 });

    expect(viewer.calculateWatchProgress(user.id, lessonId, 120)).toBe(100);
    expect(viewer.calculateWatchProgress(user.id, lessonId, 0)).toBe(0);
  });
});

describe("quizzes", () => {
  it("finds the lesson's quiz with its questions in order", () => {
    const { db, viewer, lessons } = fixture;
    const { quiz, questions } = addQuiz(db, lessons[0].id);

    expect(viewer.getQuizByLessonId(lessons[0].id)?.id).toBe(quiz.id);
    expect(viewer.getQuizById(quiz.id)?.lessonId).toBe(lessons[0].id);
    expect(viewer.getQuizByLessonId(lessons[1].id)).toBeUndefined();

    const full = viewer.getQuizWithQuestions(quiz.id);
    expect(full?.questions.map((q) => q.id)).toEqual(
      questions.map((q) => q.id)
    );
    expect(full?.questions[0].options).toHaveLength(2);
    expect(viewer.getQuizWithQuestions(quiz.id + 1)).toBeNull();
  });

  it("scores every right answer as a pass with an A", () => {
    const { db, viewer, user, lessons } = fixture;
    const { quiz, questions } = addQuiz(db, lessons[0].id);

    const result = viewer.submitQuizAttempt(user.id, quiz.id, {
      [questions[0].id]: questions[0].right,
      [questions[1].id]: questions[1].right,
    });

    expect(result).toMatchObject({
      score: 1,
      passed: true,
      grade: "A",
      totalCorrect: 2,
      totalQuestions: 2,
    });
    expect(result?.questionResults[1]).toEqual({
      questionId: questions[1].id,
      correct: true,
      selectedOptionId: questions[1].right,
      correctOptionId: questions[1].right,
    });
  });

  it("counts a wrong or missing answer against the score", () => {
    const { db, viewer, user, lessons } = fixture;
    const { quiz, questions } = addQuiz(db, lessons[0].id);

    const result = viewer.submitQuizAttempt(user.id, quiz.id, {
      [questions[0].id]: questions[0].wrong,
    });

    expect(result).toMatchObject({
      score: 0,
      passed: false,
      grade: "F",
      totalCorrect: 0,
    });
    expect(result?.questionResults.map((r) => r.selectedOptionId)).toEqual([
      questions[0].wrong,
      null,
    ]);
  });

  it("keeps the best attempt", () => {
    const { db, viewer, user, lessons } = fixture;
    const { quiz, questions } = addQuiz(db, lessons[0].id);

    viewer.submitQuizAttempt(user.id, quiz.id, {
      [questions[0].id]: questions[0].right,
    });
    viewer.submitQuizAttempt(user.id, quiz.id, {});

    expect(viewer.getBestAttempt(user.id, quiz.id)).toMatchObject({
      score: 0.5,
      passed: false,
    });
  });

  it("returns null for a quiz that does not exist", () => {
    const { viewer, user } = fixture;

    expect(viewer.submitQuizAttempt(user.id, 999, {})).toBeNull();
  });
});
