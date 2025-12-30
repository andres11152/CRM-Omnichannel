#!/bin/bash
# 🛡️ Memory-Optimized Dev Server

# Node flags:
# --expose-gc: Allow manual garbage collection
# --max-old-space-size=2048: Increase heap to 2GB (default: ~1.4GB)
# --max-semi-space-size=64: Optimize young generation

NODE_OPTIONS="--expose-gc --max-old-space-size=2048" \
ts-node-dev \
  -r tsconfig-paths/register \
  --respawn \
  --transpile-only \
  src/server.ts
