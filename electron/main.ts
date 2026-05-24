import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, clipboard, shell, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { getState, setState, patchState, resetState, initStore, getLoadInfo } from './store';
import { getSecret, setSecret, deleteSecret, hasSecret, listSecretKeys } from './secrets';
import { saveBufferAsAttachment, saveFromPath, readAttachmentBase64, deleteAttachment } from './attachments';
import { complete, embed, vision, listModels, secretKeyForProvider } from './llm/index';
import {
  runRamble,
  runCapture,
  runTag,
  runTasks,
  runExplainBack,
  runCategorize,
  runProjectContext,
  runDailyReport,
  runStalePulse,
  runTemplate,
  runCombineGroups,
  runGenerateAppSkill
} from './llm/skills';
import { runClawDraft } from './llm/skills/clawDraft';
import { finalizeGeneratedAppSkill, runStoredAppSkill } from './appSkills';
import { clawBroker } from './claw/broker';
import * as runners from './runners/registry';
import { ensureDefaultSkills, listSkills, writeSkill, deleteSkill, openSkillsFolder } from './claw/skills';
import { isDangerous } from '../packages/claw/protocol';
import * as sync from './sync/client';
import crypto from 'node:crypto';
import { autoFormatter } from './llm/autoFormat';
import { ensureEmbeddings, semanticSearch, dropEmbeddings } from './llm/embeddings';
import {
  dataFolder,
  getWriteStatus,
  setFsyncMode,
  listBackupInfo,
  revertToBackup,
  revertToSnapshot,
  exportToFile,
  importFromFile,
  setDataFolder,
  clearDataFolderOverride
} from './persistence';

const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:9173';
const IS_DEV = Boolean(process.env.VITE_DEV_SERVER_URL);
const LOST_SESSION_SUMMARY =
  'This code session was interrupted because Braindump closed or restarted before it could finish. Use Continue to resume from the saved context.';

let mainWindow: BrowserWindow | null = null;
let quickWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function resolvePreload() {
  return path.join(__dirname, 'preload.js');
}

function resolveIndex(entry: 'main' | 'quick') {
  if (IS_DEV) {
    return entry === 'quick' ? `${DEV_URL}/quick-capture.html` : DEV_URL;
  }
  const file = entry === 'quick' ? 'quick-capture.html' : 'index.html';
  return `file://${path.join(__dirname, '..', 'dist', file)}`;
}

function trayIconPath(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'build', 'tray.png'),
    path.join(__dirname, '..', 'build', 'tray.png'),
    path.join(__dirname, '..', 'build', 'icon.ico')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return '';
}

function appIconPath(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'build', 'icon.ico'),
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'build', 'tray.png'),
    path.join(__dirname, '..', 'build', 'tray.png'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return '';
}

function createMainWindow() {
  const iconP = appIconPath();
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#0c0e13',
    title: 'Braindump',
    show: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    ...(iconP ? { icon: iconP } : {}),
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.loadURL(resolveIndex('main'));
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (mainWindow) {
      clawBroker.attachWindow(mainWindow);
      runners.attachWindow(mainWindow);
      sync.attachWindow(mainWindow);
      sync.startFlusher();
    }
  });
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  const broadcastMaximize = () => {
    mainWindow?.webContents.send('window:maximized-change', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', broadcastMaximize);
  mainWindow.on('unmaximize', broadcastMaximize);
  autoFormatter.attach(mainWindow);
  autoFormatter.start();
}

function toggleMainWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function openQuickCapture(targetTabId?: string) {
  if (quickWindow) {
    quickWindow.show();
    quickWindow.focus();
    quickWindow.webContents.send('quick-capture:target', { tabId: targetTabId || null });
    return;
  }
  quickWindow = new BrowserWindow({
    width: 520,
    height: 220,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0c0e13',
    show: false,
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  const url = `${resolveIndex('quick')}${targetTabId ? `?tab=${encodeURIComponent(targetTabId)}` : ''}`;
  quickWindow.loadURL(url);
  quickWindow.once('ready-to-show', () => {
    quickWindow?.show();
    quickWindow?.focus();
    quickWindow?.webContents.send('quick-capture:target', { tabId: targetTabId || null });
  });
  quickWindow.on('blur', () => quickWindow?.hide());
  quickWindow.on('closed', () => {
    quickWindow = null;
  });
}

function buildTrayMenu() {
  const state = getState();
  const afLabel = state.autoFormat.enabled ? 'AI: Auto-format ✓' : 'AI: Auto-format';
  return Menu.buildFromTemplate([
    { label: 'Open Braindump', click: () => toggleMainWindow() },
    { label: 'Quick capture…', accelerator: 'CommandOrControl+Alt+N', click: () => openQuickCapture() },
    { label: 'Ramble…', accelerator: 'CommandOrControl+Alt+R', click: () => {
        toggleMainWindow();
        mainWindow?.webContents.send('ui:open-ramble');
      } },
    { label: 'Brainstorm…', accelerator: 'CommandOrControl+Alt+Shift+B', click: () => {
        toggleMainWindow();
        mainWindow?.webContents.send('ui:open-brainstorm');
      } },
    { type: 'separator' },
    {
      label: afLabel,
      type: 'checkbox',
      checked: state.autoFormat.enabled,
      click: () => {
        const s = getState();
        s.autoFormat.enabled = !s.autoFormat.enabled;
        setState(s);
        if (s.autoFormat.enabled) autoFormatter.start();
        else autoFormatter.stop();
        updateTray();
        mainWindow?.webContents.send('state:changed', s);
      }
    },
    {
      label: 'Start on login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked });
      }
    },
    { label: 'Settings…', click: () => {
        toggleMainWindow();
        mainWindow?.webContents.send('ui:open-settings');
      } },
    { type: 'separator' },
    { label: 'Quit Braindump', click: () => {
        isQuitting = true;
        app.quit();
      } }
  ]);
}

function updateTray() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
  const s = getState();
  tray.setToolTip(`Braindump — auto-format ${s.autoFormat.enabled ? 'on' : 'off'}`);
}

function createTray() {
  const p = trayIconPath();
  const icon = p ? nativeImage.createFromPath(p) : nativeImage.createEmpty();
  tray = new Tray(icon.isEmpty() ? nativeImage.createFromDataURL(FALLBACK_TRAY_ICON) : icon);
  tray.setToolTip('Braindump');
  tray.on('click', () => toggleMainWindow());
  updateTray();
}

function registerGlobalShortcuts() {
  globalShortcut.register('CommandOrControl+Alt+B', () => toggleMainWindow());
  globalShortcut.register('CommandOrControl+Alt+N', () => openQuickCapture());
  globalShortcut.register('CommandOrControl+Alt+Shift+N', () => {
    const s = getState();
    openQuickCapture(s.activeTabId);
  });
  globalShortcut.register('CommandOrControl+Alt+R', () => {
    toggleMainWindow();
    mainWindow?.webContents.send('ui:open-ramble');
  });
  globalShortcut.register('CommandOrControl+Alt+Shift+B', () => {
    toggleMainWindow();
    mainWindow?.webContents.send('ui:open-brainstorm');
  });
}

function broadcastState() {
  mainWindow?.webContents.send('state:changed', getState());
  quickWindow?.webContents.send('state:changed', getState());
}

function wireIpc() {
  ipcMain.handle('store:get', () => getState());
  ipcMain.handle('store:set', (_e, next) => {
    setState(next);
    broadcastState();
    updateTray();
  });
  ipcMain.handle('store:patch', (_e, patch) => {
    patchState(patch);
    broadcastState();
    updateTray();
  });
  ipcMain.handle('store:reset', () => {
    resetState();
    broadcastState();
    updateTray();
  });

  ipcMain.handle('window:minimize-to-tray', () => {
    mainWindow?.hide();
  });
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });
  ipcMain.handle('window:maximize-toggle', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('window:close', () => {
    if (!isQuitting) mainWindow?.hide();
  });
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle('window:open-devtools', () => {
    mainWindow?.webContents.openDevTools();
  });
  ipcMain.handle('window:hide-quick', () => {
    quickWindow?.hide();
  });

  ipcMain.handle('secrets:set-key', (_e, { key, value }: { key: string; value: string }) => {
    if (value) setSecret(key, value);
    else deleteSecret(key);
  });
  ipcMain.handle('secrets:has-key', (_e, { key }: { key: string }) => hasSecret(key));
  ipcMain.handle('secrets:list', () => listSecretKeys());

  ipcMain.handle('llm:complete', async (_e, { providerId, messages, jsonMode, feature, temperature, maxTokens, streamId }: {
    providerId: string;
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    jsonMode?: boolean;
    feature: string;
    temperature?: number;
    maxTokens?: number;
    streamId?: string;
  }) => {
    const state = getState();
    const provider = state.providers.find((p) => p.id === providerId) || state.providers.find((p) => p.id === state.activeProviderId);
    if (!provider) throw new Error('No active LLM provider configured');
    const result = await complete(provider, {
      messages,
      feature,
      jsonMode,
      temperature,
      maxTokens,
      onToken: streamId ? (t) => mainWindow?.webContents.send(`llm:stream:${streamId}`, t) : undefined
    });
    const d = new Date().toISOString().slice(0, 10);
    const s = getState();
    s.usage.perDay[d] = s.usage.perDay[d] || { autoFormat: 0, ramble: 0, brainstorm: 0, other: 0, inputTokens: 0, outputTokens: 0 };
    const bucket = (['autoFormat', 'ramble', 'brainstorm'] as const).includes(feature as never) ? feature : 'other';
    (s.usage.perDay[d] as Record<string, number>)[bucket] += 1;
    s.usage.perDay[d].inputTokens += result.inputTokens;
    s.usage.perDay[d].outputTokens += result.outputTokens;
    setState(s);
    if (streamId) mainWindow?.webContents.send(`llm:stream-end:${streamId}`, result);
    return result;
  });

  ipcMain.handle('llm:embed', async (_e, { providerId, texts }: { providerId?: string; texts: string[] }) => {
    const state = getState();
    const id = providerId || state.featureProviderOverrides.embeddings || state.activeProviderId;
    const provider = state.providers.find((p) => p.id === id);
    if (!provider) throw new Error('No provider configured for embeddings');
    return embed(provider, { texts });
  });

  ipcMain.handle('llm:vision', async (_e, { providerId, imagePath, imageBase64, prompt }: { providerId?: string; imagePath: string; imageBase64?: string; prompt: string }) => {
    const state = getState();
    const id = providerId || state.activeProviderId;
    const provider = state.providers.find((p) => p.id === id);
    if (!provider) throw new Error('No provider configured for vision');
    return vision(provider, { imagePath, imageBase64, prompt });
  });

  ipcMain.handle('llm:list-models', async (_e, { providerId }: { providerId: string }) => {
    const state = getState();
    const provider = state.providers.find((p) => p.id === providerId);
    if (!provider) return [];
    return listModels(provider);
  });

  ipcMain.handle('llm:test-connection', async (_e, { providerId }: { providerId: string }) => {
    const state = getState();
    const provider = state.providers.find((p) => p.id === providerId);
    if (!provider) throw new Error('Unknown provider');
    const t0 = Date.now();
    const r = await complete(provider, {
      messages: [
        { role: 'system', content: 'Reply with the single word OK.' },
        { role: 'user', content: 'ping' }
      ],
      feature: 'test',
      maxTokens: 8
    });
    return { ok: true, latencyMs: Date.now() - t0, text: r.text, model: provider.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
  });

  ipcMain.handle('llm:provider-secret-keyname', (_e, { providerId }: { providerId: string }) => secretKeyForProvider(providerId as never));

  ipcMain.handle('llm:skill-log', (_e, { feature, limit = 20 }: { feature?: string; limit?: number }) => {
    const logPath = path.join(app.getPath('userData'), 'llm-log.jsonl');
    if (!fs.existsSync(logPath)) return [];
    const lines = fs.readFileSync(logPath, 'utf8').trimEnd().split('\n').filter(Boolean);
    const parsed = lines.flatMap((l) => {
      try { return [JSON.parse(l) as Record<string, unknown>]; } catch { return []; }
    });
    const filtered = feature ? parsed.filter((e) => e.feature === feature) : parsed;
    return filtered.slice(-limit).reverse();
  });

  ipcMain.handle('autoformat:toggle', (_e, enabled?: boolean) => {
    const s = getState();
    s.autoFormat.enabled = typeof enabled === 'boolean' ? enabled : !s.autoFormat.enabled;
    setState(s);
    if (s.autoFormat.enabled) autoFormatter.start();
    else autoFormatter.stop();
    updateTray();
    return s.autoFormat.enabled;
  });
  ipcMain.handle('autoformat:status', () => autoFormatter.getStatus());
  ipcMain.handle('autoformat:tick', () => autoFormatter.tick());
  ipcMain.handle('autoformat:format-group', (_e, { tabId, groupId }: { tabId: string; groupId: string }) =>
    autoFormatter.formatGroup(tabId, groupId)
  );

  ipcMain.handle('attachments:save-clipboard', () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) throw new Error('No image on clipboard');
    return saveBufferAsAttachment(img.toPNG());
  });
  ipcMain.handle('attachments:save-base64', (_e, { dataUrl }: { dataUrl: string }) => {
    const m = /^data:[^;]+;base64,(.*)$/.exec(dataUrl);
    if (!m) throw new Error('Not a data URL');
    return saveBufferAsAttachment(Buffer.from(m[1], 'base64'));
  });
  ipcMain.handle('attachments:save-path', (_e, { path: p }: { path: string }) => saveFromPath(p));
  ipcMain.handle('attachments:read', (_e, { rel }: { rel: string }) => readAttachmentBase64(rel));
  ipcMain.handle('attachments:delete', (_e, { rel }: { rel: string }) => deleteAttachment(rel));

  ipcMain.handle('embeddings:ensure', async (_e, { items, providerId }: { items: { id: string; text: string; hash: string }[]; providerId?: string }) => {
    const state = getState();
    const id = providerId || state.featureProviderOverrides.embeddings || state.activeProviderId;
    const provider = state.providers.find((p) => p.id === id);
    if (!provider) throw new Error('No provider configured for embeddings');
    await ensureEmbeddings(provider, items);
  });
  ipcMain.handle('embeddings:search', async (_e, { query, candidates, providerId }: { query: string; candidates: { id: string; hash: string }[]; providerId?: string }) => {
    const state = getState();
    const id = providerId || state.featureProviderOverrides.embeddings || state.activeProviderId;
    const provider = state.providers.find((p) => p.id === id);
    if (!provider) throw new Error('No provider configured for embeddings');
    return semanticSearch(provider, query, candidates);
  });
  ipcMain.handle('embeddings:drop', (_e, { ids }: { ids: string[] }) => dropEmbeddings(ids));

  ipcMain.handle('app:set-login-item', (_e, { open }: { open: boolean }) => {
    app.setLoginItemSettings({ openAtLogin: open });
  });
  ipcMain.handle('app:get-login-item', () => app.getLoginItemSettings().openAtLogin);

  ipcMain.handle('dialog:open-file', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] });
    return r.filePaths[0] || null;
  });

  ipcMain.handle('dialog:open-folder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return r.filePaths[0] || null;
  });

  ipcMain.handle('shell:open-external', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });

  ipcMain.handle('app:open-llm-log', async () => {
    const p = path.join(app.getPath('userData'), 'llm-log.jsonl');
    return shell.openPath(p);
  });

  ipcMain.handle('capture:submit', (_e, { tabId, text }: { tabId: string | null; text: string }) => {
    mainWindow?.webContents.send('capture:submit', { tabId, text });
  });

  ipcMain.handle('skill:ramble', async (_e, args: { monologue: string; projectContext?: string }) => {
    return runRamble(args);
  });
  ipcMain.handle('skill:capture', async (_e, args: { transcript: string; projectContext?: string }) => {
    return runCapture(args);
  });
  ipcMain.handle('skill:tag', async (_e, args: { lines: string[] }) => runTag(args.lines));
  ipcMain.handle('skill:tasks', async (_e, args: { lines: string[] }) => runTasks(args.lines));
  ipcMain.handle('skill:explain-back', async (_e, args: { lines: string[] }) => runExplainBack(args.lines));
  ipcMain.handle(
    'skill:categorize',
    async (
      _e,
      args: {
        lines: string[];
        categories: { id: string; label: string }[];
        tabs: { id: string; name: string; projectContext?: string; aliases?: string[] }[];
        currentTabId: string;
      }
    ) => runCategorize(args)
  );
  ipcMain.handle('skill:project-context', async (_e, args: { tabName: string; recentLines: string[] }) => runProjectContext(args));
  ipcMain.handle('skill:daily-report', async (_e, args) => runDailyReport(args));
  ipcMain.handle('skill:stale-pulse', async (_e, args) => runStalePulse(args));
  ipcMain.handle('skill:template', async (_e, args: { id: 'meeting' | 'decision' | 'postmortem' }) => runTemplate(args.id));
  ipcMain.handle('skill:combine-groups', async (_e, args: { groups: { lines: string[] }[]; projectContext?: string; mode?: 'faithful' | 'rewrite' }) => runCombineGroups(args));
  ipcMain.handle('app-skills:generate', async (_e, args: { request: string; tabId?: string }) => {
    const request = args.request?.trim();
    if (!request) return { ok: false, error: 'Request cannot be empty.' };
    try {
      const state = getState();
      const tab = state.tabs.find((entry) => entry.id === args.tabId);
      const generated = await runGenerateAppSkill({
        request,
        activeTabName: tab?.name,
        projectContext: tab?.projectContext,
        defaultBackend: state.claw?.defaultBackend,
        availableBackends: clawBroker.getState().backends
      });
      if (!generated.ok || !generated.value) {
        return { ok: false, error: generated.error ?? 'Unable to generate skill config.' };
      }
      const now = Date.now();
      const skill = finalizeGeneratedAppSkill({
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        title: generated.value.title,
        description: generated.value.description,
        request,
        executor: generated.value.executor
      });
      return {
        ok: true,
        skill,
        model: generated.model,
        latencyMs: generated.latencyMs,
        raw: generated.raw
      };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });
  ipcMain.handle(
    'app-skills:run',
    async (
      _e,
      args: {
        skillId: string;
        tabId: string;
        sessionId?: string;
        groupId?: string;
        skill?: import('../src/types').AppSkill;
      }
    ) => {
      return runStoredAppSkill({
        skillId: args.skillId,
        sessionId: args.sessionId ?? crypto.randomUUID(),
        tabId: args.tabId,
        groupId: args.groupId,
        skill: args.skill
      });
    }
  );

  ipcMain.handle('persistence:status', () => ({
    loadInfo: getLoadInfo(),
    writeStatus: getWriteStatus(),
    dataFolder: dataFolder(),
    backups: listBackupInfo()
  }));
  ipcMain.handle('persistence:set-fsync', (_e, { on }: { on: boolean }) => {
    setFsyncMode(on);
  });
  ipcMain.handle('persistence:open-folder', () => {
    void shell.openPath(dataFolder());
    return dataFolder();
  });
  ipcMain.handle('persistence:pick-folder', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Choose a new data folder',
      properties: ['openDirectory', 'createDirectory']
    });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    return { canceled: false, path: r.filePaths[0] };
  });
  ipcMain.handle('persistence:set-folder', async (_e, args: { path: string; force?: boolean }) => {
    const result = await setDataFolder(args.path, { force: args.force });
    if (result.ok) broadcastState();
    return result;
  });
  ipcMain.handle('persistence:reset-folder', () => {
    clearDataFolderOverride();
    return { ok: true, dataFolder: dataFolder() };
  });
  ipcMain.handle('persistence:export', async () => {
    const r = await dialog.showSaveDialog({
      title: 'Export Braindump data',
      defaultPath: `braindump-export-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Braindump JSON', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    exportToFile(r.filePath, getState());
    return { canceled: false, path: r.filePath };
  });
  ipcMain.handle('persistence:import', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Import Braindump data',
      properties: ['openFile'],
      filters: [{ name: 'Braindump JSON', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    const parsed = importFromFile(r.filePaths[0]);
    if (!parsed) return { canceled: false, ok: false, error: 'File is not a valid Braindump export' };
    setState(parsed);
    broadcastState();
    updateTray();
    return { canceled: false, ok: true };
  });
  ipcMain.handle('persistence:revert-backup', (_e, { index }: { index: number }) => {
    const s = revertToBackup(index);
    if (s) {
      setState(s);
      broadcastState();
      updateTray();
      return { ok: true };
    }
    return { ok: false };
  });
  ipcMain.handle('persistence:revert-snapshot', () => {
    const s = revertToSnapshot();
    if (s) {
      setState(s);
      broadcastState();
      updateTray();
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle('claw:start', () => {
    clawBroker.start();
    return clawBroker.getState();
  });
  ipcMain.handle('claw:stop', () => {
    clawBroker.stop();
    return clawBroker.getState();
  });
  ipcMain.handle('claw:restart', () => {
    clawBroker.restart();
    return clawBroker.getState();
  });
  ipcMain.handle('claw:state', () => clawBroker.getState());
  ipcMain.handle(
    'claw:start-session',
    (_e, args: { sessionId?: string; tabId?: string; groupId?: string; backend: string; cwd: string; skills: string[]; system?: string }) => {
      const id = args.sessionId ?? crypto.randomUUID();
      const cwd = args.cwd && fs.existsSync(args.cwd) ? args.cwd : process.cwd();
      clawBroker.startSession(id, args.backend, cwd, args.skills, args.system, { tabId: args.tabId, groupId: args.groupId });
      return { sessionId: id };
    }
  );
  ipcMain.handle('claw:message', (_e, args: { sessionId: string; content: string }) => {
    clawBroker.message(args.sessionId, args.content);
  });
  ipcMain.handle('claw:reply', (_e, args: { sessionId: string; promptId: string; text: string }) => {
    clawBroker.reply(args.sessionId, args.promptId, args.text);
  });
  ipcMain.handle('claw:interrupt', (_e, args: { sessionId: string }) => {
    clawBroker.send({ seq: Date.now(), type: 'interrupt', sessionId: args.sessionId });
  });
  ipcMain.handle('claw:end-session', (_e, args: { sessionId: string }) => {
    clawBroker.endSession(args.sessionId);
  });
  ipcMain.handle('claw:interrupt-all', () => {
    clawBroker.interruptAll();
  });
  ipcMain.handle('claw:recover-sessions', () => clawBroker.recoverSessions());
  ipcMain.handle('runner:list', () => runners.listRunners());
  ipcMain.handle('runner:recover-sessions', () => runners.recoverRunnerSessions());
  ipcMain.handle(
    'runner:run',
    (
      _e,
      args: {
        runnerId: 'claude-cli' | 'copilot-cli';
        tabId: string;
        groupId: string;
        prompt: string;
        cwd?: string;
        complexity?: 'simple' | 'complex' | 'crazy';
        complexitySource?: 'manual' | 'automatic';
        system?: string;
      }
    ) => runners.runRunner(args)
  );
  ipcMain.handle('runner:interrupt', (_e, args: { sessionId: string }) => ({ ok: runners.interruptRunner(args.sessionId) }));
  ipcMain.handle('runner:interrupt-all', () => {
    runners.interruptAllRunners();
  });
  ipcMain.handle('runner:show-logs', (_e, args: { runnerId: string }) => {
    const logPath = path.join(app.getPath('userData'), `runner-${args.runnerId}.log`);
    void shell.openPath(logPath);
    return { path: logPath };
  });
  ipcMain.handle('claw:is-dangerous', (_e, args: { text: string }) => ({ dangerous: isDangerous(args.text) }));
  ipcMain.handle('skill:claw-draft', async (_e, args: {
    groupLines: string[];
    tabName: string;
    projectContext?: string;
    appSkills: string[];
    priorHistory?: string[];
  }) => runClawDraft(args));
  ipcMain.handle('claw:show-logs', () => {
    const logPath = path.join(app.getPath('userData'), 'claw.log');
    void shell.openPath(logPath);
    return { path: logPath };
  });
  ipcMain.handle('claw-skills:list', () => {
    ensureDefaultSkills();
    return listSkills();
  });
  ipcMain.handle('claw-skills:write', (_e, args: { name: string; content: string }) => {
    writeSkill(args.name, args.content);
    return listSkills();
  });
  ipcMain.handle('claw-skills:delete', (_e, args: { name: string }) => {
    deleteSkill(args.name);
    return listSkills();
  });
  ipcMain.handle('claw-skills:open-folder', () => openSkillsFolder());

  ipcMain.handle('sync:status', () => sync.currentStatus());
  ipcMain.handle('sync:settings', () => ({ ...sync.currentSettings(), hasToken: sync.currentStatus().configured }));
  ipcMain.handle(
    'sync:signin',
    async (_e, args: { serverUrl: string; email: string; password: string; deviceName: string }) => {
      try {
        await sync.signIn(args);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err).slice(0, 200) };
      }
    }
  );
  ipcMain.handle('sync:signout', () => {
    sync.signOut();
    return { ok: true };
  });
  ipcMain.handle('sync:enqueue', (_e, args: { kind: string; payload: unknown }) => {
    sync.enqueue(args.kind, args.payload);
  });
  ipcMain.handle('sync:reset-and-repull', async () => {
    await sync.resetAndRepull();
    return { ok: true };
  });
}

function reconcileInterruptedJobsOnLaunch() {
  const state = getState();
  const jobs = state.clawJobs ?? [];
  const now = Date.now();
  let changed = false;
  for (const job of jobs) {
    if (job.state !== 'running' && job.state !== 'waiting-input') continue;
    job.state = 'interrupted';
    job.endedAt = job.endedAt ?? now;
    job.summary = job.summary?.trim() ? job.summary : LOST_SESSION_SUMMARY;
    const alreadyLogged = job.events.some(
      (event) =>
        event.kind === 'log' &&
        event.level === 'warn' &&
        event.text === LOST_SESSION_SUMMARY
    );
    if (!alreadyLogged) {
      job.events.push({
        at: now,
        kind: 'log',
        level: 'warn',
        text: LOST_SESSION_SUMMARY
      });
    }
    changed = true;
  }
  if (changed) {
    setState(state);
  }
}

app.whenReady().then(() => {
  const load = initStore();
  reconcileInterruptedJobsOnLaunch();
  ensureDefaultSkills();
  createMainWindow();
  createTray();
  registerGlobalShortcuts();
  wireIpc();
  if (load.recovered) {
    setTimeout(() => {
      mainWindow?.webContents.send('persistence:recovered', {
        source: load.source,
        backupIndex: load.backupIndex ?? null
      });
    }, 1500);
  }
});

app.on('window-all-closed', () => {
  // keep running in tray on all platforms
});
app.on('before-quit', () => {
  isQuitting = true;
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

const FALLBACK_TRAY_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAK0lEQVQ4jWNgGAVDATC+evXqPwMDAwMTAwMDw38GBgYGJgYGBgYGBgYGBgYAALtcB/5G7U2BAAAAAElFTkSuQmCC';
