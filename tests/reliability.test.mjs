import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
await import('../workground/rose-draft-sync.js');
let draft={name:'first'},calls=[],resolveFirst;const labels=[];
const sync=new globalThis.RoseDraftSync({snapshot:()=>draft,onState:s=>labels.push(s),send:async body=>{calls.push(body);if(calls.length===1)await new Promise(r=>resolveFirst=r);return {revision:body.baseRevision+1}}});
sync.hydrate(0,{name:'original'});const first=sync.save();await new Promise(r=>setImmediate(r));draft={name:'newer'};const second=sync.save();assert.equal(calls.length,1);resolveFirst();await Promise.all([first,second]);assert.deepEqual(calls.map(c=>c.baseRevision),[0,1]);assert.deepEqual(calls.map(c=>c.draft.name),['first','newer']);assert.equal(sync.dirty(),false);assert(labels.includes('Draft unsaved'));
draft={name:'offline edit'};sync.send=async()=>{throw Error('Offline')};await assert.rejects(sync.save());assert(sync.dirty());assert.equal(labels.at(-1),'Draft local — not synced');
sync.send=async()=>{const error=Error('Conflict');error.status=409;throw error};await assert.rejects(sync.save());assert(sync.blocked);await assert.rejects(sync.save(),/newer draft/);
for(const file of ['login.html','workground/index.html']){
 const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');for(const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1],{filename:file});
 const start=source.indexOf('function readCached('),end=source.indexOf('\n',start);const store=new Map([['bad','{broken'],['wrong','{}'],['valid','[1]']]);const scope={localStorage:{getItem:k=>store.get(k),removeItem:k=>store.delete(k)}};vm.createContext(scope);vm.runInContext(source.slice(start,end),scope);assert.deepEqual(scope.readCached('bad',[]),[]);assert.deepEqual(scope.readCached('wrong',[]),[]);assert.equal(scope.readCached('valid',[])[0],1);assert(!store.has('bad'));
}
console.log('PASS frontend: ordered saves, latest revision, dirty state during overlap, failed-save preservation, conflict block, corrupted-cache recovery, inline script syntax');
