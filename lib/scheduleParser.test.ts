import { describe, expect, test } from "@jest/globals";
import { parseSchedule } from "./scheduleParser";

describe("parse", () => {
  test("no config", () => {
    expect(
      parseSchedule(`
aaaa
/merge-s
aaaaaa
    `)
    ).toBe(null);
  });

  test("parsable", () => {
    expect(
      parseSchedule(`
aaaa
/merge-schedule 2021-03-01T11:00:00+09:00
aaaaaa
    `)
    ).toEqual({ willMergeAt: "2021-03-01T02:00:00.000Z" });
  });

  test("invalid", () => {
    expect(() =>
      parseSchedule(`
aaaa
/merge-schedule 2021--01T11:00:00+09:00
aaaaaa
    `)
    ).toThrowError(RangeError);
  });
});
