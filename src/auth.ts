export const MCP_PATH = "/mcp";

export function isProtectedMcpPath(
  request: Request,
  mcpPath = MCP_PATH,
): boolean {
  const { pathname } = new URL(request.url);
  return pathname === mcpPath || pathname.startsWith(`${mcpPath}/`);
}

export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization == null) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function guardMcpRequest(
  request: Request,
  token: string | null | undefined,
  mcpPath = MCP_PATH,
): Response | null {
  const expectedToken = token?.trim();
  if (!expectedToken || !isProtectedMcpPath(request, mcpPath)) return null;

  if (getBearerToken(request) === expectedToken) return null;

  return Response.json(
    {
      error: "Unauthorized",
      message: `Send Authorization: Bearer <token> to access ${mcpPath}.`,
    },
    {
      headers: {
        "www-authenticate": "Bearer",
      },
      status: 401,
    },
  );
}
