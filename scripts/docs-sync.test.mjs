import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { synchronize, github } from "./docs-sync.mjs";
const a = "a".repeat(40), b = "b".repeat(40), c = "c".repeat(40);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "ameow-docs-sync-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let prs = [], creates = 0, deployed = false;
  const api = { main: () => a, isAncestor: () => true, branch: () => ({ sha: b, files: ["site/src/content/docs/docs/faq.mdx"] }),
    find: () => prs, create: () => { creates++; prs = [{ number: 30, state: "OPEN", headRefOid: b, baseRefName: "main", url: "https://github.com/Wutpeach/Ameow/pull/30" }]; },
    pr: () => ({ state: "MERGED", headRefOid: b, mergeCommit: { oid: c }, files: ["site/src/content/docs/docs/faq.mdx"] }),
    deployed: () => deployed ? { id: 1, sha: c, state: "success", url: "https://api.github.com/deployments/1/statuses" } : null };
  const input = { through: a, topic: "recovery", title: "Docs", body: "Refs #19", reason: "Evidence checked", evidence: ["https://github.com/Wutpeach/Ameow/issues/19"] };
  return { root, api, input, call: command => synchronize(root, command, input, api), creates: () => creates, deploy: () => { deployed = true; },
    cursor: () => existsSync(join(root, ".ameow-docs-reviewed-sha")) ? readFileSync(join(root, ".ameow-docs-reviewed-sha"), "utf8").trim() : null };
}
test("publishing and repeating a topic reuses one PR without acknowledging main", t => {
  const f = fixture(t); assert.equal(f.call("publish").number, 30); assert.equal(f.call("publish").number, 30);
  assert.equal(f.creates(), 1); assert.equal(f.cursor(), null);
});
test("lost create receipt recovers the real PR instead of creating another", t => {
  const f = fixture(t), create = f.api.create; f.api.create = (...args) => { create(...args); throw new Error("response lost"); };
  assert.equal(f.call("publish").number, 30); assert.equal(f.call("publish").number, 30); assert.equal(f.creates(), 1);
});
test("failed create is durable and retry can resume with no cursor movement", t => {
  const f = fixture(t), create = f.api.create; f.api.create = () => { throw new Error("network"); };
  assert.throws(() => f.call("publish"), /network/); assert.equal(f.call("status").pending.phase, "publishing");
  assert.equal(f.cursor(), null); f.api.create = create; assert.equal(f.call("publish").number, 30);
});
test("failed deployment retains pending merge and retry completes the exact range", t => {
  const f = fixture(t); f.call("publish"); assert.throws(() => f.call("complete"), /deployment/);
  assert.equal(f.call("status").pending.phase, "merged"); assert.equal(f.cursor(), null);
  f.deploy(); f.call("complete"); assert.equal(f.cursor(), a); assert.equal(f.call("status").pending, null);
  f.call("complete"); const state = JSON.parse(readFileSync(join(f.root, ".ameow-docs-reviewed-state.json"))); assert.equal(state.reviews.length, 1);
});
test("changed PR head cannot complete using an old receipt", t => {
  const f = fixture(t); f.call("publish"); f.api.pr = () => ({ state: "MERGED", headRefOid: c, mergeCommit: { oid: c } });
  assert.throws(() => f.call("complete"), /recorded HEAD/); assert.equal(f.cursor(), null);
});
test("closed unmerged PR does not spawn duplicates", t => {
  const f = fixture(t); f.call("publish"); f.api.find = () => [{ number: 30, state: "CLOSED" }];
  assert.throws(() => f.call("publish"), /identity/); assert.equal(f.creates(), 1);
});
test("out of scope or renamed product paths are blocked before creation", t => {
  const f = fixture(t); f.api.branch = () => ({ sha: b, files: ["src/main.rs"] });
  assert.throws(() => f.call("publish"), /scope/); assert.equal(f.creates(), 0);
});
test("main movement and divergent cursor block completion", t => {
  const f = fixture(t); f.api.main = () => b; assert.throws(() => f.call("complete"), /main moved/);
  f.api.main = () => a; f.call("complete"); f.api.isAncestor = () => false; assert.throws(() => f.call("complete"), /ancestor/);
});
test("explicit failures and concurrent commands preserve cursor", t => {
  const f = fixture(t); f.call("complete"); const before = f.cursor();
  assert.equal(synchronize(f.root, "failure", { reason: "Worker REPAIR" }, f.api).cursorUnchanged, before);
  mkdirSync(join(f.root, ".ameow-docs-sync.lock")); assert.throws(() => f.call("complete")); assert.equal(f.cursor(), before);
});

const state = f => JSON.parse(readFileSync(join(f.root, ".ameow-docs-reviewed-state.json")));

test("first completion and deployment retry retain the actual final receipt", t => {
  for (const interrupted of [false, true]) {
    const f = fixture(t); f.call("publish");
    if (interrupted) assert.throws(() => f.call("complete"), /deployment/);
    f.deploy(); f.call("complete");
    const review = state(f).reviews.at(-1);
    assert.equal(review.result, "documentation_merged_and_deployed");
    assert.equal(review.pullRequest.mergeSha, c);
    assert.equal(review.pullRequest.phase, "deployed");
    assert.deepEqual(review.pullRequest.deployment, { required: true, id: 1, sha: c, state: "success", url: "https://api.github.com/deployments/1/statuses" });
  }
});

test("non-site changes complete with a separate no-deployment result", t => {
  const f = fixture(t); f.call("publish");
  f.api.pr = () => ({ state: "MERGED", headRefOid: b, mergeCommit: { oid: c }, files: ["README.md", "docs/report.md", "scripts/docs-sync.mjs"] });
  f.api.deployed = () => { throw new Error("No Pages job should be required"); };
  f.call("complete");
  const review = state(f).reviews.at(-1);
  assert.equal(review.result, "documentation_merged_no_pages_required");
  assert.equal(review.pullRequest.mergeSha, c);
  assert.equal(review.pullRequest.phase, "merged_no_pages_required");
  assert.equal(review.pullRequest.deployment.state, "not_required");
  assert.equal(f.cursor(), a);
});

test("missing file evidence blocks completion instead of assuming no deployment", t => {
  const f = fixture(t); f.call("publish");
  f.api.pr = () => ({ state: "MERGED", headRefOid: b, mergeCommit: { oid: c } });
  assert.throws(() => f.call("complete"), /files/); assert.equal(f.cursor(), null);
});

test("same topic can explicitly start another round after completed history", t => {
  const f = fixture(t); f.call("publish"); f.deploy(); f.call("complete");
  const history = { number: 30, state: "MERGED", headRefOid: b };
  f.api.find = () => [history];
  f.input.newRound = true;
  assert.throws(() => f.call("publish"), /new round/); // Same HEAD is never a new round.
  f.api.branch = () => ({ sha: c, files: ["site/src/content/docs/docs/faq.mdx"] });
  delete f.input.newRound;
  assert.throws(() => f.call("publish"), /new round/);
  f.input.newRound = true;
  let created = false;
  f.api.create = () => { created = true; };
  f.api.find = () => created ? [history, { number: 31, state: "OPEN", headRefOid: c, baseRefName: "main" }] : [history];
  assert.equal(f.call("publish").number, 31);
  assert.equal(f.call("publish").number, 31);
  assert.equal(f.cursor(), a);
});

test("lost receipt in a new round recovers only its open PR among historical PRs", t => {
  const f = fixture(t); f.input.newRound = true;
  const history = { number: 29, state: "CLOSED", headRefOid: c };
  let created = false;
  f.api.find = () => created ? [history, { number: 30, state: "OPEN", headRefOid: b, baseRefName: "main" }] : [history];
  f.api.create = () => { created = true; throw new Error("response lost"); };
  assert.equal(f.call("publish").number, 30);
  assert.equal(f.call("publish").number, 30);
});

test("pending closed or merged PR cannot be replaced even with a new-round flag", t => {
  const f = fixture(t); f.call("publish"); f.input.newRound = true;
  f.api.find = () => [{ number: 30, state: "MERGED", headRefOid: b }];
  assert.throws(() => f.call("publish"), /identity/);
  assert.equal(f.creates(), 1); assert.equal(f.cursor(), null);
});

test("failed creation in a new round retries without confusing historical PRs with its receipt", t => {
  const f = fixture(t); f.input.newRound = true;
  const history = { number: 29, state: "MERGED", headRefOid: c };
  let created = false;
  f.api.find = () => created ? [history, { number: 30, state: "OPEN", headRefOid: b, baseRefName: "main" }] : [history];
  f.api.create = () => { throw new Error("network"); };
  assert.throws(() => f.call("publish"), /network/);
  delete f.input.newRound; f.api.create = () => { created = true; };
  assert.equal(f.call("publish").number, 30); assert.equal(f.cursor(), null);
});

test("multiple open PRs fail closed even when old history is present", t => {
  const f = fixture(t);
  f.api.find = () => [{ state: "MERGED" }, { state: "OPEN" }, { state: "OPEN" }];
  assert.throws(() => f.call("publish"), /Ambiguous open/); assert.equal(f.creates(), 0);
});

test("completed deployment receipt survives an interrupted cursor write", t => {
  const f = fixture(t); f.call("publish"); f.deploy();
  const blocked = join(f.root, ".ameow-docs-reviewed-sha.tmp-" + process.pid);
  mkdirSync(blocked);
  assert.throws(() => f.call("complete"));
  assert.equal(f.cursor(), null);
  assert.equal(state(f).reviews[0].pullRequest.phase, "deployed");
  rmSync(blocked, { recursive: true }); f.call("complete");
  assert.equal(f.cursor(), a); assert.equal(state(f).reviews.length, 1);
  assert.equal(state(f).reviews[0].pullRequest.mergeSha, c);
});

test("GitHub adapter accepts a successful containing main deployment within the reviewed range", () => {
  const later = "d".repeat(40), future = "e".repeat(40);
  const candidate = (id, sha, ref = "main") => ({ id, sha, ref, statuses_url: "https://api.github.com/deployments/" + id + "/statuses" });
  const deployments = [candidate(1, future), candidate(2, b), candidate(3, c, "preview"), candidate(4, c), candidate(5, later)];
  const ancestry = new Set([c + later, later + a, c + c, c + a]);
  const api = github("unused", (program, args) => {
    if (program === "git") {
      if (!ancestry.has(args.at(-2) + args.at(-1))) throw new Error("not an ancestor");
      return "";
    }
    const endpoint = args.at(-1);
    if (endpoint.includes("environment=github-pages")) return JSON.stringify([deployments]);
    if (endpoint.includes("/4/statuses")) return JSON.stringify([{ state: "failure" }]);
    if (endpoint.includes("/5/statuses")) return JSON.stringify([{ state: "success", url: "https://api.github.com/status/5", environment_url: "https://wutpeach.github.io/Ameow/" }]);
    throw new Error("Unexpected endpoint: " + endpoint);
  });
  const receipt = api.deployed(c, a);
  assert.equal(receipt.id, 5); assert.equal(receipt.sha, later); assert.equal(receipt.state, "success");
  assert.equal(receipt.statusUrl, "https://api.github.com/status/5");
});

test("GitHub adapter preserves paginated rename paths and refuses incomplete PR files", () => {
  let count = 2;
  const api = github("unused", (_program, args) => {
    const endpoint = args.at(-1);
    if (endpoint.endsWith("/pulls/30")) return JSON.stringify({ changed_files: count, state: "closed", merged: true, head: { sha: b }, merge_commit_sha: c });
    if (endpoint.includes("/files?")) return JSON.stringify([[{ filename: "docs/moved.md", previous_filename: "site/old.md" }], [{ filename: "README.md" }]]);
    throw new Error("Unexpected endpoint");
  });
  assert.deepEqual(api.pr(30).files, ["docs/moved.md", "site/old.md", "README.md"]);
  count = 3; assert.throws(() => api.pr(30), /incomplete/);
});
