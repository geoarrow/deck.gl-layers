# Developer documentation

This is a monorepo managed with pnpm workspaces.

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Watch mode for development
pnpm build:watch

# Run tests in all packages
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint code
pnpm lint

# Format code
pnpm format

# Type check
pnpm typecheck
```

## Publishing

Publishing happens automatically when a new tag is pushed to the `main` branch with format `v*`.

You must be part of the "release" environment in the repository settings to publish a new version.

## Examples

It's hard to test deck.gl-based code (or at least involved to set up the test harness), so for now this project is primarily "tested through examples" :sweat_smile:. (In the future it would be nice to implement full testing).

The examples are not yet fully reproducible because they rely on specific data files whose generation is not 100% reproducible. This is planned work for the future.
