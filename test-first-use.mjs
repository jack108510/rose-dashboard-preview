import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('./workground/index.html', import.meta.url), 'utf8');
const actionStart = source.indexOf('    function startWorkflowFromGallery(){');
const actionEnd = source.indexOf('    starterButton.addEventListener(', actionStart);
assert.ok(actionStart >= 0 && actionEnd > actionStart);

function firstUseContext() {
  const listeners = {};
  const calls = [];
  const input = { value: '', focus: () => calls.push('focus'), dispatchEvent: () => calls.push('input') };
  const context = {
    messages: { addEventListener: (event, handler) => { listeners[event] = handler; } },
    input,
    modeText: { textContent: '' },
    showSection: section => calls.push(section),
    openStarterDialog: kind => calls.push(kind),
    notify: message => calls.push(message),
    Event: class { constructor(type) { this.type = type; } },
  };
  vm.runInNewContext(`${source.slice(actionStart, actionEnd)}\nthis.startWorkflowFromGallery=startWorkflowFromGallery`, context);
  return { context, listeners, calls, input };
}

test('Builder first steps prepare an editable request without sending it', () => {
  const { listeners, calls, input } = firstUseContext();
  listeners.click({ target: { closest: () => ({ dataset: { emptyAction: 'greeting' } }) } });
  assert.match(input.value, /opening greeting/i);
  assert.deepEqual(calls, ['input', 'focus']);
});

test('New workflow opens examples and preserves an unfinished Builder request', () => {
  const { context, calls, input } = firstUseContext();
  context.startWorkflowFromGallery();
  assert.deepEqual(calls, ['Appearance', 'workflows']);
  calls.length = 0;
  input.value = 'An unfinished request';
  context.startWorkflowFromGallery();
  assert.equal(input.value, 'An unfinished request');
  assert.equal(calls.includes('workflows'), false);
});

test('Choosing a workflow example leaves its request in the composer for review', () => {
  const start = source.indexOf("    starterDialogs.workflows.addEventListener('click',");
  const end = source.indexOf("    starterDialogs.files.addEventListener('click',", start);
  assert.ok(start >= 0 && end > start);
  let click;
  const input = { value: '', focus() {}, dispatchEvent() {} };
  const context = {
    starterDialogs: { workflows: { addEventListener: (_, handler) => { click = handler; } } },
    workflowStarters: [{ prompt: 'Example workflow request' }],
    input,
    modeText: { textContent: '' },
    builderReplyPending: false,
    closeStarterDialogs() {},
    notify() {},
    Event: class { constructor(type) { this.type = type; } },
    form: { requestSubmit() { throw Error('Template must not send itself'); } },
  };
  vm.runInNewContext(source.slice(start, end), context);
  click({ target: { closest: selector => selector === '[data-starter-index]' ? { dataset: { starterIndex: '0' } } : null } });
  assert.equal(input.value, 'Example workflow request');
  assert.equal(context.modeText.textContent, 'Review workflow request');
});

test('setup path follows the account release and website state', () => {
  const start = source.indexOf('    function renderSetupPath(){');
  const end = source.indexOf("    document.getElementById('setupPathActions')?.addEventListener", start);
  assert.ok(start >= 0 && end > start);
  const classes = [];
  const elements = {
    setupPath: { hidden: true, closest: () => ({ classList: { toggle: (...args) => classes.push(args) } }) },
    setupPathTitle: { textContent: '' },
    setupPathText: { textContent: '' },
    setupPathActions: { innerHTML: '' },
  };
  const context = {
    document: { getElementById: id => elements[id] },
    accountValidated: true,
    swiftDemo: false,
    currentSection: 'Appearance',
    roseAccountProfile: { published: null },
    accountInstallState: () => ({ connected: false }),
  };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.renderSetupPath=renderSetupPath`, context);
  context.renderSetupPath();
  assert.equal(elements.setupPath.hidden, false);
  assert.match(elements.setupPathText.textContent, /test a visitor question/i);
  assert.match(elements.setupPathActions.innerHTML, /data-setup-action="test"/);

  context.roseAccountProfile.published = { publishedAt: '2026-10-18T00:00:00Z' };
  context.renderSetupPath();
  assert.match(elements.setupPathActions.innerHTML, /data-setup-action="install"/);
  context.accountInstallState = () => ({ connected: true });
  context.renderSetupPath();
  assert.equal(elements.setupPath.hidden, true);
  assert.deepEqual(classes.at(-1), ['has-setup-path', false]);
});

test('preview task opens Chat and puts the visitor input in focus', () => {
  const start = source.indexOf('    function openChatPreview(){');
  const end = source.indexOf('    function openSetupAction(action){', start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  const panel = { classList: { contains: () => false } };
  const widget = { querySelector: selector => ({
    '.wr-panel': panel,
    '.wr-fab': { click: () => calls.push('open') },
    '.wr-tab[data-view="chat"]': { click: () => calls.push('chat') },
    '.wr-input': { focus: () => calls.push('focus') },
  })[selector] };
  const context = { document: { getElementById: () => widget } };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.openChatPreview=openChatPreview`, context);
  context.openChatPreview();
  assert.deepEqual(calls, ['open', 'chat', 'focus']);
});

test('the demo opens with a useful customer greeting', () => {
  const initStart = source.indexOf('    if(swiftDemo){\n      state.name=');
  const initEnd = source.indexOf('    if(swiftDemo){\n      document.body', initStart);
  const copyStart = source.indexOf('    function applyWidgetCopyToPreview(){');
  const copyEnd = source.indexOf('    function wireWidgetTextEditing(){', copyStart);
  assert.ok(initStart >= 0 && initEnd > initStart && copyStart >= 0 && copyEnd > copyStart);
  const message = { textContent: '' };
  const context = {
    swiftDemo: true,
    state: { widgetCopy: {} },
    window: { __roseSwiftlineWidgetPreviewMode: 'draft' },
    document: { querySelector: () => message },
  };
  vm.runInNewContext(`${source.slice(initStart, initEnd)}\n${source.slice(copyStart, copyEnd)}\napplyWidgetCopyToPreview()`, context);
  assert.match(message.textContent, /answer questions and help you prepare a locate request/i);
  assert.match(message.textContent, /nothing is sent or booked/i);
});
