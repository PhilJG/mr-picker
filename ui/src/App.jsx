import { useCallback, useMemo, useState } from "react";
import { api } from "./api.js";
import { useResource } from "./hooks.js";
import { SectionFetcher } from "./components/SectionFetcher.jsx";
import { HeadlineFeed } from "./components/HeadlineFeed.jsx";
import { PromptPicker } from "./components/PromptPicker.jsx";
import { AnalysisRunner } from "./components/AnalysisRunner.jsx";
import { AnalysisHistory } from "./components/AnalysisHistory.jsx";

export default function App() {
  const [minScore, setMinScore] = useState(80);
  const [selectedId, setSelectedId] = useState("michael-burry");
  const [customText, setCustomText] = useState("");

  const headlineFilter = useMemo(() => ({ minScore }), [minScore]);

  const headlines = useResource(
    () => api.headlines({ minScore }),
    [minScore],
    { results: [] }
  );
  const prompts = useResource(() => api.prompts(), [], { results: [] });
  const analyses = useResource(() => api.analyses(), [], { results: [] });

  const handlePromptSaved = useCallback(
    (saved) => {
      prompts.reload();
      setSelectedId(saved.id);
      setCustomText("");
    },
    [prompts]
  );

  return (
    <div className="app">
      <header className="masthead">
        <h1>Mr Picker</h1>
        <p>
          Score the day's headlines for market relevance, then read them through
          an analyst of your choosing.
        </p>
      </header>

      <div className="columns">
        <div className="column">
          <SectionFetcher onFetched={headlines.reload} />
          <HeadlineFeed
            headlines={headlines.data?.results ?? []}
            loading={headlines.loading}
            error={headlines.error}
            minScore={minScore}
            onMinScore={(value) => setMinScore(value === "" ? 0 : Number(value))}
          />
        </div>

        <div className="column">
          <PromptPicker
            prompts={prompts.data?.results ?? []}
            loading={prompts.loading}
            error={prompts.error}
            selectedId={selectedId}
            onSelect={setSelectedId}
            customText={customText}
            onCustomText={setCustomText}
            onPromptSaved={handlePromptSaved}
          />
          <AnalysisRunner
            selectedId={selectedId}
            customText={customText}
            headlineFilter={headlineFilter}
            headlineCount={headlines.data?.results?.length ?? 0}
            onComplete={analyses.reload}
          />
          <AnalysisHistory
            analyses={analyses.data?.results ?? []}
            loading={analyses.loading}
            error={analyses.error}
          />
        </div>
      </div>
    </div>
  );
}
