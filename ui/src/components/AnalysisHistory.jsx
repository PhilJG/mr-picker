import { useState } from "react";

/** Past runs, so a result doesn't vanish when you run the next one. */
export function AnalysisHistory({ analyses, loading, error }) {
  const [openId, setOpenId] = useState(null);

  return (
    <section className="panel">
      <h2>History</h2>

      {error && <p className="error">{error}</p>}
      {loading && <p className="hint">Loading…</p>}
      {!loading && analyses.length === 0 && (
        <p className="hint">No analyses yet.</p>
      )}

      <ul className="history">
        {analyses.map((analysis) => (
          <li key={analysis.id}>
            <button
              type="button"
              className="history-head"
              onClick={() => setOpenId(openId === analysis.id ? null : analysis.id)}
            >
              <strong>{analysis.promptLabel ?? "Custom prompt"}</strong>
              <span className="meta">
                {analysis.headlineCount} headlines ·{" "}
                {new Date(analysis.createdAt).toLocaleString()}
              </span>
            </button>

            {openId === analysis.id && (
              <div className="history-body">
                <p className="prompt-snapshot">{analysis.promptText}</p>
                <p>{analysis.result}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
