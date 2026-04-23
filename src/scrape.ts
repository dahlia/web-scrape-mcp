import { Readability, type ReadabilityResult } from "@paoramen/cheer-reader";
import { type CheerioAPI, load } from "cheerio";
// @deno-types="npm:@types/turndown@5.0.5"
import TurndownService from "turndown";

export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 5_000_000;
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type ContentFormat = "markdown" | "html";

export type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface RuntimeConfig {
  maxResponseBytes: number;
  timeoutMs: number;
  userAgent: string;
}

export interface ScrapeOptions extends Partial<RuntimeConfig> {
  fetcher?: Fetcher;
}

export interface ContentScrapeInput {
  format?: ContentFormat;
  url: string;
}

export interface RawFetchInput {
  url: string;
}

interface FetchTextResult {
  headers: Headers;
  status: number;
  text: string;
  url: string;
}

export class ScrapeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ScrapeError";
  }
}

const turndown = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  headingStyle: "atx",
  linkStyle: "inlined",
  strongDelimiter: "**",
});

turndown.remove(["script", "style", "noscript"]);

export function getRuntimeConfig(
  env: Pick<typeof Deno.env, "get"> = Deno.env,
): RuntimeConfig {
  return {
    maxResponseBytes: readPositiveIntegerEnv(
      env,
      "MAX_RESPONSE_BYTES",
      DEFAULT_MAX_RESPONSE_BYTES,
    ),
    timeoutMs: readPositiveIntegerEnv(
      env,
      "FETCH_TIMEOUT_MS",
      DEFAULT_TIMEOUT_MS,
    ),
    userAgent: env.get("SCRAPER_USER_AGENT")?.trim() || DEFAULT_USER_AGENT,
  };
}

export async function contentScrape(
  input: ContentScrapeInput,
  options: ScrapeOptions = {},
): Promise<string> {
  const format = input.format ?? "markdown";
  if (format !== "markdown" && format !== "html") {
    throw new ScrapeError(`Unsupported content format: ${String(format)}`);
  }

  const url = normalizeHttpUrl(input.url);
  const response = await fetchText(url, options, { requireOk: true });
  const article = extractArticle(response.text, url);
  const html = (article.content ?? "").trim();

  if (!html) {
    throw new ScrapeError("Could not extract readable content from the page.");
  }

  return format === "html" ? html : htmlToMarkdown(html);
}

export async function rawFetch(
  input: RawFetchInput,
  options: ScrapeOptions = {},
): Promise<string> {
  const url = normalizeHttpUrl(input.url);
  const response = await fetchText(url, options, { requireOk: false });
  return response.text;
}

export function normalizeHttpUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch (error) {
    throw new ScrapeError(`Invalid URL: ${input}`, { cause: error });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ScrapeError("Only http: and https: URLs are supported.");
  }

  return url;
}

export function extractArticle(html: string, url: URL): ReadabilityResult {
  const $ = load(html);
  absolutizeCommonUrls($, url);

  const article = new Readability($, {
    charThreshold: 0,
  }).parse();

  if (article == null) {
    throw new ScrapeError("Could not extract readable content from the page.");
  }

  return article;
}

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim();
}

async function fetchText(
  url: URL,
  options: ScrapeOptions,
  fetchOptions: { requireOk: boolean },
): Promise<FetchTextResult> {
  const config = mergeRuntimeConfig(options);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(url.href, {
      headers: buildRequestHeaders(config.userAgent),
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ScrapeError(
        `Request timed out after ${config.timeoutMs} ms: ${url.href}`,
        { cause: error },
      );
    }
    throw new ScrapeError(`Request failed: ${url.href}`, { cause: error });
  } finally {
    clearTimeout(timeoutId);
  }

  if (fetchOptions.requireOk && !response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new ScrapeError(
      `Request returned HTTP ${response.status}: ${url.href}`,
    );
  }

  return {
    headers: response.headers,
    status: response.status,
    text: await readLimitedText(response, config.maxResponseBytes),
    url: response.url || url.href,
  };
}

function mergeRuntimeConfig(options: ScrapeOptions): RuntimeConfig {
  const envConfig = getRuntimeConfig();
  return {
    maxResponseBytes: options.maxResponseBytes ??
      envConfig.maxResponseBytes,
    timeoutMs: options.timeoutMs ?? envConfig.timeoutMs,
    userAgent: options.userAgent ?? envConfig.userAgent,
  };
}

function buildRequestHeaders(userAgent: string): Headers {
  return new Headers({
    "accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent": userAgent,
  });
}

async function readLimitedText(
  response: Response,
  maxResponseBytes: number,
): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength != null && Number(declaredLength) > maxResponseBytes) {
    await response.body?.cancel().catch(() => {});
    throw new ScrapeError(
      `Response is larger than MAX_RESPONSE_BYTES (${maxResponseBytes}).`,
    );
  }

  if (response.body == null) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value == null) continue;

    received += value.byteLength;
    if (received > maxResponseBytes) {
      await reader.cancel().catch(() => {});
      throw new ScrapeError(
        `Response is larger than MAX_RESPONSE_BYTES (${maxResponseBytes}).`,
      );
    }

    chunks.push(value);
  }

  return decodeText(concatChunks(chunks, received), response.headers);
}

function decodeText(bytes: Uint8Array, headers: Headers): string {
  const charset = headers.get("content-type")?.match(/charset=([^;]+)/i)?.[1]
    ?.trim();

  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function concatChunks(chunks: Uint8Array[], length: number): Uint8Array {
  const output = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function absolutizeCommonUrls($: CheerioAPI, baseUrl: URL): void {
  for (
    const [selector, attribute] of [
      ["a[href]", "href"],
      ["img[src]", "src"],
      ["source[src]", "src"],
      ["video[src]", "src"],
      ["audio[src]", "src"],
      ["iframe[src]", "src"],
    ] as const
  ) {
    $(selector).each((_, element) => {
      const current = $(element).attr(attribute);
      const next = absolutizeUrl(current, baseUrl);
      if (next != null) $(element).attr(attribute, next);
    });
  }
}

function absolutizeUrl(value: string | undefined, baseUrl: URL): string | null {
  if (value == null || value.trim() === "") return null;

  const trimmed = value.trim();
  if (/^(data|mailto|tel|javascript):/i.test(trimmed)) return trimmed;

  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return trimmed;
  }
}

function readPositiveIntegerEnv(
  env: Pick<typeof Deno.env, "get">,
  key: string,
  fallback: number,
): number {
  const raw = env.get(key);
  if (raw == null || raw.trim() === "") return fallback;

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
