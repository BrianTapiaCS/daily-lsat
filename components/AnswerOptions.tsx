"use client";

import type { Choice } from "@/types/practice";

export function AnswerOptions({
  choices,
  selected,
  onSelect,
  disabled,
  correctAnswer,
  selectedAnswer,
}: {
  choices: Choice[];
  selected?: string | null;
  onSelect?: (label: string) => void;
  disabled?: boolean;
  correctAnswer?: string;
  selectedAnswer?: string;
}) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="sr-only">Answer choices</legend>
      {choices.map((choice) => {
        const revealed = Boolean(correctAnswer);
        const isCorrect = revealed && choice.label === correctAnswer;
        const isSelected = (selectedAnswer ?? selected) === choice.label;
        const isWrong = revealed && isSelected && !isCorrect;
        return (
          <label
            key={choice.label}
            className={[
              "flex cursor-pointer gap-4 rounded-2xl border px-4 py-4 transition",
              isCorrect ? "border-right bg-right-soft" : "",
              isWrong ? "border-wrong bg-wrong-soft" : "",
              !revealed && isSelected ? "border-ink bg-white" : "",
              !revealed && !isSelected ? "border-line bg-card hover:border-ink/30" : "",
              revealed && !isCorrect && !isWrong ? "border-line bg-card" : "",
            ].join(" ")}
          >
            <input
              className="mt-1 accent-ink"
              type="radio"
              name="answer"
              value={choice.label}
              checked={isSelected}
              onChange={() => onSelect?.(choice.label)}
            />
            <span>
              <span className="mr-2 font-semibold">{choice.label}</span>
              <span className="font-serif text-lg leading-relaxed">{choice.text}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
