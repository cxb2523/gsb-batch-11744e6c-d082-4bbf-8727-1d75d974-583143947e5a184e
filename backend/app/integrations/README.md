# Integrations module

A pluggable layer for outbound notifications and connected services. Slack and a
generic webhook ship today; new providers (Teams, Discord, email, …) slot in without
touching ticket or notification code.

## Pieces

| File | Role |
|------|------|
| `base.py` | `IntegrationProvider` ABC, `Capability` enum, `ConnectDescriptor` / `ConnectField` / `Target` dataclasses |
| `events.py` | `NotificationEvent`, `Recipient`, event-type + recipient-kind constants |
| `registry.py` | register / look up providers by key or capability |
| `dispatch.py` | `dispatch_notification(db, event)` — fan one event out to every enabled provider, failure-isolated |
| `providers/<key>/` | one concrete provider per directory |
| `__init__.py` | imports + `register(...)`s every provider (single source of truth) |

## How notifications flow

1. Ticket code (`routes/tickets.py:create_ticket_notifications`) resolves **who** to
   notify — admins/assignee/mentions/watchers, de-duped, actor excluded — and builds a
   `NotificationEvent` with a list of `Recipient(email, kind)`.
2. It calls `dispatch_notification(db, event)`.
3. The dispatcher loads each notifying provider's per-project config, skips those that
   are missing / `enabled: false` / have the event toggled off in
   `notification_settings`, and calls `provider.send_notification(...)`.
4. Each provider decides **how** to deliver. One provider raising never blocks another.

The HTTP surface:
- Generic management: `routes/integrations.py` (`/integrations/providers`,
  `/projects/{id}/integrations/{provider}/...`), admin-only.
- Slack inbound webhooks keep their externally-registered URLs in `routes/slack.py`
  (`/slack/oauth/callback`, `/slack/commands`, `/slack/actions`, `/slack/digest`) and
  delegate into `SlackProvider.handle_inbound(...)`.

## Add a provider in 3 steps

1. **Subclass** `IntegrationProvider` in `providers/<key>/provider.py`. Declare `key`,
   `name`, `description`, `collection` (its own Mongo collection, queried by
   `{project_id}`), and `capabilities`. Implement `get_status`, `get_connect_descriptor`,
   `connect`, `send_notification` (plus `list_targets`/`set_target` if `TARGETS`, and
   `handle_inbound` if `INBOUND`). `providers/webhook/provider.py` is a ~60-line template.
2. **Register** it: add `registry.register(MyProvider())` in `integrations/__init__.py`.
3. **(Optional) Frontend icon**: add a branch to `ProviderIcon` in
   `settings/integrations/page.tsx`. Without it the provider still renders with the
   neutral fallback icon — the settings page is fully data-driven off
   `GET /integrations/providers`, so no other frontend change is needed.

That's it — ticket/notification code is untouched.

## Capabilities

| Capability | Meaning |
|------------|---------|
| `CONNECT_OAUTH` | connects via an OAuth redirect (frontend sends the user to `authorize_url`) |
| `CONNECT_FORM` | connects by submitting config fields (frontend renders `fields`, POSTs them) |
| `NOTIFY_CHANNEL` | can post to a shared channel / endpoint |
| `NOTIFY_DM` | can direct-message individual recipients |
| `TARGETS` | has selectable delivery targets (e.g. Slack channels) |
| `INBOUND` | accepts inbound requests (slash commands, interactive actions) |

## Configuration & secrets

Per-project connection data (tokens, URLs, channel, `enabled`, `notification_settings`)
lives in each provider's own Mongo collection — e.g. `slack_integrations`,
`webhook_integrations`.

Global provider secrets go in `backend/.env` and are read via `core/settings.py`.
Convention: `APP_<PROVIDER>_<KEY>` (the `APP_` prefix is the app-wide
`env_prefix`). Slack, for example, uses `APP_SLACK_CLIENT_ID`,
`APP_SLACK_CLIENT_SECRET`, `APP_SLACK_SIGNING_SECRET`. The webhook provider
needs no global secret — its endpoint URL is configured per project.

Inbound webhook URLs to register in the provider's own developer console (Slack app
settings, etc.) point at the backend's public base URL + the `routes/slack.py` paths
above; new providers that accept inbound traffic should add their own routes.
