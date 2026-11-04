// State and PR receipts for Cindy Docs Sync; scheduling, editing and review stay with Cindy.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

export const repository = "Wutpeach/Ameow";
const shaPattern = /^[a-f0-9]{40}$/;
const scheduleId = "2f51bb54-18c9-4824-a306-9796d77943c7";
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function atomic(file, value) {
  const temp = file + ".tmp-" + process.pid;
  writeFileSync(temp, value, { flag: "wx" });
  renameSync(temp, file);
}

// Inject the GitHub boundary for deterministic recovery tests; production always uses gh.
export function synchronize(root, command, input, api) {
  const stateFile = join(root, ".ameow-docs-reviewed-state.json");
  const cursorFile = join(root, ".ameow-docs-reviewed-sha");
  const lock = join(root, ".ameow-docs-sync.lock");
  mkdirSync(lock); // Fail closed on concurrent execution; never discard an unknown lock.
  try {
    const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {
      schemaVersion: 1, scheduleId, repository, branch: "main", reviews: [],
    };
    requireValue(state.schemaVersion === 1 && state.repository === repository && state.scheduleId === scheduleId
      && state.branch === "main" && Array.isArray(state.reviews), "Unrecognized review state");
    const cursor = existsSync(cursorFile) ? readFileSync(cursorFile, "utf8").trim() : null;
    requireValue(cursor === null || shaPattern.test(cursor), "Invalid review cursor");
    const save = () => atomic(stateFile, JSON.stringify(state, null, 2) + "\n");
    if (command === "status") return { cursor, pending: state.pending ?? null, lastFailure: state.lastFailure ?? null };
    if (command === "failure") {
      requireValue(typeof input.reason === "string" && input.reason.length > 0, "Failure needs a reason");
      state.lastFailure = { at: new Date().toISOString(), reason: input.reason };
      save();
      return { recorded: true, cursorUnchanged: cursor };
    }
    const through = input.through;
    requireValue(shaPattern.test(through ?? ""), "An exact reviewed main SHA is required");
    requireValue(api.main() === through, "main moved; review the missing commits before continuing");
    if (cursor) requireValue(api.isAncestor(cursor, through), "Cursor is not an ancestor of reviewed main");
    if (command === "publish") {
      requireValue(/^[a-z0-9][a-z0-9-]{0,60}$/.test(input.topic ?? ""), "Invalid topic");
      const head = "docs/sync-" + input.topic;
      const previous = state.pending;
      requireValue(!previous || previous.topic === input.topic, "Recover the existing pending topic first");
      requireValue(previous?.phase !== "merged", "Finish the merged deployment before publishing again");
      requireValue(typeof input.title === "string" && input.title.length > 0 && typeof input.body === "string" && input.body.length > 0, "PR title/body are required");
      const branch = api.branch(head);
      requireValue(shaPattern.test(branch.sha ?? ""), "Remote documentation branch is missing");
      requireValue(branch.files.length > 0 && branch.files.every(p =>
        p.startsWith("site/") || p.startsWith("docs/") ||
        ["README.md", "README.en.md", "scripts/docs-sync.mjs", "scripts/docs-sync.test.mjs"].includes(p)),
      "Changes exceed documentation scope or are empty");
      let prs = api.find(head); // Always discover before create, including after a lost receipt.
      requireValue(prs.length <= 1, "Ambiguous PRs for the same documentation branch");
      let pr = prs[0];
      requireValue(!pr || pr.state === "OPEN", "Existing PR is closed; inspect it instead of creating a duplicate");
      if (previous?.number) requireValue(pr?.number === previous.number, "Pending PR identity changed");
      state.pending = { topic: input.topic, head, through, headSha: branch.sha, phase: "publishing", number: pr?.number ?? null };
      save(); // Intent is durable before external writes; failure never advances the cursor.
      if (!pr) {
        try { api.create(head, input.title, input.body); }
        catch (error) {
          prs = api.find(head);
          if (prs.length !== 1 || prs[0].state !== "OPEN") throw error;
        }
        prs = api.find(head);
        requireValue(prs.length === 1 && prs[0].state === "OPEN", "Cannot confirm created PR");
        pr = prs[0];
      }
      requireValue(pr.headRefOid === branch.sha && pr.baseRefName === "main", "PR head/base does not match the published branch");
      state.pending = { ...state.pending, number: pr.number, url: pr.url, phase: "awaiting_review" };
      delete state.lastFailure;
      save();
      return state.pending;
    }
    requireValue(command === "complete", "Unknown command");
    requireValue(typeof input.reason === "string" && input.reason.length > 0 && Array.isArray(input.evidence) && input.evidence.length > 0, "Completion needs a reason and evidence");
    const pending = state.pending;
    if (pending) {
      requireValue(pending.number, "Recover the publishing operation before completion");
      const pr = api.pr(pending.number);
      requireValue(pr.state === "MERGED" && pr.headRefOid === pending.headSha, "Pending PR has not merged at its recorded HEAD");
      requireValue(shaPattern.test(pr.mergeCommit?.oid ?? "") && api.isAncestor(pr.mergeCommit.oid, through), "Pending merge is outside the reviewed range");
      state.pending = { ...pending, phase: "merged", mergeSha: pr.mergeCommit.oid };
      save();
      requireValue(api.deployed(pr.mergeCommit.oid), "Merged Pages deployment is not successful yet");
    }
    const last = state.reviews.at(-1);
    if (last?.reviewedThroughSha !== through) state.reviews.push({
      checkedAtUtc: new Date().toISOString(), previousReviewedSha: cursor, reviewedThroughSha: through,
      result: pending ? "documentation_merged_and_deployed" : "no_documentation_update",
      reason: input.reason, evidence: input.evidence, pullRequest: pending ?? null,
    });
    delete state.pending;
    delete state.lastFailure;
    save(); // Persist the result first; an interrupted cursor write causes a safe recheck.
    atomic(cursorFile, through + "\n");
    return { reviewedThroughSha: through, cursorAdvanced: true };
  } finally { rmSync(lock, { recursive: true }); }
}

function run(program, args, cwd) {
  return execFileSync(program, args, { cwd, encoding: "utf8", windowsHide: true, timeout: 60000,
    stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" } }).trim();
}
export function github(root) {
  const gh = args => run("gh", args, root);
  const json = args => JSON.parse(gh(args));
  const git = args => run("git", args, root);
  return {
    main: () => json(["api", `repos/${repository}/commits/main`]).sha,
    isAncestor: (a, b) => { try { git(["merge-base", "--is-ancestor", a, b]); return true; } catch { return false; } },
    branch: head => {
      const sha = json(["api", `repos/${repository}/git/ref/heads/${head}`]).object.sha;
      // Compare the entire PR range, not just its latest commit.
      const comparison = json(["api", `repos/${repository}/compare/main...${sha}`]);
      requireValue(comparison.files?.length < 300, "Comparison may be truncated");
      return { sha, files: comparison.files.flatMap(f => [f.filename, ...(f.previous_filename ? [f.previous_filename] : [])]) };
    },
    find: head => json(["pr", "list", "--repo", repository, "--head", head, "--base", "main", "--state", "all", "--limit", "100",
      "--json", "number,url,state,headRefOid,baseRefName"]),
    create: (head, title, body) => gh(["pr", "create", "--repo", repository, "--base", "main", "--head", head, "--title", title, "--body", body]),
    pr: number => json(["pr", "view", String(number), "--repo", repository, "--json", "state,headRefOid,mergeCommit"]),
    deployed: sha => {
      const deployments = json(["api", `repos/${repository}/deployments?sha=${sha}&environment=github-pages&per_page=100`]);
      return deployments.some(d => json(["api", `repos/${repository}/deployments/${d.id}/statuses?per_page=1`])[0]?.state === "success");
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, inputFile] = process.argv.slice(2);
    const input = inputFile ? JSON.parse(readFileSync(inputFile, "utf8")) : {};
    const root = "D:/Ameow";
    console.log(JSON.stringify(synchronize(root, command, input, github(root)), null, 2));
  } catch (error) { console.error("Docs Sync failed:", error.message); process.exitCode = 1; }
}
