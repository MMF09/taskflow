/* =========================================================
   Taskflow Pomodoro – Firebase Auth + Realtime Database
   - Google Login + Email Login (NO public registration)
   - Tasks & Settings sync to Realtime DB under /users/{uid}
   - Keep all original Pomodoro features + UI/UX
   ========================================================= */

// ===================== FIREBASE INIT =====================
const firebaseConfig = {
  apiKey: "AIzaSyBPCTP4POvfvpV2NPE2vx26FxgeHpQ_FNE",
  authDomain: "qhx2nn.firebaseapp.com",
  databaseURL: "https://qhx2nn-default-rtdb.firebaseio.com",
  projectId: "qhx2nn",
  storageBucket: "qhx2nn.firebasestorage.app",
  messagingSenderId: "244078324179",
  appId: "1:244078324179:web:ceab5de63ac8e8afb2e726"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// ===================== STATE =====================
const state = {
  mode: 'pomodoro',
  status: 'stopped', // stopped | running | paused
  timeLeft: 25 * 60,
  duration: 25 * 60,
  timerId: null,
  activeTaskId: null,
  durations: {
    pomodoro: 25 * 60,
    shortBreak: 5 * 60,
    longBreak: 15 * 60
  },
  tasks: [],
  ambience: null,
  user: null,
  syncing: false
};

const CIRC = 2 * Math.PI * 110;

const labels = {
  pomodoro: { ready: 'Sẵn sàng tập trung', run: 'Đang tập trung' },
  shortBreak: { ready: 'Sẵn sàng nghỉ ngắn', run: 'Đang nghỉ ngắn' },
  longBreak: { ready: 'Sẵn sàng nghỉ dài', run: 'Đang nghỉ dài' }
};

// ===================== DOM =====================
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const authScreen = $('#authScreen');
const appScreen = $('#appScreen');
const authError = $('#authError');
const timeEl = $('#timeDisplay');
const modeLabel = $('#modeLabel');
const ring = $('#progressRing');
const startBtn = $('#startBtn');
const btnText = $('#btnText');
const playIcon = $('#playIcon');
const activeTitle = $('#activeTitle');
const activePomo = $('#activePomo');
const taskList = $('#taskList');
const taskStats = $('#taskStats');
const emptyState = $('#emptyState');

// ===================== AUTH =====================
function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

function clearAuthError() {
  authError.classList.add('hidden');
  authError.textContent = '';
}

function setAuthLoading(loading) {
  const gBtn = $('#googleLoginBtn');
  const eBtn = $('#emailLoginBtn');
  if (gBtn) gBtn.disabled = loading;
  if (eBtn) {
    eBtn.disabled = loading;
    eBtn.textContent = loading ? 'Đang đăng nhập...' : 'Đăng nhập bằng Email';
  }
}

// Google Login
$('#googleLoginBtn').addEventListener('click', async () => {
  clearAuthError();
  setAuthLoading(true);
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (err) {
    console.error(err);
    if (err.code === 'auth/popup-closed-by-user') {
      showAuthError('Bạn đã đóng cửa sổ đăng nhập.');
    } else {
      showAuthError(err.message || 'Đăng nhập Google thất bại.');
    }
  } finally {
    setAuthLoading(false);
  }
});

// Email Login (NO registration)
$('#emailLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthError();
  setAuthLoading(true);

  const email = $('#emailInput').value.trim();
  const password = $('#passwordInput').value;

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    console.error(err);
    let msg = 'Đăng nhập thất bại.';
    if (
      err.code === 'auth/user-not-found' ||
      err.code === 'auth/wrong-password' ||
      err.code === 'auth/invalid-credential'
    ) {
      msg = 'Email hoặc mật khẩu không đúng. Tài khoản phải được cấp trước.';
    } else if (err.code === 'auth/too-many-requests') {
      msg = 'Quá nhiều lần thử. Vui lòng thử lại sau.';
    } else if (err.code === 'auth/invalid-email') {
      msg = 'Email không hợp lệ.';
    }
    showAuthError(msg);
  } finally {
    setAuthLoading(false);
  }
});

// Logout
$('#logoutBtn').addEventListener('click', async () => {
  try {
    await auth.signOut();
  } catch (err) {
    console.error(err);
  }
});

// User menu toggle
$('#userBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('#userDropdown').classList.toggle('hidden');
});
document.addEventListener('click', () => {
  const dd = $('#userDropdown');
  if (dd) dd.classList.add('hidden');
});

// Auth state listener
auth.onAuthStateChanged(async (user) => {
  if (user) {
    state.user = user;
    showApp(user);
    await loadUserData(user.uid);
  } else {
    state.user = null;
    state.tasks = [];
    state.activeTaskId = null;
    showAuth();
  }
});

function showAuth() {
  authScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
  clearAuthError();
}

function showApp(user) {
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');

  const name = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
  const email = user.email || '';
  $('#userName').textContent = name;
  $('#userEmail').textContent = email;

  if (user.photoURL) {
    $('#userAvatar').src = user.photoURL;
    $('#userAvatar').classList.remove('hidden');
    $('#userInitial').classList.add('hidden');
  } else {
    $('#userAvatar').classList.add('hidden');
    $('#userInitial').classList.remove('hidden');
    $('#userInitial').textContent = name.charAt(0).toUpperCase();
  }
}

// ===================== REALTIME DATABASE =====================
async function loadUserData(uid) {
  try {
    const tasksSnap = await db.ref(`users/${uid}/tasks`).once('value');
    const tasksData = tasksSnap.val();
    if (tasksData) {
      state.tasks = Object.keys(tasksData)
        .map((key) => ({
          id: key,
          ...tasksData[key]
        }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else {
      state.tasks = [];
    }

    const settingsSnap = await db.ref(`users/${uid}/settings`).once('value');
    const settings = settingsSnap.val();
    if (settings) {
      if (settings.pomodoro) state.durations.pomodoro = settings.pomodoro * 60;
      if (settings.shortBreak) state.durations.shortBreak = settings.shortBreak * 60;
      if (settings.longBreak) state.durations.longBreak = settings.longBreak * 60;
      $('#setPomo').value = settings.pomodoro || 25;
      $('#setShort').value = settings.shortBreak || 5;
      $('#setLong').value = settings.longBreak || 15;
    }

    if (state.tasks.length) {
      state.activeTaskId = state.tasks[0].id;
    } else {
      state.activeTaskId = null;
    }

    renderTasks();
    updateBanner();
    switchMode(state.mode);
  } catch (err) {
    console.error('Load data error:', err);
    showToast('Không thể tải dữ liệu. Kiểm tra kết nối.');
  }
}

async function saveTasksToCloud() {
  if (!state.user || state.syncing) return;
  state.syncing = true;
  try {
    const obj = {};
    state.tasks.forEach((t) => {
      obj[t.id] = {
        title: t.title,
        est: t.est,
        donePomos: t.donePomos || 0,
        completed: !!t.completed,
        createdAt: t.createdAt || Date.now()
      };
    });
    await db.ref(`users/${state.user.uid}/tasks`).set(obj);
  } catch (err) {
    console.error('Save tasks error:', err);
    showToast('Lỗi đồng bộ task.');
  } finally {
    state.syncing = false;
  }
}

async function saveSettingsToCloud() {
  if (!state.user) return;
  try {
    await db.ref(`users/${state.user.uid}/settings`).set({
      pomodoro: state.durations.pomodoro / 60,
      shortBreak: state.durations.shortBreak / 60,
      longBreak: state.durations.longBreak / 60,
      updatedAt: Date.now()
    });
  } catch (err) {
    console.error('Save settings error:', err);
  }
}

// ===================== TIMER =====================
function updateDisplay() {
  const m = Math.floor(state.timeLeft / 60);
  const s = state.timeLeft % 60;
  const str = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  timeEl.textContent = str;
  document.title = `(${str}) ${state.mode === 'pomodoro' ? 'Tập trung' : 'Nghỉ'} · Taskflow`;

  const progress = state.timeLeft / state.duration;
  ring.style.strokeDashoffset = CIRC - progress * CIRC;
}

function switchMode(mode) {
  if (state.status === 'running') {
    clearInterval(state.timerId);
    state.status = 'stopped';
  }
  state.mode = mode;
  state.duration = state.durations[mode];
  state.timeLeft = state.duration;

  $$('.mode-tab').forEach((t) => {
    t.classList.remove('active', 'pomo', 'short', 'long');
    if (t.dataset.mode === mode) {
      t.classList.add(
        'active',
        mode === 'pomodoro' ? 'pomo' : mode === 'shortBreak' ? 'short' : 'long'
      );
    }
  });

  ring.className = `progress-ring ${
    mode === 'pomodoro' ? 'pomo' : mode === 'shortBreak' ? 'short' : 'long'
  }`;
  startBtn.className = `btn-primary ${
    mode === 'pomodoro' ? 'pomo' : mode === 'shortBreak' ? 'short' : 'long'
  }`;

  modeLabel.textContent = labels[mode].ready;
  updateBtnUI();
  updateDisplay();
}

function startTimer() {
  initAudio();
  state.status = 'running';
  modeLabel.textContent = labels[state.mode].run;
  updateBtnUI();

  state.timerId = setInterval(() => {
    if (state.timeLeft > 0) {
      state.timeLeft--;
      updateDisplay();
    } else {
      onComplete();
    }
  }, 1000);
}

function pauseTimer() {
  state.status = 'paused';
  clearInterval(state.timerId);
  modeLabel.textContent = 'Đã tạm dừng';
  updateBtnUI();
}

function toggleTimer() {
  state.status === 'running' ? pauseTimer() : startTimer();
}

function resetTimer() {
  clearInterval(state.timerId);
  state.status = 'stopped';
  state.timeLeft = state.duration;
  modeLabel.textContent = labels[state.mode].ready;
  updateBtnUI();
  updateDisplay();
}

function skipTimer() {
  if (confirm('Bỏ qua phiên hiện tại?')) {
    resetTimer();
    autoAdvance();
  }
}

function updateBtnUI() {
  if (state.status === 'running') {
    btnText.textContent = 'TẠM DỪNG';
    playIcon.innerHTML = '<path d="M6 4h4v16H6zm8 0h4v16h-4z"/>';
  } else {
    btnText.textContent = state.status === 'paused' ? 'TIẾP TỤC' : 'BẮT ĐẦU';
    playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
  }
}

function onComplete() {
  clearInterval(state.timerId);
  state.status = 'stopped';
  playChime();
  if (state.mode === 'pomodoro' && state.activeTaskId) {
    const t = state.tasks.find((x) => x.id === state.activeTaskId);
    if (t) {
      t.donePomos = (t.donePomos || 0) + 1;
      saveTasksToCloud();
      renderTasks();
      updateBanner();
    }
  }
  showToast(
    state.mode === 'pomodoro'
      ? 'Hết Pomodoro! Nghỉ ngơi nào 🎉'
      : 'Hết giờ nghỉ. Quay lại làm việc!'
  );
  autoAdvance();
}

function autoAdvance() {
  switchMode(state.mode === 'pomodoro' ? 'shortBreak' : 'pomodoro');
}

// ===================== TASKS =====================
function addTask(e) {
  e.preventDefault();
  const title = $('#taskInput').value.trim();
  const est = parseInt($('#estInput').value) || 1;
  if (!title) return;

  const task = {
    id: Date.now().toString(),
    title,
    est,
    donePomos: 0,
    completed: false,
    createdAt: Date.now()
  };
  state.tasks.unshift(task);
  if (!state.activeTaskId) state.activeTaskId = task.id;
  saveTasksToCloud();
  renderTasks();
  updateBanner();
  $('#taskInput').value = '';
  $('#estInput').value = 1;
}

function selectTask(id) {
  state.activeTaskId = id;
  renderTasks();
  updateBanner();
}

function toggleComplete(id, e) {
  e.stopPropagation();
  const t = state.tasks.find((x) => x.id === id);
  if (t) {
    t.completed = !t.completed;
    saveTasksToCloud();
    renderTasks();
    updateBanner();
  }
}

function deleteTask(id, e) {
  e.stopPropagation();
  state.tasks = state.tasks.filter((x) => x.id !== id);
  if (state.activeTaskId === id) {
    state.activeTaskId = state.tasks[0]?.id || null;
  }
  saveTasksToCloud();
  renderTasks();
  updateBanner();
}

function updateBanner() {
  const t = state.tasks.find((x) => x.id === state.activeTaskId);
  if (t) {
    activeTitle.textContent = t.title;
    activePomo.textContent = `${t.donePomos || 0}/${t.est} 🍅`;
  } else {
    activeTitle.textContent = 'Chưa chọn tác vụ';
    activePomo.textContent = '0/0 🍅';
  }
}

function renderTasks() {
  const done = state.tasks.filter((t) => t.completed).length;
  taskStats.textContent = `${done}/${state.tasks.length} hoàn thành`;

  if (!state.tasks.length) {
    taskList.innerHTML = '';
    if (emptyState) {
      taskList.appendChild(emptyState);
      emptyState.style.display = 'block';
    }
    return;
  }
  if (emptyState) emptyState.style.display = 'none';

  taskList.innerHTML = state.tasks
    .map(
      (t) => `
    <div class="task-item ${t.id === state.activeTaskId ? 'active' : ''}" data-id="${t.id}">
      <div class="task-left">
        <button class="check-btn ${t.completed ? 'done' : ''}" data-action="toggle">${
          t.completed ? '✓' : ''
        }</button>
        <span class="task-title ${t.completed ? 'done' : ''}">${escapeHtml(t.title)}</span>
      </div>
      <div class="task-right">
        <span class="task-pomo">${t.donePomos || 0}/${t.est} 🍅</span>
        <button class="delete-btn" data-action="delete" title="Xóa">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `
    )
    .join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===================== AUDIO =====================
let ctx, master, noiseSrc, filter;

function initAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function playChime() {
  initAudio();
  const now = ctx.currentTime;
  [659.25, 880].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0, now + i * 0.15);
    g.gain.linearRampToValueAtTime(0.3, now + i * 0.15 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 1.2);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now + i * 0.15);
    o.stop(now + i * 0.15 + 1.2);
  });
}

function stopNoise() {
  if (noiseSrc) {
    try {
      noiseSrc.stop();
      noiseSrc.disconnect();
    } catch {}
    noiseSrc = null;
  }
  state.ambience = null;
  updateNoiseUI();
}

function toggleNoise(type) {
  initAudio();
  if (state.ambience === type) {
    stopNoise();
    return;
  }
  stopNoise();
  state.ambience = type;

  const buf = ctx.createBuffer(1, 2 * ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = buf;
  noiseSrc.loop = true;
  filter = ctx.createBiquadFilter();

  if (type === 'rain') {
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
  } else if (type === 'waves') {
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 0.12;
    lfoG.gain.value = 300;
    lfo.connect(lfoG);
    lfoG.connect(filter.frequency);
    lfo.start();
  } else {
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 1.2;
  }

  noiseSrc.connect(filter);
  filter.connect(master);
  noiseSrc.start();
  updateNoiseUI();
}

function updateNoiseUI() {
  $$('.noise-btn').forEach((b) => {
    const on = b.dataset.noise === state.ambience;
    b.textContent = on ? 'Tắt' : 'Bật';
    b.classList.toggle('on', on);
  });
  const audioBtn = $('#audioBtn');
  if (audioBtn) audioBtn.classList.toggle('active', !!state.ambience);
}

// ===================== UI HELPERS =====================
function showToast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function openModal(id) {
  const el = $(`#${id}`);
  if (el) el.classList.add('show');
}

function closeModal(id) {
  const el = $(`#${id}`);
  if (el) el.classList.remove('show');
}

// ===================== EVENTS =====================
startBtn.addEventListener('click', toggleTimer);
$('#resetBtn').addEventListener('click', resetTimer);
$('#skipBtn').addEventListener('click', skipTimer);

$$('.mode-tab').forEach((t) =>
  t.addEventListener('click', () => switchMode(t.dataset.mode))
);

$('#addForm').addEventListener('submit', addTask);

taskList.addEventListener('click', (e) => {
  const item = e.target.closest('.task-item');
  if (!item) return;
  const id = item.dataset.id;
  if (e.target.closest('[data-action="toggle"]')) toggleComplete(id, e);
  else if (e.target.closest('[data-action="delete"]')) deleteTask(id, e);
  else selectTask(id);
});

$('#audioBtn').addEventListener('click', () => openModal('ambienceModal'));
$('#settingsBtn').addEventListener('click', () => openModal('settingsModal'));

$$('[data-close]').forEach((b) =>
  b.addEventListener('click', () => closeModal(b.dataset.close))
);

$$('.modal-overlay').forEach((m) =>
  m.addEventListener('click', (e) => {
    if (e.target === m) m.classList.remove('show');
  })
);

$$('.noise-btn').forEach((b) =>
  b.addEventListener('click', () => toggleNoise(b.dataset.noise))
);

$('#volume').addEventListener('input', (e) => {
  const v = e.target.value;
  $('#volLabel').textContent = Math.round(v * 100) + '%';
  if (master) master.gain.setValueAtTime(v, ctx.currentTime);
});

$('#settingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  state.durations.pomodoro = (+$('#setPomo').value || 25) * 60;
  state.durations.shortBreak = (+$('#setShort').value || 5) * 60;
  state.durations.longBreak = (+$('#setLong').value || 15) * 60;
  switchMode(state.mode);
  saveSettingsToCloud();
  closeModal('settingsModal');
  showToast('Đã lưu cài đặt (đã đồng bộ)');
});

// Init display
switchMode('pomodoro');
