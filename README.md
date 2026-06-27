# Anypost for Zapier

The official [Anypost](https://anypost.com) integration for [Zapier](https://zapier.com). Send transactional email and start Zaps from email events, connecting Anypost to the thousands of apps on Zapier without writing code.

Built on the Zapier Platform CLI. This README covers the integration's triggers, actions, and local development. For platform concepts and the full field-level API reference, see the [Anypost documentation](https://anypost.com/docs).

## Authentication

Connect an account with an Anypost API key (`ap_...`), created in the dashboard under Settings then API Keys. The key is validated against `GET /v1/whoami`, and every request carries it as `Authorization: Bearer ap_...`.

A `send_only` key is enough for the Send Email action. The New Email Event trigger needs a `full` key, because it creates and removes a webhook subscription on your behalf. See [API keys](https://anypost.com/docs/reference/api-keys) for the permission model.

## Triggers

### New Email Event

Starts a Zap when an email event occurs. Choose one event type per Zap:

`email.sent`, `email.delivered`, `email.delayed`, `email.bounced`, `email.complained`, `email.suppressed`, `email.unsubscribed`, `email.opened`, `email.clicked`.

Turning the Zap on creates an Anypost webhook scoped to that event; turning it off deletes it. Each delivery arrives as a signed batch and is fanned out into one Zap run per event, deduplicated on the event id. See [Webhooks](https://anypost.com/docs/reference/webhooks) for the event catalog and payload shape.

## Actions

### Send Email

Sends a transactional email through Anypost. Provide a `from` address on a verified domain and at least one recipient. Supply the body as HTML, Text, Markdown, or a Template. Recipients across To, Cc, and Bcc share one envelope and count against a combined limit of 50.

A Markdown Body is rendered to email-safe HTML and a plain-text alternative before sending, via the [`emailmd`](https://www.emailmd.dev) package. It cannot be combined with an HTML or Text Body. Rendering runs in the integration, which is why `emailmd` is a runtime dependency; the platform runs on Node 22, which it requires.

Variables is a key-value map substituted into `{{ markers }}` in the subject and body, including template content, rendered per recipient by Anypost. Markers pass through Markdown rendering untouched, so a Markdown Body can carry them too.

An optional Idempotency Key makes retries safe: a duplicate request within 24 hours returns the original result without sending again. See the [send reference](https://anypost.com/docs/reference/emails) for the complete field list.

## Development

```bash
npm install
npm run build      # compile src/ to dist/
npm test           # offline test suite
npm run validate   # zapier-platform schema and integration checks
```

To exercise the integration against the live API, set `API_KEY=ap_...` in a local `.env` and run `npx zapier-platform test`.

### Layout

```
src/
  index.ts                   Integration definition
  authentication.ts          API-key auth, /whoami test, error mapping
  markdown.ts                Lazy Markdown -> html/text rendering via emailmd
  creates/send-email.ts      Send Email action  -> POST /v1/email
  triggers/email-event.ts    New Email Event trigger -> /v1/webhooks
  triggers/template-list.ts  Hidden source for the Template dropdown -> /v1/templates
test/
  app.test.ts                Offline tests for every operation
```

## License

MIT
