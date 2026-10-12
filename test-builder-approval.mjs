import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('./workground/index.html',import.meta.url),'utf8');
const start=source.indexOf('function builderApprovalForReply('),end=source.indexOf('function renderBuilderApproval(',start);
assert.ok(start>=0&&end>start);
const context={};vm.createContext(context);vm.runInContext(`${source.slice(start,end)}\nthis.detect=builderApprovalForReply`,context);

test('Builder offers an approval button for the workflow proposal in the screenshot',()=>{
  assert.equal(context.detect("Let's create your email automation when a sale is detected. I'll set up Square and Gmail. Are you ready to proceed with this?"),true);
});
test('Builder does not offer a draft approval for unrelated or send-now questions',()=>{
  assert.equal(context.detect('Should I send this email to the customer now?'),false);
  assert.equal(context.detect('What subject should the workflow email use?'),false);
});
test('Button approval bypasses setup-answer parsing without bypassing normal typed answers',()=>{
  assert.match(source,/request===command&&!options\.approvedPlan\?await answerPendingWorkflow\(command\):null/);
  assert.match(source,/form\.dataset\.approving='true';form\.requestSubmit\(\)/);
  assert.match(source,/runRoseLlm\(value,\{approvedPlan\}\)/);
});
