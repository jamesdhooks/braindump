#!/usr/bin/env node
/**
 * scripts/build-icons.js
 * Generates build/tray.png (32x32) and build/icon.ico (multi-size) from assets/logo.png.
 * Zero dependencies — uses only Node.js built-ins.
 * Usage:  node scripts/build-icons.js
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC       = path.join(__dirname, '..', 'assets', 'logo.png');
const SRC_SMALL = path.join(__dirname, '..', 'assets', 'logo_small.png');
const DEST      = path.join(__dirname, '..', 'build');

// ── PNG decode (IDAT inflate + RGBA extraction) ───────────────────────────────

function readUint32BE(buf, off) { return (buf[off] * 2**24) + (buf[off+1] << 16) + (buf[off+2] << 8) + buf[off+3]; }

function parsePng(buf) {
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('Not a PNG');
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idats = [];
  let i = 8;
  while (i < buf.length) {
    const len  = readUint32BE(buf, i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const data = buf.slice(i + 8, i + 8 + len);
    if (type === 'IHDR') {
      width     = readUint32BE(data, 0);
      height    = readUint32BE(data, 4);
      bitDepth  = data[8];
      colorType = data[9];
    }
    if (type === 'IDAT') idats.push(data);
    if (type === 'IEND') break;
    i += 4 + 4 + len + 4;
  }
  if (bitDepth !== 8) throw new Error(`Unsupported bit depth ${bitDepth}`);
  // colorType: 2=RGB, 6=RGBA, 3=indexed (common)
  if (colorType !== 2 && colorType !== 6) throw new Error(`Unsupported PNG colorType ${colorType} — convert to RGBA first`);

  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idats));
  const stride = 1 + width * channels; // filter byte + row bytes
  const rgba = Buffer.alloc(width * height * 4);
  const decoded = []; // reconstructed rows (needed for Up/Average/Paeth filters)

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    const filter = raw[rowStart];
    const encoded = raw.slice(rowStart + 1, rowStart + 1 + width * channels);
    const prev = y > 0 ? decoded[y - 1] : null;
    const out = Buffer.alloc(width * channels);
    for (let x = 0; x < width * channels; x++) {
      const filt = encoded[x];
      const a = x >= channels ? out[x - channels] : 0;       // left (reconstructed)
      const b = prev ? prev[x] : 0;                          // above (reconstructed)
      const c = (x >= channels && prev) ? prev[x - channels] : 0; // upper-left
      let recon;
      switch (filter) {
        case 0: recon = filt; break;
        case 1: recon = filt + a; break;
        case 2: recon = filt + b; break;
        case 3: recon = filt + Math.floor((a + b) / 2); break;
        case 4: recon = filt + paeth(a, b, c); break;
        default: recon = filt;
      }
      out[x] = recon & 0xff;
    }
    decoded.push(out);
    for (let x = 0; x < width; x++) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      rgba[dst]     = out[src];
      rgba[dst + 1] = out[src + 1];
      rgba[dst + 2] = out[src + 2];
      rgba[dst + 3] = channels === 4 ? out[src + 3] : 255;
    }
  }
  return { width, height, rgba };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// ── Nearest-neighbour resize ───────────────────────────────────────────────────

function resizeNN(src, sw, sh, dw, dh) {
  const dst = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(Math.floor(x * sw / dw), sw - 1);
      const sy = Math.min(Math.floor(y * sh / dh), sh - 1);
      const si = (sy * sw + sx) * 4;
      const di = (y * dw + x) * 4;
      src.copy(dst, di, si, si + 4);
    }
  }
  return dst;
}

// ── PNG encode (minimal: raw RGBA → deflate → PNG) ────────────────────────────

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeB  = Buffer.from(type);
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeB, data]);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeB, data, crcBuf]);
}

function encodePng(rgba, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // bitDepth=8, colorType=6 (RGBA)

  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter = None
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ── ICO assembly (Vista+ embedded-PNG format) ─────────────────────────────────

function buildIco(entries) {
  // entries: [{ size, pngBytes }]
  const n = entries.length;
  const dirSize = 6 + n * 16;
  let offset = dirSize;
  const parts = [];

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(n, 4);
  parts.push(header);

  const dirs = [];
  for (const e of entries) {
    const d = Buffer.alloc(16);
    d[0] = e.size === 256 ? 0 : e.size;
    d[1] = e.size === 256 ? 0 : e.size;
    d[2] = 0; d[3] = 0;
    d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6);
    d.writeUInt32LE(e.pngBytes.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += e.pngBytes.length;
    dirs.push(d);
  }
  parts.push(...dirs);
  for (const e of entries) parts.push(e.pngBytes);
  return Buffer.concat(parts);
}

// ── main ──────────────────────────────────────────────────────────────────────

for (const [label, p] of [['SRC', SRC], ['SRC_SMALL', SRC_SMALL]]) {
  if (!fs.existsSync(p)) {
    console.error(`ERROR: ${p} not found. Run from repo root.`);
    process.exit(1);
  }
}
if (!fs.existsSync(DEST)) fs.mkdirSync(DEST, { recursive: true });

console.log('[braindump] Updating logo assets...');

// Parse both sources
const rawLarge = fs.readFileSync(SRC);
const { width: wL, height: hL, rgba: rgbaLarge } = parsePng(rawLarge);

const rawSmall = fs.readFileSync(SRC_SMALL);
const { width: wS, height: hS, rgba: rgbaSmall } = parsePng(rawSmall);

// 1. Tray icon 32x32 — use small source
const trayRgba = resizeNN(rgbaSmall, wS, hS, 32, 32);
const trayPng  = encodePng(trayRgba, 32, 32);
fs.writeFileSync(path.join(DEST, 'tray.png'), trayPng);
console.log('[1/2] build/tray.png  (32x32 tray icon, from logo_small.png)');

// 2. Multi-size ICO — small source for ≤48px, large source for ≥64px
const icoSmallSizes = [16, 24, 32, 48];
const icoLargeSizes = [64, 128, 256];
const entries = [
  ...icoSmallSizes.map((sz) => {
    const r = resizeNN(rgbaSmall, wS, hS, sz, sz);
    return { size: sz, pngBytes: encodePng(r, sz, sz) };
  }),
  ...icoLargeSizes.map((sz) => {
    const r = resizeNN(rgbaLarge, wL, hL, sz, sz);
    return { size: sz, pngBytes: encodePng(r, sz, sz) };
  }),
];
const icoSizes = [...icoSmallSizes, ...icoLargeSizes];
const icoData = buildIco(entries);
fs.writeFileSync(path.join(DEST, 'icon.ico'), icoData);
console.log(`[2/2] build/icon.ico  (${icoSizes.join(', ')}px — small≤48px from logo_small.png, large≥64px from logo.png)`);

console.log('\nDone. Build assets:');
for (const f of fs.readdirSync(DEST)) {
  const stat = fs.statSync(path.join(DEST, f));
  console.log(`  ${f}  (${stat.size} bytes)`);
}
