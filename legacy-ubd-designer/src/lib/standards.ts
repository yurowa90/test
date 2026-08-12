import type { ScienceStandard } from "../types";

interface Dataset {
  source: string;
  standards: ScienceStandard[];
}

let cache: ScienceStandard[] | null = null;

/** 공식 과학 성취기준 데이터셋을 한 번만 내려받아 캐시 */
export async function loadStandards(): Promise<ScienceStandard[]> {
  if (cache) return cache;
  const res = await fetch(`${import.meta.env.BASE_URL}science_standards.json`);
  if (!res.ok) throw new Error(`성취기준 데이터를 불러오지 못했습니다 (${res.status})`);
  const data: Dataset = await res.json();
  cache = data.standards;
  return cache;
}

/** 순서를 유지하며 중복 제거 */
function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

const LEVEL_ORDER = ["초등학교", "중학교", "고등학교"];

export function schoolLevels(all: ScienceStandard[]): string[] {
  return uniq(all.map((s) => s.level)).sort(
    (a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b),
  );
}

export function subjectsFor(all: ScienceStandard[], level: string): string[] {
  return uniq(all.filter((s) => s.level === level).map((s) => s.subject));
}

export function domainsFor(
  all: ScienceStandard[],
  level: string,
  subject: string,
): string[] {
  return uniq(
    all
      .filter((s) => s.level === level && s.subject === subject)
      .map((s) => s.domain),
  );
}

export function standardsFor(
  all: ScienceStandard[],
  level: string,
  subject: string,
  domain: string,
): ScienceStandard[] {
  return all.filter(
    (s) => s.level === level && s.subject === subject && s.domain === domain,
  );
}
