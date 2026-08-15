export class AnalysisError extends Error {
  constructor(message, { status = 400 } = {}) {
    super(message);
    this.name = "AnalysisError";
    this.status = status;
  }
}

const renderHeadlines = (headlines) =>
  headlines
    .map((article, index) => {
      const lines = [
        `${index + 1}. [relevance ${article.score}] ${article.title}`,
      ];
      if (article.abstract) lines.push(`   ${article.abstract}`);
      if (article.section) lines.push(`   (section: ${article.section})`);
      return lines.join("\n");
    })
    .join("\n\n");

/**
 * Runs one user-chosen analysis prompt across the aggregated headlines.
 *
 * A single model call sees the whole set, so the analysis can reason about
 * themes across articles rather than one headline at a time. Each run is
 * recorded, so results are browsable afterwards.
 */
export const createAnalysisService = ({
  client,
  model,
  aggregateService,
  promptsRepo,
  analysesRepo,
}) => ({
  listPrompts() {
    return promptsRepo.list();
  },

  savePrompt({ label, promptText, description }) {
    if (!label || !String(label).trim()) {
      throw new AnalysisError("A prompt needs a label.");
    }
    if (!promptText || !String(promptText).trim()) {
      throw new AnalysisError("A prompt needs promptText.");
    }

    return promptsRepo.create({
      label: String(label).trim(),
      promptText: String(promptText).trim(),
      description: description ? String(description).trim() : "",
    });
  },

  listAnalyses(options) {
    return analysesRepo.list(options);
  },

  getAnalysis(id) {
    const analysis = analysesRepo.get(id);
    if (!analysis) {
      throw new AnalysisError(`No analysis with id ${id}`, { status: 404 });
    }
    return analysis;
  },

  resolvePrompt({ promptId, customPromptText }) {
    const hasId = Boolean(promptId);
    const hasCustom = Boolean(customPromptText && customPromptText.trim());

    if (hasId === hasCustom) {
      throw new AnalysisError(
        "Provide exactly one of promptId or customPromptText."
      );
    }

    if (hasCustom) {
      return {
        id: null,
        label: "Custom prompt",
        promptText: customPromptText.trim(),
      };
    }

    // Resolves saved custom prompts by id too, not just built-ins.
    const saved = promptsRepo.get(promptId);
    if (!saved) {
      throw new AnalysisError(`Unknown promptId: ${promptId}`, { status: 404 });
    }
    return saved;
  },

  async run({ promptId, customPromptText, headlineFilter = {} }) {
    const prompt = this.resolvePrompt({ promptId, customPromptText });
    const headlines = aggregateService.getHeadlines(headlineFilter);

    if (headlines.length === 0) {
      throw new AnalysisError(
        "No scored headlines available to analyze. Fetch some sections first via /api/articles/:section."
      );
    }

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt.promptText },
        {
          role: "user",
          content: `Here are today's market-relevant headlines:\n\n${renderHeadlines(
            headlines
          )}`,
        },
      ],
    });

    const saved = analysesRepo.save({
      promptId: prompt.id,
      promptLabel: prompt.label,
      promptText: prompt.promptText,
      headlineFilter,
      result: completion.choices[0].message.content,
      headlineCount: headlines.length,
    });

    return {
      id: saved.id,
      result: saved.result,
      promptUsed: {
        id: prompt.id,
        label: prompt.label,
        promptText: prompt.promptText,
      },
      headlineCount: saved.headlineCount,
      headlineFilter,
      createdAt: saved.createdAt,
    };
  },
});
