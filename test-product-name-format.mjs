import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('./workground/index.html', import.meta.url), 'utf8');
const start = source.indexOf('    const productNames=');
const end = source.indexOf('    function workgroundAgentName()', start);
assert.ok(start > 0 && end > start);

const document = {
  createTextNode: text => ({ type: 'text', text }),
  createElement: tag => ({ type: tag, textContent: '' }),
};
const context = { document };
vm.runInNewContext(source.slice(start, end) + '\nthis.parts=productTextSegments;this.render=renderBubbleText;', context);
const parts = value => JSON.parse(JSON.stringify(context.parts(value)));

test('Builder bolds complete product names in existing and new replies', () => {
  assert.deepEqual(parts('Connect Twilio, Supabase, Google Sheets, or Google.'), [
    { text: 'Connect ', bold: false },
    { text: 'Twilio', bold: true },
    { text: ', ', bold: false },
    { text: 'Supabase', bold: true },
    { text: ', ', bold: false },
    { text: 'Google Sheets', bold: true },
    { text: ', or ', bold: false },
    { text: 'Google', bold: true },
    { text: '.', bold: false },
  ]);
  assert.equal(parts('**Twilio** is connected.').find(item => item.bold)?.text, 'Twilio');
});

test('ordinary words, URLs, and email addresses stay plain text', () => {
  assert.equal(parts('a square field and a close call').some(item => item.bold), false);
  assert.equal(parts('Use Square to take payments.').find(item => item.bold)?.text, 'Square');
  assert.equal(parts('Visit https://google.com or write me@supabase.com').some(item => item.bold), false);
  assert.equal(parts('{{Google Sheets}}').some(item => item.bold), false);
});

test('rendered product names use text nodes and strong elements', () => {
  const target = { replaceChildren(...nodes) { this.nodes = nodes; } };
  context.render(target, 'Try <script>alert(1)</script> with Twilio.');
  assert.equal(target.nodes.find(node => node.type === 'strong')?.textContent, 'Twilio');
  assert.equal(target.nodes.some(node => node.type === 'script'), false);
  assert.equal(target.nodes[0].text, 'Try <script>alert(1)</script> with ');
});
