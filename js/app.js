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
  loadReferralSettings();
  loadReferralStats();
  loadReferrals();
  loadFeedbacks();
  initRequestsListener();
  initNotificationsListener();
}

// ============================================
//   OVERVIEW
// ============================================
async function loadOverview() {
  try {
    // Doctors count
    const doctorsSnap = await db.collection('doctors').get();
    document.getElementById('stat-doctors').textContent = doctorsSnap.size.toLocaleString();

    // Patients count — reads from 'users' (same collection Flutter writes to)
    const patientsSnap = await db.collection('users').get();
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

    // Pending doctors for quick list — fetch all and filter client-side
    // so doctors registered before the status field was introduced also appear
    const allDoctorsSnap = await db.collection('doctors').get();
    const pendingDocs = allDoctorsSnap.docs.filter(doc => {
      const s = doc.data().status;
      return !s || s === 'pending';
    }).slice(0, 5);
    renderPendingList(pendingDocs);

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

function renderPendingList(docs) {
  const el = document.getElementById('pending-doctors-list');
  if (!docs.length) { el.innerHTML = '<div class="empty-state"><p>No pending approvals</p></div>'; return; }
  el.innerHTML = '';
  docs.forEach(doc => {
    const d = doc.data();
    const initials = getInitials(d.name || 'DR');
    const color = randomAvatarColor();
    el.innerHTML += `
    <div class="user-cell" style="padding:10px 0; border-bottom:1px solid var(--border);">
      <div class="doc-avatar" style="background:${color.bg};color:${color.fg};">${initials}</div>
      <div style="flex:1;">
        <div class="user-name">${d.name || 'Unknown'}</div>
        <div class="user-sub">${d.specialty || d.specialisation || 'General'}</div>
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
        ${(!d.status || d.status === 'pending') ? `
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
  const d = allDoctors.find(x => x.id === id);
  if (!d) return;
  showDoctorModal(d);
}

function showDoctorModal(d) {
  // Remove existing modal if any
  document.getElementById('doctor-modal')?.remove();

  const docs = d.documents || {};
  const docKeys = {
    mbbs_degree:   'MBBS Degree Certificate',
    spec_cert:     'Specialization Certificate',
    mbbs_reg_cert: 'MBBS Registration Certificate',
    renewal_cert:  'Renewal Certificate',
    profile_photo: 'Profile Photo',
  };

  const docHtml = Object.entries(docKeys).map(([key, label]) => {
    const url = docs[key];
    return url
      ? `<div style="margin-bottom:10px;">
           <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">${label}</div>
           <a href="${url}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--primary-light,#f3e5f5);color:var(--primary,#880E4F);border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">
             <span>🔗</span> View Document
           </a>
         </div>`
      : `<div style="margin-bottom:10px;">
           <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">${label}</div>
           <span style="font-size:12px;color:#aaa;font-style:italic;">Not uploaded</span>
         </div>`;
  }).join('');

  const isPending = !d.status || d.status === 'pending';

  const modal = document.createElement('div');
  modal.id = 'doctor-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;width:100%;max-width:540px;max-height:90vh;overflow-y:auto;padding:28px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <h2 style="font-size:18px;font-weight:700;margin:0;">Doctor Profile</h2>
        <button onclick="document.getElementById('doctor-modal').remove()"
          style="border:none;background:none;font-size:22px;cursor:pointer;color:#666;">&times;</button>
      </div>

      <div style="display:flex;align-items:center;gap:14px;padding:16px;background:#f9f9f9;border-radius:14px;margin-bottom:20px;">
        <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#880E4F,#7B1FA2);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;">${getInitials(d.name||'DR')}</div>
        <div>
          <div style="font-size:16px;font-weight:700;">${d.name||'—'}</div>
          <div style="font-size:13px;color:#888;">${d.specialty||d.specialisation||'—'} • ${d.experience||'—'} yrs</div>
          <div style="font-size:12px;color:#aaa;margin-top:2px;">${d.phone||''} ${d.email ? '• '+d.email : ''}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
        ${[['Reg. Number', d.registrationNumber||'—'],['Qualifications', d.qualifications||'—'],['Fee', d.fee ? '₹'+d.fee : '—'],['Gender', d.gender||'—']].map(([l,v])=>`
          <div style="padding:12px;background:#f9f9f9;border-radius:10px;">
            <div style="font-size:11px;color:#aaa;font-weight:600;text-transform:uppercase;">${l}</div>
            <div style="font-size:14px;font-weight:600;margin-top:2px;">${v}</div>
          </div>`).join('')}
      </div>

      <div style="margin-bottom:20px;">
        <div style="font-size:14px;font-weight:700;margin-bottom:12px;">📄 Submitted Documents</div>
        ${docHtml}
      </div>

      <div style="display:flex;gap:10px;margin-bottom:8px;">
        ${isPending ? `
          <button onclick="approveFromModal('${d.id}')" style="flex:1;padding:12px;background:#2e7d32;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;">✓ Approve Doctor</button>
          <button onclick="rejectFromModal('${d.id}')" style="flex:1;padding:12px;background:#c62828;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;">✕ Reject Doctor</button>
        ` : `
          <div style="flex:1;padding:12px;text-align:center;border-radius:12px;font-weight:700;font-size:14px;background:${d.status==='active'?'#e8f5e9':'#fce4ec'};color:${d.status==='active'?'#2e7d32':'#c62828'};">
            Status: ${d.status==='active'?'✓ Approved':'✕ Rejected'}
          </div>
        `}
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function approveFromModal(id) {
  await db.collection('doctors').doc(id).update({ status: 'active' });
  showToast('Doctor approved successfully!');
  document.getElementById('doctor-modal')?.remove();
  loadDoctors(); loadOverview();
}

async function rejectFromModal(id) {
  if (!confirm('Are you sure you want to reject this doctor application?')) return;
  await db.collection('doctors').doc(id).update({ status: 'suspended' });
  showToast('Doctor application rejected.');
  document.getElementById('doctor-modal')?.remove();
  loadDoctors(); loadOverview();
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
//   PATIENTS  (real-time — reads from 'users' collection)
// ============================================
let allPatients = [];
let _patientsListener = null;

function loadPatients() {
  if (_patientsListener) _patientsListener();
  _patientsListener = db.collection('users')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      allPatients = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      filterPatients();
      buildPatientChart(allPatients);
      // keep overview stat in sync
      document.getElementById('stat-patients').textContent = allPatients.length.toLocaleString();
    }, err => console.error('Patients load error:', err));
}

function filterPatients() {
  const q = (document.getElementById('patient-search')?.value || '').toLowerCase();
  const filtered = q
    ? allPatients.filter(p =>
        (p.name  || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q))
    : allPatients;
  renderPatientsTable(filtered);
}

function calcAge(dob) {
  if (!dob) return '—';
  // supports DD/MM/YYYY or YYYY-MM-DD
  let d;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dob)) {
    const [dd, mm, yyyy] = dob.split('/');
    d = new Date(`${yyyy}-${mm}-${dd}`);
  } else {
    d = new Date(dob);
  }
  if (isNaN(d)) return '—';
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000)) + ' yrs';
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
      <td>${calcAge(p.dob)}</td>
      <td>${p.gender || '—'}</td>
      <td>${p.isPremium ? '⭐ Premium' : 'Free'}</td>
      <td>${formatDate(p.createdAt)}</td>
    </tr>`;
  }).join('');
}

document.getElementById('patient-search')?.addEventListener('input', filterPatients);

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

// ============================================
//   SERVICE REQUESTS — REALTIME LISTENER
// ============================================

let _allRequests         = [];
let _reqTypeFilter       = 'all';
let _requestsUnsubscribe = null;

function initRequestsListener() {
  if (_requestsUnsubscribe) _requestsUnsubscribe();

  _requestsUnsubscribe = db.collection('service_requests')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      _allRequests = [];
      snap.forEach(doc => _allRequests.push({ id: doc.id, ...doc.data() }));
      applyRequestFilters();
      updateRequestStats();
      updateRequestsBadge();
    }, err => console.error('Requests listener error:', err));
}

function updateRequestStats() {
  const counts = { pending: 0, accepted: 0, in_progress: 0, completed: 0, rejected: 0 };
  _allRequests.forEach(r => {
    const s = r.status || 'pending';
    if (s in counts) counts[s]++;
    if (s === 'assigned') counts.accepted++;
  });
  document.getElementById('req-stat-pending').textContent    = counts.pending;
  document.getElementById('req-stat-accepted').textContent   = counts.accepted;
  document.getElementById('req-stat-inprogress').textContent = counts.in_progress;
  document.getElementById('req-stat-completed').textContent  = counts.completed;
  document.getElementById('req-stat-rejected').textContent   = counts.rejected;
}

function updateRequestsBadge() {
  const pending = _allRequests.filter(r => !r.status || r.status === 'pending').length;
  const badge   = document.getElementById('nav-requests-count');
  if (pending > 0) {
    badge.textContent  = pending;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

function filterRequests(type, btn) {
  _reqTypeFilter = type;
  document.querySelectorAll('.req-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  applyRequestFilters();
}

function applyRequestFilters() {
  const statusFilter = document.getElementById('req-status-filter')?.value || 'all';
  const search       = (document.getElementById('req-search')?.value || '').toLowerCase();

  let filtered = _allRequests;

  if (_reqTypeFilter !== 'all') {
    filtered = filtered.filter(r => r.type === _reqTypeFilter);
  }
  if (statusFilter !== 'all') {
    filtered = filtered.filter(r => (r.status || 'pending') === statusFilter);
  }
  if (search) {
    filtered = filtered.filter(r =>
      (r.patientName || '').toLowerCase().includes(search) ||
      (r.patientPhone || '').toLowerCase().includes(search) ||
      (r.serviceName || '').toLowerCase().includes(search)
    );
  }

  const label = document.getElementById('req-count-label');
  if (label) label.textContent = `${filtered.length} request${filtered.length !== 1 ? 's' : ''}`;

  renderRequestsTable(filtered);
}

function renderRequestsTable(requests) {
  const tbody = document.getElementById('requests-tbody');
  if (!tbody) return;

  if (!requests.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading">No requests found</td></tr>';
    return;
  }

  tbody.innerHTML = requests.map(r => {
    const status      = r.status || 'pending';
    const typeLabel   = reqTypeLabel(r.type);
    const typeColor   = reqTypeColor(r.type);
    const initials    = getInitials(r.patientName || 'PA');
    const color       = randomAvatarColor(r.patientName);
    const received    = r.createdAt ? formatDate(r.createdAt) : '—';
    const dateTime    = [r.preferredDate, r.preferredTime].filter(Boolean).join(' ') || '—';
    const address     = r.address ? (r.address.length > 30 ? r.address.slice(0, 30) + '…' : r.address) : '—';

    const isPending   = status === 'pending';
    const isActive    = ['accepted','assigned','in_progress'].includes(status);
    const isDone      = ['completed','cancelled','rejected'].includes(status);

    return `<tr>
      <td>
        <div class="user-cell">
          <div class="doc-avatar" style="background:${color.bg};color:${color.fg};">${initials}</div>
          <div>
            <div class="user-name">${r.patientName || '—'}</div>
            <div class="user-sub">${r.patientPhone || ''}</div>
          </div>
        </div>
      </td>
      <td style="max-width:160px;word-break:break-word;">${r.serviceName || '—'}</td>
      <td><span class="req-type-badge" style="background:${typeColor.bg};color:${typeColor.fg};">${typeLabel}</span></td>
      <td>${dateTime}</td>
      <td style="max-width:140px;font-size:12px;color:var(--text-secondary);">${address}</td>
      <td><span class="pill pill-${statusPillClass(status)}">${capitalize(status.replace('_',' '))}</span></td>
      <td style="font-size:12px;color:var(--text-secondary);">${received}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${isPending ? `
            <button class="btn btn-approve" onclick="updateRequestStatus('${r.id}','accepted',this)">Accept</button>
            <button class="btn btn-reject" onclick="updateRequestStatus('${r.id}','rejected',this)">Reject</button>
          ` : ''}
          ${isActive ? `
            <button class="btn btn-approve" onclick="updateRequestStatus('${r.id}','completed',this)">Complete</button>
            <button class="btn btn-reject" onclick="updateRequestStatus('${r.id}','cancelled',this)">Cancel</button>
          ` : ''}
          <button class="btn btn-outline" onclick="viewRequestDetail('${r.id}')">View</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function updateRequestStatus(id, newStatus, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    await db.collection('service_requests').doc(id).update({
      status:    newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast(`Request ${newStatus} ✓`);
  } catch (err) {
    showToast('Update failed: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = capitalize(newStatus); }
  }
}

function viewRequestDetail(id) {
  const r = _allRequests.find(x => x.id === id);
  if (!r) return;

  document.getElementById('req-detail-modal')?.remove();

  const details = r.serviceDetails || {};
  const detailRows = Object.entries(details)
    .map(([k, v]) => `<tr><td style="font-weight:600;font-size:12px;color:var(--text-secondary);padding:5px 0;">${formatDetailKey(k)}</td><td style="font-size:12px;padding:5px 0 5px 12px;">${v}</td></tr>`)
    .join('');

  const status = r.status || 'pending';

  const modal = document.createElement('div');
  modal.id = 'req-detail-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:28px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <h2 style="font-size:18px;font-weight:700;margin:0;">Request Detail</h2>
        <button onclick="document.getElementById('req-detail-modal').remove()" style="border:none;background:none;font-size:22px;cursor:pointer;color:#666;">&times;</button>
      </div>

      <div style="display:flex;align-items:center;gap:12px;padding:14px;background:#f9f9f9;border-radius:14px;margin-bottom:18px;">
        <div style="width:46px;height:46px;border-radius:50%;background:${reqTypeColor(r.type).bg};display:flex;align-items:center;justify-content:center;font-size:20px;color:${reqTypeColor(r.type).fg};">
          ${reqTypeIcon(r.type)}
        </div>
        <div>
          <div style="font-weight:700;font-size:15px;">${r.serviceName || '—'}</div>
          <div style="font-size:12px;color:#888;">${reqTypeLabel(r.type)} • <span class="pill pill-${statusPillClass(status)}" style="font-size:11px;">${capitalize(status.replace('_',' '))}</span></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
        <div style="padding:12px;background:#f9f9f9;border-radius:12px;">
          <div style="font-size:11px;font-weight:600;color:#888;margin-bottom:4px;">PATIENT</div>
          <div style="font-weight:600;font-size:14px;">${r.patientName || '—'}</div>
          <div style="font-size:12px;color:#666;">${r.patientPhone || ''}</div>
        </div>
        <div style="padding:12px;background:#f9f9f9;border-radius:12px;">
          <div style="font-size:11px;font-weight:600;color:#888;margin-bottom:4px;">PREFERRED SLOT</div>
          <div style="font-weight:600;font-size:14px;">${r.preferredDate || '—'}</div>
          <div style="font-size:12px;color:#666;">${r.preferredTime || ''}</div>
        </div>
      </div>

      <div style="padding:12px;background:#f9f9f9;border-radius:12px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:600;color:#888;margin-bottom:4px;">ADDRESS</div>
        <div style="font-size:13px;">${r.address || '—'}</div>
      </div>

      ${r.notes ? `
      <div style="padding:12px;background:#fffde7;border-radius:12px;margin-bottom:14px;border:1px solid #fff9c4;">
        <div style="font-size:11px;font-weight:600;color:#f9a825;margin-bottom:4px;">NOTES</div>
        <div style="font-size:13px;">${r.notes}</div>
      </div>` : ''}

      ${detailRows ? `
      <div style="margin-bottom:14px;">
        <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;">SERVICE DETAILS</div>
        <table style="width:100%;border-collapse:collapse;">${detailRows}</table>
      </div>` : ''}

      <div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap;">
        ${status === 'pending' ? `
          <button class="btn btn-approve" style="flex:1;" onclick="updateRequestStatus('${r.id}','accepted',this);document.getElementById('req-detail-modal').remove();">Accept Request</button>
          <button class="btn btn-reject" onclick="updateRequestStatus('${r.id}','rejected',this);document.getElementById('req-detail-modal').remove();">Reject</button>
        ` : ''}
        ${['accepted','assigned'].includes(status) ? `
          <button class="btn btn-approve" style="flex:1;" onclick="updateRequestStatus('${r.id}','in_progress',this);document.getElementById('req-detail-modal').remove();">Mark In Progress</button>
        ` : ''}
        ${status === 'in_progress' ? `
          <button class="btn btn-approve" style="flex:1;" onclick="updateRequestStatus('${r.id}','completed',this);document.getElementById('req-detail-modal').remove();">Mark Completed</button>
        ` : ''}
        <button class="btn btn-outline" onclick="document.getElementById('req-detail-modal').remove()">Close</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function reqTypeLabel(type) {
  const m = { diagnostics: 'Diagnostics', care_assistant: 'Care Assistant', physiotherapy: 'Physiotherapy', equipment: 'Equipment', caregivers: 'Caregivers' };
  return m[type] || capitalize(type || 'Service');
}

function reqTypeColor(type) {
  const m = {
    diagnostics:    { bg: '#e0f7fa', fg: '#0097a7' },
    care_assistant: { bg: '#fff3e0', fg: '#e65100' },
    physiotherapy:  { bg: '#e3f2fd', fg: '#1565c0' },
    equipment:      { bg: '#eceff1', fg: '#37474f' },
    caregivers:     { bg: '#fce4ec', fg: '#c2185b' },
  };
  return m[type] || { bg: '#f3e5f5', fg: '#6a1b9a' };
}

function reqTypeIcon(type) {
  const m = { diagnostics: '🔬', care_assistant: '🤝', physiotherapy: '💪', equipment: '🩺', caregivers: '👩‍⚕️' };
  return m[type] || '📋';
}

function statusPillClass(status) {
  const m = { pending: 'pending', accepted: 'active', assigned: 'active', in_progress: 'active', completed: 'success', cancelled: 'inactive', rejected: 'reject' };
  return m[status] || 'pending';
}

function formatDetailKey(k) {
  return k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

// ============================================
//   NOTIFICATION CENTER
// ============================================

let _notifications       = [];
let _unreadNotifCount    = 0;
let _notifUnsubscribe    = null;
let _seenRequestIds      = new Set(JSON.parse(localStorage.getItem('seenRequests') || '[]'));

function initNotificationsListener() {
  if (_notifUnsubscribe) _notifUnsubscribe();

  _notifUnsubscribe = db.collection('service_requests')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(snap => {
      const newNotifs = [];
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const d = change.doc.data();
          const id = change.doc.id;
          if (!_seenRequestIds.has(id)) {
            newNotifs.push({ id, ...d, _isNew: true });
          }
        }
      });

      snap.forEach(doc => {
        const d = doc.data();
        const existing = _notifications.find(n => n.id === doc.id);
        if (!existing) {
          _notifications.unshift({ id: doc.id, ...d, _read: _seenRequestIds.has(doc.id) });
        }
      });

      _notifications = _notifications.slice(0, 50);
      _unreadNotifCount = _notifications.filter(n => !n._read).length;
      updateNotifBadge();
      renderNotifList();
    }, err => console.error('Notif listener error:', err));
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (_unreadNotifCount > 0) {
    badge.textContent   = _unreadNotifCount > 99 ? '99+' : _unreadNotifCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  if (!_notifications.length) {
    list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }

  list.innerHTML = _notifications.slice(0, 20).map(n => {
    const tc      = reqTypeColor(n.type);
    const icon    = reqTypeIcon(n.type);
    const label   = reqTypeLabel(n.type);
    const time    = n.createdAt ? timeAgo(n.createdAt) : '';
    const isUnread = !n._read;

    return `<div class="notif-item ${isUnread ? 'notif-unread' : ''}" onclick="openRequestFromNotif('${n.id}')">
      <div class="notif-icon" style="background:${tc.bg};color:${tc.fg};">${icon}</div>
      <div class="notif-content">
        <div class="notif-title">New ${label} Request</div>
        <div class="notif-sub">${n.patientName || 'Patient'} • ${n.serviceName || label}</div>
        <div class="notif-time">${time}</div>
      </div>
      ${isUnread ? '<div class="notif-dot"></div>' : ''}
    </div>`;
  }).join('');
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : 'block';
}

function markAllNotifsRead() {
  _notifications.forEach(n => {
    n._read = true;
    _seenRequestIds.add(n.id);
  });
  localStorage.setItem('seenRequests', JSON.stringify([..._seenRequestIds]));
  _unreadNotifCount = 0;
  updateNotifBadge();
  renderNotifList();
}

function openRequestFromNotif(id) {
  document.getElementById('notif-panel').style.display = 'none';
  const n = _notifications.find(x => x.id === id);
  if (n) { n._read = true; _seenRequestIds.add(id); }
  localStorage.setItem('seenRequests', JSON.stringify([..._seenRequestIds]));
  _unreadNotifCount = _notifications.filter(x => !x._read).length;
  updateNotifBadge();
  switchTab('requests', 'Service Requests');
  setTimeout(() => viewRequestDetail(id), 200);
}

function timeAgo(ts) {
  const d   = ts.toDate ? ts.toDate() : new Date(ts);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60)   return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  return Math.floor(sec / 86400) + 'd ago';
}

// Close notif panel when clicking outside
document.addEventListener('click', e => {
  const wrapper = document.getElementById('notif-wrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    const panel = document.getElementById('notif-panel');
    if (panel) panel.style.display = 'none';
  }
});

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

// ============================================
//   REFERRALS
// ============================================

let _allReferrals = [];

// ---- Load config from Firestore and populate form ----
async function loadReferralSettings() {
  try {
    const snap = await db.collection('referralConfig').doc('settings').get();
    const d = snap.exists ? snap.data() : {};

    document.getElementById('ref-enabled').checked        = d.referralEnabled  !== false;
    document.getElementById('ref-rewards-enabled').checked = d.rewardsEnabled  !== false;
    document.getElementById('ref-referrer-reward').value  = d.referrerReward   ?? 50;
    document.getElementById('ref-referred-reward').value  = d.referredReward   ?? 25;
    document.getElementById('ref-trigger').value          = d.rewardTriggerCondition ?? 'on_signup';
    document.getElementById('ref-max-limit').value        = d.maxReferralLimit  ?? 0;
    document.getElementById('ref-campaign-title').value   = d.campaignTitle    ?? 'Refer & Earn';
    document.getElementById('ref-campaign-message').value = d.campaignMessage  ?? '';
    document.getElementById('ref-banner-text').value      = d.bannerText       ?? '';

    if (d.offerExpiryDate) {
      const dt = d.offerExpiryDate.toDate ? d.offerExpiryDate.toDate() : new Date(d.offerExpiryDate);
      const iso = dt.toISOString().slice(0, 16);
      document.getElementById('ref-expiry-date').value = iso;
    }
  } catch (err) {
    console.error('loadReferralSettings error', err);
  }
}

// ---- Save settings to Firestore ----
async function saveReferralSettings() {
  const btn = document.getElementById('save-referral-btn');
  const status = document.getElementById('ref-save-status');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> Saving…';
  status.textContent = '';

  const referrerReward = parseFloat(document.getElementById('ref-referrer-reward').value) || 0;
  const referredReward = parseFloat(document.getElementById('ref-referred-reward').value) || 0;

  if (referrerReward < 0 || referredReward < 0) {
    showToast('Reward amounts must be non-negative.');
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save Settings';
    return;
  }

  const expiryRaw = document.getElementById('ref-expiry-date').value;
  const expiryDate = expiryRaw ? firebase.firestore.Timestamp.fromDate(new Date(expiryRaw)) : null;

  const payload = {
    referralEnabled:        document.getElementById('ref-enabled').checked,
    rewardsEnabled:         document.getElementById('ref-rewards-enabled').checked,
    referrerReward,
    referredReward,
    rewardTriggerCondition: document.getElementById('ref-trigger').value,
    maxReferralLimit:       parseInt(document.getElementById('ref-max-limit').value) || 0,
    campaignTitle:          document.getElementById('ref-campaign-title').value.trim(),
    campaignMessage:        document.getElementById('ref-campaign-message').value.trim(),
    bannerText:             document.getElementById('ref-banner-text').value.trim(),
    offerExpiryDate:        expiryDate,
    updatedAt:              firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy:              auth.currentUser?.email || 'admin',
  };

  try {
    await db.collection('referralConfig').doc('settings').set(payload, { merge: true });
    status.textContent = '✓ Saved ' + new Date().toLocaleTimeString();
    showToast('Referral settings saved ✓');
  } catch (err) {
    showToast('Save failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save Settings';
  }
}

// ---- Load referral stats ----
async function loadReferralStats() {
  try {
    const snap = await db.collection('referrals').get();
    let total = 0, rewarded = 0, pending = 0, totalRewards = 0;
    snap.forEach(doc => {
      const d = doc.data();
      total++;
      if (d.status === 'rewarded') {
        rewarded++;
        totalRewards += (d.referrerRewardAmount || 0) + (d.referredRewardAmount || 0);
      } else if (d.status === 'pending') {
        pending++;
      }
    });
    document.getElementById('ref-stat-total').textContent    = total.toLocaleString();
    document.getElementById('ref-stat-rewarded').textContent = rewarded.toLocaleString();
    document.getElementById('ref-stat-pending').textContent  = pending.toLocaleString();
    document.getElementById('ref-stat-rewards').textContent  = '₹' + totalRewards.toLocaleString('en-IN');
  } catch (err) {
    console.error('loadReferralStats error', err);
  }
}

// ---- Load referrals list ----
async function loadReferrals() {
  document.getElementById('referrals-tbody').innerHTML =
    '<tr><td colspan="7" class="loading">Loading referrals...</td></tr>';
  try {
    const snap = await db.collection('referrals').orderBy('createdAt', 'desc').limit(200).get();
    _allReferrals = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderReferrals(_allReferrals);
  } catch (err) {
    document.getElementById('referrals-tbody').innerHTML =
      `<tr><td colspan="7" style="text-align:center;color:var(--danger);">Failed to load: ${err.message}</td></tr>`;
  }
}

function filterReferrals() {
  const filter = document.getElementById('ref-filter').value;
  const filtered = filter === 'all'
    ? _allReferrals
    : _allReferrals.filter(r => r.status === filter);
  renderReferrals(filtered);
}

function renderReferrals(list) {
  const tbody = document.getElementById('referrals-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No referrals found.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(r => {
    const date = r.createdAt?.toDate
      ? r.createdAt.toDate().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
      : '—';
    const statusBadge = r.status === 'rewarded'
      ? '<span class="badge badge-green">Rewarded</span>'
      : '<span class="badge badge-yellow">Pending</span>';
    return `<tr>
      <td>${r.referrerName || r.referrerId?.slice(0,8) || '—'}</td>
      <td>${r.referredUserId?.slice(0,8) || '—'}</td>
      <td><code>${r.referralCode || '—'}</code></td>
      <td>₹${(r.referrerRewardAmount || 0).toLocaleString('en-IN')}</td>
      <td>₹${(r.referredRewardAmount || 0).toLocaleString('en-IN')}</td>
      <td>${statusBadge}</td>
      <td>${date}</td>
    </tr>`;
  }).join('');
}

// ============================================
//   PATIENT FEEDBACK
// ============================================
let allFeedbacks = [];

async function loadFeedbacks() {
  try {
    const snap = await db.collection('feedbacks').orderBy('createdAt', 'desc').get();
    allFeedbacks = [];
    snap.forEach(doc => allFeedbacks.push({ id: doc.id, ...doc.data() }));

    // Summary stats
    const total     = allFeedbacks.length;
    const immediate = allFeedbacks.filter(f => f.type === 'immediate').length;
    const followup  = allFeedbacks.filter(f => f.type === 'followup').length;
    const ratings   = allFeedbacks.map(f => f.rating || 0).filter(r => r > 0);
    const avg       = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '—';

    document.getElementById('fb-avg-rating').textContent  = avg === '—' ? '—' : `${avg} ⭐`;
    document.getElementById('fb-total').textContent       = total.toLocaleString();
    document.getElementById('fb-immediate').textContent   = immediate.toLocaleString();
    document.getElementById('fb-followup').textContent    = followup.toLocaleString();

    // Update sidebar badge
    if (total > 0) {
      const badge = document.getElementById('nav-feedback-count');
      badge.textContent = total;
      badge.style.display = 'inline-flex';
    }

    renderFeedbackTable(allFeedbacks);
  } catch (err) {
    console.error('Feedback load error:', err);
  }
}

function filterFeedback() {
  const type   = document.getElementById('fb-type-filter').value;
  const rating = document.getElementById('fb-rating-filter').value;
  const q      = (document.getElementById('fb-search').value || '').toLowerCase();

  let list = [...allFeedbacks];

  if (type !== 'all')   list = list.filter(f => f.type === type);
  if (rating !== 'all') list = list.filter(f => (f.rating || 0) === parseInt(rating));
  if (q) list = list.filter(f =>
    (f.patientName || '').toLowerCase().includes(q) ||
    (f.doctorName  || '').toLowerCase().includes(q) ||
    (f.comment     || '').toLowerCase().includes(q)
  );

  renderFeedbackTable(list);
}

function renderFeedbackTable(list) {
  const tbody = document.getElementById('feedback-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading">No feedback found</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(f => {
    // Stars HTML
    const stars = Array.from({ length: 5 }, (_, i) =>
      `<span style="color:${i < (f.rating || 0) ? '#ffa000' : '#ddd'};font-size:13px;">★</span>`
    ).join('');

    // Feeling badge color
    const feelingColor = {
      'Much Better': '#2e7d32', 'Better': '#66bb6a',
      'Same': '#e65100',        'Worse':  '#b71c1c',
    }[f.feeling] || '#888';
    const feelingHtml = f.feeling
      ? `<span style="background:${feelingColor}20;color:${feelingColor};padding:3px 8px;border-radius:8px;font-size:11px;font-weight:700;">${f.feeling}</span>`
      : '—';

    // Type badge
    const typeHtml = f.type === 'immediate'
      ? '<span class="pill" style="background:#e3f2fd;color:#1565c0;">Immediate</span>'
      : '<span class="pill" style="background:#f3e5f5;color:#7b1fa2;">Follow-up</span>';

    const date = f.createdAt
      ? f.createdAt.toDate().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
      : '—';

    const comment = f.comment
      ? `<span title="${f.comment.replace(/"/g, '&quot;')}" style="cursor:help;">${f.comment.length > 35 ? f.comment.slice(0, 35) + '…' : f.comment}</span>`
      : '<span style="color:#aaa;">—</span>';

    return `<tr>
      <td><div class="user-name">${f.patientName || '—'}</div></td>
      <td><div class="user-sub">${f.doctorName || '—'}</div></td>
      <td>${typeHtml}</td>
      <td>${f.rating > 0 ? stars : '<span style="color:#aaa;">No rating</span>'}</td>
      <td>${feelingHtml}</td>
      <td>${f.painLevel > 0 ? `<b>${f.painLevel}</b>/10` : '0/10'}</td>
      <td style="max-width:200px;">${comment}</td>
      <td style="white-space:nowrap;">${date}</td>
    </tr>`;
  }).join('');
}

// ============================================
//   MOBILE SIDEBAR TOGGLE
// ============================================

function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const isOpen   = sidebar.classList.contains('open');
  if (isOpen) {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  }
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
}

// Close sidebar on tab nav click (mobile)
document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
  item.addEventListener('click', () => {
    if (window.innerWidth <= 768) closeSidebar();
  });
});

// ============================================
//   REALTIME OVERVIEW — replace static .get()
// ============================================

let _overviewUnsubscribes = [];

function initOverviewRealtime() {
  _overviewUnsubscribes.forEach(u => u && u());
  _overviewUnsubscribes = [];

  // Doctors count — realtime
  _overviewUnsubscribes.push(
    db.collection('doctors').onSnapshot(snap => {
      const el = document.getElementById('stat-doctors');
      if (el) { el.textContent = snap.size.toLocaleString(); el.classList.add('stat-updated'); setTimeout(() => el.classList.remove('stat-updated'), 500); }
      // Pending list
      const pendingDocs = snap.docs.filter(d => { const s = d.data().status; return !s || s === 'pending'; }).slice(0, 5);
      renderPendingList(pendingDocs);
      // Notify new doctors
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const d = change.doc.data();
          if (!d.status || d.status === 'pending') {
            addSystemNotif('doctor_reg', { id: change.doc.id, name: d.name || 'New doctor', specialty: d.specialisation || '' });
          }
        }
      });
    }, err => console.error('doctors listener', err))
  );

  // Patients count — realtime
  _overviewUnsubscribes.push(
    db.collection('users').onSnapshot(snap => {
      const el = document.getElementById('stat-patients');
      if (el) { el.textContent = snap.size.toLocaleString(); el.classList.add('stat-updated'); setTimeout(() => el.classList.remove('stat-updated'), 500); }
    }, err => console.error('users listener', err))
  );

  // Revenue this month — realtime
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  _overviewUnsubscribes.push(
    db.collection('payments').where('createdAt', '>=', startOfMonth).onSnapshot(snap => {
      let total = 0;
      snap.forEach(d => { total += d.data().amount || 0; });
      const el = document.getElementById('stat-revenue');
      if (el) { el.textContent = formatCurrency(total); el.classList.add('stat-updated'); setTimeout(() => el.classList.remove('stat-updated'), 500); }
    }, err => console.error('payments listener', err))
  );

  // Open tickets count — realtime
  _overviewUnsubscribes.push(
    db.collection('tickets').where('status', '==', 'open').onSnapshot(snap => {
      const el = document.getElementById('stat-tickets');
      if (el) { el.textContent = snap.size; el.classList.add('stat-updated'); setTimeout(() => el.classList.remove('stat-updated'), 500); }
      const badge = document.getElementById('nav-ticket-count');
      if (badge) badge.textContent = snap.size;
    }, err => console.error('tickets listener', err))
  );
}

// ============================================
//   REALTIME DOCTORS LIST
// ============================================

let _doctorsListener = null;

function loadDoctorsRealtime() {
  if (_doctorsListener) _doctorsListener();
  _doctorsListener = db.collection('doctors').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allDoctors = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderDoctorsTable(allDoctors);
  }, err => console.error('doctors list listener', err));
}

// ============================================
//   REALTIME TICKETS
// ============================================

let _ticketsListener = null;

function loadTicketsRealtime() {
  if (_ticketsListener) _ticketsListener();
  _ticketsListener = db.collection('tickets').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allTickets = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const openCount = allTickets.filter(t => t.status === 'open').length;
    document.getElementById('stat-tickets').textContent = openCount;
    const badge = document.getElementById('nav-ticket-count');
    if (badge) badge.textContent = openCount;
    renderTicketsTable(allTickets);
    // Notify new open tickets
    snap.docChanges().forEach(change => {
      if (change.type === 'added' && change.doc.data().status === 'open') {
        const t = change.doc.data();
        addSystemNotif('ticket', { id: change.doc.id, title: t.title || t.message || 'Support ticket', priority: t.priority || 'medium', user: t.userName || 'User' });
      }
    });
  }, err => console.error('tickets listener', err));
}

// ============================================
//   REALTIME REVENUE
// ============================================

let _revenueListener = null;

function loadRevenueRealtime() {
  if (_revenueListener) _revenueListener();
  _revenueListener = db.collection('payments').orderBy('createdAt', 'desc').onSnapshot(snap => {
    const payments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderPaymentsTable(payments);
    buildRevenueDetailChart(payments);
  }, err => console.error('revenue listener', err));
}

// ============================================
//   REALTIME FEEDBACKS
// ============================================

let _feedbacksListener = null;

function loadFeedbacksRealtime() {
  if (_feedbacksListener) _feedbacksListener();
  _feedbacksListener = db.collection('feedbacks').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allFeedbacks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const total     = allFeedbacks.length;
    const immediate = allFeedbacks.filter(f => f.type === 'immediate').length;
    const followup  = allFeedbacks.filter(f => f.type === 'followup').length;
    const ratings   = allFeedbacks.map(f => f.rating || 0).filter(r => r > 0);
    const avg       = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '—';
    document.getElementById('fb-avg-rating').textContent = avg === '—' ? '—' : `${avg} ⭐`;
    document.getElementById('fb-total').textContent      = total.toLocaleString();
    document.getElementById('fb-immediate').textContent  = immediate.toLocaleString();
    document.getElementById('fb-followup').textContent   = followup.toLocaleString();
    const badge = document.getElementById('nav-feedback-count');
    if (badge) { badge.textContent = total; badge.style.display = total > 0 ? 'inline' : 'none'; }
    renderFeedbackTable(allFeedbacks);
  }, err => console.error('feedbacks listener', err));
}

// ============================================
//   REALTIME BANNERS
// ============================================

let _bannersListener = null;

function loadBannersRealtime() {
  if (_bannersListener) _bannersListener();
  _bannersListener = db.collection('banners').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allBanners = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderBannersList(allBanners);
    const activeCount = allBanners.filter(b => isBannerActive(b)).length;
    const badge = document.getElementById('nav-banner-count');
    if (badge) { badge.textContent = activeCount; badge.style.display = activeCount > 0 ? 'inline' : 'none'; }
  }, err => console.error('banners listener', err));
}

// ============================================
//   PATCH initDashboard — USE REALTIME EVERYWHERE
// ============================================

function initDashboard() {
  initOverviewRealtime();
  loadDoctorsRealtime();
  loadPatients();
  loadRevenueRealtime();
  loadMedicines();
  loadTicketsRealtime();
  loadReportsList();
  loadBannersRealtime();
  loadHospitals();
  loadAmbulances();
  loadReferralSettings();
  loadReferralStats();
  loadReferrals();
  loadFeedbacksRealtime();
  initRequestsListener();
  initNotificationsListener();
  initServicesListener();
  initAppointmentsListener();
  initWalletListener();
  loadBroadcasts();
  updateAdminDisplayName();
}

function updateAdminDisplayName() {
  const user = auth.currentUser;
  if (!user) return;
  const name = user.displayName || user.email || 'Admin';
  const el = document.querySelector('.admin-name');
  if (el) el.textContent = name.split('@')[0];
}

// ============================================
//   SERVICES MANAGEMENT — FULL CRUD
// ============================================

let allServices        = [];
let _editingServiceId  = null;
let _servicesListener  = null;

const svcTypeColors = {
  diagnostics:      { bg: '#e0f7fa', fg: '#0097a7', icon: '🔬' },
  lab_tests:        { bg: '#e8eaf6', fg: '#3949ab', icon: '🧪' },
  physiotherapy:    { bg: '#e3f2fd', fg: '#1565c0', icon: '💪' },
  care_assistant:   { bg: '#fff3e0', fg: '#e65100', icon: '🤝' },
  caregivers:       { bg: '#fce4ec', fg: '#c2185b', icon: '👩‍⚕️' },
  equipment:        { bg: '#eceff1', fg: '#37474f', icon: '🩺' },
  consultation:     { bg: '#f3e5f5', fg: '#7b1fa2', icon: '💬' },
  nutrition:        { bg: '#e8f5e9', fg: '#2e7d32', icon: '🥗' },
  counselling:      { bg: '#e0f2f1', fg: '#00695c', icon: '🧠' },
  medicine_delivery:{ bg: '#fff8e1', fg: '#f57f17', icon: '💊' },
};

function svcTypeLabel(type) {
  const m = {
    diagnostics:'Diagnostics', lab_tests:'Lab Tests', physiotherapy:'Physiotherapy',
    care_assistant:'Care Assistant', caregivers:'Caregivers', equipment:'Equipment',
    consultation:'Consultation', nutrition:'Nutrition', counselling:'Counselling',
    medicine_delivery:'Medicine Delivery',
  };
  return m[type] || capitalize(type || 'Service');
}

function initServicesListener() {
  if (_servicesListener) _servicesListener();
  _servicesListener = db.collection('services').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allServices = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    filterServices();
    const enabledCount = allServices.filter(s => s.isEnabled).length;
    const badge = document.getElementById('nav-services-count');
    if (badge) { badge.textContent = enabledCount; badge.style.display = enabledCount > 0 ? 'inline' : 'none'; }
  }, err => console.error('services listener', err));
}

function filterServices() {
  const q      = (document.getElementById('service-search')?.value || '').toLowerCase();
  const type   = document.getElementById('service-type-filter')?.value || 'all';
  let filtered = allServices;
  if (type !== 'all') filtered = filtered.filter(s => s.type === type);
  if (q)              filtered = filtered.filter(s =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.description || '').toLowerCase().includes(q)
  );
  renderServicesList(filtered);
}

function renderServicesList(services) {
  const el = document.getElementById('services-list');
  if (!el) return;
  if (!services.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🛠</div><p>No services added yet — create one above.</p></div>';
    return;
  }
  el.innerHTML = services.map(s => {
    const tc      = svcTypeColors[s.type] || { bg: '#f3e5f5', fg: '#6a1b9a', icon: '📋' };
    const priceStr = s.price
      ? `₹${Number(s.price).toLocaleString('en-IN')} <span style="font-size:11px;font-weight:400;color:var(--text-muted);">${s.priceUnit ? '/ '+s.priceUnit.replace('_',' ') : ''}</span>`
      : '<span style="color:var(--text-muted);font-size:12px;">Price not set</span>';
    const thumb = s.imageUrl
      ? `<img class="service-thumb" src="${escapeHtml(s.imageUrl)}" alt="${escapeHtml(s.name || '')}" loading="lazy" />`
      : `<div class="service-thumb-placeholder" style="background:${tc.bg};color:${tc.fg};">${tc.icon}</div>`;
    return `
    <div class="service-card" id="service-card-${s.id}">
      ${thumb}
      <div class="service-info">
        <div class="service-name">${escapeHtml(s.name || '—')}</div>
        <div class="service-meta">${escapeHtml(s.description || '')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center;">
          <span class="svc-type-badge" style="background:${tc.bg};color:${tc.fg};">${tc.icon} ${svcTypeLabel(s.type)}</span>
          <span class="service-price">${priceStr}</span>
          ${s.duration ? `<span class="banner-cta-chip">⏱ ${escapeHtml(s.duration)}</span>` : ''}
          ${s.isFeatured ? '<span class="pill pill-active">⭐ Featured</span>' : ''}
          ${s.isEnabled ? '<span class="pill pill-active">Enabled</span>' : '<span class="pill pill-suspended">Disabled</span>'}
        </div>
      </div>
      <div class="service-actions">
        <label class="toggle-label" title="${s.isEnabled ? 'Disable' : 'Enable'}">
          <input type="checkbox" ${s.isEnabled ? 'checked' : ''} onchange="toggleService('${s.id}', this.checked)" />
          <span class="toggle-switch"></span>
        </label>
        <button class="btn btn-outline" onclick="editService('${s.id}')" title="Edit">
          <i class="ti ti-edit"></i>
        </button>
        <button class="btn btn-reject" onclick="deleteService('${s.id}', '${escapeHtml(s.storagePath||'')}', this)" title="Delete">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    </div>`;
  }).join('');
}

async function saveService() {
  const name        = document.getElementById('svc-name')?.value.trim();
  const type        = document.getElementById('svc-type')?.value;
  const price       = document.getElementById('svc-price')?.value;
  const priceUnit   = document.getElementById('svc-price-unit')?.value;
  const duration    = document.getElementById('svc-duration')?.value.trim();
  const description = document.getElementById('svc-desc')?.value.trim();
  const isEnabled   = document.getElementById('svc-enabled')?.checked !== false;
  const isFeatured  = document.getElementById('svc-featured')?.checked || false;
  const fileInput   = document.getElementById('service-file-input');
  const file        = fileInput?.files[0];

  if (!name) { showToast('Service name is required'); return; }
  if (!type)  { showToast('Please select a category'); return; }

  const btn      = document.getElementById('save-service-btn');
  const progress = document.getElementById('service-upload-progress');
  btn.disabled   = true;

  let imageUrl    = '';
  let storagePath = '';

  if (_editingServiceId && !file) {
    const existing = allServices.find(s => s.id === _editingServiceId);
    imageUrl    = existing?.imageUrl    || '';
    storagePath = existing?.storagePath || '';
  }

  if (file) {
    if (file.size > 5 * 1024 * 1024) { showToast('Image too large — max 5 MB'); btn.disabled = false; return; }
    progress.style.display = 'flex';
    btn.style.display = 'none';
    const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    storagePath     = `services/${Date.now()}_${safeName}`;
    try {
      const ref  = storage.ref(storagePath);
      const task = ref.put(file, { contentType: file.type });
      await new Promise((res, rej) => task.on('state_changed', null, rej, res));
      imageUrl = await ref.getDownloadURL();
    } catch (err) {
      showToast('Upload failed: ' + err.message);
      progress.style.display = 'none';
      btn.style.display = 'inline-flex';
      btn.disabled = false;
      return;
    }
    progress.style.display = 'none';
    btn.style.display = 'inline-flex';
  }

  const data = {
    name, type,
    price:       price ? parseFloat(price) : null,
    priceUnit:   priceUnit || 'per_session',
    duration:    duration   || null,
    description: description || null,
    imageUrl, storagePath,
    isEnabled, isFeatured,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: auth.currentUser?.email || 'admin',
  };

  try {
    if (_editingServiceId) {
      await db.collection('services').doc(_editingServiceId).update(data);
      showToast('Service updated ✓');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('services').add(data);
      showToast('Service added ✓');
    }
    cancelServiceEdit();
  } catch (err) {
    showToast('Save failed: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

function editService(id) {
  const s = allServices.find(x => x.id === id);
  if (!s) return;
  _editingServiceId = id;
  document.getElementById('svc-name').value       = s.name        || '';
  document.getElementById('svc-type').value       = s.type        || 'diagnostics';
  document.getElementById('svc-price').value      = s.price       || '';
  document.getElementById('svc-price-unit').value = s.priceUnit   || 'per_session';
  document.getElementById('svc-duration').value   = s.duration    || '';
  document.getElementById('svc-desc').value       = s.description || '';
  document.getElementById('svc-enabled').checked  = s.isEnabled   !== false;
  document.getElementById('svc-featured').checked = s.isFeatured  || false;
  if (s.imageUrl) {
    const img = document.getElementById('service-preview-img');
    img.src = s.imageUrl; img.style.display = 'block';
    document.getElementById('service-upload-placeholder').style.display = 'none';
  }
  document.getElementById('service-form-title').textContent   = 'Edit Service';
  document.getElementById('save-service-btn').innerHTML = '<i class="ti ti-device-floppy"></i> Save Changes';
  document.getElementById('cancel-service-btn').style.display = 'inline-flex';
  document.getElementById('tab-services').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelServiceEdit() {
  _editingServiceId = null;
  ['svc-name','svc-price','svc-duration','svc-desc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const typeEl = document.getElementById('svc-type');     if (typeEl) typeEl.value = 'diagnostics';
  const puEl   = document.getElementById('svc-price-unit'); if (puEl) puEl.value = 'per_session';
  document.getElementById('svc-enabled').checked  = true;
  document.getElementById('svc-featured').checked = false;
  document.getElementById('service-file-input').value = '';
  document.getElementById('service-preview-img').style.display      = 'none';
  document.getElementById('service-upload-placeholder').style.display = 'block';
  document.getElementById('service-form-title').textContent   = 'Add Service';
  document.getElementById('save-service-btn').innerHTML = '<i class="ti ti-device-floppy"></i> Save Service';
  document.getElementById('cancel-service-btn').style.display = 'none';
}

function previewServiceImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('Image too large — max 5 MB'); event.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('service-preview-img');
    img.src = e.target.result; img.style.display = 'block';
    document.getElementById('service-upload-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function toggleService(id, enabled) {
  try {
    await db.collection('services').doc(id).update({ isEnabled: enabled, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast(enabled ? 'Service enabled ✓' : 'Service disabled');
  } catch (err) { showToast('Update failed: ' + err.message); }
}

async function deleteService(id, storagePath, btn) {
  if (!confirm('Delete this service? This cannot be undone.')) return;
  btn.disabled = true;
  try {
    await db.collection('services').doc(id).delete();
    if (storagePath) { try { await storage.ref(storagePath).delete(); } catch(_) {} }
    showToast('Service deleted');
  } catch (err) { btn.disabled = false; showToast('Delete failed: ' + err.message); }
}

// Drag-and-drop for service image
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('service-upload-zone');
  if (!zone) return;
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const dt = new DataTransfer(); dt.items.add(file);
      document.getElementById('service-file-input').files = dt.files;
      previewServiceImage({ target: { files: dt.files, value: '' } });
    }
  });
});

// ============================================
//   APPOINTMENTS MANAGEMENT — REALTIME
// ============================================

let _allAppointments     = [];
let _apptListener        = null;

function initAppointmentsListener() {
  if (_apptListener) _apptListener();
  _apptListener = db.collection('appointments').orderBy('createdAt', 'desc').onSnapshot(snap => {
    _allAppointments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateApptStats();
    applyApptFilters();
    updateApptBadge();
    // Notify new appointments
    snap.docChanges().forEach(change => {
      if (change.type === 'added') {
        const d = change.doc.data();
        addSystemNotif('appointment', { id: change.doc.id, patient: d.patientName || 'Patient', doctor: d.doctorName || 'Doctor', date: d.date || '' });
      }
    });
  }, err => console.error('appointments listener', err));
}

function updateApptStats() {
  const today = new Date().toISOString().slice(0, 10);
  const counts = { pending: 0, confirmed: 0, completed: 0, cancelled: 0, today: 0 };
  _allAppointments.forEach(a => {
    const s = a.status || 'pending';
    if (s in counts) counts[s]++;
    if (a.date === today) counts.today++;
  });
  ['pending','confirmed','completed','cancelled','today'].forEach(k => {
    const el = document.getElementById(`appt-stat-${k}`);
    if (el) el.textContent = counts[k];
  });
}

function updateApptBadge() {
  const pending = _allAppointments.filter(a => !a.status || a.status === 'pending').length;
  const badge   = document.getElementById('nav-appt-count');
  if (!badge) return;
  badge.textContent   = pending;
  badge.style.display = pending > 0 ? 'inline-flex' : 'none';
}

function applyApptFilters() {
  const q       = (document.getElementById('appt-search')?.value || '').toLowerCase();
  const status  = document.getElementById('appt-status-filter')?.value || 'all';
  const dateF   = document.getElementById('appt-date-filter')?.value  || 'all';
  const today   = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const monAgo  = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  let list = _allAppointments;
  if (status !== 'all') list = list.filter(a => (a.status || 'pending') === status);
  if (dateF === 'today') list = list.filter(a => a.date === today);
  else if (dateF === 'week')  list = list.filter(a => a.date >= weekAgo);
  else if (dateF === 'month') list = list.filter(a => a.date >= monAgo);
  if (q) list = list.filter(a =>
    (a.patientName || '').toLowerCase().includes(q) ||
    (a.doctorName  || '').toLowerCase().includes(q) ||
    (a.patientPhone || '').toLowerCase().includes(q)
  );

  const label = document.getElementById('appt-count-label');
  if (label) label.textContent = `${list.length} appointment${list.length !== 1 ? 's' : ''}`;
  renderAppointmentsTable(list);
}

function renderAppointmentsTable(list) {
  const tbody = document.getElementById('appointments-tbody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">No appointments found</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(a => {
    const status = a.status || 'pending';
    const pillCls = { pending:'pending', confirmed:'confirmed', completed:'completed', cancelled:'suspended', no_show:'no_show' }[status] || 'pending';
    const patColor = randomAvatarColor(a.patientName);
    const typeBadge = a.type === 'video'
      ? '<span class="pill" style="background:#e3f2fd;color:#1565c0;">📹 Video</span>'
      : '<span class="pill" style="background:#e8f5e9;color:#2e7d32;">🏥 In-Person</span>';
    const slot = [a.date, a.time].filter(Boolean).join(' • ') || '—';
    return `<tr>
      <td>
        <div class="user-cell">
          <div class="doc-avatar" style="background:${patColor.bg};color:${patColor.fg};">${getInitials(a.patientName||'PT')}</div>
          <div><div class="user-name">${a.patientName||'—'}</div><div class="user-sub">${a.patientPhone||''}</div></div>
        </div>
      </td>
      <td>
        <div class="user-name">${a.doctorName||'—'}</div>
        <div class="user-sub">${a.doctorSpeciality||''}</div>
      </td>
      <td><span class="appt-time-badge">${slot}</span></td>
      <td>${typeBadge}</td>
      <td><span class="pill pill-${pillCls}">${capitalize(status.replace('_',' '))}</span></td>
      <td style="font-size:12px;color:var(--text-secondary);">${formatDate(a.createdAt)}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${status === 'pending' ? `
            <button class="btn btn-approve" onclick="updateApptStatus('${a.id}','confirmed',this)">Confirm</button>
            <button class="btn btn-reject"  onclick="updateApptStatus('${a.id}','cancelled',this)">Cancel</button>
          ` : ''}
          ${status === 'confirmed' ? `
            <button class="btn btn-approve" onclick="updateApptStatus('${a.id}','completed',this)">Complete</button>
            <button class="btn btn-reject"  onclick="updateApptStatus('${a.id}','cancelled',this)">Cancel</button>
          ` : ''}
          <button class="btn btn-outline" onclick="viewApptDetail('${a.id}')">View</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function updateApptStatus(id, newStatus, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    await db.collection('appointments').doc(id).update({
      status: newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    // Notify patient
    const appt = _allAppointments.find(a => a.id === id);
    if (appt?.patientId) {
      const msg = {
        confirmed: 'Your appointment has been confirmed!',
        cancelled: 'Your appointment has been cancelled.',
        completed: 'Your appointment is marked as completed.',
      }[newStatus];
      if (msg) {
        // Correct path: patient_notifications/{uid}/items
        db.collection('patient_notifications').doc(appt.patientId).collection('items').add({
          title: 'Appointment Update',
          body: msg,
          type: 'appointment',
          isRead: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          deliverAt: firebase.firestore.FieldValue.serverTimestamp(),
        }).catch(() => {});
      }
    }
    showToast(`Appointment ${newStatus} ✓`);
  } catch (err) {
    showToast('Update failed: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = capitalize(newStatus); }
  }
}

function viewApptDetail(id) {
  const a = _allAppointments.find(x => x.id === id);
  if (!a) return;
  document.getElementById('appt-detail-modal')?.remove();
  const status = a.status || 'pending';
  const pillCls = { pending:'pending', confirmed:'confirmed', completed:'completed', cancelled:'suspended', no_show:'no_show' }[status] || 'pending';
  const modal = document.createElement('div');
  modal.id = 'appt-detail-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;width:100%;max-width:500px;max-height:90vh;overflow-y:auto;padding:28px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <h2 style="font-size:18px;font-weight:700;margin:0;">Appointment Detail</h2>
        <button onclick="document.getElementById('appt-detail-modal').remove()" style="border:none;background:none;font-size:22px;cursor:pointer;color:#666;">&times;</button>
      </div>
      <div style="background:#f9f9f9;border-radius:14px;padding:16px;margin-bottom:18px;">
        <div style="font-size:16px;font-weight:700;">${a.patientName||'—'}</div>
        <div style="font-size:13px;color:#888;margin-top:2px;">${a.patientPhone||''}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        ${[['Doctor', a.doctorName||'—'], ['Speciality', a.doctorSpeciality||'—'], ['Date', a.date||'—'], ['Time', a.time||'—'], ['Type', capitalize(a.type||'in_person')], ['Status', capitalize(status)]].map(([l,v])=>`
          <div style="padding:10px;background:#f9f9f9;border-radius:10px;">
            <div style="font-size:11px;color:#aaa;font-weight:600;">${l.toUpperCase()}</div>
            <div style="font-size:14px;font-weight:600;margin-top:2px;">${v}</div>
          </div>`).join('')}
      </div>
      ${a.notes ? `<div style="padding:12px;background:#fffde7;border-radius:10px;margin-bottom:16px;"><div style="font-size:11px;font-weight:600;color:#f9a825;margin-bottom:4px;">NOTES</div><div style="font-size:13px;">${a.notes}</div></div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${status==='pending' ? `
          <button class="btn btn-approve" style="flex:1;" onclick="updateApptStatus('${a.id}','confirmed',this);document.getElementById('appt-detail-modal').remove();">Confirm</button>
          <button class="btn btn-reject" onclick="updateApptStatus('${a.id}','cancelled',this);document.getElementById('appt-detail-modal').remove();">Cancel</button>
        ` : ''}
        ${status==='confirmed' ? `
          <button class="btn btn-approve" style="flex:1;" onclick="updateApptStatus('${a.id}','completed',this);document.getElementById('appt-detail-modal').remove();">Mark Completed</button>
        ` : ''}
        <button class="btn btn-outline" onclick="document.getElementById('appt-detail-modal').remove()">Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ============================================
//   WALLET & TRANSACTIONS MANAGEMENT
// ============================================

let _allWalletTx   = [];
let _walletListener = null;
let _selectedWalletUser = null;

function initWalletListener() {
  if (_walletListener) _walletListener();
  // Listen to top-level wallet_transactions collection
  _walletListener = db.collection('wallet_transactions').orderBy('createdAt', 'desc').limit(200).onSnapshot(snap => {
    _allWalletTx = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateWalletStats();
    filterWalletTx();
    // Badge: pending refunds
    const refunds = _allWalletTx.filter(t => t.type === 'refund' && t.status === 'pending').length;
    const badge = document.getElementById('nav-wallet-count');
    if (badge) { badge.textContent = refunds; badge.style.display = refunds > 0 ? 'inline-flex' : 'none'; }
  }, err => console.error('wallet listener', err));
}

function updateWalletStats() {
  let credits = 0, debits = 0, refunds = 0, referrals = 0;
  _allWalletTx.forEach(t => {
    if (t.type === 'credit')   credits   += t.amount || 0;
    if (t.type === 'debit')    debits    += t.amount || 0;
    if (t.type === 'refund')   refunds   += (t.status === 'pending') ? 1 : 0;
    if (t.type === 'referral') referrals += t.amount || 0;
  });
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('wallet-stat-credits',  formatCurrency(credits));
  set('wallet-stat-debits',   formatCurrency(debits));
  set('wallet-stat-refunds',  refunds.toString());
  set('wallet-stat-referral', formatCurrency(referrals));
}

function filterWalletTx() {
  const q    = (document.getElementById('wallet-search')?.value || '').toLowerCase();
  const type = document.getElementById('wallet-type-filter')?.value || 'all';
  let list   = _allWalletTx;
  if (type !== 'all') list = list.filter(t => t.type === type);
  if (q) list = list.filter(t =>
    (t.userName  || '').toLowerCase().includes(q) ||
    (t.userPhone || '').toLowerCase().includes(q) ||
    (t.reason    || '').toLowerCase().includes(q)
  );
  renderWalletTable(list);
}

function renderWalletTable(list) {
  const tbody = document.getElementById('wallet-tbody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">No transactions found</td></tr>';
    return;
  }
  const typeClass  = { credit:'wallet-credit', debit:'wallet-debit', refund:'wallet-refund', referral:'wallet-referral' };
  const typeLabel  = { credit:'Credit', debit:'Debit', refund:'Refund', referral:'Referral' };
  const typeSign   = { credit:'+', debit:'-', refund:'+', referral:'+' };
  tbody.innerHTML = list.slice(0, 100).map(t => {
    const tc  = typeClass[t.type]  || 'wallet-credit';
    const tl  = typeLabel[t.type]  || capitalize(t.type||'');
    const sign = typeSign[t.type] || '+';
    return `<tr>
      <td>
        <div class="user-name">${t.userName || '—'}</div>
        <div class="user-sub">${t.userPhone || t.userId?.slice(0,8) || ''}</div>
      </td>
      <td class="tx-amount-${t.type || 'credit'}" style="font-size:15px;">${sign}₹${Number(t.amount||0).toLocaleString('en-IN')}</td>
      <td><span class="pill pill-${tc}">${tl}</span></td>
      <td style="font-size:12px;color:var(--text-secondary);">${t.reason || '—'}</td>
      <td style="font-weight:600;">₹${Number(t.balanceAfter||0).toLocaleString('en-IN')}</td>
      <td style="font-size:12px;">${formatDate(t.createdAt)}</td>
    </tr>`;
  }).join('');
}

// Search users for wallet credit
let _walletSearchTimeout = null;
function searchWalletUser() {
  const q = (document.getElementById('credit-user-search')?.value || '').trim().toLowerCase();
  const sugBox = document.getElementById('wallet-user-suggestions');
  clearTimeout(_walletSearchTimeout);
  if (!sugBox) return;
  if (!q) { sugBox.innerHTML = ''; _selectedWalletUser = null; return; }
  _walletSearchTimeout = setTimeout(async () => {
    try {
      const snap = await db.collection('users').orderBy('name').startAt(q).endAt(q + '').limit(8).get();
      if (snap.empty) { sugBox.innerHTML = '<div class="wallet-suggestion-item" style="color:var(--text-muted);">No users found</div>'; return; }
      sugBox.innerHTML = snap.docs.map(doc => {
        const u = doc.data();
        return `<div class="wallet-suggestion-item" onclick="selectWalletUser('${doc.id}','${escapeHtml(u.name||'')}','${escapeHtml(u.phone||'')}')">
          <div class="doc-avatar" style="background:#e8f0fe;color:#1a73e8;width:28px;height:28px;font-size:11px;">${getInitials(u.name||'U')}</div>
          <div><div style="font-weight:600;">${escapeHtml(u.name||'—')}</div><div style="font-size:11px;color:var(--text-muted);">${escapeHtml(u.phone||u.email||doc.id)}</div></div>
        </div>`;
      }).join('');
    } catch(err) { sugBox.innerHTML = ''; }
  }, 300);
}

function selectWalletUser(uid, name, phone) {
  _selectedWalletUser = { uid, name, phone };
  const selEl = document.getElementById('wallet-selected-user');
  if (selEl) selEl.innerHTML = `<div class="wallet-user-chip"><div><div class="chip-name">${escapeHtml(name||uid)}</div><div class="chip-sub">${escapeHtml(phone||uid)}</div></div></div>`;
  const sugBox = document.getElementById('wallet-user-suggestions');
  if (sugBox) sugBox.innerHTML = '';
  const inp = document.getElementById('credit-user-search');
  if (inp) inp.value = name || uid;
}

async function addWalletCredit() {
  if (!_selectedWalletUser) { showToast('Please select a user first'); return; }
  const amount = parseFloat(document.getElementById('credit-amount')?.value || '0');
  const reason = document.getElementById('credit-reason')?.value.trim() || 'Admin credit';
  if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }

  try {
    // Get current wallet balance
    const userRef  = db.collection('users').doc(_selectedWalletUser.uid);
    const userSnap = await userRef.get();
    const current  = userSnap.data()?.walletBalance || 0;
    const newBal   = current + amount;

    const txData = {
      userId:       _selectedWalletUser.uid,
      userName:     _selectedWalletUser.name,
      userPhone:    _selectedWalletUser.phone,
      amount,
      type:         'credit',
      category:     'admin_credit',
      title:        reason,
      reason,
      balanceAfter: newBal,
      addedBy:      auth.currentUser?.email || 'admin',
      timestamp:    firebase.firestore.FieldValue.serverTimestamp(),
      createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
    };
    const batch = db.batch();
    // Update user wallet balance
    batch.update(userRef, { walletBalance: newBal, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    // Write to users/{uid}/transactions (Flutter WalletService reads this)
    const txUserRef = userRef.collection('transactions').doc();
    batch.set(txUserRef, txData);
    // Also write to top-level wallet_transactions for admin view
    const txAdminRef = db.collection('wallet_transactions').doc();
    batch.set(txAdminRef, txData);
    // Add notification for user — correct path: patient_notifications/{uid}/items
    const notifRef = db.collection('patient_notifications').doc(_selectedWalletUser.uid).collection('items').doc();
    batch.set(notifRef, {
      title:     '₹' + amount + ' added to your wallet!',
      body:      reason,
      type:      'wallet',
      isRead:    false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      deliverAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();
    showToast(`₹${amount} credited to ${_selectedWalletUser.name || 'user'} ✓`);
    // Reset form
    document.getElementById('credit-user-search').value = '';
    document.getElementById('credit-amount').value = '';
    document.getElementById('credit-reason').value = '';
    document.getElementById('wallet-selected-user').innerHTML = 'No user selected';
    _selectedWalletUser = null;
  } catch (err) {
    showToast('Failed: ' + err.message);
  }
}

// ============================================
//   ENHANCED NOTIFICATION CENTER
// ============================================

// Stores all system notifications (all types merged)
let _sysNotifs      = [];
let _sysUnreadCount = 0;
const _seenSysIds   = new Set(JSON.parse(localStorage.getItem('seenSysNotifs') || '[]'));

function addSystemNotif(type, data) {
  const id = `${type}_${data.id}_${Date.now()}`;
  if (_seenSysIds.has(data.id)) return; // Already seen
  const notif = { _id: id, _type: type, _read: false, _ts: Date.now(), ...data };
  _sysNotifs.unshift(notif);
  _sysNotifs = _sysNotifs.slice(0, 50);
  _sysUnreadCount = _sysNotifs.filter(n => !n._read).length;
  updateNotifBadge();
  renderNotifList();
}

function initNotificationsListener() {
  if (_notifUnsubscribe) _notifUnsubscribe();

  // Watch service_requests for new ones
  _notifUnsubscribe = db.collection('service_requests')
    .orderBy('createdAt', 'desc').limit(50)
    .onSnapshot(snap => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const d = change.doc.data();
          const id = change.doc.id;
          if (!_seenRequestIds.has(id)) {
            addSvcReqNotif(id, d);
          }
        }
      });
      snap.forEach(doc => {
        const d = doc.data();
        if (!_notifications.find(n => n.id === doc.id)) {
          _notifications.unshift({ id: doc.id, ...d, _read: _seenRequestIds.has(doc.id) });
        }
      });
      _notifications = _notifications.slice(0, 50);
      _unreadNotifCount = _notifications.filter(n => !n._read).length;
      updateNotifBadge();
      renderNotifList();
    }, err => console.error('Notif listener error:', err));
}

function addSvcReqNotif(id, d) {
  const notif = {
    id, ...d,
    _read: false,
    _notifType: 'service_request',
  };
  if (!_notifications.find(n => n.id === id)) {
    _notifications.unshift(notif);
    _unreadNotifCount++;
    updateNotifBadge();
    renderNotifList();
  }
}

function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  // Merge service request notifs + system notifs
  const merged = [
    ..._sysNotifs.map(n => ({ ...n, _merged: true })),
    ..._notifications.slice(0, 20).map(n => ({ ...n, _merged: false })),
  ]
  .sort((a, b) => (b._ts || 0) - (a._ts || 0))
  .slice(0, 20);

  if (!merged.length) { list.innerHTML = '<div class="notif-empty">No notifications yet</div>'; return; }

  list.innerHTML = merged.map(n => {
    if (n._merged) {
      // System notification (doctor/appointment/ticket)
      const configs = {
        doctor_reg:  { icon: '👨‍⚕️', bg: '#e8f0fe', fg: '#1a73e8', title: 'New Doctor Registration', sub: `${n.name} — ${n.specialty}` },
        appointment: { icon: '📅', bg: '#e8f5e9', fg: '#2e7d32', title: 'New Appointment', sub: `${n.patient} with Dr. ${n.doctor}` },
        ticket:      { icon: '🎫', bg: '#fff3e0', fg: '#e65100', title: `New ${capitalize(n.priority||'medium')} Ticket`, sub: `${n.user}: ${n.title}` },
      };
      const cfg = configs[n._type] || { icon: '🔔', bg: '#f3e5f5', fg: '#7b1fa2', title: 'System Notification', sub: '' };
      return `<div class="notif-item ${!n._read ? 'notif-unread' : ''}" onclick="handleSysNotifClick('${n._id}','${n._type}','${n.id||''}')">
        <div class="notif-icon" style="background:${cfg.bg};color:${cfg.fg};">${cfg.icon}</div>
        <div class="notif-content">
          <div class="notif-title">${cfg.title}</div>
          <div class="notif-sub">${cfg.sub}</div>
          <div class="notif-time">${timeAgo({ toDate: () => new Date(n._ts) })}</div>
        </div>
        ${!n._read ? '<div class="notif-dot"></div>' : ''}
      </div>`;
    } else {
      // Service request notification
      const tc    = reqTypeColor(n.type);
      const icon  = reqTypeIcon(n.type);
      const label = reqTypeLabel(n.type);
      const time  = n.createdAt ? timeAgo(n.createdAt) : '';
      const isUnread = !n._read;
      return `<div class="notif-item ${isUnread ? 'notif-unread' : ''}" onclick="openRequestFromNotif('${n.id}')">
        <div class="notif-icon" style="background:${tc.bg};color:${tc.fg};">${icon}</div>
        <div class="notif-content">
          <div class="notif-title">New ${label} Request</div>
          <div class="notif-sub">${n.patientName||'Patient'} • ${n.serviceName||label}</div>
          <div class="notif-time">${time}</div>
        </div>
        ${isUnread ? '<div class="notif-dot"></div>' : ''}
      </div>`;
    }
  }).join('');
}

function handleSysNotifClick(nId, type, docId) {
  const n = _sysNotifs.find(x => x._id === nId);
  if (n) { n._read = true; _seenSysIds.add(docId); }
  localStorage.setItem('seenSysNotifs', JSON.stringify([..._seenSysIds]));
  _sysUnreadCount = _sysNotifs.filter(x => !x._read).length;
  _unreadNotifCount = _notifications.filter(n => !n._read).length + _sysUnreadCount;
  updateNotifBadge();
  document.getElementById('notif-panel').style.display = 'none';
  const tabMap = { doctor_reg: 'doctors', appointment: 'appointments', ticket: 'tickets' };
  if (tabMap[type]) switchTab(tabMap[type], { doctors:'Doctors', appointments:'Appointments', tickets:'Support Tickets' }[type]);
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const total = _unreadNotifCount + _sysUnreadCount;
  if (total > 0) { badge.textContent = total > 99 ? '99+' : total; badge.style.display = 'flex'; }
  else badge.style.display = 'none';
}

function markAllNotifsRead() {
  _notifications.forEach(n => { n._read = true; _seenRequestIds.add(n.id); });
  _sysNotifs.forEach(n => { n._read = true; if (n.id) _seenSysIds.add(n.id); });
  localStorage.setItem('seenRequests', JSON.stringify([..._seenRequestIds]));
  localStorage.setItem('seenSysNotifs', JSON.stringify([..._seenSysIds]));
  _unreadNotifCount = 0;
  _sysUnreadCount   = 0;
  updateNotifBadge();
  renderNotifList();
}

// ============================================
//   BROADCAST NOTIFICATIONS
// ============================================

function toggleSpecificUser() {
  const target = document.getElementById('notif-target')?.value;
  const row    = document.getElementById('specific-user-row');
  if (row) row.style.display = target === 'specific_user' ? 'block' : 'none';
}

async function sendBroadcast() {
  const target  = document.getElementById('notif-target')?.value;
  const type    = document.getElementById('notif-type')?.value;
  const title   = document.getElementById('notif-title')?.value.trim();
  const body    = document.getElementById('notif-body')?.value.trim();
  const link    = document.getElementById('notif-link')?.value.trim();
  const userId  = document.getElementById('notif-user-id')?.value.trim();

  if (!title) { showToast('Notification title is required'); return; }
  if (!body)  { showToast('Notification message is required'); return; }
  if (target === 'specific_user' && !userId) { showToast('Enter a user ID or phone'); return; }

  const iconMap = { general:'📢', offer:'🎁', alert:'⚠️', update:'🔔', emergency:'🚨' };

  const broadcastDoc = {
    target, type, title, body,
    link:        link || null,
    icon:        iconMap[type] || '📢',
    sentBy:      auth.currentUser?.email || 'admin',
    sentAt:      firebase.firestore.FieldValue.serverTimestamp(),
    targetUserId: target === 'specific_user' ? userId : null,
    status:       'sent',
  };

  try {
    // Save to broadcasts collection (Cloud Functions / FCM handler can pick this up)
    await db.collection('broadcasts').add(broadcastDoc);

    const now = firebase.firestore.FieldValue.serverTimestamp();
    const notifData = { title, body, type, link: link||null, isRead: false, createdAt: now, deliverAt: now };

    // Write to patient_notifications/{uid}/items  (correct path Flutter reads from)
    if (target === 'all_patients' || target === 'all_users') {
      const usersSnap = await db.collection('users').limit(500).get();
      const batch = db.batch();
      usersSnap.docs.forEach(doc => {
        const notifRef = db.collection('patient_notifications').doc(doc.id).collection('items').doc();
        batch.set(notifRef, notifData);
      });
      await batch.commit();
    }

    // Write to doctor_notifications/{uid}/items  (correct path Doctor app reads from)
    if (target === 'all_doctors' || target === 'all_users') {
      const docsSnap = await db.collection('doctors').where('status', '==', 'active').limit(200).get();
      const batch = db.batch();
      docsSnap.docs.forEach(doc => {
        const notifRef = db.collection('doctor_notifications').doc(doc.id).collection('items').doc();
        batch.set(notifRef, { title, body, type, link: link||null, isRead: false, createdAt: now });
      });
      await batch.commit();
    }

    // Specific user — write to correct path
    if (target === 'specific_user' && userId) {
      await db.collection('patient_notifications').doc(userId).collection('items').add({
        ...notifData,
      });
    }

    showToast(`Notification sent to ${target.replace('_',' ')} ✓`);
    // Reset form
    ['notif-title','notif-body','notif-link','notif-user-id'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    loadBroadcasts();
  } catch (err) {
    showToast('Send failed: ' + err.message);
  }
}

async function loadBroadcasts() {
  const el = document.getElementById('broadcasts-list');
  if (!el) return;
  try {
    const snap = await db.collection('broadcasts').orderBy('sentAt', 'desc').limit(20).get();
    if (snap.empty) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No broadcasts sent yet</p></div>'; return; }
    const iconMap = { general:'📢', offer:'🎁', alert:'⚠️', update:'🔔', emergency:'🚨' };
    const tgLabel = { all_patients:'All Patients', all_doctors:'All Doctors', all_users:'Everyone', specific_user:'Specific User' };
    el.innerHTML = snap.docs.map(doc => {
      const b = doc.data();
      return `<div class="broadcast-item">
        <div class="broadcast-icon" style="background:${b.type==='emergency'?'#fce8e6':'#e8f0fe'};color:${b.type==='emergency'?'#d93025':'#1a73e8'};">${iconMap[b.type]||'📢'}</div>
        <div class="broadcast-content">
          <div class="broadcast-title">${escapeHtml(b.title||'—')}</div>
          <div class="broadcast-sub">${escapeHtml(b.body||'')}</div>
          <div class="broadcast-meta">→ ${tgLabel[b.target]||b.target} · ${formatDate(b.sentAt)} · by ${escapeHtml(b.sentBy||'admin')}</div>
        </div>
      </div>`;
    }).join('');
  } catch(err) { el.innerHTML = '<div class="empty-state"><p>Could not load broadcasts</p></div>'; }
}
