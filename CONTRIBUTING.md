# Contributing

Thanks for your interest in improving JTL Workflow Creator.

## License note

This repo is source-available under the [Sustainable Use License](LICENSE.md), not a permissive open-source license. By submitting a contribution, you agree it may be distributed under the same license, and that you will not use your own contribution to build a competing hosted product or service.

## Getting started

```bash
npm install
cp .env.example .env
npm run dev:all
```

See [README.md](README.md) for full setup, architecture, and testing docs.

## Making a change

1. Fork the repo and create a branch off `main`.
2. Keep changes focused — one logical change per PR.
3. Run tests before opening a PR:
   ```bash
   npm run test:run
   ```
4. Match existing code style (no linter config yet — follow the surrounding file's conventions).
5. Open a PR with a clear description of what changed and why.

## Reporting bugs

Open an issue with:
- Steps to reproduce
- Expected vs. actual behavior
- JTL-WAWI schema version if relevant

## Security issues

Do not open a public issue for security vulnerabilities — see [SECURITY.md](SECURITY.md).
