// Stub the markdown renderer so the suite never loads emailmd/MJML: we assert
// that perform calls it and wires its result into the body, not that emailmd
// itself renders (covered by an end-to-end smoke run outside jest).
jest.mock('../src/markdown', () => ({
  renderMarkdown: jest.fn(async () => ({ html: '<h1>Hi</h1>', text: 'Hi' })),
}));

import App from '../src/index';
import { includeBearerToken, handleApiError } from '../src/authentication';
import { renderMarkdown } from '../src/markdown';

const mockedRender = renderMarkdown as jest.MockedFunction<typeof renderMarkdown>;

// A fake `z` that records every z.request call and returns canned responses
// in order (repeating the last one). Keeps the suite offline and
// deterministic: we assert on what each operation *sends* and *returns*
// without any real HTTP.
function makeZ(responses: Array<{ data?: unknown; status?: number; content?: string }> = [{ data: {}, status: 200 }]) {
  const calls: any[] = [];
  let i = 0;
  const z: any = {
    request: jest.fn(async (opts: any) => {
      calls.push(opts);
      const r = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return r;
    }),
    errors: {
      Error: class extends Error {
        constructor(message: string, public type?: string, public status?: number) {
          super(message);
        }
      },
      RefreshAuthError: class extends Error {},
    },
  };
  return { z, calls };
}

// Operation handles, cast past the operation-type union.
const sendEmail = (App.creates!.send_email.operation as any).perform;
const subscribe = (App.triggers!.email_event.operation as any).performSubscribe;
const unsubscribe = (App.triggers!.email_event.operation as any).performUnsubscribe;
const eventPerform = (App.triggers!.email_event.operation as any).perform;
const eventPerformList = (App.triggers!.email_event.operation as any).performList;
const templates = (App.triggers!.template_list.operation as any).perform;

describe('app definition', () => {
  it('declares custom auth, the hook trigger, and the create', () => {
    expect(App.authentication?.type).toBe('custom');
    expect(App.triggers?.email_event.operation.type).toBe('hook');
    expect(App.creates?.send_email).toBeDefined();
  });

  it('opts out of automatic input cleaning for predictable bodies', () => {
    expect(App.flags?.cleanInputData).toBe(false);
  });

  it('exposes all nine event types on the trigger', () => {
    const field = App.triggers?.email_event.operation.inputFields?.find(
      (f: any) => f.key === 'event_type',
    ) as any;
    expect(Object.keys(field.choices)).toHaveLength(9);
  });

  it('hides the template_list dropdown source and wires it to template_id', () => {
    expect(App.triggers?.template_list.display.hidden).toBe(true);
    const field = App.creates?.send_email.operation.inputFields?.find(
      (f: any) => f.key === 'template_id',
    ) as any;
    expect(field.dynamic).toBe('template_list.id.name');
  });

  it('offers Markdown Body and a Variables dict on Send Email', () => {
    const fields = App.creates?.send_email.operation.inputFields ?? [];
    expect(fields.find((f: any) => f.key === 'markdown')).toBeDefined();
    const variables = fields.find((f: any) => f.key === 'variables') as any;
    expect(variables?.dict).toBe(true);
  });
});

describe('Send Email', () => {
  const base = {
    inputData: { from: 'a@example.com', to: ['b@example.com'], subject: 'Hi', text: 'yo' },
    authData: { api_key: 'ap_test' },
  };

  it('POSTs to /email and returns the response body', async () => {
    const { z, calls } = makeZ([{ data: { id: 'email_1', created_at: '2026-01-01T00:00:00Z' } }]);
    const result = await sendEmail(z, base);

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toMatch(/\/v1\/email$/);
    expect(calls[0].body).toMatchObject({ from: 'a@example.com', to: ['b@example.com'], subject: 'Hi', text: 'yo' });
    expect(result).toEqual({ id: 'email_1', created_at: '2026-01-01T00:00:00Z' });
  });

  it('omits empty optional fields from the body', async () => {
    const { z, calls } = makeZ();
    await sendEmail(z, base);
    const body = calls[0].body;
    expect(body).not.toHaveProperty('cc');
    expect(body).not.toHaveProperty('bcc');
    expect(body).not.toHaveProperty('tags');
    expect(body).not.toHaveProperty('campaign');
    expect(body).not.toHaveProperty('template_id');
  });

  it('includes optional fields when provided', async () => {
    const { z, calls } = makeZ();
    await sendEmail(z, {
      inputData: { ...base.inputData, cc: ['c@example.com'], tags: ['welcome'], campaign: 'launch' },
      authData: base.authData,
    });
    expect(calls[0].body).toMatchObject({ cc: ['c@example.com'], tags: ['welcome'], campaign: 'launch' });
  });

  it('sends an Idempotency-Key header only when supplied', async () => {
    const without = makeZ();
    await sendEmail(without.z, base);
    expect(without.calls[0].headers['Idempotency-Key']).toBeUndefined();

    const withKey = makeZ();
    await sendEmail(withKey.z, {
      inputData: { ...base.inputData, idempotency_key: 'order-42' },
      authData: base.authData,
    });
    expect(withKey.calls[0].headers['Idempotency-Key']).toBe('order-42');
  });

  it('passes variables through when provided and omits them when empty', async () => {
    const withVars = makeZ();
    await sendEmail(withVars.z, {
      inputData: { ...base.inputData, variables: { name: 'Ada', plan: 'pro' } },
      authData: base.authData,
    });
    expect(withVars.calls[0].body.variables).toEqual({ name: 'Ada', plan: 'pro' });

    const emptyVars = makeZ();
    await sendEmail(emptyVars.z, {
      inputData: { ...base.inputData, variables: {} },
      authData: base.authData,
    });
    expect(emptyVars.calls[0].body).not.toHaveProperty('variables');
  });
});

describe('Send Email — Markdown Body', () => {
  beforeEach(() => mockedRender.mockClear());

  it('renders markdown to html/text and does not send the raw markdown', async () => {
    const { z, calls } = makeZ();
    await sendEmail(z, {
      inputData: { from: 'a@example.com', to: ['b@example.com'], subject: 'Hi', markdown: '# Hi {{ name }}' },
      authData: { api_key: 'ap_test' },
    });

    expect(mockedRender).toHaveBeenCalledWith('# Hi {{ name }}');
    expect(calls[0].body).toMatchObject({ html: '<h1>Hi</h1>', text: 'Hi' });
    expect(calls[0].body).not.toHaveProperty('markdown');
  });

  it('rejects a send that sets both markdown and html/text without calling the API', async () => {
    const { z, calls } = makeZ();
    await expect(
      sendEmail(z, {
        inputData: { from: 'a@example.com', to: ['b@example.com'], markdown: '# Hi', html: '<p>Hi</p>' },
        authData: { api_key: 'ap_test' },
      }),
    ).rejects.toThrow(/not both/);

    expect(mockedRender).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});

describe('New Email Event trigger', () => {
  it('subscribes by creating a webhook scoped to the chosen event', async () => {
    const { z, calls } = makeZ([{ data: { id: 'wh_1' } }]);
    const result = await subscribe(z, {
      inputData: { event_type: 'email.delivered' },
      targetUrl: 'https://hooks.zapier.com/abc',
    });

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toMatch(/\/v1\/webhooks$/);
    expect(calls[0].body.url).toBe('https://hooks.zapier.com/abc');
    expect(calls[0].body.events).toEqual(['email.delivered']);
    expect(result).toEqual({ id: 'wh_1' });
  });

  it('unsubscribes by deleting the stored webhook', async () => {
    const { z, calls } = makeZ();
    await unsubscribe(z, { subscribeData: { id: 'wh_1' } });
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toMatch(/\/v1\/webhooks\/wh_1$/);
  });

  it('does not call the API when there is no webhook to unsubscribe', async () => {
    const { z, calls } = makeZ();
    await unsubscribe(z, { subscribeData: undefined });
    expect(calls).toHaveLength(0);
  });

  it('returns the events array from a live batch delivery', async () => {
    const { z } = makeZ();
    const result = await eventPerform(z, {
      cleanedRequest: {
        events: [
          { id: 'evt_a', type: 'email.delivered', occurred_at: 't', data: {} },
          { id: 'evt_b', type: 'email.delivered', occurred_at: 't', data: {} },
        ],
      },
    });
    expect(result.map((r: any) => r.id)).toEqual(['evt_a', 'evt_b']);
  });

  it('returns an empty array for a malformed delivery body', async () => {
    const { z } = makeZ();
    expect(await eventPerform(z, { cleanedRequest: {} })).toEqual([]);
  });

  it('reshapes flat /events rows into the nested webhook shape for the sample', async () => {
    const { z, calls } = makeZ([
      {
        data: {
          data: [
            {
              id: 'evt_1',
              type: 'email.bounced',
              occurred_at: '2026-01-01T00:00:00Z',
              email_id: 'email_9',
              recipient: 'x@example.com',
              bounce_type: 'hard',
            },
          ],
        },
      },
    ]);

    const result = await eventPerformList(z, { inputData: { event_type: 'email.bounced' } });

    expect(calls[0].params).toMatchObject({ type: 'email.bounced' });
    expect(result[0]).toEqual({
      id: 'evt_1',
      type: 'email.bounced',
      occurred_at: '2026-01-01T00:00:00Z',
      data: { email_id: 'email_9', recipient: 'x@example.com', bounce_type: 'hard' },
    });
  });
});

describe('template_list dropdown source', () => {
  it('returns only published templates, mapped to id/name, across pages', async () => {
    const { z, calls } = makeZ([
      {
        data: {
          data: [
            { id: 'template_1', name: 'Welcome', published_at: '2026-01-01T00:00:00Z' },
            { id: 'template_2', name: 'Draft only', published_at: null },
          ],
          has_more: true,
          next_cursor: 'cursor_1',
        },
      },
      {
        data: {
          data: [{ id: 'template_3', name: 'Receipt', published_at: '2026-01-02T00:00:00Z' }],
          has_more: false,
          next_cursor: null,
        },
      },
    ]);

    const result = await templates(z, {});

    expect(calls).toHaveLength(2);
    expect(calls[1].params.after).toBe('cursor_1');
    expect(result.map((t: any) => t.id)).toEqual(['template_1', 'template_3']);
    expect(result.every((t: any) => t.name)).toBe(true);
  });
});

describe('authentication middleware', () => {
  it('adds the bearer token from authData', () => {
    const req: any = includeBearerToken({ headers: {} } as any, {} as any, { authData: { api_key: 'ap_xyz' } } as any);
    expect(req.headers.Authorization).toBe('Bearer ap_xyz');
  });

  it('leaves the request untouched when there is no key', () => {
    const req: any = includeBearerToken({ headers: {} } as any, {} as any, { authData: {} } as any);
    expect(req.headers.Authorization).toBeUndefined();
  });
});

describe('error mapping', () => {
  const { z } = makeZ();

  const bundle = {} as any;

  it('turns a 401 into a refresh-auth error', () => {
    expect(() => handleApiError({ status: 401, data: {} } as any, z, bundle)).toThrow(z.errors.RefreshAuthError);
  });

  it('surfaces the API error message on other 4xx responses', () => {
    expect(() =>
      handleApiError({ status: 422, data: { error: { message: 'bad subject' } } } as any, z, bundle),
    ).toThrow(/bad subject/);
  });

  it('passes successful responses through unchanged', () => {
    const ok = { status: 200, data: { ok: true } } as any;
    expect(handleApiError(ok, z, bundle)).toBe(ok);
  });
});
