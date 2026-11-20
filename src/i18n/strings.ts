/**
 * The interface's text: every visible string is a message of the language files (locales/<code>/<area>.yaml, a key per message:
 * the area, then the path in its file, as promos.board.camera.header). English is built in and is what any message missing from the
 * language in use falls back to; the files on disk are read at runtime (see load.ts), so text can be changed without building the app.
 */
import { argsOf, formatMessage, parseMessage, type ArgKind, type Params, type Part } from "./format";
import type { Messages } from "./messages.gen";

export type MessageKey = keyof Messages;
type ArgsFor<K extends MessageKey> = Messages[K] extends null ? [] : [params: Messages[K]];

interface Compiled { parts: Part[]; args: Map<string, ArgKind> }

/** What was wrong with the language in use: messages it lacks, keys English has not, and messages that could not be used. */
export interface LanguageReport {
  language: string;
  missing: string[];
  unknown: string[];
  broken: { key: string; error: string }[];
}

let english = new Map<string, Compiled>();
let active = new Map<string, Compiled>();
let locale = "en-US";
let showKeys = false;
let report: LanguageReport = { language: "en", missing: [], unknown: [], broken: [] };

/**
 * A language file's messages as keys and texts: its nesting as the key's path under `area` (the file's name). Anything that is not
 * text is a problem (YAML reads `no` as false: such a message has to be quoted).
 */
export function flattenStrings(area: string, doc: unknown, out: Map<string, string>, problems: { key: string; error: string }[]) {
  const walk = (prefix: string, node: unknown) => {
    if (typeof node === "string") { out.set(prefix, node); return; }
    if (node && typeof node === "object" && !Array.isArray(node)) {
      for (const [k, v] of Object.entries(node)) walk(`${prefix}.${k}`, v);
      return;
    }
    problems.push({ key: prefix, error: `is ${node === null ? "empty" : `a ${Array.isArray(node) ? "list" : typeof node}`}, not text (put it in quotes)` });
  };
  walk(area, doc);
}

function compile(texts: Map<string, string>, broken: { key: string; error: string }[]): Map<string, Compiled> {
  const out = new Map<string, Compiled>();
  for (const [key, text] of texts) {
    try {
      const parts = parseMessage(text);
      out.set(key, { parts, args: argsOf(parts) });
    } catch (err) {
      broken.push({ key, error: (err as Error).message });
    }
  }
  return out;
}

/**
 * Puts a language in use: English (`base`, the built-in texts or the English files) and, over it, the language's own messages, each
 * only where it is good (it parses, and asks for no value that English does not give).
 */
export function useStrings(base: Map<string, string>, language?: { code: string; locale: string; texts: Map<string, string>; problems: { key: string; error: string }[] }) {
  const broken: { key: string; error: string }[] = [...(language?.problems ?? [])];
  english = compile(base, broken);
  active = new Map(english);
  const missing: string[] = [], unknown: string[] = [];
  if (language) {
    for (const [key, own] of compile(language.texts, broken)) {
      const en = english.get(key);
      if (!en) { unknown.push(key); continue; }
      const extra = [...own.args.keys()].filter((name) => !en.args.has(name));
      if (extra.length) { broken.push({ key, error: `asks for ${extra.map((x) => `{${x}}`).join(", ")}, which English does not give` }); continue; }
      active.set(key, own);
    }
    for (const key of english.keys()) if (!language.texts.has(key)) missing.push(key);
  }
  locale = language?.locale ?? "en-US";
  report = { language: language?.code ?? "en", missing, unknown, broken };
  if (broken.length) console.warn(`language ${report.language}: ${broken.length} message(s) not used`, broken);
}

export const languageReport = (): LanguageReport => report;
export const languageLocale = () => locale;

/** Shows every message as its key (to find which message a text of the interface is). */
export function setShowKeys(on: boolean) { showKeys = on; }
export const showingKeys = () => showKeys;

// What each text shown came from, so the interface can be written again in the new language without being built again (see refreshDom).
const produced = new Map<string, { key: string; params?: Params }>();
const PRODUCED_MAX = 20000;

/** A message, with its values. A key no language has comes back as itself, to be seen. */
export function tr<K extends MessageKey>(key: K, ...args: ArgsFor<K>): string {
  const params = args[0] as Params | undefined;
  const m = active.get(key);
  const text = showKeys ? `[${key}]` : m ? formatMessage(m.parts, params, locale) : key;
  if (produced.size >= PRODUCED_MAX) produced.clear();
  produced.set(text, { key, params });
  return text;
}

/** A message by a key made at runtime (a table's id); `tr` is checked when the app is built, this is not. */
export const trDynamic = (key: string, params?: Params): string => (tr as (k: string, p?: Params) => string)(key, params);

const ATTRIBUTES = ["title", "aria-label", "placeholder"];

/**
 * Writes the interface that is open again in the messages now in use: each text and tooltip that a message made is made again from
 * the same message. Parts built after this are made from the new messages anyway. Returns how many were changed.
 */
export function refreshDom(root: HTMLElement = document.body): number {
  const before = new Map(produced);
  const again = (text: string) => {
    const from = before.get(text);
    return from ? (tr as (k: string, p?: Params) => string)(from.key, from.params) : null;
  };
  let changed = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue ?? "";
    const now = text.trim() ? again(text) : null;
    if (now !== null && now !== text) { n.nodeValue = now; changed++; }
  }
  for (const el of root.querySelectorAll<HTMLElement>(ATTRIBUTES.map((a) => `[${a}]`).join(","))) {
    for (const a of ATTRIBUTES) {
      const text = el.getAttribute(a);
      const now = text ? again(text) : null;
      if (now !== null && now !== text) { el.setAttribute(a, now); changed++; }
    }
  }
  return changed;
}

/** A message for markup written as text (`innerHTML` templates): its characters escaped, so a language file cannot add markup. */
export function trHtml<K extends MessageKey>(key: K, ...args: ArgsFor<K>): string {
  return tr(key, ...args).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
