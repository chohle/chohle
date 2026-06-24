# Email Signatures

Reusable sign-off blocks made of rich HTML (and optional embedded
images) that get rendered into the branded email's signature slot. You
manage a small library of named signatures and pick one each time you
send an outbound email; one is marked the default and pre-selected.

## Where to find it

User avatar menu -> **Settings** (route `/settings`), the
**Signatures** tab. The tab shows your saved signatures (default first),
a **New** button, an editor pane on the left and a live preview iframe on
the right.

## What a signature holds

A row in the `signatures` table is just three things plus bookkeeping:

| Column         | Meaning                                                   |
| -------------- | --------------------------------------------------------- |
| `name`         | Label shown in the picker (required, trimmed).            |
| `content_html` | The rich HTML body of the sign-off.                       |
| `is_default`   | `1` for the one preselected when composing (at most one). |
| `created_at`   | Set on insert.                                            |

There is no per-user scoping in the schema: the table is app-wide. The
"at most one default" rule is enforced in the API, not the schema:
creating or updating a signature with `is_default` clears the flag on all
others in the same transaction (`index.post.ts`, `[id].put.ts`). The
first signature you create becomes the default automatically. Deleting
the default promotes the most recently created remaining signature so a
default always exists for compose surfaces (`[id].delete.ts`).

## Editing and embedded images

`content_html` is edited with the same `UEditor` (Tiptap) instance used
for email bodies, wired with `emailEditorExtensions` /
`emailEditorHandlers` from `app/utils/emailEditor.ts`. Images aren't
inlined as base64 data URIs (Gmail and others strip those). Instead the
image-upload node (`EditorImageUploadNode.vue`) POSTs the file to
`/api/uploads/email-image`, which:

1. validates type and size (`saveEmailImage` in `server/utils/uploads.ts`
   (allowed image types only, max 5 MB, PNG magic-byte check),
2. writes it under the public **email-asset** store with a `uuid.ext`
   name, and
3. returns an absolute URL (`siteUrl` + `/api/email-asset/<name>`).

That URL is stored verbatim in `content_html` as an `<img src="https://…">`,
so the recipient's mail client fetches it over HTTP. The asset route
`server/api/email-asset/[name].get.ts` serves these images publicly (the
recipient has no session); `basename()` confines the lookup to the
email-asset subdirectory, and responses are sent with
`X-Content-Type-Options: nosniff` and a one-year immutable cache header.

## Picking a signature when sending

Compose surfaces share `useSignatures()`
(`app/composables/useSignatures.ts`), which exposes the rows,
`defaultSignatureId` (to preselect), and `signatureItems` for a
`USelect`, including a "None" option (`value: null`). The invoice send
panel (`app/pages/invoices/[id]/index.vue`), the quote editor
(`app/pages/quotes/[id].vue`) and the project composer
(`ProjectDetailView.vue`) all render this dropdown and seed it with the
default.

On send, the client passes `signature_id`. The server resolves it to
HTML at send time (it does **not** store a copy on the message) by
looking up `content_html` for that id and handing it to
`buildBrandedEmail(..., { signatureHtml })`. See
`server/api/invoices/[id]/send.post.ts` and
`server/api/quotes/[id]/send.post.ts`. The signature lands in a dedicated
table cell after the body in `renderEmail` (`server/utils/emailTemplate.ts`,
the `signatureHtml` slot). Because it's resolved fresh, editing a
signature changes future sends without touching past messages.

Previews go through `POST /api/email/preview` (returned as HTML for an
`<iframe srcdoc>`). It accepts either `signature_html` (the unsaved
content while you edit in Settings) or `signature_id` (the chosen
signature in a send flow), with live HTML winning when both are present.

## Backed by

- Migration `0037_signatures` creates the `signatures` table.
- Endpoints: `server/api/signatures/index.get.ts`, `index.post.ts`,
  `[id].put.ts`, `[id].delete.ts`; image upload
  `server/api/uploads/email-image.post.ts`; public asset
  `server/api/email-asset/[name].get.ts`; preview
  `server/api/email/preview.post.ts`.
- Image storage helpers live in `server/utils/uploads.ts`
  (`saveEmailImage`, `serveEmailAsset`); rendering in
  `server/utils/emailTemplate.ts`.
- No dedicated automated test suite for signatures at the time of
  writing.

## See also

- [Email](email.md)
- [Sending email](../SENDING_EMAIL.md) for SMTP setup.
