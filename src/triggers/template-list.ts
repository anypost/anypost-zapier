import type { Trigger, ZObject, Bundle } from 'zapier-platform-core';
import { API_BASE } from '../authentication';

interface Template {
  id: string;
  name: string;
  published_at: string | null;
}

// Powers the Template dropdown on Send Email. Hidden from the user's trigger
// list: it exists only as a dynamic-dropdown source, not as a Zap trigger.
//
// Sends always use a template's published content, and a never-published
// template can't be sent, so only published templates are offered. The list
// endpoint has no status filter, so we page through it and filter client-side.
const perform = async (z: ZObject, _bundle: Bundle): Promise<Template[]> => {
  const templates: Template[] = [];
  let after: string | undefined;

  // Bounded cursor walk. A dropdown loads once, so pull every page up to a
  // safety cap (20 x 100 = 2,000 templates) rather than relying on the user
  // to scroll.
  for (let i = 0; i < 20; i += 1) {
    const response = await z.request({
      url: `${API_BASE}/templates`,
      params: { limit: 100, ...(after ? { after } : {}) },
    });
    const page = response.data as {
      data?: Template[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    templates.push(...(page.data ?? []));
    if (!page.has_more || !page.next_cursor) break;
    after = page.next_cursor;
  }

  return templates
    .filter((t) => t.published_at)
    .map((t) => ({ id: t.id, name: t.name, published_at: t.published_at }));
};

export const templateList: Trigger = {
  key: 'template_list',
  noun: 'Template',
  display: {
    label: 'List Templates',
    description: 'Internal trigger that lists published templates for dropdowns.',
    hidden: true,
  },
  operation: {
    perform,
    canPaginate: false,
    sample: {
      id: 'template_550e8400-e29b-41d4-a716-446655440000',
      name: 'Welcome email',
      published_at: '2026-04-30T12:00:00Z',
    },
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
    ],
  },
};
