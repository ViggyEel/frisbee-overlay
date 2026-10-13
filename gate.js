// Sign-in gate for the control page and the admin panel. Shows its own screen until the person is signed
// in with Google AND their email is on the access list with a high enough role; then gets out of the way.
// Works offline after the first sign-in: both the sign-in and the role are remembered on the device.
import { onUser, signIn, signOut, watchRole, claimAdmin } from "./db.js";

const RANK = { control: 1, admin: 2 };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// need: "control" or "admin". Resolves with { email, role } once allowed.
export function gate(need, title) {
  const el = document.createElement("div");
  el.id = "gate";
  el.innerHTML = `<style>
    #gate{position:fixed;inset:0;z-index:50;background:#0E0E0F;color:#fff;display:flex;align-items:center;justify-content:center;
      font-family:"bebas-neue-pro","Bebas Neue Pro","Bebas Neue",Impact,"Arial Narrow",sans-serif;letter-spacing:1px;padding:24px;text-align:center}
    #gate .box{max-width:420px;display:flex;flex-direction:column;gap:14px;align-items:stretch}
    #gate h1{margin:0;font-size:40px;letter-spacing:2px} #gate p{margin:0;color:#B9B9BE;font-size:20px}
    #gate button{font:inherit;font-size:24px;letter-spacing:2px;border:0;padding:14px;color:#fff;background:#2A2A2E;cursor:pointer}
    #gate button.go{background:#2E7D4F} #gate a{color:#B9B9BE;font-size:18px}
  </style><div class="box"></div>`;
  document.body.appendChild(el);
  const box = el.querySelector(".box");
  let note = "";                         // last problem (e.g. a refused first-time claim), kept across redraws
  const show = html => { el.style.display = "flex"; box.innerHTML = `<h1>${esc(title)}</h1>${html}${note ? `<p style="color:#F28B82">${esc(note)}</p>` : ""}`; };

  return new Promise(resolve => {
    let stopRole = null, done = false, me = null, claiming = false;
    show("<p>Checking sign-in…</p>");
    onUser(user => {
      me = user?.email || null;
      if (stopRole) { stopRole(); stopRole = null; }
      if (done) { if (!user) location.reload(); return; }      // signed out elsewhere: back to the gate
      if (!user) {
        show(`<p>Sign in with the Google account an admin has added.</p><button class="go" data-g="in">SIGN IN WITH GOOGLE</button>`);
        return;
      }
      show(`<p>Signed in as ${esc(user.email)}</p><p>Checking access…</p>`);
      stopRole = watchRole(user.email, role => {
        // While a first-time claim is waiting for the server, the page's own guess doesn't count.
        if (claiming) return;
        if ((RANK[role] || 0) >= RANK[need]) { done = true; el.remove(); resolve({ email: user.email, role }); return; }
        show(`<p>Signed in as ${esc(user.email)}</p>
          <p>${role ? `This page needs the ${need} role; you have ${role}.` : "This account isn't on the access list yet. Ask an admin to add it."}</p>
          ${role ? "" : `<button data-g="claim">FIRST-TIME SET-UP: MAKE ME ADMIN</button><p style="font-size:16px">Only works while nobody has access yet.</p>`}
          <button data-g="out">SIGN OUT</button>
          ${need === "admin" ? '<a href="control.html">OPEN THE CONTROL PAGE</a>' : ""}`);
      });
    });
    el.addEventListener("click", async e => {
      const g = e.target.closest("[data-g]")?.dataset.g;
      try {
        if (g === "in") await signIn();
        if (g === "out") await signOut();
        if (g === "claim") {
          claiming = true;
          try { await claimAdmin(me); claiming = false; location.reload(); }   // the server agreed: start again as admin
          finally { claiming = false; }
        }
      } catch (err) {
        note = g === "claim" ? "Someone already has access — ask them to add you." : err.message;
        box.insertAdjacentHTML("beforeend", `<p style="color:#F28B82">${esc(note)}</p>`);
      }
    });
  });
}
export { signOut };
