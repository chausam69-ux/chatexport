// Pro gate via Gumroad license keys.
// 1. Gumroad product → Settings → enable "Generate a unique license key per sale".
// 2. PRODUCT_ID = the product's ID (product page → Settings → shown near "License key"; NOT the permalink slug).
// 3. CHECKOUT_URL = your product link, e.g. https://yourname.gumroad.com/l/chatexport
// Empty CHECKOUT_URL = everything free (beta).
export const CHECKOUT_URL = "https://sandipmor.gumroad.com/l/kgnsqy";
export const PRODUCT_ID = "GGGD3mrmhSlbwEJ4KJdeUg==";
export const PRICE = "$19 one-time";
const VALIDATE_URL = "https://api.gumroad.com/v2/licenses/verify";
const KEY = "chatexport_license";

// pure: should we run the action right now?
export function allowed(checkoutUrl, storedKey) {
  return !checkoutUrl || !!storedKey;
}

export function isPro() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

// Wrap an export action. Free while CHECKOUT_URL is empty; otherwise needs a stored license.
export function gate(fn) {
  return (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (allowed(CHECKOUT_URL, isPro() ? "x" : "")) return fn();
    openModal(fn);
  };
}

// ponytail: validated once on activation, then trusted from localStorage.
// Re-validate every N days if key sharing ever becomes a problem.
export async function activate(key) {
  const r = await fetch(VALIDATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ product_id: PRODUCT_ID, license_key: key, increment_uses_count: "false" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error(j.message || "Invalid key");
  if (j.purchase?.refunded || j.purchase?.chargebacked) throw new Error("This purchase was refunded");
  localStorage.setItem(KEY, key);
}

let dlg;
function openModal(onUnlock) {
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "pro";
    dlg.innerHTML = `
      <form method="dialog">
        <h3>Unlock exports</h3>
        <p>${PRICE}. Unlimited PDF, CSV and .eml exports, forever. Viewing and search stay free.</p>
        <a class="btn" id="pro-buy" target="_blank" rel="noopener">Get a license</a>
        <label>Already have a key?<input id="pro-key" placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" autocomplete="off" spellcheck="false"></label>
        <p class="err" id="pro-err"></p>
        <div class="row"><button class="btn ghost" value="cancel" type="submit">Close</button><button class="btn" id="pro-activate" type="button">Activate</button></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.querySelector("#pro-buy").href = CHECKOUT_URL;
    dlg.querySelector("#pro-activate").onclick = async () => {
      const err = dlg.querySelector("#pro-err");
      const key = dlg.querySelector("#pro-key").value.trim();
      if (!key) return;
      err.textContent = "Checking…";
      try { await activate(key); err.textContent = ""; dlg.close("ok"); }
      catch (e) { err.textContent = e.message; }
    };
  }
  dlg.querySelector("#pro-err").textContent = "";
  dlg.onclose = () => { if (dlg.returnValue === "ok") onUnlock(); };
  dlg.showModal();
}
