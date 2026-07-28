import { pathToFileURL } from "node:url";
import { run } from "graphile-worker";
import { shopollTaskList } from "./services/runtime/jobs.server";

export async function startWorker() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to run Shopoll workers");
  return run({
    connectionString,
    concurrency: Math.max(1, Number(process.env.WORKER_CONCURRENCY || 4)),
    taskList: shopollTaskList,
    crontab: [
      "* * * * * shopoll_dispatch_pending",
      "5 * * * * shopoll_schedule_weekly_reports",
      "20 3 * * * shopoll_purge_all_retained_data",
    ].join("\n"),
  });
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const runner = await startWorker();
  await runner.promise;
}
