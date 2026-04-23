*AGENTS.md*
===========

This repository contains a Deno 2 MCP server. Its main job is to fetch web
pages, extract the readable body content, and serve that through `/mcp`.


Project shape
-------------

 -  Entry point: *src/main.ts*
 -  MCP endpoint: `/mcp`
 -  Health endpoint: `/health`
 -  Scraping logic: *src/scrape.ts*
 -  Optional Bearer auth: *src/auth.ts*


Commands
--------

 -  Type-check: `deno task check`
 -  Test: `deno task test`
 -  Run locally: `deno task start`
 -  Run locally with watch mode: `deno task dev`
 -  Format code and docs: `deno task fmt`

Markdown files, including *README.md* and *AGENTS.md*, must be formatted with
`hongdown -w`. `deno task fmt` already runs that command after `deno fmt`.


Implementation notes
--------------------

Deno Deploy compatibility comes first. The entrypoint starts a server with
`Deno.serve(...)` when run directly, and also keeps a default `fetch` export for
`deno serve` style execution.

Use `npm:fastmcp@4.0.0/edge` for the MCP server. The JSR package
`jsr:@punkpeye/fastmcp@4.0.0` currently does not export `./edge`, even though
the FastMCP docs describe `fastmcp/edge` for edge runtimes.

All outbound URL fetches should go through the helper code in *src/scrape.ts*.
Keep these constraints intact:

 -  Only `http:` and `https:` URLs are accepted.
 -  Requests use a browser-like `User-Agent`.
 -  Requests have a timeout.
 -  Response bodies have a maximum byte size.
 -  `robots.txt` is not checked.

`content_scrape` uses cheer-reader to extract an HTML fragment. Markdown output
is the default and is produced with Turndown. `raw_fetch` returns response body
text even when the HTTP status is not 2xx.


Testing guidance
----------------

Avoid real network calls in tests. Inject a fake `fetcher` into the scraping
helpers instead.

Test auth logic with `Request` objects and `guardMcpRequest()` rather than by
starting an HTTP server.

For `content_scrape`, test the behavior that matters: main body text is kept,
obvious nav/footer text is removed, requested output formats differ, and
relative links become absolute where applicable. cheer-reader may remove a
duplicated title from the content, so do not assert that page titles always
remain in the body.


Change discipline
-----------------

Do not revert user changes.

If a formatter, lockfile update, or dependency command changes tracked files,
inspect the result and keep only changes that belong to the current task.

When adding a dependency, verify that it works on Deno Deploy and update the
dependency notes in *README.md*.
