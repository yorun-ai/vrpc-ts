# Contributing

This guide defines the development, verification, documentation, commit, and pull-request requirements for `@yorun-ai/vrpc`. Package maintainers must also follow the [release guide](docs/maintainers/releasing.md).

## Prerequisites

- Node.js 24.11 or later.
- pnpm 11.15.0, using the repository lockfile.

Install dependencies from the repository root:

```bash
pnpm install --frozen-lockfile
```

## Repository layout

- `src/contracts/`: public types and error contracts.
- `src/core/`: request orchestration and protocol adaptation.
- `src/protocol/`: vRPC paths, headers, envelopes, and wire conversion.
- `src/transports/`: runtime network I/O.
- `src/entrypoints/`: public package entrypoints.
- `test/`: behavioral, compatibility, and release tests.
- `docs/guides/`: user-facing guides.
- `docs/reference/`: public API reference.
- `docs/maintainers/`: architecture, protocol, and release documentation.

Read `AGENTS.md`, `README.md`, and the applicable documentation before changing behavior or public contracts.

## Development workflow

1. Keep each change focused and preserve compatibility unless a breaking change is explicitly intended.
2. Define or update public contracts before implementing behavior.
3. Keep network I/O inside transports and protocol-independent orchestration inside core.
4. Add or update tests for behavioral changes.
5. Update documentation whenever exports, types, defaults, headers, errors, or request behavior change.
6. Run the relevant checks before opening a pull request.

Run the required checks before opening a pull request:

```bash
pnpm type-check
pnpm test
pnpm fmt:check
pnpm lint
pnpm build
pnpm test:package
```

Use these commands while developing:

```bash
pnpm test:watch
pnpm fmt
pnpm lint:fix
```

Do not commit generated `dist/` output or `node_modules/`.

## Documentation

Documentation is part of the public API contract. Repository documentation is
maintained in English; the root `README.zh-CN.md` is the Chinese entry point and
must stay structurally aligned with `README.md`. Keep both root README files
synchronized when their shared content changes.

- Keep package overview and documentation navigation in `README.md` and `README.zh-CN.md`.
- Put task-oriented material for package users in `docs/guides/`.
- Put public exports, option tables, defaults, and error fields in `docs/reference/`.
- Put architecture, protocol, release, and other repository-maintenance material in `docs/maintainers/`.
- Keep protocol details in `docs/maintainers/protocol.md` instead of duplicating them in the architecture overview.

Prefer linking to a canonical guide over duplicating long explanations across
the README and `docs/`. Do not shorten the README by deleting useful detail;
move that detail to the document that owns it.

### Documentation requirements

When changing public exports, types, defaults, request behavior, headers, error
handling, or transport behavior:

- Update the relevant user guide.
- Update `docs/reference/README.md` when public signatures or behavior change.
- Update `docs/maintainers/protocol.md` when wire behavior changes.
- Keep README examples valid and consistent with the published package.
- Keep `README.md` and `README.zh-CN.md` structurally aligned.
- Verify CDN examples in `docs/guides/cdn.md` against the actual published
  bundles, including loading mode and version pinning.

## Commits

Create focused commits that explain the purpose of the change. Avoid mixing unrelated cleanup with functional work. Before committing, inspect the diff and run `git diff --check` in addition to the applicable project checks.

## Pull requests

A pull request should include:

- The motivation and scope of the change.
- Any public API, compatibility, or protocol impact.
- Tests added or updated and the commands used to verify the change.
- Documentation updates, including both root README languages when applicable.
- Release notes or migration guidance when users need to take action.

Keep pull requests focused and list any intentionally excluded follow-up work.
