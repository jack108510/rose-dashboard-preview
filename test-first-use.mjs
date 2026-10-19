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
