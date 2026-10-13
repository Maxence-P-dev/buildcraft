'use strict';

// Streamed downloads with progress, and zip extraction.

const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable, Transform } = require('stream');
const extractZip = require('extract-zip');

/**
 * Downloads `url` to `dest` (written to a .part file first, renamed when complete).
 * onProgress({ received, total }) is called as bytes arrive.
 */
async function download(url, dest, { onProgress, signal } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url, { redirect: 'follow', signal, headers: { 'User-Agent': 'BuildCraft' } });
  if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (${res.status}) : ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let received = 0;
  let last = 0;
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      const now = Date.now();
      if (onProgress && (now - last > 150 || received === total)) {
        last = now;
        onProgress({ received, total });
      }
      cb(null, chunk);
    },
  });
  const part = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body), meter, fs.createWriteStream(part));
  onProgress?.({ received, total: total || received });
  fs.renameSync(part, dest);
  return dest;
}

/** Extracts a zip; with flatten, a single top folder's content becomes `dir`. */
async function unzipTo(zipFile, dir, { flatten = true } = {}) {
  const tmp = `${dir}.extract`;
  fs.rmSync(tmp, { recursive: true, force: true });
  await extractZip(zipFile, { dir: path.resolve(tmp) });
  const entries = fs.readdirSync(tmp);
  const root = flatten && entries.length === 1 && fs.statSync(path.join(tmp, entries[0])).isDirectory() ? path.join(tmp, entries[0]) : tmp;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.renameSync(root, dir);
  fs.rmSync(tmp, { recursive: true, force: true });
  return dir;
}

async function json(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'BuildCraft', Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} : ${url}`);
  return res.json();
}

module.exports = { download, unzipTo, json };
