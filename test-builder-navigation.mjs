import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('./workground/index.html',import.meta.url),'utf8');
const start=source.indexOf('    function restoreBuilderHistory(){');
const end=source.indexOf('    const workflowStarters=[',start);
assert.ok(start>=0&&end>start);

class Surface{
  childNodes=[];
  scrollTop=0;
  style={};
  replaceChildren(...items){this.childNodes=[];for(const item of items){if(item instanceof Surface){this.childNodes.push(...item.childNodes);item.childNodes=[]}else this.childNodes.push(item)}}
  set innerHTML(html){this.childNodes=html?[{html}]:[];this.scrollTop=0}
  get innerHTML(){return this.childNodes.map(item=>item.html||'').join('')}
  querySelector(selector){return selector==='#emptyState'&&this.innerHTML.includes('empty')?{}:null}
}

test('switching through Settings and Workflows keeps the same Builder turns and scroll position',()=>{
  const messages=new Surface(),turn={id:'original-turn',draftCard:{id:'editable-email'}};
  messages.childNodes=[turn];messages.scrollTop=284;
  const context={messages,builderThreadNodes:new Surface(),builderScrollTop:0,currentSection:'Appearance',chatHistory:[{role:'assistant',content:'Draft'}],pruneBuilderHistory:()=>false,closeStarterPicker:()=>{},document:{querySelectorAll:()=>[],querySelector:()=>null,getElementById:()=>null},app:{classList:{toggle:()=>{}}},settingsHtml:()=>'<settings>',workflowsPageHtml:()=>'<workflows>',emptyPromptHtml:()=>'<empty>',organizeSettingsPage:()=>{},wirePage:()=>{},renderWorkflowsPage:()=>{},loadWorkflowRuns:()=>{},loadEmailApprovals:()=>{},refreshWorkflowsChip:()=>{},modeText:{textContent:''},input:{},makeTurn:()=>{throw Error('Existing thread should not be rebuilt')}};
  vm.runInNewContext(`${source.slice(start,end)}\nthis.showSection=showSection`,context);
  context.showSection('Settings');
  assert.equal(context.builderThreadNodes.childNodes[0],turn);
  context.showSection('Workflows');
  context.showSection('Appearance');
  assert.equal(messages.childNodes[0],turn);
  assert.equal(messages.childNodes[0].draftCard.id,'editable-email');
  assert.equal(messages.scrollTop,284);
  let pickerOpens=0;
  context.openBuilderTools=()=>{pickerOpens++};
  context.showSection('Suggestions');
  assert.equal(context.currentSection,'Appearance');
  assert.equal(pickerOpens,1);
});
