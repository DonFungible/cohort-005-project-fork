import * as schema from "~/db/schema";
import { QuestionType } from "~/db/schema";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import { createLessonViewer } from "../index.server";

/**
 * A course with two modules: "Basics" holds lessons 1 and 2, "Advanced"
 * holds lesson 3. The course structure and quizzes belong to the instructor
 * side, which has no module yet, so they are inserted directly.
 */
export function lessonViewerFixture() {
  const db = createTestDb();
  const base = seedBaseData(db);

  const [basics, advanced] = ["Basics", "Advanced"].map((title, index) =>
    db
      .insert(schema.modules)
      .values({ courseId: base.course.id, title, position: index + 1 })
      .returning()
      .get()
  );

  const lessons = [
    { moduleId: basics.id, title: "Lesson 1", position: 1 },
    { moduleId: basics.id, title: "Lesson 2", position: 2 },
    { moduleId: advanced.id, title: "Lesson 3", position: 1 },
  ].map((values) => db.insert(schema.lessons).values(values).returning().get());

  return {
    db,
    ...base,
    modules: { basics, advanced },
    lessons,
    viewer: createLessonViewer(db),
  };
}

/** A two-question quiz on the lesson: one multiple choice, one true/false. */
export function addQuiz(db: TestDb, lessonId: number) {
  const quiz = db
    .insert(schema.quizzes)
    .values({ lessonId, title: "Check", passingScore: 0.7 })
    .returning()
    .get();

  const questions = [
    { text: "Pick B", type: QuestionType.MultipleChoice, options: ["A", "B"] },
    { text: "True?", type: QuestionType.TrueFalse, options: ["False", "True"] },
  ].map((spec, index) => {
    const question = db
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz.id,
        questionText: spec.text,
        questionType: spec.type,
        position: index + 1,
      })
      .returning()
      .get();
    const [wrong, right] = spec.options.map((optionText, optionIndex) =>
      db
        .insert(schema.quizOptions)
        .values({
          questionId: question.id,
          optionText,
          isCorrect: optionIndex === 1,
        })
        .returning()
        .get()
    );
    return { id: question.id, wrong: wrong.id, right: right.id };
  });

  return { quiz, questions };
}

export function addWatchEvent(
  db: TestDb,
  event: { userId: number; lessonId: number; positionSeconds: number }
) {
  db.insert(schema.videoWatchEvents)
    .values({ ...event, eventType: "progress" })
    .run();
}
