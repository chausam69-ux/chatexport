import assert from "node:assert/strict";
import { parseChat } from "./parser.js";

// Android, 12h clock, multiline, system msg, media
const android = `12/31/23, 11:58 PM - Messages and calls are end-to-end encrypted.
12/31/23, 11:59 PM - Alice: Happy new year
soon!
1/1/24, 12:00 AM - Bob: <Media omitted>
1/1/24, 12:01 AM - Bob: IMG-20240101-WA0001.jpg (file attached)
`;

// iOS, 24h clock, brackets, LRM marks, seconds
const ios = `‎[31/12/2023, 23:59:01] Alice: Happy new year
[01/01/2024, 00:00:30] Bob: ‎<attached: 00000012-PHOTO-2024-01-01-00-00-30.jpg>
[01/01/2024, 00:01:00] Bob: ok: with colon in text
`;

const a = parseChat(android);
assert.equal(a.length, 4);
assert.equal(a[0].sender, null, "system message has no sender");
assert.equal(a[1].sender, "Alice");
assert.equal(a[1].text, "Happy new year\nsoon!", "multiline joined");
assert.equal(a[1].date.getFullYear(), 2023);
assert.equal(a[1].date.getHours(), 23);
assert.equal(a[2].media, true, "<Media omitted> flagged");
assert.equal(a[3].attachment, "IMG-20240101-WA0001.jpg");

const i = parseChat(ios);
assert.equal(i.length, 3);
assert.equal(i[0].sender, "Alice");
assert.equal(i[0].date.getSeconds(), 1);
assert.equal(i[1].attachment, "00000012-PHOTO-2024-01-01-00-00-30.jpg");
assert.equal(i[2].text, "ok: with colon in text", "only first ': ' splits sender");

// day-first vs month-first: 13/01 can only be dd/mm → whole file treated dd/mm
const dayFirst = `13/01/2024, 10:00 - A: x\n01/02/2024, 10:00 - A: y\n`;
const d = parseChat(dayFirst);
assert.equal(d[1].date.getMonth(), 1, "01/02 read as 1 Feb when file is dd/mm");

console.log("parser ok");
