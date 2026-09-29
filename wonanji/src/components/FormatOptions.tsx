import type { ReactNode } from "react";
import type { FormatSpec, SourceAnalysis } from "../engine/types";

interface Props {
  spec: FormatSpec;
  sources: SourceAnalysis[];
  onChange: (next: FormatSpec) => void;
}

export default function FormatOptions({ spec, sources, onChange }: Props) {
  const set = <K extends keyof FormatSpec>(k: K, v: FormatSpec[K]) => onChange({ ...spec, [k]: v });
  const neg = spec.negation === "off" ? "off" : spec.negationStyle;

  return (
    <div className="grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">
      <Field label="본문 글자" hint={`${spec.fontFace} · 양식 기준 글자 모양을 그대로 씁니다`}>
        <div className="flex items-center gap-2">
          <NumberInput value={spec.sizePt} min={8} max={14} step={0.5} onChange={(v) => set("sizePt", v)} />
          <span className="text-ink-faint">pt</span>
          <span className="ml-3 text-ink-faint">줄간격</span>
          <NumberInput value={spec.lineSpacing} min={100} max={250} step={5} onChange={(v) => set("lineSpacing", v)} />
          <span className="text-ink-faint">%</span>
        </div>
      </Field>

      <Field label="문항 사이 빈 줄" hint="양식의 예시 문항 사이 간격에서 읽었습니다">
        <NumberInput value={spec.gapLines} min={0} max={5} step={1} onChange={(v) => set("gapLines", v)} />
      </Field>

      <Field label="선지 배열" hint="짧은 선지는 탭 간격으로 한 줄 5개·3개·2개, 긴 선지는 한 줄 하나(내어쓰기). 표 형식 선지는 그대로 둡니다.">
        <Select
          value={spec.choiceLayout}
          onChange={(v) => set("choiceLayout", v as FormatSpec["choiceLayout"])}
          options={[
            ["auto", "자동으로 다시 배열"],
            ["keep", "원본 배열 유지"],
          ]}
        />
      </Field>

      <Field
        label="부정어 강조"
        hint="양식 유의사항은 ‘밑줄, 진하게’, 학교 출제 유의사항(p.6)은 ‘밑줄만 긋고 굵게 표시하지 말 것’으로 서로 다릅니다."
        warn
      >
        <Select
          value={neg}
          onChange={(v) => onChange({ ...spec, negation: v === "off" ? "off" : "auto", negationStyle: v === "off" ? spec.negationStyle : (v as FormatSpec["negationStyle"]) })}
          options={[
            ["underline-bold", "밑줄 + 진하게 (양식)"],
            ["underline", "밑줄만 (학교 출제 유의사항)"],
            ["off", "손대지 않음"],
          ]}
        />
      </Field>

      <Field label="표·〈보기〉 안 글자" hint="통일하면 글꼴·크기·줄간격을 본문과 맞춥니다. 그림이 든 칸과 빈 칸은 원래 간격을 지킵니다.">
        <Select
          value={spec.cellMode}
          onChange={(v) => set("cellMode", v as FormatSpec["cellMode"])}
          options={[
            ["normalize", "본문과 통일"],
            ["keep", "원본 크기·줄간격 유지(글꼴만 통일)"],
          ]}
        />
      </Field>

      <Field label="자간·장평" hint="선생님들이 줄 맞춤에 쓴 자간을 없애면 〈보기〉 줄이 넘칠 수 있어 유지를 권합니다.">
        <Select
          value={spec.resetSpacing ? "reset" : "keep"}
          onChange={(v) => set("resetSpacing", v === "reset")}
          options={[
            ["keep", "원본 유지(권장)"],
            ["reset", "양식 기준으로 초기화"],
          ]}
        />
      </Field>

      <Field label="머리 표·쪽 정보" hint="출제 교사·과목·시행일이 채워진 파일을 고르면 그 머리 표를 씁니다.">
        <Select
          value={String(spec.headerFrom)}
          onChange={(v) => set("headerFrom", v === "template" ? "template" : Number(v))}
          options={[["template", "양식 원본(빈칸)"], ...sources.map((s, i) => [String(i), s.name] as [string, string])]}
        />
      </Field>

      <div className="space-y-2 md:col-span-2">
        <Check checked={spec.normalizeScore} onChange={(v) => set("normalizeScore", v)} label="배점 표기를 [4.0점]처럼 소수점 한 자리로 통일하고, 물음표 뒤 한 칸 띄우기" />
        <Check checked={spec.keepTogether} onChange={(v) => set("keepTogether", v)} label="한 문항이 단·쪽에서 쪼개지지 않게(다음 문단과 함께)" />
        <Check checked={spec.normalizeEquationSize} onChange={(v) => set("normalizeEquationSize", v)} label="본문 수식 글자 크기도 본문 크기에 맞추기" />
        <Check checked={!spec.keepColors} onChange={(v) => set("keepColors", !v)} label="글자색을 모두 검정으로(흑백 인쇄 기준)" />
      </div>
    </div>
  );
}

function Field({ label, hint, warn, children }: { label: string; hint?: string; warn?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="font-semibold text-ink">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className={`mt-1 block text-xs ${warn ? "text-warn" : "text-ink-faint"}`}>{hint}</span>}
    </label>
  );
}

function NumberInput({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
      }}
      className="w-20 rounded border border-paper-line bg-white px-2 py-1 tabular-nums"
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full max-w-xs rounded border border-paper-line bg-white px-2 py-1.5">
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>{label}</span>
    </label>
  );
}
