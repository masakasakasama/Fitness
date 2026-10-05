import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const importer=readFileSync(new URL('../legacy-import-v1.js',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../native-bridge-v1.js',import.meta.url),'utf8');
const key='gym-tracker-v1';
const current={sessions:[{id:'current',date:'2026-10-01',exercises:[{name:'既存',sets:[{weight:10,reps:8}]}]}],exercises:[{name:'既存'}],weights:[],profile:{name:'fixture'}};
const legacy={sessions:[{id:'legacy',date:'2026-09-21',exercises:[{name:'旧記録',sets:[{weight:20,reps:6}]}]}],exercises:[{name:'旧記録'}],weights:[]};
function fixture(failKey){
 const values=new Map([[key,JSON.stringify(current)]]),alerts=[];let reloads=0;
 const window={};
 const ctx=vm.createContext({window,TextDecoder,Uint8Array,atob,DOMException,alert:s=>alerts.push(s),location:{reload:()=>reloads++},localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(k===failKey)throw new DOMException('Fixture quota','QuotaExceededError');values.set(k,v);}}});
 vm.runInContext(importer,ctx);
 return {window,values,alerts,reloads:()=>reloads,run:x=>window.REPSLegacyImport.importBase64(Buffer.from(JSON.stringify(x)).toString('base64'))};
}
test('failed primary save retains existing records and never announces success or reloads',()=>{
 const f=fixture(key);assert.equal(f.run(legacy),false);assert.deepEqual(JSON.parse(f.values.get(key)),current);assert.equal(f.reloads(),0);assert.equal(f.values.has('reps-legacy-migrated-at'),false);assert.deepEqual(f.alerts,['旧PWAデータの移行に失敗しました']);
});
test('invalid legacy payload leaves current storage unchanged',()=>{
 const f=fixture();assert.equal(f.run({sessions:[]}),false);assert.deepEqual(JSON.parse(f.values.get(key)),current);assert.equal(f.reloads(),0);
});
test('successful import retains both record sets including Japanese names',()=>{
 const f=fixture();assert.equal(f.run(legacy),true);const saved=JSON.parse(f.values.get(key));assert.deepEqual(saved.sessions.map(s=>s.id),['legacy','current']);assert.deepEqual(saved.sessions[0].exercises,legacy.sessions[0].exercises);assert.deepEqual(saved.sessions[1].exercises,current.sessions[0].exercises);assert.equal(f.reloads(),1);assert.match(f.alerts[0],/2セッション \/ 2セット/);
});
test('optional migration timestamp failure must not report already saved data as failed',()=>{
 const f=fixture('reps-legacy-migrated-at');assert.equal(f.run(legacy),true);assert.equal(JSON.parse(f.values.get(key)).sessions.length,2);assert.equal(f.reloads(),1);assert.match(f.alerts[0],/移行しました/);
});
test('native rest absence or throw keeps base UI callbacks and does not claim migration success',()=>{
 for(const native of [undefined,{scheduleRest(){throw Error('fixture');},cancelRest(){throw Error('fixture');}}]){
  const calls=[];const window={startRest(sec){calls.push(['start',sec]);return 'base-result';},stopRest(){calls.push(['stop']);return 'stopped';},...(native?{RepsAndroid:native}:{})};
  const ctx=vm.createContext({window});vm.runInContext(bridge,ctx);assert.equal(window.startRest(15),'base-result');assert.equal(window.stopRest(),'stopped');assert.deepEqual(calls,[['start',15],['stop']]);assert.equal(window.REPSNative.available(),Boolean(native));
 }
});
