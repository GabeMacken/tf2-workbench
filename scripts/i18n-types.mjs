// Writes src/i18n/messages.gen.ts from the English language files (locales/en/*.yaml): every message's key and the values it takes,
// so a t() call with a key that does not exist, or without a value its message needs, does not build.
//   npm run strings                       write it
//   (node --experimental-strip-types scripts/i18n-types.mjs --check: fail if it is not up to date; the tests run this)
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { argsOf, parseMessage } from "../src/i18n/format.ts";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const dir = join(root, "locales", "en");
const out = join(root, "src", "i18n", "messages.gen.ts");

const messages = new Map();
const problems = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort()) {
  const area = file.slice(0, -5);
  if (area === "meta") continue;
  const walk = (key, node) => {
    if (typeof node === "string") messages.set(key, node);
    else if (node && typeof node === "object" && !Array.isArray(node)) for (const [k, v] of Object.entries(node)) walk(`${key}.${k}`, v);
    else problems.push(`${key} is not text (put it in quotes)`);
  };
  walk(area, parse(readFileSync(join(dir, file), "utf8")));
}
if (problems.length) {
  console.error(`locales/en:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

// the values of a message, by the app's own parser of the templates (src/i18n/format.ts, loaded with Node's type stripping)
const typeOf = { text: "string | number", number: "number", plural: "number", select: "string" };
const broken = [];
const argsOfText = (key, text) => {
  try {
    return argsOf(parseMessage(text));
  } catch (err) {
    broken.push(`${key}: ${err.message}`);
    return new Map();
  }
};

const lines = [...messages].map(([key, text]) => {
  const args = argsOfText(key, text);
  const type = args.size ? `{ ${[...args].map(([n, k]) => `${n}: ${typeOf[k]}`).join("; ")} }` : "null";
  return `  ${JSON.stringify(key)}: ${type};`;
});
if (broken.length) {
  console.error(`locales/en: messages that do not parse:\n  ${broken.join("\n  ")}`);
  process.exit(1);
}
const code = `// Written by scripts/i18n-types.mjs from locales/en: do not edit (npm run strings writes it again).
export interface Messages {
${lines.join("\n")}
}
`;

if (process.argv.includes("--check")) {
  const had = existsSync(out) ? readFileSync(out, "utf8").replace(/\r\n/g, "\n") : "";
  if (had !== code) {
    console.error("src/i18n/messages.gen.ts is not up to date with locales/en: run npm run strings");
    process.exit(1);
  }
} else {
  writeFileSync(out, code);
  console.log(`messages.gen.ts: ${messages.size} messages`);
}
