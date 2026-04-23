import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import {
  contentScrape,
  type Fetcher,
  getRuntimeConfig,
  rawFetch,
  ScrapeError,
} from "./scrape.ts";

const ARTICLE_HTML = `<!doctype html>
<html>
  <head>
    <title>Example Article</title>
  </head>
  <body>
    <nav>Navigation link that should not survive extraction.</nav>
    <article>
      <h1>Example Article</h1>
      <p>Main paragraph with enough useful words for the reader output.</p>
      <p>Second paragraph with a <a href="/relative">relative link</a>.</p>
    </article>
    <footer>Footer text that should not survive extraction.</footer>
  </body>
</html>`;

Deno.test("contentScrape returns Markdown by default", async () => {
  const markdown = await contentScrape(
    { url: "https://example.test/article" },
    testOptions(ARTICLE_HTML),
  );

  assertStringIncludes(markdown, "Main paragraph");
  assertStringIncludes(
    markdown,
    "[relative link](https://example.test/relative)",
  );
  assertEquals(markdown.includes("Navigation link"), false);
  assertEquals(markdown.includes("Footer text"), false);
});

Deno.test("contentScrape can return an HTML fragment", async () => {
  const html = await contentScrape(
    { format: "html", url: "https://example.test/article" },
    testOptions(ARTICLE_HTML),
  );

  assertStringIncludes(html, "Main paragraph");
  assertStringIncludes(html, "<");
  assertEquals(html.includes("Navigation link"), false);
  assertEquals(html.includes("Footer text"), false);
});

Deno.test("rawFetch returns response text without requiring a 2xx status", async () => {
  const text = await rawFetch(
    { url: "https://example.test/not-found" },
    testOptions("not found", { status: 404 }),
  );

  assertEquals(text, "not found");
});

Deno.test("rawFetch sends the configured browser-like user agent", async () => {
  let seenUserAgent: string | null = null;
  const fetcher: Fetcher = (_input, init) => {
    seenUserAgent = new Headers(init?.headers).get("user-agent");
    return Promise.resolve(new Response("ok"));
  };

  await rawFetch({ url: "https://example.test" }, {
    fetcher,
    maxResponseBytes: 1_000,
    timeoutMs: 1_000,
    userAgent: "UnitTestBrowser/1.0",
  });

  assertEquals(seenUserAgent, "UnitTestBrowser/1.0");
});

Deno.test("fetch helpers reject non-HTTP URLs", async () => {
  await assertRejects(
    () => rawFetch({ url: "file:///etc/passwd" }, testOptions("nope")),
    ScrapeError,
    "Only http: and https:",
  );
});

Deno.test("fetch helpers enforce MAX_RESPONSE_BYTES", async () => {
  await assertRejects(
    () =>
      rawFetch({ url: "https://example.test/large" }, {
        ...testOptions("too large"),
        maxResponseBytes: 3,
      }),
    ScrapeError,
    "MAX_RESPONSE_BYTES",
  );
});

Deno.test("getRuntimeConfig reads positive environment overrides", () => {
  const env = new Map([
    ["FETCH_TIMEOUT_MS", "1234"],
    ["MAX_RESPONSE_BYTES", "5678"],
    ["SCRAPER_USER_AGENT", "CustomAgent/1.0"],
  ]);

  assertEquals(getRuntimeConfig({ get: (key) => env.get(key) }), {
    maxResponseBytes: 5678,
    timeoutMs: 1234,
    userAgent: "CustomAgent/1.0",
  });
});

function testOptions(
  body: string,
  init: ResponseInit = {},
): {
  fetcher: Fetcher;
  maxResponseBytes: number;
  timeoutMs: number;
  userAgent: string;
} {
  return {
    fetcher: () =>
      Promise.resolve(
        new Response(body, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            ...Object.fromEntries(new Headers(init.headers).entries()),
          },
          status: init.status ?? 200,
        }),
      ),
    maxResponseBytes: 100_000,
    timeoutMs: 1_000,
    userAgent: "UnitTestBrowser/1.0",
  };
}
