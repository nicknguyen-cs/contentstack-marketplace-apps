/**
 * Markdown — minimal, dependency-free renderer for the common subset of markdown
 * that the model emits in answers: headings, **bold**, *italic*, `code`, fenced
 * code blocks, bullet/numbered lists, and [links](url).
 *
 * Returns real React elements (no dangerouslySetInnerHTML), so untrusted model
 * output can't inject HTML. Anything it doesn't recognize falls through as text.
 */
import React from "react";

// bold (1,2) | code (3,4) | link (5,6,7) | italic (8,9)
const INLINE_RE = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(\*([^*\n]+)\*)/g;

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={key++}>{m[2]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(
        <code key={key++} className="md-code">
          {m[4]}
        </code>
      );
    } else if (m[6] !== undefined) {
      nodes.push(
        <a key={key++} href={m[7]} target="_blank" rel="noreferrer">
          {m[6]}
        </a>
      );
    } else if (m[9] !== undefined) {
      nodes.push(<em key={key++}>{m[9]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const BLOCK_START_RE = /^(#{1,6})\s|^\s*[-*]\s+|^\s*\d+\.\s+|^```/;

function parseBlocks(md: string): React.ReactNode[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line.trim())) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <pre key={key++} className="md-pre">
          {buf.join("\n")}
        </pre>
      );
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      blocks.push(
        <div key={key++} className={`md-h md-h${h[1].length}`}>
          {renderInline(h[2])}
        </div>
      );
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="md-ul">
          {items.map((it, n) => (
            <li key={n}>{renderInline(it)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="md-ol">
          {items.map((it, n) => (
            <li key={n}>{renderInline(it)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: gather until a blank line or the start of another block
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !BLOCK_START_RE.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="md-p">
        {renderInline(para.join(" "))}
      </p>
    );
  }

  return blocks;
}

const Markdown: React.FC<{ text: string }> = ({ text }) => <>{parseBlocks(text)}</>;

export default Markdown;
