import type { SavedWorkspace, Workspace } from './workspace.ts';
import { BEHAVIOR_DOMAINS, LEVEL_LABELS, SOURCE_KINDS, SOURCE_USES, STIMULUS_TYPES } from '../types.ts';
import { validFigure } from './figure.ts';

type Obj = Record<string, any>;
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
const fields = (v: unknown, keys: string[]) => object(v) && keys.every(k => typeof v[k] === 'string');
const optionalStrings = (v: Obj, keys: string[]) => keys.every(k => v[k] === undefined || typeof v[k] === 'string');
const member = (v: unknown, values: readonly unknown[]) => values.includes(v);
const stimulus = (s: unknown) => fields(s, ['indirectStem', 'body', 'figureSpec', 'stemPrefix']) && object(s) && strings(s.conditions) && strings(s.sourceIds) && member(s.complexity, [0,1,2]) && (s.figure === undefined || validFigure(s.figure));
const bank = (b: unknown) => object(b) && stimulus(b.stimulus) && Array.isArray(b.propositions) && b.propositions.every(p => fields(p, ['id','text','explanation']) && typeof p.isTrue === 'boolean' && member(p.level, LEVEL_LABELS) && member(p.behavior, BEHAVIOR_DOMAINS) && ['levelConfirmed','behaviorConfirmed'].every(k => p[k] === undefined || typeof p[k] === 'boolean')) && new Set(b.propositions.map(p => p.id)).size === b.propositions.length;
function validWorkspace(w: unknown): w is Workspace {
  if (!object(w) || !member(w.step, ['input','analysis','bank','result']) || !Number.isInteger(w.scenarioIndex) || w.scenarioIndex < 0) return false;
  const i = w.input;
  if (!fields(i, ['subject','grade','standard','context']) || !object(i) || !member(i.sourceMode, ['reference','synthetic']) || !Array.isArray(i.sources) || !object(i.options)) return false;
  if (!optionalStrings(i, ['standardCode','domain'])) return false;
  if (i.picker !== undefined && (!fields(i.picker, ['mode','level','subject','domain','code']) || !member(i.picker.mode, ['picker','direct']))) return false;
  if (i.achievementLevels !== undefined && (!fields(i.achievementLevels, ['A','B','C','D','E']) || !member(i.achievementLevels.system, [3,5]))) return false;
  const o = i.options;
  if (!member(o.format, ['hapdab','jeongdap','bujeong']) || !member(o.bogiCount,[3,4]) || !member(o.behavior,['auto',...BEHAVIOR_DOMAINS]) || !member(o.difficulty,['상','중','하']) || !member(o.inquiryContext,['순수과학','실생활']) || !member(o.stimulusHint,['auto',...STIMULUS_TYPES])) return false;
  if (!i.sources.every((s: unknown) => fields(s,['id','title','creators','year','locator','rights','dataExcerpt']) && object(s) && typeof s.verified === 'boolean' && member(s.kind,SOURCE_KINDS) && member(s.use,SOURCE_USES) && optionalStrings(s,['originalLocation','studyConditions','transformations','limitations']))) return false;
  if (!Array.isArray(w.teacherChecks) || w.teacherChecks.length !== 4 || !w.teacherChecks.every((v: unknown) => typeof v === 'boolean') || !fields(w.reflection,['problem','reason','transfer']) || !optionalStrings(w.reflection,['application','observed']) || !optionalStrings(w,['revisionRecord'])) return false;
  if (w.analysis !== null) {
    const a = w.analysis;
    if (!fields(a,['assessmentElement','assessmentGoal','behaviorRationale']) || !object(a) || !strings(a.contentElements) || !member(a.behaviorDomain,BEHAVIOR_DOMAINS) || !optionalStrings(a,['evidenceGoal']) || !Array.isArray(a.scenarios) || !a.scenarios.length || w.scenarioIndex >= a.scenarios.length) return false;
    if (!a.scenarios.every((s: unknown) => fields(s,['title','description','sourcePlan']) && object(s) && strings(s.cues) && member(s.stimulusType,STIMULUS_TYPES) && member(s.inquiryContext,['순수과학','실생활']))) return false;
  }
  if (w.bank !== null && !bank(w.bank)) return false;
  if (w.bankDraft !== null) {
    const d = w.bankDraft;
    if (!object(d) || !bank(d.bank) || !strings(d.pickIds) || !strings(d.reviewedIds) || !Number.isInteger(d.arrayIndex) || d.arrayIndex < 0 || typeof d.practice !== 'boolean' || !object(d.context) || !member(d.context.dataComplexity,[0,1,2]) || typeof d.context.fusion !== 'boolean' || !object(d.notes) || !object(d.judgments)) return false;
    if (!Object.values(d.notes).every(n => fields(n,['evidence','revisionReason'])) || !Object.values(d.judgments).every(j => object(j) && member(j.verdict,['','true','false','uncertain']) && typeof j.reason === 'string' && typeof j.revealed === 'boolean')) return false;
    if (!d.pickIds.every((id: string) => d.bank.propositions.some((p: Obj) => p.id === id)) || new Set(d.pickIds).size !== d.pickIds.length) return false;
    if (d.complexityConfirmed !== undefined && typeof d.complexityConfirmed !== 'boolean') return false;
  }
  return w.step === 'input' || (!!w.analysis && (w.step === 'analysis' || (!!w.bank && !!w.bankDraft)));
}
/** Imported generated results and approvals are never trusted. Rebuild them from reviewed source. */
export function safeRestore(w: Workspace): Workspace {
  return { ...w, step: w.bankDraft ? 'bank' : w.analysis ? 'analysis' : 'input', stimulus: null, assembly: null, final: null, teacherChecks: [false,false,false,false], reviewReasons: {}, bankDraft: w.bankDraft ? { ...w.bankDraft, reviewedIds: [], sourceReview: undefined } : null };
}
export function readBackup(raw: string): SavedWorkspace {
  if (new TextEncoder().encode(raw).length > 20 * 1024 * 1024) throw new Error('백업은 20MB 이내로 선택하세요.');
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('JSON 백업을 읽지 못했습니다. 현재 작업은 유지했습니다.'); }
  if (!object(data) || data.version !== 3 || !validWorkspace(data.current) || !Array.isArray(data.revisions) || !data.revisions.every(r => fields(r,['id','at','label']) && validWorkspace(r.snapshot))) throw new Error('지원하지 않거나 손상된 백업입니다. 현재 작업은 유지했습니다.');
  return { version: 3, current: safeRestore(data.current), revisions: data.revisions.map(r => ({ id: r.id, at: r.at, label: r.label, snapshot: safeRestore(r.snapshot) })) };
}
