# AGENTS.md

This document is for AI and coding agents working in this repository.

## Read the Documentation First

Before analyzing, designing, implementing, or refactoring, read:

1. `README.md`
2. `docs/maintainers/architecture.md`
3. `docs/maintainers/protocol.md`
4. `docs/guides/usage.md`

These files are the primary sources for the project's architecture and usage. The documentation index is in the root `README.md`. Do not duplicate the complete architecture documentation in `AGENTS.md`.

## Project Scope

- Package name: `@yorun-ai/vrpc`
- Package surfaces:
  - Generic HTTP client core
  - Browser vRPC client

## Working Rules

### 1. Documentation First

- Read the applicable documentation before making changes.
- If the code and documentation disagree, treat the current code as authoritative and correct the documentation, or align both as part of the implementation.
- Do not change public APIs without first understanding the documented constraints.

### 2. Evaluate Documentation Impact for Every Change

The following changes require documentation updates:

- Public export changes
- Type contract changes
- Changes to defaults, error semantics, or request behavior
- Recommended usage changes
- Browser or generic runtime behavior changes

Update:

- User-facing documentation: `README.md` and `docs/guides/`
- Maintainer documentation: `docs/maintainers/`

Repository documentation is maintained in English, except for the Chinese root overview in `README.zh-CN.md`. Keep both root README files synchronized when their shared content changes.

### 3. Preserve Layer Boundaries

- `contracts`: define contracts before writing implementations.
- `core`: perform request orchestration and protocol adaptation only; do not perform runtime I/O.
- `transports`: perform runtime network I/O and lifecycle management only.
- `entrypoints`: assemble and export the public API only.

### 4. Prioritize Compatibility

- Preserve published entrypoints and exports unless a breaking change is explicitly requested.
- Make public API changes additive by default.

### 5. Keep Contexts Isolated

- `VrpcInvokeContext` is available to interceptors only.
- `HttpTransportRequest` contains network-facing request data only.
- Do not copy `wire`, `suppressGlobalToast`, or interceptor context fields into a transport request.

### 6. Verification

After behavioral changes or refactoring, run before committing:

```bash
pnpm type-check
pnpm test
pnpm build
```

### 7. Common Change Locations

- Types and context: `src/contracts/types.ts`
- Error model: `src/contracts/errors.ts`
- Generic HTTP client: `src/core/create-client-core.ts`, `src/core/create-http-client.ts`
- vRPC adaptation: `src/core/create-vrpc-client.ts`, `src/protocol/headers.ts`
- Transports: `src/transports/*.ts`

## Execution Principles

- Prefer small, clear changes with a single responsibility.
- Add tests for behavioral changes, and evolve documentation with the code.
- If existing documentation is outdated, correct it before continuing with the implementation.
