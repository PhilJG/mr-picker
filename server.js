import dotenv from "dotenv";
import { createApp } from "./app.js";

dotenv.config();

const port = process.env.PORT || 3000;

const app = createApp();

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
