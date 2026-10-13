import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("./workground/index.html", import.meta.url), "utf8");
const start = source.indexOf("function addBuilderPlanCard(");
const end = source.indexOf("async function runRoseLlm(", start);
assert.ok(start >= 0 && end > start);
const html = value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cards = [];
const context = { document: { createElement: () => ({ setAttribute() {}, remove() { cards.splice(cards.indexOf(this), 1); } }) },
  messages: { querySelectorAll: () => cards, appendChild(card) { cards.push(card); }, style: {}, scrollHeight: 100, scrollTop: 0 }, esc: html };
vm.runInNewContext(`${source.slice(start, end)}\nthis.render = addBuilderPlanCard;`, context);

test("Builder shows source, action, and next step without claiming the workflow is live", () => {
  context.render({ goal: "Email me quote requests", source: { kind: "rose_chat", label: "Rose visitor chat" }, actions: [{ label: "Send email" }], status: "needs_connection", nextStep: "Connect Gmail" });
  assert.equal(cards.length, 1);
  assert.match(cards[0].innerHTML, /Rose visitor chat/);
  assert.match(cards[0].innerHTML, /Send email/);
  assert.match(cards[0].innerHTML, /Connection needed/);
  assert.match(cards[0].innerHTML, /Connect Gmail/);
  assert.doesNotMatch(cards[0].innerHTML, /active|published/i);
});

test("the next turn updates the plan and escapes owner supplied text", () => {
  context.render({ goal: "Email me quote requests", source: { kind: "external", label: "<script>" }, actions: [{ label: "Send email" }], status: "ready_to_test", nextStep: "Test the draft" });
  assert.equal(cards.length, 1);
  assert.match(cards[0].innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(cards[0].innerHTML, /<script>/);
  assert.match(cards[0].innerHTML, /Draft ready to test/);
});
