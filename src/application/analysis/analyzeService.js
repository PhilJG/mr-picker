import { BUILT_IN_PROMPTS, findBuiltInPrompt } from "./prompts.js";

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
 * themes across articles rather than one headline at a time.
 */
export const createAnalysisService = ({
  client,
  model,
  aggregateService,
  listPrompts = () => BUILT_IN_PROMPTS,
  getPrompt = findBuiltInPrompt,
}) => ({
  listPrompts,

  resolvePrompt({ promptId, customPromptText }) {
    const hasId = Boolean(promptId);
    const hasCustom = Boolean(customPromptText && customPromptText.trim());

    if (hasId === hasCustom) {
      throw new AnalysisError(
        "Provide exactly one of promptId or customPromptText."
      );
    }

    if (hasCustom) {
      return { id: null, label: "Custom prompt", promptText: customPromptText.trim() };
    }

    const preset = getPrompt(promptId);
    if (!preset) {
      throw new AnalysisError(`Unknown promptId: ${promptId}`, { status: 404 });
    }
    return preset;
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

    return {
      result: completion.choices[0].message.content,
      promptUsed: { id: prompt.id, label: prompt.label, promptText: prompt.promptText },
      headlineCount: headlines.length,
      headlineFilter,
    };
  },
});
