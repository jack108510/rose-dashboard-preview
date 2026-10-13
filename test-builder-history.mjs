import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("./workground/index.html", import.meta.url), "utf8");
const helperStart = source.indexOf("const builderHistoryWindowMs=");
const helperEnd = source.indexOf("const chatHistory=", helperStart);
const pruneStart = source.indexOf("let builderHistoryExpiryTimer=");
const pruneEnd = source.indexOf("function refreshEmptyPrompt(", pruneStart);
assert.ok(helperStart > 0 && helperEnd > helperStart && pruneStart > 0 && pruneEnd > pruneStart);

test("Builder keeps every turn from the last 45 minutes and no older turns", () => {
  const context = {};
  vm.runInNewContext(source.slice(helperStart, helperEnd) + "\nthis.recent = recentBuilderHistory;", context);
  const now = Date.now();
  const turns = [
    { role: "user", content: "expired", at: new Date(now - 46 * 60_000).toISOString() },
    ...Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `turn ${index}`, at: new Date(now - 10 * 60_000).toISOString() })),
  ];
  const recent = context.recent(turns, now);
  assert.equal(recent.length, 30);
  assert.equal(recent[0].content, "turn 0");
  assert.equal(context.recent(turns, now + 46 * 60_000).length, 0);
});

test("Builder resets to a plain welcome when its last turn expires", () => {
  const now = Date.now();
  const history = [{ role: "user", content: "old request", at: new Date(now - 46 * 60_000).toISOString() }];
  const storage = new Map();
  const messages = { innerHTML: "old thread", style: {} };
  const context = {
    chatHistory: history, localStorage: { setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    builderTaskState: { goal: "old request" }, builderTaskProtocol: true, pendingToolClarification: { request: "old request" },
    builderThreadNodes: { replaceChildren: () => {} }, currentSection: "Appearance", messages,
    modeText: { textContent: "" }, accountValidated: false, state: { name: "Rose" },
    workgroundAgentName: () => "Rose", clearTimeout: () => {}, setTimeout: () => 1,
  };
  vm.runInNewContext(source.slice(helperStart, helperEnd) + source.slice(pruneStart, pruneEnd) + "\nthis.prune = pruneBuilderHistory;", context);
  assert.equal(context.prune(true), true);
  assert.equal(history.length, 0);
  assert.match(messages.innerHTML, /What should Rose help with/);
  assert.doesNotMatch(messages.innerHTML, /wf-examples|data-workflow-example|start with one of these/);
  assert.equal(context.builderTaskState, null);
  assert.equal(storage.get("roseCommandHistory"), "[]");
});
