/**
 * The message templates of the language files: a subset of ICU MessageFormat, so the files can be read by translation tools.
 *   {name}                                   a value
 *   {count, number}                          a number, written for the language
 *   {count, plural, one {# shot} other {# shots}}   by the language's plural rules (=0 for an exact value); # is the number
 *   {team, select, red {RED} blu {BLU} other {either}}   by the value
 * An apostrophe quotes a brace: '{' is a brace, '' is an apostrophe; any other apostrophe is just one (the view's).
 */

export type Part = string | Arg;
type Arg =
  | { name: string; kind: "text" }
  | { name: string; kind: "number" }
  | { name: string; kind: "plural"; options: Record<string, Part[]> }
  | { name: string; kind: "select"; options: Record<string, Part[]> }
  | { kind: "hash" };

export type ArgKind = "text" | "number" | "plural" | "select";
export type Params = Record<string, string | number>;

/** Parses a template; throws with what is wrong in it. */
export function parseMessage(text: string): Part[] {
  let i = 0;
  const fail = (what: string): never => { throw new Error(`${what} at character ${i + 1}`); };
  const space = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const word = () => {
    const m = /^[A-Za-z_][\w]*|^=\d+/.exec(text.slice(i));
    if (!m) fail("a name was expected");
    i += m![0].length;
    return m![0];
  };
  function parts(inPlural: boolean, closing: boolean): Part[] {
    const out: Part[] = [];
    let buf = "";
    const flush = () => { if (buf) out.push(buf); buf = ""; };
    while (i < text.length) {
      const c = text[i];
      if (c === "'") {
        if (text[i + 1] === "'") { buf += "'"; i += 2; continue; }
        if (text[i + 1] === "{" || text[i + 1] === "}" || (inPlural && text[i + 1] === "#")) {
          const end = text.indexOf("'", i + 1);
          if (end < 0) fail("a quote is not closed");
          buf += text.slice(i + 1, end);
          i = end + 1;
          continue;
        }
        buf += c;
        i++;
      } else if (c === "{") {
        flush();
        i++;
        out.push(arg());
      } else if (c === "}") {
        if (!closing) fail("a brace is closed that was not opened");
        flush();
        return out;
      } else if (c === "#" && inPlural) {
        flush();
        out.push({ kind: "hash" });
        i++;
      } else {
        buf += c;
        i++;
      }
    }
    if (closing) fail("a brace is not closed");
    flush();
    return out;
  }
  function arg(): Arg {
    space();
    const name = word();
    space();
    if (text[i] === "}") { i++; return { name, kind: "text" }; }
    if (text[i] !== ",") fail(`"${name}" should be followed by } or ,`);
    i++;
    space();
    const kind = word();
    space();
    if (kind === "number") {
      if (text[i] !== "}") fail("a number takes no options");
      i++;
      return { name, kind: "number" };
    }
    if (kind !== "plural" && kind !== "select") return fail(`"${kind}" is not plural, select or number`);
    if (text[i] !== ",") fail(`${kind} needs its options`);
    i++;
    const options: Record<string, Part[]> = {};
    for (;;) {
      space();
      if (text[i] === "}") { i++; break; }
      if (i >= text.length) fail("a brace is not closed");
      const key = word();
      space();
      if (text[i] !== "{") fail(`the option "${key}" needs its text in braces`);
      i++;
      options[key] = parts(kind === "plural", true);
      i++; // (its closing brace)
    }
    if (!options.other) fail(`${kind} needs an "other" option`);
    return { name, kind, options };
  }
  return parts(false, false);
}

/** The values a template takes, and how it uses each (a name used two ways counts as the stricter). */
export function argsOf(parts: Part[], out = new Map<string, ArgKind>()): Map<string, ArgKind> {
  for (const p of parts) {
    if (typeof p === "string" || p.kind === "hash") continue;
    const had = out.get(p.name);
    if (!had || had === "text") out.set(p.name, p.kind);
    if ("options" in p) for (const o of Object.values(p.options)) argsOf(o, out);
  }
  return out;
}

const numbers = new Map<string, Intl.NumberFormat>();
const plurals = new Map<string, Intl.PluralRules>();
const numberFormat = (locale: string) => numbers.get(locale) ?? numbers.set(locale, new Intl.NumberFormat(locale)).get(locale)!;
const pluralRules = (locale: string) => plurals.get(locale) ?? plurals.set(locale, new Intl.PluralRules(locale)).get(locale)!;

/** Writes a parsed template with its values (a value missing is left as its name in braces, to be seen). */
export function formatMessage(parts: Part[], params: Params | undefined, locale: string, hash?: number): string {
  let out = "";
  for (const p of parts) {
    if (typeof p === "string") { out += p; continue; }
    if (p.kind === "hash") { out += hash === undefined ? "#" : numberFormat(locale).format(hash); continue; }
    const value = params?.[p.name];
    if (value === undefined) { out += `{${p.name}}`; continue; }
    if (p.kind === "text") out += String(value);
    else if (p.kind === "number") out += typeof value === "number" ? numberFormat(locale).format(value) : String(value);
    else if (p.kind === "plural") {
      const n = Number(value);
      const branch = p.options[`=${n}`] ?? p.options[pluralRules(locale).select(n)] ?? p.options.other;
      out += formatMessage(branch, params, locale, n);
    } else out += formatMessage(p.options[String(value)] ?? p.options.other, params, locale, hash);
  }
  return out;
}
