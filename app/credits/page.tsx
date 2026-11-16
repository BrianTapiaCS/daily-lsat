export const metadata = { title: "Credits" };

export default function CreditsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-12">
      <h1 className="font-serif text-5xl tracking-tight">Credits</h1>
      <div className="space-y-4 leading-8 text-muted">
        <p>
          Practice questions come from the{" "}
          <a className="underline" href="https://huggingface.co/datasets/ooakdata/lsat-reasoning">
            ooakdata/lsat-reasoning
          </a>{" "}
          dataset. The dataset page reports a CC BY 4.0 license. Attribution: ooakdata.
        </p>
        <p>
          These are LSAT-style Logical Reasoning practice questions. They are not official LSAC questions, and this
          app is not affiliated with or endorsed by LSAC. Logic Games are excluded. The initial bank does not include
          Reading Comprehension. The source data has no difficulty rating, so questions are shown as unrated.
        </p>
        <p>
          Passing the structural checks does not prove that an answer key or explanation is correct. Verify the
          dataset’s current license and access terms before distributing this app publicly or commercially.
        </p>
      </div>
    </main>
  );
}
