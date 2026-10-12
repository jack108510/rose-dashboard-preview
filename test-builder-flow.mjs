import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('./workground/index.html',import.meta.url),'utf8');
function extract(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`${name} exists`);
  const end=source.indexOf('\n    function ',start+9);
  assert.ok(end>start,`${name} has a following function`);
  return source.slice(start,end);
}
const functions=['builderQuestion','trackBackendSetupQuestion','workflowSetupAnswerCheck'].map(extract).join('\n');

test('a backend setup question stays attached to its workflow',()=>{
  const workflow={id:'workflow-1',active:false,puzzleComplete:false,askedFirstQuestion:false};
  const storage=new Map();
  const context={
    workflows:[workflow],pendingWorkflowAnswerId:'',
    backendWorkflowToLocal:()=>({id:'workflow-1'}),
    localStorage:{setItem:(key,value)=>storage.set(key,value)},
    scheduleDraftSave:()=>{},
  };
  vm.runInNewContext(`${functions}\nthis.api={trackBackendSetupQuestion}`,context);
  const draft={setupFields:[{id:'channel',label:'Which Slack channel should receive the alert?'}]};
  context.api.trackBackendSetupQuestion(draft,'Connect Jobber and Slack first. Which Slack channel should receive the alert?');
  assert.equal(workflow.askedFirstQuestion,true);
  assert.equal(context.pendingWorkflowAnswerId,'workflow-1');
  assert.equal(storage.get('rosePendingWorkflowAnswerId'),'workflow-1');
});

test('setup answers accept natural fields and let connection requests through',()=>{
  const context={normalizedCommand:value=>String(value).toLowerCase(),settings:{ownerEmail:'owner@example.test'},toolMeta:value=>({name:String(value).replace(/^./,char=>char.toUpperCase())})};
  vm.runInNewContext(`${functions}\nthis.api={workflowSetupAnswerCheck}`,context);
  const check=context.api.workflowSetupAnswerCheck;
  assert.equal(check({},'Connect Slack',{id:'channel'}).state,'unrelated');
  assert.equal(check({},'Use #new-leads',{id:'channel'}).value,'new-leads');
  assert.equal(check({},'Send it to me',{id:'recipientEmail'}).value,'owner@example.test');
  assert.equal(check({},'Use this sheet: https://docs.google.com/spreadsheets/d/abc123DEF456ghi789JKL/edit',{id:'spreadsheetId'}).value,'abc123DEF456ghi789JKL');
  const trello={destinationOptions:{trello:{options:[{value:'list-123',label:'Sales board / New leads'}]}}};
  assert.equal(check(trello,'New leads',{id:'idList'}).value,'list-123');
  assert.equal(check(trello,'Some other list',{id:'idList'}).state,'invalid');
  const notion={destinationOptions:{notion:{options:[{value:'page-123',label:'Customer leads'}]}}};
  assert.equal(check(notion,'Customer leads',{id:'parent_id'}).value,'page-123');
  const monday={destinationOptions:{monday:{options:[{value:'board-123',label:'Sales leads'}]}}};
  assert.equal(check(monday,'Sales leads',{id:'board_id'}).value,'board-123');
});
