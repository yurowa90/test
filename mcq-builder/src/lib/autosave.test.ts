import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutosaver } from './autosave.ts';
import { readSaved, mergeRevisions } from './workspace.ts';
import { exampleWorkspace, exampleFinal } from './example.ts';
import { safeRestore, readBackup } from './backup.ts';
import { bankReadiness } from './workspace.ts';
const wait = (ms: number) => new Promise(r=>setTimeout(r,ms));

test('연속 입력은 최신 상태만 한 번 저장한다', async()=>{
  const writes: string[]=[]; const statuses: string[]=[];
  const saver=createAutosaver(raw=>{writes.push(raw);return true;},s=>statuses.push(s),5);
  saver.schedule({text:'A'});saver.schedule({text:'AB'});saver.schedule({text:'ABC'});
  assert.equal(writes.length,0);await wait(20);assert.deepEqual(writes,['{"text":"ABC"}']);assert.equal(statuses.at(-1),'saved');
});
test('페이지 종료 flush는 마지막 입력을 즉시 저장하고 중복 저장하지 않는다',async()=>{
  const writes:string[]=[];const saver=createAutosaver(raw=>{writes.push(raw);return true;},()=>{},5);
  saver.schedule({text:'마지막'});saver.flush();await wait(15);saver.flush();
  assert.equal(writes.length,1);assert.match(writes[0],/마지막/);
});
test('저장 실패는 오류로 표시하고 같은 상태로 다시 저장할 수 있다',()=>{
  let allow=false;const states:string[]=[];const saver=createAutosaver(()=>allow,s=>states.push(s));
  saver.schedule({note:'가상'});saver.flush();assert.equal(states.at(-1),'error');allow=true;saver.flush();assert.equal(states.at(-1),'saved');
});
test('취소된 자동 저장은 보호된 원본을 덮어쓰지 않는다',async()=>{
  let count=0;const saver=createAutosaver(()=>{count++;return true;},()=>{},5);saver.schedule({text:'new'});saver.cancel();saver.flush();await wait(15);assert.equal(count,0);
});
test('동일한 상태의 저장과 불필요한 문자열 쓰기를 생략한다',()=>{
  let writes=0;const saver=createAutosaver(()=>{writes++;return true;},()=>{});saver.schedule({x:1});saver.flush();saver.schedule({x:1});saver.flush();assert.equal(writes,1);
});
test('손상된 현재 작업과 보관 버전은 조용히 초기화하지 않는다',()=>{
 const w=exampleWorkspace();
 for(const raw of ['{','null',JSON.stringify({version:3,current:{...w,reflection:null},revisions:[]}),JSON.stringify({version:3,current:w,revisions:[{id:'x',at:'',label:'',snapshot:{...w,bankDraft:{...w.bankDraft,sourceReview:{reason:123}}}}]})])assert.throws(()=>readSaved(raw,w.input),/손상/);
});
test('정상 최종 결과는 재시작해도 유지하며 잘못된 최종 결과는 거부한다',()=>{
 const w=exampleWorkspace();const assembly=bankReadiness(w.bankDraft!,w.input).assembly;
 const ready={...w,step:'result' as const,stimulus:w.bank!.stimulus,assembly,final:exampleFinal(w.input,w.analysis!,w.bank!.stimulus,assembly)};
 assert.deepEqual(readSaved(JSON.stringify({version:3,current:ready,revisions:[]}),w.input).current,ready);
 assert.throws(()=>readSaved(JSON.stringify({version:3,current:{...ready,final:{...ready.final,review:'bad'}},revisions:[]}),w.input));
});
test('백업을 반복 병합해도 같은 보관본이 늘지 않는다',()=>{
 const w=exampleWorkspace();const original={id:'one',at:'2026-09-25',label:'가상 보관',snapshot:w};
 const imported={...original,snapshot:safeRestore(w)};
 assert.equal(mergeRevisions([original],[imported],[original]).length,1);
 const different={...original,snapshot:{...w,reflection:{...w.reflection,reason:'다른 판단'}}};
 const rows=mergeRevisions([original],[different]);assert.equal(rows.length,2);assert.equal(new Set(rows.map(r=>r.id)).size,2);
});
test('외부 백업은 저장본과 달리 최종 검토를 다시 요구한다',()=>{
 const w=exampleWorkspace();w.teacherChecks=[true,true,true,true];
 const restored=readBackup(JSON.stringify({version:3,current:w,revisions:[]}));assert.deepEqual(restored.current.teacherChecks,[false,false,false,false]);
});
