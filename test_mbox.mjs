import assert from "node:assert/strict";
import { findFromLines, parseMessage, decodeWords } from "./mbox-parser.js";

const enc = new TextEncoder();
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");

const mbox =
`From alice@example.com Mon Jan  1 10:00:00 2024
From: =?UTF-8?B?QWxpY2Ugw5ZzdA==?= <alice@example.com>
To: bob@example.com
Subject: =?utf-8?q?Caf=C3=A9_plans?=
Date: Mon, 1 Jan 2024 10:00:00 +0000
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

Let's meet at the caf=C3=A9.
>From the body, escaped From line.

From bob@example.com Mon Jan  1 11:00:00 2024
From: bob@example.com
Subject: Re: plans
Content-Type: multipart/mixed; boundary="XYZ"

--XYZ
Content-Type: text/html; charset=utf-8

<p>Sure, <b>see you</b></p>
--XYZ
Content-Type: image/png; name="dot.png"
Content-Disposition: attachment; filename="dot.png"
Content-Transfer-Encoding: base64

${png}
--XYZ--
`;

const bytes = enc.encode(mbox);
const offs = findFromLines(bytes);
assert.equal(offs.length, 2, "two messages; '>From ' in body not counted");
assert.equal(offs[0], 0);

const m1 = parseMessage(bytes.subarray(offs[0], offs[1]));
assert.equal(m1.headers.subject, "Café plans");
assert.equal(m1.headers.from, "Alice Öst <alice@example.com>");
assert.match(m1.text, /café\./);
assert.equal(m1.attachments.length, 0);

const m2 = parseMessage(bytes.subarray(offs[1]));
assert.match(m2.html, /<b>see you<\/b>/);
assert.equal(m2.attachments.length, 1);
assert.equal(m2.attachments[0].name, "dot.png");
assert.deepEqual([...m2.attachments[0].bytes], [0x89, 0x50, 0x4e, 0x47]);

// chunk boundary: "From " split across two chunks
const a = bytes.subarray(0, offs[1] + 2), b = bytes.subarray(offs[1] + 2);
const o2 = findFromLines(b, a.length, a.subarray(a.length - 5));
assert.equal(o2[0], offs[1], "boundary straddling chunks found");

assert.equal(decodeWords("plain"), "plain");
console.log("mbox ok");
