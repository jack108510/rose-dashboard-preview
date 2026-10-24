import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('./workground/index.html', import.meta.url), 'utf8');
const start = source.indexOf('    function renderSiteLiveSwitch(){');
const end = source.indexOf('    function accountDateLabel(', start);
assert.ok(start >= 0 && end > start);

function setup(widgetActive, fetch) {
  const messages = [];
  const label = { textContent: '' };
  const attributes = {};
  const button = {
    hidden: true, disabled: false, title: '',
    setAttribute: (key, value) => { attributes[key] = value; },
    querySelector: () => label,
  };
  const context = {
    accountValidated: true, swiftDemo: false, siteLiveSwitchSaving: false,
    roseAccountProfile: { widgetActive },
    document: { getElementById: () => button },
    roseAccountToken: () => 'test-token', fetch,
    notify: message => messages.push(message),
  };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.renderSiteLiveSwitch=renderSiteLiveSwitch;this.toggleSiteLiveSwitch=toggleSiteLiveSwitch`, context);
  return { context, button, label, attributes, messages };
}

test('switch reflects the saved account state and stays unavailable without server support', () => {
  const unsupported = setup(null, () => { throw Error('should not fetch'); });
  unsupported.context.renderSiteLiveSwitch();
  assert.equal(unsupported.button.disabled, true);
  assert.equal(unsupported.attributes['aria-checked'], 'false');
  const active = setup(true, () => { throw Error('should not fetch'); });
  active.context.renderSiteLiveSwitch();
  assert.equal(active.button.disabled, false);
  assert.equal(active.label.textContent, 'Widget on');
  assert.equal(active.attributes['aria-checked'], 'true');
});

test('switch saves off immediately, independently of Publish', async () => {
  let resolve;
  const request = new Promise(done => { resolve = done; });
  const instance = setup(true, async (_url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.deepEqual(JSON.parse(options.body), { action: 'set-active', active: false });
    await request;
    return { ok: true, json: async () => ({ ok: true, widgetActive: false }) };
  });
  const pending = instance.context.toggleSiteLiveSwitch();
  assert.equal(instance.button.disabled, true);
  resolve();
  await pending;
  assert.equal(instance.context.roseAccountProfile.widgetActive, false);
  assert.equal(instance.attributes['aria-checked'], 'false');
  assert.equal(instance.button.disabled, false);
});

test('failed update leaves the confirmed state in place', async () => {
  const instance = setup(false, async () => ({ ok: false, json: async () => ({ error: 'Update failed' }) }));
  await instance.context.toggleSiteLiveSwitch();
  assert.equal(instance.context.roseAccountProfile.widgetActive, false);
  assert.equal(instance.attributes['aria-checked'], 'false');
  assert.deepEqual(instance.messages, ['Update failed']);
});
