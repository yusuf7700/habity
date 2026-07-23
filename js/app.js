// =====================================================
// HabitY — Firebase Auth (Google) + Firestore sync
// =====================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, updateProfile,
  linkWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, deleteField, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDFWsq8IYOC18OZ_01pxXIFyrLvI7GUJ84",
  authDomain: "habityyy.firebaseapp.com",
  projectId: "habityyy",
  storageBucket: "habityyy.firebasestorage.app",
  messagingSenderId: "915040588600",
  appId: "1:915040588600:web:324ca55e1867966a9ea7cd",
  measurementId: "G-T4BW0RNF2Y"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const googleProvider = new GoogleAuthProvider();

let currentUser = null;
let unsubscribers = [];
let showAddGoalForm = false;

function isoDate(d){ return d.toISOString().slice(0,10); }
function todayISO(){ return isoDate(new Date()); }

function loadDarkPref(){
  try{ return localStorage.getItem('habity_dark') === '1'; }
  catch(e){ return false; }
}
function saveDarkPref(){
  try{ localStorage.setItem('habity_dark', state.darkMode ? '1' : '0'); }
  catch(e){ /* ignore */ }
}

let state = { habits: [], goals: [], journal: [], darkMode: loadDarkPref() };

// =====================================================
// AUTH
// =====================================================
function signInWithGoogle(){
  signInWithPopup(auth, googleProvider).catch(err => {
    console.error('Google sign-in error', err);
    alert("Kirishda xatolik yuz berdi. Qaytadan urinib ko'ring.");
  });
}
function signOutUser(){
  signOut(auth).catch(err => console.error('Sign-out error', err));
}

function linkGoogleAccount(){
  if(!currentUser) return;
  linkWithPopup(currentUser, googleProvider)
    .then(cred => { applyUserUI(cred.user); })
    .catch(err => {
      console.error('Link account error', err);
      if(err.code === 'auth/credential-already-in-use'){
        alert("Bu Google hisobi allaqachon boshqa HabitY hisobiga ulangan. Iltimos, chiqib, to'g'ridan-to'g'ri Google orqali kiring.");
      }else{
        alert("Bog'lashda xatolik: " + err.message);
      }
    });
}

function continueWithName(){
  const input = document.getElementById('guest-name');
  const name = (input ? input.value : '').trim();
  if(!name){ alert("Iltimos, avval ismingizni kiriting."); return; }
  signInAnonymously(auth)
    .then(cred => updateProfile(cred.user, { displayName: name }))
    .then(() => { if(auth.currentUser) applyUserUI(auth.currentUser); })
    .catch(err => {
      console.error('Anonymous sign-in error', err);
      alert("Kirishda xatolik: " + err.message);
    });
}

function unsubscribeAll(){
  unsubscribers.forEach(u => { try{ u(); }catch(e){} });
  unsubscribers = [];
}

function subscribeToUserData(uid){
  unsubscribeAll();
  const habitsCol = collection(db, 'users', uid, 'habits');
  const journalCol = collection(db, 'users', uid, 'journal');
  const goalsCol = collection(db, 'users', uid, 'goals');

  unsubscribers.push(onSnapshot(habitsCol, snap => {
    state.habits = snap.docs.map(d => ({ id: d.id, name: d.data().name || '', logs: d.data().logs || {} }));
    renderAll();
  }, err => console.error('Habits sync error', err)));

  unsubscribers.push(onSnapshot(journalCol, snap => {
    state.journal = snap.docs.map(d => ({ id: d.id, date: d.id, mood: d.data().mood, sleep: d.data().sleep, text: d.data().text || '' }));
    renderAll();
  }, err => console.error('Journal sync error', err)));

  unsubscribers.push(onSnapshot(goalsCol, snap => {
    state.goals = snap.docs.map(d => ({ id: d.id, name: d.data().name || '', deadline: d.data().deadline || '', percent: d.data().percent || 0 }));
    renderAll();
  }, err => console.error('Goals sync error', err)));
}

function applyUserUI(user){
  const name = user.displayName || 'Foydalanuvchi';
  const firstName = name.split(' ')[0];
  const email = user.email || 'Mehmon hisobi';
  const initial = name.charAt(0).toUpperCase();
  const photo = user.photoURL;
  const avatarHtml = photo
    ? `<img src="${photo}" alt="${escapeHtml(name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
    : initial;

  const sidebarAvatar = document.getElementById('sidebar-avatar');
  const sidebarName = document.getElementById('sidebar-name');
  const sidebarEmail = document.getElementById('sidebar-email');
  if(sidebarAvatar) sidebarAvatar.innerHTML = avatarHtml;
  if(sidebarName) sidebarName.textContent = name;
  if(sidebarEmail) sidebarEmail.textContent = email;

  const profileAvatar = document.getElementById('profile-avatar');
  const profileName = document.getElementById('profile-name');
  const profileEmail = document.getElementById('profile-email');
  const profileJoined = document.getElementById('profile-joined');
  if(profileAvatar) profileAvatar.innerHTML = avatarHtml;
  if(profileName) profileName.textContent = name;
  if(profileEmail) profileEmail.textContent = email;
  if(profileJoined && user.metadata && user.metadata.creationTime){
    const joinedStr = new Date(user.metadata.creationTime).toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' });
    profileJoined.textContent = joinedStr + " dan beri a'zo";
  }

  const settingsName = document.getElementById('settings-name-input');
  const settingsEmail = document.getElementById('settings-email-input');
  if(settingsName) settingsName.value = name;
  if(settingsEmail) settingsEmail.value = email;

  const linkSection = document.getElementById('link-account-section');
  if(linkSection) linkSection.style.display = user.isAnonymous ? 'block' : 'none';

  document.querySelectorAll('.dash-greeting-name').forEach(el => { el.textContent = firstName; });
}

function editProfileName(){
  const nameEl = document.getElementById('profile-name');
  if(!nameEl) return;
  nameEl.setAttribute('contenteditable', 'true');
  nameEl.focus();
  document.execCommand && document.execCommand('selectAll', false, null);
}
function saveProfileName(newName){
  const trimmed = (newName || '').trim();
  const nameEl = document.getElementById('profile-name');
  if(nameEl) nameEl.setAttribute('contenteditable', 'false');
  if(!trimmed || !currentUser) return;
  updateProfile(currentUser, { displayName: trimmed })
    .then(() => applyUserUI(auth.currentUser))
    .catch(err => alert("Ismni saqlashda xatolik: " + err.message));
}

function copyCardNumber(){
  const raw = "5614684705391512";
  const label = document.getElementById('card-number-text');
  navigator.clipboard.writeText(raw).then(() => {
    if(label){
      const old = label.textContent;
      label.textContent = "Nusxalandi!";
      setTimeout(() => { label.textContent = old; }, 1500);
    }
  }).catch(() => alert("Nusxalashda xatolik. Raqam: " + raw));
}

onAuthStateChanged(auth, user => {
  if(user){
    currentUser = user;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-shell').classList.add('active');
    applyUserUI(user);
    subscribeToUserData(user.uid);
  }else{
    currentUser = null;
    unsubscribeAll();
    state.habits = []; state.goals = []; state.journal = [];
    document.getElementById('app-shell').classList.remove('active');
    document.getElementById('auth-screen').style.display = 'flex';
  }
});

// ---------- View switching ----------
function showView(name){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === name);
  });
}

// ---------- Dark mode ----------
function applyDarkMode(){
  document.body.classList.toggle('dark', !!state.darkMode);
  const t = document.getElementById('dark-toggle');
  if(t) t.classList.toggle('on', !!state.darkMode);
}
function toggleDarkMode(){
  state.darkMode = !state.darkMode;
  saveDarkPref();
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
// ICONS
// =====================================================
function checkIcon(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
}
function editIcon(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
}
function trashIcon(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
}
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// =====================================================
// DATE HELPERS
// =====================================================
function lastNDates(n){
  const arr = [];
  for(let i = n-1; i >= 0; i--){
    const d = new Date();
    d.setDate(d.getDate() - i);
    arr.push(d);
  }
  return arr;
}
function daysInMonth(year, month){ return new Date(year, month + 1, 0).getDate(); }
function currentMonthDates(){
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const total = daysInMonth(y, m);
  const arr = [];
  for(let day = 1; day <= total; day++) arr.push(new Date(y, m, day));
  return arr;
}

// =====================================================
// HABITS
// =====================================================
const STATUS_CYCLE = [null, 'green', 'yellow', 'red'];

function cycleStatus(habitId, dateKey){
  if(!currentUser) return;
  const habit = state.habits.find(h => h.id === habitId);
  if(!habit) return;
  const current = habit.logs[dateKey] || null;
  const idx = STATUS_CYCLE.indexOf(current);
  const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
  const ref = doc(db, 'users', currentUser.uid, 'habits', habitId);
  updateDoc(ref, { [`logs.${dateKey}`]: next === null ? deleteField() : next })
    .catch(err => console.error('cycleStatus error', err));
}

function computeCurrentStreak(habit){
  let d = new Date();
  if(!habit.logs[isoDate(d)]) d.setDate(d.getDate() - 1);
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
  if(!trimmed || !currentUser) return;
  addDoc(collection(db, 'users', currentUser.uid, 'habits'), { name: trimmed, logs: {}, createdAt: serverTimestamp() })
    .catch(err => alert("Odat qo'shishda xatolik: " + err.message));
}
function deleteHabit(id){
  if(!currentUser) return;
  if(!confirm("Bu odatni o'chirmoqchimisiz? Barcha tarix ham o'chib ketadi.")) return;
  deleteDoc(doc(db, 'users', currentUser.uid, 'habits', id)).catch(err => alert('Xatolik: ' + err.message));
}
function renameHabit(id, newName){
  const trimmed = (newName || '').trim();
  if(!trimmed || !currentUser) return;
  updateDoc(doc(db, 'users', currentUser.uid, 'habits', id), { name: trimmed }).catch(err => console.error(err));
}
function editHabitName(id){
  const nameEl = document.querySelector(`.hname[data-id="${id}"]`);
  if(!nameEl) return;
  nameEl.setAttribute('contenteditable', 'true');
  nameEl.focus();
  document.execCommand && document.execCommand('selectAll', false, null);
}

function renderHabits(){
  const tableEl = document.getElementById('habit-grid-table');
  const monthLabelEl = document.getElementById('grid-month-label');
  const emptyEl = document.getElementById('habit-grid-empty');
  if(!tableEl) return;

  const today = todayISO();
  const monthDates = currentMonthDates();
  if(monthLabelEl){
    monthLabelEl.textContent = new Date().toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' });
  }

  if(state.habits.length === 0){
    tableEl.innerHTML = '';
    tableEl.style.display = 'none';
    if(emptyEl) emptyEl.style.display = 'block';
    return;
  }
  tableEl.style.display = '';
  if(emptyEl) emptyEl.style.display = 'none';

  const headCells = monthDates.map(d => {
    const isToday = isoDate(d) === today;
    return `<th class="${isToday ? 'today-col' : ''}">${d.getDate()}</th>`;
  }).join('');

  const bodyRows = state.habits.map(h => {
    const streak = computeCurrentStreak(h);
    const dayCells = monthDates.map(d => {
      const k = isoDate(d);
      const isFuture = k > today;
      const s = h.logs[k];
      const cls = ['grid-dot'];
      if(s) cls.push('state-' + s);
      if(k === today) cls.push('is-today');
      if(isFuture) cls.push('future');
      const clickAttr = isFuture ? '' : ` onclick="cycleStatus('${h.id}','${k}')"`;
      return `<td class="hcell-day"><div class="${cls.join(' ')}"${clickAttr} title="${d.getDate()}-kun"></div></td>`;
    }).join('');
    return `
      <tr>
        <td class="hcell-name"><div class="hname" data-id="${h.id}" onblur="renameHabit('${h.id}', this.textContent)" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}">${escapeHtml(h.name)}</div></td>
        ${dayCells}
        <td class="hcell-meta">
          <div class="hcell-meta-inner">
            <div class="streak-badge">🔥 ${streak}</div>
            <div class="habit-actions">
              <button class="icon-btn" title="Nomini tahrirlash" onclick="editHabitName('${h.id}')">${editIcon()}</button>
              <button class="icon-btn danger" title="O'chirish" onclick="deleteHabit('${h.id}')">${trashIcon()}</button>
            </div>
          </div>
        </td>
      </tr>`;
  }).join('');

  tableEl.innerHTML = `
    <thead><tr><th class="hcell-name-head"></th>${headCells}<th></th></tr></thead>
    <tbody>${bodyRows}</tbody>`;
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
  if(!trimmed){ alert("Iltimos, avval bugungi kayfiyatingiz haqida bir necha jumla yozing."); return; }
  if(!currentUser) return;
  const today = todayISO();
  setDoc(doc(db, 'users', currentUser.uid, 'journal', today), {
    mood, sleep, text: trimmed, updatedAt: serverTimestamp()
  }, { merge: true }).catch(err => alert('Saqlashda xatolik: ' + err.message));
}
function deleteJournalEntry(id){
  if(!currentUser) return;
  if(!confirm("Bu yozuvni o'chirmoqchimisiz?")) return;
  deleteDoc(doc(db, 'users', currentUser.uid, 'journal', id)).catch(err => console.error(err));
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
      showView('kundalik');
    };
  }
}

// =====================================================
// MAQSADLAR (Goals)
// =====================================================
function addGoal(name, deadline){
  const trimmed = (name || '').trim();
  if(!trimmed || !currentUser) return;
  addDoc(collection(db, 'users', currentUser.uid, 'goals'), {
    name: trimmed, deadline: (deadline || '').trim() || 'Muddat belgilanmagan', percent: 0, createdAt: serverTimestamp()
  }).catch(err => alert("Maqsad qo'shishda xatolik: " + err.message));
  showAddGoalForm = false;
  renderGoals();
}
function deleteGoal(id){
  if(!currentUser) return;
  if(!confirm("Bu maqsadni o'chirmoqchimisiz?")) return;
  deleteDoc(doc(db, 'users', currentUser.uid, 'goals', id)).catch(err => console.error(err));
}
function updateGoalPercent(id, value){
  if(!currentUser) return;
  const v = Number(value);
  const card = document.querySelector(`.goal-card[data-id="${id}"]`);
  if(card){
    card.querySelector('.gpercent').textContent = v + '%';
    card.querySelector('.progress-fill').style.width = v + '%';
  }
  updateDoc(doc(db, 'users', currentUser.uid, 'goals', id), { percent: v }).catch(err => console.error(err));
}
function renameGoalField(id, field, value){
  if(!currentUser) return;
  const trimmed = (value || '').trim();
  if(!trimmed) return;
  updateDoc(doc(db, 'users', currentUser.uid, 'goals', id), { [field]: trimmed }).catch(err => console.error(err));
}
function toggleAddGoalForm(show){
  showAddGoalForm = show;
  renderGoals();
}
function makeGoalEditable(id){
  const card = document.querySelector(`.goal-card[data-id="${id}"]`);
  if(!card) return;
  const nameEl = card.querySelector('.gname');
  nameEl.setAttribute('contenteditable', 'true');
  nameEl.focus();
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

// =====================================================
// PROFIL
// =====================================================
function renderProfile(){
  const activeHabitsEl = document.getElementById('profile-active-habits');
  const longestEl = document.getElementById('profile-longest-streak');
  const journalCountEl = document.getElementById('profile-journal-count');
  const activeGoalsEl = document.getElementById('profile-active-goals');
  if(!activeHabitsEl) return;

  const longest = state.habits.length ? Math.max(0, ...state.habits.map(computeLongestStreak)) : 0;
  activeHabitsEl.textContent = state.habits.length;
  longestEl.textContent = longest;
  journalCountEl.textContent = state.journal.length;
  activeGoalsEl.textContent = state.goals.filter(g => g.percent < 100).length;
}

// =====================================================
// PWA — ilova sifatida o'rnatish
// =====================================================
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('install-app-btn');
  if(btn) btn.textContent = "O'rnatish";
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
});

function installApp(){
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => { deferredInstallPrompt = null; });
  }else if(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone){
    alert("HabitY allaqachon ilova sifatida o'rnatilgan.");
  }else{
    alert("Brauzeringiz avtomatik o'rnatishni qo'llab-quvvatlamaydi. iPhone/iPad'da: pastdagi Share tugmasi → \"Add to Home Screen\"ni tanlang.");
  }
}

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
  });
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
  renderProfile();
  wireJournalForms();
}

applyDarkMode();
refreshDateHeaders();

// Expose functions referenced by inline HTML onclick/onblur/onkeydown handlers
// (required because ES module scope doesn't leak to window automatically)
Object.assign(window, {
  showView, continueWithName, signInWithGoogle, signOutUser, linkGoogleAccount, toggleDarkMode,
  cycleStatus, addHabit, deleteHabit, renameHabit, editHabitName,
  addGoal, deleteGoal, updateGoalPercent, renameGoalField, toggleAddGoalForm, makeGoalEditable,
  deleteJournalEntry, editProfileName, saveProfileName, copyCardNumber, installApp
});
