import { useEffect, useState } from 'react';
import { Cloud, CloudOff, LogOut, RefreshCcw } from 'lucide-react';

type Settings = { serverUrl: string; deviceId?: string; signedInEmail?: string; hasToken: boolean };
type Status = {
  configured: boolean;
  online: boolean;
  lastPush?: number;
  lastPull?: number;
  outboxDepth: number;
  error?: string;
};

export function SyncSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [serverUrl, setServerUrl] = useState('http://localhost:3001');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void window.braindump.sync.settings().then((s) => {
      setSettings(s);
      setServerUrl(s.serverUrl);
      if (s.signedInEmail) setEmail(s.signedInEmail);
    });
    void window.braindump.sync.status().then(setStatus);
    const unsub = window.braindump.sync.onStatus(setStatus);
    return () => unsub();
  }, []);

  async function signIn() {
    setBusy(true);
    setErr(null);
    try {
      const res = await window.braindump.sync.signIn({
        serverUrl: serverUrl.trim(),
        email: email.trim(),
        password,
        deviceName: deviceName.trim() || 'desktop'
      });
      if (!res.ok) {
        setErr(res.error ?? 'sign-in failed');
        return;
      }
      setPassword('');
      const s = await window.braindump.sync.settings();
      setSettings(s);
      const st = await window.braindump.sync.status();
      setStatus(st);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await window.braindump.sync.signOut();
    const s = await window.braindump.sync.settings();
    setSettings(s);
    const st = await window.braindump.sync.status();
    setStatus(st);
  }

  async function resetRepull() {
    await window.braindump.sync.resetAndRepull();
  }

  const configured = settings?.hasToken ?? false;

  return (
    <div className="space-y-5 max-w-2xl">
      {configured ? (
        <div className="p-3 bg-surface-2 border border-hairline rounded space-y-2">
          <div className="flex items-center gap-2">
            {status?.online ? (
              <Cloud size={14} className="text-success" />
            ) : (
              <CloudOff size={14} className="text-warning" />
            )}
            <div className="text-sm text-fg-0">
              Signed in as <span className="text-fg-0">{settings?.signedInEmail}</span>
            </div>
          </div>
          <div className="text-[11px] text-fg-3">
            Server: <span className="mono">{settings?.serverUrl}</span>
            {settings?.deviceId && <> · device: <span className="mono">{settings.deviceId}</span></>}
          </div>
          <div className="text-[11px] text-fg-3">
            outbox: {status?.outboxDepth ?? 0} · last push: {status?.lastPush ? new Date(status.lastPush).toLocaleTimeString() : 'never'} · last pull:{' '}
            {status?.lastPull ? new Date(status.lastPull).toLocaleTimeString() : 'never'}
          </div>
          {status?.error && <div className="text-[11px] text-danger">{status.error}</div>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void resetRepull()}
              className="inline-flex items-center gap-1 px-2 py-1 text-[12px] rounded bg-surface-3 hover:bg-surface-4 text-fg-1"
            >
              <RefreshCcw size={12} /> reset & repull
            </button>
            <button
              onClick={() => void signOut()}
              className="inline-flex items-center gap-1 px-2 py-1 text-[12px] rounded bg-surface-3 hover:bg-surface-4 text-danger"
            >
              <LogOut size={12} /> sign out
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-fg-3">Server URL</label>
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="w-full bg-surface-2 border border-hairline rounded px-3 py-2 text-fg-0 mono text-[12px]"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-fg-3">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="w-full bg-surface-2 border border-hairline rounded px-3 py-2 text-fg-0"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-fg-3">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="w-full bg-surface-2 border border-hairline rounded px-3 py-2 text-fg-0"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-fg-3">Device name</label>
            <input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="desktop"
              className="w-full bg-surface-2 border border-hairline rounded px-3 py-2 text-fg-0"
            />
          </div>
          {err && <div className="text-[11px] text-danger">{err}</div>}
          <button
            onClick={() => void signIn()}
            disabled={busy || !email || !password}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-accent-500 hover:bg-accent-600 text-white text-sm disabled:opacity-40"
          >
            Sign in & register device
          </button>
          <div className="text-[11px] text-fg-3">
            Before sign-in, Braindump works entirely locally. Sign-in binds this device to your server so ops sync via the outbox.
          </div>
        </div>
      )}
    </div>
  );
}
