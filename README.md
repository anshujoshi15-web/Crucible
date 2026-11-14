# Crucible

Crucible is a Seed incubation workspace with collaborator invitations, Branch proposals, allocation previews, and a Base Mainnet registry. It includes a House admin page for registry operations.

Use Node.js 22.13 or later.

```sh
npm run dev
```

Open http://127.0.0.1:8787. The local server applies the SQL migrations and stores workspaces in `.local/crucible.sqlite`. Set `CRUCIBLE_PORT` to use another port. The server binds to loopback for local development.

The homepage can save drafts without a wallet. To register a Seed, connect an Ethereum wallet on Base Mainnet and use **Submit to Incubator**. The site asks the wallet to authorize the EVO deposit if needed. After the registry transaction confirms, the server verifies the receipt and records the Seed ID. A local server still uses the real Base registry for wallet submissions.

Run `npm run build` to generate the Cloudflare Worker module at `dist/server/index.js`. A hosted deployment needs a D1 database bound as `DB` and the migrations in `drizzle/` applied in order. Configure the hosting audience before accepting private workspace records. GitHub stores the source and the private Sites deployment serves the application.

## Hostinger

Create a **Web App** for `crucible.thehouseofjoshi.com` in hPanel and import the GitHub repository's `main` branch. Use the repository root, the **Other** framework preset, **Node.js 24**, **npm**, `npm run build` as the build command, and `server.js` as the entry file. Run the application as a Node.js service. Hostinger supplies the port through `PORT`.

If the subdomain already belongs to a different site type, first deploy the app to a temporary Hostinger domain. Then assign the Crucible subdomain to the working Web App in hPanel. Configure `CRUCIBLE_DATA_DIR` with a writable persistent path outside the deployment checkout so database files survive code releases. The Hostinger database starts empty and needs a separate migration if you want to bring existing workspaces over. Preserve any site-level access restrictions before pointing the custom domain to the app.

After deployment, open the site over HTTPS and check `/about`, `/contact`, and `/admin`. The deployment logs should show the Node.js server listening.
