@echo off
REM Memory-optimized dev server for Windows
REM Direct node execution with proper flags
node --expose-gc --max-old-space-size=4096 --require ts-node/register/transpile-only --require tsconfig-paths/register src/server.ts
