/**
 * Run an async mapper over items with a ceiling on in-flight work.
 *
 * A NYT section can return dozens of articles; firing every scoring call at
 * once is a reliable way to get rate limited.
 */
export const mapWithConcurrency = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  };

  const size = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: size }, worker));

  return results;
};
