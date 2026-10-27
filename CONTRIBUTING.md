# Contributing

Use Node.js 22.18+ and npm. Keep the tool read-only, local-first and small.

```sh
npm install
npm run check
npm run package:check
npx playwright install chromium
npm run test:e2e
```

`npm run package:check` installs the built tarball into a clean temporary consumer and tests its actual executable, assets and dependency audit. It needs registry access but never publishes.

`npm run format` formats source and docs. `npm run dev` rebuilds browser assets once and watches the server; rerun `npm run build` after browser or documentation edits.

Keep domain logic separate from RPC and HTTP. Test new error mappings against a documented program/runtime definition; never infer a custom error's meaning from its number or a log substring. Missing data must not become success or zero.

Add regression tests for bug fixes. Use synthetic fixtures with an explicit label; never add private keys, `.env`, node_modules, build output, local ledgers or video production tools. Keep commits focused and use Conventional Commits.

A useful bug report includes Node version, selected network, expected and observed behavior, and a minimal public transaction signature if sharing it is appropriate. Never include wallet keys or access tokens.
