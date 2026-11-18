'use strict';
/* SIM Disdik — frontend. Semua data diambil dari Google Apps Script (lihat Code.gs). */
const CFG = window.APP_CONFIG || {};
const S = { token: null, user: null, schema: {}, refs: [] };
let V = null, MAP = null, busy = 0;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ROLE = { superadmin: 'Super Admin', pengguna: 'Pengguna', sekolah: 'Sekolah' };
const COL = { TK: '#f79009', SD: '#1b5fc4', SMP: '#12805c' };
const MENU = [
  { id: 'dashboard', t: 'Dashboard' },
  { id: 'pegawai', t: 'Pegawai Disdik' },
  { g: 'Satuan Pendidikan', items: [
    { id: 'sekolah', t: 'Data Sekolah' }, { id: 'guru', t: 'Data Guru' }, { id: 'kepsek', t: 'Data Kepala Sekolah' },
    { id: 'lokasi', t: 'Lokasi Sekolah' }, { id: 'kebutuhan', t: 'Kebutuhan Guru' }] },
  { id: 'mutasi', t: 'Mutasi' },
  { id: 'mediasi', t: 'Mediasi Perceraian' },
  { id: 'disiplin', t: 'Pembinaan Disiplin' },
  { g: 'Promosi', items: [{ id: 'usul_plt', t: 'Usul Plt Kepsek' }, { id: 'usul_definitif', t: 'Usul Kepsek Definitif' }] },
  { g: 'Administrasi', items: [{ id: 'pendaftaran', t: 'Pendaftaran Sekolah' }, { id: 'users', t: 'Pengguna' }] }
];
const REG = [
  { k: 'npsn', l: 'NPSN (8 digit)', r: 1 }, { k: 'nama', l: 'Nama Sekolah', r: 1 },
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
  $('#root').innerHTML = `<div class="auth"><div class="card authbox"><h2>${esc(CFG.APP_NAME || 'SIM Disdik')}</h2><div class="mu">${esc(CFG.APP_SUB || '')}</div>
    <div class="tabs"><button class="on" data-t="l">Masuk</button><button data-t="r">Daftar Sekolah</button></div><div id="ab"></div></div></div>`;
  $$('.tabs button').forEach(b => b.onclick = () => {
    $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    b.dataset.t === 'l' ? authLogin() : authReg();
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
  $('#root').innerHTML = `<div class="app"><aside id="side"><div class="brand">${esc(CFG.APP_NAME || 'SIM Disdik')}<small>${esc(S.user.sekolah_nama || CFG.APP_SUB || '')}</small></div><nav id="nav"></nav></aside>
    <div class="main"><header><button class="btn sec sm" id="burger" aria-label="Menu">☰</button><h1 id="ttl"></h1><div class="sp"></div>
    <span class="who">${esc(S.user.nama)} <span class="badge">${ROLE[S.user.role]}</span></span>
    <button class="btn sec sm" id="wa">No. WA</button><button class="btn sec sm" id="pw">Ubah Password</button><button class="btn sec sm" id="out">Keluar</button></header><main id="view"></main></div></div><div id="scrim"></div>`;
  $('#burger').onclick = () => document.body.classList.toggle('nav-open');
  $('#scrim').onclick = () => document.body.classList.remove('nav-open');
  $('#out').onclick = () => doLogout(false);
  $('#pw').onclick = openPw;
  $('#wa').onclick = openWa;
  const allowed = id => id === 'dashboard' || (id === 'lokasi' ? !!S.schema.sekolah : !!S.schema[id]);
  const link = i => `<a href="#/${i.id}" data-id="${i.id}">${esc(i.t)}</a>`;
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
  if (!S.allowed(id)) id = 'dashboard';
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.id === id));
  document.body.classList.remove('nav-open');
  if (MAP) { MAP.remove(); MAP = null; }
  try { id === 'dashboard' ? await pageDash() : id === 'lokasi' ? await pageLokasi() : await pageEntity(id); }
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
async function pageDash() {
  $('#ttl').textContent = 'Dashboard'; $('#view').innerHTML = '<div class="card mu">Memuat…</div>';
  const st = await api('stats'), keys = Object.keys(st.counts);
  let h = '';
  if (S.user.role === 'sekolah') h += `<div class="card"><h3>Selamat datang, ${esc(S.user.sekolah_nama || S.user.nama)}</h3><span class="mu">Kelola data sekolah, guru, kepala sekolah, kebutuhan guru, dan usul mutasi dari menu di samping.</span></div>`;
  if (st.menunggu) h += `<a class="stat wr" href="#/pendaftaran" style="margin-bottom:16px"><b>${st.menunggu}</b>Pendaftaran sekolah menunggu verifikasi</a>`;
  h += `<h3>Ringkasan Data</h3><div class="cards">${keys.filter(k => k !== 'pendaftaran').map(k => `<a class="stat" href="#/${k}"><b>${st.counts[k]}</b>${esc(S.schema[k].title)}</a>`).join('')}</div>`;
  if (S.schema.kebutuhan) h += `<h3>Kekurangan Guru</h3><div class="cards">${['TK', 'SD', 'SMP'].map(j => `<a class="stat" href="#/kebutuhan"><b>${st.kekurangan[j] || 0}</b>Guru kurang — ${j}</a>`).join('')}</div>`;
  $('#view').innerHTML = h;
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
    <div class="sp"></div><button class="btn sec" id="exp">Ekspor CSV</button>${ent.ops.includes('create') ? '<button class="btn" id="add">+ Tambah</button>' : ''}</div><div id="tbl"></div></div>`;
  $('#q').oninput = e => { V.q = e.target.value; V.page = 1; drawTable(); };
  $$('[data-f]').forEach(s => s.onchange = () => { V.flt[s.dataset.f] = s.value; V.page = 1; drawTable(); });
  $('#exp').onclick = exportCSV;
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
  const ent = V.ent, list = filtered(), cols = ent.fields.filter(f => !f.h && !f.v), per = 15;
  const pages = Math.max(1, Math.ceil(list.length / per)); if (V.page > pages) V.page = pages;
  const slice = list.slice((V.page - 1) * per, V.page * per), can = o => ent.ops.includes(o);
  if (V.id === 'kebutuhan') {
    const tot = {}; V.rows.forEach(r => tot[r.jenjang] = (tot[r.jenjang] || 0) + Number(r.kekurangan || 0));
    $('#extra').innerHTML = `<div class="cards">${['TK', 'SD', 'SMP'].map(j => `<div class="stat"><b>${tot[j] || 0}</b>Kekurangan guru ${j}</div>`).join('')}</div>`;
  }
  const act = r => {
    let a = `<button class="btn sm sec" data-a="view" data-id="${esc(r.id)}">Detail</button> `;
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
  const a = b.dataset.a, rec = V.rows.find(r => r.id === b.dataset.id);
  if (a === 'prev') { V.page--; return drawTable(); }
  if (a === 'next') { V.page++; return drawTable(); }
  try {
    if (a === 'view') return openView(rec);
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
  const flds = ent.fields.filter(f => !f.calc && !(sek && (f.k === ent.scope || f.adm)));
  const hasGeo = flds.some(f => f.k === 'lat') && flds.some(f => f.k === 'lng');
  let body = flds.map(f => fieldWrap(f, isNew ? (f.def || '') : r[f.k], f.t === 'password' ? isNew : f.r)).join('');
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
function exportCSV() {
  const fl = V.ent.fields.filter(f => !f.v), list = filtered();
  const q = v => { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v) && isNaN(Number(v))) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
  const lines = [fl.map(f => q(f.l)).join(',')].concat(list.map(r => fl.map(f => q(f.t === 'ref' ? refName(r[f.k]) : r[f.k])).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = V.id + '-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- lokasi sekolah ---------- */
async function pageLokasi() {
  const ent = S.schema.sekolah; $('#ttl').textContent = 'Lokasi Sekolah';
  $('#view').innerHTML = '<div class="card mu">Memuat…</div>';
  const rows = (await api('list', { entity: 'sekolah' })).rows;
  V = { id: 'sekolah', ent, rows, q: '', flt: {}, page: 1, reload: pageLokasi };
  $('#view').innerHTML = `<div class="card"><div class="tools"><input id="q" type="search" placeholder="Cari sekolah / kecamatan…">
    <select id="jf"><option value="">Semua Jenjang</option>${['TK', 'SD', 'SMP'].map(j => `<option>${j}</option>`).join('')}</select>
    <div class="sp"></div><span class="mu">${['TK', 'SD', 'SMP'].map(j => `<span class="dot" style="background:${COL[j]}"></span>${j}`).join('')}</span></div>
    <div id="map"></div><div id="ltbl"></div></div>`;
  const draw = () => {
    const q = $('#q').value.toLowerCase(), jf = $('#jf').value;
    const list = rows.filter(r => (!jf || r.jenjang === jf) && (!q || (r.nama + ' ' + r.kecamatan + ' ' + r.npsn).toLowerCase().includes(q)));
    drawMap(list);
    $('#ltbl').innerHTML = list.length ? `<div class="tw" style="max-height:360px"><table><thead><tr><th>Sekolah</th><th>Jenjang</th><th>Kecamatan</th><th>Koordinat</th><th></th></tr></thead><tbody>${list.map(r => {
      const ok = isFinite(parseFloat(r.lat)) && isFinite(parseFloat(r.lng)) && r.lat !== '' && r.lng !== '';
      return `<tr><td>${esc(r.nama)}</td><td>${cell({ t: 'select' }, r.jenjang)}</td><td>${esc(r.kecamatan)}</td><td>${ok ? esc(r.lat + ', ' + r.lng) : '<span class="mu">belum diisi</span>'}</td>
      <td class="act">${ok ? `<a class="btn sm sec" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(r.lat + ',' + r.lng)}">Google Maps</a> ` : ''}${ent.ops.includes('update') ? `<button class="btn sm sec" data-id="${esc(r.id)}">Ubah lokasi</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty">Tidak ada data.</div>';
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
