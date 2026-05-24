# Commit message convention

batze uses [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
A consistent history is easy to scan and lets us automate changelogs and versioning
later.

## Format

```
<type>(<optional scope>): <description>

<optional body>

<optional footer(s)>
```

- Use the imperative mood in the description ("add", not "added" or "adds").
- Keep the description short and lower case, with no trailing period.
- Wrap the body at around 72 characters and explain what changed and why, not how.

## Types

| Type | Use for |
| --- | --- |
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting, with no change to code meaning |
| `refactor` | A code change that neither fixes a bug nor adds a feature |
| `perf` | A performance improvement |
| `test` | Adding or fixing tests |
| `build` | Build system or dependencies |
| `ci` | CI configuration |
| `chore` | Maintenance that does not touch app or test code |
| `revert` | Reverts a previous commit |

## Scopes

The scope is optional and names the area touched. Common batze scopes:

`expenses`, `income`, `customers`, `articles`, `invoices`, `categories`,
`dashboard`, `auth`, `settings`, `db`, `ui`, `docker`, `deps`.

## Breaking changes

Add a `!` after the type or scope, and describe the break in a `BREAKING CHANGE:`
footer.

```
feat(db)!: store amounts in Rappen

BREAKING CHANGE: amounts are now integers in Rappen, not decimals in CHF.
```

## Examples

```
feat(categories): add create, list, and delete
fix(invoices): correct 5-Rappen rounding on the MWST total
docs: add contributing guide and commit convention
build(deps): add better-sqlite3
chore(docker): remap Mailpit host ports to avoid a clash
```
