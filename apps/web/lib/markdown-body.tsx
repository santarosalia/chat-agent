'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

function safeHref(href?: string): string | undefined {
  if (!href) {
    return undefined;
  }
  if (/^(https?:|mailto:|\/|#)/i.test(href)) {
    return href;
  }
  return undefined;
}

const markdownComponents: Components = {
  a({ href, children }) {
    const safe = safeHref(href);
    if (!safe) {
      return <span>{children}</span>;
    }
    return (
      <a href={safe} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
};

export function MarkdownBody({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
