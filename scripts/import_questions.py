"""Upsert data/processed/selected.json into Supabase with the service role key.

The service role key bypasses row level security. It is read from the environment
or from a local .env file and is never printed.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
SELECTED = ROOT / "data" / "processed" / "selected.json"


def load_dotenv() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def require_env() -> tuple[str, str]:
    load_dotenv()
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit(
            "Import needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. "
            "Put them in .env (see .env.example), apply supabase/migrations/001_init.sql, "
            "then run this script again. Or paste supabase/seed.sql into the Supabase SQL editor."
        )
    return url.rstrip("/"), key


def main() -> None:
    if not SELECTED.exists():
        raise SystemExit("Missing data/processed/selected.json. Run scripts/export_questions.py first.")
    url, key = require_env()
    rows = json.loads(SELECTED.read_text(encoding="utf-8"))
    response = requests.post(
        f"{url}/rest/v1/questions?on_conflict=source_id",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
        json=rows,
        timeout=120,
    )
    if response.status_code not in (200, 201):
        raise SystemExit(f"Import failed with HTTP {response.status_code}: {response.text[:500]}")

    count_response = requests.get(
        f"{url}/rest/v1/questions",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Prefer": "count=exact",
            "Range": "0-0",
        },
        params={"select": "source_id,section"},
        timeout=60,
    )
    content_range = count_response.headers.get("content-range", "")
    print(f"upserted={len(response.json())} content_range={content_range}")
    sections = {row.get("section") for row in response.json()}
    if sections != {"Logical Reasoning"}:
        raise SystemExit(f"Unexpected sections in the import response: {sections}")


if __name__ == "__main__":
    main()
