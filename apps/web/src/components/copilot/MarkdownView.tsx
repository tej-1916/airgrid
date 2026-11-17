import React, { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';

interface MarkdownViewProps {
  content: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!content) return null;

  // Split into code blocks vs regular markdown
  const parts: { type: 'code' | 'text'; code?: string; lang?: string; text?: string }[] = [];
  const codeBlockRegex = /```([a-zA-Z0-9_\-\.]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', lang: match[1] || 'text', code: match[2].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.slice(lastIndex) });
  }

  const renderInlineFormatted = (rawText: string) => {
    // Replace Provenance tags with styled badges
    const tokens = rawText.split(
      /(\[MEASURED\]|\[INTERPOLATED_ESTIMATE\]|\[SYNTHETIC_DEMO\]|\[AI_RECOMMENDATION\]|\*\*.*?\*\*|\*.*?\*|`.*?`)/g
    );

    return tokens.map((token, i) => {
      if (token === '[MEASURED]') {
        return (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-0.5 mx-1 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
          >
            MEASURED
          </span>
        );
      }
      if (token === '[INTERPOLATED_ESTIMATE]') {
        return (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-0.5 mx-1 rounded text-[10px] font-mono font-semibold bg-blue-50 text-blue-800 border border-blue-200"
          >
            INTERPOLATED
          </span>
        );
      }
      if (token === '[SYNTHETIC_DEMO]') {
        return (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-0.5 mx-1 rounded text-[10px] font-mono font-semibold bg-purple-50 text-purple-800 border border-purple-200"
          >
            DEMO
          </span>
        );
      }
      if (token === '[AI_RECOMMENDATION]') {
        return (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-0.5 mx-1 rounded text-[10px] font-mono font-semibold bg-[#BE6B37]/15 text-[#BE6B37] border border-[#BE6B37]/30"
          >
            AI ADVISORY
          </span>
        );
      }
      if (token.startsWith('**') && token.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-[#0B0B0D]">
            {token.slice(2, -2)}
          </strong>
        );
      }
      if (token.startsWith('*') && token.endsWith('*')) {
        return (
          <em key={i} className="italic text-neutral-800">
            {token.slice(1, -1)}
          </em>
        );
      }
      if (token.startsWith('`') && token.endsWith('`')) {
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 rounded bg-[#ECECE8] text-[#BE6B37] font-mono text-xs font-medium border border-[#D9DBDE]"
          >
            {token.slice(1, -1)}
          </code>
        );
      }
      return token;
    });
  };

  const renderTextParagraphs = (blockText: string) => {
    const lines = blockText.split('\n');
    const elements: React.ReactNode[] = [];
    let inTable = false;
    let tableRows: string[][] = [];

    const flushTable = (keyPrefix: number) => {
      if (tableRows.length > 0) {
        const [headers, ...rows] = tableRows;
        elements.push(
          <div key={`table-${keyPrefix}`} className="my-3 overflow-x-auto rounded-xl border border-[#D9DBDE] bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F5F3] border-b border-[#D9DBDE] text-[#0B0B0D] font-semibold">
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi} className="px-3 py-2">
                      {renderInlineFormatted(h.trim())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9DBDE]/60">
                {rows
                  .filter((r) => !r.every((c) => c.trim().match(/^:?-+:?$/)))
                  .map((row, ri) => (
                    <tr key={ri} className="hover:bg-[#F5F5F3]/50">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 text-neutral-800">
                          {renderInlineFormatted(cell.trim())}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
        inTable = false;
      }
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Check table row
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        inTable = true;
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        tableRows.push(cells);
        return;
      } else if (inTable) {
        flushTable(index);
      }

      // Headers
      if (trimmed.startsWith('#### ')) {
        elements.push(
          <h5 key={index} className="text-xs font-bold text-[#0B0B0D] uppercase tracking-wider mt-3 mb-1">
            {renderInlineFormatted(trimmed.slice(5))}
          </h5>
        );
      } else if (trimmed.startsWith('### ')) {
        elements.push(
          <h4 key={index} className="text-sm font-bold text-[#0B0B0D] mt-3 mb-1">
            {renderInlineFormatted(trimmed.slice(4))}
          </h4>
        );
      } else if (trimmed.startsWith('## ')) {
        elements.push(
          <h3 key={index} className="text-base font-bold text-[#0B0B0D] mt-4 mb-2 pb-1 border-b border-[#D9DBDE]">
            {renderInlineFormatted(trimmed.slice(3))}
          </h3>
        );
      } else if (trimmed.startsWith('# ')) {
        elements.push(
          <h2 key={index} className="text-lg font-bold text-[#0B0B0D] mt-4 mb-2">
            {renderInlineFormatted(trimmed.slice(2))}
          </h2>
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        // Bullet list
        elements.push(
          <li key={index} className="ml-4 list-disc text-xs text-neutral-700 leading-relaxed my-0.5">
            {renderInlineFormatted(trimmed.slice(2))}
          </li>
        );
      } else if (trimmed.match(/^\d+\.\s/)) {
        // Numbered list
        const text = trimmed.replace(/^\d+\.\s/, '');
        elements.push(
          <li key={index} className="ml-4 list-decimal text-xs text-neutral-700 leading-relaxed my-0.5">
            {renderInlineFormatted(text)}
          </li>
        );
      } else if (trimmed.startsWith('> ')) {
        // Blockquote
        elements.push(
          <blockquote
            key={index}
            className="border-l-2 border-[#BE6B37] pl-3 my-2 text-xs italic text-neutral-600 bg-[#ECECE8]/40 py-1 rounded-r"
          >
            {renderInlineFormatted(trimmed.slice(2))}
          </blockquote>
        );
      } else if (trimmed.length > 0) {
        elements.push(
          <p key={index} className="text-xs text-neutral-800 leading-relaxed my-1.5">
            {renderInlineFormatted(trimmed)}
          </p>
        );
      }
    });

    if (inTable) {
      flushTable(9999);
    }

    return elements;
  };

  return (
    <div className="space-y-1 text-xs">
      {parts.map((part, idx) => {
        if (part.type === 'code' && part.code) {
          return (
            <div key={idx} className="my-3 rounded-xl border border-[#D9DBDE] bg-[#1E1E22] overflow-hidden shadow-xs">
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#141416] border-b border-neutral-700/60 text-[11px] text-neutral-300 font-mono">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[#BE6B37]" />
                  <span>{part.lang || 'code'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyCode(part.code!, idx)}
                  className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white transition-colors"
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 text-[11px] font-mono text-neutral-100 overflow-x-auto leading-relaxed">
                <code>{part.code}</code>
              </pre>
            </div>
          );
        }
        return <React.Fragment key={idx}>{renderTextParagraphs(part.text || '')}</React.Fragment>;
      })}
    </div>
  );
};
