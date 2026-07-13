interface DiffProps {
  oldCode: string;
  newCode: string;
  language?: string;
  title?: string;
}

export function DiffComponent({ oldCode, newCode, language, title }: DiffProps) {
  const oldLines = oldCode.split("\n");
  const newLines = newCode.split("\n");
  const maxLines = Math.max(oldLines.length, newLines.length);

  const renderLines = [];
  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      renderLines.push({
        type: "equal",
        oldText: oldLine,
        newText: newLine,
        oldNum: i + 1,
        newNum: i + 1,
      });
    } else {
      if (oldLine !== undefined) {
        renderLines.push({
          type: "remove",
          oldText: oldLine,
          newText: "",
          oldNum: i + 1,
          newNum: null,
        });
      }
      if (newLine !== undefined) {
        renderLines.push({
          type: "add",
          oldText: "",
          newText: newLine,
          oldNum: null,
          newNum: i + 1,
        });
      }
    }
  }

  return (
    <div className="flex flex-col border border-border rounded-lg overflow-hidden bg-card text-xs w-full">
      <div className="bg-muted/70 px-4 py-2 border-b border-border/80 flex justify-between items-center text-muted-foreground font-mono text-[10px]">
        <span>{title || "Code Diff"}</span>
        {language && <span className="uppercase">{language}</span>}
      </div>

      <div className="overflow-x-auto font-mono text-[11px] leading-normal bg-card">
        <table className="min-w-full border-collapse">
          <tbody>
            {renderLines.map((line, idx) => {
              if (line.type === "equal") {
                return (
                  <tr key={idx} className="hover:bg-muted/10">
                    <td className="w-10 px-2 text-right select-none text-muted-foreground border-r border-border bg-muted/20">{line.oldNum}</td>
                    <td className="w-10 px-2 text-right select-none text-muted-foreground border-r border-border bg-muted/20">{line.newNum}</td>
                    <td className="px-4 py-0.5 whitespace-pre text-foreground">{line.oldText}</td>
                  </tr>
                );
              }
              if (line.type === "remove") {
                return (
                  <tr key={idx} className="bg-error/10 hover:bg-error/15">
                    <td className="w-10 px-2 text-right select-none text-error border-r border-error/20 bg-error/15">{line.oldNum}</td>
                    <td className="w-10 px-2 text-right select-none text-muted-foreground/30 border-r border-border bg-muted/20">-</td>
                    <td className="px-4 py-0.5 whitespace-pre text-error-foreground/90 font-semibold">{`-${line.oldText}`}</td>
                  </tr>
                );
              }
              // Add line
              return (
                <tr key={idx} className="bg-success/10 hover:bg-success/15">
                  <td className="w-10 px-2 text-right select-none text-muted-foreground/30 border-r border-border bg-muted/20">+</td>
                  <td className="w-10 px-2 text-right select-none text-success border-r border-success/20 bg-success/15">{line.newNum}</td>
                  <td className="px-4 py-0.5 whitespace-pre text-success-foreground/90 font-semibold">{`+${line.newText}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
