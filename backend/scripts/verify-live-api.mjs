import { spawnSync } from "node:child_process";

const deployment = "https://backend-ishaans-projects-f5eaf242.vercel.app";

function run(args) {
  return spawnSync("vercel", args, {
    encoding: "utf8",
    cwd: process.cwd(),
    shell: true,
  });
}

const checks = [
  {
    label: "timeline_before",
    args: ["curl", "/api/timeline?deviceId=smoke-device-001", "--deployment", deployment],
  },
  {
    label: "log_moment",
    args: [
      "curl",
      "/api/logMoment",
      "--deployment",
      deployment,
      "--",
      "--request",
      "POST",
      "--header",
      "Content-Type:application/json",
      "--data",
      JSON.stringify({
        deviceId: "smoke-device-001",
        trigger: "work",
        emotion: "anxious",
        note: "meeting with manager",
      }),
    ],
  },
  {
    label: "timeline_after",
    args: ["curl", "/api/timeline?deviceId=smoke-device-001", "--deployment", deployment],
  },
  {
    label: "weekly_report",
    args: ["curl", "/api/weeklyReport?deviceId=smoke-device-001", "--deployment", deployment],
  },
  {
    label: "subscription_verify",
    args: [
      "curl",
      "/api/subscription/verify",
      "--deployment",
      deployment,
      "--",
      "--request",
      "POST",
      "--header",
      "Content-Type:application/json",
      "--data",
      JSON.stringify({
        subscriptionId: "premium_monthly",
        purchaseToken: "stub-token",
      }),
    ],
  },
];

let exitCode = 0;
for (const check of checks) {
  const result = run(check.args);
  console.log(`=== ${check.label} ===`);
  console.log(`status=${result.status ?? "null"}`);
  if (result.error) {
    console.log(`error=${result.error.message}`);
  }
  if (result.stdout) {
    console.log(result.stdout.trim());
  }
  if (result.stderr) {
    console.log(result.stderr.trim());
  }
  if (result.status && exitCode === 0) {
    exitCode = result.status;
  }
}

process.exit(exitCode);
