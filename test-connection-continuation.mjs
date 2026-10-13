import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('./workground/index.html',import.meta.url),'utf8');
const start=source.indexOf('function rememberConnectionTask('),end=source.indexOf('async function refreshBackendConnections(',start);
assert.ok(start>=0&&end>start);

function fixture(){
  const saved=new Map(),connected=new Set(),calls=[],answers=[];
  const context={pendingConnectionTask:null,builderReplyPending:false,connectionResumePending:false,currentSection:'Appearance',modeText:{textContent:''},localStorage:{setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)},toolMeta:value=>({slug:String(value).toLowerCase()}),isConnected:slug=>connected.has(slug),wantsWorkflow:text=>/workflow/i.test(text),addThinking:()=>({}),runRoseLlm:async(request,options)=>{calls.push({request,options});return 'Workflow resumed'},finishAssistant:(_,reply)=>answers.push(reply),showSection:name=>{context.currentSection=name},console};
  vm.createContext(context);vm.runInContext(`${source.slice(start,end)}\nthis.api={rememberConnectionTask,resumeConnectionTask}`,context);
  return {context,saved,connected,calls,answers};
}

test('a workflow request resumes once after its missing tool is verified',async()=>{
  const {context,saved,connected,calls,answers}=fixture();
  context.api.rememberConnectionTask('Build a Gmail workflow when a website lead arrives',[{query:'gmail'}]);
  assert.deepEqual(JSON.parse(saved.get('rosePendingConnectionTask')).waitingFor,['gmail']);
  await context.api.resumeConnectionTask();assert.equal(calls.length,0);
  connected.add('gmail');await context.api.resumeConnectionTask();await context.api.resumeConnectionTask();
  assert.equal(calls.length,1);assert.equal(calls[0].request,'Build a Gmail workflow when a website lead arrives');
  assert.equal(calls[0].options.resumeConnection,true);assert.deepEqual(answers,['Workflow resumed']);
  assert.equal(saved.has('rosePendingConnectionTask'),false);
});
