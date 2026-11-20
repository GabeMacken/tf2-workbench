/**
 * Loads the language in use: the built-in English (the repo's locales/en, part of the build) and, over it, the language's files from
 * the languages folder, read at runtime. Reloading reads the files again and writes the open interface again in what they say now, so
 * text can be reworked while the app runs. Imported first by main.ts: the built-in English is in use before anything is built.
 */
import { languageStamp, readLanguage } from "../api";
import { parseLanguage } from "./parse";
import { languageReport, refreshDom, useStrings, type LanguageReport } from "./strings";

const builtInFiles = import.meta.glob("../../locales/en/*.yaml", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const builtIn = parseLanguage(Object.entries(builtInFiles).map(([path, text]) => ({ name: path.replace(/^.*\/|\.yaml$/g, ""), text })));
if (builtIn.problems.length) console.error("the built-in English has problems:", builtIn.problems);
useStrings(builtIn.texts);

let current = "en";
const listeners = new Set<(r: LanguageReport) => void>();
/** Calls `fn` each time a language is loaded (its report); returns how to stop. */
export function onLanguageLoaded(fn: (r: LanguageReport) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Puts a language in use (its files over the built-in English); without its folder, the built-in English alone. */
export async function loadLanguage(code: string): Promise<LanguageReport> {
  current = code;
  try {
    const lang = parseLanguage(await readLanguage(code));
    useStrings(builtIn.texts, { code, locale: lang.locale || code, texts: lang.texts, problems: lang.problems });
  } catch (err) {
    if (code !== "en") console.warn(`could not read the language ${code}:`, err);
    useStrings(builtIn.texts);
  }
  for (const fn of listeners) fn(languageReport());
  return languageReport();
}

/** Reads the language's files again and writes the open interface again in them; how many texts changed. */
export async function reloadLanguage(code = current): Promise<number> {
  await loadLanguage(code);
  return refreshDom();
}

/** The names of languages (meta.yaml's name), for a list of codes; a code whose files cannot be read is named by itself. */
export async function languageNames(codes: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const code of codes) {
    try {
      const meta = (await readLanguage(code)).filter((f) => f.name === "meta");
      out.set(code, parseLanguage(meta).name || code);
    } catch {
      out.set(code, code);
    }
  }
  return out;
}

let watching = 0;
/** Reloads the language each time one of its files changes (checked every second); off with `false`. */
export function watchLanguage(on: boolean) {
  window.clearInterval(watching);
  watching = 0;
  if (!on) return;
  let last: string | null = null, busy = false;
  watching = window.setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const stamp = await languageStamp(current).catch(() => "");
      if (last !== null && stamp !== last) await reloadLanguage();
      last = stamp;
    } finally {
      busy = false;
    }
  }, 1000);
}
