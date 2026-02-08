# Contributing

Thanks for contributing to `ashfox`.

## Development Setup
```bash
npm install
npm run build
npm test
```

Recommended full check before opening a PR:
```bash
npm run quality
```

## Architecture and Code Style
- Keep pure logic in `src/domain/`.
- Keep host/IO integrations in adapters/transport layers.
- TypeScript strict mode is required; avoid `any`.
- Use 2-space indentation, single quotes, and semicolons.

## Pull Requests
- Keep PR scope focused and reviewable.
- Add or update tests for behavioral changes.
- Update docs when tool schemas or behavior change.
- Include test/quality results in the PR description.

## Commit Messages
Use short imperative subjects, optionally with prefixes:
- `fix: ...`
- `refactor: ...`
- `docs: ...`
- `test: ...`

## Reporting Bugs
Open an issue with:
- expected behavior
- actual behavior
- reproduction steps
- environment details (Blockbench version, ashfox version, format)

For security issues, use `SECURITY.md`.

