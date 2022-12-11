import { App } from "@octokit/app";
import { Octokit } from "@octokit/core";
import { isSameDay, isSameSecond, parseISO } from "date-fns";
import { MergeSchedule, newScheduleModel } from "./lib/db.js";
import { parseSchedule } from "./lib/scheduleParser.js";
import { verifyWebhookSignature } from "./lib/verify.js";

export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  DB: D1Database;

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

    app.webhooks.on("pull_request.opened", async ({ octokit, payload }) => {
      const installationId = payload.installation?.id;
      if (!installationId) {
        app.log.warn("installation not found");
        return;
      }

      const repositoryOwner = payload.repository.owner.login;
      const repositoryName = payload.repository.name;
      const pullRequestNumber = payload.pull_request.number;

      const scheduleInput = parseSchedule(payload.pull_request.body);
      if (!scheduleInput) {
        return;
      }
      if ("error" in scheduleInput) {
        await addPullRequestComment(
          octokit,
          {
            owner: repositoryOwner,
            name: repositoryName,
            id: pullRequestNumber,
          },
          `Merge schedule error: ${scheduleInput.error}`
        );

        return;
      }

      const dbSchedules = newScheduleModel(env.DB);
      const existingScheduleOnDB = await dbSchedules.First({
        where: {
          installationId,
          repositoryOwner,
          repositoryName,
          pullRequestNumber,
        },
      });

      if (existingScheduleOnDB) {
        if (
          isSameSecond(
            parseISO(existingScheduleOnDB.willMergeAt),
            parseISO(scheduleInput.willMergeAtUtc)
          )
        ) {
          app.log.info("same schedule exsits, ignore...");
          return;
        }
      }

      // いったん削除してから追加
      await dbSchedules.Delete({
        where: {
          installationId,
          repositoryName,
          repositoryOwner,
          pullRequestNumber,
        },
      });
      await dbSchedules.InsertOne({
        installationId,
        repositoryName,
        repositoryOwner,
        pullRequestNumber,
        willMergeAt: scheduleInput.willMergeAtUtc,
      });

      await addPullRequestComment(
        octokit,
        {
          owner: repositoryOwner,
          name: repositoryName,
          id: pullRequestNumber,
        },
        `Merge schedule created. : ${scheduleInput.willMergeAtOriginal} (${scheduleInput.willMergeAtUtc})`
      );
    });

    app.webhooks.on("pull_request.edited", async ({ octokit, payload }) => {
      const installationId = payload.installation?.id;
      if (!installationId) {
        app.log.warn("installation not found");
        return;
      }

      if (payload.pull_request.state === "closed") {
        app.log.info("pull request is closed, ignore...");
        return;
      }

      const dbSchedules = newScheduleModel(env.DB);
      const repositoryOwner = payload.repository.owner.login;
      const repositoryName = payload.repository.name;
      const pullRequestNumber = payload.pull_request.number;

      const scheduleInput = parseSchedule(payload.pull_request.body);
      if (!scheduleInput) {
        const existingSchedulesOnDB = await dbSchedules.All({
          where: {
            installationId,
            repositoryOwner,
            repositoryName,
            pullRequestNumber,
          },
        });

        if (!existingSchedulesOnDB.results) return;

        if (existingSchedulesOnDB.results.length === 0) return;

        app.log.info("try to delete schedule");

        await dbSchedules.Delete({
          where: {
            installationId,
            repositoryOwner,
            repositoryName,
            pullRequestNumber,
          },
        });

        await addPullRequestComment(
          octokit,
          {
            owner: repositoryOwner,
            name: repositoryName,
            id: pullRequestNumber,
          },
          `Merge schedule deleted.`
        );
        return;
      }

      if ("error" in scheduleInput) {
        await addPullRequestComment(
          octokit,
          {
            owner: repositoryOwner,
            name: repositoryName,
            id: pullRequestNumber,
          },
          `Merge schedule error: ${scheduleInput.error}`
        );

        return;
      }

      try {
        const existingScheduleOnDB = await dbSchedules.First({
          where: {
            installationId,
            repositoryOwner,
            repositoryName,
            pullRequestNumber,
          },
        });

        if (existingScheduleOnDB) {
          if (
            isSameSecond(
              parseISO(existingScheduleOnDB.willMergeAt),
              parseISO(scheduleInput.willMergeAtUtc)
            )
          ) {
            app.log.info("same schedule exsits, ignore...");
            return;
          } else {
            app.log.info("schedule changed, update");
            await dbSchedules.Update({
              where: {
                id: existingScheduleOnDB.id,
              },
              data: { willMergeAt: scheduleInput.willMergeAtUtc },
            });

            await addPullRequestComment(
              octokit,
              {
                owner: repositoryOwner,
                name: repositoryName,
                id: pullRequestNumber,
              },
              `Merge schedule updated : ${scheduleInput.willMergeAtOriginal} (${scheduleInput.willMergeAtUtc})`
            );
            return;
          }
        }

        await dbSchedules.InsertOne({
          installationId,
          repositoryName,
          repositoryOwner,
          pullRequestNumber,
          willMergeAt: scheduleInput.willMergeAtUtc,
        });

        await addPullRequestComment(
          octokit,
          {
            owner: repositoryOwner,
            name: repositoryName,
            id: pullRequestNumber,
          },
          `Merge schedule created. : ${scheduleInput.willMergeAtOriginal} (${scheduleInput.willMergeAtUtc})`
        );
      } catch (e) {
        console.error(e);
      }
    });

    app.webhooks.on("pull_request.closed", async ({ octokit, payload }) => {
      const installationId = payload.installation?.id;
      if (!installationId) {
        app.log.warn("installation not found");
        return;
      }

      const repositoryOwner = payload.repository.owner.login;
      const repositoryName = payload.repository.name;
      const pullRequestNumber = payload.pull_request.number;

      // 予定を削除する
      const dbSchedules = newScheduleModel(env.DB);
      const existingScheduleOnDB = await dbSchedules.First({
        where: {
          installationId,
          repositoryName,
          repositoryOwner,
          pullRequestNumber,
        },
      });
      if (existingScheduleOnDB) {
        await dbSchedules.Delete({ where: { id: existingScheduleOnDB.id } });
        app.log.info("schedule deleted");
      }
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
        // @ts-expect-error
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

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const now = new Date();
    console.log(`tick ${now}`);

    const appId = env.APP_ID;
    const secret = env.WEBHOOK_SECRET;
    const privateKey = env.PRIVATE_KEY;

    const scheduleDB = newScheduleModel(env.DB);

    const { results } = await env.DB.prepare(
      "SELECT * FROM mergeSchedules WHERE willMergeAt < ?"
    )
      .bind(now.toISOString())
      .all<MergeSchedule>();

    if (!results) {
      return;
    }

    // https://github.com/octokit/app.js/#readme
    const app = new App({
      appId,
      privateKey,
      webhooks: {
        secret,
      },
    });

    for (const schedule of results) {
      try {
        const octokit = await app.getInstallationOctokit(
          schedule.installationId
        );

        const pull = await octokit.request(
          "GET /repos/{owner}/{repo}/pulls/{pull_number}",
          {
            owner: schedule.repositoryOwner,
            repo: schedule.repositoryName,
            pull_number: schedule.pullRequestNumber,
          }
        );

        if (pull.data.state !== "open") {
          console.warn("pull request is not open. ignore");

          await scheduleDB.Delete({ where: { id: schedule.id } });
          await addPullRequestComment(
            octokit,
            {
              owner: schedule.repositoryOwner,
              name: schedule.repositoryName,
              id: schedule.pullRequestNumber,
            },
            "⚠ Scheduled merge canceled because pull request is not open. (Schedule is deleted)"
          );
          continue;
        }

        try {
          // try merge
          await octokit.request(
            "POST /repos/{owner}/{repo}/pulls/{pull_number}/merge",
            {
              owner: schedule.repositoryOwner,
              repo: schedule.repositoryName,
              pull_number: schedule.pullRequestNumber,
              //       merge_method: "squash",
            }
          );
          await scheduleDB.Delete({ where: { id: schedule.id } });
          await addPullRequestComment(
            octokit,
            {
              owner: schedule.repositoryOwner,
              name: schedule.repositoryName,
              id: schedule.pullRequestNumber,
            },
            "Pull request merged by Scheduled-merge."
          );
        } catch (e) {
          // マージできなかった場合 一旦無視
          console.error(e);
          app.log.error("error on schedule iteration");
          app.log.error(JSON.stringify(e));
        }
      } catch (e) {
        app.log.warn("error on schedule iteration");
        app.log.warn(JSON.stringify(e));
        continue;
      }
    }
  },
};
// async function postToSlack(webhookUrl: string, message: string) {
//   try {
//     await fetch(webhookUrl, {
//       body: JSON.stringify({ text: message }),
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//     });
//   } catch (e) {
//     console.error(e);
//   }
// }

async function addPullRequestComment(
  octokit: Octokit,
  pullRequest: PullRequest,
  body: string
) {
  try {
    await octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
      {
        owner: pullRequest.owner,
        repo: pullRequest.name,
        issue_number: pullRequest.id,
        body,
      }
    );
  } catch (error) {
    console.error(error);
  }
}

type PullRequest = {
  owner: string;
  name: string;
  id: number;
};
