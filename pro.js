// Pro gate. Fill CHECKOUT_URL with your Lemon Squeezy checkout link (product with "license keys" enabled).
// Empty URL = everything free (beta). One constant flips the paywall on.
export const CHECKOUT_URL = "";
export const PRICE = "$19 one-time";
const VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";
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
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ license_key: key }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.valid) throw new Error(j.error || "Invalid or expired key");
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
        <label>Already have a key?<input id="pro-key" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" autocomplete="off" spellcheck="false"></label>
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
