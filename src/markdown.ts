// Lazily render a Markdown Body to email-safe HTML and a plain-text
// alternative via the `emailmd` package. emailmd pulls in MJML, so the import
// is deferred: the html/text/template sending paths never load it, and only a
// send that actually supplies markdown pays the cost.

let cached: Promise<typeof import('emailmd')> | undefined;

function load(): Promise<typeof import('emailmd')> {
  if (!cached) {
    cached = import('emailmd').catch((cause) => {
      cached = undefined; // allow a later call to retry
      throw new Error(
        'Markdown rendering requires the "emailmd" package (Node 20+).',
        { cause },
      );
    });
  }
  return cached;
}

export async function renderMarkdown(
  markdown: string,
): Promise<{ html: string; text: string }> {
  const { render } = await load();
  const { html, text } = await render(markdown);
  return { html, text };
}
