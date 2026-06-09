# Changelog

## 0.1.0-alpha

Initial GitHub release candidate.

### Added

- Native C-FDW DeepSeek adapter (`cf-dw-agent`).
- ReasoniX harness adapter (`cf-dw-reasonix-agent`).
- Repomix stable prefix builder (`cf-dw-prefix`).
- Cache/token report CLI (`cf-dw-report`).
- Workflow dashboard generator (`cf-dw-dashboard`).
- ODW configs for Native, ReasoniX, and mixed backend workflows.
- Five demo workflows under `examples/demos/`.
- README hero and architecture assets.
- Non-commercial source license.
- Demo benchmark report with 5 workflows, 23 agents, and 89.22% aggregate cache hit rate.

### Known Limitations

- Web/CDP demo is currently a CDP-ready protocol demo, not live browser execution.
- Dashboard can filter by workflow tag but not yet by exact ODW run id.
- Dashboard does not yet render `artifact-manifest.json` as a full artifact panel.
- ReasoniX uses a compact prefix for Windows argv safety; ACP/stdin integration is planned.
