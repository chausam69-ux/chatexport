// MBOX + MIME parsing on raw bytes. No DOM. Works in browser and node.

const enc = new TextEncoder();
const latin1 = new TextDecoder("latin1");

// Find byte offsets of every "From " line (mbox message start) inside a chunk.
// `carry` = last 5 bytes of the previous chunk so boundaries straddling chunks are found.
export function findFromLines(bytes, base = 0, carry = null) {
  const out = [];
  const buf = carry ? concat(carry, bytes) : bytes;
  const shift = carry ? carry.length : 0;
  const start = base === 0 && !carry && startsWith(buf, "From ") ? [0] : [];
  for (let i = 0; i < buf.length - 5; i++) {
    if (buf[i] === 0x0a && buf[i + 1] === 0x46 && buf[i + 2] === 0x72 && buf[i + 3] === 0x6f && buf[i + 4] === 0x6d && buf[i + 5] === 0x20) {
      out.push(base + i + 1 - shift); // carry is 5 bytes, a 6-byte match can't be a duplicate of the previous chunk
    }
  }
  return start.concat(out);
}

export function splitHeadBody(bytes) {
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x0a && (bytes[i + 1] === 0x0a || (bytes[i + 1] === 0x0d && bytes[i + 2] === 0x0a))) {
      const bodyStart = bytes[i + 1] === 0x0a ? i + 2 : i + 3;
      return [bytes.subarray(0, i + 1), bytes.subarray(bodyStart)];
    }
  }
  return [bytes, new Uint8Array(0)];
}

export function parseHeaders(headBytes) {
  // raw 8-bit headers (Gmail) are usually UTF-8
  const text = new TextDecoder("utf-8").decode(headBytes).replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const h = {};
  let cur = null;
  for (const line of lines) {
    if (/^From /.test(line) && cur === null) continue; // mbox envelope line
    if (/^[ \t]/.test(line) && cur) { h[cur] += " " + line.trim(); continue; }
    const m = /^([\w-]+):\s*(.*)$/.exec(line);
    if (m) { cur = m[1].toLowerCase(); h[cur] = h[cur] ? h[cur] + ", " + m[2] : m[2]; }
  }
  for (const k of ["subject", "from", "to", "cc"]) if (h[k]) h[k] = decodeWords(h[k]);
  return h;
}

// RFC 2047: =?charset?B|Q?text?=
export function decodeWords(s) {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(?:\s+(?==\?))?/g, (_, cs, t, txt) => {
    const bytes = /b/i.test(t) ? b64(txt) : qp(txt.replace(/_/g, " "));
    return decode(bytes, cs);
  });
}

export function parseContentType(v = "") {
  const [type, ...params] = v.split(";");
  const p = {};
  for (const x of params) {
    const m = /^\s*([\w*-]+)="?([^"]*)"?\s*$/.exec(x);
    if (m) p[m[1].toLowerCase()] = m[2];
  }
  return { type: type.trim().toLowerCase() || "text/plain", params: p };
}

function decodeBody(bytes, cte = "") {
  cte = cte.trim().toLowerCase();
  if (cte === "base64") return b64(latin1.decode(bytes).replace(/[^A-Za-z0-9+/=]/g, ""));
  if (cte === "quoted-printable") return qp(latin1.decode(bytes).replace(/=\r?\n/g, ""));
  return bytes;
}

// Returns {headers, text, html, attachments:[{name, type, bytes}]}
export function parseMessage(bytes) {
  const [head, body] = splitHeadBody(bytes);
  const headers = parseHeaders(head);
  const out = { headers, text: "", html: "", attachments: [] };
  walk(headers, body, out);
  return out;
}

function walk(headers, body, out) {
  const ct = parseContentType(headers["content-type"]);
  const disp = (headers["content-disposition"] || "").toLowerCase();
  const filename = fileName(headers);

  if (ct.type.startsWith("multipart/") && ct.params.boundary) {
    for (const part of splitParts(body, ct.params.boundary)) {
      const [h, b] = splitHeadBody(part);
      walk(parseHeaders(h), b, out);
    }
    return;
  }
  const data = decodeBody(body, headers["content-transfer-encoding"]);
  if (filename || disp.startsWith("attachment")) {
    out.attachments.push({ name: filename || "attachment", type: ct.type, bytes: data, cid: (headers["content-id"] || "").replace(/[<>]/g, "") });
    return;
  }
  if (ct.type === "text/html" && !out.html) out.html = decode(data, ct.params.charset);
  else if (ct.type === "text/plain" && !out.text) out.text = decode(data, ct.params.charset).replace(/^>(>*From )/gm, "$1"); // undo mboxrd escaping
  else if (ct.type.startsWith("message/")) walk(...(() => { const [h, b] = splitHeadBody(data); return [parseHeaders(h), b]; })(), out);
  else if (!ct.type.startsWith("text/")) out.attachments.push({ name: filename || "part", type: ct.type, bytes: data, cid: (headers["content-id"] || "").replace(/[<>]/g, "") });
}

function splitParts(body, boundary) {
  const text = latin1.decode(body);
  const chunks = text.split("--" + boundary);
  const parts = [];
  for (let i = 1; i < chunks.length; i++) {
    let c = chunks[i];
    if (c.startsWith("--")) break;
    c = c.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    parts.push(latin1Bytes(c));
  }
  return parts;
}

function fileName(h) {
  const d = /filename\*?="?([^";]+)"?/i.exec(h["content-disposition"] || "");
  const n = /name="?([^";]+)"?/i.exec(h["content-type"] || "");
  const raw = (d && d[1]) || (n && n[1]) || "";
  return decodeWords(raw.replace(/^utf-8''/i, "")).trim();
}

// ---- codecs ----
function b64(s) {
  const bin = typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("latin1");
  return latin1Bytes(bin);
}
function qp(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else out.push(s.charCodeAt(i) & 0xff);
  }
  return Uint8Array.from(out);
}
function decode(bytes, cs) {
  try { return new TextDecoder((cs || "utf-8").toLowerCase()).decode(bytes); }
  catch { return new TextDecoder("utf-8").decode(bytes); }
}
function latin1Bytes(s) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b; }
function startsWith(buf, s) { const b = enc.encode(s); return b.every((v, i) => buf[i] === v); }
function concat(a, b) { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }
