#!/usr/bin/env node
// Generates PWA icons: public/icons/icon-192.png and public/icons/icon-512.png
// Run once with: node generate-icons.cjs
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const zlib = { deflateSync };
const fs = { writeFileSync, mkdirSync };
const path = { join };

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = (crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crcv = Buffer.alloc(4); crcv.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcv]);
}

function createPNG(size) {
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; // bit depth=8, color type=RGB

  const scanline = 1 + size * 3;
  const raw = Buffer.alloc(scanline * size);
  const half = size / 2;

  for (let y = 0; y < size; y++) {
    raw[y * scanline] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const off = y * scanline + 1 + x * 3;
      const dx = x - half, dy = y - half;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const outerR = half * 0.88;

      // Background: #09090b
      let r = 9, g = 9, b = 11;

      if (dist <= outerR) {
        // Fill: deep purple #4c1d95
        r = 76; g = 29; b = 149;

        // Film strip: two horizontal bars (top & bottom thirds of the circle)
        const ny = (y - half) / outerR; // normalized -1 to 1
        const nx = (x - half) / outerR;
        const barH = 0.18;
        const isTopBar    = ny > -(0.75) && ny < -(0.75 - barH) && Math.abs(nx) < 0.85;
        const isBottomBar = ny > (0.75 - barH) && ny < 0.75 && Math.abs(nx) < 0.85;
        const isMidBar    = ny > -0.1 && ny < 0.1 && Math.abs(nx) < 0.85;

        if (isTopBar || isBottomBar) {
          r = 220; g = 220; b = 225; // light film strip
          // sprocket holes
          const holeW = 0.12;
          const holePositions = [-0.6, -0.2, 0.2, 0.6];
          for (const hx of holePositions) {
            if (Math.abs(nx - hx) < holeW / 2) { r = 30; g = 30; b = 35; }
          }
        } else if (isMidBar) {
          r = 50; g = 20; b = 100; // darker divider band
        }

        // Circular border ring: #a855f7
        if (dist >= outerR - size * 0.035 && dist <= outerR) {
          r = 168; g = 85; b = 247;
        }

        // Two "C" letters using arc segments (film/cinema icon)
        const letterR = outerR * 0.28;
        const gapAngle = Math.PI * 0.45; // opening angle of C
        const thick = size * 0.045;
        for (const cx of [half - outerR * 0.28, half + outerR * 0.28]) {
          const ldx = x - cx, ldy = y - half;
          const ld = Math.sqrt(ldx * ldx + ldy * ldy);
          if (ld >= letterR - thick && ld <= letterR + thick) {
            const angle = Math.atan2(ldy, ldx);
            // C opens to the right: exclude angles near 0 (right side)
            if (Math.abs(angle) > gapAngle) {
              r = 250; g = 250; b = 252;
            }
          }
        }
      }

      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdrData), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-192.png'), createPNG(192));
console.log('Created public/icons/icon-192.png');
fs.writeFileSync(path.join(outDir, 'icon-512.png'), createPNG(512));
console.log('Created public/icons/icon-512.png');
console.log('Done!');
