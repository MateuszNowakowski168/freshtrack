# FreshTrack

FreshTrack helps track product expiry dates. Products are stored in the browser on the device where they are entered. This version contains the expiry tracker only; it has no recipe catalogue or AI assistant.

## Run locally

Requires Node.js 20 or newer.

```powershell
npm install
npm start
```

Open `http://127.0.0.1:3000`.

## Publish on Cloudflare

The static frontend is served by a Cloudflare Worker. No API key or AI service is required.

1. Install dependencies with `npm install`.
2. Log in with `npx wrangler login`.
3. Preview with `npm run dev:cloudflare`.
4. Publish with `npm run deploy:cloudflare`.

## Roll back

Changes are kept in a GitHub pull request until merged; close it to discard the proposed source changes. After merging, use GitHub's **Revert** action to restore the previous source version.

To restore the previous live Cloudflare Worker version, open **Workers & Pages → freshtrack-recipes → Deployments**, select the earlier deployment, and choose **Rollback**. This changes the live deployment without deleting the deployment history.

## Checks

Run the built-in tests with `npm test`.
