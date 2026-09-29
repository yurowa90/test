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
  const score = !spec.normalizeScore ? "keep" : spec.scoreDecimal ? "decimal" : "integer";

  return (
    <div className="space-y-6">
      <Group title="글자·문단" note="양식의 기준 글자 모양·문단 모양을 그대로 씁니다.">
        <Field label="본문 글자" hint={`${spec.fontFace || "양식 글꼴"} · 크기와 줄간격`}>
          <div className="flex flex-wrap items-center gap-2">
            <NumberInput value={spec.sizePt} min={8} max={14} step={0.5} onChange={(v) => set("sizePt", v)} label="글자 크기" />
            <span className="text-ink-3">pt</span>
            <span className="ml-3 text-ink-3">줄간격</span>
            <NumberInput value={spec.lineSpacing} min={100} max={250} step={5} onChange={(v) => set("lineSpacing", v)} label="줄간격" />
            <span className="text-ink-3">%</span>
          </div>
        </Field>
        <Field label="문항 배치" hint="균등 배치: 단마다 처음 문항은 위, 마지막 문항은 아래에 두고 사이 간격을 고르게 나눕니다(단이 바뀌는 자리는 단 나누기로 고정). 고정: 문항 사이에 정해진 빈 줄만 둡니다.">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={spec.layout}
              onChange={(v) => set("layout", v as FormatSpec["layout"])}
              options={[
                ["balanced", "단마다 균등 배치(권장)"],
                ["fixed", "문항 사이 빈 줄 고정"],
              ]}
            />
            <span className="text-ink-3">{spec.layout === "balanced" ? "최소 빈 줄" : "빈 줄"}</span>
            <NumberInput value={spec.gapLines} min={0} max={5} step={1} onChange={(v) => set("gapLines", v)} label="문항 사이 빈 줄" />
          </div>
        </Field>
        <Field label="자간·장평" hint="양식 자간에 원본의 상대 차이를 더합니다. 줄 맞춤에 쓴 자간이 사라지면 〈보기〉 줄이 넘칠 수 있어 유지를 권합니다.">
          <Select
            value={spec.resetSpacing ? "reset" : "keep"}
            onChange={(v) => set("resetSpacing", v === "reset")}
            options={[
              ["keep", "양식 기준 + 원본 차이 유지(권장)"],
              ["reset", "양식 기준으로 초기화"],
            ]}
          />
        </Field>
        <div className="space-y-2 md:col-span-2">
          <Check checked={spec.wordWrap} onChange={(v) => set("wordWrap", v)} label="어절 단위 줄바꿈(단어 안에서 끊지 않음)과 외톨이줄 보호(문단 첫·끝 줄이 쪽·단 끝에 홀로 남지 않게)" />
          <Check checked={spec.tracking} onChange={(v) => set("tracking", v)} label="고아 줄 줄이기: 마지막 줄에 두세 글자만 남는 문단은 자간을 −3~−6% 줄여 앞 줄로(미리보기 엔진으로 어림하므로 한글에서 확인)" />
        </div>
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
      </Group>

      <Group title="번호·배점·선지" note={`문항 번호: ${spec.numbering.label || "양식 방식"} — 양식이 번호를 다는 방식을 그대로 따릅니다.`}>
        <Field label="번호 뒤 한 칸" hint="번호 모양에 공백이 없는 양식(예: ‘1.’ 바로 뒤 발문)이면 한 칸을 띄웁니다.">
          <Select
            value={spec.headLead ? "space" : "none"}
            onChange={(v) => set("headLead", v === "space" ? " " : "")}
            options={[
              ["space", "번호 뒤 한 칸 띄우기"],
              ["none", "띄우지 않음(번호 모양에 간격 포함)"],
            ]}
          />
        </Field>
        <Field label="배점 표기" hint="물음표 뒤 한 칸, 배점만 있는 줄은 오른쪽 정렬. 숫자는 바꾸지 않고 표기 모양만 맞춥니다.">
          <Select
            value={score}
            onChange={(v) => onChange({ ...spec, normalizeScore: v !== "keep", scoreDecimal: v === "keep" ? spec.scoreDecimal : v === "decimal" })}
            options={[
              ["decimal", "[4.0점] 소수점 한 자리"],
              ["integer", "[4점] 정수"],
              ["keep", "원본 표기 유지"],
            ]}
          />
        </Field>
        <Field label="배점 표기가 없는 문항" hint="학력평가·수능은 2점 문항에 배점을 적지 않습니다. ‘누락으로 보기’를 고르면 검수에서 알려 줍니다.">
          <Select
            value={spec.unmarkedScore == null ? "none" : String(spec.unmarkedScore)}
            onChange={(v) => set("unmarkedScore", v === "none" ? null : Number(v))}
            options={[
              ["none", "누락으로 보기"],
              ["2", "2점으로 계산(학력평가 관례)"],
              ["3", "3점으로 계산"],
            ]}
          />
        </Field>
        <Field label="선지 배열" hint="짧은 선지는 탭 간격으로 한 줄 5·3·2개, 긴 선지는 한 줄 하나(내어쓰기). 표 형식 선지는 그대로 둡니다.">
          <Select
            value={spec.choiceLayout}
            onChange={(v) => set("choiceLayout", v as FormatSpec["choiceLayout"])}
            options={[
              ["auto", "자동으로 다시 배열"],
              ["keep", "원본 배열 유지"],
            ]}
          />
        </Field>
        <Field label="부정어 강조" hint="양식 유의사항은 ‘밑줄, 진하게’, 학교 출제 유의사항(p.6)은 ‘밑줄만 긋고 굵게 표시하지 말 것’으로 서로 다릅니다." warn>
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
      </Group>

      <Group title="〈보기〉·표·그림" note={spec.boxWidthHU ? `〈보기〉 상자 폭: 양식 예시 ${(spec.boxWidthHU / 283.46).toFixed(0)}mm` : "〈보기〉 상자 폭: 양식 예시가 없어 단 폭에 맞춥니다."}>
        <div className="space-y-2 md:col-span-2">
          <Check checked={spec.fitObjects} onChange={(v) => set("fitObjects", v)} label="〈보기〉 상자를 양식 폭으로, 단 폭을 넘는 표·그림은 비율을 지켜 줄이기(글자 크기 변화에 맞춰 표 폭도 조정)" />
          <Check checked={spec.normalizeEquationSize} onChange={(v) => set("normalizeEquationSize", v)} label="본문 수식 글자 크기도 본문 크기에 맞추기" />
        </div>
      </Group>

      <Group title="쪽·인쇄">
        <Field label="머리 표·쪽 정보" hint="출제 교사·과목·시행일이 채워진 파일을 고르면 그 머리 표를 씁니다.">
          <Select
            value={String(spec.headerFrom)}
            onChange={(v) => set("headerFrom", v === "template" ? "template" : Number(v))}
            options={[["template", "양식 원본(빈칸)"], ...sources.map((s, i) => [String(i), s.name] as [string, string])]}
          />
        </Field>
        <div className="space-y-2 self-end">
          <Check checked={spec.keepTogether} onChange={(v) => set("keepTogether", v)} label="한 문항이 단·쪽에서 쪼개지지 않게(다음 문단과 함께)" />
          <Check checked={!spec.keepColors} onChange={(v) => set("keepColors", !v)} label="글자색을 모두 검정으로(흑백 인쇄 기준)" />
        </div>
      </Group>

      <p className="border-l-[3px] border-l-ink bg-paper px-3 py-2 text-[12.5px] text-ink-2">
        <b className="text-ink">바꾸지 않는 것</b> — 문항 글자, 기호(〈보기〉 ㄱ·ㄴ·ㄷ, ㉠, 불릿, 괄호), 숫자, 선지 내용. 양식과 다른 기호는 3단계 문항 목록과 편집 검수에 알려 드리니 원본에서 고쳐 주세요.
      </p>
    </div>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <fieldset className="border-t-2 border-ink pt-3">
      <legend className="sr-only">{title}</legend>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <h3 className="serif text-[16px] font-bold">{title}</h3>
        {note && <p className="text-[12px] text-ink-3">{note}</p>}
      </div>
      <div className="grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({ label, hint, warn, children }: { label: string; hint?: string; warn?: boolean; children: ReactNode }) {
  return (
    <div>
      <span className="text-[13px] font-bold text-ink">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className={`mt-1 block text-[11.5px] leading-snug ${warn ? "text-warn" : "text-ink-3"}`}>{hint}</span>}
    </div>
  );
}

function NumberInput({ value, min, max, step, onChange, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      aria-label={label}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
      }}
      className="field !w-20 tabular-nums"
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="field max-w-sm">
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
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-primary" />
      <span>{label}</span>
    </label>
  );
}
