import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils.ts";

function isSafeHref(href: string | undefined): boolean {
  if (!href) return false;
  return /^(https?:|mailto:)/i.test(href);
}

const components: Components = {
  a({ href, children }) {
    if (!isSafeHref(href)) {
      return <span>{children}</span>;
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-inherit underline decoration-current/40 underline-offset-2 hover:decoration-current"
      >
        {children}
      </a>
    );
  },
  p({ children }) {
    return <p className="mb-2 last:mb-0">{children}</p>;
  },
  ul({ children }) {
    return <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>;
  },
  li({ children }) {
    return <li className="leading-snug">{children}</li>;
  },
  strong({ children }) {
    return <strong className="font-semibold">{children}</strong>;
  },
  em({ children }) {
    return <em>{children}</em>;
  },
  code({ children }) {
    return (
      <code className="rounded bg-black/5 px-1 py-0.5 text-[0.9em]">{children}</code>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="mb-2 border-l-2 border-current/20 pl-3 italic last:mb-0">
        {children}
      </blockquote>
    );
  },
  img() {
    return null;
  },
  h1({ children }) {
    return <p className="mb-2 font-semibold last:mb-0">{children}</p>;
  },
  h2({ children }) {
    return <p className="mb-2 font-semibold last:mb-0">{children}</p>;
  },
  h3({ children }) {
    return <p className="mb-2 font-semibold last:mb-0">{children}</p>;
  },
};

/** Renders quest copy with Markdown (links, lists, bold/italic). HTML is not executed. */
export function QuestMarkdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const text = children.trim();
  if (!text) return null;

  return (
    <div className={cn("text-sm leading-relaxed [&_a]:break-all", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
