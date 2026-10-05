/* =====================================================
   ONLINE REGISTRATION SYSTEM - STUDENT PORTAL
   Sections:
   1. Setup & constants
   2. Helper functions
   3. Data (saved in the browser)
   4. Authentication (sign up, sign in, change password)
   5. Screens (dashboard, consultation, activities, map, profile, FAQ)
   6. Consultation helpers (time slots & calendar)
   7. Click / input handlers
   ===================================================== */


/* ---------- 1. SETUP & CONSTANTS ---------- */

const $d = document;
const $ = (selector) => $d.querySelector(selector);

const STORAGE_KEY = "ors_student_v1";

let memoryBackup; // used if localStorage is blocked
let db;           // all saved data (users, consultations, activity)
let me;           // the signed-in student
let S;            // screen state (current view, step, selected date...)

// Professors and staff. "off" = start times (in minutes) when they are busy.
const PROFS = [
  { id: "05", name: "Papio, Blessy",      dept: "Information Management", off: [600] },
  { id: "06", name: "Remulta, Meryl",     dept: "Clinic Staff",           off: [600] },
  { id: "07", name: "Dayoc, Mary Rose",   dept: "Project Management",     off: [660] },
  { id: "08", name: "Panganiban, Roshyl", dept: "Computer Programming",   off: [] },
];

const PURPOSES = [
  "Book a Consultation",
  "Academic Advising",
  "Project Guidance",
  "Grade Concern",
];

// Time slots as [start, end] in minutes from midnight (480 = 8:00 AM)
const SLOTS = [
  [480, 510], [510, 540], [540, 600], [600, 660], [660, 690],
  [690, 720], [720, 750], [750, 780], [780, 840], [840, 900],
];


/* ---------- 2. HELPER FUNCTIONS ---------- */

// Make text safe to place inside HTML
const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

// 540 -> "9:00 AM"
const formatTime = (minutes) => {
  const hour = Math.floor(minutes / 60);
  const min = String(minutes % 60).padStart(2, "0");
  const ampm = hour < 12 ? "AM" : "PM";
  return `${hour % 12 || 12}:${min} ${ampm}`;
};

// [540, 600] -> "9:00 AM - 10:00 AM"
const slotLabel = (slot) => formatTime(slot[0]) + " - " + formatTime(slot[1]);

// Build a date key like "2026-09-24" (month is 0-based)
const dateKey = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

// "2026-09-24" -> "September 24, 2026"
const longDate = (key) => {
  const [y, m, d] = key.split("-");
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

// Hash a password with a salt (SHA-256)
const sha = (password, salt) =>
  crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(salt + password))
    .then((buffer) =>
      [...new Uint8Array(buffer)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
    );

// Random text, used for temporary passwords, salts and ids
const randomText = (length) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return [...crypto.getRandomValues(new Uint32Array(length))]
    .map((n) => chars[n % chars.length])
    .join("");
};

// Show or hide an element by id
const show = (id, visible) => $("#" + id).classList.toggle("hide", !visible);

// Show (or clear) an error message inside an element
const showError = (id, text) => {
  const el = $("#" + id);
  el.textContent = text;
  el.className = "msg" + (text ? "" : " hide");
};

// Small message at the bottom of the screen
function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
}

// Open the pop-up window with some HTML inside
function popup(html) {
  $("#dbody").innerHTML = html;
  $("#dlg").showModal();
}
$("#dx").onclick = () => $("#dlg").close();


/* ---------- 3. DATA ---------- */

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return memoryBackup;
}

function saveData() {
  memoryBackup = db;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {}
}

db = loadData() || {
  users: [],
  consults: [],
  act: { cap: 100, cur: 76, wait: 12 }, // Tech Fest capacity numbers
  regs: {},                              // activity registrations by student id
};

// Active (not cancelled) consultations of the signed-in student
const myConsults = () =>
  db.consults.filter((c) => c.sid === me.sid && c.st !== "Cancelled");

const findProf = (id) => PROFS.find((p) => p.id === id);


/* ---------- 4. AUTHENTICATION ---------- */

// Switch between "Sign in" and "Create account" tabs
$("#t1").onclick = () => {
  $("#t1").className = "on";
  $("#t2").className = "";
  show("lf", true);
  show("sf", false);
};
$("#t2").onclick = () => {
  $("#t2").className = "on";
  $("#t1").className = "";
  show("lf", false);
  show("sf", true);
};

// Create account -> generates a temporary password
$("#sf").onsubmit = async (e) => {
  e.preventDefault();

  const sid = $("#sid").value.trim().toUpperCase();
  const email = $("#se").value.trim().toLowerCase();
  const name = $("#sn").value.trim();

  if (!/^[A-Z0-9-]{5,15}$/.test(sid))
    return showError("serr", "Student ID must be 5-15 letters, numbers or dashes.");
  if (db.users.some((u) => u.sid === sid))
    return showError("serr", "An account already exists for this Student ID.");
  if (db.users.some((u) => u.email === email))
    return showError("serr", "This email is already registered.");

  const tempPassword = randomText(8);
  const salt = randomText(12);

  db.users.push({
    sid,
    name,
    email,
    salt,
    hash: await sha(tempPassword, salt),
    must: true, // must change password at first sign in
  });
  saveData();

  showError("serr", "");
  $("#sf").reset();
  $("#t1").click();
  $("#lid").value = sid;

  popup(`
    <h3>Account created</h3>
    <p style="margin:10px 0">Student ID: <b>${esc(sid)}</b></p>
    <p>Temporary password: <span class="temp">${esc(tempPassword)}</span></p>
    <p class="empty" style="margin-top:10px">
      Sign in with it, then set your own password.
      A copy would be sent to ${esc(email)} on a live server.
    </p>
  `);
};

// Sign in
$("#lf").onsubmit = async (e) => {
  e.preventDefault();

  const user = db.users.find(
    (u) => u.sid === $("#lid").value.trim().toUpperCase()
  );

  if (!user || (await sha($("#lpw").value, user.salt)) !== user.hash)
    return showError("lerr", "Wrong Student ID or password.");

  showError("lerr", "");
  me = user;
  $("#lpw").value = "";

  if (user.must) {
    // First login: force a new password
    show("auth", false);
    show("change", true);
  } else {
    enterApp();
  }
};

// Change the temporary password
$("#cf").onsubmit = async (e) => {
  e.preventDefault();

  const newPassword = $("#np").value;

  if (newPassword !== $("#np2").value)
    return showError("cerr", "Passwords do not match.");
  if ((await sha(newPassword, me.salt)) === me.hash)
    return showError("cerr", "Choose a password different from the temporary one.");

  me.salt = randomText(12);
  me.hash = await sha(newPassword, me.salt);
  me.must = false;
  saveData();

  $("#cf").reset();
  showError("cerr", "");
  show("change", false);
  toast("Password updated");
  enterApp();
};

// Open the dashboard after a successful login
function enterApp() {
  show("auth", false);
  show("app", true);

  const now = new Date();
  S = {
    view: "home",
    step: 1,
    prof: PROFS[0],
    purpose: PURPOSES[0],
    date: null,
    slot: null,
    y: now.getFullYear(),
    m: now.getMonth(),
  };
  render();
}

$("#out").onclick = () => {
  me = null;
  show("app", false);
  show("auth", true);
};

$("#bell").onclick = () =>
  toast(
    myConsults().some((c) => c.st === "Confirmed")
      ? "You have a confirmed consultation"
      : "No new notifications"
  );


/* ---------- 5. SCREENS ---------- */

// Change screen
function go(view) {
  S.view = view;
  if (view === "consult") {
    S.step = 1;
    S.date = null;
    S.slot = null;
  }
  render();
}

// Draw the current screen
function render() {
  // highlight the active menu item (the map belongs to Activities)
  const activeMenu = S.view === "map" ? "act" : S.view;
  $d.querySelectorAll("#nav button").forEach((b) =>
    b.classList.toggle("on", b.dataset.go === activeMenu)
  );

  $("#who").innerHTML = `${esc(me.name)}<small>Student · ${esc(me.sid)}</small>`;
  $("#view").innerHTML = VIEWS[S.view]();
}

// One consultation row (used on dashboard and calendar pop-up)
const consultItem = (c) => `
  <div class="item">
    <div>
      ${esc(findProf(c.pid).dept)}
      <small>
        Prof: ${esc(findProf(c.pid).name)}<br>
        ${longDate(c.date)} / ${slotLabel([c.s, c.e])}
      </small>
    </div>
    <span class="badge ${c.st}">${c.st}</span>
  </div>`;

const VIEWS = {

  /* ----- Dashboard ----- */
  home() {
    const upcoming = myConsults().sort(
      (a, b) => a.date.localeCompare(b.date) || a.s - b.s
    );
    const reg = db.regs[me.sid];
    const pending = upcoming.filter((c) => c.st !== "Confirmed").length;
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
    });

    return `
      <div class="welcome">
        <div>
          <h2>Welcome Back!</h2>
          <p>Always stay updated in your Student portal.</p>
        </div>
        <div class="date"><b>${today}</b>${esc(me.sid)}</div>
      </div>

      <h3 class="sec">Quick Actions</h3>
      <div class="qa">
        <button data-go="consult">Book Consultation</button>
        <button data-go="act">Register Activity</button>
        <button data-a="cal">View Calendar</button>
        <button data-go="act">Check Registration status</button>
      </div>

      <div class="grid">
        <div class="panel">
          <div class="ph">Upcoming Consultations<button data-a="cal">View All</button></div>
          ${
            upcoming.slice(0, 2).map(consultItem).join("") ||
            `<p class="empty">No upcoming consultations. Book one to see it here.</p>`
          }
        </div>

        <div class="panel">
          <div class="ph">Registration Status<button data-go="act">View All</button></div>
          <div class="item">Enrolled Courses</div>
          ${
            reg
              ? `<div class="item">Tech Fest 2026
                   <span class="badge Confirmed">${reg.s === "reg" ? "Registered" : "Waitlist #" + reg.pos}</span>
                 </div>`
              : `<p class="empty">No activity registrations yet.</p>`
          }
        </div>

        <div class="panel">
          <div class="ph">Digital Queue Summary<button data-go="consult">View All</button></div>
          <div class="q">Consultation Queue<i class="dot ${pending ? "w" : ""}"></i></div>
          <div class="q">Activity Queue<i class="dot ${reg && reg.s === "wait" ? "w" : ""}"></i></div>
        </div>
      </div>`;
  },

  /* ----- Book a consultation (3 steps) ----- */
  consult() {
    // Step 3: confirmation screen
    if (S.step === 3) {
      const p = S.prof;
      return `
        <span class="back" data-a="s2">← Back</span>
        <div class="big" style="margin:8px 0 2px 36px;font-size:20px">CONFIRM YOUR CONSULTATION</div>
        <p class="sub" style="text-align:center;margin-left:0">Please review your details before confirming</p>

        <div class="conf">
          <div class="who2">
            <i>👤</i>
            <div>
              <b style="font-size:17px">Prof. ${esc(p.name)}</b>
              <div class="empty" style="font-size:16px">Professor</div>
            </div>
          </div>
          <div class="kv">🎯<span>Purpose</span><b>${esc(S.purpose)}</b></div>
          <div class="kv">📅<span>Date</span><b>${longDate(S.date)}</b></div>
          <div class="kv">🕒<span>Time</span><b>${slotLabel(S.slot)}</b></div>
          <p class="empty" style="font-size:10px">
            You are about to book a consultation with Prof. ${esc(p.name)}.
            Please make sure the details are correct.
          </p>
          <div style="display:flex;gap:12px;margin-top:18px">
            <button class="pill" style="flex:1" data-a="book">Confirm Booking</button>
            <button class="pill out" style="flex:1" data-go="home">Cancel</button>
          </div>
        </div>`;
    }

    // Header with step numbers
    const stepNames = ["Select details", "Date &amp; Time", "Confirmation"];
    const stepHtml = (n) =>
      `<span class="${S.step === n ? "on" : ""}"><b>${n}</b>${stepNames[n - 1]}</span>`;

    // Left card: step 1 (details) or step 2 (calendar)
    const leftCard =
      S.step === 1
        ? `
          <label style="margin-top:0">Professor &amp; Staff</label>
          <button class="sel" data-a="pick">
            <b>Prof. ${esc(S.prof.name)}</b>
            <small>${esc(S.prof.dept)}</small>
          </button>

          <label>Purpose</label>
          <select id="pur">
            ${PURPOSES.map(
              (x) => `<option ${x === S.purpose ? "selected" : ""}>${x}</option>`
            ).join("")}
          </select>
          <small class="empty" style="font-size:10px">Select the reason for your consultation</small>

          <div style="text-align:center;margin-top:60px">
            <button class="pill" data-a="s2">Next: Select Date &amp; Time</button>
          </div>`
        : calendarHtml();

    return `
      <span class="back" data-go="home">← BOOK A CONSULTATION</span>
      <p class="sub">Find the best time to consult with your professor</p>

      <div class="cons">
        <div class="panel">
          <div class="steps">${stepHtml(1)}${stepHtml(2)}${stepHtml(3)}</div>
          ${leftCard}
        </div>

        <div class="panel">
          <div class="ph" style="display:block;border:0;margin:0">
            <b>Available Time Slots</b>
            <div class="empty" style="font-size:10px;font-weight:400">
              Slots are based on your professor's availability and current bookings
            </div>
          </div>
          <ul class="slots" style="margin-top:12px">
            ${
              S.date
                ? SLOTS.map(slotHtml).join("")
                : `<li class="empty">Pick a date to see open times.</li>`
            }
          </ul>
        </div>
      </div>`;
  },

  /* ----- Activity registration ----- */
  act() {
    const a = db.act;
    const reg = db.regs[me.sid];
    const isFull = a.cur >= a.cap;

    return `
      <span class="back" data-go="home">← ACTIVITY REGISTRATION</span>
      <p class="sub">Join events, workshops, and school activities to enhance your learning experience.</p>

      <div class="act">
        <div class="panel" style="text-align:center">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <b style="font-size:20px">TECH FEST 2026</b>
            <span class="tag">Ongoing</span>
          </div>
          <p style="font-size:12px;margin:12px 0 30px">Annual Technology and Innovation Festival</p>
          <p>📅 Sep 20, 2026 - Sep 21, 2026</p>
          <p style="margin:6px 0">🕒 08:00 AM - 05:00 PM</p>
          <p>📍 Main Campus Covered Court</p>
          <p style="margin-top:30px;font-size:12px">
            <b>About this activity:</b><br>
            A two-day event featuring tech talks, workshops, and innovation exhibits
            from industry professionals and student organizations.
          </p>
          <button class="pill out" style="margin-top:16px" data-go="map">View on campus map</button>
        </div>

        <div class="panel">
          <b style="font-size:18px">CAPACITY &amp; PARTICIPANTS</b>
          <div class="stat"><span>Total Capacity</span><b>${a.cap}</b></div>
          <div class="stat"><span>Current Participants</span><b>${a.cur}</b></div>
          <div class="stat"><span>Waitlist</span><b>${a.wait}</b></div>

          <div class="stat" style="margin-top:34px">
            <b style="font-size:15px">YOUR QUEUE POSITION</b>
            ${reg ? `<span class="badge Confirmed">${reg.s === "reg" ? "✓" : "#" + reg.pos}</span>` : ""}
          </div>
          <p style="font-size:12px;text-align:center">
            ${
              reg
                ? reg.s === "reg"
                  ? "You are registered. Your seat is confirmed."
                  : "You are currently on the waitlist."
                : "You are not registered yet."
            }
          </p>

          <div style="display:flex;justify-content:space-between;margin-top:26px">
            ${reg ? "" : `<button class="pill" data-a="join">${isFull ? "JOIN WAITLIST" : "REGISTER"}</button>`}
            ${reg ? `<button class="pill out" data-a="leave">CANCEL</button>` : ""}
          </div>
        </div>
      </div>`;
  },

  /* ----- Campus map ----- */
  map() {
    // [name, x, y, icon]
    const pins = [
      ["Auditorium",       250,  70, "🏛"],
      ["Library",          430,  90, "📖"],
      ["Computer Lab 1",   180, 200, "🖥"],
      ["Computer Lab 2",   330, 215, "🖥"],
      ["Admin Main Lobby", 300, 310, "🏛"],
    ];

    const pinHtml = pins
      .map(
        ([name, x, y, icon]) => `
          <g class="pin" data-n="${name.toLowerCase()}">
            <circle cx="${x}" cy="${y}" r="16" fill="#2f55d4" stroke="#fff" stroke-width="2"/>
            <text x="${x}" y="${y + 5}" font-size="14" text-anchor="middle">${icon}</text>
            <text x="${x + 22}" y="${y + 4}" font-size="12" fill="#fff"
                  stroke="#0a1030" stroke-width="3" paint-order="stroke">${name}</text>
          </g>`
      )
      .join("");

    return `
      <span class="back" data-go="act">← CAMPUS MAP</span>
      <p class="sub">Find where your activities and consultations are held.</p>
      <input id="ms" placeholder="Search location" style="max-width:360px;margin:0 0 12px">

      <div class="mapw">
        <svg viewBox="0 0 640 420" role="img" aria-label="Campus map">
          <rect width="640" height="420" fill="#1e3b2a"/>
          <path d="M0 380 L640 330 L640 420 L0 420Z" fill="#3b4252"/>
          <ellipse cx="120" cy="330" rx="50" ry="22" fill="#5aa7d6"/>
          <ellipse cx="320" cy="370" rx="60" ry="24" fill="#5aa7d6"/>
          <polygon points="130,160 380,40 540,110 540,300 300,350 130,250" fill="#b5654a"/>
          <polygon points="130,160 380,40 540,110 300,190" fill="#d9d4c7"/>
          <polygon points="230,200 440,140 440,260 230,290" fill="#8c4a37"/>
          ${pinHtml}
        </svg>

        <div class="leg">
          <b>CAMPUS LOCATIONS</b>
          <p>🏛 1. Main Gate</p>
          <p>🏛 2. South Gate</p>
          <p>🏢 3. Main Building<br>
            <small class="empty">Ground: Admin · 2nd: Computer Labs 1 &amp; 2 · 3rd: Auditorium, Library, Pantry</small>
          </p>
          <p>🏀 4. Gymnasium</p>
          <p>🏛 5. Auditorium</p>
        </div>
      </div>`;
  },

  /* ----- Profile ----- */
  profile() {
    return `
      <h3 class="sec">Profile</h3>
      <div class="panel" style="max-width:440px">
        <p><b>${esc(me.name)}</b></p>
        <p class="empty">Student ID: ${esc(me.sid)}<br>${esc(me.email)}</p>

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

  /* ----- FAQ ----- */
  faq() {
    return `
      <h3 class="sec">FAQ</h3>
      <details>
        <summary>How do I get an account?</summary>
        <p>Choose Create account, enter your name, Student ID and email, then use the temporary password to sign in and set your own.</p>
      </details>
      <details>
        <summary>Why is a time slot unavailable?</summary>
        <p>Either the professor is busy at that time, or you already have a consultation that overlaps with it.</p>
      </details>
      <details>
        <summary>What does the waitlist mean?</summary>
        <p>When an activity is full you join a queue and move up as seats open.</p>
      </details>`;
  },
};


/* ---------- 6. CONSULTATION HELPERS ---------- */

// Is this time slot free? Returns "ok", "taken" or "conflict"
function slotState(slot) {
  // does a booking overlap this slot on the selected date?
  const overlaps = (c) =>
    c.date === S.date &&
    slot[0] < c.e &&
    c.s < slot[1] &&
    c.st !== "Cancelled";

  const profBusy =
    S.prof.off.includes(slot[0]) ||
    db.consults.some((c) => c.pid === S.prof.id && overlaps(c));

  if (profBusy) return "taken";               // professor is not free
  if (myConsults().some(overlaps)) return "conflict"; // student already booked
  return "ok";
}

// One row in the "Available Time Slots" list
function slotHtml(slot, index) {
  const state = slotState(slot);
  const isFree = state === "ok";
  const isSelected = S.slot && S.slot[0] === slot[0];

  return `
    <li>
      <button class="${isFree ? (isSelected ? "on" : "") : "no"}"
              ${isFree ? `data-slot="${index}"` : "disabled"}>
        <span>${slotLabel(slot)}</span>
        <em>${isFree ? "Available" : "Not Available"}</em>
      </button>
    </li>`;
}

// Month calendar (step 2)
function calendarHtml() {
  const firstDay = new Date(S.y, S.m, 1);
  const daysInMonth = new Date(S.y, S.m + 1, 0).getDate();
  const now = new Date();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  // empty cells before the 1st day of the month
  let days = "";
  for (let i = 0; i < firstDay.getDay(); i++) days += "<i></i>";

  // one button per day (past days and Sundays are disabled)
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(S.y, S.m, day);
    const weekday = new Date(S.y, S.m, day).getDay();
    const disabled = key < todayKey || weekday === 0;

    days += `<button data-d="${key}" class="${S.date === key ? "on" : ""}" ${disabled ? "disabled" : ""}>${day}</button>`;
  }

  // does the student already have a consultation on the chosen date?
  const conflict = S.date && myConsults().find((c) => c.date === S.date);

  return `
    <b>Date &amp; Time</b>
    <div class="cm" style="margin-top:8px">
      <button data-a="pm" aria-label="Previous month">‹</button>
      ${firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      <button data-a="nm" aria-label="Next month">›</button>
    </div>

    <div class="calw">
      ${"SMTWTFS".split("").map((letter) => `<span>${letter}</span>`).join("")}
      ${days}
    </div>

    ${
      S.date
        ? `<div class="alert" style="margin-top:14px">
             <i>📅</i>
             <div><small>Selected Date</small><b>${longDate(S.date)}</b></div>
           </div>`
        : ""
    }

    ${
      conflict
        ? `<div class="alert">
             <i>⚠</i>
             <div>
               <b>Time Conflict Detected</b>
               You already have a consultation from ${slotLabel([conflict.s, conflict.e])}
               with Prof. ${esc(findProf(conflict.pid).name)} (${esc(findProf(conflict.pid).dept)})
             </div>
           </div>`
        : ""
    }

    <div style="text-align:center;margin-top:16px">
      <button class="pill" data-a="s3" ${S.slot ? "" : "disabled"}>Next: Confirm</button>
    </div>`;
}


/* ---------- 7. CLICK / INPUT HANDLERS ---------- */

// One listener handles every button that has data-go, data-a, data-d, etc.
$d.addEventListener("click", (e) => {
  const target = e.target.closest(
    "[data-go],[data-a],[data-d],[data-slot],[data-pp],[data-cx]"
  );
  if (!target || !me) return;

  const D = target.dataset;

  // Go to another screen
  if (D.go) {
    go(D.go);
    return;
  }

  // Pick a date on the calendar
  if (D.d) {
    S.date = D.d;
    S.slot = null;
    render();
    return;
  }

  // Pick a time slot
  if (D.slot) {
    S.slot = SLOTS[+D.slot];
    render();
    return;
  }

  // Pick a professor from the pop-up list
  if (D.pp) {
    S.prof = findProf(D.pp);
    $("#dlg").close();
    render();
    return;
  }

  // Cancel a booking
  if (D.cx) {
    const booking = db.consults.find((c) => c.id === D.cx);
    booking.st = "Cancelled";
    saveData();
    $("#dlg").close();
    render();
    toast("Consultation cancelled");
    return;
  }

  // Other actions use data-a="..."
  const action = D.a;

  // remember the purpose dropdown value
  const purposeSelect = $("#pur");
  if (purposeSelect) S.purpose = purposeSelect.value;

  // Open the "Select Professor or Staff" pop-up
  if (action === "pick") {
    popup(`
      <h3 style="margin-bottom:14px">Select Professor or Staff</h3>
      ${PROFS.map(
        (p) => `
          <button class="pf" data-pp="${p.id}">
            <i>${p.id}</i>
            <span><b>${esc(p.name)}</b><small>${esc(p.dept)}</small></span>
          </button>`
      ).join("")}
    `);
  }

  // Step navigation
  if (action === "s2") {
    S.step = 2;
    render();
  }
  if (action === "s3" && S.slot) {
    S.step = 3;
    render();
  }

  // Previous / next month
  if (action === "pm" || action === "nm") {
    S.m += action === "nm" ? 1 : -1;
    if (S.m < 0)  { S.m = 11; S.y--; }
    if (S.m > 11) { S.m = 0;  S.y++; }
    render();
  }

  // Confirm booking
  if (action === "book") {
    db.consults.push({
      id: randomText(6),
      sid: me.sid,
      pid: S.prof.id,
      date: S.date,
      s: S.slot[0],
      e: S.slot[1],
      purpose: S.purpose,
      st: "Scheduled",
    });
    saveData();
    toast("Consultation booked");
    go("home");
  }

  // View calendar pop-up (events + cancel buttons)
  if (action === "cal") {
    const list = myConsults().sort((a, b) => a.date.localeCompare(b.date));
    popup(`
      <h3 style="margin-bottom:12px">My Calendar</h3>
      <div class="item">Tech Fest 2026<small>Sep 20-21, 2026 · 08:00 AM - 05:00 PM</small></div>
      ${
        list
          .map(
            (c) =>
              consultItem(c) +
              `<button class="pill out" style="margin:-6px 0 12px;padding:4px 14px" data-cx="${c.id}">Cancel booking</button>`
          )
          .join("") || `<p class="empty">No consultations booked.</p>`
      }
    `);
  }

  // Register for the activity (or join the waitlist if full)
  if (action === "join") {
    const A = db.act;
    if (A.cur < A.cap) {
      A.cur++;
      db.regs[me.sid] = { s: "reg" };
    } else {
      A.wait++;
      db.regs[me.sid] = { s: "wait", pos: A.wait };
    }
    saveData();
    render();
    toast("Registration saved");
  }

  // Cancel activity registration
  if (action === "leave") {
    const A = db.act;
    const reg = db.regs[me.sid];
    if (reg.s === "reg") A.cur--;
    else A.wait--;
    delete db.regs[me.sid];
    saveData();
    render();
    toast("Registration cancelled");
  }
});

// Keep the purpose dropdown value
$d.addEventListener("change", (e) => {
  if (e.target.id === "pur") S.purpose = e.target.value;
});

// Campus map search: fade pins that don't match
$d.addEventListener("input", (e) => {
  if (e.target.id !== "ms") return;
  const query = e.target.value.toLowerCase();
  $d.querySelectorAll(".pin").forEach((pin) => {
    pin.style.opacity = !query || pin.dataset.n.includes(query) ? 1 : 0.15;
  });
});

// Profile page: change password form
$d.addEventListener("submit", async (e) => {
  if (e.target.id !== "pf") return;
  e.preventDefault();

  const newPassword = $("#p1").value;
  if (newPassword !== $("#p2").value)
    return showError("perr", "Passwords do not match.");

  me.salt = randomText(12);
  me.hash = await sha(newPassword, me.salt);
  saveData();

  $("#pf").reset();
  showError("perr", "");
  toast("Password updated");
});
