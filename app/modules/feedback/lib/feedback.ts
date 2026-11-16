import { data } from "react-router";
import { z } from "zod";
import { parseFormData } from "~/lib/validation";

/** Runs a program with its arguments, never through a shell, and resolves with its stdout. */
export type RunCommand = (command: string, args: string[]) => Promise<string>;

export type FeedbackDeps = { isDev: boolean; run: RunCommand };

const feedbackSchema = z.object({
  title: z.string().trim().min(1, "Give the feedback a title."),
  description: z.string().trim().min(1, "Say what happened."),
  page: z.string().default("/"),
});

type Feedback = z.infer<typeof feedbackSchema>;

function issueBody({ description, page }: Feedback) {
  return `_Sent from the feedback button on \`${page}\`._\n\n${description}\n`;
}

/** `owner/repo` from a GitHub remote: https, ssh:// or scp-style `git@`. */
function githubRepoFromRemote(remoteUrl: string) {
  const match = remoteUrl
    .trim()
    .match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/);
  return match ? match[1] : null;
}

// `gh` on its own may pick the course repo: `npm run reset` and
// `cherry-pick` add an `upstream` remote, and gh prefers it. Feedback is
// for the learner's own repo, so the target is always origin's.
async function originRepo(run: RunCommand) {
  const remote = await run("git", ["remote", "get-url", "origin"]);
  const repo = githubRepoFromRemote(remote);
  if (!repo) {
    throw data(`origin is not a GitHub repo: ${remote.trim()}`, {
      status: 500,
    });
  }
  return repo;
}

// Feedback is one or two sentences from someone looking at a page, which is
// too thin to build from. The label starts the explore workflow
// (.github/workflows/agent-explore.yml), so the ticket carries findings
// before anyone decides to build it.
const EXPLORE_LABEL = "agent:explore";

// `gh issue create --label` fails on a label the repo lacks, and a fresh
// clone lacks this one. `--force` makes the create a no-op when it exists.
async function ensureExploreLabel(run: RunCommand, repo: string) {
  await run("gh", [
    "label",
    "create",
    EXPLORE_LABEL,
    "--repo",
    repo,
    "--color",
    "5319E7",
    "--description",
    "The factory explores this ticket",
    "--force",
  ]);
}

export async function fileFeedbackIssue(deps: FeedbackDeps, form: FormData) {
  if (!deps.isDev) throw data("Not found", { status: 404 });

  const parsed = parseFormData(form, feedbackSchema);
  if (!parsed.success) {
    throw data(Object.values(parsed.errors).join(" "), { status: 400 });
  }

  const repo = await originRepo(deps.run);
  await ensureExploreLabel(deps.run, repo);
  const stdout = await deps.run("gh", [
    "issue",
    "create",
    "--repo",
    repo,
    "--title",
    parsed.data.title,
    "--body",
    issueBody(parsed.data),
    "--label",
    EXPLORE_LABEL,
  ]);

  return { issueUrl: stdout.trim() };
}
