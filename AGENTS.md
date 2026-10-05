# vRPC TypeScript Agent Guidelines

## Scope and References

- This repository provides `@yorun-ai/vrpc`, including generic HTTP and browser vRPC clients.
- Read relevant sections of `README.md` and `docs/guides/usage.md` for usage, `docs/maintainers/architecture.md` for layering, and `docs/maintainers/protocol.md` for wire contracts.
- When code and documentation disagree, determine intended behavior from the task, public contract, and tests; do not automatically treat either as correct.

## Architecture and Compatibility

- `contracts` owns types; `core` owns orchestration and protocol adaptation without runtime I/O; `transports` owns network I/O and lifecycle; `entrypoints` assembles public exports.
- Preserve published entrypoints and exports unless a breaking change is explicitly requested. Make public API changes additive by default.
- `VrpcInvokeContext` is interceptor-only. `HttpTransportRequest` contains network-facing data only; never copy `wire`, `suppressGlobalToast`, or interceptor context fields into it.
- Wire changes require checking Vine and skelc producers and consumers alongside runtime tests.

## Documentation

- Correct existing documentation made inaccurate by changes to exports, types, defaults, errors, or request behavior. Document new user-facing features; internal changes and fixes restoring documented behavior do not require additional user documentation.
- Update affected user guides under `docs/guides/` and maintainer references under `docs/maintainers/`, without duplicating details across every document.
- Documentation is English except `README.zh-CN.md`; synchronize the root READMEs when shared content changes.

## Validation

- After behavioral changes or refactoring, run `pnpm type-check`, `pnpm test`, and `pnpm build`.
- Consult `docs/maintainers/architecture.md` and `CONTRIBUTING.md` for additional package, formatting, and lint checks relevant to the change.

## Release Publication

- Prepare the package.json version through a reviewed PR, merge after CI passes, sync main, then push its `v<version>` tag. Tag pushes trigger the Release workflow; do not publish locally or create tags from the npm publish script.
- Validate tag identity, main ancestry and exact package version. Run quality/package checks, pack once, publish that tarball through npm trusted publishing, and confirm its registry integrity before creating GitHub Release.
- Recovery uses the same tag: an existing npm version is reused only when its integrity matches the rebuilt tarball. Never overwrite npm versions, move release tags, or republish merely to repair GitHub Release creation.
- GitHub Release is the final step. Keep `npm-publish` environment approval and npm OIDC configuration; ensure environment tag deployment rules permit reviewed version tags. See `docs/maintainers/releasing.md`.
