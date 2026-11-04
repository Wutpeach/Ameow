import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { synchronize } from "./docs-sync.mjs";
const a = "a".repeat(40), b = "b".repeat(40), c = "c".repeat(40);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "ameow-docs-sync-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let prs = [], creates = 0, deployed = false;
  const api = { main: () => a, isAncestor: () => true, branch: () => ({ sha: b, files: ["site/src/content/docs/docs/faq.mdx"] }),
    find: () => prs, create: () => { creates++; prs = [{ number: 30, state: "OPEN", headRefOid: b, baseRefName: "main", url: "https://github.com/Wutpeach/Ameow/pull/30" }]; },
    pr: () => ({ state: "MERGED", headRefOid: b, mergeCommit: { oid: c } }), deployed: () => deployed };
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
  assert.throws(() => f.call("publish"), /closed/); assert.equal(f.creates(), 1);
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
