import fs from "node:fs/promises";
import path from "node:path";
import type { ReactNode } from "react";

function renderInlineMarkdown(line: string): ReactNode[] {
  return line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={`code-${index}`} className="rounded bg-black/10 px-1.5 py-0.5 text-[0.95em]">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`strong-${index}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return part;
  });
}

function renderMarkdown(markdown: string) {
  const lines = markdown.split("\n");
  const content: ReactNode[] = [];
  let key = 0;
  let listItems: ReactNode[] = [];
  let codeBlock: string[] = [];
  let inCode = false;

  const flushList = () => {
    if (listItems.length) {
      content.push(
        <ul key={`ul-${key++}`} className="list-disc pl-6 my-3 space-y-1">
          {listItems}
        </ul>,
      );
      listItems = [];
    }
  };

  const flushCode = () => {
    if (codeBlock.length) {
      content.push(
        <pre key={`pre-${key++}`} className="overflow-x-auto rounded-lg bg-black/80 text-white p-4 my-4 text-sm">
          <code>{codeBlock.join("\n")}</code>
        </pre>,
      );
      codeBlock = [];
    }
  };

  for (const line of lines) {
    const bulletMatch = line.match(/^\s*-\s+(.*)$/);

    if (line.startsWith("```")) {
      flushList();
      inCode = !inCode;
      if (!inCode) flushCode();
      continue;
    }

    if (inCode) {
      codeBlock.push(line);
      continue;
    }

    if (bulletMatch) {
      listItems.push(<li key={`li-${key++}`}>{renderInlineMarkdown(bulletMatch[1])}</li>);
      continue;
    }

    flushList();

    if (!line.trim()) {
      continue;
    }

    if (line.startsWith("### ")) {
      content.push(
        <h3 key={`h3-${key++}`} className="text-xl font-semibold mt-6 mb-2">
          {renderInlineMarkdown(line.slice(4))}
        </h3>,
      );
      continue;
    }

    if (line.startsWith("## ")) {
      content.push(
        <h2 key={`h2-${key++}`} className="text-2xl font-bold mt-8 mb-3">
          {renderInlineMarkdown(line.slice(3))}
        </h2>,
      );
      continue;
    }

    if (line.startsWith("# ")) {
      content.push(
        <h1 key={`h1-${key++}`} className="text-3xl font-extrabold mt-2 mb-4">
          {renderInlineMarkdown(line.slice(2))}
        </h1>,
      );
      continue;
    }

    if (line === "---") {
      content.push(<hr key={`hr-${key++}`} className="my-6 border-black/15" />);
      continue;
    }

    content.push(
      <p key={`p-${key++}`} className="my-2 leading-7">
        {renderInlineMarkdown(line)}
      </p>,
    );
  }

  flushList();
  flushCode();
  return content;
}

export default async function NotesPage() {
  const docsDir = path.join(process.cwd(), "docs");
  const notesPath = path.join(docsDir, "tts-nlp-batching.md");
  const markdown = await fs.readFile(notesPath, "utf8");

  return (
    <main className="mx-auto max-w-4xl p-8 sm:p-12">
      <article>{renderMarkdown(markdown)}</article>
    </main>
  );
}
