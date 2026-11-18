# SIM Disdik — Aplikasi Pendidikan Dinas Pendidikan

Website statis (HTML/JS) untuk GitHub Pages, dengan database **Google Sheets** melalui **Google Apps Script**.

## Isi repositori

| File | Fungsi |
|---|---|
| `index.html` | Tampilan & gaya halaman |
| `app.js` | Logika aplikasi (login, menu, tabel, form, peta) |
| `config.js` | **Isi `API_URL` di sini**, juga nama aplikasi |
| `Code.gs` | Backend. **Tidak** diunggah ke GitHub Pages — ditempel di Apps Script |

## Menu & hak akses

| Menu | Super Admin | Pengguna | Sekolah |
|---|---|---|---|
| Pegawai Disdik | ✔ | ✔ | – |
| Data Sekolah | ✔ (CRUD) | ✔ (CRUD) | data sekolahnya (ubah saja) |
| Data Guru | ✔ | ✔ | guru sekolahnya (CRUD) |
| Data Kepala Sekolah (TK/SD/SMP) | ✔ | ✔ | sekolahnya (tambah/ubah) |
| Lokasi Sekolah (peta) | ✔ | ✔ | sekolahnya |
| Kebutuhan Guru (TK/SD/SMP) | ✔ | ✔ | sekolahnya (CRUD) |
| Mutasi | ✔ | ✔ | mengajukan usul; status/No. SK diisi admin |
| Mediasi Perceraian | ✔ | ✔ | – |
| Pembinaan Disiplin | ✔ | ✔ | – |
| Promosi: Usul Plt / Usul Kepsek Definitif | ✔ | ✔ | – |
| Verifikasi Pendaftaran Sekolah | ✔ | – | – |
| Kelola Pengguna | ✔ | – | – |

Hak akses diperiksa di **server** (Apps Script), bukan hanya di tampilan.

## Pendaftaran sekolah
Tab **Daftar Sekolah** di halaman login (publik). Pendaftar mengisi data sekolah, kepala sekolah, dan password. Super admin menyetujui di menu *Pendaftaran Sekolah* → otomatis dibuat: data sekolah, data kepala sekolah, dan akun login (username = NPSN).

## Cara pasang (±10 menit)

1. **Buat Google Sheet** kosong (mis. "Database SIM Disdik").
2. Menu **Extensions → Apps Script**. Hapus isi default, tempel seluruh isi `Code.gs`.
3. Ubah `ADMIN_PASSWORD_AWAL` di bagian atas, lalu **Save**.
4. Pilih fungsi `setup` → **Run** → izinkan akses. Semua sheet & akun super admin (`admin`) terbentuk.
5. **Deploy → New deployment → Web app**
   - *Execute as*: **Me**
   - *Who has access*: **Anyone** (wajib agar bisa diakses dari GitHub Pages; semua data tetap butuh login)
   - Salin **Web app URL** (berakhiran `/exec`).
6. Buka `config.js`, tempel URL tadi ke `API_URL`.
7. Unggah `index.html`, `app.js`, `config.js` ke repositori GitHub → **Settings → Pages → Deploy from branch (main /root)**.
8. Buka situs, login `admin` + password awal, lalu klik **Ubah Password**.

> Setiap kali `Code.gs` diubah, lakukan **Deploy → Manage deployments → Edit → New version** agar perubahan aktif.

## Catatan keamanan
- Data mediasi perceraian dan pembinaan disiplin bersifat **sensitif**. Jangan membagikan Google Sheet-nya ke orang lain; akses data hanya lewat aplikasi. Sheet berisi hash password, jadi tetap simpan privat.
- Repositori GitHub hanya berisi kode, **bukan data**. Jangan menaruh URL spreadsheet atau data apa pun di repositori.
- Password disimpan sebagai hash SHA-256 + salt rahasia (di Script Properties). Login dibatasi 5 kali gagal per 15 menit. Sesi berlaku 6 jam.
- Cocok untuk ribuan baris per sheet. Untuk skala jauh lebih besar, pertimbangkan database sungguhan.
