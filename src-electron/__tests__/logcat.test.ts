import { describe, it, expect } from "vitest";
import { parseLogcatLine } from "../logcat";

describe("parseLogcatLine", () => {
  it("parses threadtime format", () => {
    const r = parseLogcatLine(
      "01-15 12:34:56.789  1234  5678 D MyTag   : hello",
    );
    expect(r).not.toBeNull();
    expect(r!.timestamp).toBe("01-15 12:34:56.789");
    expect(r!.pid).toBe("1234");
    expect(r!.tid).toBe("5678");
    expect(r!.level).toBe("D");
    expect(r!.tag).toBe("MyTag");
    expect(r!.message).toBe("hello");
  });

  it("parses error level", () => {
    const r = parseLogcatLine(
      "12-25 08:00:00.000  9999    42 E SomeTag : error msg",
    );
    expect(r).not.toBeNull();
    expect(r!.level).toBe("E");
    expect(r!.tag).toBe("SomeTag");
    expect(r!.message).toBe("error msg");
  });

  it("parses message with spaces", () => {
    const r = parseLogcatLine(
      "03-10 14:22:33.456  1000  2000 I ActivityManager: Start proc 1234:com.example/u0a12 for activity",
    );
    expect(r).not.toBeNull();
    expect(r!.tag).toBe("ActivityManager");
    expect(r!.message).toContain("Start proc");
  });

  it("rejects non-logcat lines", () => {
    expect(parseLogcatLine("--------- beginning of main")).toBeNull();
    expect(parseLogcatLine("")).toBeNull();
    expect(parseLogcatLine("not a logcat line")).toBeNull();
  });
});
