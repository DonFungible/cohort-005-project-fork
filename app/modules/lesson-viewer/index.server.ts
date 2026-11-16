import { db } from "~/db";
import {
  getCommentById,
  getCourseWithDetails,
  getLessonById,
  getModuleById,
  getUserById,
  type Db,
} from "./lib/lesson-data";
import {
  calculateWatchProgress,
  getLastWatchPosition,
  getLessonProgress,
  getLessonProgressForCourse,
  markLessonComplete,
  markLessonInProgress,
} from "./lib/progress";
import { getLessonThread, renderThread } from "./lib/discussion.server";
import {
  getBestAttempt,
  getQuizById,
  getQuizByLessonId,
  getQuizWithQuestions,
  submitQuizAttempt,
} from "./lib/quiz";

export { flattenCourseLessons, type FlatLesson } from "./lib/lesson-data";
export type { QuestionResult } from "./lib/quiz";

/**
 * What the lesson page reads and writes, bound to a database. The app uses
 * `lessonViewer`, which reads the app database; tests build their own
 * against a test database.
 */
export function createLessonViewer(database: Db) {
  return {
    getCourseWithDetails: (courseId: number) =>
      getCourseWithDetails(database, courseId),
    getLessonById: (lessonId: number) => getLessonById(database, lessonId),
    getModuleById: (moduleId: number) => getModuleById(database, moduleId),
    getUserById: (userId: number) => getUserById(database, userId),
    getCommentById: (commentId: number) => getCommentById(database, commentId),

    getLessonProgress: (userId: number, lessonId: number) =>
      getLessonProgress(database, userId, lessonId),
    getLessonProgressForCourse: (userId: number, courseId: number) =>
      getLessonProgressForCourse(database, userId, courseId),
    markLessonComplete: (userId: number, lessonId: number) =>
      markLessonComplete(database, userId, lessonId),
    markLessonInProgress: (userId: number, lessonId: number) =>
      markLessonInProgress(database, userId, lessonId),
    getLastWatchPosition: (userId: number, lessonId: number) =>
      getLastWatchPosition(database, userId, lessonId),
    calculateWatchProgress: (
      userId: number,
      lessonId: number,
      videoDurationSeconds: number
    ) =>
      calculateWatchProgress(database, userId, lessonId, videoDurationSeconds),

    /**
     * The lesson's Discussion as nested threads, every body rendered to
     * sanitised HTML.
     */
    getDiscussion: (lessonId: number) =>
      renderThread(getLessonThread(database, lessonId)),

    getQuizById: (quizId: number) => getQuizById(database, quizId),
    getQuizByLessonId: (lessonId: number) =>
      getQuizByLessonId(database, lessonId),
    getQuizWithQuestions: (quizId: number) =>
      getQuizWithQuestions(database, quizId),
    getBestAttempt: (userId: number, quizId: number) =>
      getBestAttempt(database, userId, quizId),
    /**
     * Scores the answers (question id to option id), records the attempt and
     * its answers, and returns the result. Returns null when the quiz does
     * not exist.
     */
    submitQuizAttempt: (
      userId: number,
      quizId: number,
      selectedAnswers: Record<number, number>
    ) => submitQuizAttempt(database, userId, quizId, selectedAnswers),
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const lessonViewer = /* @__PURE__ */ createLessonViewer(db);
