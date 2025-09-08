#!/usr/bin/env node
import { z } from 'zod';

const Args = z.tuple([
  z.string().optional(), // service
  z.string().optional(), // tool
  z.string().optional(), // json
]);

async function main() {
  const [, , ...rest] = process.argv;
  const [service, tool, jsonInput] = Args.parse(rest);
  if (!service || !tool) {
    console.error('Usage: pnpm --filter @swarm/mcp-host cli <service> <tool> <json-input>');
    process.exit(2);
  }
  const input = jsonInput ? JSON.parse(jsonInput) : {};
  const base = process.env.HOST_URL || 'http://localhost:4000';
  const res = await fetch(`${base}/call/${service}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool, input }),
  });
  if (!res.ok) {
    console.error('Error:', res.status, await res.text());
    process.exit(1);
  }
  const out = await res.text();
  console.log(out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


