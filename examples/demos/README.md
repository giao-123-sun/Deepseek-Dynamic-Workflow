# DDW Demo Workflows

These demos are plain ODW workflow scripts. They use stable `C_FDW_*` metadata so
DDW can aggregate phases, agents, cache metrics, and artifacts into the
dashboard.

Each demo keeps a local `structuredHandoff()` helper inside the workflow body.
ODW injects primitives into workflow scripts and does not support arbitrary
top-level imports, so the helper is duplicated intentionally. The handoff format
is `cf-dw.structured-handoff.v1`.

Run one demo:

```bash
npm run setup:odw

node ./.cf-dw/vendor/open-dynamic-workflows/dist/cli.js run ./examples/demos/cache-roi-benchmark.js \
  --config ./odw.mixed.config.json \
  --runs-root ./.odw/runs \
  --wait \
  --timeout 1200
```

Generate a dashboard after a run:

```bash
node dist/dashboard.js \
  --runs-root ./.cf-dw/runs \
  --workflow-tag demo-cache-roi-benchmark \
  --output ./.cf-dw/reports/demo-cache-roi-benchmark.html
```

## Demo List

1. `cache-roi-benchmark.js`
2. `codebase-architecture-audit.js`
3. `policy-conflict-mining.js`
4. `multi-city-deep-research.js`
5. `web-cdp-evidence-extraction.js`
