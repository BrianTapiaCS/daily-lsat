"""Parse and filter ooakdata/lsat-reasoning rows.

Structural checks do not prove that an answer key or explanation is correct.
Nothing in this module rewrites question text or invents explanations.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

LABELS = ("A", "B", "C", "D", "E")
SECTION_LOGICAL = "Logical Reasoning"
CHOICE_MARK = re.compile(r"(?:^|\n)\s*([A-E])\s*[\)\.]\s*")
SEED = 42
SAMPLE_SIZE = 100


def _blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def parse_answer_choices(raw: Any) -> tuple[list[dict[str, str]] | None, list[str]]:
    """Return five labeled choices, or None plus rejection reasons.

    The dataset stores choices as one string, not a list. A reported
    num_choices of 5 is not treated as proof that five valid choices exist.
    """
    if not isinstance(raw, str) or raw.strip() == "":
        return None, ["answer_choices_empty"]

    marks = list(CHOICE_MARK.finditer(raw))
    if len(marks) != 5:
        return None, [f"answer_choice_count_{len(marks)}"]

    choices: list[dict[str, str]] = []
    for index, mark in enumerate(marks):
        start = mark.end()
        end = marks[index + 1].start() if index + 1 < len(marks) else len(raw)
        text = raw[start:end].strip()
        choices.append({"label": mark.group(1), "text": text})

    labels = [choice["label"] for choice in choices]
    if labels != list(LABELS):
        return None, ["answer_choice_labels_" + "".join(labels)]
    if any(choice["text"] == "" for choice in choices):
        return None, ["answer_choice_empty_text"]
    return choices, []


def suspicious_flags(row: dict[str, Any], choices: list[dict[str, str]]) -> list[str]:
    """Flag records that parse, but look unsafe to ship without review."""
    flags: list[str] = []
    texts = [choice["text"] for choice in choices]
    if len(set(texts)) != len(texts):
        flags.append("duplicate_choice_text")

    lengths = [len(text) for text in texts]
    shortest = min(lengths)
    longest = max(lengths)
    if shortest < 8:
        flags.append("very_short_choice")
    if shortest > 0 and longest / shortest >= 8 and shortest < 40:
        flags.append("uneven_choice_length")

    raw_choices = row.get("answer_choices")
    if isinstance(raw_choices, str):
        for label in LABELS:
            if len(re.findall(rf"(?:^|\n)\s*{label}\s*[\)\.]", raw_choices)) != 1:
                flags.append("repeated_or_missing_label_marker")
                break

    num_choices = row.get("num_choices")
    if num_choices != 5:
        flags.append("num_choices_not_five")

    explanation = row.get("explanation")
    if isinstance(explanation, str) and len(explanation.strip()) < 40:
        flags.append("short_explanation")

    return flags


def hard_rejections(row: dict[str, Any]) -> tuple[list[dict[str, str]] | None, list[str]]:
    reasons: list[str] = []
    section = row.get("section")
    if section != SECTION_LOGICAL:
        reasons.append(
            "section_logic_games"
            if section == "Logic Games"
            else "section_not_logical_reasoning"
        )

    question_type = row.get("question_type")
    if _blank(question_type):
        reasons.append("question_type_missing")
    elif isinstance(question_type, str) and question_type.strip().lower() == "other":
        reasons.append("question_type_other")

    if _blank(row.get("question")):
        reasons.append("question_empty")
    if _blank(row.get("explanation")):
        reasons.append("explanation_missing")

    answer = row.get("correct_answer")
    if not isinstance(answer, str) or answer.strip().upper() not in LABELS:
        reasons.append("correct_answer_invalid")

    choices, choice_reasons = parse_answer_choices(row.get("answer_choices"))
    reasons.extend(choice_reasons)
    if reasons:
        return None, reasons
    return choices, []


def question_fingerprint(row: dict[str, Any]) -> str:
    scenario = row.get("scenario") if isinstance(row.get("scenario"), str) else ""
    question = row.get("question") if isinstance(row.get("question"), str) else ""
    collapsed = re.sub(r"\s+", " ", f"{scenario}\n{question}".strip().lower())
    return collapsed


def validate_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Split raw rows into kept, flagged, and rejected buckets.

    Kept rows preserve the original id, question, scenario, and explanation.
    Flagged rows passed the structural rules but are excluded from the
    initial random sample so a human can review them first.
    """
    rejection_counts: Counter[str] = Counter()
    flag_counts: Counter[str] = Counter()
    examples: dict[str, list[str]] = {}
    kept: list[dict[str, Any]] = []
    flagged: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    seen_fingerprints: set[str] = set()

    for row in rows:
        source_id = str(row.get("id") or "")
        choices, reasons = hard_rejections(row)
        if source_id and source_id in seen_ids:
            reasons.append("duplicate_source_id")
        fingerprint = question_fingerprint(row)
        if fingerprint and fingerprint in seen_fingerprints:
            reasons.append("duplicate_question_text")

        if reasons or choices is None:
            for reason in reasons:
                rejection_counts[reason] += 1
                bucket = examples.setdefault(reason, [])
                if source_id and len(bucket) < 15:
                    bucket.append(source_id)
            continue

        seen_ids.add(source_id)
        seen_fingerprints.add(fingerprint)
        flags = suspicious_flags(row, choices)
        scenario = row.get("scenario")
        record = {
            "source_id": source_id,
            "section": row.get("section"),
            "question_type": str(row.get("question_type")).strip(),
            "difficulty": None,
            "scenario": scenario.strip() if isinstance(scenario, str) and scenario.strip() else None,
            "question_text": str(row.get("question")).strip(),
            "answer_choices": choices,
            "correct_answer": str(row.get("correct_answer")).strip().upper(),
            "explanation": str(row.get("explanation")).strip(),
            "flags": flags,
        }
        if flags:
            for flag in flags:
                flag_counts[flag] += 1
            flagged.append(record)
        else:
            kept.append(record)

    eligible = sorted(kept, key=lambda record: record["source_id"])
    return {
        "rows_read": len(rows),
        "kept_clean": len(eligible),
        "flagged": len(flagged),
        "rejected": len(rows) - len(eligible) - len(flagged),
        "rejection_counts": dict(sorted(rejection_counts.items())),
        "flag_counts": dict(sorted(flag_counts.items())),
        "examples": examples,
        "eligible": eligible,
        "flagged_records": flagged,
    }


def select_questions(
    eligible: list[dict[str, Any]],
    sample_size: int = SAMPLE_SIZE,
    seed: int = SEED,
) -> list[dict[str, Any]]:
    """Reproducible sample. bank_order follows source_id after the draw."""
    import random

    if len(eligible) <= sample_size:
        chosen = list(eligible)
    else:
        rng = random.Random(seed)
        chosen = rng.sample(eligible, sample_size)
    chosen.sort(key=lambda record: record["source_id"])
    selected: list[dict[str, Any]] = []
    for index, record in enumerate(chosen, start=1):
        exported = {key: value for key, value in record.items() if key != "flags"}
        exported["is_active"] = True
        exported["bank_order"] = index
        selected.append(exported)
    return selected
