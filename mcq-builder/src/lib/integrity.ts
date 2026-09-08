import { validFigure, missingFigureValues } from './figure.ts';
import type { ItemFigure } from './figure.ts';
import type { FinalItem } from '../types.ts';

const norm = (s: string) => s.normalize('NFKC').replace(/\s/g, '').toLowerCase();
const numbers = (s: string) => new Set((s.normalize('NFKC').replace(/−/g, '-').replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, '').match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/gi) ?? []).map(Number));
const numericCell = (s: string): number | null => {
  const value = s.normalize('NFKC').trim().replace(/−/g, '-');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
export function sourceTables(text: string): string[][][] {
  const result: string[][][] = []; let rows: string[][] = [];
  const flush = () => { if (rows.length > 1 && rows.every(r => r.length === rows[0].length)) result.push(rows); rows = []; };
  for (const line of [...text.split('\n'), '']) {
    if (!line.includes('|') && !line.includes('\t')) { flush(); continue; }
    const cells = line.includes('|') ? line.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim()) : line.split('\t').map(s => s.trim());
    if (cells.every(c => /^:?-+:?$/.test(c))) continue;
    if (cells.length < 2) { flush(); continue; }
    rows.push(cells);
  }
  return result;
}
export function checkFigureSource(figure: ItemFigure, evidence: string): { issues: string[]; matched: boolean } {
  if (!validFigure(figure)) return { issues: ['그림 데이터 형식을 확인하세요.'], matched: false };
  if (figure.kind === 'process') return { issues: [], matched: false };
  const issues = missingFigureValues(figure, evidence).length ? ['그래프에 원자료에서 찾지 못한 수치가 있습니다.'] : [];
  const table = sourceTables(evidence).find(t => norm(t[0][0]) === norm(figure.xLabel) && figure.series.every(s => t[0].some(h => norm(h) === norm(s.name) || (figure.series.length === 1 && norm(h) === norm(figure.yLabel)))));
  if (!table) return { issues, matched: false };
  const labels = figure.kind === 'bar' ? figure.categories : figure.xValues.map(String);
  for (const series of figure.series) {
    const col = table[0].findIndex(h => norm(h) === norm(series.name) || (figure.series.length === 1 && norm(h) === norm(figure.yLabel)));
    labels.forEach((label, i) => {
      const rows = table.slice(1).filter(r => figure.kind === 'line' ? numericCell(r[0]) === figure.xValues[i] : norm(r[0]) === norm(label));
      if (rows.length !== 1 || numbers(rows[0][col]).size !== 1 || !numbers(rows[0][col]).has(series.values[i])) issues.push(`${label} · ${series.name}: 원표의 항목과 수치가 일치하지 않습니다.`);
    });
  }
  return { issues, matched: issues.length === 0 };
}
export function materialIssues(original: string, proposed: string): string[] {
  const originalNumbers = numbers(original);
  const issues = [...numbers(proposed)].some(n => !originalNumbers.has(n)) ? ['원자료에 없는 수치가 추가되었습니다. 원자료와 대조하거나 합성 자료로 전환하세요.'] : [];
  const originals = sourceTables(original);
  for (const table of sourceTables(proposed)) {
    const source = originals.find(t => norm(t[0][0]) === norm(table[0][0]));
    if (!source) continue;
    for (const row of table.slice(1)) {
      const sourceRows = source.slice(1).filter(r => norm(r[0]) === norm(row[0]));
      if (sourceRows.length !== 1) { issues.push(`${row[0]}: 원자료 항목을 확인하세요.`); continue; }
      table[0].slice(1).forEach((header, j) => {
        const col = source[0].findIndex(h => norm(h) === norm(header));
        if (col >= 0 && norm(sourceRows[0][col]) !== norm(row[j + 1])) issues.push(`${row[0]} · ${header}: 원표의 값이 변경되었습니다.`);
      });
    }
  }
  return [...new Set(issues)];
}
export const materialSignature = (body: string, conditions: string[], figure: ItemFigure | undefined, evidence: string) => JSON.stringify([body, conditions, figure ?? null, evidence]);
export function finalFigureIssue(item: { figureSpec: string; figure?: ItemFigure }): string | null {
  return item.figureSpec.trim() && !validFigure(item.figure) ? '그림 제작 지시가 있지만 실제 그림이 없습니다. 3단계에서 그림을 완성하거나 자료 형식을 수정하세요.' : null;
}
export function unresolvedReviews(item: FinalItem, reasons: Record<number, string> = {}): number[] {
  return item.reviewOrigin === 'example' ? [] : item.review.flatMap((r, i) => !r.pass && !reasons[i]?.trim() ? [i] : []);
}
