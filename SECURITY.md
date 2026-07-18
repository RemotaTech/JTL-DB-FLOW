# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, **do not open a public issue**. Instead, report it privately via GitHub's [Security Advisories](../../security/advisories/new) for this repo, or contact **Remota Tech** directly at [info@remotatech.com](mailto:info@remotatech.com).

Please include:
- A description of the vulnerability and its impact
- Steps to reproduce
- Any relevant logs or proof-of-concept code

You should receive a response within a few days. We'll work with you to understand and address the issue before any public disclosure.

## Scope notes

- MSSQL credentials are encrypted client-side (AES-256-GCM) and never sent to the Community Hub — see the [Security model](README.md#quick-start) in the README.
- The MSSQL bridge (`server.js`) is intended to run on `localhost`, on the same machine as the user's browser. Do not expose it to the public internet without adding your own auth layer.
