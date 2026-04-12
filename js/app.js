// ─── Constants ────────────────────────────

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const TODAY_IDX = (new Date().getDay() + 6) % 7;
const TODAY_KEY = new Date().toISOString().slice(0,10);
const WILT_HOURS = { high: 24, medium: 72, low: 168 };
const WATER_AMT  = { high: 45, medium: 32, low: 22 };
const PLANT_OPTIONS = ['🌸','🌺','🌻','🌹','🌷','🌼','💐','🌿','🍀','🌱','🌵','🎋','🪴','🎍','🍃'];
const MISS_WEED1 = 0.40; // baby weed
const MISS_WEED2 = 0.60; // full weed

// ─── State ────────────────────────────────

let subjects  = JSON.parse(localStorage.getItem('bloom_subjects')  || '[]');
let schedule  = JSON.parse(localStorage.getItem('bloom_schedule')  || '{}');
let hwLog     = JSON.parse(localStorage.getItem('bloom_hwlog')     || '{}');
let todayHW   = JSON.parse(localStorage.getItem('bloom_todayHW')   || '{}');
let weedState = JSON.parse(localStorage.getItem('bloom_weed')      || '{"level":0,"readyToPull":false}');
let pullShown = false;
let selectedPlant = PLANT_OPTIONS[0];

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

function getMissRate() {
  let assigned = 0, missed = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0,10);
    const dayLog = hwLog[key];
    if (!dayLog) continue;
    Object.values(dayLog).forEach(done => {
      assigned++;
      if (!done) missed++;
    });
  }
  return assigned === 0 ? 0 : missed / assigned;
}

// ─── Golden (all assigned hw done in last 7 days) ─

function isGolden(sid) {
  let assigned = 0, done = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0,10);
    const dayLog = hwLog[key];
    if (!dayLog || dayLog[sid] === undefined) continue;
    assigned++;
    if (dayLog[sid]) done++;
  }
  return assigned >= 1 && done === assigned;
}

// ─── Weed ─────────────────────────────────

function updateWeed() {
  const rate = getMissRate();
  const prev = weedState.level;

  if (rate >= MISS_WEED2)      weedState.level = 2;
  else if (rate >= MISS_WEED1) weedState.level = 1;
  else {
    if (prev > 0) weedState.readyToPull = true;
    weedState.level = 0;
  }

  save();
  renderWeeds();
  updateDarkness();

  if (weedState.readyToPull && weedState.level === 0 && !pullShown) {
    pullShown = true;
    document.getElementById('pull-overlay').classList.add('show');
  }
}

function pullWeed() {
  weedState.readyToPull = false;
  pullShown = false;
  save();
  document.getElementById('pull-overlay').classList.remove('show');
  showToast('🌿 Weed pulled! Garden is clearing ✨');
  renderWeeds();
  updateDarkness();
}

function renderWeeds() {
  const bar = document.getElementById('weed-bar');
  bar.innerHTML = '';
  if (weedState.level === 0) return;
  const count = weedState.level === 1 ? 3 : 5;
  const emojis = ['🌿','🍃','☘️','🌾','🌿'];
  const heights = [30, 50, 25, 40, 35];
  for (let i = 0; i < count; i++) {
    const item = document.createElement('div');
    item.className = 'weed-item';
    const h = heights[i] * (weedState.level === 2 ? 1.4 : 1);
    item.innerHTML = `<div class="weed-head">${emojis[i]}</div><div class="weed-stem" style="height:${h}px"></div>`;
    bar.appendChild(item);
  }
}

function updateDarkness() {
  const d = weedState.level === 2 ? 1 : weedState.level === 1 ? 0.5 : 0;
  document.documentElement.style.setProperty('--darkness', d);
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
  updateWeed();
  renderHWBanner();
  renderGarden();
}

// ─── Face SVG ─────────────────────────────

function faceSVG(health) {
  if (health > 65) {
    // big smile, dot eyes
    return `<svg width="32" height="18" viewBox="0 0 32 18"><path d="M5 3 Q16 16 27 3" stroke="#3a3530" stroke-width="2.5" stroke-linecap="round" fill="none"/><circle cx="10" cy="6" r="2.2" fill="#3a3530"/><circle cx="22" cy="6" r="2.2" fill="#3a3530"/></svg>`;
  } else if (health > 35) {
    // neutral
    return `<svg width="32" height="14" viewBox="0 0 32 14"><path d="M8 8 L24 8" stroke="#3a3530" stroke-width="2.5" stroke-linecap="round"/><circle cx="10" cy="4" r="2" fill="#3a3530"/><circle cx="22" cy="4" r="2" fill="#3a3530"/></svg>`;
  } else {
    // sad, worried brows
    return `<svg width="32" height="18" viewBox="0 0 32 18"><path d="M5 15 Q16 5 27 15" stroke="#3a3530" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M7 5 Q10 3 13 5" stroke="#3a3530" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M19 5 Q22 3 25 5" stroke="#3a3530" stroke-width="2" stroke-linecap="round" fill="none"/></svg>`;
  }
}

// ─── Garden ───────────────────────────────

function renderGarden() {
  const grid = document.getElementById('garden-grid');
  grid.innerHTML = '';
  subjects.forEach((s, i) => {
    const h = getHealth(s);
    const dead   = s.dead || h <= 0;
    const wilting = !dead && h <= 35;
    const golden  = !dead && isGolden(s.id);
    const hasHW   = schedule[s.id] && schedule[s.id][TODAY_IDX] && todayHW[s.id] === false;
    const card = document.createElement('div');

    let cls = 'plant-card';
    if (dead)    cls += ' dead';
    else if (wilting) cls += ' wilting';
    if (golden && !dead) cls += ' golden';
    if (hasHW && !dead) cls += ' has-homework';
    card.className = cls;

    if (dead) {
      card.innerHTML = `
        <div class="plant-name">${s.name}</div>
        <div style="font-size:40px;margin:6px 0">🌰</div>
        <div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.07em">Dormant</div>
        <button class="seed-btn" onclick="revive(${i})">🌱 Replant (15 min)</button>
        <button class="seed-btn" style="background:var(--danger-light);color:var(--danger);margin-top:4px" onclick="deleteSubject('${s.id}')">🗑️ Remove</button>`;
    } else {
      const wl = hasHW ? '📝 Do homework' : '💧 Study (15 min)';
      const wc = hasHW ? 'water-btn hw' : 'water-btn';
      let badge = '';
      if (hasHW) badge = `<div class="badge badge-hw">📝 Due</div>`;
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
        <button class="${wc}" onclick="water(${i})">${wl}</button>
        <button class="water-btn" style="background:var(--danger-light);color:var(--danger);margin-top:4px" onclick="deleteSubject('${s.id}')">🗑️ Remove</button>`;
    }
    grid.appendChild(card);
  });

  const addCard = document.createElement('div');
  addCard.className = 'add-card';
  addCard.onclick = openAddModal;
  addCard.innerHTML = `<span class="plus">+</span><span>New subject</span>`;
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

// ─── Water / Revive ───────────────────────

function water(i) {
  const s = subjects[i];
  const h = getHealth(s);
  const newH = Math.min(100, h + WATER_AMT[s.freq]);
  const dph = 100 / WILT_HOURS[s.freq];
  subjects[i].lastWatered = Date.now() - ((100 - newH) / dph) * 3600000;
  subjects[i].dead = false;

  // auto-check homework if applicable

  if (schedule[s.id] && schedule[s.id][TODAY_IDX] && todayHW[s.id] === false) {
      todayHW[s.id] = true;
      if (!hwLog[TODAY_KEY]) hwLog[TODAY_KEY] = {};
      hwLog[TODAY_KEY][s.id] = true;
      renderHWBanner();
  }
  save();
  updateWeed();
  renderGarden();
  showToast(`${s.emoji} ${s.name} watered! +${WATER_AMT[s.freq]}%`);
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
  subjects.forEach((s, si) => {

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
    else if (todayHW[sid] === undefined) todayHW[sid] = false;
  }
  save();
  renderTimetable();
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

function showTab(tab) {
  document.getElementById('view-garden').style.display    = tab==='garden'    ? '' : 'none';
  document.getElementById('view-timetable').style.display = tab==='timetable' ? '' : 'none';
  document.getElementById('tab-garden').classList.toggle('active', tab==='garden');
  document.getElementById('tab-timetable').classList.toggle('active', tab==='timetable');
  if (tab==='timetable') renderTimetable();
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

subjects.forEach((s, i) => {
  if (!s.id) subjects[i].id = (s.created || Date.now() + i).toString();
  if (schedule[i] && schedule[i][TODAY_IDX] && todayHW[i] === undefined) {
    todayHW[i] = false;
  }
});

if (!localStorage.getItem('bloom_welcomed')) {
  // show welcome
} else {
  document.getElementById('welcome-screen').style.display = 'none';
}

renderGarden();
renderHWBanner();
renderWeeds();
updateDarkness();
updateWeed();
setInterval(() => { renderGarden(); updateWeed(); }, 60000);
