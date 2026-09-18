// Suites requiring a real backend must never run as part of the default unit job.
export const integrationTests = [
  'src/test/rls/**/*.{test,spec}.{ts,tsx}',
  'src/test/tenancy/**/*.{test,spec}.{ts,tsx}',
  'src/test/integration/**/*.{test,spec}.{ts,tsx}',
  'src/test/functions/**/*.{test,spec}.{ts,tsx}',
  'src/test/mcp/mcpEndpointAuth.test.ts',
  'src/test/mcp/scopeTampering.test.tsx',
];
