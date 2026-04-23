web-scrape-mcp
==============

A small MCP server for fetching web pages in a form that is easier for LLM
clients to use. It runs on Deno 2, uses FastMCP, and is intended to work both
locally and on Deno Deploy.

The server exposes two tools:

 -  `content_scrape` fetches a mostly HTML page, extracts the main readable
    content, and returns either Markdown or an HTML fragment.
 -  `raw_fetch` runs a plain HTTP `GET` request and returns the response body as
    text.


Tools
-----

### `content_scrape`

Fetch a web page and return the readable body content.

Input:

~~~~ json
{
  "url": "https://example.com/article",
  "format": "markdown"
}
~~~~

Fields:

 -  `url`: an `http:` or `https:` URL.
 -  `format`: either `"markdown"` or `"html"`. The default is `"markdown"`.

In Markdown mode, the server extracts an HTML fragment with cheer-reader and
converts that fragment with Turndown. In HTML mode, it returns the extracted
fragment directly.

### `raw_fetch`

Fetch a URL with HTTP `GET` and return the response body as text. This is useful
when `content_scrape` does not fit the target page, or when you want to call a
simple text-based API.

Input:

~~~~ json
{
  "url": "https://example.com/api"
}
~~~~

`raw_fetch` still enforces the same URL, timeout, response-size, and user-agent
rules as `content_scrape`.


Local usage
-----------

Check that Deno is installed:

~~~~ sh
deno --version
~~~~

Run the development server:

~~~~ sh
deno task dev
~~~~

Run without file watching:

~~~~ sh
deno task start
~~~~

Default endpoints:

 -  MCP endpoint: `http://localhost:8000/mcp`
 -  Health check: `http://localhost:8000/health`

Set `PORT` to use a different local port.


Configuration
-------------

| Environment variable | Default        | Description                                             |
| -------------------- | -------------- | ------------------------------------------------------- |
| `PORT`               | `8000`         | Local HTTP server port                                  |
| `MCP_AUTH_TOKEN`     | unset          | If set, `/mcp` requires `Authorization: Bearer <token>` |
| `FETCH_TIMEOUT_MS`   | `20000`        | Outbound fetch timeout                                  |
| `MAX_RESPONSE_BYTES` | `5000000`      | Maximum response body size                              |
| `SCRAPER_USER_AGENT` | Chrome-like UA | `User-Agent` used for outbound fetches                  |

If `MCP_AUTH_TOKEN` is not set, the MCP endpoint is public. Set it before
deploying to a publicly reachable Deno Deploy URL unless you intentionally want
an open endpoint.


Deno Deploy
-----------

The repository includes Deno Deploy configuration in *deno.json*. The dynamic
runtime entrypoint is *src/main.ts*.

Create a Deno Deploy app from the CLI:

~~~~ sh
deno deploy create \
  --source local \
  --runtime-mode dynamic \
  --entrypoint src/main.ts
~~~~

If the app is already linked, deploy the current revision:

~~~~ sh
deno deploy
~~~~

The remote MCP endpoint is:

~~~~ txt
https://<your-app-url>/mcp
~~~~

If `MCP_AUTH_TOKEN` is set, configure your MCP client to send the matching
Bearer token.


Development
-----------

Type-check:

~~~~ sh
deno task check
~~~~

Run tests:

~~~~ sh
deno task test
~~~~

Format code and docs:

~~~~ sh
deno task fmt
~~~~

`deno task fmt` runs `deno fmt` and `hongdown -w` for *README.md* and
*AGENTS.md*.


Dependency notes
----------------

FastMCP documents `fastmcp/edge` and `EdgeFastMCP` as the right entrypoint for
edge runtimes such as Deno Deploy. The JSR package
`jsr:@punkpeye/fastmcp@4.0.0` currently does not export `./edge`, so this
project uses `npm:fastmcp@4.0.0/edge` for the deployed server.

Other runtime dependencies:

 -  `jsr:@paoramen/cheer-reader` for readable-content extraction.
 -  `npm:turndown` for HTML-to-Markdown conversion.
 -  `npm:zod` for MCP tool schemas.
