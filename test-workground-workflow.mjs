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
  assert.match(details, /data-workflow-rule="slack"/);
  assert.match(details, /data-workflow-field-map="hubspot"/);
  assert.match(flow, /wf-step-branch/);
});

test("Workground shows the values each app would receive in a dry run", () => {
  const workflow = context.convert(draft);
  workflow.lastTestPreview = { ok: true, scenarios: [{ label: "Urgent Slack branch", status: "dry_run", lead: { projectType: "quote", urgency: "urgent" }, steps: [{ provider: "slack", status: "dry_run", toolSlug: "SLACK_CHAT_POST_MESSAGE", arguments: { channel: "sales", markdown_text: "Sample lead" }, schema: { requiredFields: ["channel"] } }] }] };
  const details = context.details(workflow);
  assert.match(details, /Test preview/);
  assert.match(details, /Sample lead/);
  assert.match(details, /Required fields: channel/);
});

test("editing a field or branch updates the saved workflow definition and invalidates its test", () => {
  const listeners = {};
  const card = { className: "", dataset: {}, innerHTML: "", addEventListener: (type, fn) => { listeners[type] = fn; }, querySelector: () => null };
  Object.assign(context, { document: { createElement: () => card }, workflowCardHtml: () => "", workflowNotes: new Map(), scheduleDraftSave: () => {}, scheduleWorkflowConfigSave: () => {}, refreshWorkflowCards: () => {} });
  vm.runInContext(`${section("buildWorkflowCard", "uniqueWorkflows")}\nthis.buildCard = buildWorkflowCard;`, context);
  const workflow = context.convert(draft);
  workflow.testEvents = [{ ok: true }];
  context.buildCard(workflow);
  const emit = (selector, value, data) => listeners.change({ target: { closest: query => query === selector ? { value, dataset: data } : null } });
  emit("[data-workflow-field-map]", "service", { workflowFieldMap: "gmail", workflowTarget: "projectType" });
  assert.equal(workflow.fieldMapping.gmail.projectType, "service");
  assert.equal(workflow.testEvents.length, 0);
  emit("[data-workflow-rule]", "all_leads", { workflowRule: "slack" });
  assert.equal(workflow.stepRules.slack, "all_leads");
  assert.equal(workflow.planSteps.at(-1).when, "all_leads");
  assert.equal(workflow.nodes.at(-1).when, "all_leads");
});

test("connected destination choices appear beside manual setup fields", () => {
  const start = source.indexOf("function workflowDestinationChoices(");
  const end = source.indexOf("const workflowSaveQueue", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end) + "\nthis.setupFields = workflowSetupFields;", context);
  const workflow = context.convert(draft);
  workflow.destinationOptions = { slack: { status: "ready", options: [{ value: "C123", label: "#sales" }] } };
  context.isConnected = slug => slug === "slack";
  const html = context.setupFields(workflow);
  assert.match(html, /value="C123" label="#sales"/);
  assert.match(html, /data-workflow-discover/);
  assert.match(html, /data-workflow-config="channel"/);
});

test("a discovered app draft keeps its executable action and owner setup field", () => {
  const custom = context.convert({ title: "Trello lead capture", ownerRequest: "Save every lead to Trello", requiredTools: ["trello"], stepRules: { trello: "all_leads" }, actions: { trello: { toolSlug: "TRELLO_ADD_CARDS", fields: { name: { source: "lead.name" }, idList: { source: "config.idList" } } } }, setupFields: [{ id: "idList", label: "Which Trello list should receive these?" }], steps: [{ id: "capture", label: "Capture lead", tool: "Rose", action: "Capture" }, { id: "prepare", label: "Prepare contact", tool: "Rose", action: "Prepare" }, { id: "save", label: "Save in Trello", tool: "trello", action: "Create card" }] });
  assert.equal(custom.actions.trello.toolSlug, "TRELLO_ADD_CARDS");
  assert.match(context.setupFields(custom), /data-workflow-config="idList"/);
  custom.destinationOptions={trello:{status:'ready',options:[{value:'list-123',label:'Sales board / New leads'}]}};
  const choices=context.setupFields(custom);
  assert.match(choices, /<select data-workflow-config="idList"/);
  assert.match(choices, /Sales board \/ New leads/);
});

test("nested tool bindings expose each owner setup value", () => {
  const custom = context.convert({ title: "Asana lead task", requiredTools: ["asana"], stepRules: { asana: "all_leads" }, actions: { asana: { toolSlug: "ASANA_CREATE_A_TASK", fields: { data: { object: { name: { source: "lead.name" }, workspace: { source: "config.workspaceId" }, projects: { array: [{ source: "config.projectId" }] } } } } } }, setupFields: [{ id: "workspaceId", label: "Asana workspace" }, { id: "projectId", label: "Asana project" }], steps: [{ id: "capture", label: "Capture lead", tool: "Rose" }, { id: "send", label: "Create task", tool: "asana" }] });
  const html = context.setupFields(custom);
  assert.match(html, /data-workflow-config="workspaceId"/);
  assert.match(html, /data-workflow-config="projectId"/);
});

test("Notion pages and Monday boards are selected by name", () => {
  for (const item of [
    { provider: "notion", slug: "NOTION_CREATE_NOTION_PAGE", key: "parent_id", label: "Customer leads", value: "page-123" },
    { provider: "monday", slug: "MONDAY_CREATE_ITEM", key: "board_id", label: "Sales leads", value: "board-123" },
  ]) {
    const workflow = context.convert({ title: item.provider, ownerRequest: "Save every lead", requiredTools: [item.provider], stepRules: { [item.provider]: "all_leads" }, actions: { [item.provider]: { toolSlug: item.slug, fields: { title: { source: "lead.name" }, [item.key]: { source: `config.${item.key}` } } } }, setupFields: [{ id: item.key, label: `Which ${item.provider} destination?` }], steps: [{ id: "capture", label: "Capture lead", tool: "Rose", action: "Capture" }, { id: "prepare", label: "Prepare lead", tool: "Rose", action: "Map fields" }, { id: "send", label: "Save lead", tool: item.provider, action: "Create destination item" }] });
    workflow.destinationOptions = { [item.provider]: { status: "ready", options: [{ value: item.value, label: item.label }] } };
    const html = context.setupFields(workflow);
    assert.match(html, new RegExp(`<select data-workflow-config="${item.key}"`));
    assert.match(html, new RegExp(item.label));
  }
});

test("confirmed booking draft shows its event and distinct phone fields", () => {
  const bookingDraft = { ...draft, title: "Calendly booking confirmation", triggerType: "confirmed_booking", sourceTool: "calendly", requiredTools: ["gmail", "twilio"], stepRules: { gmail: "all_leads", twilio: "all_leads" }, setupFields: [{ id: "ownerPhone", label: "Your alert number" }, { id: "fromNumber", label: "Twilio sender" }], steps: [{ id: "capture", label: "Confirmed booking", tool: "Rose", action: "Accept booking" }, { id: "prepare", label: "Prepare booking", tool: "Rose", action: "Check booking" }, { id: "send_gmail", label: "Email customer", tool: "gmail", action: "Send confirmation" }, { id: "send_twilio", label: "Text owner", tool: "twilio", action: "Send SMS" }] };
  const workflow = context.convert(bookingDraft);
  workflow.bookingWebhookSecret = "test-key";
  assert.equal(workflow.triggerType, "confirmed_booking");
  assert.equal(workflow.sourceTool, "calendly");
  assert.equal(workflow.nodes[0].name, "Confirmed booking");
  assert.match(workflow.summary.whatHappens, /confirms a booking/);
  const setup = context.setupFields(workflow);
  assert.match(setup, /data-workflow-config="ownerPhone"/);
  assert.doesNotMatch(setup, /data-workflow-config="fromNumber"/);
  assert.match(setup, /Instructions for your booking app or web person/);
  assert.doesNotMatch(setup, /Urgent words/);
  assert.match(setup, /x-rose-booking-key/);
  assert.match(setup, /Check booking event/);
  assert.doesNotMatch(setup, /Send lead summaries to/);
});

test("owner setup asks for real details and shows a clear path to launch", () => {
  vm.runInContext(`${section("workflowOwnerSetupItems", "firstWorkflowQuestion")}${section("workflowGuideHtml", "workflowCardHtml")}\nthis.ownerItems=workflowOwnerSetupItems;this.guide=workflowGuideHtml;`, context);
  const workflow = { triggerType: "confirmed_booking", active: false, puzzleComplete: true, testEvents: [], setup: [{ id: "ownerPhone", blocking: true, status: "done" }, { id: "booking_event_verified", blocking: true, status: "required" }, { id: "oauth_twilio", blocking: true, status: "required" }] };
  context.allWorkflowToolsConnected = () => true;
  assert.deepEqual(Array.from(context.ownerItems(workflow), item => item.id), ["ownerPhone"]);
  const before = context.guide(workflow);
  assert.match(before, /Connect tools/);
  assert.match(before, /Confirm booking source/);
  assert.match(before, /Run safe test/);
  assert.match(before, /class="current"[^>]*><span>3<\/span>Confirm booking source/);
  workflow.bookingSourceVerifiedAt = "2026-10-11T00:00:00Z";
  assert.match(context.guide(workflow), /class="current"[^>]*><span>4<\/span>Run safe test/);
});

test("workflow card gives one next action before it is ready to turn on", () => {
  Object.assign(context, { workflowStatus: () => ({ tone: "warn", label: "Connect Gmail", next: "Connect Gmail to send lead updates." }), workflowReadyToPublish: () => false, workflowSetupFields: () => "", workflowFlowHtml: () => "<div>flow</div>", workflowPlanHtml: () => "", workflowRunHtml: () => "", workflowToolLogo: () => "", workflowDisplayTitle: workflow => workflow.title, workflowNotes: new Map(), allWorkflowToolsConnected: () => false });
  vm.runInContext(`${section("workflowGuideHtml", "workflowKey")}\nthis.cardHtml=workflowCardHtml;`, context);
  const workflow = { id: "lead-email", title: "New lead email", provider: "gmail", requiredTools: ["gmail"], setup: [], testEvents: [], puzzleComplete: false, active: false };
  const draft = context.cardHtml(workflow);
  assert.match(draft, /Connect Gmail/);
  assert.match(draft, /Run safe test/);
  assert.doesNotMatch(draft, /data-workflow-activate/);
  context.workflowReadyToPublish = () => true;
  context.allWorkflowToolsConnected = () => true;
  const ready = context.cardHtml({ ...workflow, puzzleComplete: true, testEvents: [{ ok: true, mode: "runtime_dry_run" }] });
  assert.match(ready, /Turn on workflow/);
  assert.match(ready, /data-workflow-activate/);
});
