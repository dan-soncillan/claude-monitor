import type { App } from "@slack/bolt";
import { monitorApi } from "./api";
import { sessionListBlocks, sessionStatusBlocks } from "./messages/blocks";

export function registerCommands(app: App) {
  // /claude-sessions - List all sessions
  app.command("/claude_sessions", async ({ command, ack, respond }) => {
    await ack();

    try {
      const statusFilter = command.text?.trim() || undefined;
      const sessions = await monitorApi.getSessions(statusFilter);
      await respond({
        blocks: sessionListBlocks(sessions) as any,
        response_type: "ephemeral",
      });
    } catch (e) {
      await respond({ text: `Error: ${e}`, response_type: "ephemeral" });
    }
  });

  // /claude_status [session_id] - Show session list or session detail
  app.command("/claude_status", async ({ command, ack, respond }) => {
    await ack();

    const sessionId = command.text?.trim();

    try {
      if (!sessionId) {
        // No ID: show session list with View buttons
        const sessions = await monitorApi.getSessions();
        await respond({
          blocks: sessionListBlocks(sessions) as any,
          response_type: "ephemeral",
        });
      } else {
        // ID provided: show detail
        const session = await monitorApi.getSession(sessionId);
        const events = await monitorApi.getSessionEvents(sessionId, 5);
        await respond({
          blocks: sessionStatusBlocks(session, events) as any,
          response_type: "ephemeral",
        });
      }
    } catch (e) {
      await respond({ text: `Error: ${e}`, response_type: "ephemeral" });
    }
  });

  // /claude-send <session_id> <instruction> - Send instruction to session
  app.command("/claude_send", async ({ command, ack, respond }) => {
    await ack();

    const parts = command.text?.trim().split(/\s+/);
    if (!parts || parts.length < 2) {
      await respond({
        text: "Usage: /claude-send <session_id> <instruction>",
        response_type: "ephemeral",
      });
      return;
    }

    const sessionId = parts[0];
    const instruction = parts.slice(1).join(" ");

    try {
      const result = await monitorApi.sendInstruction(sessionId, instruction);
      await respond({
        text: `:arrow_right: Instruction sent to session \`${sessionId.slice(0, 8)}\`\nCommand ID: \`${result.command_id}\``,
        response_type: "ephemeral",
      });
    } catch (e) {
      await respond({ text: `Error: ${e}`, response_type: "ephemeral" });
    }
  });

  // /claude-start <cwd> <instruction> - Start a new task
  app.command("/claude_start", async ({ command, ack, respond }) => {
    await ack();

    const parts = command.text?.trim().split(/\s+/);
    if (!parts || parts.length < 2) {
      await respond({
        text: "Usage: /claude-start <working_directory> <instruction>",
        response_type: "ephemeral",
      });
      return;
    }

    const cwd = parts[0];
    const instruction = parts.slice(1).join(" ");

    try {
      const result = await monitorApi.startTask(instruction, cwd);
      await respond({
        text: `:rocket: New task started in \`${cwd}\`\nCommand ID: \`${result.command_id}\``,
        response_type: "ephemeral",
      });
    } catch (e) {
      await respond({ text: `Error: ${e}`, response_type: "ephemeral" });
    }
  });
}
