#!/usr/bin/env node
// MCP server exposing the marketplace to agents.
//
// Deferred: the V1 agent surface is the JSON API (see README.md — the MCP
// wrapper was cut at scope-lock). This stub keeps `npm run mcp` honest until
// the server is implemented with @modelcontextprotocol/sdk.

console.error(
  "The Agent-Tickets MCP server is not implemented yet.\n" +
    "V1 exposes the JSON API instead: GET/POST /api/listings.",
);
process.exit(1);
