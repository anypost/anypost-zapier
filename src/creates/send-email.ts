import type { Create, ZObject, Bundle } from 'zapier-platform-core';
import { API_BASE } from '../authentication';
import { renderMarkdown } from '../markdown';

// Maps to POST /v1/email (EmailSendRequest). Single-envelope send: all
// recipients share one message. For many independent messages in one call,
// a separate "Send Batch" action would map to POST /v1/email/batch.
interface SendEmailInput {
  from: string;
  to: string[];
  subject?: string;
  html?: string;
  text?: string;
  markdown?: string;
  template_id?: string;
  variables?: Record<string, unknown>;
  reply_to?: string;
  cc?: string[];
  bcc?: string[];
  tags?: string[];
  topic?: string;
  campaign?: string;
  idempotency_key?: string;
}

const perform = async (z: ZObject, bundle: Bundle) => {
  const input = bundle.inputData as unknown as SendEmailInput;

  // Build the request body, omitting empty optionals so we don't send
  // empty arrays/strings the API would have to reject or ignore.
  const body: Record<string, unknown> = {
    from: input.from,
    to: input.to, // list field -> string[]
  };
  if (input.subject) body.subject = input.subject;

  // Content source. A Markdown Body is rendered locally to html + text; it is
  // mutually exclusive with HTML/Text Body (same rule as the Anypost SDK).
  // `{{ marker }}` placeholders pass through the renderer untouched and are
  // substituted server-side from `variables`.
  if (input.markdown) {
    if (input.html || input.text) {
      throw new z.errors.Error(
        'Provide either a Markdown Body or an HTML/Text Body, not both.',
        'InvalidInput',
        400,
      );
    }
    const rendered = await renderMarkdown(input.markdown);
    body.html = rendered.html;
    body.text = rendered.text;
  } else {
    if (input.html) body.html = input.html;
    if (input.text) body.text = input.text;
  }

  if (input.template_id) body.template_id = input.template_id;
  if (input.variables && Object.keys(input.variables).length) body.variables = input.variables;
  if (input.reply_to) body.reply_to = input.reply_to;
  if (input.cc?.length) body.cc = input.cc;
  if (input.bcc?.length) body.bcc = input.bcc;
  if (input.tags?.length) body.tags = input.tags;
  if (input.topic) body.topic = input.topic;
  if (input.campaign) body.campaign = input.campaign;

  const headers: Record<string, string> = {};
  // Optional client-supplied idempotency key to make Zap replays safe.
  if (input.idempotency_key) headers['Idempotency-Key'] = input.idempotency_key;

  const response = await z.request({
    method: 'POST',
    url: `${API_BASE}/email`,
    body,
    headers,
  });

  // 202 -> { id, created_at }
  return response.data;
};

export const sendEmail: Create = {
  key: 'send_email',
  noun: 'Email',
  display: {
    label: 'Send Email',
    description: 'Send a transactional email through Anypost.',
  },
  operation: {
    perform,
    inputFields: [
      {
        key: 'from',
        label: 'From',
        type: 'string',
        required: true,
        helpText:
          'Sender on a verified domain. Bare address (`you@example.com`) or ' +
          'name-addr form (`Acme <you@example.com>`).',
      },
      {
        key: 'to',
        label: 'To',
        type: 'string',
        list: true,
        required: true,
        helpText: 'One or more recipient addresses (max 50 across To/Cc/Bcc).',
      },
      { key: 'subject', label: 'Subject', type: 'string', required: false },
      {
        key: 'html',
        label: 'HTML Body',
        type: 'text',
        required: false,
        helpText: 'Provide at least one of HTML Body, Text Body, Markdown Body, or Template.',
      },
      { key: 'text', label: 'Text Body', type: 'text', required: false },
      {
        key: 'markdown',
        label: 'Markdown Body',
        type: 'text',
        required: false,
        helpText:
          'Write the body in Markdown; it is rendered to email-safe HTML and a ' +
          'plain-text alternative. Cannot be combined with HTML Body or Text Body.',
      },
      {
        key: 'template_id',
        label: 'Template',
        type: 'string',
        required: false,
        // Dynamic dropdown sourced from the hidden `template_list` trigger:
        // store the template `id`, show its `name`. Users can still type or
        // map a raw id.
        dynamic: 'template_list.id.name',
        helpText: 'A published template to render instead of an inline body.',
      },
      {
        key: 'variables',
        label: 'Variables',
        dict: true,
        required: false,
        helpText:
          'Key-value pairs substituted into `{{ markers }}` in the subject and ' +
          'body, including template content, rendered per recipient by Anypost.',
      },
      { key: 'reply_to', label: 'Reply-To', type: 'string', required: false },
      { key: 'cc', label: 'Cc', type: 'string', list: true, required: false },
      { key: 'bcc', label: 'Bcc', type: 'string', list: true, required: false },
      {
        key: 'tags',
        label: 'Tags',
        type: 'string',
        list: true,
        required: false,
        helpText: 'Correlation labels echoed onto every event for this message.',
      },
      { key: 'topic', label: 'Topic', type: 'string', required: false },
      { key: 'campaign', label: 'Campaign', type: 'string', required: false },
      {
        key: 'idempotency_key',
        label: 'Idempotency Key',
        type: 'string',
        required: false,
        helpText:
          'Optional. Reuse the same key to make retries safe. A duplicate ' +
          'request within 24h returns the original result without re-sending.',
      },
    ],
    sample: {
      id: 'email_018f4f3e-7b2c-7c80-8e21-1a3a4f5b6c7d',
      created_at: '2026-04-30T12:00:00.123000Z',
    },
    outputFields: [
      { key: 'id', label: 'Email ID' },
      { key: 'created_at', label: 'Created At' },
    ],
  },
};
