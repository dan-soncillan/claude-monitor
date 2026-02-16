import { App } from "@slack/bolt";
import { registerCommands } from "./commands";
import { registerActions } from "./actions";
import { startWSListener } from "./ws-listener";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Register all handlers
registerCommands(app);
registerActions(app);

(async () => {
  await app.start();
  console.log("ClaudeMonitor Slack bot is running (Socket Mode)");

  // Start WebSocket listener for backend events
  startWSListener(app);
})();
