/* =====================================================
   ONLINE REGISTRATION SYSTEM - PROFESSOR PORTAL
   Shares the same browser storage as the student portal,
   so bookings and availability stay in sync.
   ===================================================== */

/* ---------- 1. SETUP ---------- */

const $d = document;
const $ = (selector) => $d.querySelector(selector);

const KEY = "ors_student_v1"; // same key as the student portal
let memory, db, me;
const St = { page: "home", date: null, y: 0, m: 0 };

// Faculty roster. Only these Staff IDs can create an account.
const ROSTER = [
  { id: "05", name: "Papio, Blessy",      dept: "Information Management" },
  { id: "06", name: "Remulta, Meryl",     dept: "Clinic Staff" },
  { id: "07", name: "Dayoc, Mary Rose",   dept: "Project Management" },
  { id: "08", name: "Panganiban, Roshyl", dept: "Computer Programming" },
];

// Same time slots as the student portal (minutes from midnight)
const SLOTS = [
  [480, 510], [510, 540], [540, 600], [600, 660], [660, 690],
  [690, 720], [720, 750], [750, 780], [780, 840], [840, 900],
];


/* ---------- 2. HELPERS ---------- */

const esc = (t) => String(t).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmt = (m) => {
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const label = (s) => fmt(s[0]) + " - " + fmt(s[1]);

const dateKey = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const longDate = (k) => {
  const [y, m, d] = k.split("-");
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

const todayKey = () => {
  const n = new Date();
  return dateKey(n.getFullYear(), n.getMonth(), n.getDate());
};

const sha = (pw, salt) =>
  crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + pw))
    .then((b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""));

const rand = (n) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return [...crypto.getRandomValues(new Uint32Array(n))].map((x) => chars[x % chars.length]).join("");
};

const show = (id, on) => $("#" + id).classList.toggle("hide", !on);

const showError = (id, text) => {
  const el = $("#" + id);
  el.textContent = text;
  el.className = "msg" + (text ? "" : " hide");
};

function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
}

function popup(html) {
  $("#dbody").innerHTML = html;
  $("#dlg").showModal();
}
$("#dx").onclick = () => $("#dlg").close();


/* ---------- 3. DATA ---------- */

function readDb() {
  let d;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  d = d || memory || { users: [], consults: [], act: { cap: 100, cur: 76, wait: 12 }, regs: {} };
  d.profUsers = d.profUsers || []; // professor accounts
  d.avail = d.avail || {};         // availability: "profId|date" -> [slot start times]
  return d;
}

function saveDb() {
  memory = db;
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
}

// Reload the latest saved data (the student portal may have changed it)
function refresh() {
  db = readDb();
  if (me) me = db.profUsers.find((u) => u.id === me.id) || me;
}

// Reload -> change something -> save -> redraw
function change(fn) {
  refresh();
  fn();
  saveDb();
  render();
}
refresh();

const myConsults = () => db.consults.filter((c) => c.pid === me.id);
const studentName = (sid) => (db.users.find((u) => u.sid === sid) || {}).name || sid;
const initials = (name) => name.split(/[ ,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const availKey = (date) => me.id + "|" + date;
const availOf = (date) => db.avail[availKey(date)] || [];

// Confirmed consultations from today onward, in time order
const queueList = () =>
  myConsults()
    .filter((c) => c.st === "Confirmed" && c.date >= todayKey())
    .sort((a, b) => a.date.localeCompare(b.date) || a.s - b.s);

// Is this slot already taken by a student on that date?
const isBooked = (date, slot) =>
  myConsults().some((c) =>
    c.date === date && slot[0] < c.e && c.s < slot[1] && ["Scheduled", "Confirmed"].includes(c.st));


/* ---------- 4. AUTHENTICATION ---------- */

$("#t1").onclick = () => { $("#t1").className = "on"; $("#t2").className = ""; show("lf", true); show("sf", false); };
$("#t2").onclick = () => { $("#t2").className = "on"; $("#t1").className = ""; show("lf", false); show("sf", true); };

// Create account -> temporary password
$("#sf").onsubmit = async (e) => {
  e.preventDefault();
  refresh();

  const id = $("#sid").value.trim();
  const email = $("#se").value.trim().toLowerCase();
  const staff = ROSTER.find((p) => p.id === id);

  if (!staff) return showError("serr", "Staff ID not found in the faculty roster. Ask the admin to add you.");
  if (db.profUsers.some((u) => u.id === id)) return showError("serr", "An account already exists for this Staff ID.");
  if (db.profUsers.some((u) => u.email === email)) return showError("serr", "This email is already registered.");

  const temp = rand(8);
  const salt = rand(12);
  db.profUsers.push({ id, name: staff.name, dept: staff.dept, email, salt, hash: await sha(temp, salt), must: true });
  saveDb();

  showError("serr", "");
  $("#sf").reset();
  $("#t1").click();
  $("#lid").value = id;
  popup(`
    <h3>Account created</h3>
    <p style="margin:10px 0">Welcome, <b>${esc(staff.name)}</b><br>Staff ID: <b>${esc(id)}</b></p>
    <p>Temporary password: <span class="temp">${esc(temp)}</span></p>
    <p class="empty" style="margin-top:10px">Sign in with it, then set your own password.
    A copy would be sent to ${esc(email)} on a live server.</p>`);
};

// Sign in
$("#lf").onsubmit = async (e) => {
  e.preventDefault();
  refresh();

  const user = db.profUsers.find((u) => u.id === $("#lid").value.trim());
  if (!user || (await sha($("#lpw").value, user.salt)) !== user.hash)
    return showError("lerr", "Wrong Staff ID or password.");

  showError("lerr", "");
  me = user;
  $("#lpw").value = "";

  if (user.must) { show("auth", false); show("change", true); }
  else enterApp();
};

// Replace the temporary password
$("#cf").onsubmit = async (e) => {
  e.preventDefault();
  const pw = $("#np").value;

  if (pw !== $("#np2").value) return showError("cerr", "Passwords do not match.");
  if ((await sha(pw, me.salt)) === me.hash) return showError("cerr", "Choose a password different from the temporary one.");

  refresh();
  me.salt = rand(12);
  me.hash = await sha(pw, me.salt);
  me.must = false;
  saveDb();

  $("#cf").reset();
  showError("cerr", "");
  show("change", false);
  toast("Password updated");
  enterApp();
};

function enterApp() {
  show("auth", false);
  show("app", true);
  const now = new Date();
  St.page = "home";
  St.date = todayKey();
  St.y = now.getFullYear();
  St.m = now.getMonth();
  render();
}

$("#out").onclick = () => { me = null; show("app", false); show("auth", true); };
$("#bell").onclick = () => {
  const n = myConsults().filter((c) => c.st === "Scheduled").length;
  toast(n ? `${n} pending consultation request${n > 1 ? "s" : ""}` : "No new notifications");
};


/* ---------- 5. SCREENS ---------- */

function go(page) {
  refresh();
  St.page = page;
  render();
}

function render() {
  $d.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.go === St.page));
  $("#who").innerHTML = `${esc(me.name)}<small>Professor · ${esc(me.id)}</small>`;
  $("#view").innerHTML = PAGES[St.page]();
}

const banner = (title, text) => `<div class="banner"><b>${title}</b><span>${text}</span></div>`;

// Weekday + date text for a Date object
const chip = (d) => ({
  wd: d.toLocaleDateString("en-US", { weekday: "short" }),
  md: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  key: dateKey(d.getFullYear(), d.getMonth(), d.getDate()),
});

const PAGES = {

  /* ----- Dashboard ----- */
  home() {
    const mine = myConsults();
    const pending = mine.filter((c) => c.st === "Scheduled");
    const today = mine.filter((c) => c.date === todayKey() && ["Confirmed", "Served"].includes(c.st));

    // Monday to Friday of this week
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const week = [0, 1, 2, 3, 4].map((i) =>
      chip(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));

    const slots = SLOTS.filter((s) => availOf(St.date).includes(s[0]));

    return banner("PROFESSOR / STAFF DASHBOARD", "Manage consultation requests, monitor availability, and track attendance.") + `
      <div class="two">
        <div class="panel">
          <div class="ph">Pending Consultation Request<button data-go="data">View All</button></div>
          ${pending.map((c) => `
            <div class="req">
              <div class="av">${esc(initials(studentName(c.sid)))}</div>
              <div class="info">
                <b>${esc(studentName(c.sid))}</b>
                <small>${esc(c.purpose)}</small>
                <small>${longDate(c.date)} • ${label([c.s, c.e])}</small>
              </div>
              <span class="pend">● Pending</span>
              <button class="btn-yes" data-act="acc:${c.id}">Accept</button>
              <button class="btn-no" data-act="rej:${c.id}">Reject</button>
            </div>`).join("") || `<p class="empty">No pending requests right now.</p>`}
        </div>

        <div class="panel">
          <div class="ph">Availability Tracker<button class="pill" data-go="schedule" style="padding:6px 14px">Set your Availability</button></div>
          <div class="week">
            ${week.map((w) => `
              <button class="day ${St.date === w.key ? "on" : ""}" data-day="${w.key}">
                ${w.wd}<br>${w.md}<br><b>${availOf(w.key).length} slots</b>
              </button>`).join("")}
          </div>
          <div class="legend"><span><i></i>Available</span><span><i class="bk"></i>Booked</span></div>
          <div class="dots">
            ${slots.map((s) => `<span><i class="${isBooked(St.date, s) ? "bk" : ""}"></i>${fmt(s[0])}</span>`).join("")
              || `<span class="empty" style="background:none">No slots set for ${longDate(St.date)}.</span>`}
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="ph">Student List (Today)</div>
        <div class="scroll"><table class="tbl">
          <tr><th>Name</th><th>Student ID</th><th>Time</th><th>Status</th></tr>
          ${today.map((c) => `
            <tr><td>${esc(studentName(c.sid))}</td><td>${esc(c.sid)}</td><td>${label([c.s, c.e])}</td><td>${c.st}</td></tr>`).join("")
            || `<tr><td colspan="4" class="empty">No confirmed students today.</td></tr>`}
        </table></div>
      </div>`;
  },

  /* ----- Consultation queue ----- */
  queue() {
    const q = queueList();
    const cur = q[0];
    const waiting = Math.max(q.length - 1, 0);
    const served = myConsults().filter((c) => c.st === "Served").length;
    const num = (i) => String(served + i + 1).padStart(2, "0");
    const nextItem = (c, i) => `
      <div class="nq"><i>${num(i + 1)}</i>
        <div><b>${esc(studentName(c.sid))}</b><small>${esc(c.sid)} · ${longDate(c.date)}, ${fmt(c.s)}</small></div>
      </div>`;

    return banner("CONSULTATION QUEUE", "Manage your consultation line and keep track of your students.") + `
      <div class="two">
        <div class="panel">
          <h3 style="font-weight:500;margin-bottom:16px">Current Student</h3>
          ${cur ? `
            <div class="cur">
              <div class="av big">${esc(initials(studentName(cur.sid)))}</div>
              <div style="flex:1;min-width:140px">
                <div style="font-size:20px">${esc(studentName(cur.sid))}</div>
                <div class="empty">${esc(cur.sid)}</div>
                <div class="empty" style="font-size:11px">${longDate(cur.date)} · ${label([cur.s, cur.e])}</div>
              </div>
              <div><div class="empty" style="font-size:11px">Current Number</div><div class="num">#${num(0)}</div></div>
            </div>
            <div style="display:flex;gap:14px;margin-top:22px">
              <button class="pill" data-act="served">Mark as Served</button>
              <button class="pill out" data-act="skip">Skip</button>
            </div>` : `<p class="empty">No one in the queue. Accept a request to add a student.</p>`}
        </div>

        <div class="panel">
          <h3 style="font-weight:500;margin-bottom:16px">Next in Queue</h3>
          ${q.slice(1, 4).map((c, i) => nextItem(c, i)).join("") || `<p class="empty">Nobody is waiting.</p>`}
          ${q.length > 4 ? `<div style="text-align:center"><button class="pill out" style="padding:4px 22px" data-act="all">View all</button></div>` : ""}
        </div>
      </div>

      <div class="panel sum" style="max-width:380px">
        <h3 style="font-weight:500">Queue Summary</h3>
        <div>Currently Serving<b>${cur ? "#" + num(0) : "-"}</b></div>
        <div>People Waiting<b>${waiting}</b></div>
        <div>Estimated Waiting Time<b>${waiting * 10} Mins</b></div>
      </div>`;
  },

  /* ----- My availability ----- */
  schedule() {
    const first = new Date(St.y, St.m, 1);
    const days = new Date(St.y, St.m + 1, 0).getDate();
    let cells = "";
    for (let i = 0; i < first.getDay(); i++) cells += "<i></i>";
    for (let d = 1; d <= days; d++) {
      const key = dateKey(St.y, St.m, d);
      const off = key < todayKey() || new Date(St.y, St.m, d).getDay() === 0;
      cells += `<button data-d="${key}" class="${St.date === key ? "on" : ""}" ${off ? "disabled" : ""}>${d}</button>`;
    }

    const rows = SLOTS.filter((s) => availOf(St.date).includes(s[0]));

    return banner("MY AVAILABILITY", "Save your available time slots so students can book a consultation with you.") + `
      <div class="two" style="grid-template-columns:1fr 1fr">
        <div class="panel">
          <h3 style="font-weight:500">Select Date</h3>
          <div class="cm" style="margin-top:10px">
            <button data-act="pm" aria-label="Previous month">‹</button>
            ${first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            <button data-act="nm" aria-label="Next month">›</button>
          </div>
          <div class="calw">${"SMTWTFS".split("").map((l) => `<span>${l}</span>`).join("")}${cells}</div>
        </div>

        <div class="panel">
          <h3 style="font-weight:500;margin-bottom:14px">Available time slots</h3>
          <div class="empty" style="margin-bottom:12px">${longDate(St.date)}</div>
          ${rows.map((s) => {
            const booked = isBooked(St.date, s);
            return `<div class="srow"><span>${label(s)}</span>
              <span class="${booked ? "tagbk" : "tagok"}">${booked ? "Booked" : "Available"}</span>
              ${booked ? "" : `<button class="mini" data-act="rm:${s[0]}">Remove</button>`}</div>`;
          }).join("") || `<p class="empty">No slots saved for this date.</p>`}
          <div style="text-align:center;margin-top:16px"><button class="pill" data-act="add">+ Add time slots</button></div>
        </div>
      </div>`;
  },

  /* ----- Data summary ----- */
  data() {
    const mine = myConsults();
    const count = (st) => mine.filter((c) => c.st === st).length;
    const list = [...mine].sort((a, b) => b.date.localeCompare(a.date) || a.s - b.s);

    return banner("DATA", "A summary of all consultation requests sent to you.") + `
      <div class="stats">
        <div class="panel"><b>${mine.length}</b>Total</div>
        <div class="panel"><b>${count("Scheduled")}</b>Pending</div>
        <div class="panel"><b>${count("Confirmed")}</b>Confirmed</div>
        <div class="panel"><b>${count("Served")}</b>Served</div>
      </div>
      <div class="panel"><div class="ph">All Consultations</div>
        <div class="scroll"><table class="tbl">
          <tr><th>Student</th><th>Date</th><th>Time</th><th>Purpose</th><th>Status</th></tr>
          ${list.map((c) => `<tr><td>${esc(studentName(c.sid))}</td><td>${longDate(c.date)}</td><td>${label([c.s, c.e])}</td><td>${esc(c.purpose)}</td>
            <td>${c.st === "Scheduled" ? "Pending" : c.st}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No consultations yet.</td></tr>`}
        </table></div>
      </div>`;
  },

  /* ----- Profile ----- */
  profile() {
    return `<h3 class="sec">Profile</h3>
      <div class="panel" style="max-width:440px">
        <p><b>${esc(me.name)}</b></p>
        <p class="empty">Staff ID: ${esc(me.id)}<br>${esc(me.dept)}<br>${esc(me.email)}</p>
        <form id="pf">
          <label>New password (8+ characters)</label>
          <input id="p1" type="password" minlength="8" required autocomplete="new-password">
          <label>Confirm</label>
          <input id="p2" type="password" required autocomplete="new-password">
          <div class="msg hide" id="perr"></div>
          <button class="pill" style="margin-top:14px">Change password</button>
        </form>
      </div>`;
  },
};


/* ---------- 6. CLICKS & FORMS ---------- */

$d.addEventListener("click", (e) => {
  const t = e.target.closest("[data-go],[data-act],[data-day],[data-d]");
  if (!t || !me) return;
  const D = t.dataset;

  if (D.go) return go(D.go);
  if (D.day || D.d) { St.date = D.day || D.d; return render(); }

  const [act, arg] = (D.act || "").split(":");

  // Accept / reject a request
  if (act === "acc" || act === "rej") {
    change(() => {
      const c = db.consults.find((x) => x.id === arg);
      if (c) c.st = act === "acc" ? "Confirmed" : "Declined";
    });
    toast(act === "acc" ? "Request accepted" : "Request rejected");
  }

  // Queue buttons
  if (act === "served" || act === "skip") {
    change(() => {
      const c = queueList()[0];
      if (c) c.st = act === "served" ? "Served" : "Skipped";
    });
    toast(act === "served" ? "Marked as served" : "Student skipped");
  }

  if (act === "all") {
    popup(`<h3 style="margin-bottom:14px">Next in Queue</h3>` +
      queueList().slice(1).map((c, i) => `<div class="nq"><i>${i + 2}</i><div><b>${esc(studentName(c.sid))}</b>
        <small>${esc(c.sid)} · ${longDate(c.date)}, ${fmt(c.s)}</small></div></div>`).join(""));
  }

  // Calendar month arrows
  if (act === "pm" || act === "nm") {
    St.m += act === "nm" ? 1 : -1;
    if (St.m < 0) { St.m = 11; St.y--; }
    if (St.m > 11) { St.m = 0; St.y++; }
    render();
  }

  // Add slots: show the ones not saved yet
  if (act === "add") {
    const free = SLOTS.filter((s) => !availOf(St.date).includes(s[0]));
    popup(`<h3 style="margin-bottom:10px">Add time slots</h3><p class="empty">${longDate(St.date)}</p>` +
      (free.length
        ? free.map((s) => `<label class="chk"><input type="checkbox" class="pick" value="${s[0]}"> ${label(s)}</label>`).join("") +
          `<button class="pill" style="margin-top:12px" data-act="save">Save slots</button>`
        : `<p class="empty" style="margin-top:12px">All slots are already added.</p>`));
  }

  if (act === "save") {
    const picked = [...$d.querySelectorAll(".pick:checked")].map((i) => +i.value);
    $("#dlg").close();
    if (!picked.length) return;
    change(() => {
      const key = availKey(St.date);
      db.avail[key] = [...new Set([...(db.avail[key] || []), ...picked])].sort((a, b) => a - b);
    });
    toast("Time slots saved");
  }

  if (act === "rm") {
    change(() => {
      const key = availKey(St.date);
      db.avail[key] = (db.avail[key] || []).filter((s) => s !== +arg);
    });
  }
});

// Change password (Profile page)
$d.addEventListener("submit", async (e) => {
  if (e.target.id !== "pf") return;
  e.preventDefault();
  const pw = $("#p1").value;
  if (pw !== $("#p2").value) return showError("perr", "Passwords do not match.");

  refresh();
  me.salt = rand(12);
  me.hash = await sha(pw, me.salt);
  saveDb();
  $("#pf").reset();
  showError("perr", "");
  toast("Password updated");
});

// Live update when the student portal (another tab) changes data
window.addEventListener("storage", () => {
  if (me && !$("#dlg").open) { refresh(); render(); }
});
