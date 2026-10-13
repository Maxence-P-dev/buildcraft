import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/* -------------------------------------------------------------- toast */

let toastTimer;
export function toast(msg, kind = 'ok') {
  let el = $('#toast');
  if (!el) document.body.append((el = h('div', { id: 'toast' })));
  el.className = `toast ${kind}`;
  el.innerHTML = icon(kind === 'error' ? 'error' : 'checkCircle', 17);
  el.append(h('span', {}, msg));
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), kind === 'error' ? 5000 : 2800);
}

/** Wraps an async action: shows its error as a toast, returns undefined on failure. */
export async function attempt(fn) {
  try {
    return await fn();
  } catch (err) {
    toast(err.message || String(err), 'error');
  }
}

/* -------------------------------------------------------------- modal */

export function modal(build, { wide = false, dismissable = true } = {}) {
  const overlay = h('div', { class: 'overlay' });
  const box = h('div', { class: `modal${wide ? ' wide' : ''}` });
  overlay.append(box);
  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 180);
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && dismissable) {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', (e) => dismissable && e.target === overlay && close());
  build(box, close);
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  return close;
}

export function confirmBox({ title, text, ok = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    modal((box, close) => {
      const okBtn = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => (finish(true), close()) }, ok);
      box.append(h('h2', {}, title), h('p', { class: 'sub' }, text), h('div', { class: 'modal-actions' }, h('button', { class: 'btn ghost', onclick: () => (finish(false), close()) }, 'Annuler'), okBtn));
      setTimeout(() => okBtn.focus(), 50);
    });
    setTimeout(() => document.addEventListener('mousedown', () => {}, { once: true }), 0);
  });
}

/* ------------------------------------------------------------ menus */

let floating = null;

export function closeMenu() {
  if (!floating) return;
  floating.classList.remove('open');
  const el = floating;
  setTimeout(() => el.remove(), 120);
  floating = null;
}

export function menu(anchor, items) {
  closeMenu();
  const el = h(
    'div',
    { class: 'floating' },
    items.map((it) =>
      h('button', { class: `menu-item${it.danger ? ' danger' : ''}${it.active ? ' active' : ''}`, onclick: () => (closeMenu(), it.action()) }, it.icon ? h('span', { html: icon(it.icon, 16) }) : null, h('span', {}, it.label))
    )
  );
  document.body.append(el);
  const a = anchor.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  el.style.left = `${Math.min(a.left, window.innerWidth - r.width - 10)}px`;
  el.style.top = `${a.bottom + 6 + r.height > window.innerHeight ? a.top - r.height - 6 : a.bottom + 6}px`;
  floating = el;
  requestAnimationFrame(() => el.classList.add('open'));
}

document.addEventListener('mousedown', (e) => floating && !floating.contains(e.target) && closeMenu());

/* ------------------------------------------------------------ format */

const MC = { 0: '#000000', 1: '#3a49b8', 2: '#2fae4a', 3: '#2aa7a7', 4: '#c43a3a', 5: '#a13ab8', 6: '#e0a32e', 7: '#aab4be', 8: '#6b7888', 9: '#6f86ff', a: '#6ff0a6', b: '#7de3ff', c: '#ff7b7b', d: '#ff8be6', e: '#f5e06a', f: '#ffffff', g: '#e8c84a' };

/** Minecraft § colour codes to HTML, with a line class for warnings/errors. */
export function consoleLine(line) {
  let cls = '';
  if (/^> /.test(line)) cls = 'l-cmd';
  else if (/\b(ERROR|SEVERE|CRITICAL|EMERGENCY|Exception|Error:)\b/.test(line)) cls = 'l-err';
  else if (/\b(WARN|WARNING|NOTICE)\b/.test(line)) cls = 'l-warn';
  else if (/Done \(|Enabling /.test(line)) cls = 'l-ok';
  let html = '';
  let open = 0;
  for (const part of esc(line).split(/§([0-9a-gk-or])/i)) {
    if (/^[0-9a-g]$/i.test(part)) {
      html += '</span>'.repeat(open) + `<span style="color:${MC[part.toLowerCase()]}">`;
      open = 1;
    } else if (/^[k-or]$/i.test(part)) {
      if (part.toLowerCase() === 'r') {
        html += '</span>'.repeat(open);
        open = 0;
      }
    } else html += part;
  }
  html += '</span>'.repeat(open);
  return h('div', { class: cls, html: html || '&nbsp;' });
}

/** Light markdown for assistant messages: paragraphs, lists, bold, inline code. */
export function markdown(text) {
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const out = [];
  let list = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd();
    const li = line.match(/^\s*[-*•]\s+(.*)$/) || line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (li) {
      if (!list) out.push((list = []));
      list.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    list = null;
    if (!line.trim()) out.push('');
    else if (/^#{1,4}\s/.test(line)) out.push(`<p><strong>${inline(line.replace(/^#+\s/, ''))}</strong></p>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  return out.map((x) => (Array.isArray(x) ? `<ul>${x.join('')}</ul>` : x)).join('');
}

export function since(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const hh = Math.floor(m / 60);
  return `${hh} h ${String(m % 60).padStart(2, '0')}`;
}
