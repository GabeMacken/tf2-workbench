# Interface text

The interface's text lives in language files, not in the code: `locales/<code>/<area>.yaml`, one folder per language and one file per
area of the app. The code shows a message by its key, `tr("promos.board.camera.header")`: the area (the file's name), then the path in
the file.

So far the promo board (`promos.yaml`) and the Language section of Settings (`settings.yaml`) are in the files; the rest of the app is
still written in the code and moves over an area at a time.

## Changing the text without building the app

The app reads the files when it starts, and again when asked:

- A development build reads the repo's `locales` folder; the portable build reads `languages` beside the exe (`build.bat` copies
  `locales` there on every build, so an edit made there is overwritten by the next build: copy it back to `locales`).
- **Settings > Language > Reload** reads the files again and writes the open interface again in the new text. Turn on **Reload when the
  files change** to have this happen a moment after each save.
- **Show message keys** shows every text as its key, to find which message to edit.
- The report under them lists messages that are missing (shown in English), keys the app does not use (a typo, or a renamed key) and
  messages that could not be used (with why).

English is also built into the app: it is what any message missing from a language falls back to, and what is shown with no languages
folder at all. A text edited in the files wins over the built-in one; a message that does not parse, or that asks for a value the
English one does not give, falls back to the built-in English and is listed in the report.

## The files

```yaml
# locales/en/promos.yaml
board:
  camera:
    header: Camera
    fitFraming:
      label: Fit framing
      title: Frames the subject again as it is seen now…
  status:
    retakeFailed: "Could not take it again: {error}"
```

Leaves are messages; the parts of one control end in `label`, `title` (its tooltip), `hint`, `placeholder` or `aria` (what a screen
reader says). Text shared by many controls of an area goes under its `common`. YAML reads some text as other things: put a message in
quotes when it has a colon followed by a space, starts with a special character, or is `true`, `false`, a number or empty.

Messages are templates (a subset of ICU MessageFormat, which translation tools read):

| Template | Gives |
|---|---|
| `{name}` | the value |
| `{count, number}` | a number, written for the language (1,000) |
| `{count, plural, =0 {no shots} one {# shot} other {# shots}}` | by the language's plural rules; `#` is the number |
| `{team, select, red {RED} blu {BLU} other {either}}` | by the value |
| `'{'` and `''` | a brace, an apostrophe (any other apostrophe is just one) |

A message is written whole, with its values in it, never put together from pieces in the code, so a language can order its words its own
way.

## A new language

Copy `locales/en` to a folder of its own code (`de`, `pt-BR`), set its `name` and `locale` in `meta.yaml`, and translate. It shows in
Settings > Language. What it does not have yet is shown in English.

## In the code

- `src/i18n/strings.ts`: `tr` (a message; checked when the app is built), `trHtml` (escaped, for `innerHTML` templates: a message is
  never put into markup as it is), `trDynamic` (a key made at runtime, not checked), and the live rewrite of the open interface.
- `src/i18n/format.ts`: the templates. `src/i18n/load.ts`: the built-in English, loading, reloading and watching the files.
  `src-tauri/src/languages.rs`: finds and reads the folder.
- `src/i18n/messages.gen.ts` is written from the English files by `npm run strings` (and before every `dev` and `build`): every key and
  the values its message takes, so a key that does not exist, or a missing value, does not build. A new message needs it written again.
- The tests check that the English files parse, that every English message is used somewhere, that no message goes into markup
  unescaped, and that `messages.gen.ts` is up to date.
- A picture's kind on the promo board ("Thumbnail", "Page 2") is still English: it is saved with the board and the code compares it, so
  it needs an id of its own before its label can move to the files.
