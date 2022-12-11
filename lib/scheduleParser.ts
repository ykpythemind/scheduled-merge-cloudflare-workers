import { parseISO } from "date-fns";

type MergeScheduleConfig = {
  willMergeAtUtc: string; // utc
  willMergeAtOriginal: string;
};

export function parseSchedule(
  pullRequestDescription: string
): MergeScheduleConfig | null {
  const lines = pullRequestDescription.split(/\r\n|\n/);

  let mergeSchedule: string | null = null;
  let mergeScheduleOriginal = "";

  lines.forEach((line) => {
    if (line.startsWith(magicComment)) {
      let base = line.replace(magicComment, "").trim();

      // toISOStringは常に0 UTCオフセットになる
      mergeScheduleOriginal = base;
      mergeSchedule = parseISO(base).toISOString();
    }
  });

  return mergeSchedule
    ? {
        willMergeAtUtc: mergeSchedule,
        willMergeAtOriginal: mergeScheduleOriginal,
      }
    : null;
}

const magicComment = "/merge-schedule";
