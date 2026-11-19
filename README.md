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
| Data Rombel | ✔ (CRUD + impor) | ✔ (CRUD + impor) | rombel sekolahnya (CRUD) |
| Kebutuhan Guru (TK/SD/SMP) — dihitung otomatis dari rombel | ✔ | ✔ | sekolahnya (lihat & cetak) |
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

## Impor data dari Excel (Dapodik)

Tombol **Impor Excel** ada di menu **Data Sekolah, Data Guru, Data Kepala Sekolah, Data Rombel, dan Pegawai Disdik** (untuk super admin & pengguna).

Urutan yang disarankan: **Data Sekolah dahulu**, baru Guru dan Kepala Sekolah (keduanya harus menunjuk sekolah yang sudah ada).

1. Klik **Impor Excel**, pilih file (.xlsx/.xls/.csv).
2. Aplikasi mendeteksi baris judul dan memetakan kolom otomatis (mis. `NPSN`, `Bentuk Pendidikan`, `Lintang`, `NUPTK`). Cek tabel **Pemetaan kolom**; jika ada yang salah/kosong, pilih kolom yang benar secara manual.
3. Untuk file guru yang tidak memuat NPSN, pilih sekolahnya di kotak **Sekolah untuk semua baris**, atau petakan kolom **Nama Sekolah**.
4. Cek **Pratinjau**, lalu **Mulai Impor**. Hasil: jumlah baru / diperbarui / tanpa perubahan / gagal, beserta alasan tiap baris yang gagal.

**Memperbarui data:** unggah file Dapodik terbaru. Kunci pencocokan: Sekolah = NPSN; Guru = NIK (bila kosong: NIP/NUPTK, lalu nama + tanggal lahir + sekolah; baris Induk dan Non Induk dibedakan); Pegawai = NIP; Kepala Sekolah = sekolah. Data yang sudah ada diperbarui, yang baru ditambahkan, **yang tidak ada di file tidak dihapus**. Kolom kosong di file tidak menimpa data yang sudah terisi (misalnya koordinat yang Anda isi manual).

Catatan:
- Sekolah selain TK/SD/SMP (mis. SMA, KB) akan ditolak dengan keterangan "Jenjang ... tidak dikenali".
- Isian seperti `L`/`P`, `Guru PNS`, `S1` otomatis disamakan dengan pilihan di aplikasi; yang tidak dikenali dikosongkan.
- NIP/NPSN yang di Excel berbentuk `1.98E+17` sudah kehilangan digit. Aplikasi menolak impor sampai kolomnya dijadikan **Teks**.
- Mengimpor file yang sama dua kali aman, tidak menggandakan data.

## Data Guru (format Dapodik) & pencarian profil

- **Data Guru** memuat seluruh 30 kolom file *Individu Guru - Data Pokok Pendidikan* (NIK, NUPTK, NIP, tempat/tanggal lahir, status tugas, tempat tugas, NPSN, SK CPNS, SK/TMT pengangkatan, jenis & jabatan PTK, pendidikan, bidang studi, status kepegawaian, pangkat/TMT pangkat, masa kerja, mata pelajaran, jam mengajar, jabatan kepsek). Nama kolom Dapodik terpetakan otomatis saat impor.
- Saat impor, karakter tak terlihat di NIK/NIP, teks `null`, dan tanggal kosong `1900-01-01` dibersihkan otomatis. Pilihan *Status Kepegawaian* dan *Pendidikan* mengikuti isian Dapodik. NPSN boleh berisi huruf (mis. `P9926326`).
- Form **Mutasi, Mediasi Perceraian, Pembinaan Disiplin, Usul Plt, dan Usul Kepsek Definitif** punya kotak **Cari pegawai / guru**: ketik nama, NIP, atau NIK, pilih hasilnya, dan profil (nama, NIP, NIK, jabatan, golongan, status, unit/sekolah) terisi otomatis. Akun sekolah hanya bisa mencari guru sekolahnya sendiri.
- Perhitungan Kebutuhan Guru hanya menghitung Jenis PTK **Guru** yang bertugas di sekolah **induk** (kepala sekolah, tenaga kependidikan, dan guru non induk tidak dihitung ganda).
- Setelah memperbarui `Code.gs`: jalankan `setup()` (menambah kolom baru dan menyamakan nilai lama), lalu **New version**.

## Data Rombel & Kebutuhan Guru

1. Impor **Data Rombel** (satu baris = satu rombel; kolom Nama Rombel, Tingkat, Jumlah Siswa; NPSN atau pilih sekolah; Tahun Ajaran diisi di kotak impor bila tidak ada di file). Kunci pembaruan: NPSN + nama rombel + tahun ajaran.
2. Menu **Kebutuhan Guru** (tab TK / SD / SMP) menghitung otomatis kebutuhan, kekurangan, dan kelebihan guru per sekolah, bisa dicetak (rekap atau dengan rincian tiap sekolah) dan diekspor CSV.
3. Rumus (Juknis Peraturan Bersama 5 Menteri 2011, beban 24 jam tatap muka): SD = 1 guru kelas/rombel + guru agama & PJOK (rombel x jam : 24); SMP = tiap mapel (rombel x jam : 24) + BK 1 per 150 siswa; TK = 1 guru/rombel. Jam pelajaran ada di konstanta `STANDAR` pada `Code.gs` dan dapat disesuaikan.
4. "Guru ada" diambil dari Data Guru, dikelompokkan dari isian **Mata Pelajaran**.
5. Setelah memperbarui `Code.gs`: jalankan `setup()` (membuat sheet **Rombel**), lalu **Deploy > Manage deployments > Edit > New version**. Sheet lama `KebutuhanGuru` tidak lagi dipakai (boleh dihapus).

## Lupa password (OTP WhatsApp)

Di halaman login ada tautan **Lupa password?**. Pengguna memasukkan username, kode OTP 6 digit dikirim ke nomor WhatsApp yang tersimpan pada akunnya (berlaku 5 menit, maksimal 5 kali salah, maksimal 3 permintaan per 15 menit).

WhatsApp tidak bisa dikirim langsung dari Apps Script, jadi dibutuhkan **gateway WhatsApp** (bawaan kode memakai [Fonnte](https://docs.fonnte.com/?p=21); berbayar/ada kuota). Penyiapan:

1. Daftar di penyedia gateway, hubungkan nomor WhatsApp pengirim (disarankan nomor khusus instansi, bukan pribadi), lalu salin **token**-nya.
2. Di Apps Script: **Project Settings → Script properties → Add** → nama `WA_TOKEN`, nilai = token tersebut. (Token tidak ditulis di kode.)
3. Isi `TEST_NOMOR_WA` di `Code.gs` dengan nomor Anda, pilih fungsi `tesWA` → **Run** (izinkan akses ke layanan eksternal). Pesan tes harus masuk ke WhatsApp.
4. Jalankan `setup()` sekali lagi agar kolom `no_wa` ditambahkan ke sheet **Users**.
5. **Deploy → Manage deployments → Edit → New version**.
6. Isi nomor WA tiap akun: pengguna sendiri lewat tombol **No. WA**, atau super admin lewat menu **Pengguna → Ubah**. Akun sekolah yang disetujui dari pendaftaran otomatis memakai No. HP yang diisi saat mendaftar.

Jika memakai gateway lain, ubah `WA_GATEWAY_URL` dan fungsi `sendWA_` di `Code.gs`.

## Catatan keamanan
- Data mediasi perceraian dan pembinaan disiplin bersifat **sensitif**. Jangan membagikan Google Sheet-nya ke orang lain; akses data hanya lewat aplikasi. Sheet berisi hash password, jadi tetap simpan privat.
- Repositori GitHub hanya berisi kode, **bukan data**. Jangan menaruh URL spreadsheet atau data apa pun di repositori.
- Password disimpan sebagai hash SHA-256 + salt rahasia (di Script Properties). Login dibatasi 5 kali gagal per 15 menit. Sesi berlaku 6 jam.
- Cocok untuk ribuan baris per sheet. Untuk skala jauh lebih besar, pertimbangkan database sungguhan.
