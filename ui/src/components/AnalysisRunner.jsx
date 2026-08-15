import { useState } from "react";
import { api } from "../api.js";

/** Runs the chosen prompt over the current headline pool. */
export function AnalysisRunner({
  selectedId,
  customText,
  headlineFilter,
  headlineCount,
  onComplete,
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  const usingCustom = selectedId === null;
  const disabled =
    running || headlineCount === 0 || (usingCustom && !customText.trim());

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await api.analyze(
        usingCustom
          ? { customPromptText: customText, headlineFilter }
          : { promptId: selectedId, headlineFilter }
      );
      setAnalysis(result);
      onComplete?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="panel">
      <h2>4 · Run it</h2>

      <div className="row">
        <button type="button" className="primary" onClick={run} disabled={disabled}>
          {running ? "Thinking…" : `Analyze ${headlineCount} headlines`}
        </button>
      </div>

      {headlineCount === 0 && (
        <p className="hint">Gather some headlines first.</p>
      )}
      {error && <p className="error">{error}</p>}

      {analysis && (
        <article className="result">
          <header>
            <strong>{analysis.promptUsed.label}</strong>
            <span className="meta">
              {analysis.headlineCount} headlines ·{" "}
              {new Date(analysis.createdAt).toLocaleString()}
            </span>
          </header>
          <p>{analysis.result}</p>
        </article>
      )}
    </section>
  );
}
