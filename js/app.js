// ============================================
//   MEDNU ADMIN — MAIN APP LOGIC
//   Fetches real data from Firebase Firestore
// ============================================

// ---- AUTH GUARD ----
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    initDashboard();
  } else {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
});

// ---- LOGIN ----
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const pass  = document.getElementById('password').value;
  const err   = document.getElementById('login-error');
  err.style.display = 'none';
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (ex) {
    err.textContent = 'Invalid email or password.';
    err.style.display = 'block';
  }
});

// ---- LOGOUT ----
document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());

// ---- NAV ----
document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
  item.addEventListener('click', () => switchTab(item.dataset.tab, item.dataset.title));
});

function switchTab(tab, title) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById('page-title').textContent = title || tab;
  document.getElementById('page-sub').textContent = new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

// ---- TOAST ----
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ---- INIT DASHBOARD ----
async function initDashboard() {
  loadOverview();
  loadDoctors();
  loadPatients();
  loadRevenue();
  loadMedicines();
  loadTickets();
  loadReportsList();
  loadBanners();
  loadHospitals();
  loadAmbulances();
}

// ============================================
//   OVERVIEW
// ============================================
async function loadOverview() {
  try {
    // Doctors count
    const doctorsSnap = await db.collection('doctors').get();
    document.getElementById('stat-doctors').textContent = doctorsSnap.size.toLocaleString();

    // Patients count
    const patientsSnap = await db.collection('patients').get();
    document.getElementById('stat-patients').textContent = patientsSnap.size.toLocaleString();

    // Revenue — sum all payments this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const paymentsSnap = await db.collection('payments')
      .where('createdAt', '>=', startOfMonth)
      .get();
    let totalRevenue = 0;
    paymentsSnap.forEach(doc => { totalRevenue += doc.data().amount || 0; });
    document.getElementById('stat-revenue').textContent = formatCurrency(totalRevenue);

    // Open tickets
    const ticketsSnap = await db.collection('tickets').where('status', '==', 'open').get();
    document.getElementById('stat-tickets').textContent = ticketsSnap.size;

    // Pending doctors for quick list
    const pendingSnap = await db.collection('doctors').where('status', '==', 'pending').limit(5).get();
    renderPendingList(pendingSnap);

    // Revenue chart
    await buildRevenueChart();

    // Top medicines
    await loadTopMedicinesOverview();

    // Recent tickets
    await loadRecentTickets();

  } catch (err) {
    console.error('Overview load error:', err);
  }
}

function renderPendingList(snap) {
  const el = document.getElementById('pending-doctors-list');
  if (snap.empty) { el.innerHTML = '<div class="empty-state"><p>No pending approvals</p></div>'; return; }
  el.innerHTML = '';
  snap.forEach(doc => {
    const d = doc.data();
    const initials = getInitials(d.name || 'DR');
    const color = randomAvatarColor();
    el.innerHTML += `
    <div class="user-cell" style="padding:10px 0; border-bottom:1px solid var(--border);">
      <div class="doc-avatar" style="background:${color.bg};color:${color.fg};">${initials}</div>
      <div style="flex:1;">
        <div class="user-name">${d.name || 'Unknown'}</div>
        <div class="user-sub">${d.specialisation || 'General'}</div>
      </div>
      <span class="pill pill-pending">Pending</span>
      <button class="btn btn-approve" style="margin-left:8px;" onclick="approveDoctor('${doc.id}', this)">Approve</button>
    </div>`;
  });
}

// ============================================
//   DOCTORS
// ============================================
let allDoctors = [];

async function loadDoctors() {
  const snap = await db.collection('doctors').orderBy('createdAt', 'desc').get();
  allDoctors = [];
  snap.forEach(doc => allDoctors.push({ id: doc.id, ...doc.data() }));
  renderDoctorsTable(allDoctors);
}

function renderDoctorsTable(doctors) {
  const tbody = document.getElementById('doctors-tbody');
  if (!doctors.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">No doctors found</td></tr>';
    return;
  }
  tbody.innerHTML = doctors.map(d => {
    const initials = getInitials(d.name || 'DR');
    const color = randomAvatarColor(d.name);
    return `<tr>
      <td><div class="user-cell">
        <div class="doc-avatar" style="background:${color.bg};color:${color.fg};">${initials}</div>
        <div><div class="user-name">${d.name || '—'}</div><div class="user-sub">${d.email || ''}</div></div>
      </div></td>
      <td>${d.specialisation || '—'}</td>
      <td>${d.phone || '—'}</td>
      <td>${d.consultations || 0}</td>
      <td>⭐ ${d.rating ? d.rating.toFixed(1) : '—'}</td>
      <td><span class="pill pill-${(d.status||'pending').toLowerCase()}">${capitalize(d.status||'Pending')}</span></td>
      <td>
        ${d.status === 'pending' ? `
          <button class="btn btn-approve" onclick="approveDoctor('${d.id}', this)">Approve</button>
          <button class="btn btn-reject" style="margin-left:4px;" onclick="rejectDoctor('${d.id}', this)">Reject</button>
        ` : `<button class="btn btn-outline" onclick="viewDoctor('${d.id}')">View</button>`}
      </td>
    </tr>`;
  }).join('');
}

async function approveDoctor(id, btn) {
  btn.disabled = true; btn.textContent = '...';
  await db.collection('doctors').doc(id).update({ status: 'active' });
  showToast('Doctor approved successfully!');
  loadDoctors(); loadOverview();
}

async function rejectDoctor(id, btn) {
  btn.disabled = true; btn.textContent = '...';
  await db.collection('doctors').doc(id).update({ status: 'suspended' });
  showToast('Doctor rejected.');
  loadDoctors();
}

function viewDoctor(id) {
  showToast('Doctor profile view — coming soon!');
}

// Doctors search & filter
document.getElementById('doctor-search')?.addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  const filtered = allDoctors.filter(d =>
    (d.name||'').toLowerCase().includes(q) ||
    (d.specialisation||'').toLowerCase().includes(q) ||
    (d.email||'').toLowerCase().includes(q)
  );
  renderDoctorsTable(filtered);
});

document.getElementById('doctor-status-filter')?.addEventListener('change', e => {
  const val = e.target.value;
  const filtered = val === 'all' ? allDoctors : allDoctors.filter(d => d.status === val);
  renderDoctorsTable(filtered);
});

// ============================================
//   PATIENTS
// ============================================
let allPatients = [];

async function loadPatients() {
  const snap = await db.collection('patients').orderBy('createdAt', 'desc').get();
  allPatients = [];
  snap.forEach(doc => allPatients.push({ id: doc.id, ...doc.data() }));
  renderPatientsTable(allPatients);
  buildPatientChart(allPatients);
}

function renderPatientsTable(patients) {
  const tbody = document.getElementById('patients-tbody');
  if (!patients.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">No patients found</td></tr>';
    return;
  }
  tbody.innerHTML = patients.map(p => {
    const initials = getInitials(p.name || 'PT');
    const color = randomAvatarColor(p.name);
    return `<tr>
      <td><div class="user-cell">
        <div class="doc-avatar" style="background:${color.bg};color:${color.fg};">${initials}</div>
        <div><div class="user-name">${p.name || '—'}</div><div class="user-sub">${p.email || ''}</div></div>
      </div></td>
      <td>${p.phone || '—'}</td>
      <td>${p.age || '—'}</td>
      <td>${p.condition || '—'}</td>
      <td>${p.totalConsultations || 0}</td>
      <td>${formatDate(p.createdAt)}</td>
    </tr>`;
  }).join('');
}

document.getElementById('patient-search')?.addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  const filtered = allPatients.filter(p =>
    (p.name||'').toLowerCase().includes(q) ||
    (p.phone||'').toLowerCase().includes(q)
  );
  renderPatientsTable(filtered);
});

// ============================================
//   REVENUE
// ============================================
async function loadRevenue() {
  const snap = await db.collection('payments').orderBy('createdAt', 'desc').get();
  const payments = [];
  snap.forEach(doc => payments.push({ id: doc.id, ...doc.data() }));
  renderPaymentsTable(payments);
  buildRevenueDetailChart(payments);
}

function renderPaymentsTable(payments) {
  const tbody = document.getElementById('payments-tbody');
  if (!payments.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">No payments found</td></tr>';
    return;
  }
  tbody.innerHTML = payments.slice(0, 50).map(p => `<tr>
    <td>${p.paymentId || p.id}</td>
    <td>${p.patientName || '—'}</td>
    <td>${p.doctorName || '—'}</td>
    <td>${formatCurrency(p.amount || 0)}</td>
    <td><span class="pill ${p.status === 'success' ? 'pill-active' : 'pill-pending'}">${capitalize(p.status||'pending')}</span></td>
    <td>${formatDate(p.createdAt)}</td>
  </tr>`).join('');
}

// ============================================
//   MEDICINES
// ============================================
async function loadMedicines() {
  const snap = await db.collection('prescriptions').get();
  const medicineCount = {};
  snap.forEach(doc => {
    const meds = doc.data().medicines || [];
    meds.forEach(m => {
      const name = m.name || m;
      medicineCount[name] = (medicineCount[name] || 0) + 1;
    });
  });
  const sorted = Object.entries(medicineCount).sort((a,b) => b[1]-a[1]).slice(0, 15);
  renderMedicinesTable(sorted);
  buildMedicinesChart(sorted.slice(0,8));
}

async function loadTopMedicinesOverview() {
  const snap = await db.collection('prescriptions').get();
  const medicineCount = {};
  snap.forEach(doc => {
    const meds = doc.data().medicines || [];
    meds.forEach(m => {
      const name = m.name || m;
      medicineCount[name] = (medicineCount[name] || 0) + 1;
    });
  });
  const sorted = Object.entries(medicineCount).sort((a,b) => b[1]-a[1]).slice(0, 5);
  const colors = ['#1a73e8','#1e8e3e','#f29900','#d93025','#7b61ff'];
  const el = document.getElementById('top-medicines-list');
  if (!sorted.length) { el.innerHTML = '<div class="empty-state"><p>No prescription data</p></div>'; return; }
  const max = sorted[0][1];
  el.innerHTML = sorted.map(([name, count], i) => `
    <div class="mini-bar-row">
      <span class="mini-bar-label">${name}</span>
      <div class="mini-bar-wrap"><div class="mini-bar-fill" style="width:${Math.round(count/max*100)}%;background:${colors[i]};"></div></div>
      <span class="mini-bar-count">${count.toLocaleString()}</span>
    </div>`).join('');
}

function renderMedicinesTable(sorted) {
  const tbody = document.getElementById('medicines-tbody');
  if (!sorted.length) { tbody.innerHTML = '<tr><td colspan="3" class="loading">No prescription data</td></tr>'; return; }
  const max = sorted[0][1];
  tbody.innerHTML = sorted.map(([name, count], i) => `<tr>
    <td>${i+1}</td>
    <td>${name}</td>
    <td>
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;height:6px;background:var(--border);border-radius:99px;overflow:hidden;">
          <div style="width:${Math.round(count/max*100)}%;height:100%;background:#1a73e8;border-radius:99px;"></div>
        </div>
        <span style="font-size:12px;color:var(--text-muted);min-width:36px;">${count.toLocaleString()}</span>
      </div>
    </td>
  </tr>`).join('');
}

// ============================================
//   SUPPORT TICKETS
// ============================================
let allTickets = [];

async function loadTickets() {
  const snap = await db.collection('tickets').orderBy('createdAt', 'desc').get();
  allTickets = [];
  snap.forEach(doc => allTickets.push({ id: doc.id, ...doc.data() }));
  renderTicketsTable(allTickets);
  document.getElementById('stat-tickets').textContent = allTickets.filter(t => t.status === 'open').length;
}

async function loadRecentTickets() {
  const snap = await db.collection('tickets').where('status','==','open').orderBy('createdAt','desc').limit(4).get();
  const el = document.getElementById('recent-tickets');
  if (snap.empty) { el.innerHTML = '<div class="empty-state"><p>No open tickets</p></div>'; return; }
  el.innerHTML = '';
  snap.forEach(doc => {
    const t = doc.data();
    const prioClass = t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warning' : 'info';
    el.innerHTML += `
    <div class="ticket-item">
      <div class="ticket-ico" style="background:var(--${prioClass}-light); color:var(--${prioClass});">⚠</div>
      <div class="ticket-body">
        <div class="ticket-title">${t.title || t.message || 'Support request'}</div>
        <div class="ticket-meta">${t.userName || 'User'} · ${t.priority||'medium'} priority · ${formatDate(t.createdAt)}</div>
      </div>
    </div>`;
  });
}

function renderTicketsTable(tickets) {
  const tbody = document.getElementById('tickets-tbody');
  if (!tickets.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading">No tickets found</td></tr>'; return; }
  tbody.innerHTML = tickets.map(t => {
    const prioClass = t.priority === 'high' ? 'suspended' : t.priority === 'medium' ? 'pending' : 'review';
    const statusClass = t.status === 'open' ? 'pending' : 'active';
    return `<tr>
      <td>${t.id.slice(0,8)}...</td>
      <td>${t.title || t.message || '—'}</td>
      <td>${t.userName || '—'}</td>
      <td><span class="pill pill-${prioClass}">${capitalize(t.priority||'low')}</span></td>
      <td><span class="pill pill-${statusClass}">${capitalize(t.status||'open')}</span></td>
      <td>${formatDate(t.createdAt)}</td>
      <td>${t.status === 'open' ? `<button class="btn btn-approve" onclick="resolveTicket('${t.id}', this)">Resolve</button>` : '—'}</td>
    </tr>`;
  }).join('');
}

async function resolveTicket(id, btn) {
  btn.disabled = true; btn.textContent = '...';
  await db.collection('tickets').doc(id).update({ status: 'resolved', resolvedAt: firebase.firestore.FieldValue.serverTimestamp() });
  showToast('Ticket resolved!');
  loadTickets();
}

document.getElementById('ticket-filter')?.addEventListener('change', e => {
  const val = e.target.value;
  const filtered = val === 'all' ? allTickets : allTickets.filter(t => t.status === val || t.priority === val);
  renderTicketsTable(filtered);
});

// ============================================
//   REPORTS
// ============================================
function loadReportsList() {
  // Reports are stored in Firebase storage or as metadata in Firestore
  // This shows generated report metadata
  db.collection('reports').orderBy('createdAt', 'desc').limit(10).get().then(snap => {
    const el = document.getElementById('reports-list');
    if (snap.empty) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No reports generated yet</p></div>'; return; }
    el.innerHTML = snap.docs.map(doc => {
      const r = doc.data();
      return `<div class="user-cell" style="padding:12px 0;border-bottom:1px solid var(--border);">
        <div style="font-size:24px;">📄</div>
        <div style="flex:1;">
          <div class="user-name">${r.title || 'Report'}</div>
          <div class="user-sub">${r.type || ''} · ${formatDate(r.createdAt)}</div>
        </div>
        ${r.downloadUrl ? `<a href="${r.downloadUrl}" target="_blank" class="btn btn-outline">Download</a>` : ''}
      </div>`;
    }).join('');
  }).catch(() => {});
}

document.getElementById('generate-report-btn')?.addEventListener('click', async () => {
  const type  = document.getElementById('report-type').value;
  const range = document.getElementById('report-range').value;
  showToast(`Generating ${type} report for ${range}...`);
  // Save report request to Firestore — your backend/Cloud Function can process it
  await db.collection('reports').add({
    title: `${type} — ${range}`,
    type, range,
    status: 'generating',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: auth.currentUser?.email
  });
  showToast('Report queued! Check back soon.');
  loadReportsList();
});

// ============================================
//   CHARTS (Chart.js)
// ============================================
async function buildRevenueChart() {
  const months = getLast6Months();
  const data = await Promise.all(months.map(async m => {
    const start = new Date(m.year, m.month, 1);
    const end   = new Date(m.year, m.month + 1, 1);
    const snap  = await db.collection('payments').where('createdAt', '>=', start).where('createdAt', '<', end).get();
    let total = 0;
    snap.forEach(d => { total += d.data().amount || 0; });
    return total;
  }));

  const ctx = document.getElementById('revenue-chart');
  if (!ctx) return;
  if (window._revChart) window._revChart.destroy();
  window._revChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [{ label: 'Revenue (₹)', data, backgroundColor: '#1a73e8', borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { ticks: { callback: v => '₹' + formatShort(v), font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } }
      }
    }
  });
}

function buildPatientChart(patients) {
  const monthly = {};
  patients.forEach(p => {
    if (!p.createdAt) return;
    const d = p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt);
    const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
    monthly[key] = (monthly[key] || 0) + 1;
  });
  const labels = Object.keys(monthly).slice(-6);
  const data   = labels.map(l => monthly[l]);
  const ctx = document.getElementById('patient-chart');
  if (!ctx) return;
  if (window._patChart) window._patChart.destroy();
  window._patChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'New Patients', data, borderColor: '#1e8e3e', backgroundColor: 'rgba(30,142,62,0.1)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#1e8e3e' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(0,0,0,0.05)' } } }
    }
  });
}

function buildRevenueDetailChart(payments) {
  const months = getLast6Months();
  const consultData = [], subscData = [], commData = [];
  months.forEach(m => {
    const mPayments = payments.filter(p => {
      const d = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0);
      return d.getMonth() === m.month && d.getFullYear() === m.year;
    });
    consultData.push(mPayments.filter(p => p.type === 'consultation').reduce((s,p) => s + (p.amount||0), 0));
    subscData.push(mPayments.filter(p => p.type === 'subscription').reduce((s,p) => s + (p.amount||0), 0));
    commData.push(mPayments.filter(p => p.type === 'commission').reduce((s,p) => s + (p.amount||0), 0));
  });
  const ctx = document.getElementById('revenue-detail-chart');
  if (!ctx) return;
  if (window._revDetailChart) window._revDetailChart.destroy();
  window._revDetailChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { label: 'Consultations', data: consultData, backgroundColor: '#1a73e8', borderRadius: 4 },
        { label: 'Subscriptions', data: subscData,   backgroundColor: '#1e8e3e', borderRadius: 4 },
        { label: 'Commission',    data: commData,     backgroundColor: '#f29900', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 10 } } },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, ticks: { callback: v => '₹' + formatShort(v) }, grid: { color: 'rgba(0,0,0,0.05)' } }
      }
    }
  });
}

function buildMedicinesChart(sorted) {
  const ctx = document.getElementById('medicines-chart');
  if (!ctx) return;
  if (window._medChart) window._medChart.destroy();
  window._medChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(([name]) => name),
      datasets: [{ label: 'Prescriptions', data: sorted.map(([,c]) => c), backgroundColor: '#7b61ff', borderRadius: 6 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(0,0,0,0.05)' } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

// ============================================
//   BANNERS
// ============================================
let allBanners = [];
let _editingBannerId = null;

async function loadBanners() {
  try {
    const snap = await db.collection('banners').orderBy('createdAt', 'desc').get();
    allBanners = [];
    snap.forEach(doc => allBanners.push({ id: doc.id, ...doc.data() }));
    renderBannersList(allBanners);
    // Update nav badge with active count
    const activeCount = allBanners.filter(b => isBannerActive(b)).length;
    const badge = document.getElementById('nav-banner-count');
    if (activeCount > 0) {
      badge.textContent = activeCount;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  } catch (err) {
    console.error('Banner load error:', err);
  }
}

document.getElementById('banner-filter')?.addEventListener('change', e => {
  const val = e.target.value;
  const now = new Date();
  let filtered = allBanners;
  if (val === 'active')    filtered = allBanners.filter(b => isBannerActive(b, now));
  else if (val === 'disabled')   filtered = allBanners.filter(b => !b.isEnabled);
  else if (val === 'scheduled')  filtered = allBanners.filter(b => b.isEnabled && b.startDate && b.startDate.toDate() > now);
  else if (val === 'expired')    filtered = allBanners.filter(b => b.endDate && b.endDate.toDate() < now);
  renderBannersList(filtered);
});

function isBannerActive(b, now = new Date()) {
  if (!b.isEnabled) return false;
  if (b.startDate && b.startDate.toDate() > now) return false;
  if (b.endDate   && b.endDate.toDate()   < now) return false;
  return true;
}

function getBannerStatusBadge(b) {
  const now = new Date();
  if (!b.isEnabled) return '<span class="pill pill-suspended">Disabled</span>';
  if (b.startDate && b.startDate.toDate() > now) return '<span class="pill pill-scheduled">Scheduled</span>';
  if (b.endDate   && b.endDate.toDate()   < now) return '<span class="pill pill-expired">Expired</span>';
  return '<span class="pill pill-active">Active</span>';
}

function renderBannersList(banners) {
  const el = document.getElementById('banners-list');
  if (!banners.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🖼️</div><p>No banners yet — create one above.</p></div>';
    return;
  }
  el.innerHTML = banners.map(b => {
    const title = b.title ? escapeHtml(b.title) : '<em style="color:var(--text-muted)">Untitled Banner</em>';
    const startStr = b.startDate ? formatDate(b.startDate) : null;
    const endStr   = b.endDate   ? formatDate(b.endDate)   : null;
    const dateRange = (startStr || endStr)
      ? `${startStr || 'Anytime'} → ${endStr || 'No end date'}`
      : 'No date restriction';
    const ctaChip = b.ctaText
      ? `<span class="banner-cta-chip">CTA: ${escapeHtml(b.ctaText)}</span>`
      : '';
    const thumb = b.imageUrl
      ? `<img class="banner-thumb" src="${escapeHtml(b.imageUrl)}" alt="${escapeHtml(b.title || 'Banner')}" loading="lazy" />`
      : '<div class="banner-thumb-placeholder"><i class="ti ti-photo"></i></div>';
    return `
    <div class="banner-card" id="banner-card-${b.id}">
      ${thumb}
      <div class="banner-info">
        <div class="banner-name">${title}</div>
        <div class="banner-meta">${dateRange}</div>
        ${ctaChip}
        <div style="margin-top:6px;">${getBannerStatusBadge(b)}</div>
      </div>
      <div class="banner-actions">
        <label class="toggle-label" title="${b.isEnabled ? 'Click to disable' : 'Click to enable'}">
          <input type="checkbox" ${b.isEnabled ? 'checked' : ''} onchange="toggleBanner('${b.id}', this.checked)" />
          <span class="toggle-switch"></span>
        </label>
        <button class="btn btn-outline" onclick="editBanner('${b.id}')" title="Edit banner">
          <i class="ti ti-edit"></i>
        </button>
        <button class="btn btn-reject" onclick="deleteBanner('${b.id}', '${escapeHtml(b.storagePath||'')}', this)" title="Delete banner">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    </div>`;
  }).join('');
}

async function toggleBanner(id, enabled) {
  try {
    await db.collection('banners').doc(id).update({
      isEnabled: enabled,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    const banner = allBanners.find(b => b.id === id);
    if (banner) banner.isEnabled = enabled;
    showToast(enabled ? 'Banner enabled ✓' : 'Banner disabled');
    renderBannersList(allBanners);
    loadBanners(); // refresh badge
  } catch (err) {
    showToast('Update failed: ' + err.message);
  }
}

async function deleteBanner(id, storagePath, btn) {
  if (!confirm('Delete this banner? This cannot be undone.')) return;
  btn.disabled = true;
  try {
    await db.collection('banners').doc(id).delete();
    if (storagePath) {
      try { await storage.ref(storagePath).delete(); } catch (_) {} // non-fatal
    }
    showToast('Banner deleted');
    allBanners = allBanners.filter(b => b.id !== id);
    renderBannersList(allBanners);
    loadBanners();
  } catch (err) {
    btn.disabled = false;
    showToast('Delete failed: ' + err.message);
  }
}

function editBanner(id) {
  const banner = allBanners.find(b => b.id === id);
  if (!banner) return;
  _editingBannerId = id;

  document.getElementById('banner-title').value    = banner.title       || '';
  document.getElementById('banner-desc').value     = banner.description || '';
  document.getElementById('banner-cta-text').value = banner.ctaText     || '';
  document.getElementById('banner-cta-url').value  = banner.ctaUrl      || '';
  document.getElementById('banner-enabled').checked = banner.isEnabled;

  if (banner.startDate) {
    const d = banner.startDate.toDate();
    document.getElementById('banner-start-date').value = toLocalDatetimeString(d);
  }
  if (banner.endDate) {
    const d = banner.endDate.toDate();
    document.getElementById('banner-end-date').value = toLocalDatetimeString(d);
  }
  if (banner.imageUrl) {
    const img = document.getElementById('banner-preview-img');
    img.src = banner.imageUrl;
    img.style.display = 'block';
    document.getElementById('banner-upload-placeholder').style.display = 'none';
  }

  document.getElementById('banner-form-title').textContent = 'Edit Banner';
  document.getElementById('publish-banner-btn').innerHTML  = '<i class="ti ti-device-floppy"></i> Save Changes';
  document.getElementById('cancel-banner-btn').style.display = 'inline-flex';

  // Scroll to top of form
  document.getElementById('tab-banners').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelBannerEdit() {
  _editingBannerId = null;
  resetBannerForm();
}

function resetBannerForm() {
  _editingBannerId = null;
  document.getElementById('banner-title').value      = '';
  document.getElementById('banner-desc').value       = '';
  document.getElementById('banner-cta-text').value   = '';
  document.getElementById('banner-cta-url').value    = '';
  document.getElementById('banner-start-date').value = '';
  document.getElementById('banner-end-date').value   = '';
  document.getElementById('banner-enabled').checked  = true;
  document.getElementById('banner-file-input').value = '';
  document.getElementById('banner-preview-img').style.display      = 'none';
  document.getElementById('banner-upload-placeholder').style.display = 'block';
  document.getElementById('banner-form-title').textContent  = 'Create New Banner';
  document.getElementById('publish-banner-btn').innerHTML   = '<i class="ti ti-upload"></i> Publish Banner';
  document.getElementById('cancel-banner-btn').style.display = 'none';
}

function previewBannerImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image too large — max 5 MB');
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('banner-preview-img');
    img.src = e.target.result;
    img.style.display = 'block';
    document.getElementById('banner-upload-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function publishBanner() {
  const title      = document.getElementById('banner-title').value.trim();
  const desc       = document.getElementById('banner-desc').value.trim();
  const ctaText    = document.getElementById('banner-cta-text').value.trim();
  const ctaUrl     = document.getElementById('banner-cta-url').value.trim();
  const isEnabled  = document.getElementById('banner-enabled').checked;
  const startVal   = document.getElementById('banner-start-date').value;
  const endVal     = document.getElementById('banner-end-date').value;
  const fileInput  = document.getElementById('banner-file-input');
  const file       = fileInput.files[0];

  const publishBtn  = document.getElementById('publish-banner-btn');
  const progressEl  = document.getElementById('banner-upload-progress');

  if (!_editingBannerId && !file) {
    showToast('Please select a banner image');
    document.getElementById('banner-upload-zone').focus();
    return;
  }
  if (startVal && endVal && new Date(startVal) >= new Date(endVal)) {
    showToast('End date must be after start date');
    return;
  }

  publishBtn.disabled = true;

  let imageUrl    = '';
  let storagePath = '';

  if (_editingBannerId && !file) {
    const existing = allBanners.find(b => b.id === _editingBannerId);
    imageUrl    = existing?.imageUrl    || '';
    storagePath = existing?.storagePath || '';
  }

  if (file) {
    progressEl.style.display = 'flex';
    publishBtn.style.display = 'none';
    const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    storagePath     = `banners/${Date.now()}_${safeName}`;
    const fileRef   = storage.ref(storagePath);
    const task      = fileRef.put(file, { contentType: file.type });

    try {
      await new Promise((resolve, reject) => task.on('state_changed', null, reject, resolve));
      imageUrl = await fileRef.getDownloadURL();
    } catch (err) {
      showToast('Upload failed: ' + err.message);
      progressEl.style.display = 'none';
      publishBtn.style.display = 'inline-flex';
      publishBtn.disabled = false;
      return;
    }
    progressEl.style.display = 'none';
    publishBtn.style.display = 'inline-flex';
  }

  const data = {
    title:       title || null,
    description: desc  || null,
    imageUrl,
    storagePath,
    ctaText:  ctaText || null,
    ctaUrl:   ctaUrl  || null,
    isEnabled,
    startDate: startVal ? firebase.firestore.Timestamp.fromDate(new Date(startVal)) : null,
    endDate:   endVal   ? firebase.firestore.Timestamp.fromDate(new Date(endVal))   : null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: auth.currentUser?.email || 'admin',
  };

  try {
    if (_editingBannerId) {
      await db.collection('banners').doc(_editingBannerId).update(data);
      showToast('Banner updated ✓');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('banners').add(data);
      showToast('Banner published ✓');
    }
    resetBannerForm();
    loadBanners();
  } catch (err) {
    showToast('Save failed: ' + err.message);
  } finally {
    publishBtn.disabled = false;
  }
}

// Drag-and-drop support on upload zone
(function setupBannerDragDrop() {
  document.addEventListener('DOMContentLoaded', () => {
    const zone = document.getElementById('banner-upload-zone');
    if (!zone) return;
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        const dt = new DataTransfer();
        dt.items.add(file);
        document.getElementById('banner-file-input').files = dt.files;
        previewBannerImage({ target: { files: dt.files, value: '' } });
      } else {
        showToast('Please drop an image file');
      }
    });
    zone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        document.getElementById('banner-file-input').click();
      }
    });
  });
})();

// ============================================
//   UTILITIES
// ============================================
function getInitials(name) {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0,2).toUpperCase();
}

const avatarColors = [
  { bg: '#e8f0fe', fg: '#1557b0' }, { bg: '#e6f4ea', fg: '#137333' },
  { bg: '#fef7e0', fg: '#b06000' }, { bg: '#fce8e6', fg: '#a50e0e' },
  { bg: '#f3e8fd', fg: '#6200ea' }, { bg: '#e0f7fa', fg: '#006064' }
];
function randomAvatarColor(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % avatarColors.length;
  return avatarColors[Math.abs(h) % avatarColors.length];
}

function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }

function formatCurrency(amount) {
  if (amount >= 10000000) return '₹' + (amount / 10000000).toFixed(1) + 'Cr';
  if (amount >= 100000) return '₹' + (amount / 100000).toFixed(1) + 'L';
  if (amount >= 1000) return '₹' + (amount / 1000).toFixed(1) + 'K';
  return '₹' + Math.round(amount);
}

function formatShort(v) {
  if (v >= 100000) return (v/100000).toFixed(0) + 'L';
  if (v >= 1000)   return (v/1000).toFixed(0) + 'K';
  return v;
}

function formatDate(val) {
  if (!val) return '—';
  const d = val.toDate ? val.toDate() : new Date(val);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getLast6Months() {
  const result = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleString('default', { month: 'short' }) });
  }
  return result;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toLocalDatetimeString(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ============================================
//   HOSPITALS
// ============================================
let allHospitals = [];
let _editingHospitalId = null;
let _hospitalsListener = null;

function loadHospitals() {
  if (_hospitalsListener) _hospitalsListener();
  _hospitalsListener = db.collection('hospitals')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      allHospitals = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      filterHospitals();
      const enabledCount = allHospitals.filter(h => h.isEnabled).length;
      const badge = document.getElementById('nav-hospital-count');
      if (badge) {
        if (enabledCount > 0) { badge.textContent = enabledCount; badge.style.display = 'inline'; }
        else badge.style.display = 'none';
      }
    }, err => console.error('Hospitals load error:', err));
}

function filterHospitals() {
  const q      = (document.getElementById('hospital-search')?.value || '').toLowerCase();
  const filter = document.getElementById('hospital-type-filter')?.value || 'all';
  let filtered = allHospitals;
  if (q) filtered = filtered.filter(h =>
    (h.name || '').toLowerCase().includes(q) ||
    (h.address || '').toLowerCase().includes(q)
  );
  if (filter === 'emergency') filtered = filtered.filter(h => h.isEmergency);
  else if (filter === 'enabled')   filtered = filtered.filter(h => h.isEnabled);
  else if (filter === 'disabled')  filtered = filtered.filter(h => !h.isEnabled);
  renderHospitalsList(filtered);
}

function renderHospitalsList(hospitals) {
  const el = document.getElementById('hospitals-list');
  if (!el) return;
  if (!hospitals.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏥</div><p>No hospitals added yet</p></div>';
    return;
  }
  el.innerHTML = hospitals.map(h => `
    <div class="banner-card" id="hospital-card-${h.id}">
      <div class="banner-thumb-placeholder" style="background:#e8f0fe;color:#1a73e8;font-size:26px;">
        <i class="ti ti-building-hospital"></i>
      </div>
      <div class="banner-info">
        <div class="banner-name">${escapeHtml(h.name || '—')}</div>
        <div class="banner-meta">${escapeHtml(h.address || '—')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
          ${h.phone ? `<span class="banner-cta-chip"><i class="ti ti-phone" style="font-size:11px;"></i> ${escapeHtml(h.phone)}</span>` : ''}
          ${h.isEmergency ? '<span class="pill pill-suspended">🚨 Emergency</span>' : ''}
          ${h.isEnabled ? '<span class="pill pill-active">Enabled</span>' : '<span class="pill pill-suspended">Disabled</span>'}
        </div>
      </div>
      <div class="banner-actions">
        <label class="toggle-label" title="${h.isEnabled ? 'Click to disable' : 'Click to enable'}">
          <input type="checkbox" ${h.isEnabled ? 'checked' : ''} onchange="toggleHospital('${h.id}', this.checked)" />
          <span class="toggle-switch"></span>
        </label>
        <button class="btn btn-outline" onclick="editHospital('${h.id}')" title="Edit">
          <i class="ti ti-edit"></i>
        </button>
        <button class="btn btn-reject" onclick="deleteHospital('${h.id}', this)" title="Delete">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    </div>`).join('');
}

async function saveHospital() {
  const name      = document.getElementById('hosp-name')?.value.trim();
  const address   = document.getElementById('hosp-address')?.value.trim();
  const phone     = document.getElementById('hosp-phone')?.value.trim();
  const mapsUrl   = document.getElementById('hosp-maps')?.value.trim();
  const isEmergency = document.getElementById('hosp-emergency')?.checked || false;
  const isEnabled   = document.getElementById('hosp-enabled')?.checked !== false;

  if (!name || !address) {
    showToast('Hospital name and address are required');
    return;
  }

  const btn = document.getElementById('save-hospital-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const data = {
    name, address,
    phone:     phone   || '',
    mapsUrl:   mapsUrl || '',
    isEmergency,
    isEnabled,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    if (_editingHospitalId) {
      await db.collection('hospitals').doc(_editingHospitalId).update(data);
      showToast('Hospital updated ✓');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('hospitals').add(data);
      showToast('Hospital added ✓');
    }
    cancelHospitalEdit();
  } catch (err) {
    showToast('Save failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save Hospital';
  }
}

function editHospital(id) {
  const h = allHospitals.find(x => x.id === id);
  if (!h) return;
  _editingHospitalId = id;
  document.getElementById('hosp-name').value    = h.name    || '';
  document.getElementById('hosp-address').value = h.address || '';
  document.getElementById('hosp-phone').value   = h.phone   || '';
  document.getElementById('hosp-maps').value    = h.mapsUrl || '';
  document.getElementById('hosp-emergency').checked = h.isEmergency || false;
  document.getElementById('hosp-enabled').checked   = h.isEnabled !== false;
  document.getElementById('hospital-form-title').textContent   = 'Edit Hospital';
  document.getElementById('save-hospital-btn').innerHTML = '<i class="ti ti-device-floppy"></i> Save Changes';
  document.getElementById('cancel-hospital-btn').style.display = 'inline-flex';
  document.getElementById('tab-hospitals').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelHospitalEdit() {
  _editingHospitalId = null;
  ['hosp-name','hosp-address','hosp-phone','hosp-maps'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const emEl = document.getElementById('hosp-emergency');
  if (emEl) emEl.checked = false;
  const enEl = document.getElementById('hosp-enabled');
  if (enEl) enEl.checked = true;
  document.getElementById('hospital-form-title').textContent   = 'Add Hospital';
  document.getElementById('save-hospital-btn').innerHTML = '<i class="ti ti-device-floppy"></i> Save Hospital';
  document.getElementById('cancel-hospital-btn').style.display = 'none';
}

async function toggleHospital(id, enabled) {
  try {
    await db.collection('hospitals').doc(id).update({
      isEnabled: enabled,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast(enabled ? 'Hospital enabled ✓' : 'Hospital disabled');
  } catch (err) {
    showToast('Update failed: ' + err.message);
  }
}

async function deleteHospital(id, btn) {
  if (!confirm('Delete this hospital? This cannot be undone.')) return;
  btn.disabled = true;
  try {
    await db.collection('hospitals').doc(id).delete();
    showToast('Hospital deleted');
  } catch (err) {
    btn.disabled = false;
    showToast('Delete failed: ' + err.message);
  }
}

// ============================================
//   AMBULANCES
// ============================================
let allAmbulances = [];
let _editingAmbulanceId = null;
let _ambulancesListener = null;

function loadAmbulances() {
  if (_ambulancesListener) _ambulancesListener();
  _ambulancesListener = db.collection('ambulances')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      allAmbulances = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      filterAmbulances();
      const enabledCount = allAmbulances.filter(a => a.isEnabled).length;
      const badge = document.getElementById('nav-ambulance-count');
      if (badge) {
        if (enabledCount > 0) { badge.textContent = enabledCount; badge.style.display = 'inline'; }
        else badge.style.display = 'none';
      }
    }, err => console.error('Ambulances load error:', err));
}

function filterAmbulances() {
  const filter = document.getElementById('ambulance-type-filter')?.value || 'all';
  const filtered = filter === 'all' ? allAmbulances : allAmbulances.filter(a => a.type === filter);
  renderAmbulancesList(filtered);
}

function renderAmbulancesList(ambulances) {
  const el = document.getElementById('ambulances-list');
  if (!el) return;
  if (!ambulances.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🚑</div><p>No ambulance services added yet</p></div>';
    return;
  }
  const typeColors = { Basic: '#d93025', ALS: '#e65100', ICU: '#4a148c' };
  el.innerHTML = ambulances.map(a => {
    const tc = typeColors[a.type] || '#d93025';
    return `
    <div class="banner-card" id="ambulance-card-${a.id}">
      <div class="banner-thumb-placeholder" style="background:${tc}18;color:${tc};font-size:26px;">
        <i class="ti ti-ambulance"></i>
      </div>
      <div class="banner-info">
        <div class="banner-name">${escapeHtml(a.name || '—')}</div>
        <div class="banner-meta">${escapeHtml(a.serviceArea || '—')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
          <span class="pill" style="background:${tc}18;color:${tc};border:1px solid ${tc}44;">${escapeHtml(a.type || 'Basic')}</span>
          ${a.phone ? `<span class="banner-cta-chip"><i class="ti ti-phone" style="font-size:11px;"></i> ${escapeHtml(a.phone)}</span>` : ''}
          ${a.isAvailable ? '<span class="pill pill-active">Available</span>' : '<span class="pill pill-pending">Busy</span>'}
          ${a.isEnabled ? '' : '<span class="pill pill-suspended">Disabled</span>'}
        </div>
      </div>
      <div class="banner-actions">
        <label class="toggle-label" title="${a.isEnabled ? 'Click to disable' : 'Click to enable'}">
          <input type="checkbox" ${a.isEnabled ? 'checked' : ''} onchange="toggleAmbulance('${a.id}', this.checked)" />
          <span class="toggle-switch"></span>
        </label>
        <button class="btn btn-outline" onclick="editAmbulance('${a.id}')" title="Edit">
          <i class="ti ti-edit"></i>
        </button>
        <button class="btn btn-reject" onclick="deleteAmbulance('${a.id}', this)" title="Delete">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    </div>`;
  }).join('');
}

async function saveAmbulance() {
  const name        = document.getElementById('amb-name')?.value.trim();
  const phone       = document.getElementById('amb-phone')?.value.trim();
  const type        = document.getElementById('amb-type')?.value || 'Basic';
  const serviceArea = document.getElementById('amb-area')?.value.trim();
  const isAvailable = document.getElementById('amb-available')?.checked !== false;
  const isEnabled   = document.getElementById('amb-enabled')?.checked !== false;

  if (!name || !phone) {
    showToast('Service name and phone are required');
    return;
  }

  const btn = document.getElementById('save-ambulance-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const data = {
    name, phone, type,
    serviceArea: serviceArea || '',
    isAvailable,
    isEnabled,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    if (_editingAmbulanceId) {
      await db.collection('ambulances').doc(_editingAmbulanceId).update(data);
      showToast('Ambulance service updated ✓');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('ambulances').add(data);
      showToast('Ambulance service added ✓');
    }
    cancelAmbulanceEdit();
  } catch (err) {
    showToast('Save failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save Ambulance';
  }
}

function editAmbulance(id) {
  const a = allAmbulances.find(x => x.id === id);
  if (!a) return;
  _editingAmbulanceId = id;
  document.getElementById('amb-name').value  = a.name        || '';
  document.getElementById('amb-phone').value = a.phone       || '';
  document.getElementById('amb-type').value  = a.type        || 'Basic';
  document.getElementById('amb-area').value  = a.serviceArea || '';
  document.getElementById('amb-available').checked = a.isAvailable !== false;
  document.getElementById('amb-enabled').checked   = a.isEnabled   !== false;
  document.getElementById('ambulance-form-title').textContent   = 'Edit Ambulance Service';
  document.getElementById('save-ambulance-btn').innerHTML = '<i class="ti ti-device-floppy"></i> Save Changes';
  document.getElementById('cancel-ambulance-btn').style.display = 'inline-flex';
  document.getElementById('tab-ambulances').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelAmbulanceEdit() {
  _editingAmbulanceId = null;
  ['amb-name','amb-phone','amb-area'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const typeEl = document.getElementById('amb-type');
  if (typeEl) typeEl.value = 'Basic';
  const avEl = document.getElementById('amb-available');
  if (avEl) avEl.checked = true;
  const enEl = document.getElementById('amb-enabled');
  if (enEl) enEl.checked = true;
  document.getElementById('ambulance-form-title').textContent   = 'Add Ambulance Service';
  document.getElementById('save-ambulance-btn').innerHTML = '<i class="ti ti-device-floppy"></i> Save Ambulance';
  document.getElementById('cancel-ambulance-btn').style.display = 'none';
}

async function toggleAmbulance(id, enabled) {
  try {
    await db.collection('ambulances').doc(id).update({
      isEnabled: enabled,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast(enabled ? 'Ambulance service enabled ✓' : 'Ambulance service disabled');
  } catch (err) {
    showToast('Update failed: ' + err.message);
  }
}

async function deleteAmbulance(id, btn) {
  if (!confirm('Delete this ambulance service? This cannot be undone.')) return;
  btn.disabled = true;
  try {
    await db.collection('ambulances').doc(id).delete();
    showToast('Ambulance service deleted');
  } catch (err) {
    btn.disabled = false;
    showToast('Delete failed: ' + err.message);
  }
}
