type Block = { type: "para"; text: string } | { type: "table"; rows: string[][] };

/** 자료 본문: Markdown 표(| … |)는 표로, 나머지는 줄바꿈을 살린 문단으로 */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let table: string[][] = [];
  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: "para", text: para.join("\n") });
      para = [];
    }
  };
  const flushTable = () => {
    if (table.length) {
      blocks.push({ type: "table", rows: table });
      table = [];
    }
  };
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("|")) {
      flushPara();
      if (/^\|(\s*:?-+:?\s*\|)+\s*$/.test(t)) continue; // 구분선
      table.push(
        t
          .replace(/^\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((c) => c.trim()),
      );
    } else {
      flushTable();
      if (t === "") flushPara();
      else para.push(line);
    }
  }
  flushPara();
  flushTable();
  return blocks;
}

export default function StimulusBody({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const blocks = parseBlocks(text);
  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.type === "table" ? (
          <div key={i} className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {b.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) =>
                      ri === 0 ? (
                        <th
                          key={ci}
                          scope="col"
                          className="border border-ink/25 bg-paper/70 px-2 py-1 text-center font-semibold"
                        >
                          {cell}
                        </th>
                      ) : (
                        <td
                          key={ci}
                          className="border border-ink/25 px-2 py-1 text-center"
                        >
                          {cell}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p key={i} className="whitespace-pre-line leading-relaxed">
            {b.text}
          </p>
        ),
      )}
    </div>
  );
}
