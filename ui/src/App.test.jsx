/**
 * Smoke tests: the app mounts, renders what the API returns, and the core
 * flow (pick a prompt -> run it -> see the result and the history entry)
 * works end to end against a stubbed API.
 *
 * fetch is stubbed rather than the api module mocked, so the request paths and
 * bodies the UI actually sends are part of what's asserted.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.jsx";

const PROMPTS = [
  {
    id: "michael-burry",
    label: "Michael Burry",
    description: "Contrarian deep-value investor.",
    promptText: "You are Michael Burry.",
    isBuiltin: true,
  },
  {
    id: "macro-analyst",
    label: "Macro analyst",
    description: "Top-down read on rates.",
    promptText: "You are a macro analyst.",
    isBuiltin: true,
  },
];

const HEADLINES = [
  {
    url: "https://example.com/chip",
    title: "Chip Maker Warns of Steep Drop in Data Center Orders",
    abstract: "Guidance cut by a third.",
    section: "technology",
    published_date: "2026-08-15T06:00:11-04:00",
    score: 91,
    rationale: "Semis guidance cut.",
  },
  {
    url: "https://example.com/cloud",
    title: "Regulators Open Antitrust Inquiry Into Cloud Pricing",
    abstract: "Could reshape enterprise billing.",
    section: "technology",
    published_date: "2026-08-15T05:30:00-04:00",
    score: 84,
    rationale: "Regulatory overhang.",
  },
];

let requests;
let analyses;

const json = (body) =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  requests = [];
  analyses = [];

  vi.stubGlobal("fetch", (path, options = {}) => {
    requests.push({ path, method: options.method ?? "GET", body: options.body });

    if (path.startsWith("/api/sections")) return json(["business", "technology"]);
    if (path.startsWith("/api/prompts") && options.method === "POST") {
      const sent = JSON.parse(options.body);
      const saved = { id: "my-take", ...sent, isBuiltin: false };
      PROMPTS.push(saved);
      return json(saved);
    }
    if (path.startsWith("/api/prompts")) return json({ results: PROMPTS });
    if (path.startsWith("/api/headlines"))
      return json({ num_results: HEADLINES.length, results: HEADLINES });
    if (path.startsWith("/api/analyze")) {
      const sent = JSON.parse(options.body);
      const created = {
        id: analyses.length + 1,
        promptId: sent.promptId ?? null,
        promptLabel: sent.promptId ? "Michael Burry" : "Custom prompt",
        promptText: sent.customPromptText ?? "You are Michael Burry.",
        result: "Short the semis.",
        headlineCount: HEADLINES.length,
        createdAt: "2026-08-15T23:00:00.000Z",
      };
      analyses.unshift(created);
      return json({
        id: created.id,
        result: created.result,
        promptUsed: { id: created.promptId, label: created.promptLabel },
        headlineCount: created.headlineCount,
        createdAt: created.createdAt,
      });
    }
    if (path.startsWith("/api/analyses"))
      return json({ num_results: analyses.length, results: analyses });

    throw new Error(`unstubbed request: ${path}`);
  });
});

afterEach(() => {
  // Testing Library only auto-registers cleanup when vitest globals are on;
  // without this each test leaves its render mounted and queries go ambiguous.
  cleanup();
  vi.unstubAllGlobals();
  PROMPTS.length = 2;
});

describe("App", () => {
  it("renders the scored headline pool", async () => {
    render(<App />);

    expect(
      await screen.findByText(/Chip Maker Warns of Steep Drop/)
    ).toBeTruthy();
    expect(screen.getByText("91")).toBeTruthy();
    expect(screen.getByText("Semis guidance cut.")).toBeTruthy();
    expect(screen.getByText(/2 headlines in the pool/)).toBeTruthy();
  });

  it("lists the analyst personas from the API", async () => {
    render(<App />);

    expect(await screen.findByText("Michael Burry")).toBeTruthy();
    expect(screen.getByText("Macro analyst")).toBeTruthy();
    expect(screen.getByText("Write your own")).toBeTruthy();
  });

  it("requests headlines with the minimum score filter", async () => {
    render(<App />);
    await screen.findByText(/Chip Maker/);

    expect(
      requests.some((r) => r.path === "/api/headlines?minScore=80")
    ).toBe(true);
  });

  it("runs the selected prompt and shows the result", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Analyze 2 headlines/ }));

    expect(await screen.findByText("Short the semis.")).toBeTruthy();

    const analyze = requests.find((r) => r.path === "/api/analyze");
    expect(JSON.parse(analyze.body)).toMatchObject({
      promptId: "michael-burry",
      headlineFilter: { minScore: 80 },
    });
  });

  it("adds the completed run to history", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Analyze 2 headlines/ }));
    await screen.findByText("Short the semis.");

    const history = screen.getByText("History").closest("section");
    await waitFor(() =>
      expect(within(history).getByText(/2 headlines ·/)).toBeTruthy()
    );
  });

  it("switches to a custom prompt and sends its text", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Write your own"));

    const textarea = screen.getByPlaceholderText(/commodities desk strategist/i);
    await user.type(textarea, "You are a quant.");

    await user.click(screen.getByRole("button", { name: /Analyze 2 headlines/ }));

    await screen.findByText("Short the semis.");
    const analyze = requests.find((r) => r.path === "/api/analyze");
    expect(JSON.parse(analyze.body).customPromptText).toBe("You are a quant.");
  });

  it("will not run an empty custom prompt", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Write your own"));

    expect(
      screen.getByRole("button", { name: /Analyze 2 headlines/ }).disabled
    ).toBe(true);
  });

  it("saves a custom prompt so it joins the list", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Write your own"));
    await user.type(
      screen.getByPlaceholderText(/commodities desk strategist/i),
      "You are a quant."
    );

    await user.click(screen.getByText(/Save this prompt for next time/));
    await user.type(screen.getByPlaceholderText("Commodities desk"), "My take");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("My take")).toBeTruthy());

    const post = requests.find(
      (r) => r.path === "/api/prompts" && r.method === "POST"
    );
    expect(JSON.parse(post.body)).toMatchObject({
      label: "My take",
      promptText: "You are a quant.",
    });
  });

  it("surfaces an API error instead of failing silently", async () => {
    vi.stubGlobal("fetch", (path) => {
      if (path.startsWith("/api/headlines")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: "Failed to fetch articles" }),
        });
      }
      if (path.startsWith("/api/sections")) return json(["business"]);
      if (path.startsWith("/api/prompts")) return json({ results: PROMPTS });
      return json({ num_results: 0, results: [] });
    });

    render(<App />);

    expect(await screen.findByText("Failed to fetch articles")).toBeTruthy();
  });
});
