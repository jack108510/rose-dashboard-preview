import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("./workground/index.html", import.meta.url), "utf8");
function section(startName, endName) {
  const start = source.indexOf(`function ${startName}(`);
  const end = source.indexOf(`function ${endName}(`, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}
const script = [section("backendWorkflowToLocal", "addWorkflowDraftFromBackend"), section("workflowFlowHtml", "workflowRunHtml")].join("\n");
const labels = { rose: "Rose", hubspot: "HubSpot", gmail: "Gmail", slack: "Slack" };
const context = {
  settings: { ownerEmail: "owner@example.com" },
  toolMeta: value => { const slug = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); return { slug, name: labels[slug] || value }; },
  workflowFlowState: () => "draft", workflowToolColor: () => "#123456", workflowLogoHtml: () => "<i></i>",
  wfNodeType: node => node.type, wfNodeName: node => node.name, wfNodeDesc: node => node.description,
  isConnected: () => false, esc: value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;"),
};
vm.createContext(context);
vm.runInContext(`${script}\nthis.convert = backendWorkflowToLocal; this.flow = workflowFlowHtml; this.details = workflowPlanHtml;`, context);

const draft = {
  title: "HubSpot + Gmail + Slack lead handoff", ownerRequest: "Build a workflow with HubSpot, Gmail, and Slack only for urgent leads",
  requiredTools: ["hubspot", "gmail", "slack"], stepRules: { hubspot: "all_leads", gmail: "all_leads", slack: "hot_lead" }, stepFilters: { slack: { matchKeywords: "quote,estimate,pricing" } }, initialConfig: { channel: "sales" },
  steps: [
    { id: "capture", label: "Capture website lead", tool: "Rose", action: "Use the lead Rose captured on the website", when: "all_leads", inputs: ["website conversation"], outputs: ["captured lead"] },
    { id: "prepare", label: "Prepare and route", tool: "Rose", action: "Normalize contact details", when: "all_leads", inputs: ["captured lead"], outputs: ["contact"] },
    { id: "send_hubspot", label: "Create HubSpot contact", tool: "hubspot", action: "Create a contact", when: "all_leads", inputs: ["email"], outputs: ["contact"], fieldMapping: ["email → email"] },
    { id: "send_gmail", label: "Send Gmail summary", tool: "gmail", action: "Email owner summary", when: "all_leads", inputs: ["recipient"], outputs: ["message"], fieldMapping: ["recipient → email"] },
    { id: "send_slack", label: "Post Slack alert", tool: "slack", action: "Post to channel", when: "hot_lead", conditionLabel: "Urgent quote requests only", inputs: ["channel"], outputs: ["alert"], fieldMapping: ["channel → channel"] },
  ],
  setupFields: [{ id: "recipientEmail", label: "Who receives the summary?" }],
};

test("Workground preserves the five-step plan and its urgent branch", () => {
  const workflow = context.convert(draft);
  assert.equal(workflow.nodes.length, 5);
  assert.equal(workflow.planSteps.length, 5);
  assert.equal(workflow.nodes[4].when, "hot_lead");
  assert.equal(workflow.setup.length, 1);
  assert.equal(workflow.config.channel, "sales");
  assert.equal(workflow.stepFilters.slack.matchKeywords, "quote,estimate,pricing");
  assert.deepEqual(Array.from(workflow.requiredTools), ["hubspot", "gmail", "slack"]);
  assert.doesNotMatch(workflow.summary.whatHappens, /search.*update/i);
});

test("Workground renders all steps, the branch, and the field map", () => {
  const workflow = context.convert(draft);
  const flow = context.flow(workflow);
  const details = context.details(workflow);
  assert.equal((flow.match(/class="wf-step wf-step-/g) || []).length, 5);
  assert.match(flow, /Urgent quote requests only/);
  assert.match(details, /5 steps/);
  assert.match(details, /email → email/);
  assert.match(details, /Urgent quote requests only/);
});
