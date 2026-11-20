/** Reads the YAML of a language's files into its messages (see strings.ts). */
import { parse } from "yaml";
import { flattenStrings } from "./strings";

export interface ParsedLanguage { name: string; locale: string; texts: Map<string, string>; problems: { key: string; error: string }[] }

/** A language's files as messages: each file is an area (its name), `meta` the language's name and locale. */
export function parseLanguage(files: { name: string; text: string }[]): ParsedLanguage {
  const out: ParsedLanguage = { name: "", locale: "", texts: new Map(), problems: [] };
  for (const f of files) {
    let doc: unknown;
    try {
      doc = parse(f.text);
    } catch (err) {
      out.problems.push({ key: `${f.name}.yaml`, error: String((err as Error).message).split("\n")[0] });
      continue;
    }
    if (f.name === "meta") {
      const meta = (doc ?? {}) as { name?: unknown; locale?: unknown };
      out.name = typeof meta.name === "string" ? meta.name : "";
      out.locale = typeof meta.locale === "string" ? meta.locale : "";
    } else flattenStrings(f.name, doc, out.texts, out.problems);
  }
  return out;
}
