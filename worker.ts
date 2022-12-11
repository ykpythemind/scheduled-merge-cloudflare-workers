import { App } from "@octokit/app";
import { verifyWebhookSignature } from "./lib/verify.js";

export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  // MY_BUCKET: R2Bucket;

  // GITHUB_TOKEN: string;
  SLACK_WEBHOOK_URL: string;

  APP_ID: string;
  WEBHOOK_SECRET: string;
  PRIVATE_KEY: string;
}

export default {
  async fetch(request: Request, env: Env) {
    let a = "";
    a = 0;
    // wrangler secret put APP_ID
    const appId = env.APP_ID;
    // wrangler secret put WEBHOOK_SECRET
    const secret = env.WEBHOOK_SECRET;

    // The private-key.pem file from GitHub needs to be transformed from the
    // PKCS#1 format to PKCS#8, as the crypto APIs do not support PKCS#1:
    //
    //     openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in private-key.pem -out private-key-pkcs8.pem
    //
    // Then set the private key
    //
    //     cat private-key-pkcs8.pem | wrangler secret put PRIVATE_KEY
    //
    const privateKey = env.PRIVATE_KEY;

    // instantiate app
    // https://github.com/octokit/app.js/#readme
    const app = new App({
      appId,
      privateKey,
      webhooks: {
        secret,
      },
    });

    app.webhooks.on("issues.opened", async ({ octokit, payload }) => {
      await octokit.request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: payload.issue.number,
          body:
            "Hello there from [Cloudflare Workers](https://github.com/gr2m/cloudflare-worker-github-app-example/#readme)",
        }
      );
    });

    if (request.method === "GET") {
      const { data } = await app.octokit.request("GET /app");

      return new Response(
        `<h1>Cloudflare Worker Example GitHub app</h1>

<p>Installation count: ${data.installations_count}</p>

<p><a href="https://github.com/apps/cloudflare-worker-example">Install</a> | <a href="https://github.com/gr2m/cloudflare-worker-github-app-example/#readme">source code</a></p>`,
        {
          headers: { "content-type": "text/html" },
        }
      );
    }

    const id = request.headers.get("x-github-delivery");
    const name = request.headers.get("x-github-event");
    const signature = request.headers.get("x-hub-signature-256") ?? "";
    const payloadString = await request.text();
    const payload = JSON.parse(payloadString);

    // Verify webhook signature
    try {
      await verifyWebhookSignature(payloadString, signature, secret);
    } catch (error) {
      let errorMessage = "something wrong";

      if (error instanceof Error) {
        app.log.warn(error.message);
        errorMessage = error.message;
      }
      return new Response(`{ "error": "${errorMessage}" }`, {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Now handle the request
    try {
      await app.webhooks.receive({
        id: id!,
        name: name!,
        payload,
      });

      return new Response(`{ "ok": true }`, {
        headers: { "content-type": "application/json" },
      });
    } catch (error) {
      let errorMessage = "something wrong";

      if (error instanceof Error) {
        app.log.error(error.message);
        errorMessage = error.message;
      }

      return new Response(`{ "error": "${errorMessage}" }`, {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  },
};
