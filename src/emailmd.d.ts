// Minimal ambient declaration for the one emailmd export we use. Declared
// locally because the project compiles with classic `node` module resolution,
// which does not read emailmd's conditional `exports` type entries. Keeping it
// here also means emailmd's full type surface is never a build dependency.
declare module 'emailmd' {
  export interface RenderResult {
    /** Complete, email-safe HTML document. */
    html: string;
    /** Plain-text alternative for the text/plain part. */
    text: string;
    /** Extracted frontmatter (preheader and any custom keys). */
    meta: { preheader?: string; [key: string]: unknown };
    /** Non-fatal issues raised while rendering, if any. */
    warnings?: unknown[];
  }

  export function render(
    markdown: string,
    options?: Record<string, unknown>,
  ): Promise<RenderResult>;
}
