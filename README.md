# Crucible

Crucible is a Seed incubation workspace with collaborator invitations, Branch proposals, allocation previews, and a Base Mainnet registry. It includes a House admin page for registry operations.

Use Node.js 22.13 or later.

```sh
npm start
```

Open http://127.0.0.1:8787. The local server applies the SQL migrations and stores workspaces in `.local/crucible.sqlite`. Set `CRUCIBLE_PORT` to use another port. The server binds to loopback for local development.

The homepage can save drafts without a wallet. To register a Seed, connect an Ethereum wallet on Base Mainnet and use **Submit to Incubator**. The site asks the wallet to authorize the EVO deposit if needed. After the registry transaction confirms, the server verifies the receipt and records the Seed ID. A local server still uses the real Base registry for wallet submissions.

Run `npm run build` to generate the Cloudflare Worker module at `dist/server/index.js`. A hosted deployment needs a D1 database bound as `DB` and the migrations in `drizzle/` applied in order. Configure the hosting audience before accepting private workspace records. GitHub stores the source and the private Sites deployment serves the application.
