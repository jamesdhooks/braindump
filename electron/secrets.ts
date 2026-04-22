import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const SECRETS_FILE = () => path.join(app.getPath('userData'), 'braindump.secrets.enc');

type SecretsMap = Record<string, string>;

function load(): SecretsMap {
  const file = SECRETS_FILE();
  if (!fs.existsSync(file)) return {};
  try {
    const buf = fs.readFileSync(file);
    if (!safeStorage.isEncryptionAvailable()) {
      return JSON.parse(buf.toString('utf8')) as SecretsMap;
    }
    const json = safeStorage.decryptString(buf);
    return JSON.parse(json) as SecretsMap;
  } catch {
    return {};
  }
}

function save(map: SecretsMap) {
  const file = SECRETS_FILE();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const json = JSON.stringify(map);
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(file, safeStorage.encryptString(json));
  } else {
    fs.writeFileSync(file, json, 'utf8');
  }
}

export function getSecret(key: string): string | undefined {
  return load()[key];
}

export function setSecret(key: string, value: string) {
  const map = load();
  map[key] = value;
  save(map);
}

export function deleteSecret(key: string) {
  const map = load();
  delete map[key];
  save(map);
}

export function hasSecret(key: string): boolean {
  return Boolean(load()[key]);
}

export function listSecretKeys(): string[] {
  return Object.keys(load());
}
