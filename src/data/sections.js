/**
 * Top Stories API section names. The NYT publishes no live endpoint that
 * lists these, so the set is maintained here.
 */
export const NYT_SECTIONS = [
  "arts", "automobiles", "books/review", "business", "fashion", "food",
  "health", "home", "insider", "magazine", "movies", "nyregion",
  "obituaries", "opinion", "politics", "realestate", "science", "sports",
  "sundayreview", "technology", "theater", "t-magazine", "travel",
  "upshot", "us", "world",
];

export const getSections = () => [...NYT_SECTIONS];

export const isValidSection = (section) => NYT_SECTIONS.includes(section);
