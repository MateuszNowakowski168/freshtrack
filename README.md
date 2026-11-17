# FreshTrack

FreshTrack tracks expiry dates in the browser and suggests recipes from the products saved on that device. Product data stays in browser storage unless the user asks the AI assistant for ideas.

## Publish on Cloudflare

Requires Node.js 20 or newer and a Cloudflare account. The frontend is served from `public/`; `cloudflare-worker.mjs` handles the API, and a SQLite-backed Durable Object keeps request limits consistent across Worker instances.

1. In PowerShell, go to this project folder and install dependencies: `npm install`.
2. Log in to Cloudflare: `npx wrangler login`.
3. Preview on Cloudflare's local simulator with `npm run dev:cloudflare`, then open the local address it prints. Without a configured secret, AI recommendations show that the assistant is not configured.
4. Publish the Worker with `npm run deploy:cloudflare`. Cloudflare prints its public URL.
5. Add the OpenRouter key to the deployed Worker: `npm run secret:cloudflare`. Paste the key into the hidden prompt; the new Worker version receives it as a secret.

Alternatively, after the first deployment, add `AI_API_KEY` in the Cloudflare dashboard under the Worker’s **Settings → Variables and Secrets**, as an encrypted secret (not a plaintext variable). Redeploy or create a new Worker version after saving the secret.

The Worker uses the permanently fixed OpenRouter `openrouter/free` router. It does not accept a custom provider URL, user-selected model, or paid fallback, and rejects responses unless OpenRouter reports the selected model with its `:free` suffix. Free-model availability and OpenRouter's own limits can vary.

Do not host the frontend on a static-only service separately from this Worker: the browser sends same-origin requests to `/api/recommendations`. Cloudflare account limits and any platform usage charges still apply; only the OpenRouter model is locked to the free router.

## Roll back

The GitHub change is kept on its own branch and pull request. Before it is merged, close the pull request to keep `main` unchanged. After merging, use GitHub's **Revert** action on the pull request to create a commit that restores the previous source version.

To restore the previous live Cloudflare Worker version, open **Workers & Pages → freshtrack-recipes → Deployments**, select the earlier deployment, and choose **Rollback**. This changes the live deployment without deleting the deployment history.

## Run locally

For a standalone Node.js server instead of Cloudflare, configure the OpenRouter key in the shell before starting the server:

```powershell
$secureKey = Read-Host "AI API key" -AsSecureString
$env:AI_API_KEY = (New-Object System.Net.NetworkCredential("", $secureKey)).Password
npm start
```

Open `http://127.0.0.1:3000`. The app can be browsed without an API key, but AI recommendations remain unavailable until `AI_API_KEY` is configured.

Never put the key in `app.js`, HTML, or a committed file. `.env.example` is a template only and is not loaded by the server.

## AI data and usage limits

When a user submits a request, the server sends OpenRouter's free-model router up to 40 product names with expiry dates and the user's optional preference text (up to 500 characters). It does not send product notes or conversation history, and it does not save the prompt or response. The user-facing form explains this before use. Free-model availability and provider rate limits vary; requests can fail or be temporarily unavailable.

Both deployments enforce per-IP limits of 5 requests per 15 minutes and 25 per day, plus a process-wide/Worker-wide ceiling of 300 requests per day. The Node server limiter is in memory and resets when the server restarts. On Cloudflare, a single SQLite-backed Durable Object applies the limits consistently across Worker instances; IP addresses are hashed before they are stored. Both limits can be bypassed by changing IP addresses; the global ceiling caps total successful requests to the AI across the app.

The AI produces meal ideas, not food-safety, allergy, or medical advice. Confirm ingredients and cooking instructions independently.

## Checks

Run the built-in tests with `npm test`.
