import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./workground/index.html', import.meta.url), 'utf8');

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`\n    function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `${name} is available`);
  return source.slice(start, end);
}

const helpers = [
  functionSource('accountWebsiteUrl', 'roseDemoPageUrl'),
  functionSource('roseCodePageUrl', 'installUrlSafe'),
  functionSource('accountInstallState', 'updateHeaderConnectionStatus'),
  functionSource('websiteOverviewHtml', 'websiteDemoHtml'),
].join('\n');

function overviewFor(website, install = {}, draftWebsite = website) {
  const context = {
    URL,
    accountValidated: true,
    settings: { website: draftWebsite },
    roseAccountProfile: { customer: { website }, install, installation: {}, bootstrap: {} },
    esc: value => String(value),
    accountDateLabel: value => String(value),
  };
  vm.createContext(context);
  vm.runInContext(`${helpers}\nthis.render = websiteOverviewHtml;`, context);
  return context.render();
}

test('website settings show each client website without borrowing another client demo', () => {
  const first = overviewFor('https://client-one.example');
  const second = overviewFor('https://client-two.example', {
    connected: true,
    status: 'connected',
    verifiedWebsite: 'https://client-two.example',
  });
  assert.match(first, /client-one\.example/);
  assert.doesNotMatch(first, /client-two\.example|swiftlocating\.ca/);
  assert.match(first, /Not installed/);
  assert.match(second, /client-two\.example/);
  assert.doesNotMatch(second, /client-one\.example|swiftlocating\.ca/);
  assert.match(second, /Code found/);
});

test('a new account without a website shows setup instead of a sample domain', () => {
  const html = overviewFor('');
  assert.match(html, /No website added/);
  assert.match(html, /Add your website/);
  assert.doesNotMatch(html, /company\.com|swiftlocating\.ca/);
});

test('an old draft and old widget report cannot replace the account website', () => {
  const html = overviewFor('https://current.example', {
    connected: false,
    observedWidgetPage: { kind: 'production', url: 'https://old.example/widget' },
  }, 'https://old.example');
  assert.match(html, /current\.example/);
  assert.doesNotMatch(html, /old\.example/);
  assert.match(html, /Not installed/);
});

test('Swift Line preview mode requires the explicit demo URL', () => {
  assert.match(source, /const swiftBusiness=swiftDemo;/);
  assert.doesNotMatch(source, /swiftDemo\|\|\/\^https\?:/);
});
