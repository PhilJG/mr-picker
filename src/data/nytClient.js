import axios from "axios";

export const NYT_BASE_URL = "https://api.nytimes.com/svc/topstories/v2";

/**
 * Normalize a raw NYT Top Stories result to the shape the rest of the app
 * uses. `abstract` is kept here (the old code fetched it and threw it away
 * before scoring, so the model only ever saw the headline).
 */
const toArticle = (result) => ({
  title: result.title,
  abstract: result.abstract ?? "",
  url: result.url,
  section: result.section ?? "",
  published_date: result.published_date ?? null,
});

export const createNytClient = ({
  apiKey,
  baseUrl = NYT_BASE_URL,
  http = axios,
} = {}) => ({
  /** @returns {Promise<{status: string, articles: object[]}>} */
  async fetchTopStories(section) {
    const { data } = await http.get(`${baseUrl}/${section}.json`, {
      params: { "api-key": apiKey },
    });

    return {
      status: data.status ?? "OK",
      articles: (data.results ?? []).map(toArticle),
    };
  },
});
