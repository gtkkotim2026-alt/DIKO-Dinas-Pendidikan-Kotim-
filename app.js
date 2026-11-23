'use strict';
/* SIM Disdik — frontend. Semua data diambil dari Google Apps Script (lihat Code.gs). */
const CFG = window.APP_CONFIG || {};
const S = { token: null, user: null, schema: {}, refs: [] };
let V = null, MAP = null, busy = 0;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ROLE = { superadmin: 'Super Admin', admin_dinas: 'Admin Dinas', pimpinan: 'Pimpinan', guru: 'Guru', sekolah: 'Sekolah' };
const COL = { TK: '#f79009', SD: '#1b5fc4', SMP: '#12805c' };
const MENU = [
  { g: 'Utama', items: [
    { id: 'dashboard', t: 'Dashboard', ico: '📊' },
    { id: 'statistik_user', t: 'Statistik Pengguna', ico: '📈' }
  ]},
  { g: 'Data Kepegawaian', items: [
    { id: 'pegawai', t: 'Pegawai Disdik', ico: '👥' },
    { id: 'guru', t: 'Data Guru', ico: '👨‍🏫' },
    { id: 'kepsek', t: 'Data Kepala Sekolah', ico: '👨‍💼' }
  ]},
  { g: 'Satuan Pendidikan', items: [
    { id: 'sekolah', t: 'Data Sekolah', ico: '🏫' },
    { id: 'lokasi', t: 'Lokasi Sekolah', ico: '📍' },
    { id: 'rombel', t: 'Data Rombel', ico: '📚' },
    { id: 'kebutuhan', t: 'Kebutuhan Guru', ico: '📋' }
  ]},
  { g: 'Layanan & Proses', items: [
    { id: 'mutasi', t: 'Mutasi', ico: '🔄' },
    { id: 'mediasi', t: 'Mediasi Perceraian', ico: '⚖️' },
    { id: 'disiplin', t: 'Pembinaan Disiplin', ico: '📝' }
  ]},
  { g: 'Manajemen SK', items: [
    { id: 'sk_pemberhentian', t: 'SK Pemberhentian', ico: '📄' },
    { id: 'sk_mutasi', t: 'SK Mutasi', ico: '🔄' },
    { id: 'sk_definitif', t: 'SK Kepala Sekolah Definitif', ico: '🏆' },
    { id: 'sk_plt', t: 'SK Plt Kepala Sekolah', ico: '⭐' }
  ]},
  { g: 'Manajemen Kepala Sekolah', items: [
    { id: 'periode_kepsek', t: 'Periode Kepala Sekolah', ico: '📅' }
  ]},
  { g: 'Manajemen Pengawas', items: [
    { id: 'pengawas', t: 'Data Pengawas Sekolah', ico: '👨‍🏫' },
    { id: 'wilayah_binaan', t: 'Wilayah Binaan Pengawas', ico: '🗺️' }
  ]},
  { g: 'Administrasi', items: [
    { id: 'pendaftaran', t: 'Pendaftaran Sekolah', ico: '📄' },
    { id: 'penandatangan', t: 'Penandatangan Dokumen', ico: '✍️' },
    { id: 'users', t: 'Pengguna', ico: '👤' }
  ]},
  { id: 'portal_guru', t: 'Portal Guru', ico: '📱' },
  { id: 'tentang', t: 'Tentang Pengembang', ico: '👨‍💻' }
];
const REG = [
  { k: 'npsn', l: 'NPSN (8 karakter)', r: 1 }, { k: 'nama', l: 'Nama Sekolah', r: 1 },
  { k: 'jenjang', l: 'Jenjang', t: 'select', o: ['TK', 'SD', 'SMP'], r: 1 },
  { k: 'status_sekolah', l: 'Status Sekolah', t: 'select', o: ['Negeri', 'Swasta'], r: 1 },
  { k: 'alamat', l: 'Alamat', t: 'textarea', r: 1, full: 1 }, { k: 'kecamatan', l: 'Kecamatan', r: 1 },
  { k: 'no_hp', l: 'No. HP', t: 'tel', r: 1 },
  { k: 'lat', l: 'Latitude (opsional)', t: 'number' }, { k: 'lng', l: 'Longitude (opsional)', t: 'number' },
  { k: 'nama_kepsek', l: 'Nama Kepala Sekolah', r: 1 }, { k: 'nip_kepsek', l: 'NIP Kepala Sekolah' },
  { k: 'email', l: 'Email (opsional)', full: 1 }
];

/* ---------- util ---------- */
function toast(msg, type) {
  const d = document.createElement('div');
  d.textContent = msg; if (type) d.className = type;
  $('#toast').appendChild(d); setTimeout(() => d.remove(), 3500);
}
function setBusy(n) { 
  busy += n; 
  $('#bar').style.display = busy > 0 ? 'block' : 'none';
  const ld = $('#loader');
  if (ld) ld.classList.toggle('show', busy > 0);
}
const _cache = new Map();
const CACHE_TTL = 180000; // 90 detik

async function api(action, payload = {}, skipCache = false) {
  if (!CFG.API_URL || CFG.API_URL.indexOf('GANTI') >= 0) throw new Error('API_URL belum diisi di config.js');

  // Cache hanya untuk aksi list yang aman
  const cacheable = !skipCache && (action === 'list' || action === 'listSK' || action === 'refs');
  const key = cacheable ? action + ':' + JSON.stringify(payload) : null;
  if (key && _cache.has(key)) {
    const c = _cache.get(key);
    if (Date.now() - c.t < CACHE_TTL) return c.data;
  }

  setBusy(1);
  try {
    let res;
    try {
      res = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, token: S.token }, payload)) });
    } catch (e) { throw new Error('Tidak dapat terhubung ke server. Periksa koneksi & URL Web App.'); }
    const j = await res.json();
    if (!j.ok) { if (j.expired) doLogout(true); throw new Error(j.error || 'Terjadi kesalahan'); }
    if (key) _cache.set(key, { t: Date.now(), data: j });
    return j;
  } finally { setBusy(-1); }
}

function clearCache() { _cache.clear(); }
const fmtDate = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : v; };
const refName = npsn => { const s = S.refs.find(x => x.npsn === npsn); return s ? s.nama : (npsn || ''); };
function bcls(v) {
  if (['Disetujui', 'Ditetapkan', 'Selesai', 'Rukun', 'Ya', 'Definitif', 'Ringan'].includes(v)) return 'ok';
  if (['Menunggu', 'Diusulkan', 'Proses', 'Diproses', 'Diverifikasi', 'Dipantau', 'Plt', 'Sedang'].includes(v)) return 'wr';
  if (['Ditolak', 'Berat', 'Tidak', 'Lanjut Izin Cerai'].includes(v)) return 'er';
  return '';
}
function cell(f, v) {
  if (v === '' || v == null) return '<span class="mu">–</span>';
  if (f.t === 'ref') return esc(refName(v));
  if (f.t === 'date') return esc(fmtDate(v));
  if (f.t === 'select') return `<span class="badge ${bcls(v)}">${esc(v)}</span>`;
  return esc(v);
}
function modal(title, body, onSubmit, opt = {}) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<form class="box" novalidate><div class="mh"><b>${esc(title)}</b><button type="button" class="x" aria-label="Tutup">×</button></div><div class="mb">${body}</div><div class="merr" hidden></div><div class="mf"><button type="button" class="btn sec" data-c>${opt.cancel || 'Batal'}</button><button class="btn">${esc(opt.ok || 'Simpan')}</button></div></form>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  $('.x', m).onclick = close; $('[data-c]', m).onclick = close;
  $('form', m).onsubmit = async e => {
    e.preventDefault();
    const form = e.target;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const b = $('.mf .btn:not(.sec)', m); b.disabled = true;
    try { await onSubmit(m); close(); }
    catch (er) { const x = $('.merr', m); x.hidden = false; x.textContent = er.message; b.disabled = false; }
  };
  return m;
}
function inputHTML(f, val, req) {
  const id = 'f_' + f.k, rq = req ? ' required' : '', v = val == null ? '' : val;
  if (f.k === 'foto') {
    return `<input id="${id}_file" type="file" accept="image/*" onchange="previewFoto(this,'prev_${id}')"><input id="${id}" type="hidden" value="${esc(v)}"><div id="prev_${id}" style="margin-top:6px">${v ? `<img src="${esc(v)}" style="width:60px;height:60px;border-radius:50%;object-fit:cover">` : ''}</div>`;
  }
  if (f.t === 'textarea') return `<textarea id="${id}" rows="3"${rq}>${esc(v)}</textarea>`;
  if (f.t === 'select') return `<select id="${id}"${rq}><option value="">— pilih —</option>${f.o.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  if (f.t === 'ref') return `<select id="${id}"${rq}><option value="">— pilih sekolah —</option>${S.refs.map(s => `<option value="${esc(s.npsn)}"${s.npsn === v ? ' selected' : ''}>${esc(s.nama)} (${esc(s.jenjang)}) · ${esc(s.npsn)}</option>`).join('')}</select>`;
  const type = { number: 'number', date: 'date', tel: 'tel', password: 'password' }[f.t] || 'text';
  return `<input id="${id}" type="${type}"${f.t === 'number' ? ' step="any"' : ''}${f.t === 'password' ? ' data-pw autocomplete="new-password"' : ''} value="${esc(v)}"${rq}>`;
}
function previewFoto(inp, prevId) {
  const f = inp.files[0]; if (!f) return;
  const img = new Image();
  const reader = new FileReader();
  reader.onload = async e => { img.src = e.target.result; };
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const max = 200;
    let w = img.width, h = img.height;
    if (w > h) { if (w > max) { h *= max / w; w = max; } }
    else { if (h > max) { w *= max / h; h = max; } }
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const data = canvas.toDataURL('image/jpeg', 0.7);
    $('#' + prevId).innerHTML = `<img src="${data}" style="width:60px;height:60px;border-radius:50%;object-fit:cover">`;
    const hid = inp.id.replace('_file', '');
    $('#' + hid).value = data;
  };
  reader.readAsDataURL(f);
}
function fieldWrap(f, val, req) {
  return `<div id="w_${f.k}" class="${f.t === 'textarea' || f.full ? 'full' : ''}"><label for="f_${f.k}">${esc(f.l)}${req ? ' <i>*</i>' : ''}</label>${inputHTML(f, val, req)}</div>`;
}
function geoBtn() {
  return `<div class="full"><button type="button" class="btn sec sm" id="geo">Gunakan lokasi saya saat ini</button> <span class="mu">atau salin koordinat dari Google Maps (klik kanan pada titik sekolah).</span></div>`;
}
function bindGeo(root) {
  const b = $('#geo', root); if (!b) return;
  b.onclick = () => {
    if (!navigator.geolocation) return toast('Browser tidak mendukung lokasi', 'er');
    navigator.geolocation.getCurrentPosition(p => {
      $('#f_lat', root).value = p.coords.latitude.toFixed(6); $('#f_lng', root).value = p.coords.longitude.toFixed(6);
    }, () => toast('Tidak dapat mengambil lokasi', 'er'), { enableHighAccuracy: true, timeout: 15000 });
  };
}

const SHOWPW = '<label style="font-weight:400;display:flex;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" data-show style="width:auto"> Tampilkan password</label>';
function bindShow(root) {
  const c = $('[data-show]', root); if (!c) return;
  c.onchange = () => $$('[data-pw]', root).forEach(i => { i.type = c.checked ? 'text' : 'password'; });
}

/* ---------- login / daftar ---------- */
function showLogin() {
  S.token = null; S.user = null;
  $('#root').innerHTML = `<div class="auth-modern">
    <div class="auth-left">
      <div class="auth-illustration">
        <div class="logo-big">DIKO</div>
        <p>Sistem Informasi Terintegrasi<br>Tata Kelola Guru & Tenaga Kependidikan</p>
        <p style="margin-top:24px;font-size:13px;opacity:.8">Powered by <strong>Hadvhy Art</strong></p>
      </div>
    </div>
    <div class="auth-right">
      <div class="card authbox">
        <h2>Login</h2>
        <div class="mu">Masukkan username dan password</div>
        <div class="tabs"><button class="on" data-t="l">Masuk</button><button data-t="r">Daftar Sekolah</button><button data-t="g">Daftar Guru</button></div>
        <div id="ab"></div>
      </div>
    </div>
  </div>`;
  $$('.tabs button').forEach(b => b.onclick = () => {
    $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    if (b.dataset.t === 'l') authLogin();
    else if (b.dataset.t === 'r') authReg();
    else authGuru();
  });
  authLogin();
}
function authLogin(info) {
  $('#ab').innerHTML = `${info ? `<div class="msg ok">${esc(info)}</div>` : ''}<form id="lf"><div class="fg">
    <div class="full"><label>Username</label><input id="lu" autocomplete="username" required></div>
    <div class="full"><label>Password</label><input id="lp" type="password" data-pw autocomplete="current-password" required>${SHOWPW}</div></div>
    <div id="le" class="msg" hidden></div><p><button class="btn" style="width:100%">Masuk</button></p>
    <p style="text-align:center"><a href="#" id="fp">Lupa password?</a></p>
    <p class="mu">Sekolah baru? Gunakan tab <b>Daftar Sekolah</b>. Setelah disetujui admin, login memakai NPSN sebagai username.</p></form>`;
  bindShow($('#lf'));
  $('#fp').onclick = e => { e.preventDefault(); authForgot($('#lu').value); };
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const b = $('#lf .btn'); b.disabled = true; $('#le').hidden = true;
    try { const r = await api('login', { username: $('#lu').value, password: $('#lp').value }); S.token = r.token; sessionStorage.setItem('tk', r.token); init(r); }
    catch (er) { $('#le').hidden = false; $('#le').textContent = er.message; b.disabled = false; }
  };
}
function authReg() {
  $('#ab').innerHTML = `<form id="rf" novalidate><div class="fg">${REG.map(f => fieldWrap(f, '', f.r)).join('')}${geoBtn()}
    <div><label for="f_pw">Password <i>*</i></label><input id="f_pw" type="password" data-pw minlength="8" autocomplete="new-password" required></div>
    <div><label for="f_pw2">Ulangi Password <i>*</i></label><input id="f_pw2" type="password" data-pw minlength="8" autocomplete="new-password" required></div><div class="full">${SHOWPW}</div>
    <div class="hp" aria-hidden="true"><input id="f_website" tabindex="-1" autocomplete="off"></div></div>
    <div id="re" class="msg" hidden></div><p><button class="btn" style="width:100%">Kirim Pendaftaran</button></p>
    <p class="mu">Username login = NPSN. Akun aktif setelah diverifikasi admin Disdik.</p></form>`;
  bindGeo($('#rf')); bindShow($('#rf'));
  $('#rf').onsubmit = async e => {
    e.preventDefault(); const f = e.target; if (!f.checkValidity()) { f.reportValidity(); return; }
    const re = $('#re'); re.hidden = true;
    if ($('#f_pw').value !== $('#f_pw2').value) { re.hidden = false; re.textContent = 'Konfirmasi password tidak sama'; return; }
    const data = { password: $('#f_pw').value, website: $('#f_website').value }; REG.forEach(x => data[x.k] = $('#f_' + x.k).value);
    const b = $('.btn', f); b.disabled = true;
    try { await api('register', { data }); $$('.tabs button')[0].click(); authLogin('Pendaftaran terkirim. Tunggu verifikasi admin, lalu masuk dengan NPSN sebagai username.'); }
    catch (er) { re.hidden = false; re.textContent = er.message; b.disabled = false; }
  };
}
function authGuru() {
  $('#ab').innerHTML = `<form id="gf" novalidate>
    <p class="mu">Pendaftaran akun Guru. Masukkan NIP dan Email. Data akan dicocokkan otomatis jika sudah ada di sistem.</p>
    <div class="fg">
      <div class="full"><label>NIP <i>*</i></label><input id="g_nip" required pattern="[0-9]{8,18}" placeholder="NIP (angka)"></div>
      <div class="full"><label>Email <i>*</i></label><input id="g_email" type="email" required></div>
      <div class="full"><label>Foto Profil (opsional)</label><input id="g_foto" type="file" accept="image/*"></div>
      <div><label>Password <i>*</i></label><input id="g_pw" type="password" data-pw minlength="8" required></div>
      <div><label>Ulangi Password <i>*</i></label><input id="g_pw2" type="password" data-pw minlength="8" required></div>
    </div>
    <div id="ge" class="msg" hidden></div>
    <p><button class="btn" style="width:100%">Daftar sebagai Guru</button></p>
  </form>`;
  bindShow($('#gf'));
  $('#gf').onsubmit = async e => {
    e.preventDefault();
    const f = e.target; if (!f.checkValidity()) { f.reportValidity(); return; }
    const ge = $('#ge'); ge.hidden = true;
    if ($('#g_pw').value !== $('#g_pw2').value) { ge.hidden = false; ge.textContent = 'Password tidak sama'; return; }
    const b = $('.btn', f); b.disabled = true;
    try {
      const r = await api('registerGuru', { nip: $('#g_nip').value, email: $('#g_email').value, password: $('#g_pw').value });
      $$('.tabs button')[0].click();
      authLogin(r.pesan || 'Pendaftaran guru berhasil. Login dengan NIP sebagai username.');
    } catch (er) { ge.hidden = false; ge.textContent = er.message; b.disabled = false; }
  };
}

function authForgot(un) {
  $('#ab').innerHTML = `<form id="ff"><p class="mu">Masukkan username Anda (untuk sekolah: NPSN). Kode OTP akan dikirim ke email yang terdaftar pada akun.</p>
    <div><label for="fu">Username</label><input id="fu" value="${esc(un || '')}" autocomplete="username" required></div>
    <div id="fe" class="msg" hidden></div><p><button class="btn" style="width:100%">Kirim Kode OTP</button></p>
    <p style="text-align:center"><a href="#" id="fb">Kembali ke login</a></p></form>`;
  $('#fb').onclick = e => { e.preventDefault(); authLogin(); };
  $('#ff').onsubmit = async e => {
    e.preventDefault(); const b = $('#ff .btn'); b.disabled = true; $('#fe').hidden = true;
    try { const r = await api('requestOtp', { username: $('#fu').value }); authReset($('#fu').value.trim().toLowerCase(), r.pesan); }
    catch (er) { const x = $('#fe'); x.hidden = false; x.textContent = er.message; b.disabled = false; }
  };
}
function authReset(un, info) {
  $('#ab').innerHTML = `<form id="rsf" novalidate><div class="msg ok">${esc(info)}</div><div class="fg">
    <div class="full"><label>Username</label><input value="${esc(un)}" disabled></div>
    <div class="full"><label for="ro">Kode OTP (6 digit)</label><input id="ro" inputmode="numeric" maxlength="6" pattern="\\d{6}" autocomplete="one-time-code" required></div>
    <div><label for="rp1">Password baru (min. 8)</label><input id="rp1" type="password" data-pw minlength="8" autocomplete="new-password" required></div>
    <div><label for="rp2">Ulangi password baru</label><input id="rp2" type="password" data-pw minlength="8" autocomplete="new-password" required></div>
    <div class="full">${SHOWPW}</div></div><div id="rse" class="msg" hidden></div>
    <p><button class="btn" style="width:100%">Atur Password Baru</button></p>
    <p style="text-align:center"><a href="#" id="rb">Kirim ulang kode / kembali</a></p></form>`;
  bindShow($('#rsf'));
  $('#rb').onclick = e => { e.preventDefault(); authForgot(un); };
  $('#rsf').onsubmit = async e => {
    e.preventDefault(); const f = e.target; if (!f.checkValidity()) { f.reportValidity(); return; }
    const er = $('#rse'); er.hidden = true;
    if ($('#rp1').value !== $('#rp2').value) { er.hidden = false; er.textContent = 'Konfirmasi password tidak sama'; return; }
    const b = $('.btn', f); b.disabled = true;
    try { await api('resetPassword', { username: un, otp: $('#ro').value, newPassword: $('#rp1').value }); authLogin('Password berhasil diubah. Silakan masuk dengan password baru.'); }
    catch (x) { er.hidden = false; er.textContent = x.message; b.disabled = false; }
  };
}
async function doLogout(expired) {
  if (!expired && S.token) { try { await api('logout'); } catch (e) {} }
  sessionStorage.removeItem('tk');
  if (MAP) { MAP.remove(); MAP = null; }
  document.body.classList.remove('nav-open');
  showLogin();
  if (expired) toast('Sesi berakhir, silakan masuk kembali', 'er');
}

/* ---------- shell ---------- */
function init(r) {
  S.user = r.user; S.schema = r.schema; S.refs = r.refs;
  $('#root').innerHTML = `<div class="app"><aside id="side">
    <div class="brand">
      <div class="brand-logo">D</div>
      <div class="brand-text">
        <div class="brand-name">DIKO</div>
        <div class="brand-sub" style="font-size:9.5px;line-height:1.35;max-width:180px">Sistem Informasi Terintegrasi untuk Tata Kelola Guru dan Tenaga Kependidikan<br>Dinas Pendidikan Kabupaten Kotawaringin Timur</div>
        <div style="font-size:9px;color:#a78bfa;margin-top:6px;font-weight:600">Versi 1.92.25</div>
      </div>
    </div>
    <div style="padding:12px 14px 16px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;gap:10px">
      <img src="${S.user.foto || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(S.user.nama) + '&background=6366f1&color=fff&size=48'}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.2)" alt="">
      <div>
        <div style="font-weight:600;font-size:13px;color:#fff">${esc(S.user.nama)}</div>
        <div style="font-size:11px;color:#a5b4fc;display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;background:#22c55e;border-radius:50%;display:inline-block"></span> Online</div>
      </div>
    </div>
    <nav id="nav"></nav></aside>
    <div class="main"><header><button class="btn sec sm" id="burger" aria-label="Menu">☰</button><h1 id="ttl"></h1><div class="sp"></div>
    <span class="who"><img src="${S.user.foto || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(S.user.nama) + '&background=1a56db&color=fff&size=32'}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;margin-right:8px;vertical-align:middle" alt="">${esc(S.user.nama)} <span class="badge">${ROLE[S.user.role]}</span></span>
    <button class="btn sec sm" id="pw">Ubah Password</button><button class="btn sec sm" id="out">Keluar</button></header><main id="view"></main></div></div><div id="scrim"></div>`;
  $('#burger').onclick = () => document.body.classList.toggle('nav-open');
  $('#scrim').onclick = () => document.body.classList.remove('nav-open');
  $('#out').onclick = () => doLogout(false);
  $('#pw').onclick = openPw;
  const role = S.user.role;
  const allowed = id => {
    if (id === 'tentang') return true;
    if (role === 'guru') return id === 'portal_guru' || id === 'mutasi' || id === 'mediasi';
    if (role === 'sekolah') return ['dashboard','sekolah','guru','kepsek','lokasi','rombel','kebutuhan','mutasi'].includes(id);
    if (role === 'pimpinan') return ['dashboard','statistik_user','pegawai','sekolah','guru','kepsek','lokasi','rombel','kebutuhan','mutasi','mediasi','disiplin'].includes(id);
    // superadmin & admin_dinas
    if (id.startsWith('sk_')) return true;
    const custom = ['penandatangan','periode_kepsek','pengawas','wilayah_binaan','pendaftaran','users'];
    if (custom.includes(id)) return true;
    return id === 'dashboard' || id === 'statistik_user' || (id === 'lokasi' ? !!S.schema.sekolah : id === 'kebutuhan' ? !!S.schema.rombel : !!S.schema[id]);
  };
  const link = i => `<a href="#/${i.id}" data-id="${i.id}"><span class="nav-ico">${i.ico || '•'}</span><span class="nav-label">${esc(i.t)}</span></a>`;
  $('#nav').innerHTML = MENU.map(m => {
    if (m.g) { const its = m.items.filter(i => allowed(i.id)); return its.length ? `<div class="grp">${esc(m.g)}</div>` + its.map(link).join('') : ''; }
    return allowed(m.id) ? link(m) : '';
  }).join('');
  S.allowed = allowed;
  route();
}
async function route() {
  if (!S.user) return;
  let id = location.hash.replace('#/', '') || 'dashboard';
  if (!S.allowed(id)) id = isGuru ? 'portal_guru' : 'dashboard';
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.id === id));
  document.body.classList.remove('nav-open');
  if (MAP) { MAP.remove(); MAP = null; }
  try { 
    if (id === 'dashboard') await pageDash();
    else if (id === 'portal_guru') await pagePortalGuru();
    else if (id === 'tentang') await pageTentang();
    else if (id === 'lokasi') await pageLokasi();
    else if (id === 'kebutuhan') await pageKebutuhan(); else if (id === 'statistik_user') await pageStatistikUser(); else if (id === 'periode_kepsek') await pagePeriodeKepsek(); else if (id === 'pengawas') await pagePengawas(); else if (id === 'penandatangan') await pagePenandatangan(); else if (id === 'wilayah_binaan') await pageWilayahBinaan();
    else if (id.startsWith('sk_')) await pageSK(id);
    else await pageEntity(id);
  }
  catch (e) { $('#view').innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', route);

function openPw() {
  const m = modal('Ubah Password', `<div class="fg"><div class="full"><label>Password lama</label><input id="p0" type="password" data-pw required></div>
    <div><label>Password baru (min. 8)</label><input id="p1" type="password" data-pw minlength="8" required></div>
    <div><label>Ulangi password baru</label><input id="p2" type="password" data-pw minlength="8" required></div><div class="full">${SHOWPW}</div></div>`, async () => {
    if ($('#p1').value !== $('#p2').value) throw new Error('Konfirmasi password tidak sama');
    await api('changePassword', { oldPassword: $('#p0').value, newPassword: $('#p1').value }); toast('Password diperbarui', 'ok');
  });
  bindShow(m);
}

/* ---------- dashboard ---------- */
async function pagePortalGuru() {
  $('#ttl').textContent = 'Portal Guru';
  $('#view').innerHTML = '<div class="card mu">Memuat profil…</div>';
  // Ambil data guru milik user (asumsi user punya npsn atau nip)
  let guru = null;
  try {
    const all = (await api('list', { entity: 'guru' })).rows;
    guru = all.find(g => g.nip === S.user.username || g.nik === S.user.username || g.nama === S.user.nama) || all[0];
  } catch (e) {}
  const nama = guru?.nama || S.user.nama || 'Guru';
  const nip = guru?.nip || S.user.username || '–';
  const sekolah = refName(guru?.npsn) || S.user.sekolah_nama || '–';
  const foto = guru?.foto || S.user.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(nama)}&background=1a56db&color=fff&size=120`;

  $('#view').innerHTML = `
  <div style="max-width:480px;margin:0 auto">
    <div class="card" style="text-align:center;padding:24px 16px">
      <img src="${esc(foto)}" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:4px solid #e0e7ff" alt="">
      <h2 style="margin:12px 0 4px">${esc(nama)}</h2>
      <div class="mu">NIP ${esc(nip)}</div>
      <div style="margin-top:6px;font-weight:600">${esc(sekolah)}</div>
    </div>
    <div style="margin-top:16px">
      <h3 style="margin:0 0 10px;font-size:16px">Layanan Kepegawaian</h3>
      <div class="card" style="padding:0;overflow:hidden">
        <a href="#/mutasi" style="display:flex;align-items:center;padding:16px;text-decoration:none;color:inherit;border-bottom:1px solid #eee">
          <span style="font-size:24px;margin-right:12px">🔄</span>
          <div><b>Usul Mutasi</b><div class="mu" style="font-size:12px">Ajukan perpindahan tugas</div></div>
        </a>
        <a href="#/mediasi" style="display:flex;align-items:center;padding:16px;text-decoration:none;color:inherit">
          <span style="font-size:24px;margin-right:12px">⚖️</span>
          <div><b>Permohonan Izin Perceraian</b><div class="mu" style="font-size:12px">Ajukan mediasi & izin cerai</div></div>
        </a>
      </div>
    </div>
    <div style="margin-top:16px">
      <h3 style="margin:0 0 10px;font-size:16px">Status Usulan Saya</h3>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9">
          <div><b>Usul Mutasi</b><div class="mu" style="font-size:12px">Status: Sedang Proses</div></div>
          <span class="badge wr">Proses</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0">
          <div><b>Izin Perceraian</b><div class="mu" style="font-size:12px">Status: Rekomendasi Terbit</div></div>
          <button class="btn sm" onclick="cetakRekomDemo()">Cetak Rekom</button>
        </div>
      </div>
    </div>
  </div>`;
}

function cetakRekomDemo() {
  openPrint('Rekomendasi', `<h2>Rekomendasi Izin Perceraian</h2>
    <p>Berdasarkan hasil mediasi, dengan ini diberikan rekomendasi untuk proses izin perceraian atas nama guru yang bersangkutan.</p>
    <div class="sign"><div></div><div>Kepala Dinas,<br><br><br><br><b>${KADIS.nama}</b><br>NIP ${KADIS.nip}</div></div>`);
}

async function pageTentang() {
  $('#ttl').textContent = 'Tentang Pengembang';
  $('#view').innerHTML = `
    <div class="card" style="max-width:720px;margin:0 auto">
      <div style="text-align:center;margin-bottom:20px">
        <div style="width:90px;height:90px;border-radius:50%;background:linear-gradient(135deg,#1a56db,#3b82f6);display:inline-grid;place-items:center;color:#fff;font-size:36px;font-weight:800;margin-bottom:12px">D</div>
        <h2 style="margin:0">DIKO</h2>
        <p class="mu" style="margin:4px 0 0">Sistem Informasi Terintegrasi untuk Tata Kelola Guru dan Tenaga Kependidikan</p>
      </div>
      <h3>Pengembang</h3>
      <p>Aplikasi ini dikembangkan oleh <strong>Haddie Hadvhy</strong>.</p>
      <p style="margin-top:12px;font-size:15px">Powered by <strong>Hadvhy Art</strong></p>
      <dl style="margin-top:16px">
        <dt>Nama</dt><dd>Haddie Hadvhy</dd>
        <dt>Peran</dt><dd>Pengembang Aplikasi</dd>
        <dt>Tahun</dt><dd>2026</dd>
      </dl>
    </div>`;
}

async function pageDash() {
  $('#ttl').textContent = 'Dashboard';
  $('#view').innerHTML = '<div class="card mu">Memuat rekap…</div>';
  try {
    const [sekolah, guru, rombel] = await Promise.all([
      api('list', { entity: 'sekolah' }).then(r => r.rows),
      api('list', { entity: 'guru' }).then(r => r.rows),
      api('list', { entity: 'rombel' }).then(r => r.rows)
    ]);

    const isNegeri = s => String(s.status_sekolah || '').toLowerCase().includes('negeri');
    const jenjangOk = j => ['TK', 'SD', 'SMP'].includes(j);

    const kecSet = new Set();
    sekolah.filter(s => isNegeri(s) && jenjangOk(s.jenjang)).forEach(s => kecSet.add(s.kecamatan || 'Tanpa Kecamatan'));
    const kecamatan = Array.from(kecSet).sort();

    const sekMap = {}, guruMap = {}, pdMap = {};
    kecamatan.forEach(k => {
      sekMap[k] = { TK: 0, SD: 0, SMP: 0 };
      guruMap[k] = { PNS: 0, PPPK: 0, PPPK_Paruh: 0 };
      pdMap[k] = { L: 0, P: 0 };
    });

    // 1. Sekolah Negeri
    sekolah.filter(s => isNegeri(s) && jenjangOk(s.jenjang)).forEach(s => {
      const k = s.kecamatan || 'Tanpa Kecamatan';
      if (sekMap[k]) sekMap[k][s.jenjang]++;
    });

    // 2. Guru PNS/PPPK di sekolah negeri
    const sekByNpsn = Object.fromEntries(sekolah.map(s => [s.npsn, s]));
    guru.forEach(g => {
      const st = String(g.status || '').toLowerCase();
      if (!st.includes('pns') && !st.includes('pppk')) return;
      const sek = sekByNpsn[g.npsn_sekolah];
      if (!sek || !isNegeri(sek) || !jenjangOk(sek.jenjang)) return;
      const k = sek.kecamatan || 'Tanpa Kecamatan';
      if (!guruMap[k]) return;
      if (st.includes('paruh')) guruMap[k].PPPK_Paruh++;
      else if (st.includes('pppk')) guruMap[k].PPPK++;
      else guruMap[k].PNS++;
    });

    // 3. Peserta Didik (dari rombel sekolah negeri)
    rombel.forEach(r => {
      const sek = sekByNpsn[r.npsn_sekolah];
      if (!sek || !isNegeri(sek) || !jenjangOk(sek.jenjang)) return;
      const k = sek.kecamatan || 'Tanpa Kecamatan';
      if (!pdMap[k]) return;
      const jml = Number(r.jumlah_siswa) || 0;
      // Estimasi 50:50 jika tidak ada data gender terpisah
      pdMap[k].L += Math.round(jml / 2);
      pdMap[k].P += jml - Math.round(jml / 2);
    });

    const sum = (map, key) => kecamatan.reduce((t, k) => t + (map[k][key] || 0), 0);

    let h = `<div class="dash-welcome">
      <div><div class="eyebrow">DASHBOARD</div><h2>Rekap Data Pendidikan Negeri</h2><p>Kabupaten Kotawaringin Timur</p></div>
      <div class="dash-date">${kecamatan.length} Kecamatan</div>
    </div>`;

    h += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">
      <div class="card" style="margin:0">
        <h3 style="margin-top:0;color:#1a56db">Jumlah Sekolah Negeri</h3>
        <div class="tw" style="max-height:540px"><table><thead><tr><th>Kecamatan</th><th>TK</th><th>SD</th><th>SMP</th><th>Total</th></tr></thead><tbody>
        ${kecamatan.map(k => `<tr><td>${esc(k)}</td><td>${sekMap[k].TK}</td><td>${sekMap[k].SD}</td><td>${sekMap[k].SMP}</td><td><b>${sekMap[k].TK + sekMap[k].SD + sekMap[k].SMP}</b></td></tr>`).join('')}
        <tr style="font-weight:700;background:#f1f5f9"><td>TOTAL</td><td>${sum(sekMap,'TK')}</td><td>${sum(sekMap,'SD')}</td><td>${sum(sekMap,'SMP')}</td><td>${sum(sekMap,'TK')+sum(sekMap,'SD')+sum(sekMap,'SMP')}</td></tr>
        </tbody></table></div>
      </div>
      <div class="card" style="margin:0">
        <h3 style="margin-top:0;color:#059669">Jumlah Guru PNS/PPPK (Negeri)</h3>
        <div class="tw" style="max-height:540px"><table><thead><tr><th>Kecamatan</th><th>PNS</th><th>PPPK</th><th>PPPK Paruh</th><th>Total</th></tr></thead><tbody>
        ${kecamatan.map(k => `<tr><td>${esc(k)}</td><td>${guruMap[k].PNS}</td><td>${guruMap[k].PPPK}</td><td>${guruMap[k].PPPK_Paruh}</td><td><b>${guruMap[k].PNS+guruMap[k].PPPK+guruMap[k].PPPK_Paruh}</b></td></tr>`).join('')}
        <tr style="font-weight:700;background:#f1f5f9"><td>TOTAL</td><td>${sum(guruMap,'PNS')}</td><td>${sum(guruMap,'PPPK')}</td><td>${sum(guruMap,'PPPK_Paruh')}</td><td>${sum(guruMap,'PNS')+sum(guruMap,'PPPK')+sum(guruMap,'PPPK_Paruh')}</td></tr>
        </tbody></table></div>
      </div>
      <div class="card" style="margin:0">
        <h3 style="margin-top:0;color:#d97706">Jumlah Peserta Didik (Negeri)</h3>
        <div class="tw" style="max-height:540px"><table><thead><tr><th>Kecamatan</th><th>Laki-laki</th><th>Perempuan</th><th>Total</th></tr></thead><tbody>
        ${kecamatan.map(k => `<tr><td>${esc(k)}</td><td>${pdMap[k].L}</td><td>${pdMap[k].P}</td><td><b>${pdMap[k].L + pdMap[k].P}</b></td></tr>`).join('')}
        <tr style="font-weight:700;background:#f1f5f9"><td>TOTAL</td><td>${sum(pdMap,'L')}</td><td>${sum(pdMap,'P')}</td><td>${sum(pdMap,'L')+sum(pdMap,'P')}</td></tr>
        </tbody></table></div>
      </div>
    </div>`;

    // Charts section
    h += `<div style="margin-top:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">
      <div class="card" style="margin:0">
        <h3 style="margin-top:0;color:#1a56db">Grafik Sekolah Negeri</h3>
        <div style="position:relative;height:auto;min-height:280px"><canvas id="chartSekolah"></canvas></div>
      </div>
      <div class="card" style="margin:0">
        <h3 style="margin-top:0;color:#059669">Grafik Guru PNS/PPPK</h3>
        <div style="position:relative;height:auto;min-height:280px"><canvas id="chartGuru"></canvas></div>
      </div>
      <div class="card" style="margin:0">
        <h3 style="margin-top:0;color:#d97706">Grafik Peserta Didik</h3>
        <div style="position:relative;height:auto;min-height:280px"><canvas id="chartPD"></canvas></div>
      </div>
    </div>`;

    $('#view').innerHTML = h;

    // Load Chart.js and render
    if (typeof Chart === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      s.onload = () => renderDashCharts(kecamatan, sekMap, guruMap, pdMap);
      document.head.appendChild(s);
    } else {
      renderDashCharts(kecamatan, sekMap, guruMap, pdMap);
    }
  } catch (e) {
    $('#view').innerHTML = `<div class="card er">Gagal memuat Dashboard: ${esc(e.message)}</div>`;
  }
}


/* ---------- kebutuhan guru: dihitung otomatis dari data rombel ---------- */
const fnum = n => String(Math.round((Number(n) || 0) * 10) / 10).replace('.', ',');
const taNow = () => { const d = new Date(), y = d.getFullYear(), a = d.getMonth() >= 6 ? y : y - 1; return a + '/' + (a + 1); };
const K = { jenjang: 'SD', tahun: '', hitung: 'asn', q: '', st: '', d: null };
const HITUNG = { asn: 'Hanya PNS, PPPK, dan PPPK Paruh Waktu' };
const STFLT = { '': 'Semua status', kurang: 'Ada kekurangan guru', lebih: 'Ada kelebihan guru', sesuai: 'Sudah sesuai', kosong: 'Rombel belum diisi' };
const stOk = (r, f) => !f || (f === 'kurang' && r.kurang > 0) || (f === 'lebih' && r.lebih > 0) || (f === 'sesuai' && r.status === 'Sesuai') || (f === 'kosong' && !r.ada_rombel);
const stBadge = s => `<span class="badge ${{ 'Sesuai': 'ok', 'Kurang': 'er', 'Kurang & Lebih': 'er', 'Lebih': 'wr' }[s] || ''}">${esc(s)}</span>`;
const nK = v => v > 0 ? `<b style="color:var(--er)">${fnum(v)}</b>` : '<span class="mu">0</span>';
const nL = v => v > 0 ? `<b style="color:#b54708">${fnum(v)}</b>` : '<span class="mu">0</span>';
const kStd = k => (K.d && K.d.standar && K.d.standar.kat) ? (K.d.standar.kat.find(x => x.k === k) || { n: k, rumus: '' }) : { n: k, rumus: '' };
const ktitle = () => `Analisis Kebutuhan Guru ${K.jenjang} Negeri — Tahun Ajaran ${K.d.tahun}`;

function renderDashCharts(kecamatan, sekMap, guruMap, pdMap) {
  const labels = kecamatan; // tampilkan semua kecamatan
  const height = Math.max(280, labels.length * 28); // tinggi dinamis

  ['chartSekolah','chartGuru','chartPD'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentElement) el.parentElement.style.height = height + 'px';
  });

  new Chart(document.getElementById('chartSekolah'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'TK', data: labels.map(k => sekMap[k].TK), backgroundColor: '#f79009' },
        { label: 'SD', data: labels.map(k => sekMap[k].SD), backgroundColor: '#1b5fc4' },
        { label: 'SMP', data: labels.map(k => sekMap[k].SMP), backgroundColor: '#12805c' }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } }
    }
  });

  new Chart(document.getElementById('chartGuru'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'PNS', data: labels.map(k => guruMap[k].PNS), backgroundColor: '#1a56db' },
        { label: 'PPPK', data: labels.map(k => guruMap[k].PPPK), backgroundColor: '#059669' },
        { label: 'PPPK Paruh', data: labels.map(k => guruMap[k].PPPK_Paruh), backgroundColor: '#8b5cf6' }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } }
    }
  });

  new Chart(document.getElementById('chartPD'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Laki-laki', data: labels.map(k => pdMap[k].L), backgroundColor: '#3b82f6' },
        { label: 'Perempuan', data: labels.map(k => pdMap[k].P), backgroundColor: '#ec4899' }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } }
    }
  });
}

async function pageStatistikUser() {
  $('#ttl').textContent = 'Statistik Pengguna';
  $('#view').innerHTML = '<div class="card mu">Memuat statistik…</div>';
  try {
    const r = await api('userStats');
    const online = r.online || [];
    const daily = r.daily || [];
    $('#view').innerHTML = `
      <div class="dash-kpis" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
        <div class="kpi-card"><div class="kpi-icon">👤</div><div><b>${online.length}</b><small>Sedang Online</small></div></div>
        <div class="kpi-card"><div class="kpi-icon">📊</div><div><b>${daily.reduce((a,b)=>a+b.login,0)}</b><small>Total Login 7 Hari</small></div></div>
      </div>
      <div class="card">
        <h3>Pengguna Online</h3>
        <div class="tw">${online.length ? `<table><thead><tr><th>Nama</th><th>Role</th><th>Login Terakhir</th></tr></thead><tbody>
          ${online.map(u => `<tr><td>${esc(u.nama)}</td><td>${esc(ROLE[u.role]||u.role)}</td><td>${esc(u.last||'')}</td></tr>`).join('')}
        </tbody></table>` : '<div class="empty">Tidak ada pengguna online saat ini.</div>'}</div>
      </div>
      <div class="card">
        <h3>Grafik Login Harian (7 Hari Terakhir)</h3>
        <div style="height:280px"><canvas id="chartLogin"></canvas></div>
      </div>`;
    if (typeof Chart !== 'undefined') {
      new Chart(document.getElementById('chartLogin'), {
        type: 'line',
        data: {
          labels: daily.map(d => d.date),
          datasets: [{ label: 'Jumlah Login', data: daily.map(d => d.login), borderColor: '#1a56db', backgroundColor: 'rgba(26,86,219,.1)', fill: true, tension: .3 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
      });
    }
  } catch (e) {
    $('#view').innerHTML = `<div class="card er">${esc(e.message)}</div>`;
  }
}

async function pageKebutuhan() {
  $('#ttl').textContent = 'Kebutuhan Guru';
  $('#view').innerHTML = '<div class="card mu">Memuat…</div>';
  await loadK();
}
async function loadK() {
  const d = await api('analisis', { jenjang: K.jenjang, tahun: K.tahun, hitung: K.hitung });
  K.d = d; K.tahun = d.tahun; drawK();
}
const kSafe = async fn => { try { await fn(); } catch (e) { toast(e.message, 'er'); } };

function kList() {
  const q = K.q.toLowerCase();
  const isNegeri = r => {
    if (r.status_sekolah) return String(r.status_sekolah).toLowerCase().includes('negeri');
    const n = (r.nama || '').toUpperCase();
    return /\b(TKN|TK\s*NEGERI|SDN|SD\s*NEGERI|SMPN|SMP\s*NEGERI|NEGERI)\b/.test(n);
  };
  return K.d.rows
    .filter(r => isNegeri(r) && stOk(r, K.st) && (!q || (r.nama + ' ' + r.npsn + ' ' + r.kecamatan).toLowerCase().includes(q)))
    .sort((a, b) => b.kurang - a.kurang || String(a.kecamatan).localeCompare(b.kecamatan) || String(a.nama).localeCompare(b.nama));
}

function drawK() {
  const d = K.d, t = d.total;
  const tabs = ['TK', 'SD', 'SMP'].map(j => `<button class="btn${j === K.jenjang ? '' : ' sec'}" data-j="${j}">${j}</button>`).join(' ');
  if (!d.tahunList.length) {
    $('#view').innerHTML = `<div class="card"><div class="tools">${tabs}</div></div><div class="card"><div class="empty">Belum ada data rombel ${esc(K.jenjang)}. Kebutuhan guru dihitung otomatis dari rombel — isi atau impor dulu di menu <a href="#/rombel"><b>Data Rombel</b></a>.</div></div>`;
    return bindK();
  }
  const kurS = (t.status['Kurang'] || 0) + (t.status['Kurang & Lebih'] || 0), lebS = (t.status['Lebih'] || 0) + (t.status['Kurang & Lebih'] || 0);
  const rekap = d.kategori.map(c => `<tr><td>${esc(c.n)}</td><td class="mu">${esc(c.rumus)}</td><td>${fnum(c.butuh)}</td><td>${fnum(c.ada)}</td><td>${nK(c.kurang)}</td><td>${nL(c.lebih)}</td></tr>`).join('');
  $('#view').innerHTML = `
  <div class="card"><div class="tools">${tabs}
    <select id="kth">${d.tahunList.map(x => `<option${x === d.tahun ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
    <select id="khit" disabled style="opacity:.6">${Object.keys(HITUNG).map(k => `<option value="${k}" selected>${HITUNG[k]}</option>`).join('')}</select>
    <div class="sp"></div>
    <button class="btn sec" id="kp1">Cetak Rekap</button><button class="btn sec" id="kp2">Cetak + Rincian Sekolah</button><button class="btn sec" id="kcsv">Ekspor CSV</button></div>
    <p class="mu" style="margin:10px 0 0">${esc(ktitle())} · Hanya sekolah negeri · Hanya guru status PNS, PPPK, dan PPPK Paruh Waktu</p></div>
  <div class="cards">
    <div class="stat"><b>${t.sekolah_rombel}<small class="mu"> / ${t.sekolah}</small></b>Sekolah (ada rombel / seluruhnya)</div>
    <div class="stat"><b>${t.rombel}</b>Rombel · ${t.siswa} siswa</div>
    <div class="stat"><b>${fnum(t.butuh)}</b>Guru dibutuhkan</div>
    <div class="stat"><b>${fnum(t.ada)}</b>Guru tersedia</div>
    <div class="stat"><b style="color:var(--er)">${fnum(t.kurang)}</b>KEKURANGAN guru</div>
    <div class="stat"><b style="color:#b54708">${fnum(t.lebih)}</b>KELEBIHAN guru</div>
  </div>
  <div class="card"><p style="margin:0">Sekolah kurang guru: <b>${kurS}</b> · kelebihan guru: <b>${lebS}</b> · sudah sesuai: <b>${t.status['Sesuai'] || 0}</b> · rombel belum diisi: <b>${t.status['Rombel belum diisi'] || 0}</b></p>
    <p class="mu" style="margin:6px 0 0"><b>Kurang</b> = guru yang ada lebih sedikit dari kebutuhan. <b>Lebih</b> = guru yang ada melebihi kebutuhan. Dihitung per jenis guru, jadi kelebihan satu jenis tidak menutup kekurangan jenis lain.</p></div>
  <div class="card"><h3 style="margin-top:0">Rekap per jenis guru</h3><div class="tw"><table><thead><tr><th>Jenis guru</th><th>Cara menghitung (per sekolah)</th><th>Dibutuhkan</th><th>Ada</th><th>Kurang</th><th>Lebih</th></tr></thead><tbody>${rekap}</tbody></table></div>
    <details style="margin-top:10px"><summary><b>Bagaimana cara menghitungnya?</b></summary>
      <ol class="mu">
        <li>Kebutuhan dihitung dari <b>jumlah rombel</b> tiap sekolah (menu Data Rombel) dengan rumus pada tabel di atas. Beban 1 guru = <b>${d.standar.beban} jam tatap muka</b> per minggu.</li>
        <li>Hasil hitung dibulatkan ke angka terdekat; jenis guru yang diperlukan minimal <b>1 orang</b>.</li>
        <li>Guru yang ada diambil dari <b>Data Guru</b> sekolah tersebut, dikelompokkan dari isian <i>Mata Pelajaran</i>. Guru yang mengampu beberapa mapel dibagi rata.</li>
        <li>Dasar: Juknis Peraturan Bersama 5 Menteri (2011) tentang penataan dan pemerataan guru PNS. Jam pelajaran dan standar TK dapat disesuaikan oleh pengelola aplikasi.</li>
      </ol></details></div>
  <div class="card"><div class="tools"><input id="kq" placeholder="Cari sekolah / NPSN / kecamatan…" value="${esc(K.q)}">
    <select id="kst">${Object.keys(STFLT).map(k => `<option value="${k}"${k === K.st ? ' selected' : ''}>${STFLT[k]}</option>`).join('')}</select></div>
    <div id="ktbl"></div></div>`;
  bindK(); drawKT();
}

function kRowHTML(r, i, print) {
  const st = print ? `<span class="${r.kurang > 0 ? 'k' : r.lebih > 0 ? 'l' : ''}">${esc(r.status)}</span>` : stBadge(r.status);
  const k = print ? (r.kurang > 0 ? `<span class="k">${fnum(r.kurang)}</span>` : '0') : nK(r.kurang);
  const l = print ? (r.lebih > 0 ? `<span class="l">${fnum(r.lebih)}</span>` : '0') : nL(r.lebih);
  const num = v => r.ada_rombel ? v : '–';
  return `<tr><td>${i + 1}</td><td>${esc(r.nama)}<br><span class="${print ? 'note' : 'mu'}">${esc(r.npsn)}</span></td><td>${esc(r.kecamatan)}</td><td>${r.rombel}</td><td>${r.siswa}</td><td>${num(r.butuh)}</td><td>${fnum(r.ada)}</td><td>${r.ada_rombel ? k : '–'}</td><td>${r.ada_rombel ? l : '–'}</td><td>${st}</td>${print ? '' : `<td><button class="btn sm sec" data-n="${esc(r.npsn)}">Rincian</button></td>`}</tr>`;
}
const kHead = print => `<thead><tr><th>No</th><th>Sekolah</th><th>Kecamatan</th><th>Rombel</th><th>Siswa</th><th>Dibutuhkan</th><th>Ada</th><th>Kurang</th><th>Lebih</th><th>Status</th>${print ? '' : '<th></th>'}</tr></thead>`;
function drawKT() {
  const list = kList();
  $('#ktbl').innerHTML = list.length
    ? `<p class="mu" style="margin:0 0 8px">${list.length} sekolah</p><div class="tw" style="max-height:560px"><table>${kHead(false)}<tbody>${list.map((r, i) => kRowHTML(r, i, false)).join('')}</tbody></table></div>`
    : '<div class="empty">Tidak ada sekolah yang cocok.</div>';
}
function bindK() {
  $$('[data-j]').forEach(b => b.onclick = () => kSafe(async () => { K.jenjang = b.dataset.j; K.tahun = ''; K.q = ''; K.st = ''; await loadK(); }));
  const on = (id, ev, fn) => { const e = $(id); if (e) e[ev] = fn; };
  on('#kth', 'onchange', e => kSafe(async () => { K.tahun = e.target.value; await loadK(); }));
  on('#khit', 'onchange', e => kSafe(async () => { K.hitung = e.target.value; await loadK(); }));
  on('#kq', 'oninput', e => { K.q = e.target.value; drawKT(); });
  on('#kst', 'onchange', e => { K.st = e.target.value; drawKT(); });
  on('#kp1', 'onclick', () => printK(false));
  on('#kp2', 'onclick', () => printK(true));
  on('#kcsv', 'onclick', exportK);
  on('#ktbl', 'onclick', e => { const b = e.target.closest('[data-n]'); if (b) openKDetail(b.dataset.n); });
}

function kSel(a, b, print) {
  const s = Math.round((a - b) * 10) / 10;
  if (s < 0) return print ? `<span class="k">Kurang ${fnum(-s)}</span>` : `<span class="badge er">Kurang ${fnum(-s)}</span>`;
  if (s > 0) return print ? `<span class="l">Lebih ${fnum(s)}</span>` : `<span class="badge wr">Lebih ${fnum(s)}</span>`;
  return print ? 'Sesuai' : '<span class="badge ok">Sesuai</span>';
}
function kDetail(r, print) {
  if (!r.ada_rombel) return `<p>Data rombel sekolah ini belum diisi untuk tahun ajaran ${esc(K.d.tahun)}, sehingga kebutuhan belum dapat dihitung.</p>`;
  const kur = r.detail.filter(x => x.kurang > 0).map(x => `${esc(kStd(x.k).n)} ${fnum(x.kurang)}`);
  const leb = r.detail.filter(x => x.lebih > 0).map(x => `${esc(kStd(x.k).n)} ${fnum(x.lebih)}`);
  let h = `<p>Sekolah ini memiliki <b>${r.rombel} rombel</b> (${r.siswa} siswa). Dibutuhkan <b>${r.butuh} guru</b>, tersedia <b>${fnum(r.ada)}</b> guru.`
    + (kur.length ? ` <b>Kurang:</b> ${kur.join(', ')}.` : '') + (leb.length ? ` <b>Lebih:</b> ${leb.join(', ')}.` : '')
    + (!kur.length && !leb.length ? ' Jumlah guru sudah sesuai kebutuhan.' : '') + '</p>';
  if (K.jenjang === 'SMP' && !r.siswa) h += '<p class="mu">Catatan: jumlah siswa belum terisi di Data Rombel, sehingga kebutuhan guru BK belum terhitung.</p>';
  if (r.lain > 0) h += `<p class="mu">Catatan: ${fnum(r.lain)} guru belum dapat dikelompokkan (isian Mata Pelajaran kosong/tidak dikenali) sehingga tidak masuk perhitungan. Periksa di Data Guru.</p>`;
  h += `<div class="tw"><table><thead><tr><th>Jenis guru</th><th>Cara menghitung</th><th>Hasil hitung</th><th>Dibutuhkan</th><th>Ada</th><th>Selisih</th></tr></thead><tbody>${r.detail.map(x => `<tr><td>${esc(kStd(x.k).n)}</td><td>${esc(kStd(x.k).rumus)}</td><td>${fnum(Math.round(x.des * 100) / 100).replace(/^(\d+)$/, '$1')}</td><td>${x.butuh}</td><td>${fnum(x.ada)}</td><td>${kSel(x.ada, x.butuh, print)}</td></tr>`).join('')}</tbody></table></div>`;
  return h;
}
function openKDetail(npsn) {
  const r = K.d.rows.find(x => x.npsn === npsn); if (!r) return;
  const m = modal(r.nama, `<p class="mu" style="margin-top:0">NPSN ${esc(r.npsn)} · ${esc(r.kecamatan)} · TA ${esc(K.d.tahun)}</p>${kDetail(r, false)}<div style="margin-top:12px"><button type="button" class="btn sec" id="kdp">Cetak rincian sekolah ini</button></div>`, async () => {}, { ok: 'Tutup' });
  $('#kdp', m).onclick = () => printDoc('Rincian Kebutuhan Guru — ' + r.nama, `<h1>RINCIAN KEBUTUHAN GURU</h1><div class="sub">${esc(r.nama)} · NPSN ${esc(r.npsn)} · ${esc(r.kecamatan)}<br>Tahun Ajaran ${esc(K.d.tahun)} · Hanya PNS/PPPK/PPPK Paruh Waktu</div>${kDetail(r, true)}${kSign()}`, false);
}

/* ---------- cetak & ekspor ---------- */
function printDoc(title, body, land = true) {
  const w = window.open('', '_blank');
  if (!w) return toast('Pop-up diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.', 'er');
  w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:A4 ${land ? 'landscape' : 'portrait'};margin:12mm}*{box-sizing:border-box}
body{font:12px/1.45 Arial,Helvetica,sans-serif;color:#111;margin:0}
h1{font-size:16px;margin:0 0 2px;text-align:center}h2{font-size:13px;margin:14px 0 4px}
.sub{text-align:center;margin:0 0 10px;color:#333}
table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid #444;padding:4px 6px;vertical-align:top;text-align:left}
th{background:#e9edf3}thead{display:table-header-group}tr{page-break-inside:avoid}
.box{display:flex;gap:8px;margin:8px 0}.box div{flex:1;border:1px solid #444;padding:6px;text-align:center}.box b{display:block;font-size:18px}
.k{color:#b42318;font-weight:bold}.l{color:#b54708;font-weight:bold}.note,.mu{font-size:11px;color:#444}
.blk{page-break-inside:avoid;margin-top:12px}.ttd{margin:26px 0 0 auto;width:260px;text-align:center;page-break-inside:avoid}
</style></head><body>${body}</body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => w.print(), 400);
}
const kSign = () => `<div class="ttd">............................., ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br>Mengetahui,<br>Kepala Dinas Pendidikan<br><br><br><br>(................................)</div>`;
function printK(detail) {
  const d = K.d, t = d.total, list = kList();
  let b = `<h1>ANALISIS KEBUTUHAN GURU ${esc(K.jenjang)}</h1><div class="sub">Tahun Ajaran ${esc(d.tahun)} · Hanya guru status PNS, PPPK, dan PPPK Paruh Waktu${K.st || K.q ? '<br>Daftar dibatasi sesuai filter: ' + esc(STFLT[K.st]) + (K.q ? ' · “' + esc(K.q) + '”' : '') : ''}</div>
  <div class="box"><div><b>${t.sekolah_rombel}/${t.sekolah}</b>Sekolah (ada rombel)</div><div><b>${t.rombel}</b>Rombel</div><div><b>${fnum(t.butuh)}</b>Dibutuhkan</div><div><b>${fnum(t.ada)}</b>Tersedia</div><div><b class="k">${fnum(t.kurang)}</b>Kekurangan</div><div><b class="l">${fnum(t.lebih)}</b>Kelebihan</div></div>
  <h2>Rekap per jenis guru</h2><table><thead><tr><th>Jenis guru</th><th>Cara menghitung (per sekolah)</th><th>Dibutuhkan</th><th>Ada</th><th>Kurang</th><th>Lebih</th></tr></thead><tbody>${d.kategori.map(c => `<tr><td>${esc(c.n)}</td><td>${esc(c.rumus)}</td><td>${fnum(c.butuh)}</td><td>${fnum(c.ada)}</td><td>${c.kurang > 0 ? `<span class="k">${fnum(c.kurang)}</span>` : 0}</td><td>${c.lebih > 0 ? `<span class="l">${fnum(c.lebih)}</span>` : 0}</td></tr>`).join('')}</tbody></table>
  <p class="note">Beban 1 guru = ${d.standar.beban} jam tatap muka/minggu. Hasil hitung dibulatkan ke angka terdekat (minimal 1). Selisih dihitung per jenis guru. Dasar: Juknis Peraturan Bersama 5 Menteri (2011).</p>
  <h2>Daftar sekolah (${list.length})</h2><table>${kHead(true)}<tbody>${list.map((r, i) => kRowHTML(r, i, true)).join('')}</tbody></table>`;
  if (detail) b += `<h2 style="page-break-before:always">Rincian per sekolah</h2>` + list.filter(r => r.ada_rombel).map(r => `<div class="blk"><b>${esc(r.nama)}</b> <span class="note">NPSN ${esc(r.npsn)} · ${esc(r.kecamatan)}</span>${kDetail(r, true)}</div>`).join('');
  printDoc(ktitle(), b + kSign(), true);
}
function exportK() {
  const std = (K.d && K.d.standar && K.d.standar.kat) ? K.d.standar.kat : [];
  const head = ['NPSN', 'Sekolah', 'Kecamatan', 'Rombel', 'Siswa', 'Dibutuhkan', 'Ada', 'Kurang', 'Lebih', 'Status'];
  std.forEach(c => head.push(c.n + ' (dibutuhkan)', c.n + ' (ada)'));
  const lines = [head.map(q).join(',')];
  kList().forEach(r => {
    const row = [r.npsn, r.nama, r.kecamatan, r.rombel, r.siswa, r.ada_rombel ? r.butuh : '', r.ada, r.kurang, r.lebih, r.status];
    r.detail.forEach(x => row.push(r.ada_rombel ? x.butuh : '', x.ada));
    lines.push(row.map(q).join(','));
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `kebutuhan-guru-${K.jenjang}-${K.d.tahun.replace('/', '-')}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

/* ---------- halaman data generik ---------- */

function addSearchPrint(containerId, tableSelector) {
  const tools = document.querySelector(containerId + ' .tools') || document.querySelector('.tools');
  if (!tools || tools.querySelector('.search-box')) return;
  const box = document.createElement('div');
  box.className = 'search-box';
  box.style.cssText = 'display:flex;gap:8px;align-items:center';
  box.innerHTML = `<input id="tblSearch" placeholder="Cari..." style="padding:6px 10px;border:1px solid var(--bd);border-radius:8px;width:180px">
    <button class="btn sm sec" id="tblPrint">Cetak</button>`;
  tools.prepend(box);
  const input = box.querySelector('#tblSearch');
  const printBtn = box.querySelector('#tblPrint');
  input.oninput = () => {
    const q = input.value.toLowerCase();
    document.querySelectorAll(tableSelector + ' tbody tr').forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  };
  printBtn.onclick = () => {
    const rows = [...document.querySelectorAll(tableSelector + ' tbody tr')].filter(tr => tr.style.display !== 'none');
    const win = window.open('', '_blank');
    const title = document.getElementById('ttl').textContent;
    win.document.write(`<html><head><title>${title}</title><style>body{font-family:Arial;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:5px}</style></head><body><h2>${title}</h2><table>${document.querySelector(tableSelector).innerHTML}</table></body></html>`);
    win.document.close();
    win.print();
  };
}

async function pageSK(id) {
  const titles = {
    sk_pemberhentian: 'SK Pemberhentian',
    sk_mutasi: 'SK Mutasi',
    sk_definitif: 'SK Kepala Sekolah Definitif',
    sk_plt: 'SK Plt Kepala Sekolah'
  };
  $('#ttl').textContent = titles[id] || 'SK';
  $('#view').innerHTML = '<div class="card mu">Memuat data SK…</div>';

  let skList = [];
  try {
    const r = await api('listSK', { jenis: id });
    skList = r.rows || [];
  } catch (e) {
    skList = [];
  }

  const html = `<div class="card">
    <div class="tools">
      <div class="sp"></div>
      <button class="btn sec" id="cetakSK">Cetak Laporan</button>
      <button class="btn" id="addSK">+ Input SK Baru</button>
    </div>
    ${skList.length ? `<div class="tw"><table><thead><tr>
      <th>No</th><th>${id === 'sk_plt' ? 'Nama Plt. Kepala Sekolah' : 'Nama Kepala Sekolah'}</th><th>${id === 'sk_plt' ? 'Sekolah yang Dipimpin' : 'Sekolah Penugasan'}</th><th>Nomor SK</th><th>Tanggal SK</th><th>TMT SK</th><th>Status</th><th>Aksi</th>
    </tr></thead><tbody>
    ${skList.map((r, i) => `<tr>
      <td>${i+1}</td>
      <td>${esc(r.nama || '–')}</td>
      <td>${esc(r.sekolah || '–')}</td>
      <td>${esc(r.no_sk || '–')}</td>
      <td>${esc((r.tgl_sk||'').toString().slice(0,10))}</td>
      <td>${esc((r.tmt||'').toString().slice(0,10))}</td>
      <td><span class="badge ${r.file_name ? 'ok' : 'wr'}">${r.file_name ? 'Dokumen Ada' : 'Belum Upload'}</span></td>
      <td class="act">
        ${r.file_name ? '' : `<button class="btn sm" data-upload="${esc(r.id)}">Upload SK</button>`}
        ${r.file_name ? `<button class="btn sm sec" data-view="${esc(r.id)}">Lihat SK</button>` : ''}
        <button class="btn sm sec" data-edit="${esc(r.id)}">Ubah</button>
        <button class="btn sm dan" data-del="${esc(r.id)}">Hapus</button>
      </td>
    </tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">Belum ada dokumen SK yang diinput untuk jenis ini.</div>'}
  </div>`;
  $('#view').innerHTML = html;
  addSearchPrint('#view', '#view table');

  $('#addSK').onclick = () => openSKForm(id, null);
  $('#cetakSK').onclick = () => cetakLaporanSK(id, skList);
  $('#view').onclick = async e => {
    const up = e.target.closest('[data-upload]');
    const del = e.target.closest('[data-del]');
    const view = e.target.closest('[data-view]');
    if (up) {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.pdf';
      input.onchange = () => {
        const f = input.files[0];
        if (!f) return;
        if (f.size > 1024*1024) return toast('File PDF maksimal 1 MB', 'er');
        const reader = new FileReader();
        reader.onload = () => {
          const url = reader.result;
          const preview = modal('Preview Dokumen SK', `
            <p><b>${esc(f.name)}</b> (${Math.round(f.size/1024)} KB)</p>
            <iframe src="${url}" style="width:100%;height:420px;border:1px solid var(--bd);border-radius:8px"></iframe>
          `, async () => {
            const base64 = url.split(',')[1];
            try {
              await api('uploadSKFile', { id: up.dataset.upload, file_name: f.name, file_base64: base64 });
              toast('Dokumen SK berhasil diunggah', 'ok');
              pageSK(id);
            } catch (err) {
              toast('Gagal upload: ' + err.message + '. Pastikan Code.gs sudah di-deploy ulang (New version) dan file tidak terlalu besar.', 'er');
            }
          }, { ok: 'Upload', cancel: 'Batal' });
        };
        reader.readAsDataURL(f);
      };
      input.click();
    }
    if (del && confirm('Hapus data SK ini?')) {
      await api('deleteSK', { id: del.dataset.del, jenis: id });
      clearCache(); toast('Data dihapus', 'ok');
      pageSK(id);
    }
    if (view) {
      const rec = skList.find(x => x.id === view.dataset.view);
      if (rec && rec.file_url) {
        window.open(rec.file_url, '_blank');
      } else {
        toast('Dokumen belum tersedia atau belum diunggah', 'wr');
      }
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) {
      const rec = skList.find(x => x.id === edit.dataset.edit);
      if (rec) openEditSK(id, rec);
    }
  };
}



function openEditSK(jenis, rec) {
  if (!rec) return toast('Data tidak ditemukan', 'er');
  const isPlt = jenis === 'sk_plt';
  const html = `
    <div class="fg">
      <div class="full"><label>Nama PTK (tidak dapat diubah)</label>
        <input value="${esc(rec.nama || '–')}" disabled style="background:#f1f5f9;font-weight:600">
      </div>
      <div><label>${isPlt ? 'Sekolah yang Dipimpin' : 'Sekolah Penugasan'}</label>
        <select id="ed_sekolah">${S.refs.map(s => `<option value="${esc(s.npsn)}"${s.npsn===rec.sekolah_npsn?' selected':''}>${esc(s.nama)}</option>`).join('')}</select>
      </div>
      <div><label>Nomor SK</label><input id="ed_no" value="${esc(rec.no_sk||'')}" required></div>
      <div><label>Tanggal SK</label><input id="ed_tgl" type="date" value="${esc((rec.tgl_sk||'').toString().slice(0,10))}" required></div>
      <div><label>TMT</label><input id="ed_tmt" type="date" value="${esc((rec.tmt||'').toString().slice(0,10))}" required></div>
      <div class="full"><label>Pejabat yang Menetapkan</label><input id="ed_pejabat" value="${esc(rec.pejabat||'')}" required></div>
      <div class="full"><label>Keterangan</label><textarea id="ed_ket" rows="2">${esc(rec.keterangan||'')}</textarea></div>
      <div class="full"><label>Dokumen SK (opsional — kosongkan jika tidak ingin mengubah)</label>
        <input id="ed_file" type="file" accept=".pdf">
        ${rec.file_name ? `<div class="mu" style="margin-top:4px">Dokumen saat ini: ${esc(rec.file_name)}</div>` : '<div class="mu">Belum ada dokumen</div>'}
      </div>
    </div>
    <p class="mu">Nama PTK tidak dapat diubah. Dokumen SK bisa diganti atau dibiarkan.</p>`;

  const m = modal('Ubah Data SK', html, async (mm) => {
    const data = {
      id: rec.id,
      jenis: jenis,
      no_sk: $('#ed_no', m).value,
      tgl_sk: $('#ed_tgl', m).value,
      tmt: $('#ed_tmt', m).value,
      pejabat: $('#ed_pejabat', m).value,
      sekolah: $('#ed_sekolah', m).value,
      keterangan: $('#ed_ket', m).value
    };
    const fileInput = $('#ed_file', m);
    if (fileInput && fileInput.files[0]) {
      const f = fileInput.files[0];
      if (f.size > 1024*1024) throw new Error('File maksimal 1 MB');
      const base64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(f); });
      data.file_name = f.name;
      data.file_base64 = base64;
    }
    await api('updateSK', data);
    toast('Data SK berhasil diubah', 'ok');
    pageSK(jenis);
  }, { ok: 'Simpan Perubahan' });
  setTimeout(() => {
    const sel = document.querySelector('#ed_sekolah');
    if (sel && !sel.dataset.searchable) makeSearchableSelect(sel, 'Ketik nama sekolah…');
  }, 200);
}

function makeSearchableSelect(selectEl, placeholder) {
  if (!selectEl || selectEl.dataset.searchable) return;
  selectEl.dataset.searchable = '1';
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(selectEl);
  selectEl.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder || 'Ketik untuk mencari…';
  input.style.width = '100%';
  input.className = 'searchable-input';
  if (selectEl.selectedIndex > 0) input.value = selectEl.options[selectEl.selectedIndex].text;
  wrapper.insertBefore(input, selectEl);

  const list = document.createElement('div');
  list.className = 'searchable-list tw';
  list.style.cssText = 'position:absolute;z-index:50;background:#fff;border:1px solid var(--bd);border-radius:8px;max-height:220px;overflow:auto;width:100%;display:none;box-shadow:var(--shadow)';
  wrapper.appendChild(list);

  const options = [...selectEl.options].map(o => ({ value: o.value, text: o.text }));

  function render(q) {
    const ql = (q || '').toLowerCase();
    const filtered = options.filter(o => o.value && o.text.toLowerCase().includes(ql));
    list.innerHTML = filtered.slice(0, 50).map(o => `<div data-v="${esc(o.value)}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9">${esc(o.text)}</div>`).join('') || '<div style="padding:8px 12px;color:var(--mu)">Tidak ditemukan</div>';
    list.style.display = filtered.length || q ? 'block' : 'none';
  }

  input.oninput = () => render(input.value);
  input.onfocus = () => render(input.value);
  list.onclick = e => {
    const d = e.target.closest('[data-v]');
    if (!d) return;
    selectEl.value = d.dataset.v;
    input.value = d.textContent;
    list.style.display = 'none';
    selectEl.dispatchEvent(new Event('change'));
  };
  document.addEventListener('click', e => {
    if (!wrapper.contains(e.target)) list.style.display = 'none';
  });
}

function openSKForm(jenis, guru, editRec) {
  const titles = {
    sk_pemberhentian: 'Input SK Pemberhentian',
    sk_mutasi: 'Input SK Mutasi',
    sk_definitif: 'Input SK Kepala Sekolah Definitif',
    sk_plt: 'Input SK Plt. Kepala Sekolah'
  };

  let fields = '';
  if (jenis === 'sk_pemberhentian') {
    fields = `
      <div class="fg">
        <div class="full"><label>Nama PTK</label><select id="sk_ptk" required>${S.refs.map(s=>'').join('')}</select></div>
        <div><label>Jenis Pemberhentian</label><select id="sk_jenis" required>
          <option>Pemberhentian dari jabatan Kepala Sekolah</option>
          <option>Pemberhentian dari tugas tambahan</option>
          <option>Pemberhentian dari penugasan pada satuan pendidikan</option>
          <option>Pemberhentian sebagai guru/tenaga kependidikan</option>
          <option>Pemberhentian karena pensiun atau sebab lain</option>
        </select></div>
        <div><label>Alasan Pemberhentian</label><select id="sk_alasan" required>
          <option>Masa penugasan berakhir</option>
          <option>Pengangkatan pejabat/pengganti</option>
          <option>Permohonan sendiri</option>
          <option>Pensiun</option>
          <option>Meninggal dunia</option>
          <option>Penataan organisasi</option>
          <option>Hukuman disiplin</option>
          <option>Lainnya</option>
        </select></div>
        <div><label>Nomor SK</label><input id="sk_no" required></div>
        <div><label>Tanggal SK</label><input id="sk_tgl" type="date" required></div>
        <div><label>TMT Pemberhentian</label><input id="sk_tmt" type="date" required></div>
        <div class="full"><label>Pejabat yang Menetapkan</label><input id="sk_pejabat" required></div>
        <div class="full"><label>Keterangan</label><textarea id="sk_ket" rows="2"></textarea></div>
        <div class="full"><label>Upload SK (PDF) — opsional, bisa diunggah nanti</label><input id="sk_file" type="file" accept=".pdf"></div>
      </div>`;
  } else if (jenis === 'sk_mutasi') {
    fields = `
      <div class="fg">
        <div class="full"><label>Nama PTK</label><select id="sk_ptk" required></select></div>
        <div><label>Sekolah Tujuan</label><select id="sk_tujuan" required>${S.refs.map(s => `<option value="${esc(s.npsn)}">${esc(s.nama)} (${esc(s.jenjang)})</option>`).join('')}</select></div>
        <div><label>Jenis Mutasi</label><select id="sk_jenis" required>
          <option>Antar sekolah dalam satu kecamatan</option>
          <option>Antar kecamatan</option>
          <option>Mutasi masuk</option>
          <option>Mutasi keluar</option>
          <option>Lainnya</option>
        </select></div>
        <div><label>Alasan Mutasi</label><select id="sk_alasan" required>
          <option>Permohonan sendiri</option>
          <option>Kebutuhan organisasi</option>
          <option>Pemerataan guru</option>
          <option>Penataan tenaga pendidik</option>
          <option>Mengikuti pasangan</option>
          <option>Lainnya</option>
        </select></div>
        <div><label>Nomor SK</label><input id="sk_no" required></div>
        <div><label>Tanggal SK</label><input id="sk_tgl" type="date" required></div>
        <div><label>TMT Mutasi</label><input id="sk_tmt" type="date" required></div>
        <div class="full"><label>Pejabat yang Menetapkan</label><input id="sk_pejabat" required></div>
        <div class="full"><label>Upload SK (PDF) — opsional, bisa diunggah nanti</label><input id="sk_file" type="file" accept=".pdf"></div>
      </div>`;
  } else if (jenis === 'sk_definitif' || jenis === 'sk_plt') {
    const isPlt = jenis === 'sk_plt';
    fields = `
      <div class="fg">
        <div><label>Nama PTK</label>
          <div style="display:flex;gap:6px">
            <select id="sk_ptk_add" style="flex:1"></select>
            <button type="button" class="btn sm" id="addPtk">+ Tambah</button>
          </div>
        </div>
        <div><label>${isPlt ? 'Sekolah yang Dipimpin sebagai Plt.' : 'Sekolah Penugasan'}</label><select id="sk_sekolah" required>${S.refs.map(s => `<option value="${esc(s.npsn)}">${esc(s.nama)}</option>`).join('')}</select></div>
        <div class="full" id="ptkList" style="border:1px solid var(--bd);border-radius:8px;padding:8px;min-height:36px;margin-top:4px"></div>
        <div class="full" id="ptkSummary" class="tw" style="max-height:180px;overflow:auto;display:none;margin-top:6px">
          <table><thead><tr><th>No</th><th>Nama PTK</th><th>Sekolah</th></tr></thead><tbody id="ptkSummaryBody"></tbody></table>
        </div>
        ${isPlt ? `<div><label>Status Kepala Sekolah Definitif</label><select id="sk_status" required>
          <option>Jabatan kosong</option>
          <option>Pejabat definitif sedang berhalangan</option>
          <option>Pejabat definitif mendapat penugasan lain</option>
          <option>Kondisi lain</option>
        </select></div>` : `<div><label>Jenis Keputusan</label><select id="sk_jenis" required>
          <option>Pengangkatan Kepala Sekolah definitif</option>
          <option>Pengangkatan kembali</option>
          <option>Pengangkatan pada satuan pendidikan lain</option>
        </select></div>`}
        <div><label>Nomor SK</label><input id="sk_no" required></div>
        <div><label>Tanggal SK</label><input id="sk_tgl" type="date" required></div>
        <div><label>TMT</label><input id="sk_tmt" type="date" required></div>
        ${isPlt ? '<div><label>Tanggal Berakhir Plt.</label><input id="sk_akhir" type="date"></div>' : ''}
        
        <div class="full"><label>Pejabat yang Menetapkan</label><input id="sk_pejabat" required></div>
        <p class="mu full">Dokumen SK diunggah nanti di daftar setelah data tersimpan.</p>
      </div>`;
  }

  const m = modal(titles[jenis] || 'Input SK', fields + '<p class="mu" style="margin-top:8px">Untuk SK Definitif & Plt, dokumen diunggah di daftar setelah disimpan.</p>', async (modalEl) => {
    const isMulti = jenis === 'sk_definitif' || jenis === 'sk_plt';
    const isPlt = jenis === 'sk_plt';
    let file = null, base64 = '';
    if (!isMulti) {
      const fileInput = $('#sk_file', modalEl);
      file = fileInput && fileInput.files[0];
      if (file) {
        if (file.size > 1024 * 1024) throw new Error('Ukuran file maksimal 1 MB');
        if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('File harus berformat PDF');
        base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
    }

    const ptkEl = $('#sk_ptk', modalEl) || $('#sk_ptk_add', modalEl);
    const data = {
      jenis: jenis,
      ptk_id: ptkEl ? ptkEl.value : '',
      no_sk: $('#sk_no', modalEl).value,
      tgl_sk: $('#sk_tgl', modalEl).value,
      tmt: $('#sk_tmt', modalEl).value,
      pejabat: $('#sk_pejabat', modalEl).value,
      keterangan: ($('#sk_ket', modalEl) || {}).value || ''
    };
    // tambahkan field spesifik sesuai jenis
    if (jenis === 'sk_pemberhentian') {
      data.jenis_pemberhentian = $('#sk_jenis', modalEl).value;
      data.alasan = $('#sk_alasan', modalEl).value;
    } else if (jenis === 'sk_mutasi') {
      data.sekolah_tujuan = $('#sk_tujuan', modalEl).value;
      data.jenis_mutasi = $('#sk_jenis', modalEl).value;
      data.alasan = $('#sk_alasan', modalEl).value;
    } else if (jenis === 'sk_definitif') {
      data.sekolah = $('#sk_sekolah', modalEl).value;
      data.jenis_keputusan = $('#sk_jenis', modalEl).value;
      data.mulai = ($('#sk_mulai', modalEl) || {}).value || '';
      data.akhir = ($('#sk_akhir', modalEl) || {}).value || '';
    } else if (jenis === 'sk_plt') {
      data.sekolah = $('#sk_sekolah', modalEl).value;
      data.status_definitif = $('#sk_status', modalEl).value;
      data.akhir = ($('#sk_akhir', modalEl) || {}).value || '';
    }

    if (!isMulti && file) {
      data.file_name = file.name;
      data.file_base64 = base64;
    }
    if (isMulti) {
      const ptkItems = [...document.querySelectorAll('#ptkList .ptk-item')];
      if (!ptkItems.length) throw new Error('Tambahkan minimal satu nama PTK');
      for (const el of ptkItems) {
        const one = Object.assign({}, data, { ptk_id: el.dataset.id, sekolah: el.dataset.sekolah });
        await api('saveSK', one);
      }
      clearCache(); toast(ptkItems.length + ' data SK berhasil disimpan', 'ok');
    } else {
      await api('saveSK', data);
      clearCache(); toast('SK berhasil disimpan', 'ok');
    }
    pageSK(jenis);
  }, { ok: 'Simpan' });

  // Prefill jika mode ubah
  if (editRec) {
    setTimeout(() => {
      const set = (id, val) => { const el = $('#' + id, m); if (el) el.value = val || ''; };
      set('sk_no', editRec.no_sk);
      set('sk_tgl', (editRec.tgl_sk || '').toString().slice(0,10));
      set('sk_tmt', (editRec.tmt || '').toString().slice(0,10));
      set('sk_pejabat', editRec.pejabat);
      set('sk_mulai', editRec.mulai);
      set('sk_akhir', editRec.akhir);
      if (editRec.sekolah_npsn && $('#sk_sekolah', m)) {
        $('#sk_sekolah', m).value = editRec.sekolah_npsn;
      }
      toast('Mode Ubah — data dimuat ke form', 'ok');
    }, 400);
  }

  // Isi dropdown PTK
  setTimeout(() => {
    const sel = document.getElementById('sk_ptk_add') || document.getElementById('sk_ptk');
    if (sel) {
      api('list', { entity: 'guru' }).then(r => {
        sel.innerHTML = '<option value="">— pilih PTK —</option>' + (r.rows||[]).map(g => `<option value="${esc(g.id)}">${esc(g.nama)} (${esc(g.nip||'–')})</option>`).join('');
        if (!sel.dataset.searchable) makeSearchableSelect(sel, 'Ketik nama atau NIP…');
      }).catch(() => {});
    }
    const addBtn = $('#addPtk', m);
    if (addBtn) {
      const updateSummary = () => {
        const items = [...$('#ptkList', m).querySelectorAll('.ptk-item')];
        const body = $('#ptkSummaryBody', m);
        if (!items.length) { $('#ptkSummary', m).style.display = 'none'; return; }
        $('#ptkSummary', m).style.display = '';
        body.innerHTML = items.map((el, i) => `<tr><td>${i+1}</td><td>${esc(el.dataset.nama || el.textContent.replace('×','').trim())}</td><td>${esc(el.dataset.sekolahNama || '–')}</td></tr>`).join('');
      };
      addBtn.onclick = () => {
        const s = $('#sk_ptk_add', m);
        const sekolahSel = $('#sk_sekolah', m);
        if (!s.value) return toast('Pilih nama PTK', 'wr');
        if (!sekolahSel || !sekolahSel.value) return toast('Pilih sekolah penugasan', 'wr');
        const list = $('#ptkList', m);
        if (list.querySelector(`[data-id="${s.value}"]`)) return toast('Nama sudah ditambahkan', 'wr');
        const opt = s.options[s.selectedIndex];
        const sekolahNama = sekolahSel.options[sekolahSel.selectedIndex] ? sekolahSel.options[sekolahSel.selectedIndex].text : '';
        list.insertAdjacentHTML('beforeend', `<span class="ptk-item badge" data-id="${s.value}" data-sekolah="${sekolahSel.value}" data-sekolah-nama="${esc(sekolahNama)}" data-nama="${esc(opt.text)}" style="margin:2px;display:inline-flex;align-items:center;gap:4px">${esc(opt.text)} <button type="button" style="border:0;background:none;cursor:pointer" onclick="this.parentElement.remove();updateSummary()">×</button></span>`);
        s.value = '';
        updateSummary();
      };
    }
    // Buat searchable untuk select sekolah
    ['sk_sekolah','sk_tujuan'].forEach(id => {
      const el = $('#' + id, m);
      if (el) makeSearchableSelect(el, 'Ketik nama sekolah…');
    });
  }, 150);
}


async function pagePenandatangan() {
  $('#ttl').textContent = 'Penandatangan Dokumen';
  $('#view').innerHTML = '<div class="card mu">Memuat…</div>';
  let data = {};
  try { data = (await api('getPenandatangan')).data || {}; } catch(e) {}
  $('#view').innerHTML = `<div class="card" style="max-width:520px">
    <h3>Data Kepala Dinas</h3>
    <div class="fg">
      <div class="full"><label>Nama</label><input id="pt_nama" value="${esc(data.nama||'')}" required></div>
      <div><label>NIP</label><input id="pt_nip" value="${esc(data.nip||'')}" required></div>
      <div><label>Pangkat / Golongan</label><input id="pt_pangkat" value="${esc(data.pangkat||'')}" required></div>
    </div>
    <div style="margin-top:12px"><button class="btn" id="savePT">Simpan</button></div>
  </div>`;
  $('#savePT').onclick = async () => {
    await api('savePenandatangan', {
      nama: $('#pt_nama').value,
      nip: $('#pt_nip').value,
      pangkat: $('#pt_pangkat').value
    });
    toast('Data penandatangan tersimpan', 'ok');
  };
}

function cetakLaporanSK(jenis, list) {
  const html = `<div class="fg">
    <div><label>Dari Tanggal SK</label><input id="f_dari" type="date"></div>
    <div><label>Sampai Tanggal SK</label><input id="f_sampai" type="date"></div>
    <div><label>Dari TMT</label><input id="t_dari" type="date"></div>
    <div><label>Sampai TMT</label><input id="t_sampai" type="date"></div>
  </div>
  <p class="mu">Kosongkan filter jika ingin mencetak semua data.</p>`;
  modal('Cetak Laporan SK', html, () => {
    const dari = $('#f_dari').value, sampai = $('#f_sampai').value;
    const tdari = $('#t_dari').value, tsampai = $('#t_sampai').value;
    let filtered = list.filter(r => {
      const tgl = (r.tgl_sk||'').toString().slice(0,10);
      const tmt = (r.tmt||'').toString().slice(0,10);
      if (dari && tgl < dari) return false;
      if (sampai && tgl > sampai) return false;
      if (tdari && tmt < tdari) return false;
      if (tsampai && tmt > tsampai) return false;
      return true;
    });
    const title = document.getElementById('ttl').textContent;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Laporan ${title}</title>
      <style>body{font-family:Arial;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f1f5f9}</style>
      </head><body><h2>${title}</h2><p>Dicetak: ${new Date().toLocaleDateString('id-ID')}</p>
      <table><thead><tr><th>No</th><th>Nama</th><th>Sekolah</th><th>Nomor SK</th><th>Tanggal SK</th><th>TMT</th></tr></thead><tbody>
      ${filtered.map((r,i)=>`<tr><td>${i+1}</td><td>${r.nama||''}</td><td>${r.sekolah||''}</td><td>${r.no_sk||''}</td><td>${(r.tgl_sk||'').toString().slice(0,10)}</td><td>${(r.tmt||'').toString().slice(0,10)}</td></tr>`).join('')}
      </tbody></table></body></html>`);
    win.document.close();
    win.print();
  }, { ok: 'Cetak' });
}



function showColumnMatch(file, targets, onConfirm) {
  const reader = new FileReader();
  reader.onload = async e => {
    await ensureXLSX(); const wb = XLSX.read(e.target.result);
    const sheetNames = wb.SheetNames;
    const pickHtml = `<div><label>Pilih Sheet</label>
      <select id="sheetPick" style="width:100%;margin:8px 0">${sheetNames.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select>
      <p class="mu">Pilih sheet yang berisi data, lalu lanjutkan pencocokan kolom.</p></div>`;
    modal('Pilih Sheet', pickHtml, () => {
      const chosen = $('#sheetPick').value;
      const sheet = wb.Sheets[chosen];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      processSheet(rows, targets, onConfirm);
    }, { ok: 'Lanjut' });
  };
  reader.readAsArrayBuffer(file);
}


function processSheet(rows, targets, onConfirm) {
    let hIdx = rows.findIndex(r => {
      const cells = r.map(c => String(c||'').toUpperCase());
      return cells.some(c => c.includes('NAMA')) && cells.filter(c => c.trim()).length >= 4;
    });
    if (hIdx < 0) hIdx = rows.findIndex(r => r.filter(c => String(c||'').trim()).length >= 4);
    if (hIdx < 0) hIdx = 0;
    const headers = rows[hIdx].map((h,i) => String(h||'').trim() || ('Kolom ' + (i+1)));
    const html = `<div class="tw" style="max-height:320px"><table><thead><tr><th>Kolom Aplikasi</th><th>Kolom di Excel</th></tr></thead><tbody>
      ${targets.map(t => {
  const guess = headers.findIndex(h => h.toUpperCase().includes(t.l.toUpperCase().split(' ')[0]) || h.toUpperCase().includes(t.k.toUpperCase()));
  return `<tr><td>${esc(t.l)}</td><td><select data-k="${t.k}"><option value="-1">— tidak dipakai —</option>${headers.map((h,i)=>`<option value="${i}"${i===guess?' selected':''}>${esc(h)}</option>`).join('')}</select></td></tr>`;
}).join('')}
    </tbody></table></div>
    <p class="mu">Pilih kolom Excel yang sesuai dengan data aplikasi.</p>`;
    modal('Pencocokan Kolom', html, () => {
      const map = {};
      document.querySelectorAll('select[data-k]').forEach(s => { if (s.value !== '-1') map[s.dataset.k] = parseInt(s.value, 10); });
      const data = [];
      for (let i = hIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row.length) continue;
        const obj = {};
        targets.forEach(t => {
          if (map[t.k] != null && map[t.k] >= 0) {
            const val = row[map[t.k]];
            obj[t.k] = val != null ? String(val).trim() : '';
          }
        });
        if (obj.nama && obj.nama.length > 2) data.push(obj);
        else if (obj.nama_pengawas && obj.nama_pengawas.length > 2) data.push(obj);
        else if (obj.npsn) data.push(obj);
      }
      if (!data.length) throw new Error('Tidak ada data yang terbaca. Pastikan kolom Nama sudah dicocokkan.');
      onConfirm(data);
    }, { ok: 'Impor Data' });
}


function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src="' + src + '"]')) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Gagal memuat ' + src));
    document.head.appendChild(s);
  });
}
function loadCSS(href) {
  if (document.querySelector('link[href="' + href + '"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}
async function ensureXLSX() {
  if (window.XLSX) return;
  await loadScript('https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js');
}
async function ensureLeaflet() {
  if (window.L) return;
  loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
  await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
}

function openImportPeriode() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.xlsx,.xls';
  input.onchange = () => {
    const f = input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async e => {
      await ensureXLSX(); const wb = XLSX.read(e.target.result);
      const pick = `<div><label>Pilih Sheet</label>
        <select id="shPick" style="width:100%;margin:8px 0">${wb.SheetNames.map(n=>`<option>${esc(n)}</option>`).join('')}</select>
        <p class="mu">Pilih sheet (TK / SD / SMP), lalu impor.</p></div>`;
      modal('Impor Periode Kepala Sekolah', pick, async () => {
        const name = $('#shPick').value;
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
        // Cari baris header
        let h = rows.findIndex(r => r.some(c => String(c).toUpperCase().trim() === 'NAMA') && r.some(c => String(c).toUpperCase().includes('NIP')));
        if (h < 0) throw new Error('Header tidak ditemukan. Pastikan ada kolom NAMA dan NIP.');
        const hdr = rows[h].map(c => String(c||'').toUpperCase().trim());
        const col = k => hdr.findIndex(x => x.includes(k));
        const data = [];
        for (let i = h + 1; i < rows.length; i++) {
          const r = rows[i];
          const nama = String(r[col('NAMA')]||'').trim();
          if (!nama || nama.length < 3) continue;
          data.push({
            nama: nama,
            nip: String(r[col('NIP')]||'').trim(),
            jabatan: String(r[col('JABATAN')]||'').trim(),
            no_hp: String(r[col('HP')]||r[col('WA')]||'').trim(),
            sekolah: String(r[col('ASAL')]||r[col('SEKOLAH')]||'').trim(),
            kecamatan: String(r[col('KECAMATAN')]||'').trim(),
            tmt: String(r[col('TMT')]||'').trim(),
            keterangan: String(r[col('KETERANGAN')]||'').trim(),
            link_sk: String(r[col('LINK')]||'').trim(),
            periode1: String(r[col('PERIODE 1')]||'').trim(),
            periode2: String(r[col('PERIODE 2')]||'').trim(),
            periode3: String(r[col('PERIODE 3')]||'').trim(),
            periode4: String(r[col('PERIODE 4')]||'').trim()
          });
        }
        if (!data.length) throw new Error('Tidak ada data yang terbaca di sheet ini');
        await api('importPeriode', { rows: data });
        toast(data.length + ' data berhasil diimpor dari sheet ' + name, 'ok');
        pagePeriodeKepsek();
      }, { ok: 'Impor' });
    };
    reader.readAsArrayBuffer(f);
  };
  input.click();
}

async function pagePeriodeKepsek() {
  $('#ttl').textContent = 'Periode Kepala Sekolah';
  $('#view').innerHTML = '<div class="card mu">Memuat data…</div>';
  let rows = [];
  try { rows = (await api('listPeriode')).rows || []; } catch(e) {}
  const html = `<div class="card">
    <div class="tools">
      <div class="sp"></div>
      <button class="btn sec" id="impPeriode">Impor Excel</button>
      <button class="btn" id="addPeriode">+ Tambah</button>
    </div>
    ${rows.length ? `<div class="tw" style="overflow-x:auto"><table><thead><tr>
      <th>No</th><th>Nama</th><th>NIP</th><th>Jabatan</th><th>Asal Sekolah</th><th>Kecamatan</th>
      <th>TMT SK</th><th>Periode 1</th><th>Periode 2</th><th>Periode 3</th><th>Periode 4</th><th>Keterangan</th><th>Link SK</th><th></th>
    </tr></thead><tbody>
    ${rows.map((r,i) => `<tr>
      <td>${i+1}</td>
      <td>${esc(r.nama||'–')}</td>
      <td>${esc(r.nip||'–')}</td>
      <td>${esc(r.jabatan||'–')}</td>
      <td>${esc(r.sekolah||'–')}</td>
      <td>${esc(r.kecamatan||'–')}</td>
      <td>${esc(r.tmt||'–')}</td>
      <td>${esc(r.periode1||'–')}</td>
      <td>${esc(r.periode2||'–')}</td>
      <td>${esc(r.periode3||'–')}</td>
      <td>${esc(r.periode4||'–')}</td>
      <td>${esc(r.keterangan||'–')}</td>
      <td>${r.link_sk ? `<a class="btn sm sec" href="${esc(r.link_sk)}" target="_blank">Lihat SK</a>` : '–'}</td>
      <td><button class="btn sm sec" data-edit-periode="${esc(r.id)}">Edit</button></td>
    </tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">Belum ada data. Gunakan Impor Excel atau Tambah.</div>'}
  </div>`;
  $('#view').innerHTML = html;
  addSearchPrint('#view', '#view table');
  $('#impPeriode').onclick = () => openImportPeriode();
  $('#addPeriode').onclick = () => toast('Form tambah periode akan ditambahkan.', 'ok');
  document.querySelectorAll('[data-edit-periode]').forEach(btn => {
    btn.onclick = () => toast('Form edit periode akan dibuka.', 'ok');
  });
}


function openImportPengawas() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.xlsx,.xls';
  input.onchange = () => {
    const targets = [
      {k:'nama',l:'Nama'},{k:'nip',l:'NIP'},{k:'nuptk',l:'NUPTK'},
      {k:'jabatan',l:'Jabatan'},{k:'status',l:'Status'}
    ];
    showColumnMatch(input.files[0], targets, async data => {
      await api('importPengawas', { rows: data });
      toast(data.length + ' pengawas diimpor', 'ok');
      pagePengawas();
    });
  };
  input.click();
}
function _oldImportPengawas() {
  const html = `<p class="mu">Unggah file Excel Data Pengawas.</p>
    <input type="file" id="impFile" accept=".xlsx,.xls">`;
  modal('Impor Data Pengawas', html, async () => {
    const f = $('#impFile').files[0];
    if (!f) throw new Error('Pilih file');
    await ensureXLSX(); const wb = await ensureXLSX(); XLSX.read(await f.arrayBuffer());
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const hIdx = rows.findIndex(r => r.some(c => String(c).toUpperCase().includes('NAMA')));
    const headers = (rows[hIdx]||[]).map(h => String(h||'').toUpperCase());
    const get = (row, k) => { const i = headers.findIndex(h => h.includes(k)); return i>=0 ? row[i] : ''; };
    const data = [];
    for (let i = hIdx+1; i < rows.length; i++) {
      const nama = get(rows[i], 'NAMA');
      if (!nama || nama.length < 3) continue;
      data.push({ nama, nip: get(rows[i],'NIP'), nuptk: get(rows[i],'NUPTK'), status: get(rows[i],'STATUS')||'Aktif', jabatan: get(rows[i],'JABATAN') });
    }
    if (!data.length) throw new Error('Tidak ada data');
    await api('importPengawas', { rows: data });
    toast(data.length + ' pengawas diimpor', 'ok');
    pagePengawas();
  }, { ok: 'Impor' });
}

function openFormPengawas() {
  const html = `<div class="fg">
    <div class="full"><label>Nama</label><input id="p_nama" required></div>
    <div><label>NIP</label><input id="p_nip"></div>
    <div><label>NUPTK</label><input id="p_nuptk"></div>
    <div><label>Jabatan</label><input id="p_jabatan"></div>
    <div><label>Status</label><select id="p_status"><option>Aktif</option><option>Tidak Aktif</option></select></div>
  </div>`;
  modal('Tambah Pengawas', html, async () => {
    await api('savePengawas', { nama: $('#p_nama').value, nip: $('#p_nip').value, nuptk: $('#p_nuptk').value, jabatan: $('#p_jabatan').value, status: $('#p_status').value });
    toast('Pengawas ditambahkan', 'ok');
    pagePengawas();
  });
}

async function pageWilayahBinaan() {
  $('#ttl').textContent = 'Wilayah Binaan Pengawas';
  $('#view').innerHTML = '<div class="card mu">Memuat…</div>';
  let rows = [];
  try { rows = (await api('listWilayah')).rows || []; } catch(e) {}
  $('#view').innerHTML = `<div class="card">
    <div class="tools"><div class="sp"></div>
      <button class="btn sec" id="impWilayah">Impor Excel</button>
    </div>
    ${rows.length ? `<div class="tw" style="overflow-x:auto"><table><thead><tr>
      <th>No</th><th>Nama Pengawas</th><th>NIP</th><th>NPSN</th><th>Nama Sekolah</th><th>Jenjang</th><th>Kecamatan</th>
    </tr></thead><tbody>
    ${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.nama_pengawas||'')}</td><td>${esc(r.nip||'')}</td><td>${esc(r.npsn||'')}</td><td>${esc(r.nama_sekolah||'')}</td><td>${esc(r.jenjang||'')}</td><td>${esc(r.kecamatan||'')}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">Belum ada data. Gunakan Impor Excel.</div>'}
  </div>`;
  addSearchPrint('#view', '#view table');
  $('#impWilayah').onclick = openImportWilayah;
}

function openImportWilayah() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.xlsx,.xls';
  input.onchange = () => {
    const targets = [
      {k:'nama_pengawas',l:'Nama Pengawas'},{k:'nip',l:'NIP'},
      {k:'npsn',l:'NPSN'},{k:'nama_sekolah',l:'Nama Sekolah'},
      {k:'jenjang',l:'Jenjang'},{k:'kecamatan',l:'Kecamatan'}
    ];
    showColumnMatch(input.files[0], targets, async data => {
      await api('importWilayah', { rows: data });
      toast(data.length + ' data wilayah diimpor', 'ok');
      pageWilayahBinaan();
    });
  };
  input.click();
}
function _oldImportWilayah() {
  const html = `<p class="mu">Unggah file Lampiran SK Pengawas.</p>
    <input type="file" id="impFile" accept=".xlsx,.xls">`;
  modal('Impor Wilayah Binaan', html, async () => {
    const f = $('#impFile').files[0];
    if (!f) throw new Error('Pilih file');
    await ensureXLSX(); const wb = await ensureXLSX(); XLSX.read(await f.arrayBuffer());
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const data = [];
    let currentNama = '', currentNip = '';
    for (const row of rows) {
      const col1 = String(row[1]||'').trim();
      const npsn = String(row[3]||'').trim();
      if (col1 && col1.length > 5 && !col1.match(/^\d/) && !npsn) {
        currentNama = col1.split('\n')[0];
        const nipMatch = col1.match(/\d{18}/) || String(row[1]||'').match(/\d{18}/);
        if (nipMatch) currentNip = nipMatch[0];
      }
      if (npsn && npsn.match(/^\d{8}/)) {
        data.push({
          nama_pengawas: currentNama,
          nip: currentNip,
          npsn: npsn,
          nama_sekolah: String(row[4]||''),
          jenjang: String(row[5]||''),
          kecamatan: String(row[6]||'').replace('Kec. ','')
        });
      }
    }
    if (!data.length) throw new Error('Tidak ada data sekolah yang terbaca');
    await api('importWilayah', { rows: data });
    toast(data.length + ' data wilayah binaan diimpor', 'ok');
    pageWilayahBinaan();
  }, { ok: 'Impor' });
}

async function pagePengawas() {
  $('#ttl').textContent = 'Data Pengawas Sekolah';
  $('#view').innerHTML = '<div class="card mu">Memuat data…</div>';
  let rows = [];
  try { rows = (await api('listPengawas')).rows || []; } catch(e) {}
  const statusOpt = s => ['Aktif','Tidak Aktif','Pensiun'].map(o => `<option${o===s?' selected':''}>${o}</option>`).join('');
  const html = `<div class="card">
    <div class="tools">
      <div class="sp"></div>
      <button class="btn sec" id="impPengawas">Impor Excel</button>
      <button class="btn" id="addPengawas">+ Tambah</button>
    </div>
    ${rows.length ? `<div class="tw"><table><thead><tr>
      <th>No</th><th>Nama</th><th>NUPTK</th><th>NIP</th><th>Status Keaktifan</th><th>Jabatan</th>
    </tr></thead><tbody>
    ${rows.map((r,i) => `<tr>
      <td>${i+1}</td>
      <td>${esc(r.nama||'–')}</td>
      <td>${esc(r.nuptk||'–')}</td>
      <td>${esc(r.nip||'–')}</td>
      <td><select data-id="${esc(r.id)}" class="st-pengawas">${statusOpt(r.status||'Aktif')}</select></td>
      <td>${esc(r.jabatan||'–')}</td>
    </tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">Belum ada data pengawas. Gunakan Impor Excel.</div>'}
  </div>`;
  $('#view').innerHTML = html;
  addSearchPrint('#view', '#view table');
  $('#impPengawas').onclick = () => openImportPengawas();
  $('#addPengawas').onclick = () => openFormPengawas();
  document.querySelectorAll('.st-pengawas').forEach(sel => {
    sel.onchange = async () => {
      await api('updatePengawasStatus', { id: sel.dataset.id, status: sel.value });
      toast('Status diperbarui', 'ok');
    };
  });
}

async function pageEntity(id) {
  const ent = S.schema[id]; $('#ttl').textContent = ent.title;
  $('#view').innerHTML = '<div class="card mu">Memuat…</div>';
  const rows = (await api('list', { entity: id })).rows.reverse();
  V = { id, ent, rows, q: '', flt: {}, page: 1, reload: async () => { V.rows = (await api('list', { entity: id })).rows.reverse(); drawTable(); } };
  const flts = ent.fields.filter(f => f.flt && f.t === 'select');
  $('#view').innerHTML = `<div id="extra"></div><div class="card"><div class="tools"><input id="q" type="search" placeholder="Cari…">
    ${flts.map(f => `<select data-f="${f.k}"><option value="">Semua ${esc(f.l)}</option>${f.o.map(o => `<option>${esc(o)}</option>`).join('')}</select>`).join('')}
    <div class="sp"></div>${ent.imp ? '<button class="btn sec" id="imp">Impor Excel</button>' : ''}<button class="btn sec" id="exp">Ekspor CSV</button>${ent.ops.includes('create') ? '<button class="btn" id="add">+ Tambah</button>' : ''}</div><div id="tbl"></div></div>`;
  $('#q').oninput = e => { V.q = e.target.value; V.page = 1; drawTable(); };
  $$('[data-f]').forEach(s => s.onchange = () => { V.flt[s.dataset.f] = s.value; V.page = 1; drawTable(); });
  $('#exp').onclick = exportCSV;
  if ($('#imp')) $('#imp').onclick = openImport;
  if ($('#add')) $('#add').onclick = () => openForm(null);
  $('#tbl').onclick = onTblClick;
  drawTable();
}
function filtered() {
  const q = V.q.toLowerCase();
  return V.rows.filter(r => {
    for (const k in V.flt) if (V.flt[k] && r[k] !== V.flt[k]) return false;
    if (!q) return true;
    return V.ent.fields.some(f => !f.v && String(f.t === 'ref' ? refName(r[f.k]) : (r[f.k] || '')).toLowerCase().includes(q));
  });
}
function drawTable() {
  const ent = V.ent, list = filtered(), can = o => ent.ops.includes(o);
  if (V.id === 'rombel') {
    $('#extra').innerHTML = '<div class="card mu" style="margin-bottom:12px">Ringkasan jumlah rombel per sekolah (hanya negeri yang dihitung untuk kebutuhan guru). Impor mendukung format 1 baris per sekolah dengan kolom <b>Jumlah Rombel</b>.</div>';
    // Aggregate by npsn + tahun_ajaran
    const groups = {};
    list.forEach(r => {
      const key = (r.npsn_sekolah || r.npsn || '') + '|' + (r.tahun_ajaran || '');
      if (!groups[key]) {
        groups[key] = {
          npsn: r.npsn_sekolah || r.npsn, nama: refName(r.npsn_sekolah || r.npsn) || r.npsn_sekolah || r.npsn, jenjang: r.jenjang, tahun: r.tahun_ajaran,
          count: 0, siswa: 0, ids: [], rows: []
        };
      }
      groups[key].count++;
      groups[key].siswa += Number(r.jumlah_siswa) || 0;
      groups[key].ids.push(r.id);
      groups[key].rows.push(r);
    });
    const gList = Object.values(groups).sort((a,b) => (a.nama||'').localeCompare(b.nama||''));
    const per = 15, pages = Math.max(1, Math.ceil(gList.length / per));
    if (V.page > pages) V.page = pages;
    const slice = gList.slice((V.page - 1) * per, V.page * per);
    $('#tbl').innerHTML = gList.length ? `<div class="tw"><table><thead><tr>
      <th>#</th><th>Sekolah</th><th>Jenjang</th><th>Tahun Ajaran</th><th>Jumlah Rombel</th><th>Total Siswa</th><th></th>
    </tr></thead><tbody>
    ${slice.map((g, i) => `<tr>
      <td>${(V.page - 1) * per + i + 1}</td>
      <td>${esc(g.nama)}</td>
      <td><span class="badge">${esc(g.jenjang || '–')}</span></td>
      <td>${esc(g.tahun || '–')}</td>
      <td><b>${g.count}</b></td>
      <td>${g.siswa}</td>
      <td class="act"><button class="btn sm sec" data-a="rombel-detail" data-key="${esc(g.npsn + '|' + g.tahun)}">Lihat Rombel</button></td>
    </tr>`).join('')}
    </tbody></table></div>
    <div class="pager"><span>${gList.length} sekolah</span><button class="btn sm sec" data-a="prev"${V.page <= 1 ? ' disabled' : ''}>‹</button><span>${V.page} / ${pages}</span><button class="btn sm sec" data-a="next"${V.page >= pages ? ' disabled' : ''}>›</button></div>`
    : '<div class="empty">Belum ada data rombel.</div>';
    return;
  }
  if (V.id === 'mediasi') {
    $('#extra').innerHTML = '<div class="card" style="margin-bottom:12px;background:#eff6ff;border-color:#bfdbfe"><b>Alur Mediasi Perceraian:</b> Gunakan tombol di kolom aksi untuk mencetak dokumen: <b>Undangan</b>, <b>BA Mediasi</b>, <b>Pernyataan Gagal</b>, dan <b>Pelimpahan</b>.</div>';
  }
  if (V.id === 'pegawai') {
    // Sorting khusus pegawai
    const order = ['kepala dinas', 'sekretaris', 'kepala bidang', 'kepala sub bagian', 'kepala seksi', 'staf pns', 'staf pppk', 'staf pppk paruh waktu', 'jabatan fungsional'];
    const rank = r => {
      const j = (r.jabatan || '').toLowerCase();
      const st = (r.status || '').toLowerCase();
      for (let i = 0; i < order.length; i++) if (j.includes(order[i]) || (order[i].includes('staf') && st.includes(order[i].replace('staf ','')))) return i;
      if (st.includes('pns')) return 5;
      if (st.includes('pppk paruh')) return 7;
      if (st.includes('pppk')) return 6;
      return 99;
    };
    list.sort((a, b) => rank(a) - rank(b) || (a.nama||'').localeCompare(b.nama||''));
    const per = 15;
    const pages = Math.max(1, Math.ceil(list.length / per)); if (V.page > pages) V.page = pages;
    const slice = list.slice((V.page - 1) * per, V.page * per);
    const waBtn = r => {
      const hp = (r.no_hp || '').replace(/\D/g, '');
      if (!hp) return '';
      const num = hp.startsWith('0') ? '62' + hp.slice(1) : hp;
      return `<a class="btn sm" href="https://wa.me/${num}" target="_blank" rel="noopener">📞 WA</a>`;
    };
    $('#tbl').innerHTML = list.length ? `<div class="tw"><table><thead><tr>
      <th>#</th><th>Foto</th><th>Nama</th><th>NIP</th><th>Jabatan</th><th>Status</th><th></th>
    </tr></thead><tbody>
    ${slice.map((r, i) => `<tr>
      <td>${(V.page - 1) * per + i + 1}</td>
      <td><img src="${esc(r.foto || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(r.nama||'') + '&background=1a56db&color=fff&size=40')}" style="width:40px;height:40px;border-radius:50%;object-fit:cover" alt=""></td>
      <td><b>${esc(r.nama||'')}</b></td>
      <td>${esc(r.nip||'–')}</td>
      <td>${esc(r.jabatan||'–')}</td>
      <td>${cell({t:'select'}, r.status)}</td>
      <td class="act">${waBtn(r)} <button class="btn sm sec" data-a="view" data-id="${esc(r.id)}">Detail</button> <button class="btn sm sec" data-a="edit" data-id="${esc(r.id)}">Ubah</button></td>
    </tr>`).join('')}
    </tbody></table></div>
    <div class="pager"><span>${list.length} pegawai</span><button class="btn sm sec" data-a="prev"${V.page <= 1 ? ' disabled' : ''}>‹</button><span>${V.page} / ${pages}</span><button class="btn sm sec" data-a="next"${V.page >= pages ? ' disabled' : ''}>›</button></div>`
    : '<div class="empty">Belum ada data pegawai.</div>';
    return;
  }
  // normal table for other entities
  let cols = ent.fields.filter(f => !f.h && !f.v);
  if (V.id === 'kepsek') {
    cols = cols.filter(f => ['nama','npsn_sekolah','status_kepsek','jenjang'].includes(f.k));
  }
  const per = 15;
  const pages = Math.max(1, Math.ceil(list.length / per)); if (V.page > pages) V.page = pages;
  const slice = list.slice((V.page - 1) * per, V.page * per);
  const act = r => {
    let a = `<button class="btn sm sec" data-a="view" data-id="${esc(r.id)}">Detail</button> `;
    if (V.id === 'sekolah') {
      a += `<button class="btn sm" data-a="guru-sekolah" data-npsn="${esc(r.npsn)}">Daftar Guru</button> `;
    }
    if (V.id === 'mediasi') {
      a += `<button class="btn sm" data-a="undangan" data-id="${esc(r.id)}">Undangan</button> `;
      a += `<button class="btn sm" data-a="ba" data-id="${esc(r.id)}">BA Mediasi</button> `;
      a += `<button class="btn sm sec" data-a="pernyataan" data-id="${esc(r.id)}">Pernyataan Gagal</button> `;
      a += `<button class="btn sm" data-a="pelimpahan" data-id="${esc(r.id)}">Pelimpahan</button> `;
    }
    if (V.id === 'pendaftaran' && r.status === 'Menunggu') a += `<button class="btn sm" data-a="ok" data-id="${esc(r.id)}">Setujui</button> <button class="btn sm sec" data-a="no" data-id="${esc(r.id)}">Tolak</button> `;
    if (can('update')) a += `<button class="btn sm sec" data-a="edit" data-id="${esc(r.id)}">Ubah</button> `;
    if (can('delete')) a += `<button class="btn sm dan" data-a="del" data-id="${esc(r.id)}">Hapus</button>`;
    return a;
  };
  $('#tbl').innerHTML = list.length ? `<div class="tw"><table><thead><tr><th>#</th>${cols.map(f => `<th>${esc(f.l)}</th>`).join('')}<th></th></tr></thead><tbody>
    ${slice.map((r, i) => `<tr><td>${(V.page - 1) * per + i + 1}</td>${cols.map(f => `<td>${cell(f, r[f.k])}</td>`).join('')}<td class="act">${act(r)}</td></tr>`).join('')}</tbody></table></div>
    <div class="pager"><span>${list.length} data</span><button class="btn sm sec" data-a="prev"${V.page <= 1 ? ' disabled' : ''}>‹</button><span>${V.page} / ${pages}</span><button class="btn sm sec" data-a="next"${V.page >= pages ? ' disabled' : ''}>›</button></div>`
    : '<div class="empty">Belum ada data.</div>';
}

async function onTblClick(e) {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a;
  if (a === 'prev') { V.page--; return drawTable(); }
  if (a === 'next') { V.page++; return drawTable(); }
  if (a === 'rombel-detail') {
    const key = b.dataset.key;
    const [npsn, tahun] = key.split('|');
    const detailRows = V.rows.filter(r => r.npsn === npsn && (r.tahun_ajaran || '') === tahun);
    const html = detailRows.length ? `<div class="tw" style="max-height:400px"><table><thead><tr><th>Nama Rombel</th><th>Tingkat</th><th>Jumlah Siswa</th><th></th></tr></thead><tbody>
      ${detailRows.map(r => `<tr><td>${esc(r.nama_rombel || '–')}</td><td>${esc(r.tingkat || '–')}</td><td>${esc(r.jumlah_siswa || '–')}</td>
      <td class="act"><button class="btn sm sec" data-a="view" data-id="${esc(r.id)}">Detail</button> <button class="btn sm sec" data-a="edit" data-id="${esc(r.id)}">Ubah</button> <button class="btn sm dan" data-a="del" data-id="${esc(r.id)}">Hapus</button></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">Tidak ada rombel.</div>';
    modal('Detail Rombel — ' + esc(refName(npsn) || npsn), html, async () => {}, { ok: 'Tutup', cancel: 'Batal' });
    return;
  }
  const rec = V.rows.find(r => r.id === b.dataset.id);
  try {
    if (a === 'view') return openView(rec);
  if (a === 'guru-sekolah') {
    const npsn = b.dataset.npsn;
    const nama = refName(npsn);
    const gurus = (await api('list', { entity: 'guru' })).rows.filter(g => g.npsn_sekolah === npsn);
    const html = gurus.length ? `<div class="tw" style="max-height:400px"><table><thead><tr><th>Nama</th><th>NIP</th><th>Status</th><th>Mapel</th></tr></thead><tbody>
      ${gurus.map(g => `<tr><td>${esc(g.nama)}</td><td>${esc(g.nip||'–')}</td><td>${esc(g.status||'–')}</td><td>${esc(g.mapel||'–')}</td></tr>`).join('')}
    </tbody></table></div><p class="mu">${gurus.length} guru</p>` : '<div class="empty">Belum ada data guru di sekolah ini.</div>';
    modal('Daftar Guru — ' + esc(nama), html, async () => {}, { ok: 'Tutup', cancel: 'Batal' });
    return;
  }
    if (a === 'undangan') return cetakUndangan(rec);
    if (a === 'ba') return cetakBA(rec);
    if (a === 'pernyataan') return cetakPernyataan(rec);
    if (a === 'pelimpahan') return cetakPelimpahan(rec);
    if (a === 'edit') return openForm(rec);
    if (a === 'del') { if (confirm('Hapus data ini? Tindakan tidak dapat dibatalkan.')) { await api('remove', { entity: V.id, id: rec.id }); clearCache(); toast('Data dihapus', 'ok'); await V.reload(); } return; }
    if (a === 'ok') { if (confirm('Setujui pendaftaran ' + rec.nama + '? Data sekolah, kepala sekolah, dan akun login akan dibuat.')) { await api('approve', { id: rec.id }); toast('Pendaftaran disetujui', 'ok'); S.refs = (await api('refs')).refs; await V.reload(); } return; }
    if (a === 'no') { const c = prompt('Alasan penolakan (akan terlihat oleh pendaftar):'); if (c === null) return; await api('reject', { id: rec.id, catatan: c }); toast('Pendaftaran ditolak'); await V.reload(); }
  } catch (er) { toast(er.message, 'er'); }
}

function openView(rec) {
  const body = V.ent.fields.filter(f => !f.v && !f.calc || f.calc).map(f => {
    if (f.k === 'foto' && rec[f.k]) {
      return `<dt>${esc(f.l)}</dt><dd><img src="${esc(rec[f.k])}" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:3px solid #e0e7ff" alt="Foto"></dd>`;
    }
    return `<dt>${esc(f.l)}</dt><dd>${cell(f, rec[f.k])}</dd>`;
  }).join('');
  modal('Detail', `<dl>${body}</dl>`, async () => {}, { ok: 'Tutup', cancel: 'Batal' });
}
function openForm(rec) {
  const ent = V.ent, isNew = !rec, r = rec || {}, sek = S.user.role === 'sekolah';
  const flds = ent.fields.filter(f => !f.calc && !(sek && (f.k === ent.scope || f.adm)) && !((V.id === 'rombel' || V.id === 'guru') && f.k === 'jenjang'));
  const hasGeo = flds.some(f => f.k === 'lat') && flds.some(f => f.k === 'lng');
  let body = (ent.pick ? pickerHTML() : '') + flds.map(f => fieldWrap(f, isNew ? (f.def || '') : r[f.k], f.t === 'password' ? isNew : f.r)).join('');
  if (hasGeo) body += geoBtn();
  const m = modal((isNew ? 'Tambah ' : 'Ubah ') + ent.title, `<div class="fg">${body}</div>`, async mm => {
    const data = isNew ? {} : { id: r.id };
    flds.forEach(f => data[f.k] = $('#f_' + f.k, mm).value);
    if (sek && ent.scope && isNew) data[ent.scope] = S.user.npsn;
    await api('save', { entity: V.id, data });
    clearCache(); toast('Data tersimpan', 'ok');
    if (V.id === 'sekolah') S.refs = (await api('refs')).refs;
    await V.reload();
  });
  bindGeo(m);
  if (ent.pick) bindPicker(m, ent);
  // Buat semua select ref (sekolah) bisa diketik
  setTimeout(() => {
    $$('select', m).forEach(sel => {
      if (sel.id && sel.id.startsWith('f_') && sel.options.length > 8) {
        makeSearchableSelect(sel, 'Ketik untuk mencari…');
      }
    });
  }, 100);
  if (V.id === 'users') {
    const rs = $('#f_role', m), t = () => { $('#w_npsn_sekolah', m).style.display = rs.value === 'sekolah' ? '' : 'none'; };
    rs.onchange = t; t();
    if (!isNew) $('#f_password', m).placeholder = 'Kosongkan jika tidak diubah';
    $('#w_password', m).insertAdjacentHTML('beforeend', SHOWPW + '<button type="button" class="btn sec sm" id="gen" style="margin-top:6px">Buat password acak</button><div class="mu" style="font-size:12px;margin-top:4px">Password asli tidak bisa dilihat (disimpan sebagai hash). Jika pengguna lupa, buat password baru di sini lalu sampaikan kepadanya.</div>');
    bindShow(m);
    $('#gen', m).onclick = () => {
      const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
      const p = [...crypto.getRandomValues(new Uint32Array(12))].map(x => a[x % a.length]).join('');
      const i = $('#f_password', m); i.type = 'text'; i.value = p; $('[data-show]', m).checked = true;
    };

    // Tambahan: tarik dari Pegawai Disdik + foto
    const extra = `<div class="full" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--bd)">
      <label>Tarik data dari Pegawai Disdik (opsional)</label>
      <select id="pickPegawai"><option value="">— isi manual —</option></select>
      <div style="margin-top:8px"><label>Foto Profil (opsional)</label>
        <input type="file" id="userFoto" accept="image/*">
        <div id="fotoPrev" style="margin-top:6px"></div>
      </div>
    </div>`;
    $('.fg', m).insertAdjacentHTML('beforeend', extra);

    // Load pegawai list
    api('list', { entity: 'pegawai' }).then(r => {
      const sel = $('#pickPegawai', m);
      sel.innerHTML = '<option value="">— isi manual —</option>' + r.rows.map(p => `<option value="${esc(p.id)}">${esc(p.nama)} (${esc(p.nip||'–')})</option>`).join('');
      makeSearchableSelect(sel, 'Ketik nama atau NIP pegawai…');
    });
    $('#pickPegawai', m).onchange = async e => {
      if (!e.target.value) {
        $('#fotoPrev', m).innerHTML = '';
        return;
      }
      const peg = (await api('list', { entity: 'pegawai' })).rows.find(x => x.id === e.target.value);
      if (peg) {
        if ($('#f_nama', m)) $('#f_nama', m).value = peg.nama || '';
        if ($('#f_username', m) && isNew) $('#f_username', m).value = (peg.nip || '').replace(/\D/g,'') || '';
        if (peg.foto) {
          $('#fotoPrev', m).innerHTML = `<img src="${peg.foto}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0">`;
          let hid = $('#f_foto', m);
          if (!hid) {
            hid = document.createElement('input');
            hid.type = 'hidden';
            hid.id = 'f_foto';
            $('.fg', m).appendChild(hid);
          }
          hid.value = peg.foto;
        } else {
          $('#fotoPrev', m).innerHTML = '<span class="mu">Pegawai ini belum memiliki foto</span>';
        }
      }
    };
    $('#userFoto', m).onchange = function() {
      const f = this.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = async e => {
        $('#fotoPrev', m).innerHTML = `<img src="${e.target.result}" style="width:64px;height:64px;border-radius:50%;object-fit:cover">`;
        // simpan base64 sementara (bisa dikirim ke backend jika didukung)
      };
      reader.readAsDataURL(f);
    };
  }
}
/* ---------- cari pegawai/guru -> profil terisi otomatis ---------- */
function pickerHTML() {
  return `<div class="full" id="pk"><label for="pkq">Cari pegawai / guru (ketik nama, NIP, atau NIK)</label>
    <input id="pkq" type="search" autocomplete="off" placeholder="Ketik minimal 2 huruf nama…">
    <div id="pkr" class="tw" style="max-height:230px;display:none;margin-top:6px"></div>
    <div id="pki" class="mu" style="font-size:12px;margin-top:4px">Pilih dari hasil pencarian agar profil terisi otomatis (masih bisa diubah). Jika tidak ditemukan, isi manual di bawah.</div></div>`;
}
function bindPicker(m, ent) {
  const q = $('#pkq', m), box = $('#pkr', m), info = $('#pki', m);
  let timer = 0, seq = 0, rows = [];
  const fill = p => {
    Object.keys(ent.pick).forEach(fk => {
      const el = $('#f_' + fk, m), val = p[ent.pick[fk]] || '';
      if (!el || (val === '' && fk !== 'nama')) return;
      if (el.tagName === 'SELECT') { if ([...el.options].some(o => o.value === val)) el.value = val; }
      else el.value = val;
    });
    info.innerHTML = `Terisi dari <b>${esc(p.src)}</b>: ${esc(p.nama)}. Periksa kembali isiannya, lalu simpan.`;
    box.style.display = 'none'; q.value = '';
  };
  q.oninput = () => {
    clearTimeout(timer);
    const v = q.value.trim();
    if (v.length < 2) { box.style.display = 'none'; return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      box.style.display = ''; box.innerHTML = '<div class="mu" style="padding:8px">Mencari…</div>';
      try {
        const r = await api('cari', { entity: V.id, q: v });
        if (my !== seq) return;
        rows = r.rows;
        box.innerHTML = rows.length
          ? `<table><tbody>${rows.map((p, i) => `<tr><td><b>${esc(p.nama)}</b><br><span class="mu">${esc(p.nip || p.nik || p.nuptk || 'tanpa NIP')} · ${esc(p.src)}${p.info ? ' · ' + esc(p.info) : ''}</span></td><td>${esc(p.jabatan)}<br><span class="mu">${esc(p.unit)}</span></td><td><button type="button" class="btn sm" data-i="${i}">Pilih</button></td></tr>`).join('')}</tbody></table>`
          : '<div class="empty">Tidak ditemukan. Isi data secara manual di bawah.</div>';
      } catch (e) { if (my === seq) box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    }, 300);
  };
  q.onkeydown = e => { if (e.key === 'Enter') e.preventDefault(); };
  box.onclick = e => { const b = e.target.closest('button[data-i]'); if (b) fill(rows[Number(b.dataset.i)]); };
}

function exportCSV() {
  const fl = V.ent.fields.filter(f => !f.v), list = filtered();
  const q = v => { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v) && isNaN(Number(v))) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
  const lines = [fl.map(f => q(f.l)).join(',')].concat(list.map(r => fl.map(f => q(f.t === 'ref' ? refName(r[f.k]) : r[f.k])).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = V.id + '-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- impor Excel (mis. Dapodik) ---------- */
const NORM = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Nama kolom yang dikenali otomatis (urutan = prioritas). Kolom lain bisa dipilih manual di layar pemetaan.
const ALIAS = {
  npsn: ['npsn'], npsn_sekolah: ['npsn sekolah', 'npsn'],
  nama: ['nama', 'nama lengkap', 'nama gtk', 'nama ptk', 'nama pegawai', 'nama guru', 'nama kepala sekolah'],
  jenjang: ['bentuk pendidikan', 'jenjang', 'bentuk pendidikan id str'],
  status_sekolah: ['status sekolah', 'status sekolah id str', 'status'],
  kecamatan: ['kecamatan'], alamat: ['alamat jalan', 'alamat', 'alamat sekolah'],
  desa: ['desa kelurahan', 'kelurahan', 'desa'],
  no_telp: ['nomor telepon', 'no telepon', 'telepon', 'no telp', 'nomor telp', 'telp'],
  jumlah_siswa: ['jumlah siswa', 'jml siswa', 'jumlah anggota rombel', 'anggota rombel', 'jumlah peserta didik', 'peserta didik'],
  lat: ['lintang', 'latitude', 'lat'], lng: ['bujur', 'longitude', 'lng', 'long'],
  akreditasi: ['akreditasi'],
  nip: ['nip', 'nip nuptk'], nuptk: ['nuptk'], nik: ['nik'],
  jenis_kelamin: ['jenis kelamin', 'jk', 'l p'],
  jabatan: ['jabatan', 'jabatan ptk'], golongan: ['pangkat golongan', 'pangkat gol', 'golongan', 'pangkat', 'gol'],
  unit_kerja: ['unit kerja', 'bidang unit kerja', 'bidang'],
  status: ['status kepegawaian', 'status pegawai', 'status kepegawaian id str', 'status'],
  no_hp: ['no hp', 'nomor hp', 'hp', 'no handphone', 'nomor handphone', 'telepon', 'nomor telepon', 'no telepon'],
  mapel: ['mata pelajaran diajarkan', 'mata pelajaran', 'mapel'],
  pendidikan: ['pendidikan terakhir', 'pendidikan', 'jenjang pendidikan'],
  tmt_tugas: ['tanggal surat tugas', 'tmt tugas', 'tmt', 'tanggal tugas'],
  status_kepsek: ['status jabatan', 'status kepsek'], no_sk: ['nomor sk', 'no sk', 'sk'], tmt: ['tmt jabatan', 'tmt', 'tmt sk'],
  nama_rombel: ['nama rombel', 'nama rombongan belajar', 'rombel', 'rombongan belajar', 'nama kelas'],
  jumlah_rombel: ['jumlah rombel', 'jml rombel', 'jumlah rombongan belajar'],
  jumlah_siswa: ['jumlah siswa', 'jml siswa', 'jumlah anggota rombel', 'anggota rombel', 'jumlah peserta didik', 'peserta didik', 'pd_total', 'pd total', 'total pd', 'jumlah pd'],
  tingkat: ['tingkat', 'tingkat pendidikan', 'tingkat kelas', 'kelas'],
  tahun_ajaran: ['tahun ajaran', 'tahun pelajaran'],
  _sekolah_nama: ['nama sekolah', 'sekolah', 'satuan pendidikan', 'nama satuan pendidikan']
};
const ALIAS_ENT = { sekolah: { nama: ['nama sekolah', 'nama', 'nama satuan pendidikan'] } };
function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function normDate(v) {
  v = String(v || '').trim(); let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v))) return Number(m[1]) < 1901 ? '' : m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  if ((m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/.exec(v))) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}
function loadXLSX() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = res; s.onerror = () => rej(new Error('Pustaka Excel gagal dimuat. Periksa koneksi internet.'));
    document.head.appendChild(s);
  });
}

async function openImport() {
  try { await loadXLSX(); } catch (e) { return toast(e.message, 'er'); }
  const ent = V.ent, id = V.id;
  const fields = ent.fields.filter(f => !f.v && !f.calc);
  const refF = fields.find(f => f.t === 'ref');
  const dateKeys = new Set(fields.filter(f => f.t === 'date').map(f => f.k));
  let targets = fields.map(f => ({ k: f.k, l: f.l, r: f.r, t: f.t }));
  if (id === 'rombel') {
    // Replace Nama Rombel with Jumlah Rombel for rekap import
    targets = targets.filter(t => t.k !== 'nama_rombel');
    targets.push({ k: 'jumlah_rombel', l: 'Jumlah Rombel', r: 1, t: 'number' });
  }
  targets = targets.concat(refF ? [{ k: '_sekolah_nama', l: 'Nama Sekolah (untuk mencari sekolah bila tidak ada kolom NPSN)' }] : []);
  const KEYTXT = { sekolah: 'NPSN', guru: 'NIK (bila kosong: NIP/NUPTK, atau nama + tanggal lahir + sekolah). Satu orang yang bertugas di dua sekolah (Induk & Non Induk) tersimpan sebagai dua baris', kepsek: 'sekolah (satu kepala sekolah per sekolah)', pegawai: 'NIP', rombel: 'NPSN + jumlah rombel + tahun ajaran (format rekap 1 baris per sekolah)' }[id] || 'kunci data';
  const aliasOf = t => ((ALIAS_ENT[id] || {})[t.k] || ALIAS[t.k] || []).map(NORM).concat([NORM(t.l)]);
  const st = { wb: null, sheet: '', grid: [], hdr: 0, map: {}, dirty: false };

  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="box" style="max-width:900px"><div class="mh"><b>Impor Excel — ${esc(ent.title)}</b><button type="button" class="x" aria-label="Tutup">×</button></div>
    <div class="mb"><p class="mu" style="margin-top:0">Unggah file Excel (.xlsx / .xls / .csv), misalnya hasil ekspor Dapodik. Data dicocokkan berdasarkan <b>${esc(KEYTXT)}</b>: yang sudah ada <b>diperbarui</b>, yang belum ada <b>ditambahkan</b>. Data yang tidak ada di file <b>tidak dihapus</b>. Untuk memperbarui di lain waktu, cukup impor file terbaru.</p>
    <div class="tools"><input type="file" id="ifile" accept=".xlsx,.xls,.csv" style="max-width:340px"><button type="button" class="btn sec sm" id="itpl">Unduh template kosong</button></div>
    <div id="iopt"></div><div id="ires"></div></div>
    <div class="mf"><button type="button" class="btn sec" id="icl">Tutup</button><button type="button" class="btn" id="irun" disabled>Mulai Impor</button></div></div>`;
  document.body.appendChild(m);
  const close = async () => {
    m.remove();
    if (st.dirty) { try { if (id === 'sekolah') S.refs = (await api('refs')).refs; await V.reload(); } catch (e) {} }
  };
  $('.x', m).onclick = close; $('#icl', m).onclick = close;

  $('#itpl', m).onclick = () => {
    const head = targets.filter(t => t.k[0] !== '_').map(t => t.t === 'ref' ? 'NPSN Sekolah' : t.l);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head]), 'Data');
    XLSX.writeFile(wb, 'template-' + id + '.xlsx');
  };

  const allAlias = new Set(); targets.forEach(t => aliasOf(t).forEach(a => allAlias.add(a)));
  const detect = grid => {
    let best = 0, bs = -1;
    grid.slice(0, 15).forEach((r, i) => { const s = r.filter(c => allAlias.has(NORM(c))).length; if (s > bs) { bs = s; best = i; } });
    return best;
  };
  const automap = headers => {
    const used = new Set(), hn = headers.map(NORM), map = {};
    targets.forEach(t => {
      map[t.k] = -1;
      for (const a of aliasOf(t)) { const i = hn.findIndex((h, j) => h === a && !used.has(j)); if (i >= 0) { map[t.k] = i; used.add(i); break; } }
    });
    return map;
  };
  const mapRow = r => {
    const o = {};
    targets.forEach(t => {
      const c = st.map[t.k];
      if (c >= 0) { let v = String(r[c] == null ? '' : r[c]).replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, '').trim(); if (/^(null|nan|undefined)$/i.test(v)) v = ''; if (dateKeys.has(t.k)) v = normDate(v); o[t.k] = v; }
    });
    return o;
  };
  const dataRows = () => {
    const out = [];
    for (let i = st.hdr + 1; i < st.grid.length; i++) {
      const r = st.grid[i];
      if (!r.some(c => String(c).trim() !== '')) continue;
      const o = mapRow(r); o._n = i + 1; out.push(o);
    }
    return out;
  };

  const renderPrev = () => {
    const rows = dataRows(), cols = targets.filter(t => st.map[t.k] >= 0), sci = [];
    ['nip', 'nik', 'npsn', 'nuptk', 'npsn_sekolah'].forEach(k => { if (rows.some(r => /e\+/i.test(r[k] || ''))) sci.push(k.toUpperCase()); });
    $('#iprev', m).innerHTML = (sci.length ? `<div class="msg">Kolom ${sci.join(', ')} berisi angka berbentuk ilmiah (contoh 1.98E+17), sehingga digitnya sudah hilang. Ubah kolom itu menjadi format <b>Teks</b> di Excel (atau ambil ulang dari Dapodik), simpan, lalu unggah ulang.</div>` : '')
      + (rows.length ? `<div class="tw"><table><thead><tr><th>Baris</th>${cols.map(t => `<th>${esc(t.l)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 5).map(r => `<tr><td>${r._n}</td>${cols.map(t => `<td>${esc(r[t.k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="mu" style="margin-top:6px">${rows.length} baris data akan diproses (5 baris pertama ditampilkan).</div>` : '<div class="empty">Tidak ada baris data di bawah baris judul.</div>');
    $('#irun', m).disabled = !rows.length || sci.length > 0;
  };
  const renderMap = () => {
    const headers = (st.grid[st.hdr] || []).map(h => String(h == null ? '' : h));
    st.map = automap(headers);
    $('#imap', m).innerHTML = `<div class="tw" style="max-height:300px"><table><thead><tr><th>Data di aplikasi</th><th>Kolom di file Excel</th></tr></thead><tbody>${targets.map(t => `<tr><td>${esc(t.l)}${t.r ? ' <i style="color:var(--er)">*</i>' : ''}</td><td><select data-k="${esc(t.k)}"><option value="-1">— tidak diimpor —</option>${headers.map((h, j) => h.trim() ? `<option value="${j}"${st.map[t.k] === j ? ' selected' : ''}>${colName(j)}: ${esc(h)}</option>` : '').join('')}</select></td></tr>`).join('')}</tbody></table></div>`;
    $$('#imap select', m).forEach(s => s.onchange = () => { st.map[s.dataset.k] = Number(s.value); renderPrev(); });
    renderPrev();
  };
  const buildUI = () => {
    const sheets = st.wb.SheetNames;
    $('#iopt', m).innerHTML = `<div class="fg" style="margin:12px 0">
      ${sheets.length > 1 ? `<div><label>Lembar (sheet)</label><select id="ish">${sheets.map(s => `<option${s === st.sheet ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></div>` : ''}
      <div><label>Baris judul kolom (terdeteksi otomatis)</label><input id="ihd" type="number" min="1" value="${st.hdr + 1}"></div>
      ${id === 'rombel' ? `<div class="full"><label>Tahun ajaran untuk semua baris (diisi bila file tidak memuat kolom Tahun Ajaran)</label><input id="ita" value="${taNow()}" placeholder="2026/2027"></div>` : ''}
      ${refF ? `<div class="full"><label>Sekolah untuk semua baris (isi bila file tidak memuat kolom NPSN)</label><select id="idef"><option value="">— tidak ada —</option>${S.refs.map(s => `<option value="${esc(s.npsn)}">${esc(s.nama)} (${esc(s.jenjang)}) · ${esc(s.npsn)}</option>`).join('')}</select></div>` : ''}
      <div class="full"><label style="font-weight:400"><input type="checkbox" id="ise" checked style="width:auto"> Kolom yang kosong di file tidak menimpa data yang sudah ada (disarankan)</label></div></div>
      <h3>Pemetaan kolom</h3><div id="imap"></div><h3 style="margin-top:14px">Pratinjau</h3><div id="iprev"></div>`;
    if ($('#ish', m)) $('#ish', m).onchange = e => setSheet(e.target.value);
    $('#ihd', m).onchange = e => { st.hdr = Math.max(0, (parseInt(e.target.value, 10) || 1) - 1); renderMap(); };
    renderMap();
  };
  const setSheet = name => {
    st.sheet = name;
    st.grid = XLSX.utils.sheet_to_json(st.wb.Sheets[name], { header: 1, raw: false, defval: '', dateNF: 'yyyy-mm-dd' });
    if (st.grid.length > 50000) { toast('File terlalu besar (maks. 50.000 baris). Pecah menjadi beberapa file.', 'er'); st.grid = []; }
    st.hdr = detect(st.grid);
    buildUI();
  };
  $('#ifile', m).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    $('#ires', m).innerHTML = '';
    try { st.wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' }); }
    catch (er) { return toast('File tidak dapat dibaca. Pastikan formatnya Excel atau CSV.', 'er'); }
    setSheet(st.wb.SheetNames[0]);
  };

  const result = (tot, errs, msg) => {
    $('#ires', m).innerHTML = `<div class="msg ${msg ? '' : 'ok'}">${msg ? esc(msg) + '<br>' : 'Selesai. '}Baru: <b>${tot.baru}</b> · Diperbarui: <b>${tot.upd}</b> · Tanpa perubahan: <b>${tot.sama}</b> · Gagal: <b>${tot.gagal}</b></div>`
      + (errs.length ? `<h3>Baris yang gagal${tot.gagal > errs.length ? ' (' + errs.length + ' pertama)' : ''}</h3><div class="tw" style="max-height:240px"><table><thead><tr><th>Baris Excel</th><th>Alasan</th></tr></thead><tbody>${errs.map(x => `<tr><td>${esc(x.n)}</td><td>${esc(x.msg)}</td></tr>`).join('')}</tbody></table></div>` : '');
  };
  $('#irun', m).onclick = async () => {
    const def = refF ? $('#idef', m).value : '';
    const ta = id === 'rombel' ? $('#ita', m).value.trim() : '';
    const miss = targets.filter(t => t.r && st.map[t.k] < 0 && !(t.t === 'ref' && (def || st.map._sekolah_nama >= 0)) && !(t.k === 'tahun_ajaran' && ta));
    if (miss.length) return toast('Kolom wajib belum dipetakan: ' + miss.map(t => t.l.replace(/ \(.*/, '')).join(', '), 'er');
    let rows = dataRows(), tot = { baru: 0, upd: 0, sama: 0, gagal: 0 }, errs = [];
    // Special for rombel: expand Jumlah Rombel into individual records
    if (id === 'rombel' && rows.some(r => r.jumlah_rombel)) {
      const expanded = [];
      rows.forEach(r => {
        const n = Math.max(1, parseInt(r.jumlah_rombel, 10) || 1);
        const totalSiswa = parseInt(r.jumlah_siswa || r.pd_total || 0, 10) || 0;
        const per = Math.floor(totalSiswa / n);
        const rem = totalSiswa % n;
        for (let k = 0; k < n; k++) {
          const nr = Object.assign({}, r);
          nr.nama_rombel = 'Rombel ' + (k + 1);
          nr.jumlah_siswa = String(per + (k < rem ? 1 : 0));
          nr.tingkat = nr.tingkat || '';
          delete nr.jumlah_rombel;
          expanded.push(nr);
        }
      });
      rows = expanded;
      toast('Mode rekap: ' + rows.length + ' rombel dibuat dari jumlah rombel', 'ok');
    }
    $('#irun', m).disabled = true; $('#ifile', m).disabled = true;
    try {
      for (let i = 0; i < rows.length; i += 200) {
        $('#ires', m).innerHTML = `<div class="msg ok">Mengimpor… ${Math.min(i + 200, rows.length)} / ${rows.length} baris. Jangan tutup halaman ini.</div>`;
        const r = await api('importData', { entity: id, rows: rows.slice(i, i + 200), skipEmpty: $('#ise', m).checked, defaultNpsn: def, defaultTahun: ta });
        st.dirty = true;
        tot.baru += r.baru; tot.upd += r.upd; tot.sama += r.sama; tot.gagal += r.gagal;
        r.errors.forEach(x => errs.push(x));
      }
      result(tot, errs.slice(0, 100));
      $('#iopt', m).hidden = true; $('#icl', m).textContent = 'Selesai';
    } catch (er) {
      st.dirty = true;
      result(tot, errs.slice(0, 100), 'Impor terhenti: ' + er.message + ' Sebagian data mungkin sudah masuk; mengimpor ulang file yang sama aman (tidak menggandakan data).');
      $('#ifile', m).disabled = false; $('#irun', m).disabled = false;
    }
  };
}

/* ---------- lokasi sekolah ---------- */
async function pageLokasi() {
  await ensureLeaflet();
  const ent = S.schema.sekolah; $('#ttl').textContent = 'Lokasi Sekolah';
  $('#view').innerHTML = '<div class="card mu">Memuat…</div>';
  const rows = (await api('list', { entity: 'sekolah' })).rows.filter(r => r.status_sekolah === 'Negeri');   // hanya sekolah negeri
  V = { id: 'sekolah', ent, rows, q: '', flt: {}, page: 1, reload: pageLokasi };
  $('#view').innerHTML = `<div class="card"><div class="tools"><input id="q" type="search" placeholder="Cari sekolah / kecamatan…">
    <select id="jf"><option value="">Semua Jenjang</option>${['TK', 'SD', 'SMP'].map(j => `<option>${j}</option>`).join('')}</select>
    <div class="sp"></div><span class="mu">Hanya sekolah negeri · ${['TK', 'SD', 'SMP'].map(j => `<span class="dot" style="background:${COL[j]}"></span>${j}`).join('')}</span></div>
    <div id="map"></div><div id="ltbl"></div></div>`;
  const draw = () => {
    const q = $('#q').value.toLowerCase(), jf = $('#jf').value;
    const list = rows.filter(r => (!jf || r.jenjang === jf) && (!q || (r.nama + ' ' + r.kecamatan + ' ' + r.npsn).toLowerCase().includes(q)));
    drawMap(list);
    $('#ltbl').innerHTML = list.length ? `<div class="tw" style="max-height:360px"><table><thead><tr><th>Sekolah</th><th>Jenjang</th><th>Kecamatan</th><th>Koordinat</th><th></th></tr></thead><tbody>${list.map(r => {
      const ok = isFinite(parseFloat(r.lat)) && isFinite(parseFloat(r.lng)) && r.lat !== '' && r.lng !== '';
      return `<tr><td>${esc(r.nama)}</td><td>${cell({ t: 'select' }, r.jenjang)}</td><td>${esc(r.kecamatan)}</td><td>${ok ? esc(r.lat + ', ' + r.lng) : '<span class="mu">belum diisi</span>'}</td>
      <td class="act">${ok ? `<a class="btn sm sec" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(r.lat + ',' + r.lng)}">Google Maps</a> ` : ''}${ent.ops.includes('update') ? `<button class="btn sm sec" data-id="${esc(r.id)}">Ubah lokasi</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty">Tidak ada sekolah negeri yang cocok. Pastikan kolom Status Sekolah di Data Sekolah sudah terisi \"Negeri\".</div>';
  };
  $('#q').oninput = draw; $('#jf').onchange = draw;
  $('#ltbl').onclick = e => { const b = e.target.closest('button[data-id]'); if (b) openForm(rows.find(r => r.id === b.dataset.id)); };
  draw();
}
function drawMap(list) {
  if (typeof L === 'undefined') { $('#map').innerHTML = '<div class="empty">Peta tidak dapat dimuat (periksa koneksi internet).</div>'; return; }
  if (!MAP) {
    MAP = L.map('map').setView([-2.5, 118], 5);
    const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
    const satelit = L.tileLayer(esri + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 18, attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics' });
    const label = L.tileLayer(esri + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 18, attribution: '&copy; Esri' });
    const jalan = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' });
    satelit.addTo(MAP); label.addTo(MAP);   // tampilan awal: satelit + nama tempat
    L.control.layers({ 'Satelit': satelit, 'Peta jalan': jalan }, { 'Nama tempat': label }, { collapsed: false }).addTo(MAP);
    MAP._lg = L.layerGroup().addTo(MAP);
  }
  MAP._lg.clearLayers(); const pts = [];
  list.forEach(r => {
    const la = parseFloat(r.lat), ln = parseFloat(r.lng);
    if (r.lat === '' || r.lng === '' || !isFinite(la) || !isFinite(ln) || (la === 0 && ln === 0)) return;
    L.circleMarker([la, ln], { radius: 8, color: '#fff', weight: 2, fillColor: COL[r.jenjang] || '#555', fillOpacity: .9 })
      .bindPopup(`<b>${esc(r.nama)}</b><br>${esc(r.jenjang)} · ${esc(r.kecamatan)}<br>NPSN ${esc(r.npsn)}`).addTo(MAP._lg);
    pts.push([la, ln]);
  });
  if (pts.length) MAP.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
  setTimeout(() => MAP && MAP.invalidateSize(), 80);
}

/* ---------- mulai ---------- */
(async function boot() {
  showLogin(); // tampilkan dulu agar terasa cepat
  const tk = sessionStorage.getItem('tk');
  if (tk) {
    S.token = tk;
    try {
      const data = await api('bootstrap');
      document.querySelector('.login-wrap')?.remove();
      init(data);
    } catch (e) {
      sessionStorage.removeItem('tk');
    }
  }
})();

/* ---------- Mediasi Perceraian: cetak dokumen ---------- */
const KOP = `<div style="display:flex;align-items:center;gap:12px;border-bottom:3px double #000;padding-bottom:6px;margin-bottom:14px">
  <img src="https://raw.githubusercontent.com/gtkkotim2026-alt/DIKO-Dinas-Pendidikan-Kotim-/main/kotim%20kecil%20Ikon.png" style="width:70px;height:auto;flex:none" alt="Logo">
  <div style="flex:1;text-align:center;line-height:1.25">
    <div style="font-weight:700;font-size:13px">PEMERINTAH KABUPATEN KOTAWARINGIN TIMUR</div>
    <div style="font-weight:800;font-size:16px;letter-spacing:.3px">DINAS PENDIDIKAN</div>
    <div style="font-size:11px">Alamat : Jalan Jenderal Sudirman Km. 7 &nbsp; Telepon (0531) 21426 &nbsp; SAMPIT</div>
    <div style="font-size:11px">e-mail : disdik@kotimkab.go.id &nbsp;&nbsp; Laman : disdik.kotimkab.go.id</div>
  </div>
</div>`;

const KADIS = { nama: 'Yolanda Lonita Fenisia, S.STP., M.Si', nip: '198104141999122001', pangkat: 'Pembina Tingkat I' };
const PEWAWANCARA = { nama: 'EDIE SUCIPTO, S.Pd.I.,M.Pd', nip: '19810903 200904 1 001', jabatan: 'Kepala Bidang Pembinaan Ketenagaan' };

function openPrint(title, body) {
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${esc(title)}</title>
    <style>
      @page { size: 215mm 330mm; margin: 20mm; }
      body{font:12pt/1.0 Arial,Helvetica,sans-serif;margin:0;color:#000}
      h2{text-align:center;margin:12px 0;font-size:13pt;text-transform:uppercase;letter-spacing:.2px}
      .right{text-align:right}
      .sign{margin-top:30px;display:flex;justify-content:space-between}
      .sign>div{text-align:center;width:45%}
      ol{margin:6px 0 8px;padding-left:20px}
      li{margin:2px 0}
      table.info td{padding:1px 4px;vertical-align:top}
      @media print{
        body{margin:0}
      }
    </style></head><body>
    ${KOP}${body}
    <script>window.onload=()=>setTimeout(()=>window.print(),400)</script>
    </body></html>`);
  w.document.close();
}

function cetakUndangan(r) {
  modal('Data Undangan Mediasi', `
    <div class="fg">
      <div><label>Hari</label><input id="u_hari" value="Senin" required></div>
      <div><label>Tanggal</label><input id="u_tgl" type="date" required></div>
      <div><label>Pukul</label><input id="u_pukul" value="09.00 WIB s.d. selesai" required></div>
      <div class="full"><label>Tempat</label><input id="u_tempat" value="Ruang Pembinaan Ketenagaan Dinas Pendidikan Kabupaten Kotawaringin Timur" required></div>
    </div>`, async m => {
    const hari = $('#u_hari', m).value;
    const tgl = $('#u_tgl', m).value;
    const pukul = $('#u_pukul', m).value;
    const tempat = $('#u_tempat', m).value;
    const tglSurat = new Date().toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'});
    const body = `<div class="right">Sampit, ${tglSurat}</div>
      <table style="margin:8px 0 16px;font-size:12px">
        <tr><td style="width:70px">Nomor</td><td>: 800.1.6.1/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/DISDIK-5/2026</td></tr>
        <tr><td>Sifat</td><td>: Rahasia</td></tr>
        <tr><td>Lampiran</td><td>: -</td></tr>
        <tr><td>Hal</td><td>: <b>Panggilan Klarifikasi / Undangan Mediasi</b></td></tr>
      </table>
      <p><b>Yth. ${esc(r.nama || '')}</b><br>di –<br>&nbsp;&nbsp;&nbsp;Tempat</p>
      <p>Sehubungan dengan adanya proses penelaahan dan klarifikasi yang dilaksanakan oleh Dinas Pendidikan Kabupaten Kotawaringin Timur, dengan ini Saudara/i diminta untuk hadir guna memberikan keterangan sebagai pihak yang terkait.</p>
      <p>Berkenaan dengan hal tersebut, dengan ini kami mohon kehadiran Saudara/i pada:</p>
      <table class="info">
        <tr><td style="width:80px">Hari</td><td>: ${esc(hari)}</td></tr>
        <tr><td>Tanggal</td><td>: ${esc(fmtDate(tgl))}</td></tr>
        <tr><td>Waktu</td><td>: ${esc(pukul)}</td></tr>
        <tr><td>Tempat</td><td>: ${esc(tempat)}</td></tr>
      </table>
      <p>Demikian Surat Panggilan ini disampaikan, atas kehadirannya diucapkan terima kasih.</p>
      <div class="sign">
        <div></div>
        <div>Kepala Dinas,<br><br><br><br><b>${KADIS.nama}</b><br>${KADIS.pangkat}<br>NIP ${KADIS.nip}</div>
      </div>
      <p style="margin-top:24px;font-size:11px"><b>Tembusan</b> disampaikan kepada Yth.:<br>
      1. Bupati Kotawaringin Timur di Sampit (sebagai laporan)<br>
      2. Pj. Sekretaris Daerah Kabupaten Kotawaringin Timur di Sampit<br>
      3. Inspektur Daerah Kabupaten Kotawaringin Timur di Sampit<br>
      4. Kepala BKPSDM Kabupaten Kotawaringin Timur di Sampit</p>`;
    openPrint('Undangan / Panggilan Mediasi', body);
  }, { ok: 'Cetak' });
}

function cetakBA(r) {
  const form = `
    <div style="max-height:70vh;overflow:auto;padding-right:8px">
      <h4 style="margin:8px 0 4px">1. Pihak yang diwawancarai</h4>
      <div class="fg">
        <div><label>Kedudukan</label><select id="ba_kedudukan"><option>Penggugat</option><option>Tergugat</option></select></div>
        <div><label>Sebagai</label><select id="ba_sebagai"><option>Istri</option><option>Suami</option></select></div>
        <div class="full"><label>Nama pasangan</label><input id="ba_pasangan"></div>
      </div>
      <h4 style="margin:12px 0 4px">2. Waktu & Petugas</h4>
      <div class="fg">
        <div class="full"><label>Hari & Tanggal</label><input id="ba_hari" placeholder="Kamis, 29 Oktober 2026" required></div>
        <div><label>Pewawancara</label><input id="ba_pew" value="${PEWAWANCARA.nama}"></div>
        <div><label>NIP Pewawancara</label><input id="ba_pewnip" value="${PEWAWANCARA.nip}"></div>
      </div>
      <h4 style="margin:12px 0 4px">3. Pertanyaan Wawancara</h4>
      <p class="mu" style="font-size:12px">Tulis jawaban di bawah setiap pertanyaan. Kosongkan jika tidak dijawab.</p>
      <div id="ba_pertanyaan"></div>
      <h4 style="margin:12px 0 4px">4. Hasil Mediasi</h4>
      <div class="fg">
        <div><label>Hasil</label><select id="ba_hasil"><option>Gagal</option><option>Berhasil</option></select></div>
        <div class="full"><label>Catatan / Kesimpulan</label><textarea id="ba_catatan" rows="3"></textarea></div>
      </div>
    </div>`;
  modal('Pengisian BAP Mediasi', form, async m => {
    const ked = $('#ba_kedudukan', m).value;
    const hari = $('#ba_hari', m).value;
    const pew = $('#ba_pew', m).value;
    const pewnip = $('#ba_pewnip', m).value;
    const hasil = $('#ba_hasil', m).value;
    const catatan = $('#ba_catatan', m).value;
    const answers = [];
    $$('.ba-jawab', m).forEach(el => {
      if (el.value.trim()) answers.push({ q: el.dataset.q, a: el.value.trim() });
    });
    let isi = answers.map((x, i) => `<p><b>${i+1}. ${esc(x.q)}</b><br>${esc(x.a).replace(/\n/g,'<br>')}</p>`).join('');
    if (catatan) isi += `<p><b>Kesimpulan:</b><br>${esc(catatan)}</p>`;
    const body = `<h2>Berita Acara<br>Keterangan Perceraian</h2>
      <p>Pada hari ini, ${esc(hari)}, bertempat di ruang Bidang Pembinaan Ketenagaan Dinas Pendidikan Kabupaten Kotawaringin Timur, yang bertanda tangan di bawah ini:</p>
      <table class="info"><tr><td style="width:90px">Nama</td><td>: <b>${esc(pew)}</b></td></tr>
      <tr><td>NIP</td><td>: ${esc(pewnip)}</td></tr></table>
      <p>selaku Pewawancara, telah melakukan wawancara/mediasi terhadap:</p>
      <table class="info"><tr><td style="width:90px">Nama</td><td>: <b>${esc(r.nama || '')}</b></td></tr>
      <tr><td>NIP</td><td>: ${esc(r.nip || '')}</td></tr>
      <tr><td>Jabatan</td><td>: ${esc(r.jabatan || 'Guru')}</td></tr>
      <tr><td>Asal Sekolah</td><td>: ${esc(refName(r.npsn) || '')}</td></tr>
      <tr><td>Kedudukan</td><td>: ${esc(ked)}</td></tr></table>
      <p>sehubungan dengan permohonan izin perceraian, dengan hasil sebagai berikut:</p>
      ${isi}
      <p style="margin-top:16px"><b>Hasil Mediasi: ${esc(hasil)}</b></p>
      <p>Demikian Berita Acara ini dibuat dengan sebenarnya.</p>
      <div class="sign"><div>Yang Memberikan Keterangan<br><br><br><br><b>${esc(r.nama || '')}</b></div>
      <div>Pewawancara<br><br><br><br><b>${esc(pew)}</b></div></div>
      <p style="text-align:center;margin-top:16px;font-weight:700">DOKUMENTASI</p>`;
    openPrint('BA Mediasi', body);
  }, { ok: 'Simpan & Cetak BA' });

  // Render questions based on kedudukan
  setTimeout(() => {
    const qPenggugat = [
      ['A. Identitas dan Latar Belakang', [
        'Sejak kapan menikah dengan pasangan?',
        'Apakah pernikahan sah secara agama dan negara?',
        'Apakah telah dikaruniai anak? Jika ya, berapa dan berapa usianya?'
      ]],
      ['B. Alasan Mengajukan Gugatan', [
        'Apa alasan utama mengajukan gugatan cerai?',
        'Sejak kapan permasalahan mulai terjadi?',
        'Apakah pernah terjadi KDRT atau penelantaran?'
      ]],
      ['C. Upaya Perdamaian', [
        'Apakah sebelumnya pernah ada upaya mediasi?',
        'Apakah masih berkeinginan rukun kembali?'
      ]]
    ];
    const qTergugat = [
      ['A. Tanggapan terhadap Gugatan', [
        'Apakah mengetahui istri/suami mengajukan cerai? Apa tanggapan Anda?',
        'Menurut Anda, apa penyebab utama permasalahan?',
        'Sejak kapan permasalahan mulai terjadi?'
      ]],
      ['B. Pemenuhan Nafkah', [
        'Apakah sudah memenuhi kewajiban nafkah lahir dan batin?',
        'Bagaimana kondisi anak dan harta bersama?'
      ]],
      ['C. Sikap dan Harapan', [
        'Apakah menerima atau menolak keputusan pasangan untuk bercerai?',
        'Apa harapan Anda terhadap penyelesaian perkara ini?'
      ]]
    ];
    function renderQ() {
      const ked = $('#ba_kedudukan').value;
      const groups = ked === 'Tergugat' ? qTergugat : qPenggugat;
      let h = '';
      groups.forEach(g => {
        h += `<p style="margin:10px 0 4px;font-weight:700">${esc(g[0])}</p>`;
        g[1].forEach(q => {
          h += `<div style="margin-bottom:8px"><label style="font-size:12.5px">${esc(q)}</label><textarea class="ba-jawab" data-q="${esc(q)}" rows="2" style="width:100%;margin-top:2px"></textarea></div>`;
        });
      });
      $('#ba_pertanyaan').innerHTML = h;
    }
    $('#ba_kedudukan').onchange = renderQ;
    renderQ();
  }, 100);
}

function cetakPernyataan(r) {
  const tgl = new Date().toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'});
  const body = `<h2>Surat Pernyataan<br>Tidak Dapat Dipertemukan / Dimediasi Kembali</h2>
    <p>Yang bertanda tangan di bawah ini:</p>
    <table class="info">
      <tr><td style="width:100px">Nama</td><td>: <b>${esc(r.nama || '')}</b></td></tr>
      <tr><td>NIP</td><td>: ${esc(r.nip || '')}</td></tr>
      <tr><td>Jabatan</td><td>: ${esc(r.jabatan || '')}</td></tr>
      <tr><td>Asal Sekolah</td><td>: ${esc(refName(r.npsn) || '')}</td></tr>
    </table>
    <p>Dengan ini menyatakan dengan sebenarnya bahwa:</p>
    <ol>
      <li>Saya telah mengikuti proses mediasi dalam perkara perceraian yang saya ajukan/hadapi;</li>
      <li>Bahwa setelah dilakukan upaya mediasi tersebut, saya dan pihak pasangan tetap tidak dapat dipertemukan/didamaikan kembali untuk hidup rukun sebagai suami istri;</li>
      <li>Bahwa keputusan ini saya ambil secara sadar, tanpa paksaan dari pihak manapun;</li>
      <li>Surat pernyataan ini saya buat dengan sebenar-benarnya untuk dipergunakan sebagai bahan pertimbangan/kelengkapan berkas.</li>
    </ol>
    <p>Demikian surat pernyataan ini saya buat dengan penuh tanggung jawab.</p>
    <div class="sign">
      <div></div>
      <div>Sampit, ${tgl}<br>Yang membuat pernyataan,<br><br><br><br><b>${esc(r.nama || '')}</b><br>NIP. ${esc(r.nip || '')}</div>
    </div>`;
  openPrint('Surat Pernyataan Gagal Mediasi', body);
}

function cetakPelimpahan(r) {
  const tgl = new Date().toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'});
  const body = `<div class="right">Sampit, ${tgl}</div>
    <table style="margin:6px 0 14px;font-size:12px">
      <tr><td style="width:70px">Nomor</td><td>: 800.1.6.1/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/DISDIK-5/2026</td></tr>
      <tr><td>Sifat</td><td>: Penting</td></tr>
      <tr><td>Lampiran</td><td>: 1 (satu) berkas</td></tr>
      <tr><td>Hal</td><td>: <b>Pelimpahan Penerbitan Rekomendasi</b></td></tr>
    </table>
    <p>Yth. Kepala Badan Kepegawaian dan Pengembangan<br>Sumber Daya Manusia<br>Kabupaten Kotawaringin Timur<br>di -<br>&nbsp;&nbsp;&nbsp;Sampit</p>
    <p>Menindaklanjuti permohonan izin cerai atas nama <b>${esc(r.nama || '')}</b>, NIP ${esc(r.nip || '')}, ${esc(r.jabatan || 'Guru')} di ${esc(refName(r.npsn) || '')}, bersama ini dilaporkan bahwa yang bersangkutan beserta pasangan telah dipanggil dan dilakukan pemeriksaan serta mediasi (sebagaimana Berita Acara terlampir).</p>
    <p>Sehubungan kedua belah pihak (suami dan istri) telah hadir dalam pemanggilan dan dilakukan upaya mediasi, namun mediasi tidak berhasil mendamaikan kedua belah pihak. Maka selanjutnya, untuk penyelesaian dan penerbitan rekomendasi perceraian diserahkan ke BKPSDM Kabupaten Kotawaringin Timur.</p>
    <p>Demikian disampaikan untuk diketahui dan diproses sebagaimana mestinya, terima kasih.</p>
    <div class="sign">
      <div></div>
      <div>Kepala Dinas,<br><br><br><br><b>${KADIS.nama}</b><br>${KADIS.pangkat}<br>NIP ${KADIS.nip}</div>
    </div>
    <p style="margin-top:28px;font-size:11px"><b>Tembusan</b> disampaikan kepada Yth.:<br>
    1. Bupati Kotawaringin Timur di Sampit (sebagai laporan)<br>
    2. Pj. Sekretaris Daerah Kabupaten Kotawaringin Timur di Sampit<br>
    3. Inspektur Daerah Kabupaten Kotawaringin Timur di Sampit</p>`;
  openPrint('Pelimpahan ke BKPSDM', body);
}
