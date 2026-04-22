# Braindump

A Windows-first rapid-fire notes app optimized for getting thoughts out of your head. Dump ideas as plaintext, let the app group them, check them off, and move them out of sight. Backed by an Electron + React + TypeScript stack with optional LLM super-powers (auto-format, Ramble, Brainstorm, vision).

## What it is

- Tabs of note groups. Write, commit with `Ctrl+Enter`. Blank lines split paste-dumps into separate groups.
- Hover a group to append to it; click to lock it as the target. `Esc` clears the target.
- Pin groups to a rail at the top so they never auto-archive.
- Check off groups to slide them into the Archive drawer. `Ctrl+Z` within a few seconds to restore.
- Lives in the system tray. Global hotkeys open the main window, a quick-capture popup, Ramble, or Brainstorm from anywhere.
- Full search (`Ctrl+F`); Shift+Enter runs semantic search over embeddings if your LLM provider supports them.

## LLM features (all optional — the app works without a provider)

- **Auto-format**: a quiet background job uses your LLM to tidy up unformatted note segments. Each line is hashed so the same text is never re-formatted twice. Every change is recorded in the group's revision history and is always revertable. Tune aggressiveness (`tidy`/`restructure`/`rewrite`), rate limit, confidence threshold, daily cap, and per-tab exclusions in Settings. Toggle on/off from the tray menu, status bar, or `Ctrl+Shift+F`.
- **Ramble** (`Ctrl+Shift+R`, also global `Ctrl+Alt+R`): speak or type a monologue; the LLM converts it to a stepped atomic-line braindump, preserving intent. The original monologue lives in the group's history, always revertable.
- **Brainstorm** (`Ctrl+Shift+B`, also global `Ctrl+Alt+Shift+B`): a side-panel chat whose sole purpose is to converge on a clean braindump. Click "Capture" to turn the whole conversation into a structured group on the board.
- **Images**: paste (`Ctrl+V`) or drag-drop any image. Stored under `userData/attachments/<sha1>.<ext>`. Click the scan icon on a thumbnail for OCR + a 1-line caption via a vision-capable provider.
- **Bonus**: hashtag extraction, template scaffolds (`/meeting`, `/decision`, `/postmortem`), explain-back, task extraction to a dedicated `Tasks` tab.

### Configurable providers

In Settings → LLM, configure one or more of:

- **OpenAI** (also works against any OpenAI-compatible base URL: Azure OpenAI, OpenRouter, Groq, vLLM, etc.)
- **Anthropic**
- **Google Gemini**
- **Ollama** (local)

Per-feature provider overrides let you route a cheap model for auto-format and a strong model for brainstorming. API keys are encrypted via Electron's `safeStorage` (OS keychain on Windows) and never leave the main process.

## Running in dev

```
npm install
npm run dev
```

Launches Electron against a Vite dev server with HMR.

## Building a Windows installer

On a Windows machine (or CI):

```
npm install
npm run build:win
```

Produces an NSIS installer and a portable `.exe` under `release/`. Tray icon falls back to a small built-in placeholder; drop a real `build/icon.ico` (and optional `build/tray.png`) to brand it.

## Shortcuts

See Settings → Shortcuts for the full list. Highlights:

- `Ctrl+Enter` commit, `Ctrl+Shift+Enter` commit pinned
- `Ctrl+1…9` switch tabs, `Ctrl+T` new, `Ctrl+W` close, `Ctrl+Tab` cycle
- `Ctrl+F` search (Shift+Enter for semantic)
- `Ctrl+Z` undo last archive, `Ctrl+Shift+Z` revert last auto-format edit on focused group
- `Ctrl+Shift+R` Ramble, `Ctrl+Shift+B` Brainstorm, `Ctrl+Shift+F` toggle auto-format
- `F11` focus mode
- Global: `Ctrl+Alt+B` show/hide, `Ctrl+Alt+N` quick capture

## Data

- Notes: `%APPDATA%/Braindump/braindump.json`
- Attachments: `%APPDATA%/Braindump/attachments/`
- Secrets (encrypted): `%APPDATA%/Braindump/braindump.secrets.enc`
- Embeddings cache: `%APPDATA%/Braindump/braindump.embeddings.json`

Delete the folder to reset everything.
