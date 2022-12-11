import { parseISO } from "date-fns";

type MergeScheduleConfig = {
  willMergeAtUtc: string; // utc
};

export function parseSchedule(
  pullRequestDescription: string
): MergeScheduleConfig | null {
  const lines = pullRequestDescription.split(/\r\n|\n/);

  let mergeSchedule: string | null = null;

  lines.forEach((line) => {
    if (line.startsWith(magicComment)) {
      let base = line.replace(magicComment, "").trim();

      // toISOStringは常に0 UTCオフセットになる
      mergeSchedule = parseISO(base).toISOString();
    }
  });

  return mergeSchedule ? { willMergeAtUtc: mergeSchedule } : null;
}

const magicComment = "/merge-schedule";
