import { config, assertRequiredEnv } from "./config/env.js";
import { createApp } from "./app.js";

assertRequiredEnv();

const app = createApp();

app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
  console.log(
    `Model: ${config.openaiModel} | relevance threshold: ${config.relevanceThreshold}`
  );
});
