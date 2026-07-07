# Security Policy

## Supported Versions

Only the current version (`v1.0.0`) of MetLife Assist is supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please send an e-mail to the repository maintainer. All security vulnerabilities will be promptly addressed.

We take security seriously. Current protections include:

- Strict payload validation and HTML sanitization.
- HTTP Parameter Pollution (HPP) protection.
- Helmet security headers.
- Rate limiting via `express-rate-limit`.
- Generative AI prompt injection guardrails.
