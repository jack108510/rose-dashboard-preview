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

test("email and text preview controls open themed samples with escaped copy", () => {
  assert.ok(source.includes('data-workflow-preview="${channel}"'));
  const previewSource = source.slice(source.indexOf('function workflowMessagePreviewHtml('), source.indexOf('    async function openWorkflowMessagePreview('));
  vm.runInContext(previewSource + "\nthis.previewHtml = workflowMessagePreviewHtml;", context);
  const email = context.previewHtml({ channel: "email", provider: "gmail", to: "alex@example.com", subject: "Hello", body: "Hi <Alex>", sampleBooking: true });
  assert.match(email, /wf-mail-window/);
  assert.match(email, /Hi &lt;Alex>/);
  assert.match(email, /Nothing was sent/);
  const sms = context.previewHtml({ channel: "sms", to: "+15555550111", body: "Your booking is confirmed" });
  assert.match(sms, /wf-phone-bubble/);
  assert.match(sms, /Your booking is confirmed/);
});

test("Builder shows a source-tool workflow plan with its trigger blocker", () => {
  const start = source.indexOf('function addToolEventPlanCard(');
  const end = source.indexOf('    async function runRoseLlm(', start);
  assert.ok(start > 0 && end > start);
  const cards = [];
  const messages = { querySelectorAll: () => cards, appendChild: card => cards.push(card), style: {}, scrollHeight: 100, scrollTop: 0 };
  const planContext = { messages, document: { createElement: () => ({ dataset: {}, innerHTML: "", scrollIntoView: () => {} }) }, esc: value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;") };
  vm.runInNewContext(source.slice(start, end) + '\nthis.addPlan = addToolEventPlanCard;', planContext);
  planContext.addPlan({ sourceTool: 'square', sourceName: 'Square', event: 'a customer pays <today>', destinationLabel: 'Email the customer' });
  assert.equal(cards.length, 1);
  assert.match(cards[0].innerHTML, /Square → Email the customer/);
  assert.match(cards[0].innerHTML, /Trigger integration needed/);
  assert.match(cards[0].innerHTML, /&lt;today>/);
  planContext.addPlan({ sourceTool: 'square', sourceName: 'Square', event: 'a customer pays <today>', destinationLabel: 'Email the customer' });
  assert.equal(cards.length, 1);
});

test("Twilio connect explains the manual details after a loading state", async () => {
  const start = source.indexOf('async function startComposioConnect(');
  const end = source.indexOf('function showManualConnectorForm(', start);
  assert.ok(start > 0 && end > start);
  let finishLoading, explanation = "", formShown = false;
  const card = { querySelector: () => formShown ? { querySelector: () => ({ focus: () => {} }) } : null };
  const button = {
    disabled: false, textContent: "Connect now", classList: { add: () => {}, remove: () => {} },
    setAttribute: () => {}, removeAttribute: () => {}, closest: () => card,
  };
  const connectContext = {
    accountValidated: true,
    setTimeout: callback => { finishLoading = callback; },
    showManualConnectorForm: (_meta, _card, message) => { formShown = true; explanation = message; },
    fetch: () => { throw new Error("Twilio must not try Composio OAuth"); },
  };
  vm.runInNewContext(source.slice(start, end) + '\nthis.connect = startComposioConnect;', connectContext);
  const pending = connectContext.connect({ slug: "twilio", name: "Twilio" }, button);
  assert.equal(button.textContent, "Preparing setup…");
  assert.equal(button.disabled, true);
  assert.equal(formShown, false);
  finishLoading();
  await pending;
  assert.equal(button.textContent, "Enter details");
  assert.equal(button.disabled, false);
  assert.match(explanation, /can’t open a Twilio sign-in/);
  assert.match(explanation, /Account SID, Auth Token, and a sender number/);
});

test("Gmail-only request clears the old Twilio card without disconnecting an account", () => {
  const start = source.indexOf('function clearUnchosenConnectionCards(');
  const end = source.indexOf('function addConnectionCard(', start);
  assert.ok(start > 0 && end > start);
  const cards = ["twilio", "gmail"].map(slug => ({ dataset: { tool: slug }, removed: false, remove() { this.removed = true; } }));
  const queue = ["Twilio", "Gmail"];
  let saves = 0;
  const clearContext = {
    messages: { querySelectorAll: () => cards }, connectionQueue: queue,
    toolMeta: value => ({ slug: String(value).toLowerCase() }), isConnected: () => false,
    scheduleDraftSave: () => { saves++; },
  };
  vm.runInNewContext(source.slice(start, end) + '\nthis.clear = clearUnchosenConnectionCards;', clearContext);
  clearContext.clear("Create just a gmail workflow");
  assert.equal(cards[0].removed, true);
  assert.equal(cards[1].removed, false);
  assert.deepEqual(queue, ["Gmail"]);
  assert.equal(saves, 1);
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

test("email-only booking shows an editable confirmation without an SMS field", () => {
  const workflow = context.convert({
    title: "Meeting confirmation", ownerRequest: "Send meeting confirmations",
    triggerType: "confirmed_booking", sourceTool: "calendly", requiredTools: ["gmail"],
    stepRules: { gmail: "all_leads" }, initialConfig: {
      customerSubject: "See you, {{customer_first_name}}",
      customerBody: "Your meeting is confirmed for {{booking_start}}.",
    },
    steps: [
      { id: "capture", label: "Confirmed booking", tool: "Rose", action: "Accept booking" },
      { id: "prepare", label: "Prepare", tool: "Rose", action: "Prepare email" },
      { id: "send_gmail", label: "Send email", tool: "gmail", action: "Send confirmation" },
    ],
  });
  const html = context.setupFields(workflow);
  assert.match(html, /Customer confirmation email copy/);
  assert.match(html, /data-workflow-config="customerSubject"/);
  assert.match(html, /data-workflow-config="customerBody"/);
  assert.match(html, /data-workflow-config="emailDeliveryMode"/);
  assert.match(html, /Hold each email for my review/);
  assert.match(html, /Send automatically/);
  assert.doesNotMatch(html, /data-workflow-config="ownerPhone"/);
});

test("lead email workflow exposes editable subject and body", () => {
  const workflow = context.convert({
    title: "Lead email", ownerRequest: "Email me every lead", requiredTools: ["gmail"],
    stepRules: { gmail: "all_leads" },
    steps: [
      { id: "capture", label: "Capture", tool: "Rose", action: "Capture lead" },
      { id: "prepare", label: "Prepare", tool: "Rose", action: "Prepare summary" },
      { id: "send_gmail", label: "Email", tool: "gmail", action: "Send lead email" },
    ],
  });
  const html = context.setupFields(workflow);
  assert.match(html, /Lead email copy/);
  assert.match(html, /data-workflow-config="subject"/);
  assert.match(html, /data-workflow-config="body"/);
  assert.match(html, /data-workflow-ai="email"/);
});

test("SMS and Slack workflows accept pasted copy or an AI draft", () => {
  const workflow = { id: "booking-alert", title: "Booking alert", triggerType: "confirmed_booking", requiredTools: ["twilio", "slack"], config: { smsBody: "Booking {{booking_reference}}" } };
  const html = context.setupFields(workflow);
  assert.match(html, /data-workflow-config="smsBody"/);
  assert.match(html, /Booking \{\{booking_reference\}\}/);
  assert.match(html, /data-workflow-ai="sms"/);
  assert.match(html, /data-workflow-config="slackBody"/);
  assert.match(html, /data-workflow-ai="slack"/);
});

test("copy editor appears only when a discovered action sends a message", () => {
  const workflow = { id: "mapped-mail", requiredTools: ["gmail"], actions: { gmail: { toolSlug: "GMAIL_SEND_EMAIL", fields: { recipient_email: { source: "lead.email" }, subject: { value: "Original" }, body: { value: "Original" } } } }, config: {} };
  assert.match(context.setupFields(workflow), /data-workflow-ai="email"/);
  assert.match(context.setupFields(workflow), /value="Original"/);
  assert.match(context.setupFields(workflow), />Original<\/textarea>/);
  assert.doesNotMatch(context.setupFields({ ...workflow, actions: { gmail: { toolSlug: "GMAIL_SEARCH_EMAILS", fields: { query: { value: "hello" } } } } }), /data-workflow-ai="email"/);
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

test("Airtable setup lists the connected base, table, and mapped columns", () => {
  const custom = context.convert({ title: "Airtable lead records", ownerRequest: "Save every website lead in Airtable", requiredTools: ["airtable"], stepRules: {}, actions: { airtable: { toolSlug: "AIRTABLE_CREATE_RECORD", fields: { baseId: { source: "config.baseId" }, tableIdOrName: { source: "config.tableIdOrName" }, fields: { object: { fldName123: { source: "lead.name" } } } } } }, setupFields: [{ id: "baseId", label: "Choose Airtable base" }, { id: "tableIdOrName", label: "Choose table" }], steps: [{ id: "capture", label: "Capture lead", tool: "Rose" }, { id: "prepare", label: "Prepare lead", tool: "Rose" }, { id: "save", label: "Save record", tool: "airtable" }] });
  custom.destinationOptions = { airtable: { options: [{ value: "app123", label: "Sales" }] }, airtableTables: { options: [{ value: "tbl123", label: "Leads" }] }, airtableFields: { options: [{ id: "fldName123", name: "Customer name", type: "singleLineText" }] } };
  const html = context.setupFields(custom);
  assert.match(html, /data-workflow-destination="airtable-base"/);
  assert.match(html, /data-workflow-destination="airtable-table"/);
  assert.match(html, /Customer name/);
  assert.match(html, /value="app123"/);
  assert.match(html, /value="tbl123"/);
});

test("workflow setup explains connected action purpose and inspected fields", () => {
  const custom = context.convert({ title: "Monday lead items", ownerRequest: "Add website leads to Monday", requiredTools: ["monday"], stepRules: {}, actions: { monday: { toolSlug: "MONDAY_CREATE_ITEM", fields: { board_id: { source: "config.board_id" }, item_name: { source: "lead.name" } } } }, setupFields: [{ id: "board_id", label: "Choose board" }], steps: [{ id: "capture", label: "Capture lead", tool: "Rose" }, { id: "send", label: "Create item", tool: "monday" }] });
  custom.destinationOptions = { monday: { options: [{ value: "12345", label: "Sales" }] }, mondayFields: { status: "ready", destination: "12345", options: [{ id: "text_name", name: "Customer", type: "text" }] }, actionCapabilities: { options: [{ provider: "monday", slug: "MONDAY_CREATE_ITEM", purpose: "Create an item on a selected board" }] } };
  const html = context.setupFields(custom);
  assert.match(html, /Create an item on a selected board/);
  assert.match(html, /Rose found 1 field/);
});

test("Notion database workflows offer connected database choices", () => {
  const custom = context.convert({ title: "Notion lead records", ownerRequest: "Save leads in Notion", requiredTools: ["notion"], stepRules: {}, actions: { notion: { toolSlug: "NOTION_INSERT_ROW_DATABASE", fields: { database_id: { source: "config.database_id" } } } }, setupFields: [{ id: "database_id", label: "Choose Notion database" }], steps: [{ id: "capture", label: "Capture lead", tool: "Rose" }, { id: "send", label: "Save record", tool: "notion" }] });
  custom.destinationOptions = { notionDatabases: { options: [{ value: "db-123", label: "Leads" }] } };
  const html = context.setupFields(custom);
  assert.match(html, /data-workflow-destination="database"/);
  assert.match(html, /value="db-123"/);
});

test("ordered actions keep their output mapping and ask only for owner choices", () => {
  const custom = context.convert({ title: "Trello card and comment", ownerRequest: "Create a Trello card and comment on it for every new lead", requiredTools: ["trello"], stepRules: {}, actionSteps: [
    { id: "card", provider: "trello", toolSlug: "TRELLO_ADD_CARDS", fields: { name: { source: "lead.name" }, idList: { source: "config.listId" } } },
    { id: "comment", provider: "trello", toolSlug: "TRELLO_ADD_CARDS_ACTIONS_COMMENTS_BY_ID_CARD", fields: { text: { source: "lead.summary" }, idCard: { source: "steps.card.data.id" } } },
  ], setupFields: [{ id: "listId", label: "Choose a list" }], steps: [{ id: "capture", label: "Capture lead", tool: "Rose" }, { id: "prepare", label: "Prepare lead", tool: "Rose" }, { id: "card", label: "Create card", tool: "trello" }, { id: "comment", label: "Comment on card", tool: "trello" }] });
  assert.deepEqual(Array.from(custom.actionSteps, step => step.id), ["card", "comment"]);
  const html = context.setupFields(custom);
  assert.match(html, /data-workflow-config="listId"/);
  assert.doesNotMatch(html, /data-workflow-config="idCard"/);
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
  context.workflowSampleChannels = () => [];
  vm.runInContext(`${section("workflowOwnerSetupItems", "firstWorkflowQuestion")}${section("workflowGuideHtml", "workflowCardHtml")}\nthis.ownerItems=workflowOwnerSetupItems;this.guide=workflowGuideHtml;`, context);
  const workflow = { triggerType: "confirmed_booking", active: false, puzzleComplete: true, testEvents: [], setup: [{ id: "ownerPhone", blocking: true, status: "done" }, { id: "booking_event_verified", blocking: true, status: "required" }, { id: "oauth_twilio", blocking: true, status: "required" }] };
  context.allWorkflowToolsConnected = () => true;
  assert.deepEqual(Array.from(context.ownerItems(workflow), item => item.id), ["ownerPhone"]);
  const before = context.guide(workflow);
  assert.match(before, /Connect tools/);
  assert.match(before, /Confirm booking source/);
  assert.match(before, /Check workflow/);
  assert.match(before, /class="current"[^>]*><span>3<\/span>Confirm booking source/);
  workflow.bookingSourceVerifiedAt = "2026-10-11T00:00:00Z";
  assert.match(context.guide(workflow), /class="current"[^>]*><span>4<\/span>Check workflow/);
});

test("workflow card gives one next action before it is ready to turn on", () => {
  Object.assign(context, { workflowStatus: () => ({ tone: "warn", label: "Connect Gmail", next: "Connect Gmail to send lead updates." }), workflowReadyToPublish: () => false, workflowNextSampleChannel: () => "", workflowSetupFields: () => "", workflowFlowHtml: () => "<div>flow</div>", workflowPlanHtml: () => "", workflowRunHtml: () => "", workflowToolLogo: () => "", workflowDisplayTitle: workflow => workflow.title, workflowNotes: new Map(), allWorkflowToolsConnected: () => false });
  vm.runInContext(`${section("workflowGuideHtml", "workflowKey")}\nthis.cardHtml=workflowCardHtml;`, context);
  const workflow = { id: "lead-email", title: "New lead email", provider: "gmail", requiredTools: ["gmail"], setup: [], testEvents: [], puzzleComplete: false, active: false };
  const draft = context.cardHtml(workflow);
  assert.match(draft, /Connect Gmail/);
  assert.doesNotMatch(draft, /data-workflow-test/);
  assert.doesNotMatch(draft, /data-workflow-activate/);
  context.isConnected = () => true;
  const setup = context.cardHtml(workflow);
  assert.match(setup, /Reply below to answer this question/);
  assert.doesNotMatch(setup, /data-workflow-test/);
  context.workflowReadyToPublish = () => true;
  context.allWorkflowToolsConnected = () => true;
  const ready = context.cardHtml({ ...workflow, puzzleComplete: true, testEvents: [{ ok: true, mode: "runtime_dry_run" }] });
  assert.match(ready, /Turn on workflow/);
  assert.match(ready, /data-workflow-activate/);
});

test("Builder shows the next action while folding workflow details", () => {
  Object.assign(context, {
    workflowStatus: () => ({ tone: "warn", label: "Ready to test", next: "Run a safe test." }),
    workflowReadyToPublish: () => false,
    workflowSetupFields: () => '<div class="workflow-setup-fields"><label>Recipient<input></label></div>',
    workflowFlowHtml: () => '<div class="wf-flow">Rose → Gmail</div>',
    workflowPlanHtml: () => '<details class="wf-plan"><summary>Advanced routing</summary></details>',
    workflowMessageAvailable: (_workflow, channel) => channel === "email",
    workflowNextSampleChannel: () => "email",
    workflowNotes: new Map(), allWorkflowToolsConnected: () => true,
  });
  const html = context.cardHtml({ id: "quote-email", title: "Email me quote requests", provider: "gmail", requiredTools: ["gmail"], setup: [], testEvents: [], puzzleComplete: true, active: false });
  assert.doesNotMatch(html, /class="wf-flow"/);
  assert.doesNotMatch(html, /class="wf-guide"/);
  assert.match(html, /<details class="wf-edit-details"><summary>Review email and details<\/summary>/);
  assert.match(html, /Run a safe test to/);
  assert.match(html, /data-workflow-sample-send="email"/);
  assert.doesNotMatch(html, /data-workflow-activate/);
});

test("delivery confirmation advances from sample email to full review", () => {
  Object.assign(context, {
    isConnected: () => true,
    workflowStatus: () => ({ tone: "ready", label: "Ready to test", next: "Send a sample" }),
    workflowReadyToPublish: wf => wf.sampleDeliveries?.email?.status === "received",
    workflowNextSampleChannel: wf => wf.sampleDeliveries?.email?.status === "received" ? "" : "email",
    workflowMessageAvailable: (_wf, channel) => channel === "email",
    workflowSetupFields: () => "",
    workflowPlanHtml: () => "",
    workflowFlowHtml: () => '<div class="wf-flow">Rose → Gmail</div>',
    workflowNotes: new Map(),
  });
  const wf = { id: "test-email", title: "Email requests", provider: "gmail", requiredTools: ["gmail"], puzzleComplete: true, active: false, config: { recipientEmail: "owner@example.com" }, testEvents: [{ ok: true, mode: "runtime_dry_run" }] };
  const before = context.cardHtml(wf);
  assert.match(before, /Run a safe test to/);
  assert.match(before, /data-workflow-sample-to="email"/);
  assert.match(before, /Send test email/);
  assert.doesNotMatch(before, /data-workflow-activate/);
  wf.sampleDeliveries = { email: { status: "sent", to: "review@example.com" } };
  const sent = context.cardHtml(wf);
  assert.match(sent, /I received it/);
  assert.match(sent, /I didn’t receive it/);
  assert.match(sent, /review@example.com/);
  assert.doesNotMatch(sent, /data-workflow-activate/);
  wf.sampleDeliveries.email.status = "received";
  const received = context.cardHtml(wf);
  assert.match(received, /Rose → Gmail/);
  assert.match(received, /data-workflow-activate/);
  assert.doesNotMatch(received, /Review your full workflow|Starts when|Email goes to|Advanced routing|Test preview/);
});

test("opened workflow keeps the flow and next action in view", () => {
  Object.assign(context, {
    isConnected: () => true,
    workflowStatus: () => ({ tone: "ready", label: "Ready to publish", next: "Review the flow, then turn it on." }),
    workflowReadyToPublish: () => true,
    workflowNextSampleChannel: () => "",
    workflowSetupFields: () => '<div class="workflow-setup-fields"><label>Email<input></label></div>',
    workflowPlanHtml: () => '<details class="wf-plan"><summary>Advanced routing</summary></details>',
    workflowFlowHtml: () => '<div class="wf-flow">Rose → Gmail</div>',
    workflowNotes: new Map(),
  });
  const wf = { id: "quote", title: "Email requests", provider: "gmail", requiredTools: ["gmail"], puzzleComplete: true, active: false, testEvents: [{ ok: true, mode: "runtime_dry_run" }] };
  const html = context.cardHtml(wf, true);
  assert.match(html, /class="wf-detail-canvas"/);
  assert.match(html, /Rose → Gmail/);
  assert.match(html, /data-workflow-activate/);
  assert.match(html, /<summary>Message and settings<\/summary>/);
  assert.match(html, /<summary>Advanced details<\/summary>/);
  assert.doesNotMatch(html, /wf-detail-progress|wf-detail-panel|Make it live|Test preview/);
});

test("opened workflow keeps unfinished setup behind its action", () => {
  Object.assign(context, {
    isConnected: () => true,
    workflowStatus: () => ({ tone: "warn", label: "Needs setup", next: "Add the recipient." }),
    workflowReadyToPublish: () => false,
    workflowNextSampleChannel: () => "",
    workflowSetupFields: () => '<div class="workflow-setup-fields"><label>Email<input></label></div>',
    workflowPlanHtml: () => "",
    workflowFlowHtml: () => '<div class="wf-flow">Rose → Gmail</div>',
    workflowNotes: new Map(),
  });
  const wf = { id: "quote", title: "Email requests", provider: "gmail", requiredTools: ["gmail"], puzzleComplete: false, active: false };
  const html = context.cardHtml(wf, true);
  assert.match(html, /data-workflow-open-setup>Finish setup/);
  assert.match(html, /<details class="wf-detail-more wf-detail-setup"><summary>Message and settings/);
  assert.equal((html.match(/class="workflow-setup-fields"/g) || []).length, 1);
});

test("restored workflow ignores the publish step when calculating setup completion", () => {
  vm.runInContext(`${section("workflowOwnerSetupItems", "firstWorkflowQuestion")}\nthis.normalizeLoadedWorkflow=normalizeLoadedWorkflow;`, context);
  const restored = context.normalizeLoadedWorkflow({ status: "setup_required", setup: [
    { id: "destination", blocking: true, status: "done" },
    { id: "publish", blocking: true, status: "final" },
    { id: "oauth_gmail", blocking: true, status: "done" },
  ] });
  assert.equal(restored.puzzleComplete, true);
});

test("Builder asks for one connection at a time across a multi-app workflow", () => {
  Object.assign(context, {
    isConnected: slug => slug === "hubspot",
    workflowReadyToPublish: () => false,
    workflowSetupFields: () => "",
    workflowPlanHtml: () => "",
    workflowStatus: () => ({ tone: "warn", label: "Connect Gmail", next: "Connect Gmail to continue." }),
  });
  const workflow = { id: "multi", title: "Route leads", provider: "hubspot", requiredTools: ["hubspot", "gmail", "slack"], setup: [], puzzleComplete: false, active: false };
  const html = context.cardHtml(workflow);
  assert.match(html, /data-workflow-connect="gmail"/);
  assert.doesNotMatch(html, /data-workflow-connect="slack"/);
  assert.doesNotMatch(html, /data-workflow-test|data-workflow-activate/);
});

test("email copy approval defers the Builder workflow card while saving the draft", () => {
  const shown = [], saved = [], drafts = [];
  const isolated = {
    messages: { querySelectorAll: () => [] },
    backendWorkflowToLocal: () => ({ id: "quote-email", provider: "gmail", requiredTools: ["gmail"], setup: [], config: {}, active: false }),
    workflows: drafts, pendingWorkflowDrafts: [],
    workflowOwnerSetupItems: () => [], isConnected: () => true,
    ensureWorkflowCards: id => shown.push(id), refreshWorkflowCards: () => {},
    accountValidated: true, syncRoseWorkflow: (_action, wf) => { saved.push(wf.id); return Promise.resolve(); },
  };
  vm.runInNewContext(`${section("addWorkflowDraftFromBackend", "trackBackendSetupQuestion")}\nthis.addDraft=addWorkflowDraftFromBackend`, isolated);
  assert.equal(isolated.addDraft({ title: "Email me quote requests" }, { deferBuilderCard: true }), true);
  assert.deepEqual(shown, []);
  assert.equal(drafts.length, 1);
  assert.deepEqual(saved, ["quote-email"]);
  isolated.ensureWorkflowCards("quote-email");
  assert.deepEqual(shown, ["quote-email"]);
});
