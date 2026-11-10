# Which hosted notification service fits Cadence's in-app feed?

Research for [#4](https://github.com/DonFungible/cohort-005-project-fork/issues/4), child of the map [#3](https://github.com/DonFungible/cohort-005-project-fork/issues/3). Only the **in-app Notification Feed** (bell + list) is judged here. Email stays on Postmark; web push, SMS and preferences are out of scope.

Starting point: the wider vendor survey at `git show 169d672:docs/research/notification-vendors.md` (recommended Knock, runner-up Courier). Its claims were re-checked against official docs and pricing pages on 2026-11-09. Prices change, so re-check before signing up.

## Recommendation: Knock

Knock is the best fit for the in-app feed on a free tier:

1. **Free tier is generous and complete for in-app.** The Developer plan is $0 with 10,000 messages/month. Pre-built and custom components, the Feed API, custom feed filtering, unlimited feeds per recipient and unlimited (configurable) feed retention are all on Free [1]. A message is one user on one channel, and failed sends aren't billed [1]. Because email stays on Postmark, each notification costs exactly one message.
2. **Ready-made React feed that is styleable, with a headless escape hatch.** `@knocklabs/react` ships `NotificationIconButton` (the bell), `NotificationFeedPopover` and `NotificationFeed` [2]. Styling works through `--rnf-*` CSS variables, by replacing the stylesheet (all classes are `rnf-` prefixed), with `colorMode="dark"`, and with `renderItem` / `renderHeader` for custom cells and headers [2]. If the component can't match Cadence's look, `useNotifications` + `useNotificationStore` return `items` and `metadata.unread_count` / `unseen_count` for a fully custom UI [3].
3. **Strongest per-user feed auth.** With enhanced security mode on, Knock rejects client requests that lack an RS256 JWT signed by our server (`sub` = user id, `exp` recommended). `@knocklabs/node` has a `signUserToken` helper (default 1h expiry), and the client has an `onUserTokenExpiring` refresh hook [4]. That fits the DevUI user switcher: the loader signs a token for whichever user is in the session.
4. **Triggering from Node is one SDK call** with `@knocklabs/node`, from a server action or loader [4][5].

Costs to accept:

- **No local emulator.** Knock is cloud-only. Local dev uses a separate Knock *development* environment with isolated users and content; the CLI defaults to it [5]. Channels have a sandbox mode that generates messages without delivering them downstream [5]. Tests must not hit Knock: wrap triggering behind a small notification service module in `app/` and swap in a fake for tests (this is our design, not a Knock feature). The feed component also calls Knock directly from the browser, so UI tests should mock it, or wrap the headless hooks in our own component.
- **Knock branding stays on Free** (removal is paid), and the first paid tier is Starter at $250/mo [1]. Irrelevant at course scale.
- **Enhanced security is a dashboard toggle we must turn on.** Without it, "a request with your public key can act as any user" [4]. Neither the docs nor the pricing page say it is plan-gated [1][4].

## Comparison (in-app channel only)

| | **Knock** | **Courier** | **Novu Cloud** | **MagicBell** |
|---|---|---|---|---|
| Free tier | 10K messages/mo; feed components, Feed API, unlimited feed retention included [1] | 10K sends/mo [6]; pricing page doesn't say whether Inbox is on Free | 10K workflow runs/mo, 20 workflows, 24h activity retention, Novu branding [9] | **1K deliveries/mo** [12] |
| First paid tier | Starter $250/mo [1] | Pay as you go, $0.005/send [6] | Pro from $30/mo [9] | Startup $249/mo [12] |
| Ready-made React feed | `@knocklabs/react`: bell + popover + feed [2] | `@trycourier/courier-react` v8 `<CourierInbox>` [8] | `@novu/react` `<Inbox>` [11] | Not re-verified |
| Styling | `--rnf-*` CSS vars, replace stylesheet, dark mode, `renderItem` / `renderHeader` [2] | `lightTheme` / `darkTheme` objects, `renderHeader` [8] | `appearance` prop: variables, per-element class names (Tailwind OK), icon overrides, dark theme [11] | — |
| Headless option | `useNotifications` / `useNotificationStore` hooks [3] | Courier JS SDK; custom inbox guide [8] | `@novu/react` hooks [11] | REST API |
| Per-user feed auth | **RS256 JWT, `sub` + `exp`, Node helper, refresh hook** [4] | Scoped JWT from `POST /auth/issue-token`; expiry optional (omitted = never expires); SDK doesn't refresh [7] | HMAC-SHA256 of subscriberId: static, no documented expiry [10] | Not re-verified |
| Node trigger | `@knocklabs/node` [4] | Node SDK [7] | Node SDK | Node SDK / REST |
| Local dev / tests | Cloud dev environment + CLI, channel sandbox mode; no emulator [5] | Cloud only; no emulator | **Open source, self-hostable**, but some cloud features are missing self-hosted [13] | Cloud only |

## Notes per vendor

- **Courier (runner-up).** Its v8 `<CourierInbox>` is a solid component with light and dark theme objects [8]. Token auth is good: scoped to one user and to `inbox:read:messages inbox:write:events` [7]. It loses to Knock on two points: token expiry is optional and the SDK won't refresh tokens for you [7], and the pricing page doesn't confirm Inbox is part of Free [6]. Its pay-as-you-go pricing is the gentlest if Cadence ever outgrows 10K/month [6].
- **Novu Cloud.** It has the cheapest paid tier ($30/mo) [9] and the most flexible styling API (Tailwind classes per element) [11]. It is the only option with a local story, because it is open source and self-hostable [13]. But feed auth is an HMAC of the subscriber id that never expires and isn't scoped [10], and Free keeps Novu branding and only 24h of activity [9]. Self-hosting a 4 vCPU / 8 GB stack just for local dev [13] is more than this project needs.
- **MagicBell.** Ruled out: the free plan is 1,000 deliveries/month [12], thin even for development, and the next step is $249/mo.
- **SuprSend.** Not re-evaluated. The earlier survey dropped it for reasons (preferences, web push) that are out of scope here. It remains a possible alternative, but nothing suggests it beats Knock on the in-app criteria.

## Sources

1. Knock pricing, https://knock.app/pricing
2. Knock, React feed components, https://docs.knock.app/in-app-ui/react/feed
3. Knock, Headless feed hooks, https://docs.knock.app/in-app-ui/react/headless/feed
4. Knock, Security and authentication, https://docs.knock.app/in-app-ui/security-and-authentication
5. Knock, Environments, https://docs.knock.app/concepts/environments ; Knock CLI, https://docs.knock.app/developer-tools/knock-cli ; Implementation guide, https://docs.knock.app/tutorials/implementation-guide
6. Courier pricing, https://www.courier.com/pricing
7. Courier, Inbox authentication, https://www.courier.com/docs/platform/inbox/authentication
8. Courier, React web SDK, https://courier.com/docs/sdk-libraries/courier-react-web ; Customize the inbox, https://www.courier.com/docs/in-app/customize-the-inbox ; v8 migration guide, https://www.courier.com/docs/sdk-libraries/courier-react-v8-migration-guide
9. Novu pricing, https://novu.co/pricing
10. Novu, Prepare Inbox for production (HMAC), https://docs.novu.co/platform/inbox/prepare-for-production
11. Novu, Styling the Inbox, https://docs.novu.co/platform/inbox/configuration/styling ; React SDK, https://docs.novu.co/platform/sdks/react
12. MagicBell pricing, https://www.magicbell.com/pricing
13. Novu, Self-hosting overview, https://docs.novu.co/community/self-hosting-novu/overview
