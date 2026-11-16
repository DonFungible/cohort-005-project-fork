import { describe, it, expect, beforeEach } from "vitest";
import { createComment, deleteComment } from "~/lib/comments.server";
import { fakeNotifications } from "~/lib/notifications.fake.server";
import { flattenCourseLessons } from "../index.server";
import { lessonViewerFixture } from "./fixtures";

const NOW = new Date("2026-11-16T12:00:00Z");

let fixture: ReturnType<typeof lessonViewerFixture>;

beforeEach(() => {
  fixture = lessonViewerFixture();
});

async function postComment(
  authorId: number,
  body: string,
  parentId: number | null = null
) {
  const result = await createComment(
    fixture.db,
    authorId,
    fixture.lessons[0].id,
    parentId,
    body,
    NOW,
    fakeNotifications()
  );
  if (!result.ok) throw new Error(result.error);
  return result.comment;
}

describe("lesson data", () => {
  it("loads the course with its instructor and lessons grouped by module", () => {
    const { viewer, course, instructor, modules, lessons } = fixture;

    const details = viewer.getCourseWithDetails(course.id);

    expect(details?.instructorName).toBe(instructor.name);
    expect(details?.categoryName).toBe("Programming");
    expect(details?.modules.map((m) => m.title)).toEqual([
      "Basics",
      "Advanced",
    ]);
    expect(details?.modules[0].lessons.map((l) => l.id)).toEqual([
      lessons[0].id,
      lessons[1].id,
    ]);
    expect(details?.modules[1].lessons.map((l) => l.moduleId)).toEqual([
      modules.advanced.id,
    ]);
    expect(viewer.getCourseWithDetails(course.id + 1)).toBeNull();
  });

  it("flattens the curriculum into reading order", () => {
    const { viewer, course } = fixture;
    const details = viewer.getCourseWithDetails(course.id);
    if (!details) throw new Error("course missing");

    expect(
      flattenCourseLessons(details).map((l) => [l.title, l.moduleTitle])
    ).toEqual([
      ["Lesson 1", "Basics"],
      ["Lesson 2", "Basics"],
      ["Lesson 3", "Advanced"],
    ]);
  });

  it("looks up a lesson, module and user by id", () => {
    const { viewer, user, lessons, modules } = fixture;

    expect(viewer.getLessonById(lessons[2].id)?.title).toBe("Lesson 3");
    expect(viewer.getModuleById(modules.basics.id)?.title).toBe("Basics");
    expect(viewer.getUserById(user.id)?.email).toBe(user.email);
  });
});

describe("the discussion", () => {
  it("nests replies under their question and marks the instructor", async () => {
    const { viewer, user, instructor, lessons } = fixture;
    const question = await postComment(user.id, "Why **this**?");
    await postComment(instructor.id, "Because.", question.id);

    expect(viewer.getCommentById(question.id)?.userId).toBe(user.id);

    const thread = await viewer.getDiscussion(lessons[0].id);
    expect(thread).toHaveLength(1);
    expect(thread[0].author.isInstructor).toBe(false);
    expect(thread[0].bodyHtml).toContain("<strong>this</strong>");
    expect(thread[0].replies).toHaveLength(1);
    expect(thread[0].replies[0].author.isInstructor).toBe(true);
  });

  it("drops a deleted question that has no replies", async () => {
    const { db, viewer, user, lessons } = fixture;
    const question = await postComment(user.id, "Never mind");
    await deleteComment(
      db,
      question.id,
      user.id,
      false,
      NOW,
      fakeNotifications()
    );

    expect(await viewer.getDiscussion(lessons[0].id)).toEqual([]);
  });

  it("keeps a deleted question that has replies, with its body blanked", async () => {
    const { db, viewer, user, instructor, lessons } = fixture;
    const question = await postComment(user.id, "Secret");
    await postComment(instructor.id, "Answer", question.id);
    await deleteComment(
      db,
      question.id,
      user.id,
      false,
      NOW,
      fakeNotifications()
    );

    const [kept] = await viewer.getDiscussion(lessons[0].id);
    expect(kept.deleted).toBe(true);
    expect(kept.bodyHtml).toBe("");
    expect(kept.replies).toHaveLength(1);
  });
});
