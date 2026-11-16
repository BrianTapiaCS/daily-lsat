"""Validate raw dataset pages and write a report. Does not modify data/raw."""

from __future__ import annotations

import json
from pathlib import Path

from question_bank import SEED, SAMPLE_SIZE, validate_rows

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "pages"
PROCESSED = ROOT / "data" / "processed"
REPORTS = ROOT / "data" / "reports"


def load_raw_rows() -> list[dict]:
    pages = sorted(RAW_DIR.glob("offset_*.json"))
    if not pages:
        raise SystemExit("No raw pages found. Run scripts/fetch_questions.py first.")
    rows: list[dict] = []
    for page in pages:
        payload = json.loads(page.read_text(encoding="utf-8"))
        for item in payload["rows"]:
            rows.append(item["row"])
    return rows


def main() -> None:
    rows = load_raw_rows()
    result = validate_rows(rows)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)

    eligible_path = PROCESSED / "eligible.json"
    flagged_path = PROCESSED / "flagged.json"
    eligible_path.write_text(json.dumps(result["eligible"], indent=2), encoding="utf-8")
    flagged_path.write_text(json.dumps(result["flagged_records"], indent=2), encoding="utf-8")

    report = {
        "dataset": "ooakdata/lsat-reasoning",
        "config": "default",
        "split": "train",
        "license_note": (
            "The dataset page reports CC BY 4.0 and attribution to ooakdata. "
            "Verify the current license before public or commercial distribution. "
            "These are LSAT-style practice questions, not official LSAC material. "
            "Structural validation does not prove that answer keys or explanations are correct."
        ),
        "rows_read": result["rows_read"],
        "kept_clean": result["kept_clean"],
        "flagged_for_review": result["flagged"],
        "rejected": result["rejected"],
        "sample_size_requested": SAMPLE_SIZE,
        "seed": SEED,
        "rejection_counts": result["rejection_counts"],
        "flag_counts": result["flag_counts"],
        "rejection_examples": result["examples"],
        "difficulty_note": "The source dataset has no difficulty field. Exported questions store difficulty as null.",
    }
    report_path = REPORTS / "validation_report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    lines = [
        "# Question bank validation",
        "",
        report["license_note"],
        "",
        f"- Rows read: {report['rows_read']}",
        f"- Clean Logical Reasoning questions: {report['kept_clean']}",
        f"- Flagged for manual review (excluded from the initial sample): {report['flagged_for_review']}",
        f"- Rejected: {report['rejected']}",
        "",
        "## Rejections",
        "",
    ]
    for reason, count in report["rejection_counts"].items():
        lines.append(f"- {reason}: {count}")
    lines.extend(["", "## Flags", ""])
    if report["flag_counts"]:
        for reason, count in report["flag_counts"].items():
            lines.append(f"- {reason}: {count}")
    else:
        lines.append("- None")
    lines.append("")
    (REPORTS / "validation_report.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("rows_read", "kept_clean", "flagged_for_review", "rejected")}, indent=2))


if __name__ == "__main__":
    main()
