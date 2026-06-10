# Contributing

Thanks for improving DDW. This repository is currently developed as a
non-commercial source-available project.

## Local Setup

```bash
npm install
npm run build
npm run check
```

Create a local `.env` file for provider keys:

```text
DEEPSEEK_API_KEY=...
```

Never commit `.env`, run transcripts, or private artifacts.

## Development Rules

- Keep workflow prefixes stable when changing prompt templates.
- Prefer structured artifacts over large text blobs between phases.
- Read cache metrics from API usage or transcripts, not from agent self-report.
- Add focused demo or smoke coverage when changing adapters.
- Keep Native DDW and ReasoniX backends independently runnable.

## Release Checklist

Before publishing a release candidate:

1. `npm run check`
2. `npm run build`
3. Run the five demo workflows.
4. Generate a demo benchmark report.
5. Verify the README images load from `assets/`.
6. Confirm `.env`, `.cf-dw/`, `.odw/`, transcripts, and logs are ignored.
