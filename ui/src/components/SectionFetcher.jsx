import { useState } from "react";
import { api } from "../api.js";
import { useResource } from "../hooks.js";

/**
 * Pulls a NYT section and scores it. This is the only action that spends
 * money, so it is explicit rather than automatic.
 */
export function SectionFetcher({ onFetched }) {
  const { data: sections } = useResource(() => api.sections(), [], []);
  const [section, setSection] = useState("business");
  const [limit, setLimit] = useState(10);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const run = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const result = await api.scoreSection(section, { limit });
      setStatus({
        kind: "ok",
        text: `${result.num_results} of ${limit} cleared the threshold in ${section}.`,
      });
      onFetched?.();
    } catch (error) {
      setStatus({ kind: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>1 · Gather headlines</h2>
      <p className="hint">
        Fetches a NYT section and has the model score each headline 0–100 for
        stock-market relevance. Already-scored articles are reused.
      </p>

      <div className="row">
        <label>
          Section
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            {(sections ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Limit
          <input
            type="number"
            min="1"
            max="50"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </label>

        <button type="button" onClick={run} disabled={busy}>
          {busy ? "Scoring…" : "Fetch & score"}
        </button>
      </div>

      {status && (
        <p className={status.kind === "error" ? "error" : "success"}>
          {status.text}
        </p>
      )}
    </section>
  );
}
