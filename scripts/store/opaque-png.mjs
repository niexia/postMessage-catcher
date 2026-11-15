/**
 * Minimal PNG helpers for store assets.
 *
 * Chrome's `Page.captureScreenshot` always returns RGBA PNGs, but the Chrome Web
 * Store expects opaque screenshots (no alpha channel). Re-encoding as RGB keeps
 * the pixels and drops the channel without pulling in an image dependency.
 */
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

export function pngInfo(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  return { width, height, bitDepth, colorType };
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upLeft;
}

function unfilter(filter, row, previous, current, bpp) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bpp ? current[index - bpp] : 0;
    const up = previous[index] ?? 0;
    const upLeft = index >= bpp ? (previous[index - bpp] ?? 0) : 0;
    let value = row[index];
    if (filter === 1) value = (value + left) & 0xff;
    else if (filter === 2) value = (value + up) & 0xff;
    else if (filter === 3) value = (value + ((left + up) >> 1)) & 0xff;
    else if (filter === 4) value = (value + paeth(left, up, upLeft)) & 0xff;
    else if (filter !== 0) throw new Error(`unsupported PNG row filter ${filter}`);
    current[index] = value;
  }
}

/**
 * Returns an opaque RGB PNG. Already-opaque PNGs are returned unchanged, so the
 * function is safe to call on every asset.
 */
export function toOpaquePng(input) {
  const info = pngInfo(input);
  if (!info) throw new Error('not a PNG');
  if (info.colorType === 2) return input;
  if (info.colorType !== 6) {
    throw new Error(`unsupported PNG color type ${info.colorType} (expected 2 or 6)`);
  }
  if (info.bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${info.bitDepth}`);

  let offset = 8;
  let header = null;
  const dataChunks = [];
  while (offset < input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString('ascii', offset + 4, offset + 8);
    const data = input.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      dataChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (!header) throw new Error('missing IHDR');
  if (header.interlace !== 0) throw new Error('interlaced PNGs are not supported');

  const { width, height } = header;
  const bpp = 4;
  const rowBytes = width * bpp;
  const stride = rowBytes + 1;
  const raw = inflateSync(Buffer.concat(dataChunks));
  if (raw.length !== height * stride) {
    throw new Error(`unexpected PNG data length ${raw.length}, expected ${height * stride}`);
  }

  const outStride = width * 3 + 1;
  const output = Buffer.alloc(height * outStride);
  const previous = Buffer.alloc(rowBytes);
  const current = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * stride];
    const row = raw.subarray(y * stride + 1, (y + 1) * stride);
    unfilter(filter, row, previous, current, bpp);
    const outRow = y * outStride;
    output[outRow] = 0;
    for (let x = 0; x < width; x += 1) {
      output[outRow + 1 + x * 3] = current[x * 4];
      output[outRow + 2 + x * 3] = current[x * 4 + 1];
      output[outRow + 3 + x * 3] = current[x * 4 + 2];
    }
    current.copy(previous);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour, no alpha
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(output, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
