// WhatsApp "Export chat" .txt → [{date, sender, text, media, attachment}]
// Handles Android ("12/31/23, 11:59 PM - Name: msg") and iOS ("[31/12/2023, 23:59:01] Name: msg").

const LINE =
  /^‎?\[?(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s?([APap]\.?[Mm]\.?)?\]?\s?(?:-\s)?(.*)$/;

const MEDIA_RE = /^‎?<media omitted>$|^‎?<médias omis>$|^‎?<multimedia omitido>$/i;
const ATTACH_RE = /^‎?(?:<attached:\s*(.+?)>|(.+?)\s\(file attached\))$/i;

function toYear(y) {
  return y.length === 2 ? 2000 + Number(y) : Number(y);
}

export function parseChat(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const raw = [];
  for (const line of lines) {
    const m = LINE.exec(line);
    if (m) {
      raw.push({ n1: +m[1], n2: +m[2], y: toYear(m[3]), h: +m[4], mi: +m[5], s: +(m[6] || 0), ap: m[7], rest: m[8] });
    } else if (raw.length) {
      raw[raw.length - 1].rest += "\n" + line;
    }
  }

  // Decide dd/mm vs mm/dd once for the whole file: any first number > 12 means day-first.
  // ponytail: default to dd/mm on ambiguity (most of world); a locale toggle can come later.
  const monthFirst = raw.some((r) => r.n2 > 12) && !raw.some((r) => r.n1 > 12);

  return raw.map((r) => {
    let h = r.h;
    if (r.ap) {
      const pm = /p/i.test(r.ap);
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    const day = monthFirst ? r.n2 : r.n1;
    const month = monthFirst ? r.n1 : r.n2;
    const date = new Date(r.y, month - 1, day, h, r.mi, r.s);

    let sender = null;
    let body = r.rest.replace(/‎/g, "").trimEnd();
    const idx = body.indexOf(": ");
    if (idx > 0) {
      sender = body.slice(0, idx);
      body = body.slice(idx + 2);
    }

    const media = MEDIA_RE.test(body.trim());
    const am = ATTACH_RE.exec(body.trim());
    const attachment = am ? (am[1] || am[2]) : null;

    return { date, sender, text: body, media: media || !!attachment, attachment };
  });
}
