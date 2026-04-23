import { assertEquals } from "@std/assert";
import { guardMcpRequest, isProtectedMcpPath } from "./auth.ts";

Deno.test("MCP auth is disabled when token is not set", () => {
  const request = new Request("https://example.test/mcp");

  assertEquals(guardMcpRequest(request, undefined), null);
  assertEquals(guardMcpRequest(request, ""), null);
});

Deno.test("MCP auth protects /mcp and nested MCP paths", () => {
  assertEquals(
    isProtectedMcpPath(new Request("https://example.test/mcp")),
    true,
  );
  assertEquals(
    isProtectedMcpPath(new Request("https://example.test/mcp/session")),
    true,
  );
  assertEquals(
    isProtectedMcpPath(new Request("https://example.test/health")),
    false,
  );
});

Deno.test("MCP auth rejects missing or wrong bearer tokens", async () => {
  const missing = guardMcpRequest(
    new Request("https://example.test/mcp"),
    "secret",
  );
  const wrong = guardMcpRequest(
    new Request("https://example.test/mcp", {
      headers: { authorization: "Bearer wrong" },
    }),
    "secret",
  );

  assertEquals(missing?.status, 401);
  assertEquals(wrong?.status, 401);
  assertEquals(await missing?.json(), {
    error: "Unauthorized",
    message: "Send Authorization: Bearer <token> to access /mcp.",
  });
});

Deno.test("MCP auth accepts the configured bearer token", () => {
  const request = new Request("https://example.test/mcp", {
    headers: { authorization: "Bearer secret" },
  });

  assertEquals(guardMcpRequest(request, "secret"), null);
});

Deno.test("MCP auth leaves non-MCP paths public", () => {
  const request = new Request("https://example.test/health");

  assertEquals(guardMcpRequest(request, "secret"), null);
});
