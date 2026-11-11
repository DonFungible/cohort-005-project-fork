import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./bookmarks-and-notes.server";
import { MAX_NOTE_LENGTH } from "./notes";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesAfter(minutes: number) {
  return new Date(NOW.getTime() + minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];
let otherStudentId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );

  otherStudentId = db
    .insert(schema.users)
    .values({
      name: "Priya",
      email: "priya@example.com",
      role: schema.UserRole.Student,
    })
    .returning()
    .get().id;
});

describe("toggling a Bookmark", () => {
  it("bookmarks a Lesson that has no Bookmark", () => {
    const nowBookmarked = toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(nowBookmarked).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);
  });

  it("removes the Bookmark when toggled again", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    const nowBookmarked = toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(nowBookmarked).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);
    expect(listBookmarks(db, base.user.id)).toEqual([]);
  });

  it("never leaves a Student with two Bookmarks on one Lesson", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
    expect(() =>
      db
        .insert(schema.bookmarks)
        .values({ userId: base.user.id, lessonId: lessonIds[0] })
        .run()
    ).toThrow();
  });

  it("bookmarks for one Student only", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(isBookmarked(db, otherStudentId, lessonIds[0])).toBe(false);
  });
});

describe("saving a Note", () => {
  it("has no Note on a Lesson until one is saved", () => {
    expect(getNote(db, base.user.id, lessonIds[0])).toBeNull();
  });

  it("creates the Note with the body trimmed", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "  # not a heading\nsecond line  ",
      NOW
    );

    expect(result).toEqual({
      ok: true,
      note: {
        body: "# not a heading\nsecond line",
        updatedAt: NOW.toISOString(),
      },
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "# not a heading\nsecond line",
      updatedAt: NOW.toISOString(),
    });
  });

  it("replaces the body and moves the last edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thoughts", NOW);

    saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "Second thoughts",
      minutesAfter(5)
    );

    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Second thoughts",
      updatedAt: minutesAfter(5).toISOString(),
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("never leaves a Student with two Notes on one Lesson", () => {
    saveNote(db, base.user.id, lessonIds[0], "Mine", NOW);

    expect(() =>
      db
        .insert(schema.notes)
        .values({ userId: base.user.id, lessonId: lessonIds[0], body: "Again" })
        .run()
    ).toThrow();
  });

  it("accepts a Note at exactly the cap", () => {
    const body = "a".repeat(MAX_NOTE_LENGTH);

    const result = saveNote(db, base.user.id, lessonIds[0], body, NOW);

    expect(result.ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(body);
  });

  it("refuses a Note over the cap and keeps what was there", () => {
    saveNote(db, base.user.id, lessonIds[0], "Kept", NOW);

    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH + 1),
      minutesAfter(5)
    );

    expect(result).toEqual({
      ok: false,
      error: "A Note can be at most 2,000 characters.",
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Kept",
      updatedAt: NOW.toISOString(),
    });
  });

  it("removes the Note when saved empty", () => {
    saveNote(db, base.user.id, lessonIds[0], "Going away", NOW);

    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "   ",
      minutesAfter(5)
    );

    expect(result).toEqual({ ok: true, note: null });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeNull();
  });

  it("keeps one Student's Note from another Student", () => {
    saveNote(db, base.user.id, lessonIds[0], "Private", NOW);

    expect(getNote(db, otherStudentId, lessonIds[0])).toBeNull();
  });
});

describe("the Saved lists", () => {
  it("lists a Student's Bookmarks newest first, each with its Lesson and Course", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[1], minutesAfter(10));
    toggleBookmark(db, base.user.id, lessonIds[2], minutesAfter(5));

    const list = listBookmarks(db, base.user.id);

    expect(list.map((row) => row.lessonTitle)).toEqual([
      "Lesson 2",
      "Lesson 3",
      "Lesson 1",
    ]);
    expect(list[0]).toMatchObject({
      lessonId: lessonIds[1],
      courseTitle: "Test Course",
      courseSlug: "test-course",
    });
  });

  it("lists a Student's Notes most recently edited first, each with its Lesson and Course", () => {
    saveNote(db, base.user.id, lessonIds[0], "Oldest, then edited", NOW);
    saveNote(db, base.user.id, lessonIds[1], "Middle", minutesAfter(5));
    saveNote(db, base.user.id, lessonIds[0], "Edited last", minutesAfter(10));

    const list = listNotes(db, base.user.id);

    expect(list.map((row) => row.body)).toEqual(["Edited last", "Middle"]);
    expect(list[0]).toMatchObject({
      lessonId: lessonIds[0],
      lessonTitle: "Lesson 1",
      courseTitle: "Test Course",
      courseSlug: "test-course",
      updatedAt: minutesAfter(10).toISOString(),
    });
  });

  it("contains only that Student's rows", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    saveNote(db, base.user.id, lessonIds[0], "Mine", NOW);
    toggleBookmark(db, otherStudentId, lessonIds[1], NOW);
    saveNote(db, otherStudentId, lessonIds[1], "Priya's", NOW);

    expect(listBookmarks(db, base.user.id).map((row) => row.lessonId)).toEqual([
      lessonIds[0],
    ]);
    expect(listNotes(db, base.user.id).map((row) => row.body)).toEqual([
      "Mine",
    ]);
  });
});
