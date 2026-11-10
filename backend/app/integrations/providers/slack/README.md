# Configure Slack

Wire a Slack app to GRID so projects get channel notifications + DMs and
`/create-ticket`. Do the one-time app setup (steps 1–5), then connect per project (step 6).

> Slack requires **public HTTPS** URLs for OAuth, slash commands, and interactivity.
> `localhost` will not work — for local dev, expose the backend with a tunnel
> (`ngrok http 8000`, `cloudflared`, …) and use that https URL as `APP_BACKEND_BASE_URL`.

Below, `BACKEND` = your public backend base URL (e.g. `https://api-grid.example.com`).

## 1. Create the app
api.slack.com/apps → **Create New App** → **From scratch** → name it, pick the workspace.

## 2. OAuth scopes
**OAuth & Permissions → Bot Token Scopes** — add exactly these:

```
channels:read   channels:join   groups:read
chat:write      im:write        commands
users:read      users:read.email
```

## 3. Redirect URL
**OAuth & Permissions → Redirect URLs** → Add:

```
BACKEND/slack/oauth/callback
```

## 4. Slash commands
**Slash Commands → Create New Command**, with Request URL `BACKEND/slack/commands`:

| Command | Request URL | Description |
|---|---|---|
| `/create-ticket` | `BACKEND/slack/commands` | Create a ticket (modal, or `PROJ Title`) |

## 5. Interactivity
**Interactivity & Shortcuts** → toggle **On** → Request URL:

```
BACKEND/slack/actions
```

(Needed for the `/create-ticket` modal to submit.)

## 6. Backend env vars
From **Basic Information → App Credentials**, copy into `backend/.env`
(note the `APP_` prefix — that is the app-wide env prefix):

```dotenv
APP_SLACK_CLIENT_ID=<Client ID>
APP_SLACK_CLIENT_SECRET=<Client Secret>
APP_SLACK_SIGNING_SECRET=<Signing Secret>

# Must match the public URLs Slack is pointed at (used to build redirect/links):
APP_BACKEND_BASE_URL=https://api-grid.example.com
APP_FRONTEND_BASE_URL=https://grid.example.com
```

Restart the backend after editing `.env`.

## 7. Connect a project (in-app)
As the project **owner or an admin**: **Settings → Integrations → Connect Slack** →
authorize → pick the **Channel** for notifications.

- The bot auto-joins **public** channels. For a **private** channel, `/invite @YourApp`
  in Slack first, then select it.
- No channel selected = DMs still work (assignee / @mention / watcher), no channel posts.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Redirect to `…/settings/integrations?error=slack_auth_failed` | Redirect URL mismatch, or `CLIENT_ID`/`CLIENT_SECRET` wrong. Re-check steps 3 & 6. |
| Slash command → "dispatch_failed" / 403 | Request URL wrong, or `SIGNING_SECRET` mismatch, or backend not public. Steps 4, 5, 6. |
| Modal opens but submit does nothing | Interactivity Request URL not set (step 5). |
| No channel posts, DMs fine | No channel selected, or bot not in a private channel (step 7). |
| Notifications stop for one event type | Per-event toggles live in the `slack_integrations` doc's `notification_settings`. |

Full architecture / how inbound + dispatch work: [`../../README.md`](../../README.md).
