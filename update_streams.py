#!/usr/bin/env python3
"""Periksa ketersediaan semua stream dan perbarui stations.json + stations-data.js.

Status:
  online  -> stream merespons HTTP 2xx/3xx
  offline -> stream merespons HTTP 4xx/5xx (nyata mati)
  unknown -> timeout / diblokir (bisa geo-blocked, belum tentu mati)

Jalankan: python3 update_streams.py
"""
import argparse
import concurrent.futures
import datetime
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "stations.json"
INITIAL_FILE = ROOT / "stations-data.js"


def load_stations():
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    if INITIAL_FILE.exists():
        raw = INITIAL_FILE.read_text(encoding="utf-8")
        return json.loads(raw[raw.index("=") + 1: raw.rindex(";")])
    raise SystemExit("Tidak ada data stasiun ditemukan.")


def check_stream(station):
    url = station.get("stream", "")
    if not re.match(r"^https?://", url):
        return "offline", 0
    proc = subprocess.run(
        [
            "curl", "-sL", "-o", "/dev/null", "-w", "%{http_code}",
            "--max-time", "10", "--max-filesize", "65536",
            "-A", "Mozilla/5.0 (compatible; TVRadioCheck/1.0)", url,
        ],
        capture_output=True,
        text=True,
    )
    raw = (proc.stdout or "").strip().splitlines()
    try:
        code = int(raw[-1])
    except (ValueError, IndexError):
        return "unknown", 0

    if 200 <= code < 400:
        return "online", code
    if code in (400, 401, 403, 405, 406, 429, 451):
        # Ditolak karena header/hak akses/geo-block, bukan bukti stream mati.
        return "unknown", code
    if 400 <= code < 600:
        return "offline", code
    return "unknown", code


def write_initial_data(stations):
    payload = json.dumps(stations, ensure_ascii=False, indent=2)
    INITIAL_FILE.write_text(
        "/* Data stasiun bawaan. Sumber utama untuk refresh: stations.json */\n"
        f"window.STATIONS_DATA = {payload};\n",
        encoding="utf-8",
    )


def main():
    parser = argparse.ArgumentParser(description="Perbarui status stream stasiun.")
    parser.add_argument("--workers", type=int, default=20, help="Jumlah pengecekan paralel")
    parser.add_argument("--no-html", action="store_true", help="Jangan menulis ulang stations-data.js")
    args = parser.parse_args()

    stations = load_stations()
    print(f"Mengecek {len(stations)} stream dengan {args.workers} worker…", flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(check_stream, stations))

    checked_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    for station, (status, code) in zip(stations, results):
        station["status"] = status
        station["checkedAt"] = checked_at
        station["httpCode"] = code

    DATA_FILE.write_text(
        json.dumps(stations, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if not args.no_html:
        write_initial_data(stations)

    counts = {}
    for station in stations:
        counts[station["status"]] = counts.get(station["status"], 0) + 1
    print(
        "Selesai: "
        + ", ".join(f"{k}={v}" for k, v in sorted(counts.items()))
        + f" · {checked_at}"
    )
    offline = [s["name"] for s in stations if s["status"] == "offline"]
    if offline:
        print("Contoh offline:", ", ".join(offline[:10]))


if __name__ == "__main__":
    main()
