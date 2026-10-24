import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./workground/index.html', import.meta.url), 'utf8');
const start = source.indexOf('    let firstRunStep=0,firstRunDialog=null,websiteStarterDialog=null');
const end = source.indexOf('    const firstRunTools=', start);
assert.ok(start >= 0 && end > start);

function setup({ draft = null, published = null, validated = true } = {}) {
  const button = { hidden: true, addEventListener() {} };
  const store = new Map();
  const context = {
    accountValidated: validated, swiftDemo: false,
    roseAccountProfile: { account: { email: 'owner@example.com' }, customer: { checkoutLeadId: 'lead_1', website: 'https://example.com' }, draft, published },
    document: { getElementById: id => id === 'openWebsiteStarter' ? button : null },
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
    URL,
  };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.api={needsWebsiteStarter,renderWebsiteStarterAction,starterWebsite,websiteStarterKey}`, context);
  return { context, button, store };
}

test('new accounts see the website starter; saved or published accounts do not', () => {
  for (const [state, expected] of [[{}, true], [{ draft: {} }, false], [{ published: {} }, false], [{ validated: false }, false]]) {
    const { context, button } = setup(state);
    assert.equal(context.api.needsWebsiteStarter(), expected);
    context.api.renderWebsiteStarterAction();
    assert.equal(button.hidden, !expected);
  }
});

test('website starter accepts only public HTTPS domain URLs', () => {
  const { context } = setup();
  assert.equal(context.api.starterWebsite('example.com/path'), 'https://example.com');
  assert.equal(context.api.starterWebsite('https://www.example.com/path'), 'https://www.example.com');
  for (const value of ['http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://example.test', 'https://user@example.com', 'https://example.com:444']) {
    assert.throws(() => context.api.starterWebsite(value), /public HTTPS website/);
  }
});

test('account hydration offers the starter after recovery handling', () => {
  const hydrate = source.slice(source.indexOf('    async function hydrateRoseAccount(){'), source.indexOf('    function wireKnowledgeButtons(){'));
  assert.match(hydrate, /renderWebsiteStarterAction\(\);if\(!recovery\?\.draft\)maybeOpenWebsiteStarter\(\)/);
  assert.match(source, /action:'start-from-scan',siteScanId:scan\.scanId,baseRevision:draftSync\.revision/);
});
