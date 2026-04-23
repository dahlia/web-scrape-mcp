import { EdgeFastMCP } from "fastmcp/edge";
import { z } from "zod";
import { guardMcpRequest, MCP_PATH } from "./auth.ts";
import { contentScrape, rawFetch } from "./scrape.ts";

const contentScrapeParameters = z.object({
  format: z.enum(["markdown", "html"]).optional().default("markdown"),
  url: z.string().min(1).describe("HTTP or HTTPS URL of the web page."),
});

const rawFetchParameters = z.object({
  url: z.string().min(1).describe("HTTP or HTTPS URL to GET."),
});

export const server = new EdgeFastMCP({
  description: "Fetch web pages and extract main readable content for LLMs.",
  mcpPath: MCP_PATH,
  name: "web-scrape-mcp",
  version: "0.1.0",
});

server.addTool({
  description:
    "Fetch a mostly-HTML web page and return only the main readable content. Markdown is returned by default; pass format='html' for an HTML fragment.",
  execute: async (args) => {
    return await contentScrape(contentScrapeParameters.parse(args));
  },
  name: "content_scrape",
  parameters: contentScrapeParameters,
});

server.addTool({
  description:
    "Run a plain HTTP GET for a URL and return the response body as text. Use this when content_scrape is not suitable.",
  execute: async (args) => {
    return await rawFetch(rawFetchParameters.parse(args));
  },
  name: "raw_fetch",
  parameters: rawFetchParameters,
});

server.getApp().get("/", (c) =>
  c.text(
    [
      "web-scrape-mcp",
      "",
      `MCP endpoint: ${MCP_PATH}`,
      "Health check: /health",
    ].join("\n"),
  ));

export async function fetchHandler(request: Request): Promise<Response> {
  const unauthorized = guardMcpRequest(request, Deno.env.get("MCP_AUTH_TOKEN"));
  if (unauthorized != null) return unauthorized;

  return await server.fetch(request);
}

export default {
  fetch: fetchHandler,
} satisfies Deno.ServeDefaultExport;

if (import.meta.main) {
  Deno.serve({ port: readPort() }, fetchHandler);
}

function readPort(): number {
  const raw = Deno.env.get("PORT");
  if (raw == null || raw.trim() === "") return 8000;

  const port = Number(raw);
  return Number.isSafeInteger(port) && port > 0 && port <= 65535 ? port : 8000;
}
