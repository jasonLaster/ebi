#!/bin/bash

echo "⚠️  Deprecated: use bun scripts/sync.ts instead."
echo "Running sync now..."
exec bun scripts/sync.ts "$@"