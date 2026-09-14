import { parseChat } from "./parser.js";
import { gate } from "./pro.js";


const $ = (s) => document.querySelector(s);
const el = {
  landing: $("#landing"), app: $("#app"), drop: $("#drop"), file: $("#file"), sample: $("#sample"),
  q: $("#q"), sender: $("#sender"), from: $("#from"), to: $("#to"), count: $("#count"),
  csv: $("#csv"), pdf: $("#pdf"), reset: $("#reset"), stats: $("#stats"), chat: $("#chat"), more: $("#more"),
};

const PAGE = 300;
let msgs = [], filtered = [], shown = 0, me = "", zipFiles = null;
const blobUrls = new Map();

// ---------- load ----------
async function loadFile(file) {
  if (!file) return;
  let text;
  zipFiles = null;
  if (/\.zip$/i.test(file.name)) {
    const zip = await JSZip.loadAsync(file);
    const txts = Object.values(zip.files).filter((f) => /\.txt$/i.test(f.name) && !f.dir);
    if (!txts.length) return alert("No .txt chat file found inside the zip.");
    // largest .txt is the chat
    let best = txts[0];
    for (const f of txts) if ((f._data?.uncompressedSize || 0) > (best._data?.uncompressedSize || 0)) best = f;
    text = await best.async("string");
    zipFiles = {};
    for (const f of Object.values(zip.files)) if (!f.dir) zipFiles[f.name.split("/").pop()] = f;
  } else {
    text = await file.text();
  }
  boot(text, file.name);
}

function boot(text, name) {
  msgs = parseChat(text);
  if (!msgs.length) return alert("Couldn't find WhatsApp messages in this file. Is it an 'Export chat' .txt?");
  const senders = countBy(msgs.filter((m) => m.sender).map((m) => m.sender));
  const names = Object.keys(senders).sort((a, b) => senders[b] - senders[a]);
  me = names[1] || names[0] || "";

  el.sender.innerHTML = `<option value="">Everyone</option>` + names.map((n) => `<option>${esc(n)}</option>`).join("");
  el.from.value = el.to.value = el.q.value = "";
  el.stats.innerHTML =
    `<span><b>${name}</b></span>` +
    `<span><b>${msgs.length.toLocaleString()}</b> messages</span>` +
    `<span>${fmtDate(msgs[0].date)} → ${fmtDate(msgs.at(-1).date)}</span>` +
    names.slice(0, 6).map((n) => `<span>${esc(n)} <b>${senders[n].toLocaleString()}</b></span>`).join("") +
    `<span>you are <select id="me">${names.map((n) => `<option ${n === me ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></span>`;
  $("#me").onchange = (e) => { me = e.target.value; render(); };

  el.landing.hidden = true; el.app.hidden = false;
  window.scrollTo(0, 0);
  applyFilters();
}

// ---------- filter ----------
function applyFilters() {
  const q = el.q.value.trim().toLowerCase();
  const who = el.sender.value;
  const from = el.from.value ? new Date(el.from.value + "T00:00:00") : null;
  const to = el.to.value ? new Date(el.to.value + "T23:59:59") : null;
  filtered = msgs.filter((m) =>
    (!who || m.sender === who) &&
    (!from || m.date >= from) && (!to || m.date <= to) &&
    (!q || m.text.toLowerCase().includes(q) || (m.sender || "").toLowerCase().includes(q))
  );
  el.count.textContent = `${filtered.length.toLocaleString()} / ${msgs.length.toLocaleString()}`;
  render();
}

// ---------- render ----------
function render(all = false) {
  el.chat.innerHTML = "";
  shown = 0;
  appendPage(all ? filtered.length : PAGE);
}

function appendPage(n) {
  const q = el.q.value.trim();
  const frag = document.createDocumentFragment();
  let lastDay = shown ? dayKey(filtered[shown - 1].date) : null;
  const end = Math.min(shown + n, filtered.length);
  for (let i = shown; i < end; i++) {
    const m = filtered[i];
    const dk = dayKey(m.date);
    if (dk !== lastDay) {
      const d = document.createElement("div");
      d.className = "day"; d.textContent = fmtDate(m.date);
      frag.appendChild(d); lastDay = dk;
    }
    frag.appendChild(msgNode(m, q));
  }
  el.chat.appendChild(frag);
  shown = end;
  el.more.hidden = shown >= filtered.length;
  el.more.textContent = `Show more (${(filtered.length - shown).toLocaleString()} left)`;
}

function msgNode(m, q) {
  const div = document.createElement("div");
  div.className = "msg" + (m.sender ? (m.sender === me ? " me" : "") : " sys");
  const body = m.attachment ? `<span class="file">📎 ${esc(m.attachment)}</span>` : highlight(esc(m.text), q);
  div.innerHTML =
    (m.sender && m.sender !== me ? `<span class="who">${esc(m.sender)}</span>` : "") +
    `<div class="bubble">${body}</div>` +
    (m.sender ? `<span class="time">${fmtTime(m.date)}</span>` : "");
  if (m.attachment && zipFiles && /\.(jpe?g|png|gif|webp)$/i.test(m.attachment) && zipFiles[m.attachment]) {
    attachImage(div.querySelector(".bubble"), m.attachment);
  }
  return div;
}

async function attachImage(bubble, name) {
  let url = blobUrls.get(name);
  if (!url) {
    url = URL.createObjectURL(await zipFiles[name].async("blob"));
    blobUrls.set(name, url);
  }
  const img = new Image();
  img.src = url; img.loading = "lazy"; img.alt = name;
  bubble.appendChild(img);
}

// ---------- export ----------
function exportPdf() {
  render(true); // print needs everything in the DOM
  // ponytail: no cap; 50k+ messages will take a while to lay out. Chunked print if it hurts.
  setTimeout(() => window.print(), 50);
}

function exportCsv() {
  const rows = [["date", "sender", "message", "attachment"]];
  for (const m of filtered) rows.push([m.date.toISOString(), m.sender || "", m.text, m.attachment || ""]);
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  a.download = "chat.csv"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}


// ---------- wiring ----------
el.file.onchange = () => loadFile(el.file.files[0]);
for (const ev of ["dragenter", "dragover"]) document.addEventListener(ev, (e) => { e.preventDefault(); el.drop.classList.add("over"); });
for (const ev of ["dragleave", "drop"]) document.addEventListener(ev, (e) => { e.preventDefault(); el.drop.classList.remove("over"); });
document.addEventListener("drop", (e) => loadFile(e.dataTransfer.files[0]));

el.sample.onclick = () => boot(SAMPLE, "sample.txt");
let t; el.q.oninput = () => { clearTimeout(t); t = setTimeout(applyFilters, 150); };
el.sender.onchange = el.from.onchange = el.to.onchange = applyFilters;
el.more.onclick = () => appendPage(PAGE);
el.pdf.onclick = gate(exportPdf);
el.csv.onclick = gate(exportCsv);
el.reset.onclick = () => {
  for (const u of blobUrls.values()) URL.revokeObjectURL(u);
  blobUrls.clear(); msgs = []; filtered = []; zipFiles = null; el.file.value = "";
  el.app.hidden = true; el.landing.hidden = false;
};

// ---------- utils ----------
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function highlight(html, q) {
  if (!q) return html;
  const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return html.replace(re, (m) => `<mark>${m}</mark>`);
}
function countBy(arr) { const o = {}; for (const k of arr) o[k] = (o[k] || 0) + 1; return o; }
function dayKey(d) { return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate(); }
function fmtDate(d) { return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
function fmtTime(d) { return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }

const SAMPLE = `12/03/24, 9:14 AM - Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.
12/03/24, 9:14 AM - Priya: Morning! Did you see the invoice from the landlord?
12/03/24, 9:16 AM - Sam: Yeah. He's asking for the deposit again?
12/03/24, 9:16 AM - Priya: Second time this month 🙄
12/03/24, 9:17 AM - Sam: I'll forward the bank receipt. We paid on the 1st.
12/03/24, 9:20 AM - Sam: <Media omitted>
12/03/24, 9:21 AM - Priya: Perfect, thanks. Keeping this for the record.
13/03/24, 6:02 PM - Priya: He replied. Says he "never got it".
13/03/24, 6:05 PM - Sam: We have the receipt and this chat. Export it to PDF just in case.
13/03/24, 6:05 PM - Priya: On it.
`;
