# Crucible

Crucible is a Seed incubation workspace with collaborator invitations, Branch proposals, allocation previews, and a Base Mainnet registry. It includes a House admin page for registry operations.

Use Node.js 22.13 or later.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:8787. The local server applies the SQL migrations and stores workspaces in `.local/crucible.sqlite`. The server binds to loopback for local development.

The homepage can save drafts without a wallet. To register a Seed, connect an Ethereum wallet on Base Mainnet and use **Submit to Incubator**. The site asks the wallet to authorize the EVO deposit if needed. After the registry transaction confirms, the server verifies the receipt and records the Seed ID. A local server still uses the real Base registry for wallet submissions.

Run `npm run build` and `npm start` to serve the production Next.js build. Next.js serves the existing page assets and handles the Seed API on the Node.js runtime.

## Hostinger

In **Settings & Redeploy**, select the **Next.js** framework preset, **Node.js 24**, **npm**, and `npm run build`. Deploy the repository root of the `main` branch and use the Next.js preset defaults for startup and build output.

If the subdomain already belongs to a different site type, first deploy the app to a temporary Hostinger domain. Then assign the Crucible subdomain to the working Web App in hPanel. Configure `CRUCIBLE_DATA_DIR` with a writable persistent path outside the deployment checkout so database files survive code releases. The Hostinger database starts empty and needs a separate migration if you want to bring existing workspaces over. Preserve any site-level access restrictions before pointing the custom domain to the app.

After deployment, open the site over HTTPS and check `/about`, `/contact`, and `/admin`. Confirm that the deployment logs show the Next.js preset and that the site opens on the assigned domain.

## RainbowKit and WalletConnect

Create a project in the [Reown Dashboard](https://dashboard.reown.com/) and add its Project ID to the Hostinger environment as `REOWN_PROJECT_ID`. If the project restricts origins, allow `https://crucible.thehouseofjoshi.com` and any preview origin you use. Redeploy to apply the environment setting. Locally, set the same variable in `.env.local`.

The Project ID is a browser-facing identifier. With it configured, the homepage and admin page use RainbowKit for Rainbow, WalletConnect, and installed wallets on Base Mainnet. Without it, they use the installed wallet flow. The House wallet and Registry checks still apply to admin actions.
