import { parseFollowing, parseFollowers, compareAccounts, extractZipData } from './parser.js';

// Application State
const state = {
  activeSyncCode: null,
  sessionName: 'Instagram Review',
  totalFollowing: 0,
  totalFollowers: 0,
  nonFollowers: [], // Array of { username, href, timestamp }
  completedMap: {}, // username -> completed_at timestamp
  actionsLastHour: 0,
  qrCodeUrl: null,
  
  // UI filter state
  searchQuery: '',
  activeTab: 'all', // 'all' | 'pending' | 'completed'
  sortBy: 'az', // 'az' | 'za' | 'newest' | 'oldest'

  // Staged files
  followingFileContent: null,
  followersFileContent: null,
  followingFileName: null,
  followersFileName: null,

  // Polling interval
  pollTimer: null
};

// DOM Elements
const DOM = {
  // Navigation & Sync
  syncActionsBar: document.getElementById('syncActionsBar'),
  displaySyncCode: document.getElementById('displaySyncCode'),
  btnOpenPairModal: document.getElementById('btnOpenPairModal'),
  btnLoadDemoTop: document.getElementById('btnLoadDemoTop'),
  
  // Safety banner
  gaugeCount: document.getElementById('gaugeCount'),
  gaugeBarFill: document.getElementById('gaugeBarFill'),
  gaugeStatusBadge: document.getElementById('gaugeStatusBadge'),
  
  // Upload section
  dataSourceCard: document.getElementById('dataSourceCard'),
  btnDemoData: document.getElementById('btnDemoData'),
  dropzoneZip: document.getElementById('dropzoneZip'),
  fileZip: document.getElementById('fileZip'),
  statusZip: document.getElementById('statusZip'),
  dropzoneFollowing: document.getElementById('dropzoneFollowing'),
  dropzoneFollowers: document.getElementById('dropzoneFollowers'),
  fileFollowing: document.getElementById('fileFollowing'),
  fileFollowers: document.getElementById('fileFollowers'),
  statusFollowing: document.getElementById('statusFollowing'),
  statusFollowers: document.getElementById('statusFollowers'),
  fileInfoSummary: document.getElementById('fileInfoSummary'),
  btnProcessFiles: document.getElementById('btnProcessFiles'),
  
  // Dashboard & Metrics
  dashboardMain: document.getElementById('dashboardMain'),
  valTotalFollowing: document.getElementById('valTotalFollowing'),
  valTotalFollowers: document.getElementById('valTotalFollowers'),
  valNonFollowers: document.getElementById('valNonFollowers'),
  valNonFollowersPct: document.getElementById('valNonFollowersPct'),
  valCompleted: document.getElementById('valCompleted'),
  valRemaining: document.getElementById('valRemaining'),
  progressPctText: document.getElementById('progressPctText'),
  progressBarFill: document.getElementById('progressBarFill'),

  // Filters & Controls
  searchFilter: document.getElementById('searchFilter'),
  btnClearSearch: document.getElementById('btnClearSearch'),
  filterTabs: document.querySelectorAll('.tab-btn'),
  badgeAll: document.getElementById('badgeAll'),
  badgePending: document.getElementById('badgePending'),
  badgeCompleted: document.getElementById('badgeCompleted'),
  sortSelect: document.getElementById('sortSelect'),
  btnOpenNext: document.getElementById('btnOpenNext'),
  showingCountText: document.getElementById('showingCountText'),
  btnExportCsv: document.getElementById('btnExportCsv'),
  btnExportJson: document.getElementById('btnExportJson'),
  btnResetAll: document.getElementById('btnResetAll'),
  feedContainer: document.getElementById('feedContainer'),
  emptyState: document.getElementById('emptyState'),

  // Modal
  pairModal: document.getElementById('pairModal'),
  btnClosePairModal: document.getElementById('btnClosePairModal'),
  qrCodeImage: document.getElementById('qrCodeImage'),
  modalSyncCodeText: document.getElementById('modalSyncCodeText'),
  btnCopyCode: document.getElementById('btnCopyCode'),
  inputSyncUrl: document.getElementById('inputSyncUrl'),
  btnCopyLink: document.getElementById('btnCopyLink'),
  inputJoinCode: document.getElementById('inputJoinCode'),
  btnJoinCode: document.getElementById('btnJoinCode'),

  // Toast
  toastContainer: document.getElementById('toastContainer')
};

/* ==========================================================================
   Helper Functions & Notifications
   ========================================================================== */

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  const icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  
  DOM.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatDate(timestamp) {
  if (!timestamp) return 'Date unknown';
  const ms = timestamp > 1e11 ? timestamp : timestamp * 1000;
  const date = new Date(ms);
  if (isNaN(date.getTime())) return 'Date unknown';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/* ==========================================================================
   Hourly Rate & Safety Gauge
   ========================================================================== */

function updateSafetyGauge() {
  const hourlyCount = state.actionsLastHour || 0;
  DOM.gaugeCount.textContent = `${hourlyCount} / 25`;

  const pct = Math.min(100, Math.round((hourlyCount / 25) * 100));
  DOM.gaugeBarFill.style.width = `${pct}%`;

  if (hourlyCount <= 15) {
    DOM.gaugeBarFill.style.backgroundColor = 'var(--color-safe)';
    DOM.gaugeStatusBadge.textContent = 'Safe Pace';
    DOM.gaugeStatusBadge.className = 'gauge-badge status-safe';
  } else if (hourlyCount <= 25) {
    DOM.gaugeBarFill.style.backgroundColor = 'var(--color-warning)';
    DOM.gaugeStatusBadge.textContent = 'Moderate Pace';
    DOM.gaugeStatusBadge.className = 'gauge-badge status-warning';
  } else {
    DOM.gaugeBarFill.style.backgroundColor = 'var(--color-danger)';
    DOM.gaugeStatusBadge.textContent = 'Cooldown Recommended!';
    DOM.gaugeStatusBadge.className = 'gauge-badge status-danger';
  }
}

/* ==========================================================================
   Metrics & UI Update
   ========================================================================== */

function updateSummaryMetrics() {
  DOM.valTotalFollowing.textContent = state.totalFollowing.toLocaleString();
  DOM.valTotalFollowers.textContent = state.totalFollowers.toLocaleString();
  
  const nonFollowersTotal = state.nonFollowers.length;
  DOM.valNonFollowers.textContent = nonFollowersTotal.toLocaleString();
  
  const pctOfFollowing = state.totalFollowing > 0 
    ? Math.round((nonFollowersTotal / state.totalFollowing) * 100) 
    : 0;
  DOM.valNonFollowersPct.textContent = `${pctOfFollowing}% of your following`;

  const completedCount = Object.keys(state.completedMap).length;
  const remainingCount = Math.max(0, nonFollowersTotal - completedCount);
  DOM.valCompleted.textContent = completedCount.toLocaleString();
  DOM.valRemaining.textContent = `${remainingCount.toLocaleString()} remaining`;

  const progressPct = nonFollowersTotal > 0
    ? Math.round((completedCount / nonFollowersTotal) * 100)
    : 0;
  DOM.progressPctText.textContent = `${progressPct}%`;
  DOM.progressBarFill.style.width = `${progressPct}%`;

  // Filter tabs counts
  DOM.badgeAll.textContent = nonFollowersTotal;
  DOM.badgePending.textContent = remainingCount;
  DOM.badgeCompleted.textContent = completedCount;

  // Active sync pill
  if (state.activeSyncCode) {
    DOM.displaySyncCode.textContent = state.activeSyncCode;
  }

  updateSafetyGauge();
}

/* ==========================================================================
   Feed Rendering & Filtering
   ========================================================================== */

function getFilteredAndSortedAccounts() {
  const query = state.searchQuery.toLowerCase().trim();

  let filtered = state.nonFollowers.filter(account => {
    const usernameLower = account.username.toLowerCase();
    const isCompleted = Boolean(state.completedMap[usernameLower]);

    // Tab filter
    if (state.activeTab === 'pending' && isCompleted) return false;
    if (state.activeTab === 'completed' && !isCompleted) return false;

    // Search query filter
    if (query && !usernameLower.includes(query)) return false;

    return true;
  });

  // Sorting
  filtered.sort((a, b) => {
    if (state.sortBy === 'az') {
      return a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
    }
    if (state.sortBy === 'za') {
      return b.username.localeCompare(a.username, undefined, { sensitivity: 'base' });
    }
    if (state.sortBy === 'newest') {
      return (b.timestamp || 0) - (a.timestamp || 0);
    }
    if (state.sortBy === 'oldest') {
      return (a.timestamp || 0) - (b.timestamp || 0);
    }
    return 0;
  });

  return filtered;
}

function renderFeed() {
  const accounts = getFilteredAndSortedAccounts();
  DOM.feedContainer.innerHTML = '';

  DOM.showingCountText.textContent = `Showing ${accounts.length} of ${state.nonFollowers.length} accounts`;

  if (accounts.length === 0) {
    DOM.emptyState.classList.remove('hidden');
    return;
  }
  DOM.emptyState.classList.add('hidden');

  const fragment = document.createDocumentFragment();

  accounts.forEach(account => {
    const usernameLower = account.username.toLowerCase();
    const isCompleted = Boolean(state.completedMap[usernameLower]);
    const initial = account.username.charAt(0).toUpperCase();
    const followDateStr = formatDate(account.timestamp);

    const card = document.createElement('div');
    card.className = `account-card ${isCompleted ? 'completed' : ''}`;
    card.dataset.username = account.username;

    card.innerHTML = `
      <div class="account-info">
        <div class="avatar-ring">
          <div class="avatar-inner">${initial}</div>
        </div>
        <div class="account-details">
          <div class="account-handle-row">
            <a href="${account.href}" target="_blank" rel="noopener noreferrer" class="account-handle">
              @${account.username}
            </a>
          </div>
          <span class="account-date">Followed: ${followDateStr}</span>
        </div>
      </div>
      
      <div class="account-actions">
        ${
          isCompleted
            ? `
              <span class="badge-completed">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="3" fill="none">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Done
              </span>
              <button class="btn-undo" data-username="${account.username}">Undo</button>
            `
            : `
              <button class="btn-unfollow" data-username="${account.username}" data-href="${account.href}">
                <span>Unfollow</span>
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </button>
            `
        }
      </div>
    `;

    fragment.appendChild(card);
  });

  DOM.feedContainer.appendChild(fragment);
}

/* ==========================================================================
   One-Click Unfollow & Action Tracking
   ========================================================================== */

async function handleUnfollowAction(username, href) {
  const usernameLower = username.toLowerCase();

  // 1. Open Instagram profile in a new tab immediately
  window.open(href, '_blank', 'noopener,noreferrer');

  // 2. Optimistic local state update
  state.completedMap[usernameLower] = Date.now();
  state.actionsLastHour = (state.actionsLastHour || 0) + 1;
  updateSummaryMetrics();
  renderFeed();

  showToast(`Opened @${username} • Marked as completed`, 'success');

  // 3. Persist to server / database
  if (state.activeSyncCode) {
    try {
      const res = await fetch(`/api/sessions/${state.activeSyncCode}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, isCompleted: true })
      });
      const data = await res.json();
      if (data.session) {
        state.completedMap = data.session.completedMap || state.completedMap;
        state.actionsLastHour = data.session.actionsLastHour ?? state.actionsLastHour;
        updateSummaryMetrics();
      }
    } catch (err) {
      console.warn('Sync server update failed:', err);
    }
  }

  // Also save to localStorage as backup
  localStorage.setItem(`instaboard_completed_${state.activeSyncCode || 'local'}`, JSON.stringify(state.completedMap));
}

async function handleUndoAction(username) {
  const usernameLower = username.toLowerCase();

  delete state.completedMap[usernameLower];
  state.actionsLastHour = Math.max(0, (state.actionsLastHour || 1) - 1);
  updateSummaryMetrics();
  renderFeed();

  showToast(`Reverted @${username} to pending`, 'info');

  if (state.activeSyncCode) {
    try {
      const res = await fetch(`/api/sessions/${state.activeSyncCode}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, isCompleted: false })
      });
      const data = await res.json();
      if (data.session) {
        state.completedMap = data.session.completedMap || state.completedMap;
        state.actionsLastHour = data.session.actionsLastHour ?? state.actionsLastHour;
        updateSummaryMetrics();
      }
    } catch (err) {
      console.warn('Sync server update failed:', err);
    }
  }

  localStorage.setItem(`instaboard_completed_${state.activeSyncCode || 'local'}`, JSON.stringify(state.completedMap));
}

// "Open Next" shortcut
function handleOpenNext() {
  const pending = state.nonFollowers.find(a => !state.completedMap[a.username.toLowerCase()]);
  if (!pending) {
    showToast('All non-followers have been reviewed! 🎉', 'success');
    return;
  }
  handleUnfollowAction(pending.username, pending.href);
}

/* ==========================================================================
   Sync Session Management
   ========================================================================== */

async function applySession(sessionData, qrCode) {
  state.activeSyncCode = sessionData.code;
  state.totalFollowing = sessionData.totalFollowing || 0;
  state.totalFollowers = sessionData.totalFollowers || 0;
  state.nonFollowers = sessionData.items || [];
  state.completedMap = sessionData.completedMap || {};
  state.actionsLastHour = sessionData.actionsLastHour || 0;
  state.qrCodeUrl = qrCode;

  // Persist last sync code in localStorage and URL
  localStorage.setItem('instaboard_last_sync_code', sessionData.code);
  const newUrl = new URL(window.location);
  newUrl.searchParams.set('sync', sessionData.code);
  window.history.replaceState({}, '', newUrl);

  // Update pairing modal info
  DOM.modalSyncCodeText.textContent = sessionData.code;
  DOM.inputSyncUrl.value = newUrl.href;
  if (qrCode) {
    DOM.qrCodeImage.src = qrCode;
  }

  // Reveal main dashboard
  DOM.dashboardMain.classList.remove('hidden');
  updateSummaryMetrics();
  renderFeed();

  // Start background live-sync polling
  startSyncPolling();
}

async function loadSessionFromBackend(code) {
  try {
    const origin = window.location.origin;
    const res = await fetch(`/api/sessions/${code}?origin=${encodeURIComponent(origin)}`, {
      headers: { 'X-Client-Origin': origin }
    });
    if (!res.ok) {
      throw new Error(`Session ${code} not found`);
    }
    const data = await res.json();
    if (data.success && data.session) {
      await applySession(data.session, data.qrCode);
      showToast(`Connected to sync session ${code}`, 'success');
      return true;
    }
  } catch (err) {
    console.error('Error loading session:', err);
    showToast(`Could not load session ${code}: ${err.message}`, 'warning');
  }
  return false;
}

function startSyncPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);

  state.pollTimer = setInterval(async () => {
    if (!state.activeSyncCode) return;
    try {
      const res = await fetch(`/api/sessions/${state.activeSyncCode}`);
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          const newCompletedCount = Object.keys(data.session.completedMap || {}).length;
          const currentCompletedCount = Object.keys(state.completedMap).length;

          if (newCompletedCount !== currentCompletedCount) {
            state.completedMap = data.session.completedMap || {};
            state.actionsLastHour = data.session.actionsLastHour ?? state.actionsLastHour;
            updateSummaryMetrics();
            renderFeed();
          }
        }
      }
    } catch {
      // Quiet background polling failure
    }
  }, 3500);
}

/* ==========================================================================
   File Staging & Analysis
   ========================================================================== */

function checkFilesReady() {
  if (state.followingFileContent && state.followersFileContent) {
    DOM.btnProcessFiles.disabled = false;
    DOM.fileInfoSummary.textContent = 'Both files loaded and ready to analyze!';
    DOM.fileInfoSummary.style.color = 'var(--color-safe)';
  } else if (state.followingFileContent) {
    DOM.btnProcessFiles.disabled = true;
    DOM.fileInfoSummary.textContent = 'following.json loaded. Please select followers_1.json.';
    DOM.fileInfoSummary.style.color = 'var(--text-secondary)';
  } else if (state.followersFileContent) {
    DOM.btnProcessFiles.disabled = true;
    DOM.fileInfoSummary.textContent = 'followers_1.json loaded. Please select following.json.';
    DOM.fileInfoSummary.style.color = 'var(--text-secondary)';
  } else {
    DOM.btnProcessFiles.disabled = true;
    DOM.fileInfoSummary.textContent = 'Waiting for both files...';
    DOM.fileInfoSummary.style.color = 'var(--text-secondary)';
  }
}

function handleFileRead(file, type) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target.result;
      JSON.parse(content); // validate JSON

      if (type === 'following') {
        state.followingFileContent = content;
        state.followingFileName = file.name;
        DOM.dropzoneFollowing.classList.add('loaded');
        DOM.statusFollowing.textContent = `Loaded (${(file.size / 1024).toFixed(1)} KB)`;
      } else {
        state.followersFileContent = content;
        state.followersFileName = file.name;
        DOM.dropzoneFollowers.classList.add('loaded');
        DOM.statusFollowers.textContent = `Loaded (${(file.size / 1024).toFixed(1)} KB)`;
      }
      checkFilesReady();
      showToast(`Loaded ${file.name}`, 'info');
    } catch (err) {
      showToast(`Invalid JSON file (${file.name}): ${err.message}`, 'warning');
    }
  };
  reader.readAsText(file);
}

/* ==========================================================================
   Zip Upload & Extraction
   ========================================================================== */

async function handleZipFile(file) {
  if (!file) return;

  try {
    DOM.dropzoneZip.classList.remove('drag-over');
    DOM.dropzoneZip.classList.add('loading');
    DOM.statusZip.textContent = `Unpacking ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`;
    DOM.statusZip.style.color = 'var(--text-secondary)';
    showToast(`Unpacking Instagram export zip: ${file.name}...`, 'info');

    // Extract following.json and followers_*.json from zip in browser
    const extracted = await extractZipData(file, window.JSZip);
    const comparison = compareAccounts(extracted.following, extracted.followers);

    DOM.dropzoneZip.classList.remove('loading');
    DOM.dropzoneZip.classList.add('loaded');
    DOM.statusZip.textContent = `Extracted ${extracted.following.length} following & ${extracted.followers.length} followers (${extracted.fileNamesFound.length} files parsed)`;
    DOM.statusZip.style.color = 'var(--color-safe)';

    showToast(`Extracted ${extracted.following.length} following & ${extracted.followers.length} followers!`, 'success');

    // Create session in backend SQLite
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Origin': window.location.origin
      },
      body: JSON.stringify({
        name: file.name.replace(/\.zip$/i, ''),
        totalFollowing: comparison.totalFollowing,
        totalFollowers: comparison.totalFollowers,
        items: comparison.nonFollowers,
        origin: window.location.origin
      })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to create session');
    }

    await applySession(data.session, data.qrCode);
    showToast(`Session created! Sync code: ${data.session.code}`, 'success');

    // Smooth scroll to metrics
    DOM.dashboardMain.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    console.error('Zip extraction error:', err);
    DOM.dropzoneZip.classList.remove('loading');
    DOM.statusZip.textContent = 'Extraction failed: ' + err.message;
    DOM.statusZip.style.color = 'var(--color-danger)';
    showToast(`Zip error: ${err.message}`, 'warning');
  }
}

function setupDropzones() {
  // 1. Primary ZIP Dropzone
  DOM.dropzoneZip.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.dropzoneZip.classList.add('drag-over');
  });

  DOM.dropzoneZip.addEventListener('dragleave', () => {
    DOM.dropzoneZip.classList.remove('drag-over');
  });

  DOM.dropzoneZip.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.dropzoneZip.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip')) {
        handleZipFile(file);
      } else {
        showToast('Please upload an Instagram export .zip file', 'warning');
      }
    }
  });

  DOM.fileZip.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleZipFile(e.target.files[0]);
    }
  });

  // 2. Individual JSON Dropzones (Secondary)
  [
    { zone: DOM.dropzoneFollowing, input: DOM.fileFollowing, type: 'following' },
    { zone: DOM.dropzoneFollowers, input: DOM.fileFollowers, type: 'followers' }
  ].forEach(({ zone, input, type }) => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        handleFileRead(e.dataTransfer.files[0], type);
      }
    });

    input.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileRead(e.target.files[0], type);
      }
    });
  });
}

/* ==========================================================================
   Process & Create Session
   ========================================================================== */

async function processLoadedFiles() {
  try {
    DOM.btnProcessFiles.disabled = true;
    DOM.btnProcessFiles.textContent = 'Analyzing...';

    // Parse according to specifications
    const following = parseFollowing(state.followingFileContent);
    const followers = parseFollowers(state.followersFileContent);
    const comparison = compareAccounts(following, followers);

    // Create session in backend SQLite
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Origin': window.location.origin
      },
      body: JSON.stringify({
        totalFollowing: comparison.totalFollowing,
        totalFollowers: comparison.totalFollowers,
        items: comparison.nonFollowers,
        origin: window.location.origin
      })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to create session');
    }

    await applySession(data.session, data.qrCode);
    showToast(`Session created! Sync code: ${data.session.code}`, 'success');

    // Smooth scroll to metrics
    DOM.dashboardMain.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    console.error('Processing error:', err);
    showToast(`Error processing files: ${err.message}`, 'warning');
  } finally {
    DOM.btnProcessFiles.disabled = false;
    DOM.btnProcessFiles.textContent = 'Analyze Individual Files';
  }
}

/* ==========================================================================
   Demo Dataset Loader (Tests Full Zip Pipeline)
   ========================================================================== */

async function loadDemoData() {
  try {
    showToast('Loading demo Instagram export zip...', 'info');
    const res = await fetch('/api/sample-zip');
    if (!res.ok) throw new Error('Could not fetch sample zip');
    const blob = await res.blob();
    const demoZipFile = new File([blob], 'instagram-export-sample.zip', { type: 'application/zip' });
    await handleZipFile(demoZipFile);
  } catch (err) {
    console.error('Demo load error, falling back to JSON:', err);
    try {
      const res = await fetch('/api/sample-data');
      if (!res.ok) throw new Error('Could not fetch demo data');
      const data = await res.json();
      state.followingFileContent = JSON.stringify(data.following);
      state.followersFileContent = JSON.stringify(data.followers);
      checkFilesReady();
      await processLoadedFiles();
    } catch (fallbackErr) {
      showToast(`Demo load failed: ${fallbackErr.message}`, 'warning');
    }
  }
}

/* ==========================================================================
   Export & Reset
   ========================================================================== */

function exportData(format = 'csv') {
  if (state.nonFollowers.length === 0) {
    showToast('No accounts to export', 'warning');
    return;
  }

  let content = '';
  let mimeType = '';
  let fileName = `instaboard_non_followers_${Date.now()}`;

  if (format === 'csv') {
    mimeType = 'text/csv;charset=utf-8;';
    fileName += '.csv';
    content = 'Username,Instagram Profile URL,Status,Followed Date\n';
    state.nonFollowers.forEach(a => {
      const isComp = Boolean(state.completedMap[a.username.toLowerCase()]);
      const status = isComp ? 'Completed' : 'Pending';
      const dateStr = a.timestamp ? new Date(a.timestamp * 1000).toISOString() : 'Unknown';
      content += `"${a.username}","${a.href}","${status}","${dateStr}"\n`;
    });
  } else {
    mimeType = 'application/json;charset=utf-8;';
    fileName += '.json';
    const exportArr = state.nonFollowers.map(a => ({
      ...a,
      status: state.completedMap[a.username.toLowerCase()] ? 'Completed' : 'Pending'
    }));
    content = JSON.stringify(exportArr, null, 2);
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${fileName}`, 'success');
}

async function resetAllProgress() {
  if (!confirm('Are you sure you want to reset all completed accounts for this session?')) {
    return;
  }

  if (state.activeSyncCode) {
    try {
      const res = await fetch(`/api/sessions/${state.activeSyncCode}/reset`, { method: 'POST' });
      const data = await res.json();
      if (data.session) {
        state.completedMap = {};
        state.actionsLastHour = 0;
        updateSummaryMetrics();
        renderFeed();
        showToast('All completed accounts have been reset', 'info');
      }
    } catch (err) {
      showToast('Reset failed: ' + err.message, 'warning');
    }
  } else {
    state.completedMap = {};
    state.actionsLastHour = 0;
    updateSummaryMetrics();
    renderFeed();
  }
}

/* ==========================================================================
   Event Listeners Setup
   ========================================================================== */

function setupEventListeners() {
  setupDropzones();

  DOM.btnProcessFiles.addEventListener('click', processLoadedFiles);
  DOM.btnDemoData.addEventListener('click', loadDemoData);
  DOM.btnLoadDemoTop.addEventListener('click', loadDemoData);

  // Search input
  DOM.searchFilter.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    DOM.btnClearSearch.classList.toggle('hidden', !e.target.value);
    renderFeed();
  });

  DOM.btnClearSearch.addEventListener('click', () => {
    DOM.searchFilter.value = '';
    state.searchQuery = '';
    DOM.btnClearSearch.classList.add('hidden');
    renderFeed();
  });

  // Keyboard shortcut '/' to search
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== DOM.searchFilter) {
      e.preventDefault();
      DOM.searchFilter.focus();
    }
  });

  // Filter tabs
  DOM.filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      DOM.filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeTab = tab.dataset.filter;
      renderFeed();
    });
  });

  // Sort dropdown
  DOM.sortSelect.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    renderFeed();
  });

  // Open Next button
  DOM.btnOpenNext.addEventListener('click', handleOpenNext);

  // Feed delegate click for unfollow & undo
  DOM.feedContainer.addEventListener('click', (e) => {
    const btnUnfollow = e.target.closest('.btn-unfollow');
    if (btnUnfollow) {
      const username = btnUnfollow.dataset.username;
      const href = btnUnfollow.dataset.href;
      handleUnfollowAction(username, href);
      return;
    }

    const btnUndo = e.target.closest('.btn-undo');
    if (btnUndo) {
      const username = btnUndo.dataset.username;
      handleUndoAction(username);
    }
  });

  // Export & Reset
  DOM.btnExportCsv.addEventListener('click', () => exportData('csv'));
  DOM.btnExportJson.addEventListener('click', () => exportData('json'));
  DOM.btnResetAll.addEventListener('click', resetAllProgress);

  // Modal handlers
  DOM.btnOpenPairModal.addEventListener('click', () => {
    DOM.pairModal.classList.remove('hidden');
  });

  DOM.btnClosePairModal.addEventListener('click', () => {
    DOM.pairModal.classList.add('hidden');
  });

  DOM.pairModal.addEventListener('click', (e) => {
    if (e.target === DOM.pairModal) {
      DOM.pairModal.classList.add('hidden');
    }
  });

  // Copy code & link
  DOM.btnCopyCode.addEventListener('click', () => {
    if (state.activeSyncCode) {
      navigator.clipboard.writeText(state.activeSyncCode);
      showToast(`Copied code: ${state.activeSyncCode}`, 'success');
    }
  });

  DOM.btnCopyLink.addEventListener('click', () => {
    if (DOM.inputSyncUrl.value) {
      navigator.clipboard.writeText(DOM.inputSyncUrl.value);
      showToast('Copied direct sync link!', 'success');
    }
  });

  // Join existing code
  DOM.btnJoinCode.addEventListener('click', async () => {
    const code = DOM.inputJoinCode.value.trim().toUpperCase();
    if (!code) {
      showToast('Please enter a sync code', 'warning');
      return;
    }
    const success = await loadSessionFromBackend(code);
    if (success) {
      DOM.pairModal.classList.add('hidden');
      DOM.inputJoinCode.value = '';
    }
  });
}

/* ==========================================================================
   Initialization
   ========================================================================== */

async function init() {
  setupEventListeners();

  // Check URL params for ?sync=SYNC-XXXX
  const urlParams = new URLSearchParams(window.location.search);
  const syncFromUrl = urlParams.get('sync');

  if (syncFromUrl) {
    const loaded = await loadSessionFromBackend(syncFromUrl);
    if (loaded) return;
  }

  // Check localStorage for last session
  const lastSync = localStorage.getItem('instaboard_last_sync_code');
  if (lastSync) {
    const loaded = await loadSessionFromBackend(lastSync);
    if (loaded) return;
  }

  // If no session exists, load demo data so user gets an instant WOW experience
  await loadDemoData();
}

document.addEventListener('DOMContentLoaded', init);
