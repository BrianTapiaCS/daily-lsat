import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from question_bank import parse_answer_choices, select_questions, validate_rows


def choices(body: str | None = None) -> str:
    if body is not None:
        return body
    return "\n".join(
        [
            "A) Alpha reason that is long enough to be a real choice.",
            "B) Bravo reason that is long enough to be a real choice.",
            "C) Charlie reason that is long enough to be a real choice.",
            "D) Delta reason that is long enough to be a real choice.",
            "E) Echo reason that is long enough to be a real choice.",
        ]
    )


def row(**overrides):
    base = {
        "id": "LR1",
        "section": "Logical Reasoning",
        "question_type": "Flaw",
        "scenario": "A stimulus that states a conclusion.",
        "question": "Which one of the following is a flaw?",
        "answer_choices": choices(),
        "correct_answer": "E",
        "explanation": "E is correct because the argument confuses a sufficient condition with a necessary one and ignores the remaining evidence.",
        "num_choices": 5,
    }
    base.update(overrides)
    return base


class QuestionBankTests(unittest.TestCase):
    def test_parses_labeled_choices_in_order(self):
        parsed, reasons = parse_answer_choices(choices())
        self.assertEqual(reasons, [])
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual([item["label"] for item in parsed], ["A", "B", "C", "D", "E"])
        self.assertTrue(parsed[0]["text"].startswith("Alpha"))

    def test_rejects_missing_choice_even_if_num_choices_claims_five(self):
        parsed, reasons = parse_answer_choices("A) One.\nB) Two.\nC) Three.\nD) Four.")
        self.assertIsNone(parsed)
        self.assertEqual(reasons, ["answer_choice_count_4"])

    def test_rejects_duplicate_labels_and_blank_content(self):
        parsed, reasons = parse_answer_choices(
            "A) One long choice.\nA) Two long choice.\nC) Three long choice.\nD) Four long choice.\nE) Five long choice."
        )
        self.assertIsNone(parsed)
        self.assertTrue(any(reason.startswith("answer_choice_labels_") for reason in reasons))

    def test_rejects_empty_explanation_other_type_and_logic_games(self):
        result = validate_rows(
            [
                row(id="ok"),
                row(id="games", section="Logic Games"),
                row(id="blank-type", question_type=None),
                row(id="other", question_type="Other"),
                row(id="no-exp", explanation="  "),
                row(id="bad-key", correct_answer="F"),
                row(id="empty-q", question=" "),
                row(id="dup-text"),
            ]
        )
        self.assertEqual(result["kept_clean"], 1)
        self.assertEqual(result["eligible"][0]["source_id"], "ok")
        self.assertEqual(result["eligible"][0]["explanation"], row()["explanation"])
        self.assertIn("section_logic_games", result["rejection_counts"])
        self.assertIn("question_type_missing", result["rejection_counts"])
        self.assertIn("question_type_other", result["rejection_counts"])
        self.assertIn("explanation_missing", result["rejection_counts"])
        self.assertIn("correct_answer_invalid", result["rejection_counts"])
        self.assertIn("question_empty", result["rejection_counts"])
        self.assertIn("duplicate_question_text", result["rejection_counts"])

    def test_flags_short_choices_instead_of_shipping_them(self):
        result = validate_rows(
            [
                row(
                    id="short",
                    answer_choices="A) a\nB) Bravo reason that is long enough.\nC) Charlie reason that is long enough.\nD) Delta reason that is long enough.\nE) Echo reason that is long enough.",
                )
            ]
        )
        self.assertEqual(result["kept_clean"], 0)
        self.assertEqual(result["flagged"], 1)
        self.assertIn("very_short_choice", result["flag_counts"])

    def test_sample_is_reproducible_and_does_not_invent_difficulty(self):
        eligible = []
        for index in range(150):
            item = row(id=f"Q{index:03d}", question=f"Question number {index}?")
            item["scenario"] = f"Stimulus {index}"
            validated = validate_rows([item])["eligible"][0]
            eligible.append(validated)
        first = select_questions(eligible)
        second = select_questions(eligible)
        self.assertEqual([item["source_id"] for item in first], [item["source_id"] for item in second])
        self.assertEqual(len(first), 100)
        self.assertEqual(first[0]["bank_order"], 1)
        self.assertIsNone(first[0]["difficulty"])
        self.assertEqual(first[0]["section"], "Logical Reasoning")


if __name__ == "__main__":
    unittest.main()
