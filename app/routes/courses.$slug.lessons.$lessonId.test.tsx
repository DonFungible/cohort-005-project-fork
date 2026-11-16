import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import LessonViewer from "./courses.$slug.lessons.$lessonId";

const ROUTE_ID = "lesson";
const PATH = "/courses/intro/lessons/18";

function fullLessonData(overrides: Record<string, unknown> = {}) {
  return {
    view: "full",
    course: { id: 1, title: "Intro", slug: "intro" },
    curriculum: [
      { id: 1, title: "Module", lessons: [{ id: 18, title: "Errors" }] },
    ],
    module: { id: 1, title: "Module" },
    lesson: {
      id: 18,
      title: "Errors",
      durationMinutes: null,
      githubRepoUrl: null,
      videoUrl: null,
    },
    contentHtml: "<p>Lesson body text</p>",
    lessonStatus: null,
    enrolled: true,
    currentUserId: 5,
    prevLesson: null,
    nextLesson: { id: 19, title: "Wrap-up" },
    quiz: null,
    bestAttempt: null,
    lastWatchPosition: 0,
    watchProgress: 0,
    lessonProgressMap: {},
    comments: [],
    canModerate: false,
    instructorName: "Instructor",
    bookmarked: false,
    note: null,
    ...overrides,
  };
}

function renderLesson(loaderData: ReturnType<typeof fullLessonData>) {
  const Stub = createRoutesStub([
    {
      id: ROUTE_ID,
      path: "/courses/:slug/lessons/:lessonId",
      Component: LessonViewer,
    },
  ]);
  return renderToString(
    <Stub
      initialEntries={[PATH]}
      hydrationData={{ loaderData: { [ROUTE_ID]: loaderData } }}
    />
  );
}

function positionOf(html: string, text: string) {
  const index = html.indexOf(text);
  expect(index, `"${text}" is not on the page`).toBeGreaterThan(-1);
  return index;
}

describe("lesson page notes", () => {
  it("places the notes below the lesson content and discussion", () => {
    const html = renderLesson(fullLessonData());
    const notes = positionOf(html, "Your notes");

    expect(notes).toBeGreaterThan(positionOf(html, "Lesson body text"));
    expect(notes).toBeGreaterThan(positionOf(html, "Up next:"));
    expect(notes).toBeGreaterThan(
      positionOf(html, "Questions &amp; Discussion")
    );
  });

  it("places the notes above the previous and next links", () => {
    const html = renderLesson(fullLessonData());

    expect(positionOf(html, "Your notes")).toBeLessThan(
      positionOf(html, ">Next</div>")
    );
  });

  it("shows no notes to a signed-out visitor", () => {
    const html = renderLesson(fullLessonData({ currentUserId: null }));

    expect(html).not.toContain("Your notes");
  });
});
