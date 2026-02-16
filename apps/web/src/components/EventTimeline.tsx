import { useMemo, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Event } from "@claude-monitor/shared";

// ─── Helpers ─────────────────────────────────────────────────

function parseJson(str?: string | null): Record<string, unknown> | null {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function formatTime(dateStr: string): string {
  return new Date(dateStr + "Z").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function shortPath(p: string): string {
  const parts = p.split("/");
  if (parts.length <= 2) return p;
  return ".../" + parts.slice(-2).join("/");
}

function describeToolInput(toolName: string, input: Record<string, unknown> | null): string {
  if (!input) return "";
  switch (toolName) {
    case "Bash": {
      const cmd = String(input.command || "");
      return cmd.length > 60 ? cmd.slice(0, 60) + "..." : cmd;
    }
    case "Read": return shortPath(String(input.file_path || ""));
    case "Edit":
    case "Write": return shortPath(String(input.file_path || ""));
    case "Grep": return `"${String(input.pattern || "")}"`;
    case "Glob": return String(input.pattern || "");
    case "Task": return String(input.description || "").slice(0, 50);
    case "WebFetch": return String(input.url || "").slice(0, 50);
    case "WebSearch": return String(input.query || "");
    case "AskUserQuestion": return "AskUserQuestion";
    default: return "";
  }
}

function summarizeOutput(_toolName: string, raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const parsed = parseJson(raw);
  if (!parsed) return raw.length > 1000 ? raw.slice(0, 1000) + "..." : raw;
  const content = parsed.output ?? parsed.content ?? parsed.result ?? parsed.error;
  if (typeof content === "string") return content.length > 1000 ? content.slice(0, 1000) + "..." : content;
  const formatted = JSON.stringify(parsed, null, 2);
  return formatted.length > 1000 ? formatted.slice(0, 1000) + "..." : formatted;
}

// ─── Types ───────────────────────────────────────────────────

interface ToolOp {
  id: number;
  toolName: string;
  label: string;
  output?: string;
  status: "running" | "done";
  time: string;
}

interface TimelineBlock {
  id: number;
  kind: "prompt" | "tools" | "system" | "notification" | "assistant" | "user_answer";
  // prompt
  label?: string;
  // tools group
  tools?: ToolOp[];
  // system/notification
  time: string;
}

// ─── Build timeline blocks ───────────────────────────────────

function buildTimeline(events: Event[]): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  const sorted = [...events].sort((a, b) => a.id - b.id);
  const pendingStacks = new Map<string, ToolOp[]>();
  let currentToolGroup: ToolOp[] = [];

  function flushTools() {
    if (currentToolGroup.length > 0) {
      blocks.push({
        id: currentToolGroup[0].id,
        kind: "tools",
        tools: [...currentToolGroup],
        time: currentToolGroup[0].time,
      });
      currentToolGroup = [];
    }
  }

  for (const ev of sorted) {
    if (ev.event_type === "user_prompt") {
      flushTools();
      blocks.push({
        id: ev.id,
        kind: "prompt",
        label: ev.summary || "",
        time: ev.created_at,
      });
      continue;
    }

    if (ev.event_type === "notification") {
      flushTools();
      blocks.push({
        id: ev.id,
        kind: "notification",
        label: ev.summary || "Notification",
        time: ev.created_at,
      });
      continue;
    }

    if (ev.event_type === "stop") {
      flushTools();
      // Show stop event as assistant response if summary contains actual content
      const summary = ev.summary || "";
      const isGenericStop = !summary || summary === "Session stopped" || summary.startsWith("Stopped:");
      if (isGenericStop) {
        blocks.push({ id: ev.id, kind: "system", label: "Task completed", time: ev.created_at });
      } else {
        blocks.push({ id: ev.id, kind: "assistant", label: summary, time: ev.created_at });
      }
      continue;
    }

    if (ev.event_type === "session_start" || ev.event_type === "session_end") {
      flushTools();
      const labels: Record<string, string> = {
        session_start: "Session started",
        session_end: "Session ended",
      };
      blocks.push({
        id: ev.id,
        kind: "system",
        label: labels[ev.event_type] || ev.event_type,
        time: ev.created_at,
      });
      continue;
    }

    if (ev.event_type === "pre_tool_use") {
      const input = parseJson(ev.tool_input);
      const desc = describeToolInput(ev.tool_name || "", input);
      const key = ev.tool_name || "";
      const op: ToolOp = { id: ev.id, toolName: ev.tool_name || "", label: desc, status: "running", time: ev.created_at };
      if (!pendingStacks.has(key)) pendingStacks.set(key, []);
      pendingStacks.get(key)!.push(op);
      currentToolGroup.push(op);
      continue;
    }

    if (ev.event_type === "post_tool_use") {
      const key = ev.tool_name || "";

      // AskUserQuestion: show as a dedicated user_answer block
      if (key === "AskUserQuestion") {
        // Mark the pending pre_tool_use as done and remove from current group
        const stack = pendingStacks.get(key);
        if (stack && stack.length > 0) {
          const op = stack.shift()!;
          op.status = "done"; // Mark done even if already flushed to a block
          const idx = currentToolGroup.indexOf(op);
          if (idx >= 0) currentToolGroup.splice(idx, 1);
          if (stack.length === 0) pendingStacks.delete(key);
        }
        flushTools();
        const resp = parseJson(ev.tool_response);
        const answers = (resp as any)?.answers as Record<string, string> | undefined;
        if (answers) {
          const parts = Object.entries(answers).map(([q, a]) => `${q} → ${a}`);
          blocks.push({ id: ev.id, kind: "user_answer", label: parts.join("\n"), time: ev.created_at });
        }
        continue;
      }

      const stack = pendingStacks.get(key);
      if (stack && stack.length > 0) {
        const op = stack.shift()!;
        op.status = "done";
        op.output = summarizeOutput(ev.tool_name || "", ev.tool_response);
        if (stack.length === 0) pendingStacks.delete(key);
      } else {
        // Orphan
        const input = parseJson(ev.tool_input);
        currentToolGroup.push({
          id: ev.id, toolName: ev.tool_name || "",
          label: describeToolInput(ev.tool_name || "", input),
          output: summarizeOutput(ev.tool_name || "", ev.tool_response),
          status: "done", time: ev.created_at,
        });
      }
      continue;
    }
  }

  flushTools();
  return blocks.reverse();
}

// ─── Tool badge colors ───────────────────────────────────────

const toolColors: Record<string, string> = {
  Bash: "bg-amber-900/40 text-amber-400",
  Read: "bg-sky-900/40 text-sky-400",
  Edit: "bg-violet-900/40 text-violet-400",
  Write: "bg-violet-900/40 text-violet-400",
  Grep: "bg-emerald-900/40 text-emerald-400",
  Glob: "bg-emerald-900/40 text-emerald-400",
  Task: "bg-indigo-900/40 text-indigo-400",
  WebFetch: "bg-cyan-900/40 text-cyan-400",
  WebSearch: "bg-cyan-900/40 text-cyan-400",
  AskUserQuestion: "bg-orange-900/40 text-orange-400",
};

// ─── Components ──────────────────────────────────────────────

function ToolGroupBlock({ tools }: { tools: ToolOp[] }) {
  const [expanded, setExpanded] = useState(false);

  // Summary: count by tool name
  const counts = new Map<string, number>();
  for (const t of tools) counts.set(t.toolName, (counts.get(t.toolName) || 0) + 1);
  const summary = [...counts.entries()].map(([name, count]) => `${name} x${count}`).join(", ");
  const hasRunning = tools.some((t) => t.status === "running");
  const lastTool = tools[tools.length - 1];

  return (
    <div className="my-1">
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-800/30 cursor-pointer hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-gray-600 text-[10px] shrink-0">{expanded ? "v" : ">"}</span>
        <div className="flex items-center gap-1.5 flex-wrap flex-1">
          {[...counts.entries()].map(([name, count]) => (
            <span key={name} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${toolColors[name] || "bg-gray-800 text-gray-400"}`}>
              {name}{count > 1 ? ` x${count}` : ""}
            </span>
          ))}
          {hasRunning && <span className="text-yellow-500 text-[10px] animate-pulse">running...</span>}
        </div>
        <span className="text-gray-600 text-[10px] shrink-0">{formatTime(lastTool.time)}</span>
      </div>
      {expanded && (
        <div className="ml-4 mt-0.5 space-y-0 border-l border-gray-800 pl-2">
          {tools.map((t) => (
            <ToolLine key={t.id} tool={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolLine({ tool }: { tool: ToolOp }) {
  const [showOutput, setShowOutput] = useState(false);
  const color = toolColors[tool.toolName] || "bg-gray-800 text-gray-400";

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-1.5 py-0.5 text-[11px] ${tool.output ? "cursor-pointer hover:bg-gray-800/30 rounded" : ""}`}
        onClick={() => tool.output && setShowOutput(!showOutput)}
      >
        <code className={`px-1 py-0.5 rounded text-[9px] font-semibold shrink-0 ${color}`}>
          {tool.toolName}
        </code>
        <span className="text-gray-500 truncate flex-1 font-mono">{tool.label}</span>
        {tool.status === "running" && <span className="text-yellow-500 text-[9px] animate-pulse">...</span>}
        {tool.output && <span className="text-gray-700 text-[9px]">{showOutput ? "v" : ">"}</span>}
        <span className="text-gray-700 text-[9px] shrink-0">{formatTime(tool.time)}</span>
      </div>
      {showOutput && tool.output && (
        <pre className="text-[10px] text-gray-500 ml-6 mt-0.5 mb-1 bg-gray-900/70 border border-gray-800 p-1.5 rounded overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
          {tool.output}
        </pre>
      )}
    </div>
  );
}

function PromptBlock({ block }: { block: TimelineBlock }) {
  return (
    <div className="flex items-start gap-2 px-2 py-2 my-1 bg-blue-950/20 border border-blue-900/20 rounded-lg">
      <span className="text-[10px] font-bold text-blue-400 bg-blue-950/50 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
        Prompt
      </span>
      <span className="text-[12px] text-gray-200 leading-relaxed flex-1">
        {block.label}
      </span>
      <span className="text-gray-600 text-[10px] shrink-0 mt-0.5">{formatTime(block.time)}</span>
    </div>
  );
}

function NotificationBlock({ block }: { block: TimelineBlock }) {
  return (
    <div className="flex items-start gap-2 px-2 py-2 my-1 bg-yellow-950/20 border border-yellow-900/20 rounded-lg">
      <span className="text-[10px] font-bold text-yellow-400 bg-yellow-950/50 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
        Notice
      </span>
      <span className="text-[12px] text-yellow-200/80 leading-relaxed flex-1">
        {block.label}
      </span>
      <span className="text-gray-600 text-[10px] shrink-0 mt-0.5">{formatTime(block.time)}</span>
    </div>
  );
}

const markdownComponents = {
  h1: ({ children }: any) => <h1 className="text-lg font-bold text-gray-100 mt-3 mb-1.5 border-b border-gray-700/50 pb-1">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-base font-bold text-gray-100 mt-2.5 mb-1">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-semibold text-gray-200 mt-2 mb-1">{children}</h3>,
  h4: ({ children }: any) => <h4 className="text-xs font-semibold text-gray-300 mt-1.5 mb-0.5">{children}</h4>,
  p: ({ children }: any) => <p className="my-1 leading-relaxed">{children}</p>,
  strong: ({ children }: any) => <strong className="text-gray-100 font-semibold">{children}</strong>,
  code: ({ children, className }: any) => {
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return <code className="text-[11px]">{children}</code>;
    }
    return <code className="bg-gray-800 text-emerald-300 px-1 py-0.5 rounded text-[11px]">{children}</code>;
  },
  pre: ({ children }: any) => <pre className="bg-gray-900/80 border border-gray-800 rounded p-2 my-1.5 overflow-x-auto text-[11px] text-gray-300">{children}</pre>,
  ul: ({ children }: any) => <ul className="pl-4 my-1 space-y-0.5 list-disc marker:text-gray-600">{children}</ul>,
  ol: ({ children }: any) => <ol className="pl-4 my-1 space-y-0.5 list-decimal marker:text-gray-500">{children}</ol>,
  li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
  table: ({ children }: any) => <div className="overflow-x-auto my-1.5"><table className="w-full text-[11px] border-collapse">{children}</table></div>,
  thead: ({ children }: any) => <thead className="bg-gray-800/60">{children}</thead>,
  th: ({ children }: any) => <th className="border border-gray-700 px-2 py-1 text-left text-gray-300 font-semibold">{children}</th>,
  td: ({ children }: any) => <td className="border border-gray-800 px-2 py-1 text-gray-400">{children}</td>,
  hr: () => <hr className="border-gray-700/50 my-2" />,
  a: ({ href, children }: any) => <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
  blockquote: ({ children }: any) => <blockquote className="border-l-2 border-gray-600 pl-3 my-1.5 text-gray-400 italic">{children}</blockquote>,
};

function UserAnswerBlock({ block }: { block: TimelineBlock }) {
  return (
    <div className="flex items-start gap-2 px-2 py-2 my-1 bg-blue-950/20 border border-blue-900/20 rounded-lg">
      <span className="text-[10px] font-bold text-blue-400 bg-blue-950/50 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
        Answer
      </span>
      <span className="text-[12px] text-gray-200 leading-relaxed flex-1 whitespace-pre-wrap">
        {block.label}
      </span>
      <span className="text-gray-600 text-[10px] shrink-0 mt-0.5">{formatTime(block.time)}</span>
    </div>
  );
}

function AssistantBlock({ block }: { block: TimelineBlock }) {
  const [expanded, setExpanded] = useState(false);
  const label = block.label ?? "";
  const lines = label.split("\n").filter(l => l.trim());
  const isLong = lines.length > 30;
  const displayText = isLong && !expanded ? lines.slice(0, 30).join("\n") + "\n..." : label;

  return (
    <div className="px-2 py-2 my-1 bg-emerald-950/20 border border-emerald-900/20 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded shrink-0">
          Response
        </span>
        <span className="text-gray-600 text-[10px] ml-auto shrink-0">{formatTime(block.time)}</span>
      </div>
      <div className="text-[12px] text-gray-200 leading-relaxed">
        <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{displayText}</Markdown>
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-emerald-500 hover:text-emerald-400 mt-1 cursor-pointer"
        >
          {expanded ? "Collapse" : `Show all (${lines.length} lines)`}
        </button>
      )}
    </div>
  );
}

function SystemBlock({ block }: { block: TimelineBlock }) {
  return (
    <div className="flex items-center gap-2 py-1 px-2 text-[10px] text-gray-600 my-1">
      <div className="flex-1 border-t border-gray-800/50" />
      <span>{block.label}</span>
      <span>{formatTime(block.time)}</span>
      <div className="flex-1 border-t border-gray-800/50" />
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────

export function EventTimeline({ events }: { events: Event[] }) {
  const timeline = useMemo(() => buildTimeline(events), [events]);

  if (timeline.length === 0) {
    return <div className="text-center text-gray-600 py-8 text-sm">No events yet.</div>;
  }

  return (
    <div>
      {timeline.map((block) => {
        switch (block.kind) {
          case "prompt": return <PromptBlock key={block.id} block={block} />;
          case "tools": return <ToolGroupBlock key={block.id} tools={block.tools!} />;
          case "assistant": return <AssistantBlock key={block.id} block={block} />;
          case "user_answer": return <UserAnswerBlock key={block.id} block={block} />;
          case "notification": return <NotificationBlock key={block.id} block={block} />;
          case "system": return <SystemBlock key={block.id} block={block} />;
        }
      })}
    </div>
  );
}
