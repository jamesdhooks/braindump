# Braindump

A Windows-first, rapid-fire notes app for getting thoughts out of your head and out of your way.

Braindump is a tray-resident Electron app that rewards raw throughput. Type in plain text, let the app group things, check them off when they're done, and move on. A quiet background pass can tidy formatting, turn a voice monologue into a stepped list, or convert a chat into a clean brain dump — always saving the original so nothing is lost.

- **Local-first** — everything lives on your machine, in plain JSON, unless you explicitly wire up sync.
- **LLM-optional** — the core app works with zero API keys. Every intelligent feature degrades gracefully.
- **Keyboard-first** — global tray hotkeys + in-window shortcuts for everything that matters.
- **Minimal** — no kanban, no deadlines, no project-management chrome. Just dump.

![Braindump overview](docs/screenshots/overview.png)

> _Screenshots below are captured from a dev build — see `scripts/capture-screens.ts`._

## Why

Most notes apps punish a flood of messy thoughts with structure up front. Braindump inverts that: the cost of capture is zero, and the cost of cleanup is also zero (the app takes a pass for you). What remains is a small, living surface of what you're actually thinking about, and an archive you rarely need to revisit.

## Features

<table>
  <tr>
    <td width="33%">
      <strong>Tabs & groups</strong><br/>
      <code>Ctrl+1…9</code> · blank-line grouping · pin rail · archive with undo.
    </td>
    <td width="33%">
      <strong>Hover targeting</strong><br/>
      Hover or click a group; your next commit appends to it.
    </td>
    <td width="33%">
      <strong>Auto-format</strong><br/>
      Background LLM pass with per-line hashing · full revision history · revertable.
    </td>
  </tr>
  <tr>
    <td>
      <strong>Ramble</strong><br/>
      Speak/type a monologue; get back a stepped brain dump. Original kept in history.
    </td>
    <td>
      <strong>Brainstorm</strong><br/>
      Streaming side-panel chat → "Capture to board" produces a clean group.
    </td>
    <td>
      <strong>Images</strong><br/>
      Paste or drop. Optional OCR + caption via a vision provider.
    </td>
  </tr>
  <tr>
    <td>
      <strong>Tray & global hotkeys</strong><br/>
      <code>Ctrl+Alt+B</code> show · <code>Ctrl+Alt+N</code> quick capture · <code>Ctrl+Alt+R</code> Ramble.
    </td>
    <td>
      <strong>Search</strong><br/>
      Substring and (optionally) semantic via embeddings; OCR text is searchable too.
    </td>
    <td>
      <strong>Themes + motion</strong><br/>
      Dark · light · auto (follows OS). Motion presets: calm · floaty · reduced.
    </td>
  </tr>
</table>

### LLM providers

In Settings → LLM, configure any mix of:

- **OpenAI** (and any OpenAI-compatible base URL — Azure OpenAI, OpenRouter, Groq, vLLM…)
- **Anthropic**
- **Google Gemini**
- **Ollama** (local)

Per-feature provider overrides let you route a cheap model at auto-format and a strong model at brainstorming. API keys are encrypted via Electron's `safeStorage` (OS keychain on Windows) and never leave the main process.

Every skill validates its output against a Zod schema, retries once on malformed JSON, and logs to `llm-log.jsonl` so you can audit every call.

## Running in development

```bash
npm install
npm run dev
```

Launches the Electron app against a Vite HMR server. First run seeds the default tabs and provider list; nothing is sent anywhere until you configure a provider.

## Building a Windows installer

On a Windows machine (or CI):

```bash
npm install
npm run build:win
```

Produces an NSIS installer and a portable `.exe` under `release/`. Drop a real `build/icon.ico` (and optional `build/tray.png`) to brand the build.

## Shortcuts

Everything important is discoverable from Settings → Shortcuts. Highlights:

| Shortcut | Action |
| --- | --- |
| `Ctrl+Enter` | Commit composer as group(s) |
| `Ctrl+Shift+Enter` | Commit as pinned |
| `Ctrl+1 … Ctrl+9` | Switch tab |
| `Ctrl+T / Ctrl+W` | New / close tab |
| `Ctrl+F` | Search (Shift+Enter for semantic) |
| `Ctrl+Z` | Undo last archive |
| `Ctrl+Shift+Z` | Revert last auto-format edit on focused group |
| `Ctrl+Shift+R` | Open Ramble |
| `Ctrl+Shift+B` | Toggle Brainstorm |
| `Ctrl+Shift+F` | Toggle auto-format |
| `Ctrl+Shift+M` | Cycle motion preset (calm → floaty → reduced) |
| `F11` | Focus mode |
| `Ctrl+Alt+B` | (global) Show/hide Braindump |
| `Ctrl+Alt+N` | (global) Quick-capture popup |

## Data on disk

- Notes — `%APPDATA%/Braindump/braindump.json` (atomic writes, 3 rolling backups in `braindump.json.bak.0..2`)
- Boot snapshot — `braindump.snapshot.json`
- Attachments — `%APPDATA%/Braindump/attachments/`
- Secrets (encrypted) — `braindump.secrets.enc`
- Embeddings cache — `braindump.embeddings.json`
- LLM audit log — `llm-log.jsonl`

Settings → Privacy & cost includes export/import, open-data-folder, and revert-to-backup buttons.

## Architecture

```
electron/         # main process: tray, IPC, persistence, LLM broker, skill runner
  llm/
    skills/       # Zod-validated skill modules (format, ramble, categorize, …)
    openai/anthropic/gemini/ollama.ts
    embeddings.ts
    autoFormat.ts # background queue with per-line hashing + rate limit
  persistence.ts  # atomic write + rolling backups + snapshot recovery
  migrations.ts
src/              # React renderer
  theme/tokens.css
  motion/         # framer-motion presets: calm / floaty / reduced
  store/          # zustand + immer; persists via IPC
  components/     # Composer, NoteGroup, TabBar, Archive, Settings, Ramble, Brainstorm, …
  hooks/
```

## Contributing

See `CONTRIBUTING.md` for the short version. TL;DR: `npm run dev`, add a skill under `electron/llm/skills/`, and wire its IPC in `electron/main.ts` + `electron/preload.ts`. There are no framework layers to memorize.

## License

MIT. See `LICENSE`.

---

<sub>Made with <a href="https://claude.com">Claude</a>. Large portions of this codebase were drafted with Claude Code; everything is reviewed and maintained by humans. We flag "made with Claude" because Anthropic's guidelines recommend transparent attribution when AI meaningfully contributed to the work.</sub>
