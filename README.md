# TVRadioID

**dari apahudi untuk negeri**

Aplikasi/website streaming **Radio & TV live** Indonesia dan internasional. Dibangun dengan HTML/CSS/JS murni (tanpa build step), bisa dijalankan sebagai web statis atau APK Android WebView.

## Halaman

| Halaman | Fungsi |
| --- | --- |
| `index.html` | Beranda/home: 2 tombol glassy **TV** & **RADIO**, pilih **multi-negara**, pilih **tema UI** |
| `radio.html` | Daftar stasiun radio |
| `tv.html` | Daftar channel TV |

Navigasi: Beranda / Radio / TV / Provinsi. Footer: `RadioTV v.1.0 | dibuat oleh ApahUdi | 2026`.

## Fitur utama

- **Beranda glassy**: pilih TV/Radio dan filter negara (bisa lebih dari satu) sebelum masuk daftar.
- **TV fullscreen**: klik kanal langsung putar fullscreen; Back/Esc/remote menutup player.
- **Kontrol remote TV**: Prev/Next channel, D-pad/Enter/OK, tombol `f` favorit, glow pada tombol saat pindah kanal via remote.
- **Scan Kanal**: scan semua kanal di kategori/filter aktif secara berurutan.
  - Layout scan: **progress bar atas**, **daftar kanal kiri**, **video sedang kanan**.
  - Warna hasil scan: 1–2s hijau, 3–5s kuning, 6–10s merah; >10s timeout merah.
  - Kanal gagal/"Semua stream gagal diputar/geo-blocked" otomatis **masuk EXCLUDE** dan lanjut kanal berikutnya.
  - Warna hasil scan tersimpan di `localStorage` (`tvradio_buffer_stats`) sampai cache/cookie di-clear.
- **Buffering & loading**: overlay progress tengah video; saat buffering >10 detik saat menonton, aplikasi menanyakan user untuk pindah kanal atau tetap menunggu.
- **Favorit**: kanal favorit tampil di bagian “★ Favorit” dan bisa difilter lewat tab Favorit.
- **Filter & urut**: kategori, provinsi, negara (multi), sembunyikan offline/geo-block, urut TV Nama/Lokasi/Kategori.
- **Cache video HLS**: Off/Kecil/Sedang/Besar (preset buffer/prefetch), prefetch segmen paralel, playback mulai cepat.
- **Alternatif stream otomatis**: coba URL alternatif saat gagal/stall/geo-block/CORS.
- **Status/exclude**: deteksi offline lokal, geo-block/CORS masuk EXCLUDE; saat refresh 24 jam/manual, kanal online yang valid bisa kembali.
- **Tema UI**: Default Gelap, Windows 11, Mac OS Tahoe, Ubuntu 26, Minimalis (tersimpan di browser).
- **Donasi**: modal QRIS (scan semua mobile banking & e-wallet), DANA atas nama Moh Agus Budiman / 085323073037.

## Isi katalog

| Jenis | Jumlah |
| --- | ---: |
| TV | 4.218 |
| Radio | 2.703 |
| **Total** | **6.921** |

### Sumber data

- TV: TVRI/RRI resmi, iptv-org, IPTV Cat, publik, CODECS.COM.
- Radio Indonesia: RRI, IPTV Cat.
- Radio internasional: [Radio-Browser](https://www.radio-browser.info/) (top voted, hidebroken, per negara).
- Alternatif runtime: Free-TV/IPTV playlist publik.

### Kategori

- **TV**: Nasional, Regional, Religi, Olahraga, Film, Komedi, Hiburan, Anak, Musik, Dokumenter, Berita.
- **Radio**: Indonesia, Internasional, Jabodetabek, Jawa, Sumatera, Kalimantan, Sulawesi, Bali & Nusa, Maluku, Papua.

## Jalankan lokal

```bash
cd /home/budijoi/Project/tvradio
python3 -m http.server 8123
# buka http://localhost:8123/index.html
```

## Update data & halaman

```bash
# cek status stream
python3 update_streams.py

# regenerasi radio.html/tv.html dari make_pages.py
python3 make_pages.py
```

## Android APK (TVRadioID)

- Package: `com.apahudi.tvradio`
- Version: `1.2` (`versionCode 3`)
- Output: `android/TVRadioID-1.2.apk`
- Start page: `https://appassets.local/index.html`

### Build

```bash
cd android
bash build.sh
```

Persyaratan: Android SDK platform 35, build-tools 35.0.0, JDK 21. Keystore: `android/tvradio.keystore` (alias `tvradio`, password `tvradio`).

### Install ADB

```bash
adb connect <IP-TV>:5555
adb install -r android/TVRadioID-1.2.apk
```

## Format data stasiun

`stations.json` adalah array objek:

```json
{
  "id": "unik",
  "type": "tv|radio",
  "name": "Nama Kanal",
  "city": "Kota",
  "province": "Provinsi/Internasional",
  "country": "ID",
  "category": "nasional|regional|internasional|...",
  "stream": "https://contoh.com/stream.m3u8",
  "desc": "Deskripsi",
  "logo": "https://...png",
  "source": "Sumber",
  "status": "online|offline|unknown",
  "checkedAt": "ISO-8601",
  "httpCode": 200
}
```

## Catatan

- Banyak stream publik bisa geo-blocked, berubah, atau offline sewaktu-waktu. Status `unknown` tidak selalu berarti tidak bisa diputar di browser/device target.
- Gunakan hanya stream yang Anda miliki hak akses/distribusinya.
- `stations-data.js` harus sinkron dengan `stations.json` untuk mode bawaan/offline-first.

Lisensi: kode dapat dikembangkan sesuai kebutuhan pemilik repo; hak siar/stream tetap milik masing-masing penyedia.
