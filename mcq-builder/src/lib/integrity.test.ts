import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFigureSource, materialIssues, finalFigureIssue, unresolvedReviews } from './integrity.ts';
import type { ItemFigure } from './figure.ts';
import { readBackup } from './backup.ts';
import { exampleFinal, exampleWorkspace } from './example.ts';
import { bankReadiness, bankSourceSignature } from './workspace.ts';

const table = '| 시료 | 질량(g) |\n| --- | --- |\n| A | 20 |\n| B | 30 |';
const figure: ItemFigure = { kind: 'bar', title: '질량 비교', xLabel: '시료', yLabel: '질량(g)', categories: ['A','B'], xValues: [], series: [{ name: '질량(g)', values: [20,30] }], steps: [], caption: '', evidence: '원표 A·B' };
test('그래프의 수치가 원표에 있어도 항목별 값이 뒤바뀌면 차단한다', () => {
  assert.equal(checkFigureSource(figure, table).matched, true);
  assert.ok(checkFigureSource({ ...figure, series: [{ name: '질량(g)', values: [30,20] }] }, table).issues.length);
  assert.ok(materialIssues(table, table.replace('A | 20', 'A | 30').replace('B | 30', 'B | 20')).length);
});
test('자연어 자료는 수치가 있어도 표 대조 완료로 처리하지 않는다', () => {
  assert.equal(checkFigureSource(figure, 'A는 20g, B는 30g이다.').matched, false);
  assert.ok(materialIssues(table, table + '\n999').length);
});
test('자료 변경 후 이전 원문 확인 서명으로는 단계 이동할 수 없다', () => {
  const w = exampleWorkspace(), d = w.bankDraft!; d.practice = false; d.pickIds = ['demo-a','demo-b','demo-c']; d.reviewedIds = [...d.pickIds];
  w.input.sourceMode = 'reference'; w.input.sources = [{ id: 'S1', kind: '기타', title: '원표', creators: '', year: '', locator: '1쪽', use: '표 재구성', rights: '', dataExcerpt: [d.bank.stimulus.body,...d.bank.stimulus.conditions].join('\n'), verified: true }];
  d.bank.stimulus.sourceIds = ['S1']; d.sourceReview = { signature: bankSourceSignature(d,w.input), reason: '대조' };
  assert.equal(bankReadiness(d,w.input).ready, true);
  d.bank.stimulus.conditions.push('추가 조건');
  assert.equal(bankReadiness(d,w.input).ready, false);
});
test('예시 결과도 실제 선택 순서를 반영하며 AI 검토로 표시하지 않는다', () => {
  const w = exampleWorkspace(), d = w.bankDraft!; d.practice = false; d.pickIds = ['demo-c','demo-a','demo-b']; d.reviewedIds = [...d.pickIds];
  const a = bankReadiness(d,w.input).assembly, final = exampleFinal(w.input,w.analysis!,d.bank.stimulus,a);
  assert.deepEqual(final.statements, a.picks.map(p => p.text)); assert.equal(final.reviewOrigin,'example');
  assert.deepEqual(unresolvedReviews(final), []);
});
test('그림 누락과 미처리 AI 경고는 최종 승인 조건을 충족하지 않는다', () => {
  assert.ok(finalFigureIssue({ figureSpec: '그림 제작' })); assert.equal(finalFigureIssue({ figureSpec: '그림 제작', figure }),null);
  const w = exampleWorkspace(), final = exampleFinal(w.input,w.analysis!,w.bank!.stimulus,bankReadiness(w.bankDraft!,w.input).assembly);
  delete final.reviewOrigin; assert.equal(unresolvedReviews(final).length,8); assert.equal(unresolvedReviews(final,{0:'유지 근거'}).length,7);
});
test('정상 백업은 복구하되 승인·해설을 초기화하고 손상된 자료는 거절한다', () => {
  const w = exampleWorkspace(); w.bankDraft!.reviewedIds = ['demo-a']; w.teacherChecks = [true,true,true,true];
  const payload = { version:3, current:w, revisions:[] }, restored = readBackup(JSON.stringify(payload));
  assert.deepEqual(restored.current.teacherChecks,[false,false,false,false]); assert.deepEqual(restored.current.bankDraft!.reviewedIds,[]); assert.equal(restored.current.final,null);
  assert.throws(() => readBackup('{broken'), /JSON/);
  assert.throws(() => readBackup(JSON.stringify({ ...payload, current:{ ...w, bankDraft:{ ...w.bankDraft, notes:null } } })), /손상/);
});
