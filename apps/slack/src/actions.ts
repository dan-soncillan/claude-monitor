import type { App } from "@slack/bolt";
import { monitorApi } from "./api";
import { sessionStatusBlocks } from "./messages/blocks";

export function registerActions(app: App) {
  // Approve button
  app.action("approve_action", async ({ action, ack, respond, body }) => {
    await ack();

    const approvalId = parseInt((action as any).value);
    const userId = ("name" in body.user ? body.user.name : undefined) || body.user.id;

    try {
      const approval = await monitorApi.approveApproval(approvalId, `slack:${userId}`);
      await respond({
        text: `:white_check_mark: Approved by @${userId}\nTool: \`${approval.tool_name}\` | Session: \`${approval.session_id.slice(0, 8)}\``,
        replace_original: true,
      });
    } catch (e) {
      await respond({ text: `Error approving: ${e}`, replace_original: false });
    }
  });

  // Reject button
  app.action("reject_action", async ({ action, ack, respond, body }) => {
    await ack();

    const approvalId = parseInt((action as any).value);
    const userId = ("name" in body.user ? body.user.name : undefined) || body.user.id;

    try {
      const approval = await monitorApi.rejectApproval(approvalId, `slack:${userId}`);
      await respond({
        text: `:x: Rejected by @${userId}\nTool: \`${approval.tool_name}\` | Session: \`${approval.session_id.slice(0, 8)}\``,
        replace_original: true,
      });
    } catch (e) {
      await respond({ text: `Error rejecting: ${e}`, replace_original: false });
    }
  });

  // View context button
  app.action("view_context_action", async ({ action, ack, respond }) => {
    await ack();

    try {
      const { session_id } = JSON.parse((action as any).value);
      const session = await monitorApi.getSession(session_id);
      const events = await monitorApi.getSessionEvents(session_id, 10);
      await respond({
        blocks: sessionStatusBlocks(session, events) as any,
        replace_original: false,
        response_type: "ephemeral",
      });
    } catch (e) {
      await respond({ text: `Error: ${e}`, replace_original: false });
    }
  });

  // Handle dynamic view_session_* buttons
  app.action(/^view_session_/, async ({ action, ack, respond }) => {
    await ack();

    try {
      const sessionId = (action as any).value;
      const session = await monitorApi.getSession(sessionId);
      const events = await monitorApi.getSessionEvents(sessionId, 10);
      await respond({
        blocks: sessionStatusBlocks(session, events) as any,
        replace_original: false,
        response_type: "ephemeral",
      });
    } catch (e) {
      await respond({ text: `Error: ${e}`, replace_original: false });
    }
  });
}
