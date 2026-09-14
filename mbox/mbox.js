import { findFromLines, splitHeadBody, parseHeaders, parseMessage } from "../mbox-parser.js";

const $ = (s) => document.querySelector(s);
const el = {
  landing: $("#landing"), app: $("#app"), drop: $("#drop"), file: $("#file"), prog: $("#prog"),
  q: $("#q"), from: $("#from"), to: $("#to"), count: $("#count"), csv: $("#csv"), reset: $("#reset"),
  list: $("#list"), view: $("#view"),
};

const CHUNK = 8 * 1024 * 1024;
const HEAD_MAX = 32 * 1024;
const PAGE = 200;
let file = null, index = [], filtered = [], shown = 0, selected = -1;

// ---------- index ----------
async function load(f) {
  if (!f) return;
  file = f; index = [];
  el.prog.textContent = "Scanning…";

  // pass 1: byte offsets of every message
  const offsets = [];
  let carry = null;
  for (let pos = 0; pos < f.size; pos += CHUNK) {
    const bytes = new Uint8Array(await f.slice(pos, pos + CHUNK).arrayBuffer());
    offsets.push(...findFromLines(bytes, pos, carry));
    carry = bytes.subarray(Math.max(0, bytes.length - 5));
    el.prog.textContent = `Scanning… ${Math.round((pos / f.size) * 100)}% · ${offsets.length.toLocaleString()} messages`;
  }
  if (!offsets.length) { el.prog.textContent = ""; return alert("No messages found. Is this an mbox file?"); }

  // pass 2: headers only
  for (let i = 0; i < offsets.length; i++) {
    const start = offsets[i], end = i + 1 < offsets.length ? offsets[i + 1] : f.size;
    const bytes = new Uint8Array(await f.slice(start, Math.min(end, start + HEAD_MAX)).arrayBuffer());
    const [head] = splitHeadBody(bytes);
    const h = parseHeaders(head);
    const d = new Date(h.date || "");
    index.push({ i, start, end, from: h.from || "", to: h.to || "", subject: h.subject || "(no subject)", date: isNaN(d) ? null : d, att: /multipart\/mixed/i.test(h["content-type"] || "") });
    if (i % 500 === 0) el.prog.textContent = `Reading headers… ${Math.round((i / offsets.length) * 100)}%`;
  }
  index.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

  el.prog.textContent = "";
  el.q.value = el.from.value = el.to.value = "";
  el.landing.hidden = true; el.app.hidden = false;
  window.scrollTo(0, 0);
  applyFilters();
}

// ---------- filter / list ----------
function applyFilters() {
  const q = el.q.value.trim().toLowerCase();
  const from = el.from.value ? new Date(el.from.value + "T00:00:00") : null;
  const to = el.to.value ? new Date(el.to.value + "T23:59:59") : null;
  filtered = index.filter((m) =>
    (!from || (m.date && m.date >= from)) && (!to || (m.date && m.date <= to)) &&
    (!q || m.from.toLowerCase().includes(q) || m.to.toLowerCase().includes(q) || m.subject.toLowerCase().includes(q))
  );
  el.count.textContent = `${filtered.length.toLocaleString()} / ${index.length.toLocaleString()}`;
  el.list.innerHTML = ""; shown = 0;
  appendPage();
}

function appendPage() {
  const frag = document.createDocumentFragment();
  const end = Math.min(shown + PAGE, filtered.length);
  for (let k = shown; k < end; k++) {
    const m = filtered[k];
    const r = document.createElement("div");
    r.className = "row" + (m.i === selected ? " sel" : "");
    r.dataset.i = m.i;
    r.innerHTML = `<div class="f"><span>${esc(name(m.from))}</span><time>${m.date ? fmt(m.date) : ""}</time></div><div class="s">${esc(m.subject)}</div><div class="a">${m.att ? "📎 " : ""}${esc(addr(m.to))}</div>`;
    r.onclick = () => open(m);
    frag.appendChild(r);
  }
  el.list.appendChild(frag);
  shown = end;
  if (shown < filtered.length) {
    const b = document.createElement("button");
    b.className = "btn ghost more"; b.textContent = `Show more (${(filtered.length - shown).toLocaleString()} left)`;
    b.onclick = () => { b.remove(); appendPage(); };
    el.list.appendChild(b);
  }
}

// ---------- open message ----------
async function open(m) {
  selected = m.i;
  for (const r of el.list.querySelectorAll(".row")) r.classList.toggle("sel", +r.dataset.i === m.i);
  const raw = new Uint8Array(await file.slice(m.start, m.end).arrayBuffer());
  const msg = parseMessage(raw);
  const h = msg.headers;

  el.view.innerHTML = `
    <div class="hdr">
      <h2>${esc(h.subject || "(no subject)")}</h2>
      <div class="meta">
        <span><b>From</b> ${esc(h.from || "")}</span>
        <span><b>To</b> ${esc(h.to || "")}</span>
        ${h.cc ? `<span><b>Cc</b> ${esc(h.cc)}</span>` : ""}
        <span><b>Date</b> ${esc(h.date || "")}</span>
      </div>
      <div class="atts" id="atts"></div>
      <div class="atts" style="margin-top:16px">
        <a href="#" id="eml">↓ .eml</a>
        <a href="#" id="print">Print / PDF</a>
      </div>
    </div>
    <div id="body"></div>`;

  const atts = $("#atts");
  const cidMap = {};
  for (const a of msg.attachments) {
    const url = URL.createObjectURL(new Blob([a.bytes], { type: a.type }));
    if (a.cid && a.bytes.length < 2e6) cidMap[a.cid] = `data:${a.type};base64,${b64(a.bytes)}`; // sandboxed iframe can't read our blob: URLs
    const link = document.createElement("a");
    link.href = url; link.download = a.name; link.textContent = `📎 ${a.name} (${kb(a.bytes.length)})`;
    atts.appendChild(link);
  }

  const body = $("#body");
  if (msg.html) {
    const html = msg.html.replace(/cid:([^"')\s]+)/g, (_, c) => cidMap[c] || "");
    const f = document.createElement("iframe");
    f.sandbox = ""; // no scripts, no same-origin
    f.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:"><base target="_blank">` + html;
    f.onload = () => { try { f.style.height = f.contentDocument.documentElement.scrollHeight + 20 + "px"; } catch {} };
    body.appendChild(f);
  } else {
    const p = document.createElement("pre"); p.textContent = msg.text || "(empty)"; body.appendChild(p);
  }

  $("#eml").onclick = (e) => {
    e.preventDefault();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([raw], { type: "message/rfc822" }));
    a.download = (h.subject || "message").replace(/[^\w.-]+/g, "_").slice(0, 80) + ".eml";
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("#print").onclick = (e) => { e.preventDefault(); window.print(); };
}

// ---------- export ----------
function exportCsv() {
  const rows = [["date", "from", "to", "subject"]];
  for (const m of filtered) rows.push([m.date ? m.date.toISOString() : "", m.from, m.to, m.subject]);
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  a.download = "mbox-index.csv"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- wiring ----------
el.file.onchange = () => load(el.file.files[0]);
$("#sample").onclick = async () => load(new File([await (await fetch("sample.mbox")).blob()], "sample.mbox"));
for (const ev of ["dragenter", "dragover"]) document.addEventListener(ev, (e) => { e.preventDefault(); el.drop.classList.add("over"); });
for (const ev of ["dragleave", "drop"]) document.addEventListener(ev, (e) => { e.preventDefault(); el.drop.classList.remove("over"); });
document.addEventListener("drop", (e) => load(e.dataTransfer.files[0]));
let t; el.q.oninput = () => { clearTimeout(t); t = setTimeout(applyFilters, 150); };
el.from.onchange = el.to.onchange = applyFilters;
el.csv.onclick = exportCsv;
el.reset.onclick = () => { file = null; index = []; filtered = []; selected = -1; el.file.value = ""; el.view.innerHTML = '<p class="empty">Select a message</p>'; el.app.hidden = true; el.landing.hidden = false; };

// ---------- utils ----------
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function name(s) { const m = /^"?([^"<]+?)"?\s*<[^>]+>/.exec(s); return (m ? m[1] : s).trim() || s; }
function addr(s) { return s.split(",")[0].trim(); }
function fmt(d) { return d.toLocaleDateString(undefined, { year: "2-digit", month: "short", day: "numeric" }); }
function b64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
function kb(n) { return n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
