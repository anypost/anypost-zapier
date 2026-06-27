import type { Trigger, ZObject, Bundle } from 'zapier-platform-core';
import { API_BASE } from '../authentication';

// The nine customer-facing event types Anypost emits, identical across the
// webhook and /events surfaces.
const EVENT_TYPES = [
  'email.sent',
  'email.delivered',
  'email.delayed',
  'email.bounced',
  'email.complained',
  'email.suppressed',
  'email.unsubscribed',
  'email.opened',
  'email.clicked',
] as const;

// Canonical shape a Zap step receives, matching the outbound webhook event:
//   { id, type, occurred_at, data: { email_id, recipient, ... } }
// Both code paths below emit this shape so the fields a user maps during
// setup (performList / sample) match what arrives live (perform).
interface NormalizedEvent {
  id: string;
  type: string;
  occurred_at: string;
  data: Record<string, unknown>;
}

// REST Hook subscribe: register this Zap's target URL as an Anypost webhook
// scoped to the single chosen event type. The returned webhook (incl. its
// id) is persisted by Zapier as `bundle.subscribeData`.
const subscribeHook = async (z: ZObject, bundle: Bundle) => {
  const eventType = bundle.inputData.event_type;
  const response = await z.request({
    method: 'POST',
    url: `${API_BASE}/webhooks`,
    body: {
      name: `Zapier: ${eventType}`,
      url: bundle.targetUrl,
      events: [eventType],
    },
  });
  return response.data; // Webhook { id, ... }
};

// REST Hook unsubscribe: delete the webhook created at subscribe time.
const unsubscribeHook = async (z: ZObject, bundle: Bundle) => {
  const webhookId = bundle.subscribeData?.id;
  if (!webhookId) return {};
  await z.request({
    method: 'DELETE',
    url: `${API_BASE}/webhooks/${webhookId}`,
  });
  return {};
};

// Live path: Anypost POSTs a signed batch envelope
//   { batch_id, timestamp, events: [ { id, type, occurred_at, data } ] }
// Zapier dedups on each event's `id`, so we return the events array as-is.
const perform = (_z: ZObject, bundle: Bundle): NormalizedEvent[] => {
  const events = (bundle.cleanedRequest?.events ?? []) as NormalizedEvent[];
  return events;
};

// Setup/sample path: pull recent events from GET /v1/events (flat shape) and
// reshape each into the webhook envelope shape so it matches `perform`.
const performList = async (z: ZObject, bundle: Bundle): Promise<NormalizedEvent[]> => {
  const response = await z.request({
    url: `${API_BASE}/events`,
    params: { type: bundle.inputData.event_type, limit: 25 },
  });
  const rows = (response.data?.data ?? []) as Record<string, unknown>[];
  return rows.map((e) => ({
    id: e.id as string,
    type: e.type as string,
    occurred_at: e.occurred_at as string,
    // Flat /events row -> nested `data` block (omitting the routing keys
    // that live at the envelope top level).
    data: Object.fromEntries(
      Object.entries(e).filter(([k]) => !['id', 'type', 'occurred_at'].includes(k)),
    ),
  }));
};

export const emailEvent: Trigger = {
  key: 'email_event',
  noun: 'Email Event',
  display: {
    label: 'New Email Event',
    description:
      'Triggers when an email event (delivered, bounced, opened, clicked, …) ' +
      'occurs. Backed by an Anypost webhook subscription.',
  },
  operation: {
    type: 'hook',
    performSubscribe: subscribeHook,
    performUnsubscribe: unsubscribeHook,
    perform,
    performList,
    inputFields: [
      {
        key: 'event_type',
        label: 'Event Type',
        type: 'string',
        required: true,
        default: 'email.delivered',
        choices: EVENT_TYPES.reduce<Record<string, string>>((acc, t) => {
          acc[t] = t;
          return acc;
        }, {}),
        helpText: 'Which email event should start this Zap.',
      },
    ],
    sample: {
      id: 'evt_8f2c1b3e6a5d4f7c9a3e1d2b4c5e6f7a',
      type: 'email.delivered',
      occurred_at: '2026-04-30T12:00:05.000Z',
      data: {
        email_id: 'email_018f4f3e-7b2c-7c80-8e21-1a3a4f5b6c7d',
        recipient: 'recipient@example.com',
        from: 'Acme Support <sender@example.com>',
        subject: 'Welcome to Acme',
        tags: ['welcome'],
        topic: 'onboarding',
        campaign: 'launch',
      },
    },
    outputFields: [
      { key: 'id', label: 'Event ID' },
      { key: 'type', label: 'Event Type' },
      { key: 'occurred_at', label: 'Occurred At' },
      { key: 'data__email_id', label: 'Email ID' },
      { key: 'data__recipient', label: 'Recipient' },
      { key: 'data__subject', label: 'Subject' },
    ],
  },
};
