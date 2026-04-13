// ─── Constants ────────────────────────────

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const _today = new Date();
const TODAY_IDX = _today.getDay() === 0 ? 6 : _today.getDay() - 1;
const TODAY_KEY = `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-${String(_today.getDate()).padStart(2,'0')}`;
const WILT_HOURS = { high: 24, medium: 72, low: 168 };
const WATER_AMT  = { high: 15, medium: 15, low: 15 };
const STUDY_TIMES = [
  { label: '15 min', pct: 15 },
  { label: '30 min', pct: 30 },
  { label: '45 min', pct: 45 },
  { label: '1 hour', pct: 60 },
  { label: '1.5 hrs', pct: 90 },
];
const PLANT_OPTIONS = ['🌸','🌺','🌻','🌹','🌷','🌼','💐','🌿','🍀','🌱','🌵','🎋','🪴','🎍','🍃'];
const WEED_EMOJI = '🐛';
const MISS_WEED1 = 0.40;
const MISS_WEED2 = 0.60;
const MIN_DAYS_FOR_WEED = 3; // need at least 3 days of data before weeds can spawn

// ─── State ────────────────────────────────

let subjects  = JSON.parse(localStorage.getItem('bloom_subjects')  || '[]');
let schedule  = JSON.parse(localStorage.getItem('bloom_schedule')  || '{}');
let hwLog     = JSON.parse(localStorage.getItem('bloom_hwlog')     || '{}');
let todayHW   = JSON.parse(localStorage.getItem('bloom_todayHW')   || '{}');
let weedState = JSON.parse(localStorage.getItem('bloom_weed')      || '{"level":0,"readyToPull":false,"lastChecked":null}');
let pullShown = false;
let selectedPlant = PLANT_OPTIONS[0];
let weedSlot = null; // fixed random slot for weed card this session

function save() {
  localStorage.setItem('bloom_subjects', JSON.stringify(subjects));
  localStorage.setItem('bloom_schedule',  JSON.stringify(schedule));
  localStorage.setItem('bloom_hwlog',     JSON.stringify(hwLog));
  localStorage.setItem('bloom_todayHW',   JSON.stringify(todayHW));
  localStorage.setItem('bloom_weed',      JSON.stringify(weedState));
}

// ─── Health ───────────────────────────────

function getHealth(s) {
  if (s.dead) return 0;
  const hoursSince = (Date.now() - (s.lastWatered || s.created)) / 3600000;
  return Math.max(0, Math.min(100, 100 - (hoursSince / WILT_HOURS[s.freq]) * 100));
}

function healthColor(h) {
  if (h > 65) return '#7a9e6e';
  if (h > 35) return '#c9a85a';
  if (h > 5)  return '#c97b5a';
  return '#aaa';
}

function healthLabel(h) {
  if (h > 65) return 'Thriving';
  if (h > 35) return 'Okay';
  if (h > 5)  return 'Thirsty!';
  return 'Dormant';
}

// ─── Miss Rate (rolling 7-day, assigned days only) ─

function getMissData() {
  let assigned = 0, missed = 0, daysWithData = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dayLog = hwLog[key];
    if (!dayLog) continue;
    const entries = Object.values(dayLog);
    if (entries.length > 0) daysWithData++;
    entries.forEach(done => {
      assigned++;
      if (!done) missed++;
    });
  }
  return { rate: assigned === 0 ? 0 : missed / assigned, daysWithData };
}

// ─── Golden ───────────────────────────────
// Golden = completed ALL assigned homework last time each subject was assigned.
// If the most recent assigned day was missed, not golden.

function isGolden(sid) {
  // Find the most recent day this subject had assigned homework
  for (let i = 0; i <= 6; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dayLog = hwLog[key];
    if (!dayLog || dayLog[sid] === undefined) continue;
    // Found the most recent assigned day — return whether it was done
    return dayLog[sid] === true;
  }
  return false; // no data yet
}

// ─── Weed (end-of-day check only) ─────────

function updateWeed() {
  const { rate, daysWithData } = getMissData();

  // Only recalculate weed level once per day at midnight
  const alreadyCheckedToday = weedState.lastChecked === TODAY_KEY;

  if (!alreadyCheckedToday) {
    weedState.lastChecked = TODAY_KEY;

    // Need minimum days of data before weeds can appear
    if (daysWithData >= MIN_DAYS_FOR_WEED) {
      const prev = weedState.level;
      if (rate >= MISS_WEED2)      weedState.level = 2;
      else if (rate >= MISS_WEED1) weedState.level = 1;
      else {
        if (prev > 0) weedState.readyToPull = true;
        weedState.level = 0;
      }
    }
    save();
  }

  updateBgColor();
  renderGarden(); // re-render so weed card appears/disappears

  if (weedState.readyToPull && weedState.level === 0 && !pullShown) {
    pullShown = true;
    document.getElementById('pull-overlay').classList.add('show');
  }
}

function pullWeed() {
  weedState.readyToPull = false;
  pullShown = false;
  weedSlot = null;
  save();
  document.getElementById('pull-overlay').classList.remove('show');
  showToast('🐛 Weed pulled! Garden is clearing ✨');
  updateBgColor();
  renderGarden();
}

function updateBgColor() {
  const root = document.documentElement;
  if (weedState.level === 2) {
    root.style.setProperty('--bg', '#e8e0d0');
    root.style.setProperty('--surface', '#f0e8da');
  } else if (weedState.level === 1) {
    root.style.setProperty('--bg', '#ede8df');
    root.style.setProperty('--surface', '#f5f0e8');
  } else {
    root.style.setProperty('--bg', '#f5f0eb');
    root.style.setProperty('--surface', '#faf7f4');
  }
  // Remove old brightness filter
  document.body.style.filter = '';
}

// ─── Weed Card ────────────────────────────

function buildWeedCard() {
  const card = document.createElement('div');
  card.className = 'plant-card weed-card';
  const label = weedState.level === 2 ? 'Overgrown' : 'Sprouting';
  card.innerHTML = `
    <div class="plant-name" style="color:var(--danger)">Weed</div>
    <div style="font-size:48px;margin:4px 0;animation:weedSway 2s ease-in-out infinite">${WEED_EMOJI}</div>
    <div class="health-label" style="color:var(--danger)">${label}</div>
    <div style="font-size:10px;color:var(--muted);text-align:center;line-height:1.5;margin-top:2px">Keep up with homework to pull this weed!</div>
  `;
  return card;
}

// ─── Homework Banner ──────────────────────

function renderHWBanner() {
  const chips = document.getElementById('hw-chips');
  chips.innerHTML = '';

  const todaySubjects = subjects
    .filter(s => schedule[s.id] && schedule[s.id][TODAY_IDX]);

  if (todaySubjects.length === 0) {
    chips.innerHTML = '<div class="hw-none">No subjects scheduled today — enjoy! 🌞</div>';
    return;
  }

  todaySubjects.forEach(s => {
    const done = todayHW[s.id] === true;
    const chip = document.createElement('div');
    chip.className = `hw-chip ${done ? 'done' : ''}`;
    chip.innerHTML = `<div class="chip-check">${done ? '✓' : ''}</div>${s.emoji} ${s.name}`;
    chip.onclick = () => toggleHW(s.id);
    chips.appendChild(chip);
  });
}

function toggleHW(sid) {
  const wasDone = todayHW[sid] === true;
  todayHW[sid] = !wasDone;

  if (!hwLog[TODAY_KEY]) hwLog[TODAY_KEY] = {};
  hwLog[TODAY_KEY][sid] = todayHW[sid];

  if (todayHW[sid]) {
    const s = subjects.find(s => s.id === sid);
    if (s && !s.dead) {
      const h = getHealth(s);
      const newH = Math.min(100, h + WATER_AMT[s.freq]);
      const dph = 100 / WILT_HOURS[s.freq];
      s.lastWatered = Date.now() - ((100 - newH) / dph) * 3600000;
      showToast(`${s.emoji} ${s.name} homework done! 💧`);
    }
  }

  save();
  renderHWBanner();
  renderGarden(); // updates badges and borders instantly, but does NOT recalc weed level
}

// ─── Face SVG ─────────────────────────────

function faceSVG(health) {
  if (health > 65) {
    return `<svg width="32" height="18" viewBox="0 0 32 18"><path d="M5 3 Q16 16 27 3" stroke="#3a3530" stroke-width="2.5" stroke-linecap="round" fill="none"/><circle cx="10" cy="6" r="2.2" fill="#3a3530"/><circle cx="22" cy="6" r="2.2" fill="#3a3530"/></svg>`;
  } else if (health > 35) {
    return `<svg width="32" height="14" viewBox="0 0 32 14"><path d="M8 8 L24 8" stroke="#3a3530" stroke-width="2.5" stroke-linecap="round"/><circle cx="10" cy="4" r="2" fill="#3a3530"/><circle cx="22" cy="4" r="2" fill="#3a3530"/></svg>`;
  } else {
    return `<svg width="32" height="18" viewBox="0 0 32 18"><path d="M5 15 Q16 5 27 15" stroke="#3a3530" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M7 5 Q10 3 13 5" stroke="#3a3530" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M19 5 Q22 3 25 5" stroke="#3a3530" stroke-width="2" stroke-linecap="round" fill="none"/></svg>`;
  }
}

// ─── Garden ───────────────────────────────

function renderGarden() {
  const grid = document.getElementById('garden-grid');
  grid.innerHTML = '';

  // Build list of cards to insert, then inject weed at fixed random slot
  const cards = [];

  subjects.forEach((s, i) => {
    const h = getHealth(s);
    const dead    = s.dead || h <= 0;
    const wilting = !dead && h <= 35;
    // Golden: only if homework was done AND not currently due
    const hwDoneToday = !schedule[s.id] || !schedule[s.id][TODAY_IDX] || todayHW[s.id] === true;
    const golden  = !dead && isGolden(s.id) && hwDoneToday;
    const hasHW   = schedule[s.id] && schedule[s.id][TODAY_IDX] && todayHW[s.id] === false;

    const card = document.createElement('div');
    let cls = 'plant-card';
    if (dead)         cls += ' dead';
    else if (wilting) cls += ' wilting';
    if (golden)       cls += ' golden';
    if (hasHW)        cls += ' has-homework';
    card.className = cls;

    if (dead) {
      card.innerHTML = `
        <div class="plant-name">${s.name}</div>
        <div style="font-size:40px;margin:6px 0">🌰</div>
        <div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.07em">Dormant</div>
        <button class="seed-btn" onclick="revive(${i})">🌱 Replant (15 min)</button>
        <button class="seed-btn" style="background:var(--danger-light);color:var(--danger);margin-top:4px" onclick="deleteSubject('${s.id}')">🗑️ Remove</button>`;
    } else {
      const wl = hasHW ? '📝 Do homework' : '💧 Study';
      const wc = hasHW ? 'water-btn hw' : 'water-btn';
      let badge = '';
      if (hasHW)        badge = `<div class="badge badge-hw">📝 Due</div>`;
      else if (wilting) badge = `<div class="badge badge-danger">Thirsty</div>`;
      card.innerHTML = `
        ${badge}
        <div class="face-wrap">
          <div style="font-size:42px;line-height:1;${wilting?'filter:saturate(0.45)':''}">${s.emoji}</div>
          <div style="position:absolute;bottom:0px">${faceSVG(h)}</div>
        </div>
        <div class="plant-name">${s.name}</div>
        <div class="health-bar-wrap"><div class="health-bar" style="width:${h}%;background:${healthColor(h)}"></div></div>
        <div class="health-label">${healthLabel(h)}</div>
        <button class="${wc}" onclick="toggleHWMenu(${i}, ${hasHW}, this)">${wl}</button>
        <button class="water-btn" style="background:var(--danger-light);color:var(--danger);margin-top:4px" onclick="deleteSubject('${s.id}')">🗑️ Remove</button>`;
    }
    cards.push(card);
  });

  // Add card at the end
  const addCard = document.createElement('div');
  addCard.className = 'add-card';
  addCard.onclick = openAddModal;
  addCard.innerHTML = `<span class="plus">+</span><span>New subject</span>`;

  // Inject weed card at a fixed random slot (chosen once per session)
  if (weedState.level > 0) {
    if (weedSlot === null) {
      weedSlot = Math.floor(Math.random() * (cards.length + 1));
    }
    const slot = Math.min(weedSlot, cards.length);
    cards.splice(slot, 0, buildWeedCard());
  }

  cards.forEach(c => grid.appendChild(c));
  grid.appendChild(addCard);

  updateSubtitle();

  // auto-mark dead if health hits 0
  subjects.forEach((s, i) => {
    if (!s.dead && getHealth(s) <= 0) {
      subjects[i].dead = true;
      save();
    }
  });
}

function updateSubtitle() {
  const n = subjects.filter(s => !s.dead && getHealth(s) <= 35).length;
  const el = document.getElementById('garden-subtitle');
  if (subjects.length === 0) el.textContent = 'Your garden 🌿';
  else if (n === 0) el.textContent = 'Everything is thriving 🌿';
  else if (n === 1) el.textContent = '1 plant needs attention 💧';
  else el.textContent = `${n} plants need attention 💧`;
}

// ─── Water / Revive / Delete ──────────────

function water(i, pct) {
  const s = subjects[i];
  const h = getHealth(s);
  const newH = Math.min(100, h + pct);
  const dph = 100 / WILT_HOURS[s.freq];
  subjects[i].lastWatered = Date.now() - ((100 - newH) / dph) * 3600000;
  subjects[i].dead = false;

  if (schedule[s.id] && schedule[s.id][TODAY_IDX] && todayHW[s.id] === false) {
    todayHW[s.id] = true;
    if (!hwLog[TODAY_KEY]) hwLog[TODAY_KEY] = {};
    hwLog[TODAY_KEY][s.id] = true;
    renderHWBanner();
  }
  save();
  renderGarden();
  showToast(`${s.emoji} ${s.name} studied! +${pct}% 💧`);
}

let openPopover = null;

function toggleHWMenu(i, hasHW, btnEl) {
  // close any already open popover
  if (openPopover) {
    openPopover.remove();
    openPopover = null;
  }

  const pop = document.createElement('div');
  pop.className = 'study-popover';

  if (hasHW) {
    // homework button just does it immediately, no time picker needed
    water(i, 30);
    return;
  }

  STUDY_TIMES.forEach(t => {
    const b = document.createElement('button');
    b.className = 'popover-btn';
    b.textContent = t.label;
    b.onclick = (e) => {
      e.stopPropagation();
      pop.remove();
      openPopover = null;
      water(i, t.pct);
    };
    pop.appendChild(b);
  });

  btnEl.parentNode.insertBefore(pop, btnEl.nextSibling);
  openPopover = pop;

  // close if clicking anywhere else
  setTimeout(() => {
    document.addEventListener('click', function handler() {
      pop.remove();
      openPopover = null;
      document.removeEventListener('click', handler);
    }, { once: true });
  }, 0);
}

function revive(i) {
  const s = subjects[i];
  const dph = 100 / WILT_HOURS[s.freq];
  subjects[i].lastWatered = Date.now() - ((100 - 30) / dph) * 3600000;
  subjects[i].dead = false;
  save();
  renderGarden();
  showToast(`${s.emoji} ${s.name} is sprouting back! 🌱`);
}

function deleteSubject(id) {
  const idx = subjects.findIndex(s => s.id === id);
  if (idx === -1) return;
  const s = subjects[idx];
  subjects.splice(idx, 1);
  delete schedule[id];
  delete todayHW[id];
  save();
  renderGarden();
  renderTimetable();
  renderHWBanner();
  showToast(`${s.emoji} ${s.name} removed 🌿`);
}

// ─── Timetable ────────────────────────────

function renderTimetable() {
  const table = document.getElementById('timetable');
  if (subjects.length === 0) {
    table.innerHTML = `<tr><td style="padding:40px;color:var(--muted);text-align:center;font-size:13px">Add subjects first.</td></tr>`;
    return;
  }
  let html = `<thead><tr><th>Subject</th>${DAYS.map((d,i)=>`<th class="${i===TODAY_IDX?'today-col':''}">${d}</th>`).join('')}</tr></thead><tbody>`;
  subjects.forEach(s => {
    if (!schedule[s.id]) schedule[s.id] = {};
    html += `<tr><td><span class="subj-dot" style="background:${healthColor(getHealth(s))}"></span>${s.emoji} ${s.name}</td>`;
    DAYS.forEach((d, di) => {
      const on = !!schedule[s.id][di];
      html += `<td class="${di===TODAY_IDX?'today-col':''}">
        <button class="day-cell ${on?'active':''}" onclick="toggleDay('${s.id}',${di})">
          <span class="day-cell-inner">✓</span>
          <span class="day-cell-dot"></span>
        </button></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;
}

function toggleDay(sid, di) {
  if (!schedule[sid]) schedule[sid] = {};
  schedule[sid][di] = !schedule[sid][di];
  if (di === TODAY_IDX) {
    if (!schedule[sid][di]) delete todayHW[sid];
    else if (todayHW[sid] === undefined && localStorage.getItem('bloom_checkin') === TODAY_KEY) {
      todayHW[sid] = false;
    }
  }
  save();
  renderTimetable();
  renderHWBanner();
  renderGarden();
}

// ─── Daily Check-in Screen ────────────────

function showCheckin() {
  const todaySubjects = subjects.filter(s => schedule[s.id] && schedule[s.id][TODAY_IDX]);
  if (todaySubjects.length === 0) return; // nothing scheduled, skip

  const screen = document.getElementById('checkin-screen');
  const list = document.getElementById('checkin-list');
  list.innerHTML = '';

  todaySubjects.forEach(s => {
    const item = document.createElement('div');
    item.className = 'checkin-item';
    item.innerHTML = `
      <label class="checkin-label">
        <input type="checkbox" class="checkin-box" data-id="${s.id}" ${todayHW[s.id] ? 'checked' : ''}>
        <span class="checkin-check"></span>
        <span>${s.emoji} ${s.name}</span>
      </label>`;
    list.appendChild(item);
  });

  screen.classList.remove('hidden');
  screen.style.display = 'flex';
}

function confirmCheckin() {
  const boxes = document.querySelectorAll('.checkin-box');
  boxes.forEach(box => {
      const sid = box.dataset.id;
      if (box.checked) {
        // has homework due today — mark as due but NOT done yet
        todayHW[sid] = false;
      } else {
        // no homework today — remove entirely
        delete todayHW[sid];
        document.getElementById('debug').textContent = 'todayHW after checkin: ' + JSON.stringify(todayHW);
      }
    });
  

  localStorage.setItem('bloom_checkin', TODAY_KEY);
  save();

  const screen = document.getElementById('checkin-screen');
  screen.classList.add('hidden');
  setTimeout(() => screen.style.display = 'none', 400);

  renderHWBanner();
  renderGarden();
}

// ─── Modal ────────────────────────────────

function buildPlantPicker() {
  const picker = document.getElementById('plant-picker');
  picker.innerHTML = '';
  PLANT_OPTIONS.forEach(e => {
    const btn = document.createElement('button');
    btn.className = `plant-opt ${e===selectedPlant?'selected':''}`;
    btn.textContent = e;
    btn.onclick = () => { selectedPlant = e; buildPlantPicker(); };
    picker.appendChild(btn);
  });
}

function openAddModal() {
  document.getElementById('input-name').value = '';
  document.getElementById('input-freq').value = 'medium';
  selectedPlant = PLANT_OPTIONS[Math.floor(Math.random()*PLANT_OPTIONS.length)];
  buildPlantPicker();
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('input-name').focus(), 120);
}

function closeModal(e) { if (e.target === document.getElementById('modal-overlay')) closeModalDirect(); }
function closeModalDirect() { document.getElementById('modal-overlay').classList.remove('open'); }

function addSubject() {
  const name = document.getElementById('input-name').value.trim();
  if (!name) { document.getElementById('input-name').focus(); return; }
  const freq = document.getElementById('input-freq').value;
  subjects.push({ id: Date.now().toString(), name, emoji: selectedPlant, freq, created: Date.now(), lastWatered: Date.now(), dead: false });
  const newId = subjects[subjects.length - 1].id;
  schedule[newId] = {};
  save();
  closeModalDirect();
  renderGarden();
  renderTimetable();
  renderHWBanner();
  showToast(`${selectedPlant} ${name} planted!`);
}

// ─── Welcome ──────────────────────────────

function dismissWelcome() {
  const ws = document.getElementById('welcome-screen');
  ws.classList.add('hidden');
  setTimeout(() => ws.style.display = 'none', 400);
  localStorage.setItem('bloom_welcomed', '1');
  openAddModal();
}

// ─── Tabs ─────────────────────────────────

let hasVisitedTimetable = false;

function showTab(tab) {
  document.getElementById('view-garden').style.display    = tab==='garden'    ? '' : 'none';
  document.getElementById('view-timetable').style.display = tab==='timetable' ? '' : 'none';
  document.getElementById('tab-garden').classList.toggle('active', tab==='garden');
  document.getElementById('tab-timetable').classList.toggle('active', tab==='timetable');
  if (tab==='timetable') renderTimetable();

  // First time returning to garden after visiting timetable — show check-in if not done today
  if (tab === 'garden' && hasVisitedTimetable) {
    const lastCheckin = localStorage.getItem('bloom_checkin');
    const todaySubjects = subjects.filter(s => schedule[s.id] && schedule[s.id][TODAY_IDX]);
    if (lastCheckin !== TODAY_KEY && todaySubjects.length > 0) {
      showCheckin();
    }
    hasVisitedTimetable = false; // reset so it doesn't keep popping up
  }

  if (tab === 'timetable') hasVisitedTimetable = true;
}

// ─── Toast ────────────────────────────────

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ─── Init ─────────────────────────────────

// Migrate old subjects without IDs
subjects.forEach((s, i) => {
  if (!s.id) subjects[i].id = (s.created || Date.now() + i).toString();
});
save();

// Show welcome or app
if (!localStorage.getItem('bloom_welcomed')) {
  // welcome screen stays visible
} else {
  document.getElementById('welcome-screen').style.display = 'none';

  // Show daily check-in once per day, only if subjects exist AND have timetable days set
  const lastCheckin = localStorage.getItem('bloom_checkin');
  const todaySubjects = subjects.filter(s => schedule[s.id] && schedule[s.id][TODAY_IDX]);
  if (lastCheckin !== TODAY_KEY && todaySubjects.length > 0) {
    showCheckin();
  }
}

updateBgColor();
renderGarden();
renderHWBanner();
updateWeed();

// Remove old weed bar (no longer used)
document.getElementById('weed-bar').style.display = 'none';

// Auto-refresh every 60 seconds
setInterval(() => { renderGarden(); }, 60000);

// Check weed at midnight
function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight - now;
}
setTimeout(() => {
  updateWeed();
  setInterval(updateWeed, 24 * 60 * 60 * 1000);
}, msUntilMidnight());
