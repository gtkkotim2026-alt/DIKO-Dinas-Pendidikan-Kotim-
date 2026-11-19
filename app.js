'use strict';
/* SIM Disdik — frontend. Semua data diambil dari Google Apps Script (lihat Code.gs). */
const CFG = window.APP_CONFIG || {};
const S = { token: null, user: null, schema: {}, refs: [] };
let V = null, MAP = null, busy = 0;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ROLE = { superadmin: 'Super Admin', pengguna: 'Pengguna', sekolah: 'Sekolah', guru: 'Guru' };
const COL = { TK: '#f79009', SD: '#1b5fc4', SMP: '#12805c' };
const MENU = [
  { id: 'portal_guru', t: 'Portal Guru', ico: '📱' },
  { id: 'pegawai', t: 'Pegawai Disdik', ico: '👥' },
  { g: 'Satuan Pendidikan', items: [
    { id: 'sekolah', t: 'Data Sekolah', ico: '🏫' }, { id: 'guru', t: 'Data Guru', ico: '👨‍🏫' }, { id: 'kepsek', t: 'Data Kepala Sekolah', ico: '👨‍💼' },
    { id: 'lokasi', t: 'Lokasi Sekolah', ico: '📍' }, { id: 'rombel', t: 'Data Rombel', ico: '📚' }, { id: 'kebutuhan', t: 'Kebutuhan Guru', ico: '📋' }] },
  { id: 'mutasi', t: 'Mutasi', ico: '🔄' },
  { id: 'mediasi', t: 'Mediasi Perceraian', ico: '⚖️' },
  { id: 'disiplin', t: 'Pembinaan Disiplin', ico: '📝' },
  { g: 'Promosi', items: [{ id: 'usul_plt', t: 'Usul Plt Kepsek', ico: '⭐' }, { id: 'usul_definitif', t: 'Usul Kepsek Definitif', ico: '🏆' }] },
  { g: 'Administrasi', items: [{ id: 'pendaftaran', t: 'Pendaftaran Sekolah', ico: '📄' }, { id: 'users', t: 'Pengguna', ico: '👤' }] }
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
function setBusy(n) { busy += n; $('#bar').style.display = busy > 0 ? 'block' : 'none'; }
async function api(action, payload = {}) {
  if (!CFG.API_URL || CFG.API_URL.indexOf('GANTI') >= 0) throw new Error('API_URL belum diisi di config.js');
  setBusy(1);
  try {
    let res;
    try {
      res = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, token: S.token }, payload)) });
    } catch (e) { throw new Error('Tidak dapat terhubung ke server. Periksa koneksi & URL Web App.'); }
    const j = await res.json();
    if (!j.ok) { if (j.expired) doLogout(true); throw new Error(j.error || 'Terjadi kesalahan'); }
    return j;
  } finally { setBusy(-1); }
}
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
  if (f.t === 'textarea') return `<textarea id="${id}" rows="3"${rq}>${esc(v)}</textarea>`;
  if (f.t === 'select') return `<select id="${id}"${rq}><option value="">— pilih —</option>${f.o.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  if (f.t === 'ref') return `<select id="${id}"${rq}><option value="">— pilih sekolah —</option>${S.refs.map(s => `<option value="${esc(s.npsn)}"${s.npsn === v ? ' selected' : ''}>${esc(s.nama)} (${esc(s.jenjang)}) · ${esc(s.npsn)}</option>`).join('')}</select>`;
  const type = { number: 'number', date: 'date', tel: 'tel', password: 'password' }[f.t] || 'text';
  return `<input id="${id}" type="${type}"${f.t === 'number' ? ' step="any"' : ''}${f.t === 'password' ? ' data-pw autocomplete="new-password"' : ''} value="${esc(v)}"${rq}>`;
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
  $('#ab').innerHTML = `<form id="ff"><p class="mu">Masukkan username Anda (untuk sekolah: NPSN). Kode OTP akan dikirim lewat WhatsApp ke nomor yang terdaftar pada akun.</p>
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
  $('#root').innerHTML = `<div class="app"><aside id="side"><div class="brand">
    <div class="brand-logo">D</div>
    <div class="brand-text">
      <div class="brand-name">DIKO</div>
      <div class="brand-sub">Sistem Informasi Terintegrasi</div>
    </div>
  </div><nav id="nav"></nav></aside>
    <div class="main"><header><button class="btn sec sm" id="burger" aria-label="Menu">☰</button><h1 id="ttl"></h1><div class="sp"></div>
    <span class="who"><img src="${S.user.foto || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(S.user.nama) + '&background=1a56db&color=fff&size=32'}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;margin-right:8px;vertical-align:middle" alt="">${esc(S.user.nama)} <span class="badge">${ROLE[S.user.role]}</span></span>
    <button class="btn sec sm" id="wa">No. WA</button><button class="btn sec sm" id="pw">Ubah Password</button><button class="btn sec sm" id="out">Keluar</button></header><main id="view"></main></div></div><div id="scrim"></div>`;
  $('#burger').onclick = () => document.body.classList.toggle('nav-open');
  $('#scrim').onclick = () => document.body.classList.remove('nav-open');
  $('#out').onclick = () => doLogout(false);
  $('#pw').onclick = openPw;
  $('#wa').onclick = openWa;
  const isGuru = S.user.role === 'guru';
  const allowed = id => {
    if (isGuru) return id === 'portal_guru' || id === 'mutasi' || id === 'mediasi';
    return id === 'dashboard' || (id === 'lokasi' ? !!S.schema.sekolah : id === 'kebutuhan' ? !!S.schema.rombel : !!S.schema[id]);
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
  try { id === 'dashboard' ? await pageDash() : id === 'portal_guru' ? await pagePortalGuru() : id === 'lokasi' ? await pageLokasi() : id === 'kebutuhan' ? await pageKebutuhan() : await pageEntity(id); }
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

function openWa() {
  modal('Nomor WhatsApp', `<p class="mu">Nomor ini dipakai menerima kode OTP saat lupa password. ${S.user.wa_mask ? 'Nomor saat ini: <b>' + esc(S.user.wa_mask) + '</b>.' : 'Belum ada nomor terdaftar.'}</p>
    <div class="fg"><div><label for="w1">Nomor WhatsApp baru</label><input id="w1" type="tel" placeholder="0812xxxxxxx" required></div>
    <div><label for="w2">Password Anda (konfirmasi)</label><input id="w2" type="password" data-pw required></div><div class="full">${SHOWPW}</div></div>`, async () => {
    const r = await api('setWa', { noWa: $('#w1').value, password: $('#w2').value });
    S.user.wa_mask = r.mask; toast('Nomor WhatsApp disimpan', 'ok');
  });
  bindShow(document.body.lastElementChild);
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

async function pageDash() {
  $('#ttl').textContent = 'Dashboard';
  $('#view').innerHTML = '<div class="card mu">Memuat…</div>';
  const st = await api('stats');
  const now = new Date();

  let h = `<div class="dash-welcome">
    <div>
      <div class="eyebrow">DASHBOARD</div>
      <h2>Sistem Satu Data Pendidikan</h2>
      <p>Kabupaten — DIKO</p>
    </div>
    <div class="dash-date">HARI INI<br><b>${now.getDate()}</b><br>${now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</div>
  </div>`;

  if (st.menunggu) h += `<a class="stat wr" href="#/pendaftaran" style="margin-bottom:16px;display:block"><b>${st.menunggu}</b>Pendaftaran sekolah menunggu verifikasi</a>`;

  // Layout mirip Satu Data: 2 kolom
  h += `<div style="display:grid;grid-template-columns:1.1fr 1fr;gap:16px;margin-bottom:20px">
    <div>
      <div class="dash-kpis" style="grid-template-columns:1fr 1fr;gap:12px">
        <div class="kpi-card"><div class="kpi-icon" style="background:#dbeafe;color:#1d4ed8">🏫</div><div><b>${(st.counts.sekolah||0).toLocaleString('id')}</b><small>Sekolah</small></div></div>
        <div class="kpi-card"><div class="kpi-icon" style="background:#dbeafe;color:#1d4ed8">👨‍🎓</div><div><b>${(st.total_siswa||0).toLocaleString('id')}</b><small>Peserta Didik</small></div></div>
        <div class="kpi-card"><div class="kpi-icon" style="background:#dbeafe;color:#1d4ed8">👨‍🏫</div><div><b>${(st.counts.guru||0).toLocaleString('id')}</b><small>Guru</small></div></div>
        <div class="kpi-card"><div class="kpi-icon" style="background:#dbeafe;color:#1d4ed8">💼</div><div><b>${(st.counts.pegawai||0).toLocaleString('id')}</b><small>Tendik</small></div></div>
      </div>
    </div>
    <div class="card" style="margin:0">
      <div class="tw"><table><thead><tr style="background:#0ea5e9;color:#fff"><th>#</th><th>Sekolah</th><th>Peserta Didik</th><th>Guru</th><th>Tendik</th><th>Aksi</th></tr></thead><tbody>
        <tr><td>1</td><td>PAUD / TK</td><td>${st.jenjang?.TK||'-'}</td><td>-</td><td>-</td><td><a class="btn sm sec" href="#/sekolah">Detail</a></td></tr>
        <tr><td>2</td><td>SD</td><td>${st.jenjang?.SD||'-'}</td><td>-</td><td>-</td><td><a class="btn sm sec" href="#/sekolah">Detail</a></td></tr>
        <tr><td>3</td><td>SMP</td><td>${st.jenjang?.SMP||'-'}</td><td>-</td><td>-</td><td><a class="btn sm sec" href="#/sekolah">Detail</a></td></tr>
        <tr style="font-weight:700;background:#f1f5f9"><td></td><td>TOTAL</td><td>${(st.counts.sekolah||0).toLocaleString('id')}</td><td>${(st.counts.guru||0).toLocaleString('id')}</td><td>${(st.counts.pegawai||0).toLocaleString('id')}</td><td></td></tr>
      </tbody></table></div>
    </div>
  </div>`;

  if (S.schema.rombel && st.kek) {
    h += `<div class="dash-section"><div class="section-heading"><h3>Kebutuhan Guru</h3><a class="text-link" href="#/kebutuhan">Lihat analisis →</a></div>
    <div class="dash-kpis">`;
    ['TK','SD','SMP'].forEach(j => {
      const x = st.kek[j] || {kurang:0, lebih:0};
      h += `<div class="kpi-card"><div class="kpi-icon" style="background:#fef3c7;color:#d97706">📊</div><div><b style="color:var(--er)">${fnum(x.kurang)}</b><small>Kurang — ${j}</small></div></div>`;
    });
    h += `</div></div>`;
  }

  // Theme settings (sementara selalu muncul agar bisa dites)
  h += `<div class="card" style="margin-top:20px;border:2px solid #1a56db">
      <h3>Pengaturan Tampilan (Super Admin)</h3>
      <p class="mu">Ganti warna utama dan logo aplikasi. Perubahan tersimpan di browser ini.</p>
      <div class="fg" style="margin-top:12px">
        <div><label>Warna Utama</label><input type="color" id="themeColor" value="#1a56db"></div>
        <div><label>Logo (URL gambar)</label><input id="themeLogo" placeholder="https://contoh.com/logo.png"></div>
        <div class="full"><button class="btn" id="saveTheme">Simpan Tema</button> <button class="btn sec" id="resetTheme">Reset</button></div>
      </div>
    </div>`;

  $('#view').innerHTML = h;

  // Theme handlers (always attached)
  const saved = JSON.parse(localStorage.getItem('dikoTheme') || '{}');
  if (saved.color && $('#themeColor')) $('#themeColor').value = saved.color;
  if (saved.logo && $('#themeLogo')) $('#themeLogo').value = saved.logo;
  if ($('#saveTheme')) $('#saveTheme').onclick = () => {
    const theme = { color: $('#themeColor').value, logo: $('#themeLogo').value.trim() };
    localStorage.setItem('dikoTheme', JSON.stringify(theme));
    applyTheme(theme);
    toast('Tema disimpan', 'ok');
  };
  if ($('#resetTheme')) $('#resetTheme').onclick = () => {
    localStorage.removeItem('dikoTheme');
    applyTheme({});
    toast('Tema direset', 'ok');
    setTimeout(() => location.reload(), 500);
  };
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme.color) {
    root.style.setProperty('--p', theme.color);
    // update gradients roughly
    document.querySelectorAll('.btn:not(.sec):not(.dan)').forEach(b => b.style.background = `linear-gradient(135deg, ${theme.color}, ${theme.color})`);
  }
  if (theme.logo) {
    const logo = document.querySelector('.brand-logo');
    if (logo) logo.innerHTML = `<img src="${theme.logo}" style="width:100%;height:100%;object-fit:cover;border-radius:14px" alt="logo">`;
  }
}

// Apply saved theme on load
(function(){
  const saved = JSON.parse(localStorage.getItem('dikoTheme') || '{}');
  if (saved.color || saved.logo) applyTheme(saved);
})();

/* ---------- kebutuhan guru: dihitung otomatis dari data rombel ---------- */
const fnum = n => String(Math.round((Number(n) || 0) * 10) / 10).replace('.', ',');
const taNow = () => { const d = new Date(), y = d.getFullYear(), a = d.getMonth() >= 6 ? y : y - 1; return a + '/' + (a + 1); };
const K = { jenjang: 'SD', tahun: '', hitung: 'semua', q: '', st: '', d: null };
const HITUNG = { semua: 'Semua guru terdata', asn: 'PNS + PPPK (tanpa paruh waktu)' };
const STFLT = { '': 'Semua status', kurang: 'Ada kekurangan guru', lebih: 'Ada kelebihan guru', sesuai: 'Sudah sesuai', kosong: 'Rombel belum diisi' };
const stOk = (r, f) => !f || (f === 'kurang' && r.kurang > 0) || (f === 'lebih' && r.lebih > 0) || (f === 'sesuai' && r.status === 'Sesuai') || (f === 'kosong' && !r.ada_rombel);
const stBadge = s => `<span class="badge ${{ 'Sesuai': 'ok', 'Kurang': 'er', 'Kurang & Lebih': 'er', 'Lebih': 'wr' }[s] || ''}">${esc(s)}</span>`;
const nK = v => v > 0 ? `<b style="color:var(--er)">${fnum(v)}</b>` : '<span class="mu">0</span>';
const nL = v => v > 0 ? `<b style="color:#b54708">${fnum(v)}</b>` : '<span class="mu">0</span>';
const kStd = k => K.d.standar.kat.find(x => x.k === k) || { n: k, rumus: '' };
const ktitle = () => `Analisis Kebutuhan Guru ${K.jenjang} Negeri — Tahun Ajaran ${K.d.tahun}`;

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
    <select id="khit">${Object.keys(HITUNG).map(k => `<option value="${k}"${k === K.hitung ? ' selected' : ''}>${HITUNG[k]}</option>`).join('')}</select>
    <div class="sp"></div>
    <button class="btn sec" id="kp1">Cetak Rekap</button><button class="btn sec" id="kp2">Cetak + Rincian Sekolah</button><button class="btn sec" id="kcsv">Ekspor CSV</button></div>
    <p class="mu" style="margin:10px 0 0">${esc(ktitle())} · Hanya sekolah negeri (TKN/TK Negeri, SDN/SD Negeri, SMPN/SMP Negeri) · Guru yang dihitung: ${esc(HITUNG[K.hitung])}</p></div>
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
  $('#kdp', m).onclick = () => printDoc('Rincian Kebutuhan Guru — ' + r.nama, `<h1>RINCIAN KEBUTUHAN GURU</h1><div class="sub">${esc(r.nama)} · NPSN ${esc(r.npsn)} · ${esc(r.kecamatan)}<br>Tahun Ajaran ${esc(K.d.tahun)} · Guru dihitung: ${esc(HITUNG[K.hitung])}</div>${kDetail(r, true)}${kSign()}`, false);
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
  let b = `<h1>ANALISIS KEBUTUHAN GURU ${esc(K.jenjang)}</h1><div class="sub">Tahun Ajaran ${esc(d.tahun)} · Guru yang dihitung: ${esc(HITUNG[K.hitung])}${K.st || K.q ? '<br>Daftar dibatasi sesuai filter: ' + esc(STFLT[K.st]) + (K.q ? ' · “' + esc(K.q) + '”' : '') : ''}</div>
  <div class="box"><div><b>${t.sekolah_rombel}/${t.sekolah}</b>Sekolah (ada rombel)</div><div><b>${t.rombel}</b>Rombel</div><div><b>${fnum(t.butuh)}</b>Dibutuhkan</div><div><b>${fnum(t.ada)}</b>Tersedia</div><div><b class="k">${fnum(t.kurang)}</b>Kekurangan</div><div><b class="l">${fnum(t.lebih)}</b>Kelebihan</div></div>
  <h2>Rekap per jenis guru</h2><table><thead><tr><th>Jenis guru</th><th>Cara menghitung (per sekolah)</th><th>Dibutuhkan</th><th>Ada</th><th>Kurang</th><th>Lebih</th></tr></thead><tbody>${d.kategori.map(c => `<tr><td>${esc(c.n)}</td><td>${esc(c.rumus)}</td><td>${fnum(c.butuh)}</td><td>${fnum(c.ada)}</td><td>${c.kurang > 0 ? `<span class="k">${fnum(c.kurang)}</span>` : 0}</td><td>${c.lebih > 0 ? `<span class="l">${fnum(c.lebih)}</span>` : 0}</td></tr>`).join('')}</tbody></table>
  <p class="note">Beban 1 guru = ${d.standar.beban} jam tatap muka/minggu. Hasil hitung dibulatkan ke angka terdekat (minimal 1). Selisih dihitung per jenis guru. Dasar: Juknis Peraturan Bersama 5 Menteri (2011).</p>
  <h2>Daftar sekolah (${list.length})</h2><table>${kHead(true)}<tbody>${list.map((r, i) => kRowHTML(r, i, true)).join('')}</tbody></table>`;
  if (detail) b += `<h2 style="page-break-before:always">Rincian per sekolah</h2>` + list.filter(r => r.ada_rombel).map(r => `<div class="blk"><b>${esc(r.nama)}</b> <span class="note">NPSN ${esc(r.npsn)} · ${esc(r.kecamatan)}</span>${kDetail(r, true)}</div>`).join('');
  printDoc(ktitle(), b + kSign(), true);
}
function exportK() {
  const std = K.d.standar.kat, q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
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
      const key = (r.npsn || '') + '|' + (r.tahun_ajaran || '');
      if (!groups[key]) {
        groups[key] = {
          npsn: r.npsn, nama: refName(r.npsn) || r.npsn, jenjang: r.jenjang, tahun: r.tahun_ajaran,
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
  // normal table for other entities
  const cols = ent.fields.filter(f => !f.h && !f.v), per = 15;
  const pages = Math.max(1, Math.ceil(list.length / per)); if (V.page > pages) V.page = pages;
  const slice = list.slice((V.page - 1) * per, V.page * per);
  const act = r => {
    let a = `<button class="btn sm sec" data-a="view" data-id="${esc(r.id)}">Detail</button> `;
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
    if (a === 'undangan') return cetakUndangan(rec);
    if (a === 'ba') return cetakBA(rec);
    if (a === 'pernyataan') return cetakPernyataan(rec);
    if (a === 'pelimpahan') return cetakPelimpahan(rec);
    if (a === 'edit') return openForm(rec);
    if (a === 'del') { if (confirm('Hapus data ini? Tindakan tidak dapat dibatalkan.')) { await api('remove', { entity: V.id, id: rec.id }); toast('Data dihapus', 'ok'); await V.reload(); } return; }
    if (a === 'ok') { if (confirm('Setujui pendaftaran ' + rec.nama + '? Data sekolah, kepala sekolah, dan akun login akan dibuat.')) { await api('approve', { id: rec.id }); toast('Pendaftaran disetujui', 'ok'); S.refs = (await api('refs')).refs; await V.reload(); } return; }
    if (a === 'no') { const c = prompt('Alasan penolakan (akan terlihat oleh pendaftar):'); if (c === null) return; await api('reject', { id: rec.id, catatan: c }); toast('Pendaftaran ditolak'); await V.reload(); }
  } catch (er) { toast(er.message, 'er'); }
}

function openView(rec) {
  modal('Detail', `<dl>${V.ent.fields.filter(f => !f.v && !f.calc || f.calc).map(f => `<dt>${esc(f.l)}</dt><dd>${cell(f, rec[f.k])}</dd>`).join('')}</dl>`, async () => {}, { ok: 'Tutup', cancel: 'Batal' });
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
    toast('Data tersimpan', 'ok');
    if (V.id === 'sekolah') S.refs = (await api('refs')).refs;
    await V.reload();
  });
  bindGeo(m);
  if (ent.pick) bindPicker(m, ent);
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
  const tk = sessionStorage.getItem('tk');
  if (tk) {
    S.token = tk;
    try { init(await api('bootstrap')); return; } catch (e) { sessionStorage.removeItem('tk'); }
  }
  showLogin();
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
