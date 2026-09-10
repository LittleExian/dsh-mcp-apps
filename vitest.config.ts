import { defineConfig } from 'vitest/config'
export default defineConfig({test:{include:['tests/**/*.test.ts','tests/**/*.test.tsx'],coverage:{provider:'v8',include:['src/**/*.ts','src/**/*.tsx','examples/github-trending/github.ts','examples/github-trending/server.ts'],reporter:['text','json','html'],thresholds:{lines:80,statements:80,functions:80,branches:80}}}})
