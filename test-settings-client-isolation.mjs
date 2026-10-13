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
  functionSource('accountWebsiteUrl', 'roseSitePreviewPayload'),
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

test('website preview uses this account website and draft instead of an old demo URL', () => {
  const previewPage = readFileSync(new URL('./workground/site-preview.html', import.meta.url), 'utf8');
  const context = {
    URL,
    accountValidated: true,
    roseAccountProfile: { customer: { website: 'https://client-one.example', dashboardPreviewUrl: 'https://old-demo.example/?demo=other-client' } },
    settings: { website: 'https://old.example', businessName: 'Client One', ownerEmail: 'owner@client-one.example' },
    window: { __rosePendingIdentity: { businessId: 'client-one' } },
    draftSnapshot: () => ({ appearance: { assistantName: 'Client One Rose' }, settings: { website: 'https://old.example' } }),
    Date,
    esc: value => String(value),
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('accountWebsiteUrl', 'roseSitePreviewPayload')}\n${functionSource('roseSitePreviewPayload', 'roseCodePageUrl')}\n${functionSource('websiteDemoHtml', 'settingsHtml')}\nthis.payload=roseSitePreviewPayload;this.card=websiteDemoHtml;`, context);
  const payload = context.payload();
  assert.equal(payload.website, 'https://client-one.example/');
  assert.equal(payload.config.settings.website, payload.website);
  assert.equal(payload.identity.businessId, 'client-one');
  assert.match(context.card(), /Preview on my website/);
  assert.doesNotMatch(context.card(), /old-demo\.example|old\.example|Open demo/);
  assert.match(previewPage, /frame\.src=website\.href/);
  assert.match(previewPage, /__roseWorkgroundApplyConfig\?\.\(config\)/);
  assert.match(previewPage, /loadPublished='false'/);
});

test('install handoff uses the signed-in client code and stays in Settings', () => {
  assert.doesNotMatch(source, /thank-you\.html/);
  const installHelpers = [
    functionSource('installPlatformSteps', 'inviteSteps'),
    functionSource('inviteSteps', 'accountInviteReported'),
    functionSource('installHandoffText', 'installChoicesHtml'),
    functionSource('installChoicesHtml', 'wireInstallChoices'),
  ].join('\n');
  const context = {
    installPlatformChoice: 'GitHub Pages',
    activeInstallMethod: 'invite',
    accountValidated: true,
    roseAccountProfile: { customer: { provider: 'GitHub Pages' }, install: { snippet: '<script data-business-id="client-one"></script>', stages: [] } },
    accountWebsiteUrl: () => 'https://client-one.example',
    accountInstallState: () => ({ connected: false }),
    accountInviteReported: () => false,
    esc: value => String(value),
  };
  vm.createContext(context);
  vm.runInContext(`${installHelpers}\nthis.renderInstall=installChoicesHtml;this.handoff=installHandoffText;`, context);
  const html = context.renderInstall();
  assert.match(html, /GitHub user jack108510/);
  assert.match(html, /GitHub username/);
  assert.doesNotMatch(html, /Invite email<\/span>/);
  assert.match(html, /client-one\.example/);
  assert.match(html, /Copy instructions for my web person/);
  assert.doesNotMatch(html, /thank-you\.html|Full .*guide/);
  assert.match(context.handoff('GitHub Pages'), /data-business-id="client-one"/);
  assert.doesNotMatch(context.handoff('GitHub Pages'), /swiftlocating\.ca/);
});
