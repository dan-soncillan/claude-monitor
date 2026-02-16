import type { App } from "@slack/bolt";
import type { WSMessage } from "@claude-monitor/shared";
import { approvalRequestBlocks, notificationBlocks } from "./messages/blocks";
import { monitorApi } from "./api";

/**
 * Connect to the ClaudeMonitor backend WebSocket and forward events to Slack.
 */
export function startWSListener(app: App) {
  const wsUrl = process.env.MONITOR_WS_URL || "ws://localhost:4000/ws";
  const channelId = process.env.SLACK_CHANNEL_ID;

  if (!channelId) {
    console.warn("[Slack WS] SLACK_CHANNEL_ID not set, skipping WebSocket listener");
    return;
  }

  function connect() {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[Slack WS] Connected to backend");
    };

    ws.onmessage = async (event) => {
      try {
        const msg: WSMessage = JSON.parse(String(event.data));
        await handleMessage(app, channelId!, msg);
      } catch (e) {
        console.error("[Slack WS] Error handling message:", e);
      }
    };

    ws.onclose = () => {
      console.log("[Slack WS] Disconnected, reconnecting in 5s...");
      setTimeout(connect, 5000);
    };

    ws.onerror = (err) => {
      console.error("[Slack WS] Error:", err);
    };
  }

  connect();
}

async function handleMessage(app: App, channelId: string, msg: WSMessage) {
  switch (msg.type) {
    case "approval_created": {
      const approval = msg.data as any;
      if (approval.status !== "pending") return;

      await app.client.chat.postMessage({
        channel: channelId,
        text: `Approval required: ${approval.tool_name} in session ${approval.session_id.slice(0, 8)}`,
        blocks: approvalRequestBlocks(approval) as any,
      });
      break;
    }

    case "session_updated": {
      const session = msg.data as any;
      // Notify on notable status changes
      if (
        session.status === "waiting_input" ||
        session.status === "error" ||
        session.status === "completed"
      ) {
        const statusText =
          session.status === "waiting_input"
            ? "is waiting for input"
            : session.status === "error"
              ? "encountered an error"
              : "has completed";

        // Fetch response content for completed sessions
        let response: string | undefined;
        if (session.status === "completed") {
          try {
            const events = await monitorApi.getSessionEvents(session.id, 20);
            const stopEvent = events.find((e) => e.event_type === "stop" && e.summary && !e.summary.startsWith("Stopped:"));
            if (stopEvent?.summary) {
              response = stopEvent.summary;
            }
          } catch (e) {
            console.error("[Slack WS] Failed to fetch session events:", e);
          }
        }

        await app.client.chat.postMessage({
          channel: channelId,
          text: `Session ${session.id.slice(0, 8)} ${statusText}`,
          blocks: notificationBlocks(session, statusText, response) as any,
        });
      }
      break;
    }
  }
}
