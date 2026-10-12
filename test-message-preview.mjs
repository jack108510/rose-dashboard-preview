import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('./workground/index.html',import.meta.url),'utf8');
const start=source.indexOf('function messagePreviewFromResponse(');
const end=source.indexOf('    function renderMessagePreview(',start);
assert.ok(start>=0&&end>start);
const context={};
vm.runInNewContext(`${source.slice(start,end)}\nthis.preview=messagePreviewFromResponse;this.fromHistory=messagePreviewFromHistory;this.toHistory=messagePreviewHistory`,context);
const introStart=source.indexOf('function messagePreviewIntro(');
const introEnd=source.indexOf('    function finishAssistant(',introStart);
assert.ok(introStart>=0&&introEnd>introStart);
vm.runInNewContext(`${source.slice(introStart,introEnd)}\nthis.intro=messagePreviewIntro`,context);

test('structured email copy becomes a draft preview without losing template fields',()=>{
  const result=context.preview({reply:'Here is a draft.',emailDraft:{subject:'Thanks for your purchase',body:'Dear {{customer_first_name}},\nThank you for choosing us.'}});
  assert.equal(result.kind,'email');
  assert.equal(result.subject,'Thanks for your purchase');
  assert.match(result.body,/{{customer_first_name}}/);
});

test('structured SMS copy becomes a text preview',()=>{
  const result=context.preview({reply:'Here is a text.',smsDraft:{body:'Your booking is confirmed for {{booking_start}}.'}});
  assert.equal(result.kind,'sms');
  assert.match(result.body,/{{booking_start}}/);
});

test('old plain-text email drafts still become previews',()=>{
  const result=context.preview({reply:"Here's a draft for your thank you email: Subject: Thank You for Your Purchase! Body: Dear {{customer_first_name}}, thank you."});
  assert.equal(result.subject,'Thank You for Your Purchase!');
  assert.match(result.body,/Dear {{customer_first_name}}/);
});

test('ordinary builder answers do not become message previews',()=>{
  assert.equal(context.preview({reply:'Connect Square first, then choose Gmail or Outlook.'}),null);
});

test('a drafted email does not ask the owner to write the subject again',()=>{
  assert.equal(context.intro("Let's draft your thank you email. What subject and message would you like to use?",{kind:'email'}),"Here's a draft email you can edit.");
  assert.equal(context.intro('Connect Gmail before testing this draft.',{kind:'email'}),'Connect Gmail before testing this draft.');
});

test('saved conversation restores edited email and text previews',()=>{
  for(const draft of [
    {kind:'email',to:'buyer@example.test',subject:'Thank you.',body:'Hi {{customer_first_name}},\nThanks for your purchase.'},
    {kind:'sms',to:'+15551234567',body:'New booking for {{customer_name}}.'},
  ]){
    const restored=context.fromHistory(`Here is the draft.\n${context.toHistory(draft)}`);
    assert.equal(restored.kind,draft.kind);
    assert.equal(restored.to,draft.to);
    assert.equal(restored.body,draft.body);
    if(draft.kind==='email')assert.equal(restored.subject,draft.subject);
  }
});
