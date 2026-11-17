# FreshTrack

FreshTrack tracks product expiry dates and can suggest food ideas in a text chat. Products stay in browser storage on the device where they were entered.

## Culinary assistant and privacy

The assistant uses OpenRouter's `openrouter/free` router. It answers food-related questions, writes recipes from a user's request, and can consider up to 40 unused products whose expiry date is today or later. It does not search the internet; online search would add a separate charge. OpenRouter may receive the selected product names, quantities and expiry dates, along with up to 8 recent chat messages. Product notes and the browser's complete product list are not sent. Chat history stays in the current browser tab and is cleared on reload.

The app limits each client to 5 requests per 15 minutes and 25 per day, with a 300-request daily global ceiling. The Worker uses a Durable Object to enforce these limits across instances.

## Run locally

Requires Node.js 20 or newer. Set an OpenRouter API key in the server environment; never put it in frontend code.

```powershell
npm install
$env:AI_API_KEY = "your-openrouter-api-key"
npm start
```

Open `http://127.0.0.1:3000`. If `AI_API_KEY` is not set, the expiry tracker still works but chat requests return a configuration error.

## Publish on Cloudflare

1. Install dependencies with `npm install`.
2. Log in with `npx wrangler login`.
3. Store the API key as a Worker secret with `npm run secret:cloudflare`.
4. Preview with `npm run dev:cloudflare`.
5. Publish with `npm run deploy:cloudflare`.

The existing Durable Object binding enforces rate limits. The Worker serves the static frontend and forwards chat requests to OpenRouter from the server, keeping the key out of the browser.

## Roll back

Changes are kept in a GitHub pull request until merged; close it to discard the proposed source changes. After merging, use GitHub's **Revert** action to restore the previous source version.

To restore the previous live Cloudflare Worker version, open **Workers & Pages → freshtrack-recipes → Deployments**, select the earlier deployment, and choose **Rollback**. This changes the live deployment without deleting the deployment history.

## Checks

Run the built-in tests with `npm test`.
