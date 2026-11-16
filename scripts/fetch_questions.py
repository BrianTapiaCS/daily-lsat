"""Download the full ooakdata/lsat-reasoning train split.

Pages are stored separately under data/raw and are never filtered in place.
Re-running the script resumes from the first missing page.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import requests

DATASET = "ooakdata/lsat-reasoning"
CONFIG = "default"
SPLIT = "train"
PAGE_SIZE = 100
ROWS_URL = "https://datasets-server.huggingface.co/rows"
ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "pages"
MAX_ATTEMPTS = 10


def page_path(offset: int) -> Path:
    return RAW_DIR / f"offset_{offset:05d}.json"


def fetch_page(offset: int) -> dict:
    last_error = "no response"
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = requests.get(
                ROWS_URL,
                params={
                    "dataset": DATASET,
                    "config": CONFIG,
                    "split": SPLIT,
                    "offset": offset,
                    "length": PAGE_SIZE,
                },
                timeout=90,
            )
        except requests.RequestException as error:
            last_error = str(error)
            time.sleep(min(2 ** attempt, 30))
            continue

        if response.status_code == 200:
            payload = response.json()
            if "rows" not in payload or "num_rows_total" not in payload:
                raise SystemExit(f"Unexpected payload keys at offset {offset}: {list(payload)}")
            return payload

        last_error = f"HTTP {response.status_code}: {response.text[:240]}"
        # 4xx other than 429 will not succeed by retrying the same URL.
        if 400 <= response.status_code < 500 and response.status_code != 429:
            break
        print(f"retry offset {offset} attempt {attempt}: HTTP {response.status_code}")
        time.sleep(min(5 * attempt, 40))

    raise SystemExit(f"Failed to fetch offset {offset} after {MAX_ATTEMPTS} attempts. {last_error}")


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    offset = 0
    total: int | None = None
    retrieved = 0

    while total is None or offset < total:
        destination = page_path(offset)
        if destination.exists():
            payload = json.loads(destination.read_text(encoding="utf-8"))
            print(f"skip existing offset {offset}")
        else:
            payload = fetch_page(offset)
            destination.write_text(json.dumps(payload), encoding="utf-8")
            print(f"saved offset {offset} ({len(payload['rows'])} rows)")
            time.sleep(0.25)

        total = int(payload["num_rows_total"])
        retrieved += len(payload["rows"])
        if len(payload["rows"]) == 0:
            break
        offset += PAGE_SIZE

    print(f"retrieved_rows={retrieved}")
    print(f"reported_total={total}")
    if total is not None and retrieved != total:
        raise SystemExit(
            f"Row count mismatch: saved {retrieved} rows but the API reported {total}. "
            "Raw pages were kept. Re-run the script; existing pages will not be requested again."
        )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
