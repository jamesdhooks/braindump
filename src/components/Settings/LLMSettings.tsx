import { useEffect, useState } from 'react';
import { Check, Loader2, Plug } from 'lucide-react';
import { useStore } from '../../store';
import type { LLMProviderId } from '../../types';

type TestResult = { ok: boolean; latencyMs: number; text: string; model: string; inputTokens: number; outputTokens: number };

export function LLMSettings() {
  const providers = useStore((s) => s.providers);
  const activeProviderId = useStore((s) => s.activeProviderId);
  const setActive = useStore((s) => s.setActiveProvider);
  const updateProvider = useStore((s) => s.updateProvider);
  const overrides = useStore((s) => s.featureProviderOverrides);
  const setFeatureOverride = useStore((s) => s.setFeatureOverride);
  const showToast = useStore((s) => s.showToast);

  const [selectedId, setSelectedId] = useState<LLMProviderId>(activeProviderId);
  const provider = providers.find((p) => p.id === selectedId) ?? providers[0];

  const [apiKey, setApiKey] = useState('');
  const [keyPresent, setKeyPresent] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [modelsList, setModelsList] = useState<string[]>([]);

  useEffect(() => {
    setApiKey('');
    setTestResult(null);
    (async () => {
      const keyName = await window.braindump.llm.providerSecretKeyName(selectedId);
      setKeyPresent(await window.braindump.secrets.hasKey(keyName));
      try {
        const ml = await window.braindump.llm.listModels(selectedId);
        setModelsList(ml);
      } catch {
        setModelsList([]);
      }
    })();
  }, [selectedId]);

  async function saveKey() {
    const keyName = await window.braindump.llm.providerSecretKeyName(selectedId);
    await window.braindump.secrets.setKey(keyName, apiKey);
    setKeyPresent(Boolean(apiKey));
    setApiKey('');
    showToast({ message: `${provider.label} API key saved`, kind: 'success' });
  }

  async function clearKey() {
    const keyName = await window.braindump.llm.providerSecretKeyName(selectedId);
    await window.braindump.secrets.setKey(keyName, '');
    setKeyPresent(false);
    showToast({ message: `${provider.label} API key cleared`, kind: 'info' });
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await window.braindump.llm.testConnection(selectedId);
      setTestResult(r);
    } catch (e: unknown) {
      setTestResult({ ok: false, latencyMs: 0, text: String(e).slice(0, 200), model: '', inputTokens: 0, outputTokens: 0 });
    } finally {
      setTesting(false);
    }
  }

  if (!provider) return <div>No providers configured.</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div className="flex items-center gap-2 mb-3">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={
                'px-3 py-1.5 rounded-md text-sm ' +
                (selectedId === p.id ? 'bg-accent-500/20 text-accent-300 border border-accent-500/40' : 'bg-ink-850 text-ink-300 border border-ink-750 hover:border-ink-700')
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-2 text-ink-300">
            <input
              type="radio"
              checked={activeProviderId === provider.id}
              onChange={() => setActive(provider.id)}
            />
            Use as default
          </label>
        </div>
      </div>

      <Field label="Base URL (optional override)">
        <input
          value={provider.baseUrl ?? ''}
          onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value || undefined })}
          placeholder={provider.id === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.example.com/v1'}
          className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2 text-sm outline-none focus:border-accent-500"
        />
        <div className="text-[11px] text-ink-500 mt-1">
          Works with any OpenAI-compatible endpoint (Azure OpenAI, OpenRouter, Groq, vLLM, etc.) — pick "OpenAI" or "Custom" and paste the base URL.
        </div>
      </Field>

      <Field label="Model">
        <div className="flex gap-2">
          <input
            value={provider.model}
            onChange={(e) => updateProvider(provider.id, { model: e.target.value })}
            list={`models-${provider.id}`}
            className="flex-1 bg-ink-800 border border-ink-700 rounded px-3 py-2 text-sm outline-none focus:border-accent-500"
          />
          <datalist id={`models-${provider.id}`}>
            {modelsList.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
      </Field>

      <Field label="Embedding model (optional)">
        <input
          value={provider.embeddingModel ?? ''}
          onChange={(e) => updateProvider(provider.id, { embeddingModel: e.target.value || undefined })}
          placeholder={provider.id === 'openai' ? 'text-embedding-3-small' : 'leave blank if unsupported'}
          className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2 text-sm outline-none focus:border-accent-500"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={`Temperature (${provider.temperature.toFixed(2)})`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={provider.temperature}
            onChange={(e) => updateProvider(provider.id, { temperature: Number(e.target.value) })}
            className="w-full"
          />
        </Field>
        <Field label="Max tokens (optional)">
          <input
            type="number"
            value={provider.maxTokens ?? ''}
            onChange={(e) => updateProvider(provider.id, { maxTokens: e.target.value ? Number(e.target.value) : undefined })}
            className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2 text-sm outline-none focus:border-accent-500"
          />
        </Field>
      </div>

      {provider.id !== 'ollama' && (
        <Field label="API key">
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keyPresent ? '•••••••• (saved — type to replace)' : 'sk-…'}
              className="flex-1 bg-ink-800 border border-ink-700 rounded px-3 py-2 text-sm outline-none focus:border-accent-500 font-mono"
            />
            <button
              onClick={saveKey}
              disabled={!apiKey}
              className="px-3 py-2 rounded bg-accent-500 text-white text-sm hover:bg-accent-600 disabled:opacity-40"
            >
              Save
            </button>
            {keyPresent && (
              <button onClick={clearKey} className="px-3 py-2 rounded bg-ink-800 text-ink-300 text-sm hover:bg-ink-700">
                Clear
              </button>
            )}
          </div>
          <div className="text-[11px] text-ink-500 mt-1">
            Keys are encrypted via Electron's safeStorage (OS keychain when available) and never sent to the renderer.
          </div>
        </Field>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={testConnection}
          disabled={testing}
          className="flex items-center gap-2 px-3 py-2 rounded bg-ink-800 hover:bg-ink-700 text-sm disabled:opacity-40"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
          Test connection
        </button>
        {testResult && (
          <div className={'text-sm ' + (testResult.ok ? 'text-green-400' : 'text-red-400')}>
            {testResult.ok ? (
              <span className="flex items-center gap-1">
                <Check size={14} /> {testResult.latencyMs}ms · {testResult.model} · {testResult.inputTokens + testResult.outputTokens} tokens
              </span>
            ) : (
              testResult.text
            )}
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-ink-800">
        <div className="text-sm text-ink-200 mb-2">Per-feature provider overrides</div>
        <div className="text-[11px] text-ink-500 mb-3">
          Use a cheap model for auto-format and a strong one for brainstorming. Leave blank to use the default provider.
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(['autoFormat', 'ramble', 'brainstorm', 'embeddings', 'vision', 'tag'] as const).map((feat) => (
            <div key={feat} className="flex items-center gap-2">
              <div className="text-sm text-ink-300 w-28 capitalize">{feat}</div>
              <select
                value={overrides[feat] ?? ''}
                onChange={(e) => setFeatureOverride(feat, (e.target.value || undefined) as LLMProviderId | undefined)}
                className="flex-1 bg-ink-800 border border-ink-700 rounded px-2 py-1 text-sm"
              >
                <option value="">— default —</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-ink-400 mb-1.5">{label}</div>
      {children}
    </div>
  );
}
