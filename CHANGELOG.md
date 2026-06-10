# Changelog

## 0.1.0-alpha

Initial GitHub release candidate for DDW as a cache-first dynamic workflow
adapter project.

### Added

- Native DDW DeepSeek adapter (`cf-dw-agent`).
- ReasoniX harness adapter (`cf-dw-reasonix-agent`).
- Repomix stable prefix builder (`cf-dw-prefix`).
- Cache/token report CLI (`cf-dw-report`).
- Workflow dashboard generator (`cf-dw-dashboard`).
- Release audit gate (`cf-dw-release-audit`).
- Source release pack builder (`cf-dw-release-pack`).
- ODW configs for Native, ReasoniX, and mixed backend workflows.
- Five demo workflows under `examples/demos/`.
- Structured demo handoff format (`cf-dw.structured-handoff.v1`).
- README hero and architecture assets.
- Non-commercial source license.
- GitHub CI and tag source-archive workflow.
- Demo benchmark report with 5 workflows, 23 agents, 20 ReasoniX agents, and
  88.20% aggregate cache hit rate.

### Known Limitations

- Web/CDP demo is currently a CDP-ready protocol demo, not live browser execution.
- Cross-phase synthesis uses compact structured handoff; direct downstream
  consumption of `artifact-manifest.json` is planned next.
- Dashboard supports text artifact previews; image/screenshot thumbnails are
  planned next.
- ReasoniX uses a compact prefix for Windows argv safety; persistent/resumable
  session pooling is planned next.
