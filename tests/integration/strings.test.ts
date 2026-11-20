import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { formatMessage, parseMessage } from "../../src/i18n/format";
import { parseLanguage } from "../../src/i18n/parse";
import { languageReport, trDynamic, useStrings } from "../../src/i18n/strings";

const repo = process.cwd(); // (npm test runs in the repo)
const fmt = (text: string, params?: Record<string, string | number>) => formatMessage(parseMessage(text), params, "en-US");

test("a message takes its values: text, numbers, plurals and choices", () => {
  assert.equal(fmt("Could not export: {error}", { error: "no disk" }), "Could not export: no disk");
  assert.equal(fmt("{n, number} pixels", { n: 12500 }), "12,500 pixels");
  const shots = "{count, plural, =0 {no shots} one {# shot} other {# shots}}";
  assert.deepEqual([0, 1, 2, 1000].map((count) => fmt(shots, { count })), ["no shots", "1 shot", "2 shots", "1,000 shots"]);
  const team = "{team, select, red {RED} blu {BLU} other {either team}}";
  assert.deepEqual(["red", "blu", "x"].map((t) => fmt(team, { team: t })), ["RED", "BLU", "either team"]);
  assert.equal(fmt("Linked in {count, plural, one {# other picture} other {# other pictures}}. Done", { count: 3 }), "Linked in 3 other pictures. Done");
});

test("apostrophes are text, and quote braces", () => {
  assert.equal(fmt("The view's light"), "The view's light");
  assert.equal(fmt("A brace: '{' and '}', and '' twice"), "A brace: { and }, and ' twice");
  assert.equal(fmt("A value missing stays seen: {name}"), "A value missing stays seen: {name}");
});

test("a broken template says what is wrong", () => {
  assert.throws(() => parseMessage("Hello {name"), /followed by } or ,/);
  assert.throws(() => parseMessage("{n, plural, one {#}}"), /other/);
  assert.throws(() => parseMessage("{n, plural, one {# shot} other {# shots}"), /not closed/);
  assert.throws(() => parseMessage("closed }"), /not opened/);
});

test("a language falls back to English, message by message, and says what it lacks or got wrong", () => {
  const en = new Map([["a.hello", "Hello {name}"], ["a.bye", "Bye"], ["a.count", "{n, plural, one {# shot} other {# shots}}"]]);
  const de = new Map([["a.hello", "Hallo {name}"], ["a.count", "{n, plural, one {# Bild} other {# Bilder} "], ["a.typo", "Tschüss"], ["a.bye", "Tschüss {who}"]]);
  useStrings(en, { code: "de", locale: "de-DE", texts: de, problems: [] });
  assert.equal(trDynamic("a.hello", { name: "Gabe" }), "Hallo Gabe");
  assert.equal(trDynamic("a.count", { n: 2 }), "2 shots", "a translation that does not parse falls back");
  assert.equal(trDynamic("a.bye"), "Bye", "a translation asking for a value English does not give falls back");
  assert.equal(trDynamic("a.nothing"), "a.nothing", "a key no language has is shown as itself");
  const r = languageReport();
  assert.deepEqual(r.unknown, ["a.typo"]);
  assert.deepEqual(r.broken.map((b) => b.key).sort(), ["a.bye", "a.count"]);
  assert.deepEqual(r.missing, []);
  useStrings(en);
});

// --- the English files themselves --------------------------------------------------------------------------------------------------

const englishFiles = () => readdirSync(join(repo, "locales", "en")).filter((f) => f.endsWith(".yaml")).map((f) => ({ name: f.slice(0, -5), text: readFileSync(join(repo, "locales", "en", f), "utf8") }));
const sources = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? sources(p) : n.endsWith(".ts") && !n.endsWith(".gen.ts") ? [p] : [];
});

test("the English files are all text that parses, with a name and a locale", () => {
  const en = parseLanguage(englishFiles());
  assert.deepEqual(en.problems, []);
  assert.equal(en.name, "English");
  assert.equal(en.locale, "en-US");
  for (const [key, text] of en.texts) assert.doesNotThrow(() => parseMessage(text), key);
});

test("every English message is used by the app (a message no code shows is a leftover)", () => {
  const en = parseLanguage(englishFiles());
  const code = sources(join(repo, "src")).map((f) => readFileSync(f, "utf8")).join("\n");
  const unused = [...en.texts.keys()].filter((key) => !code.includes(`"${key}"`));
  assert.deepEqual(unused, []);
});

test("a message is never put into markup unescaped (a language file could add markup)", () => {
  const bad: string[] = [];
  for (const f of sources(join(repo, "src"))) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (/innerHTML\s*[+]?=.*\$\{\s*tr\(/.test(line)) bad.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});

test("the message types are up to date with the English files", () => {
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", join(repo, "scripts", "i18n-types.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});
