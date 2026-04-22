import { app } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ATTACH_DIR = () => {
  const dir = path.join(app.getPath('userData'), 'attachments');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

function sniffExtension(buf: Buffer): string {
  if (buf.length < 12) return 'bin';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return 'bin';
}

export type SavedAttachment = {
  id: string;
  path: string;
  absolutePath: string;
  ext: string;
  size: number;
};

export function saveBufferAsAttachment(buf: Buffer): SavedAttachment {
  const hash = crypto.createHash('sha1').update(buf).digest('hex');
  const ext = sniffExtension(buf);
  const name = `${hash}.${ext}`;
  const abs = path.join(ATTACH_DIR(), name);
  if (!fs.existsSync(abs)) {
    fs.writeFileSync(abs, buf);
  }
  return {
    id: hash,
    path: path.posix.join('attachments', name),
    absolutePath: abs,
    ext,
    size: buf.length
  };
}

export function saveFromPath(srcPath: string): SavedAttachment {
  const buf = fs.readFileSync(srcPath);
  return saveBufferAsAttachment(buf);
}

export function saveFromBase64(dataUrl: string): SavedAttachment {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) throw new Error('Not a data URL');
  const buf = Buffer.from(m[2], 'base64');
  return saveBufferAsAttachment(buf);
}

export function resolveAttachmentPath(relOrId: string): string | null {
  const dir = ATTACH_DIR();
  if (relOrId.startsWith('attachments/')) {
    const p = path.join(app.getPath('userData'), relOrId);
    return fs.existsSync(p) ? p : null;
  }
  const files = fs.readdirSync(dir);
  const hit = files.find((f) => f.startsWith(relOrId));
  return hit ? path.join(dir, hit) : null;
}

export function readAttachmentBase64(rel: string): string | null {
  const abs = resolveAttachmentPath(rel);
  if (!abs) return null;
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).slice(1) || 'png';
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export function deleteAttachment(rel: string) {
  const abs = resolveAttachmentPath(rel);
  if (abs) fs.unlinkSync(abs);
}
