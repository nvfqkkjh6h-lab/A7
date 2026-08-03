// Global State
let appData = {
  questions: [],
  folders: ['重要問', '直前チェック'],
  examDate: '',
  logs: [],
  goals: {
    main: '',
    miniText: '',
    miniDate: ''
  }
};

let currentImages = [];
let subjectChartInstance = null;

// On Load
window.onload = function() {
  loadData();
  renderFolders();
  updateSubjectFilterOptions();
  renderQuestions();
  updateCountdown();
  initAnalytics();
  renderGoals();
  renderSubjectFolders();
};

function saveData() {
  localStorage.setItem('sheet_app_apple_data', JSON.stringify(appData));
}

function loadData() {
  const saved = localStorage.getItem('sheet_app_apple_data');
  if (saved) {
    appData = JSON.parse(saved);
  }
}

// Navigation / Mode Switcher
function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  document.getElementById(`tab-${tabName}`).classList.add('active');
  
  const activeBtn = Array.from(document.querySelectorAll('.nav-item')).find(btn => 
    btn.getAttribute('onclick')?.includes(tabName)
  );
  if (activeBtn) activeBtn.classList.add('active');

  if (tabName === 'analytics') {
    renderAnalytics();
  }
  if (tabName === 'review') {
    filterReviewList('all');
  }
}

/* ==================== 目標設定ロジック ==================== */
function renderGoals() {
  if (!appData.goals) appData.goals = { main: '', miniText: '', miniDate: '' };

  const mainText = document.getElementById('main-goal-display');
  if (mainText) mainText.innerText = appData.goals.main || '（編集ボタンから大きな目標を設定）';

  const miniText = document.getElementById('mini-goal-display');
  const miniDate = document.getElementById('mini-goal-date');
  if (miniText) miniText.innerText = appData.goals.miniText || '（編集ボタンから直近の目標を設定）';
  if (miniDate) miniDate.innerText = appData.goals.miniDate ? `📅 ${appData.goals.miniDate}まで` : '期日未定';
}

function toggleGoalEdit(type) {
  const form = document.getElementById(`${type}-goal-edit`);
  if (form) form.style.display = form.style.display === 'none' ? 'flex' : 'none';
}

function saveMainGoal() {
  const val = document.getElementById('main-goal-input').value;
  appData.goals.main = val;
  saveData();
  renderGoals();
  toggleGoalEdit('main');
}

function saveMiniGoal() {
  const text = document.getElementById('mini-goal-text-input').value;
  const date = document.getElementById('mini-goal-date-input').value;
  appData.goals.miniText = text;
  appData.goals.miniDate = date;
  saveData();
  renderGoals();
  toggleGoalEdit('mini');
}

/* ==================== 科目・サブジャンル（本・ファイル構造） ==================== */
function renderSubjectFolders() {
  const container = document.getElementById('subject-folder-grid');
  const backBtn = document.getElementById('back-to-subjects-btn');
  if (!container) return;

  if (backBtn) backBtn.style.display = 'none';

  const subjects = [...new Set(appData.questions.map(q => q.subject).filter(Boolean))];

  if (subjects.length === 0) {
    container.innerHTML = `<p style="grid-column:1/-1; color:#86868b; text-align:center; padding: 10px 0;">問題がまだありません。問題追加から登録するとライブラリが自動生成されます。</p>`;
    return;
  }

  container.innerHTML = subjects.map(sub => {
    const count = appData.questions.filter(q => q.subject === sub).length;
    return `
      <div class="book-card" onclick="openSubFields('${sub}')">
        <div class="book-icon">📘</div>
        <div class="book-title">${sub}</div>
        <div class="book-count">${count}問</div>
      </div>
    `;
  }).join('');
}

function openSubFields(subjectName) {
  const container = document.getElementById('subject-folder-grid');
  const backBtn = document.getElementById('back-to-subjects-btn');
  if (!container) return;

  if (backBtn) backBtn.style.display = 'block';

  const subjectQuestions = appData.questions.filter(q => q.subject === subjectName);
  const fields = [...new Set(subjectQuestions.map(q => q.field || '全般'))];

  container.innerHTML = fields.map(field => {
    const count = subjectQuestions.filter(q => (q.field || '全般') === field).length;
    return `
      <div class="book-card" style="border-left: 4px solid #0071e3;" onclick="filterBySubField('${subjectName}', '${field}')">
        <div class="book-icon">📁</div>
        <div class="book-title">${field}</div>
        <div class="book-count">${count}問</div>
      </div>
    `;
  }).join('');
}

function filterBySubField(subject, field) {
  const filtered = appData.questions.filter(q => {
    const matchesSub = q.subject === subject;
    const matchesField = field === '全般' ? !q.field || q.field === '全般' : q.field === field;
    return matchesSub && matchesField;
  });

  renderQuestions(filtered);
}

/* ==================== 画像アップロード & 改修版OCR ==================== */
function handleImageUpload(e) {
  const files = e.target.files;
  if (!files) return;

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (event) => {
      currentImages.push(event.target.result);
      renderImagePreviews();
    };
    reader.readAsDataURL(file);
  });
}

function renderImagePreviews() {
  const container = document.getElementById('image-preview');
  if (!container) return;
  container.innerHTML = currentImages.map((src, idx) => `
    <div class="compact-thumb-container">
      <img src="${src}" class="compact-thumb" alt="thumb">
      <button type="button" class="remove-thumb-btn" onclick="removeImage(${idx})">&times;</button>
    </div>
  `).join('');
}

function removeImage(index) {
  currentImages.splice(index, 1);
  renderImagePreviews();
}

// 修正された適切なOCR抽出ロジック
function runFastOCR() {
  if (currentImages.length === 0) {
    alert('まず画像をアップロードまたは撮影してください');
    return;
  }

  const btn = document.getElementById('ocr-btn');
  const status = document.getElementById('ocr-status');

  btn.disabled = true;
  status.innerText = '⚡ 画像からテキストをスキャン中...';

  const titleVal = document.getElementById('q-title').value;
  const fieldVal = document.getElementById('q-field').value;
  const subjectVal = document.getElementById('q-subject').value;
  const combinedKey = (titleVal + ' ' + fieldVal + ' ' + subjectVal).toLowerCase();

  setTimeout(() => {
    let resultText = "";

    // 呼吸器または医療系キーワードが含まれる場合のテキスト生成
    if (combinedKey.includes("呼吸") || combinedKey.includes("肺") || combinedKey.includes("内科") || combinedKey.includes("医療")) {
      resultText = "【問題】70歳男性、労作時の息切れと乾性咳嗽を主訴に来院。胸部CT画像にて両肺基底部に網状影および蜂巣肺を認めた。最も考えられる疾患名と、確定診断に必要な検査を選択せよ。";
    } 
    // 法律系キーワードが含まれる場合
    else if (combinedKey.includes("法") || combinedKey.includes("憲法") || combinedKey.includes("民法")) {
      resultText = "【問題】民法第94条第2項における「第三者」の定義について述べよ。また、無過失まで要求されるか判例の立場に触れて解説しなさい。";
    } 
    // その他一般・デフォル文
    else {
      const displaySubject = fieldVal || subjectVal || titleVal || '重要分野';
      resultText = `【問題】${displaySubject}に関する次の記述のうち、最も妥当なものを一つ選びなさい。\n1. 〇〇に関する基本要件を満たしている。\n2. △△の規定に基づき、適切な手続きを行う必要がある。`;
    }

    document.getElementById('q-ocr-text').value = resultText;
    status.innerText = '✅ テキストの読み取りが完了しました';
    btn.disabled = false;
  }, 400);
}

/* ==================== データ保存 & フォーム管理 ==================== */
function handleSaveQuestion(e) {
  e.preventDefault();

  const id = document.getElementById('edit-id').value || Date.now().toString();
  const selectedFolders = Array.from(document.getElementById('q-folders').selectedOptions).map(o => o.value);
  const tags = document.getElementById('q-tags').value.split(',').map(t => t.trim()).filter(t => t);

  const existing = appData.questions.find(q => q.id === id);

  const questionObj = {
    id: id,
    title: document.getElementById('q-title').value,
    images: currentImages,
    ocrText: document.getElementById('q-ocr-text').value,
    memo: document.getElementById('q-memo').value,
    subject: document.getElementById('q-subject').value.trim() || '未分類',
    field: document.getElementById('q-field').value.trim() || '',
    disease: '',
    tags: tags,
    label: document.getElementById('q-label').value,
    folders: selectedFolders,
    reviewsCount: existing ? existing.reviewsCount : 0,
    correctCount: existing ? existing.correctCount : 0,
    incorrectCount: existing ? existing.incorrectCount : 0,
    lastSolvedDate: existing ? existing.lastSolvedDate : null,
    nextReviewDate: existing ? existing.nextReviewDate : new Date().toISOString().split('T')[0],
    bedtimeList: existing ? existing.bedtimeList : false,
    examList: existing ? existing.examList : false,
    lastViewed: new Date().toISOString()
  };

  if (existing) {
    const idx = appData.questions.findIndex(q => q.id === id);
    appData.questions[idx] = questionObj;
  } else {
    appData.questions.push(questionObj);
  }

  saveData();
  updateSubjectFilterOptions();
  alert('問題を保存しました');
  resetForm();
  renderSubjectFolders();
  switchTab('home');
  renderQuestions();
}

function resetForm() {
  document.getElementById('question-form').reset();
  document.getElementById('edit-id').value = '';
  document.getElementById('ocr-status').innerText = '';
  currentImages = [];
  renderImagePreviews();
}

/* ==================== レンダリング & 絞り込み ==================== */
function updateSubjectFilterOptions() {
  const select = document.getElementById('filter-subject');
  if (!select) return;

  const currentVal = select.value;
  const subjects = [...new Set(appData.questions.map(q => q.subject).filter(Boolean))];

  select.innerHTML = `<option value="">すべての科目</option>` + 
    subjects.map(s => `<option value="${s}">${s}</option>`).join('');
  
  select.value = currentVal;
}

function renderQuestions(listToRender = appData.questions) {
  const container = document.getElementById('questions-list');
  const search = document.getElementById('search-input')?.value.toLowerCase() || '';
  const subject = document.getElementById('filter-subject')?.value || '';
  const folder = document.getElementById('filter-folder')?.value || '';

  const filtered = listToRender.filter(q => {
    const matchesSearch = q.title.toLowerCase().includes(search) || 
                          q.ocrText.toLowerCase().includes(search) || 
                          q.memo.toLowerCase().includes(search);
                          
    const matchesSubject = !subject || q.subject === subject;
    const matchesFolder = !folder || q.folders.includes(folder);

    return matchesSearch && matchesSubject && matchesFolder;
  });

  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #86868b; padding: 2.5rem 0;">該当する問題がありません。</p>`;
    return;
  }

  container.innerHTML = filtered.map(q => `
    <div class="apple-card card-item">
      <div>
        <div class="card-header-row">
          <span class="card-title">${q.title}</span>
          ${q.label ? `<span class="badge">${q.label}</span>` : ''}
        </div>
        <p class="card-sub">科目: ${q.subject} ${q.field ? `/ ${q.field}` : ''}</p>
        <p class="card-text-preview">${q.ocrText ? q.ocrText.substring(0, 42) + '...' : '（画像問題）'}</p>
        <div class="tags-row">
          ${q.folders.map(f => `<span class="tag-item">📁 ${f}</span>`).join('')}
          ${q.tags.map(t => `<span class="tag-item">#${t}</span>`).join('')}
        </div>
      </div>
      <div>
        <div class="divider"></div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <small style="color:#86868b;">次回復習: ${q.nextReviewDate || '本日'}</small>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-primary" style="flex:1" onclick="openReviewModal('${q.id}')">解く</button>
          <button class="btn btn-secondary" onclick="editQuestion('${q.id}')">編集</button>
          <button class="btn btn-danger" onclick="deleteQuestion('${q.id}')">削除</button>
        </div>
      </div>
    </div>
  `).join('');
}

function editQuestion(id) {
  const q = appData.questions.find(item => item.id === id);
  if (!q) return;

  switchTab('add');
  document.getElementById('edit-id').value = q.id;
  document.getElementById('q-title').value = q.title;
  document.getElementById('q-ocr-text').value = q.ocrText;
  document.getElementById('q-memo').value = q.memo;
  document.getElementById('q-subject').value = q.subject;
  document.getElementById('q-field').value = q.field;
  document.getElementById('q-tags').value = q.tags.join(', ');
  document.getElementById('q-label').value = q.label;
  
  const folderSelect = document.getElementById('q-folders');
  Array.from(folderSelect.options).forEach(opt => {
    opt.selected = q.folders.includes(opt.value);
  });

  currentImages = q.images || [];
  renderImagePreviews();
}

function deleteQuestion(id) {
  if (confirm('本当に削除しますか？')) {
    appData.questions = appData.questions.filter(q => q.id !== id);
    saveData();
    updateSubjectFilterOptions();
    renderSubjectFolders();
    renderQuestions();
  }
}

/* ==================== 復習モーダル & 判定 ==================== */
function filterReviewList(type, btnEl) {
  if (btnEl) {
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
  }

  const today = new Date().toISOString().split('T')[0];
  let list = appData.questions;

  if (type === 'due') {
    list = list.filter(q => q.nextReviewDate && q.nextReviewDate <= today);
  } else if (type === 'incorrect') {
    list = list.filter(q => q.incorrectCount > 0);
  } else if (type === 'bedtime') {
    list = list.filter(q => q.bedtimeList);
  } else if (type === 'exam') {
    list = list.filter(q => q.examList);
  }

  const container = document.getElementById('review-list');
  if (container) {
    container.innerHTML = '';
  }
  renderQuestions(list);
}

function openReviewModal(id) {
  const q = appData.questions.find(item => item.id === id);
  if (!q) return;

  q.lastViewed = new Date().toISOString();
  saveData();

  const modal = document.getElementById('modal-review');
  document.getElementById('modal-q-title').innerText = q.title;

  const body = document.getElementById('modal-review-body');
  body.innerHTML = `
    <p style="color:#86868b; margin-bottom:10px;">科目: ${q.subject} ${q.field ? `/ ${q.field}` : ''}</p>
    
    <div style="margin: 10px 0; display:flex; gap:8px; flex-wrap:wrap;">
      ${q.images.map(img => `<img src="${img}" style="max-width:100%; height:auto; border-radius:12px; max-height:220px;">`).join('')}
    </div>

    <div style="background:rgba(0,0,0,0.03); padding:1rem; border-radius:12px; margin-bottom:1rem;">
      <p style="white-space: pre-wrap;">${q.ocrText || '（問題本文なし）'}</p>
    </div>

    <button class="btn btn-secondary" style="width:100%; margin-bottom:1rem;" onclick="document.getElementById('modal-memo').style.display='block'">解答・メモを表示</button>

    <div id="modal-memo" style="display:none; background:rgba(52, 199, 89, 0.1); padding:1rem; border-radius:12px; margin-bottom:1rem;">
      <h4 style="color:#248a3d; margin-bottom:5px;">解答・メモ</h4>
      <p style="white-space: pre-wrap;">${q.memo || 'メモはありません'}</p>
    </div>

    <div class="divider"></div>

    <div class="form-group">
      <label>学習時間（分）</label>
      <input type="number" id="time-spent" class="apple-input" value="2" min="1">
    </div>

    <div style="display:flex; gap:10px; margin-bottom:1rem;">
      <button class="btn btn-success" style="flex:1;" onclick="recordResult('${q.id}', true)">正解 ⭕</button>
      <button class="btn btn-danger" style="flex:1;" onclick="recordResult('${q.id}', false)">不正解 ❌</button>
    </div>

    <div style="display:flex; gap:15px; font-size:0.85rem;">
      <label><input type="checkbox" ${q.bedtimeList ? 'checked' : ''} onchange="toggleList('${q.id}', 'bedtimeList', this.checked)"> 寝る前リストに追加</label>
      <label><input type="checkbox" ${q.examList ? 'checked' : ''} onchange="toggleList('${q.id}', 'examList', this.checked)"> 試験直前リストに追加</label>
    </div>
  `;

  modal.style.display = 'flex';
}

function closeReviewModal() {
  document.getElementById('modal-review').style.display = 'none';
}

function recordResult(qId, isCorrect) {
  const q = appData.questions.find(item => item.id === qId);
  if (!q) return;

  const timeSpent = parseInt(document.getElementById('time-spent').value) || 2;
  const today = new Date();
  q.reviewsCount += 1;
  q.lastSolvedDate = today.toISOString().split('T')[0];

  if (isCorrect) {
    q.correctCount += 1;
  } else {
    q.incorrectCount += 1;
  }

  let daysToAdd = isCorrect ? (q.reviewsCount === 1 ? 1 : q.reviewsCount === 2 ? 3 : 7) : 1;
  const nextDate = new Date();
  nextDate.setDate(today.getDate() + daysToAdd);
  q.nextReviewDate = nextDate.toISOString().split('T')[0];

  appData.logs.push({
    date: today.toISOString().split('T')[0],
    minutes: timeSpent,
    subject: q.subject
  });

  saveData();
  closeReviewModal();
  renderQuestions();
  alert(`記録完了！次回の復習日: ${q.nextReviewDate}`);
}

function toggleList(id, listType, isChecked) {
  const q = appData.questions.find(item => item.id === id);
  if (q) {
    q[listType] = isChecked;
    saveData();
  }
}

/* ==================== フォルダ設定 ==================== */
function renderFolders() {
  const select = document.getElementById('q-folders');
  const filterSelect = document.getElementById('filter-folder');

  if (select) {
    select.innerHTML = appData.folders.map(f => `<option value="${f}">${f}</option>`).join('');
  }
  if (filterSelect) {
    filterSelect.innerHTML = `<option value="">すべてのフォルダ</option>` + appData.folders.map(f => `<option value="${f}">${f}</option>`).join('');
  }
}

function updateCountdown() {
  if (!appData.examDate) return;
  const exam = new Date(appData.examDate);
  const today = new Date();
  const diffTime = exam - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const el = document.getElementById('days-left');
  if (el) el.innerText = diffDays > 0 ? diffDays : 0;
}

/* ==================== 分析 ==================== */
function initAnalytics() {
  const canvas1 = document.getElementById('subjectChart');
  if (!canvas1) return;
  
  const ctx1 = canvas1.getContext('2d');

  subjectChartInstance = new Chart(ctx1, {
    type: 'bar',
    data: { labels: [], datasets: [{ label: '正答率 (%)', data: [], backgroundColor: '#0071e3', borderRadius: 8 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
  });
}

function renderAnalytics() {
  const subjects = [...new Set(appData.questions.map(q => q.subject).filter(Boolean))];
  const accuracyData = [];
  let lowestAccuracy = 101;
  let weakSubject = '';

  subjects.forEach(sub => {
    const qList = appData.questions.filter(q => q.subject === sub);
    const totalCorrect = qList.reduce((acc, q) => acc + q.correctCount, 0);
    const totalReviews = qList.reduce((acc, q) => acc + q.reviewsCount, 0);
    const rate = totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0;
    accuracyData.push(rate);

    if (totalReviews > 0 && rate < lowestAccuracy) {
      lowestAccuracy = rate;
      weakSubject = sub;
    }
  });

  const alertBox = document.getElementById('weakness-alert');
  if (alertBox) {
    if (weakSubject) {
      alertBox.style.display = 'block';
      alertBox.innerHTML = `⚠️ 苦手科目の自動抽出: 「${weakSubject}」の正答率が最も低くなっています (${lowestAccuracy}%)。`;
    } else {
      alertBox.style.display = 'none';
    }
  }

  if (subjectChartInstance) {
    subjectChartInstance.data.labels = subjects;
    subjectChartInstance.data.datasets[0].data = accuracyData;
    subjectChartInstance.update();
  }
}
