# Contributing to batze

batze is a single-user, self-hosted finance tool for a solo Swiss freelancer or
one-person company. Contributions that keep it lean, correct, and private are
welcome.

## Before you open a pull request

Please discuss your change first by opening an issue, or by commenting on an
existing one. Agreeing on the approach before code is written makes it far more
likely your work gets merged, and it saves everyone time.

Please do not submit low-effort or fully machine-generated pull requests. Using an
AI assistant is fine, but you are expected to understand the codebase and the change
you submit, to test it, and to write it thoughtfully. Pull requests that show no
understanding of the project are unlikely to be accepted.

## Ways to help

- Bugs, quality fixes, and issues labelled `good first issue`
- Swiss correctness: MWST, 5-Rappen rounding, cantonal holidays, and the QR-bill
- Translations (German, French, Italian, English)
- Performance, on the server and the frontend
- Documentation and developer experience

## Development setup

batze runs in Docker.

```bash
cp .env.example .env   # then edit the secrets
docker compose up
```

The app is served on http://localhost:3000 and Mailpit on http://localhost:8125.

## Commit messages

This project follows Conventional Commits. See
[docs/COMMIT_CONVENTION.md](docs/COMMIT_CONVENTION.md) for the format, the allowed
types, and examples.
