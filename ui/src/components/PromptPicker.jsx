import { useState } from "react";
import { api } from "../api.js";

const BLANK = { label: "", description: "", promptText: "" };

/**
 * Choose a saved persona, or write one. Writing one can be a throwaway (run it
 * once) or saved so it joins the list.
 */
export function PromptPicker({
  prompts,
  loading,
  error,
  selectedId,
  onSelect,
  customText,
  onCustomText,
  onPromptSaved,
}) {
  const [draft, setDraft] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const usingCustom = selectedId === null;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api.savePrompt({
        label: draft.label,
        description: draft.description,
        promptText: customText,
      });
      setDraft(BLANK);
      onPromptSaved?.(saved);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <h2>3 · Pick an analyst</h2>
      {error && <p className="error">{error}</p>}
      {loading && <p className="hint">Loading prompts…</p>}

      <div className="prompt-grid">
        {prompts.map((prompt) => (
          <button
            type="button"
            key={prompt.id}
            className={`prompt-card${selectedId === prompt.id ? " selected" : ""}`}
            onClick={() => onSelect(prompt.id)}
          >
            <strong>{prompt.label}</strong>
            {!prompt.isBuiltin && <span className="badge">yours</span>}
            <span className="prompt-desc">{prompt.description}</span>
          </button>
        ))}

        <button
          type="button"
          className={`prompt-card${usingCustom ? " selected" : ""}`}
          onClick={() => onSelect(null)}
        >
          <strong>Write your own</strong>
          <span className="prompt-desc">
            Give the model its own instructions for this run.
          </span>
        </button>
      </div>

      {usingCustom && (
        <div className="custom-prompt">
          <textarea
            rows="5"
            placeholder="You are a commodities desk strategist. Review the headlines below and…"
            value={customText}
            onChange={(e) => onCustomText(e.target.value)}
          />

          <details>
            <summary>Save this prompt for next time</summary>
            <div className="row">
              <label>
                Name
                <input
                  value={draft.label}
                  placeholder="Commodities desk"
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                />
              </label>
              <label className="grow">
                Description
                <input
                  value={draft.description}
                  placeholder="Energy and metals lens"
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </label>
              <button
                type="button"
                onClick={save}
                disabled={saving || !draft.label.trim() || !customText.trim()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
            {saveError && <p className="error">{saveError}</p>}
          </details>
        </div>
      )}
    </section>
  );
}
