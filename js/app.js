// =====================================================
// HabitY — local state & rendering
// NOTE: Ma'lumotlar hozircha brauzeringizdagi localStorage'da
// saqlanadi. Supabase (Google orqali kirish) ulanganda, bu
// bo'lim haqiqiy bazaga almashtiriladi.
// =====================================================

const STORAGE_KEY = 'habity_state_v1';
let showAddGoalForm = false;

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function isoDate(d){ return d.toISOString().slice(0,10); }
function todayISO(){ return isoDate(new Date()); }

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){ console.warn('State could not be loaded', e); }
  return { habits: [], goals: [], journal: [], darkMode: false };
}
function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e){ console.warn('State could not be saved', e); }
}

let state = loadState();

// ---------- Auth toggle ----------
function toggleAuth(){
  const l = document.getElementById('login-form');
  const r = document.getElementById('register-form');
  l.style.display = l.style.display === 'none' ? 'block' : 'none';
  r.style.display = r.style.display === 'none' ? 'block' : 'none';
}
function enterApp(){
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-shell').classList.add('active');
  renderAll();
}
function exitApp(){
  document.getElementById('app-shell').classList.remove('active');
  document.getElementById('auth-screen').style.display = 'flex';
}

// ---------- View switching ----------
function showView(name, btn){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if(btn) btn.classList.add('active');
}

// ---------- Dark mode ----------
function applyDarkMode(){
  document.body.classList.toggle('dark', !!state.darkMode);
  const t = document.getElementById('dark-toggle');
  if(t) t.classList.toggle('on', !!state.darkMode);
}
function toggleDarkMode(){
  state.darkMode = !state.darkMode;
  saveState();
  applyDarkMode();
}

// ---------- Date header ----------
function refreshDateHeaders(){
  const dateStr = new Date().toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' });
  const a = document.getElementById('today-date');
  const b = document.getElementById('today-date-2');
  if(a) a.textContent = dateStr;
  if(b) b.textContent = dateStr;
}

// =====================================================
// HABITS
// =====================================================
const STATUS_CYCLE = [null, 'green', 'yellow', 'red'];

function checkIcon(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
}
function editIcon(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
}
function trashIcon(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
}

function lastNDates(n){
  const arr = [];
  for(let i = n-1; i >= 0; i--){
    const d = new Date();
    d.setDate(d.getDate() - i);
    arr.push(d);
  }
  return arr;
}

function cycleStatus(habitId, dateKey){
  const habit = state.habits.find(h => h.id === habitId);
  if(!habit) return;
  const current = habit.logs[dateKey] || null;
  const idx = STATUS_CYCLE.indexOf(current);
  const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
  if(next === null) delete habit.logs[dateKey];
  else habit.logs[dateKey] = next;
  saveState();
  renderAll();
}

function computeCurrentStreak(habit){
  let d = new Date();
  if(!habit.logs[isoDate(d)]) d.setDate(d.getDate() - 1); // if today not marked yet, start from yesterday
  let streak = 0;
  while(habit.logs[isoDate(d)] === 'green'){
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function computeLongestStreak(habit){
  const greenDates = Object.keys(habit.logs)
    .filter(k => habit.logs[k] === 'green')
    .sort();
  if(greenDates.length === 0) return 0;
  let longest = 1, run = 1;
  for(let i = 1; i < greenDates.length; i++){
    const prev = new Date(greenDates[i-1]);
    const cur = new Date(greenDates[i]);
    const diffDays = Math.round((cur - prev) / 86400000);
    run = diffDays === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return longest;
}

function addHabit(name){
  const trimmed = (name || '').trim();
  if(!trimmed) return;
  state.habits.push({ id: uid(), name: trimmed, logs: {} });
  saveState();
  renderAll();
}
function deleteHabit(id){
  if(!confirm("Bu odatni o'chirmoqchimisiz? Barcha tarix ham o'chib ketadi.")) return;
  state.habits = state.habits.filter(h => h.id !== id);
  saveState();
  renderAll();
}
function renameHabit(id, newName){
  const trimmed = (newName || '').trim();
  const habit = state.habits.find(h => h.id === id);
  if(!habit) return;
  if(trimmed) habit.name = trimmed;
  saveState();
  renderAll();
}

function renderHabits(){
  const el = document.getElementById('habit-list');
  if(!el) return;
  const today = todayISO();
  const days = lastNDates(7);

  let rowsHtml = '';
  if(state.habits.length === 0){
    rowsHtml = `<div class="empty-state">Hali odat qo'shilmagan.<br>Pastdagi maydondan birinchi odatingizni qo'shing.</div>`;
  }else{
    rowsHtml = state.habits.map(h => {
      const todayStatus = h.logs[today] || null;
      const streak = computeCurrentStreak(h);
      const dots = days.map(d => {
        const k = isoDate(d);
        const s = h.logs[k];
        const cls = s ? ('on-' + s) : '';
        return `<span class="${cls}"></span>`;
      }).join('');
      return `
        <div class="habit-row">
          <div class="check ${todayStatus ? 'state-' + todayStatus : ''}" title="Bugungi holatni belgilash uchun bosing" onclick="cycleStatus('${h.id}','${today}')">${checkIcon()}</div>
          <div class="habit-info">
            <div class="hname" data-id="${h.id}" onblur="renameHabit('${h.id}', this.textContent)" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}">${escapeHtml(h.name)}</div>
            <div class="dotchain">${dots}</div>
          </div>
          <div class="streak-badge">🔥 ${streak}</div>
          <div class="habit-actions">
            <button class="icon-btn" title="Nomini tahrirlash" onclick="editHabitName('${h.id}')">${editIcon()}</button>
            <button class="icon-btn danger" title="O'chirish" onclick="deleteHabit('${h.id}')">${trashIcon()}</button>
          </div>
        </div>`;
    }).join('');
  }

  el.innerHTML = rowsHtml + `
    <div class="add-habit-row">
      <input type="text" id="new-habit-input" placeholder="Yangi odat qo'shish, masalan: Kuniga 30 daqiqa yugurish" onkeydown="if(event.key==='Enter'){ addHabit(this.value); this.value=''; }">
      <button class="btn btn-primary" onclick="const i=document.getElementById('new-habit-input'); addHabit(i.value); i.value='';">Qo'shish</button>
    </div>`;
}

function editHabitName(id){
  const nameEl = document.querySelector(`.hname[data-id="${id}"]`);
  if(!nameEl) return;
  nameEl.setAttribute('contenteditable', 'true');
  nameEl.focus();
  document.execCommand && document.execCommand('selectAll', false, null);
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// =====================================================
// STATISTIKA
// =====================================================
function renderStats(){
  const longestEl = document.getElementById('stat-longest-streak');
  const weeklyEl = document.getElementById('stat-weekly-pct');
  const totalEl = document.getElementById('stat-total-completions');
  const barsEl = document.getElementById('week-bars');
  const heatEl = document.getElementById('heat-grid');
  if(!barsEl || !heatEl) return;

  const habits = state.habits;
  const longest = habits.length ? Math.max(0, ...habits.map(computeLongestStreak)) : 0;
  const totalCompletions = habits.reduce((sum, h) => sum + Object.values(h.logs).filter(s => s === 'green').length, 0);

  const scoreOf = s => s === 'green' ? 1 : s === 'yellow' ? 0.5 : 0;

  const last7 = lastNDates(7);
  let weeklyPct = 0;
  if(habits.length){
    let sum = 0, count = 0;
    last7.forEach(d => {
      const k = isoDate(d);
      habits.forEach(h => { sum += scoreOf(h.logs[k]); count++; });
    });
    weeklyPct = count ? Math.round((sum / count) * 100) : 0;
  }

  if(longestEl) longestEl.textContent = longest;
  if(weeklyEl) weeklyEl.textContent = weeklyPct + '%';
  if(totalEl) totalEl.textContent = totalCompletions;

  const dayLabels = last7.map(d => d.toLocaleDateString('uz-UZ', { weekday: 'short' }));
  barsEl.innerHTML = last7.map((d, i) => {
    const k = isoDate(d);
    let pct = 0;
    if(habits.length){
      const sum = habits.reduce((s, h) => s + scoreOf(h.logs[k]), 0);
      pct = Math.round((sum / habits.length) * 100);
    }
    return `<div class="bar-col"><div class="bar-fill ${pct>=70?'filled':''}" style="height:${Math.max(pct,3)}%;"></div><div class="daylabel">${dayLabels[i]}</div></div>`;
  }).join('');

  const last30 = lastNDates(30);
  heatEl.innerHTML = last30.map(d => {
    const k = isoDate(d);
    const involved = habits.filter(h => h.logs[k]);
    if(involved.length === 0) return `<div class="heat-cell"></div>`;
    const avg = involved.reduce((s, h) => s + scoreOf(h.logs[k]), 0) / involved.length;
    const level = avg >= 0.75 ? 'l3' : avg >= 0.4 ? 'l2' : 'l1';
    return `<div class="heat-cell ${level}"></div>`;
  }).join('');
}

// =====================================================
// KUNDALIK (Journal)
// =====================================================
function saveJournalEntry(mood, sleep, text){
  const trimmed = (text || '').trim();
  if(!trimmed) { alert("Iltimos, avval bugungi kayfiyatingiz haqida bir necha jumla yozing."); return; }
  const today = todayISO();
  let entry = state.journal.find(e => e.date === today);
  if(entry){
    entry.mood = mood; entry.sleep = sleep; entry.text = trimmed;
  }else{
    state.journal.unshift({ id: uid(), date: today, mood, sleep, text: trimmed });
  }
  saveState();
  renderAll();
}
function deleteJournalEntry(id){
  if(!confirm("Bu yozuvni o'chirmoqchimisiz?")) return;
  state.journal = state.journal.filter(e => e.id !== id);
  saveState();
  renderAll();
}

function formatEntryDate(iso){
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', weekday: 'long' });
}

function renderJournal(){
  const listEl = document.getElementById('entry-list');
  if(!listEl) return;
  const sorted = [...state.journal].sort((a,b) => b.date.localeCompare(a.date));
  if(sorted.length === 0){
    listEl.innerHTML = `<div class="card empty-state">Hali kundalik yozuv yo'q.<br>Yuqoridagi maydonga bugungi kuningizni yozib, saqlab qo'ying.</div>`;
  }else{
    listEl.innerHTML = sorted.map(e => `
      <div class="card entry-card">
        <div class="ehead">
          <div class="edate">${formatEntryDate(e.date)}</div>
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="estats"><span>Kayfiyat: ${e.mood}/10</span><span>Uyqu: ${e.sleep}/10</span></div>
            <div class="entry-actions"><button class="icon-btn danger" title="O'chirish" onclick="deleteJournalEntry('${e.id}')">${trashIcon()}</button></div>
          </div>
        </div>
        <div class="etext">${escapeHtml(e.text)}</div>
      </div>
    `).join('');
  }

  const moodAvgEl = document.getElementById('mood-avg');
  if(moodAvgEl){
    const last7keys = lastNDates(7).map(isoDate);
    const recent = state.journal.filter(e => last7keys.includes(e.date));
    if(recent.length === 0){
      moodAvgEl.textContent = '—';
    }else{
      const avg = recent.reduce((s,e) => s + Number(e.mood), 0) / recent.length;
      moodAvgEl.textContent = avg.toFixed(1);
    }
  }
}

function wireJournalForms(){
  const saveBtn = document.getElementById('journal-save-btn');
  if(saveBtn){
    saveBtn.onclick = () => {
      const mood = document.getElementById('j-mood-val').textContent;
      const sleep = document.getElementById('j-sleep-val').textContent;
      const text = document.getElementById('journal-textarea').value;
      saveJournalEntry(Number(mood), Number(sleep), text);
      document.getElementById('journal-textarea').value = '';
    };
  }
  const dashSaveBtn = document.getElementById('dash-save-btn');
  if(dashSaveBtn){
    dashSaveBtn.onclick = () => {
      const mood = document.getElementById('mood-val').textContent;
      const sleep = document.getElementById('sleep-val').textContent;
      const text = document.getElementById('dash-journal-textarea').value;
      saveJournalEntry(Number(mood), Number(sleep), text);
      document.getElementById('dash-journal-textarea').value = '';
      showView('kundalik', document.querySelector('[data-view=kundalik]'));
    };
  }
}

// =====================================================
// MAQSADLAR (Goals)
// =====================================================
function addGoal(name, deadline){
  const trimmed = (name || '').trim();
  if(!trimmed) return;
  state.goals.push({ id: uid(), name: trimmed, deadline: (deadline || '').trim() || 'Muddat belgilanmagan', percent: 0 });
  showAddGoalForm = false;
  saveState();
  renderAll();
}
function deleteGoal(id){
  if(!confirm("Bu maqsadni o'chirmoqchimisiz?")) return;
  state.goals = state.goals.filter(g => g.id !== id);
  saveState();
  renderAll();
}
function updateGoalPercent(id, value){
  const g = state.goals.find(g => g.id === id);
  if(!g) return;
  g.percent = Number(value);
  saveState();
  const card = document.querySelector(`.goal-card[data-id="${id}"]`);
  if(card){
    card.querySelector('.gpercent').textContent = g.percent + '%';
    card.querySelector('.progress-fill').style.width = g.percent + '%';
  }
}
function renameGoalField(id, field, value){
  const g = state.goals.find(g => g.id === id);
  if(!g) return;
  const trimmed = (value || '').trim();
  if(trimmed) g[field] = trimmed;
  saveState();
  renderAll();
}
function toggleAddGoalForm(show){
  showAddGoalForm = show;
  renderGoals();
}

function renderGoals(){
  const el = document.getElementById('goals-grid');
  if(!el) return;

  const cardsHtml = state.goals.map(g => `
    <div class="card goal-card" data-id="${g.id}">
      <div class="ghead">
        <div>
          <div class="gname" contenteditable="false" onblur="renameGoalField('${g.id}','name',this.textContent)" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}">${escapeHtml(g.name)}</div>
          <div class="gdeadline" contenteditable="false" onblur="renameGoalField('${g.id}','deadline',this.textContent)" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}">${escapeHtml(g.deadline)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <div class="gpercent">${g.percent}%</div>
          <div class="goal-actions">
            <button class="icon-btn" title="Nomini tahrirlash" onclick="makeGoalEditable('${g.id}')">${editIcon()}</button>
            <button class="icon-btn danger" title="O'chirish" onclick="deleteGoal('${g.id}')">${trashIcon()}</button>
          </div>
        </div>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${g.percent}%;"></div></div>
      <div class="percent-slider">
        <input type="range" min="0" max="100" step="5" value="${g.percent}" oninput="updateGoalPercent('${g.id}', this.value)">
      </div>
    </div>
  `).join('');

  const addCardHtml = showAddGoalForm ? `
    <div class="card add-goal-form">
      <div class="field"><label>Maqsad nomi</label><input type="text" id="new-goal-name" placeholder="Masalan: 30 kun uzluksiz mutolaa"></div>
      <div class="field" style="margin-bottom:0;"><label>Muddati</label><input type="text" id="new-goal-deadline" placeholder="Masalan: 15-avgustgacha"></div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="addGoal(document.getElementById('new-goal-name').value, document.getElementById('new-goal-deadline').value)">Qo'shish</button>
        <button class="btn btn-ghost" onclick="toggleAddGoalForm(false)">Bekor qilish</button>
      </div>
    </div>
  ` : `<button class="add-goal-card" onclick="toggleAddGoalForm(true)">+ Yangi maqsad qo'shish</button>`;

  el.innerHTML = cardsHtml + addCardHtml;
}
function makeGoalEditable(id){
  const card = document.querySelector(`.goal-card[data-id="${id}"]`);
  if(!card) return;
  const nameEl = card.querySelector('.gname');
  nameEl.setAttribute('contenteditable', 'true');
  nameEl.focus();
}

// =====================================================
// INIT
// =====================================================
function renderAll(){
  refreshDateHeaders();
  renderHabits();
  renderGoals();
  renderJournal();
  renderStats();
  wireJournalForms();
}

applyDarkMode();
refreshDateHeaders();
renderAll();
