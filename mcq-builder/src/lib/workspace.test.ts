import test from "node:test";
import assert from "node:assert/strict";
import { bankReadiness, bankIssues, changeProposition, changeStimulus, editAnalysis, editBank, editInput, readSaved, restoreRevision, revisionDifferences } from "./workspace.ts";
import { exampleWorkspace } from "./example.ts";
import { assemble } from "./assemble.ts";
import { storage } from "./storage.ts";
import { toStudentMarkdown } from "./export.ts";

test("자료 변경은 모든 진위 확인과 연습 답안을 해제하고 생성 원본을 보존한다", () => {
  const w = exampleWorkspace();
  const draft = { ...w.bankDraft, reviewedIds: ["demo-a","demo-b"], judgments: { "demo-a": { verdict: "true" as const, reason: "20/10", revealed: true } } };
  const changed = changeStimulus(draft,{ body: "질량 A=30으로 변경" });
  assert.deepEqual(changed.reviewedIds,[]);
  assert.deepEqual(changed.judgments,{});
  assert.match(w.bank.stimulus.body,/20/);
  assert.notEqual(changed.bank.stimulus.body,w.bank.stimulus.body);
});
test("명제 변경은 해당 확인을 해제하고 판정 변경에 따라 정답을 다시 계산한다", () => {
  const w = exampleWorkspace();
  const before = { ...w.bankDraft, reviewedIds: ["demo-a","demo-b"], pickIds: ["demo-a","demo-b","demo-c"] };
  const after = changeProposition(before,"demo-a",{ isTrue: false });
  assert.deepEqual(after.reviewedIds,["demo-b"]);
  const build = (d: typeof after) => assemble("hapdab",d.pickIds.map(id => d.bank.propositions.find(p=>p.id === id)!),d.context,0);
  const a = build(before), b = build(after);
  assert.notEqual(a.choices[a.answerIndex],b.choices[b.answerIndex]);
  assert.equal(w.bank.propositions[0].isTrue,true);
});
test("기준 수정은 후속 생성물과 최종 승인을 무효화한다", () => {
  const w = exampleWorkspace();
  const inputChanged = editInput(w,{ ...w.input, standard: "다른 목표" });
  assert.equal(inputChanged.analysis,null); assert.equal(inputChanged.bankDraft,null);
  const changed = editAnalysis(w,{ ...w.analysis, assessmentGoal: "수정" });
  assert.equal(changed.bank,null); assert.equal(changed.final,null);
  const draftChanged = editBank({ ...w, teacherChecks: [true,true,true,true] },w.bankDraft);
  assert.deepEqual(draftChanged.teacherChecks,[false,false,false,false]);
});
test("확인되지 않은 명제와 유효하지 않은 출처 연결은 진행을 막는다", () => {
  const w = exampleWorkspace();
  const draft = { ...w.bankDraft, practice: false, pickIds: ["demo-a","demo-b","demo-c"] };
  assert.ok(bankIssues(draft,w.input).some(x=>x.includes("대조")));
  const reviewed = { ...draft, reviewedIds: draft.pickIds };
  assert.deepEqual(bankIssues(reviewed,w.input),[]);
  assert.ok(bankIssues(reviewed,{ ...w.input, sourceMode: "reference" }).some(x=>x.includes("출처")));
  assert.ok(bankIssues({ ...reviewed, practice: true },w.input).some(x=>x.includes("연습")));
});
test("단계 이동은 선택한 명제만 확인하면 허용하고 미선택 후보는 요구하지 않는다", () => {
  const w = exampleWorkspace();
  const draft = { ...w.bankDraft, practice: false, pickIds: ["demo-a","demo-b","demo-c"], reviewedIds: ["demo-a","demo-b","demo-c"] };
  const gate = bankReadiness(draft,w.input);
  assert.equal(gate.ready,true);
  assert.deepEqual(gate.issues,[]);
  assert.equal(gate.pending.length,0);
  assert.equal(bankReadiness({ ...draft, pickIds: ["demo-a"] },w.input).ready,false);
  const missing = bankReadiness({ ...draft, reviewedIds: ["demo-a"] },w.input);
  assert.deepEqual(missing.pending.map(p=>p.id),["demo-b","demo-c"]);
  assert.equal(missing.ready,false);
  assert.equal(bankReadiness({ ...draft, practice: true },w.input).ready,false);
});
test("잘못된 정답형 조합과 자료 수정은 단계 이동을 차단하며 해결 조건을 안내한다", () => {
  const w = exampleWorkspace();
  const ids = w.bank.propositions.map(p=>p.id);
  const draft = { ...w.bankDraft, practice: false, pickIds: ids, reviewedIds: ids };
  const gate = bankReadiness(draft,{ ...w.input, options: { ...w.input.options, format: "jeongdap" } });
  assert.equal(gate.ready,false);
  assert.ok(gate.issues.some(x=>x.includes("참 1개·거짓 4개")));
  const valid = { ...draft, pickIds: ids.slice(0,3) };
  assert.equal(bankReadiness(valid,w.input).ready,true);
  assert.equal(bankReadiness(changeStimulus(valid,{ body:"수정 자료" }),w.input).ready,false);
  assert.equal(bankReadiness(valid,{ ...w.input, sourceMode:"reference" }).ready,false);
});
test("새로고침 데이터는 미확정 선택·성찰·연습 답안까지 유지한다", () => {
  const w = exampleWorkspace();
  w.bankDraft.pickIds = ["demo-a"];
  w.bankDraft.judgments["demo-a"] = { verdict: "uncertain", reason: "단위를 확인", revealed: false };
  w.reflection.problem = "질량과 밀도의 혼동";
  const loaded = readSaved(JSON.stringify({ version: 3, current: w, revisions: [] }),w.input);
  assert.deepEqual(loaded.current,w);
});
test("기존 v2 초안을 변환하고 복원 시 최종 승인만 초기화한다", () => {
  const w = exampleWorkspace();
  const old = { ...w, version: 2, bankDraft: undefined };
  const loaded = readSaved(JSON.stringify(old),w.input);
  assert.equal(loaded.current.bankDraft?.bank.propositions.length,5);
  const restored = restoreRevision({ id:"1", at:"2026-09-05", label:"보관", snapshot: { ...w, teacherChecks:[true,true,true,true] } });
  assert.deepEqual(restored.teacherChecks,[false,false,false,false]);
  assert.equal(restored.bank,w.bank);
});
test("성찰과 원문 수정은 비교에 표시하고 API 키는 작업에 포함하지 않는다", () => {
  const w = exampleWorkspace();
  const next = { ...w, reflection: { ...w.reflection, reason: "자료 의존성을 높이기 위해" } };
  assert.ok(revisionDifferences(w,next).some(r=>r.label === "성찰 기록"));
  assert.equal(JSON.stringify(next).includes("apiKey"),false);
});
test("저장 용량 초과는 성공으로 표시하지 않는다", () => {
  const old = Object.getOwnPropertyDescriptor(globalThis,"localStorage");
  Object.defineProperty(globalThis,"localStorage",{ configurable:true, value:{ setItem(){ throw new Error("quota"); } } });
  try { assert.equal(storage.set("test","content"),false); }
  finally { if (old) Object.defineProperty(globalThis,"localStorage",old); else Reflect.deleteProperty(globalThis,"localStorage"); }
});
test("학생용 출력에는 성찰·해설·제작 지시가 포함되지 않는다", () => {
  const w = exampleWorkspace();
  const asm = assemble("hapdab",w.bank.propositions.slice(0,3),w.bankDraft.context,0);
  const final = { ...w.bank.stimulus, figureSpec:"제작 지시 비공개", statements:asm.picks.map(p=>p.text), explanations:[], solution:"교사용 풀이 비공개", review:[], info:{} as never };
  const text = toStudentMarkdown(w.input,w.analysis,w.analysis.scenarios[0],w.bank.stimulus,asm,final);
  assert.doesNotMatch(text,/제작 지시 비공개|교사용 풀이 비공개|교사의 출제 성찰/);
  assert.match(text,/교육용.*합성 자료/);
});
