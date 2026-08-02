const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

const CHUNK_THRESHOLD = 200;
const CHUNK_ITEMS = 400;

function indentLines(s: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return s
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}

function embedValue(key: string, value: unknown, level: number): string {
  const pad = "  ".repeat(level);
  const json = JSON.stringify(value, null, 2);
  const lines = json.split("\n");
  const first = lines[0];
  const rest = lines
    .slice(1)
    .map((line) => pad + line)
    .join("\n");
  return pad + JSON.stringify(key) + ": " + first + (rest ? "\n" + rest : "");
}

export async function stringifyChunked(
  value: Record<string, unknown>
): Promise<string> {
  const keys = Object.keys(value);
  const entries: string[] = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const val = value[key];

    if (Array.isArray(val) && val.length > CHUNK_THRESHOLD) {
      const pad = "  ";
      let entry = pad + JSON.stringify(key) + ": [\n";
      const items: string[] = [];

      for (let j = 0; j < val.length; j++) {
        items.push(indentLines(JSON.stringify(val[j], null, 2), 4));
        if ((j + 1) % CHUNK_ITEMS === 0) {
          entry += items.join(",\n") + ",\n";
          items.length = 0;
          await yieldToMain();
        }
      }

      if (items.length > 0) {
        entry += items.join(",\n") + "\n";
      } else {
        entry = entry.replace(/,\n$/, "\n");
      }
      entry += pad + "]";

      entries.push(entry);
    } else {
      entries.push(embedValue(key, val, 1));
    }
  }

  return "{\n" + entries.join(",\n") + "\n}";
}
