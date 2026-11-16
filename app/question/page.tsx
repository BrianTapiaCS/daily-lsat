import { QuestionSession } from "@/components/QuestionSession";

export const metadata = { title: "Today" };

export default function QuestionPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <QuestionSession />
    </main>
  );
}
