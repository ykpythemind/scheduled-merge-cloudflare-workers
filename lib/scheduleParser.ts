import { parseISO } from "date-fns";

type MergeScheduleConfig = {
  willMergeAtUtc: string; // utc
  willMergeAtOriginal: string;
};

export function parseSchedule(
  pullRequestDescription: string
): MergeScheduleConfig | { error: string } | null {
  const lines = pullRequestDescription.split(/\r\n|\n/);

  let mergeSchedule: string | null = null;
  let mergeScheduleOriginal = "";
  let error: string | null = null;

  lines.forEach((line) => {
    if (line.startsWith(magicComment)) {
      let base = line.replace(magicComment, "").trim();

      // toISOStringは常に0 UTCオフセットになる
      mergeScheduleOriginal = base;
      try {
        mergeSchedule = parseISO(base).toISOString();
      } catch (e) {
        if (e instanceof Error) {
          error = e.message;
        } else {
          error = "something wrong";
        }

        return;
      }
    }
  });

  if (error) {
    return { error: `ParseError : ${error}` };
  }

  return mergeSchedule
    ? {
        willMergeAtUtc: mergeSchedule,
        willMergeAtOriginal: mergeScheduleOriginal,
      }
    : null;
}

const magicComment = "/merge-schedule";
