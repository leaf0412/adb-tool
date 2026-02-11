import { describe, it, expect } from "vitest";
import { extractErrorCode, parseDfOutput } from "../adb";

describe("extractErrorCode", () => {
  it("extracts simple error code", () => {
    const output =
      "Performing Streamed Install\nFailure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]";
    expect(extractErrorCode(output)).toBe(
      "INSTALL_FAILED_UPDATE_INCOMPATIBLE",
    );
  });

  it("extracts error code with detail", () => {
    const output = "Failure [INSTALL_FAILED_VERSION_DOWNGRADE: Package abc]";
    expect(extractErrorCode(output)).toBe("INSTALL_FAILED_VERSION_DOWNGRADE");
  });

  it("returns UNKNOWN_ERROR for no match", () => {
    expect(extractErrorCode("Success")).toBe("UNKNOWN_ERROR");
  });
});

describe("parseDfOutput", () => {
  it("parses df output", () => {
    const df =
      "Filesystem     1K-blocks    Used Available Use% Mounted on\n/dev/block/dm-0 52428800 31457280 20971520  60% /data\n";
    const [total, free] = parseDfOutput(df);
    expect(total).toBe(Math.floor(52428800 / 1024));
    expect(free).toBe(Math.floor(20971520 / 1024));
  });

  it("returns zeros for empty output", () => {
    const [total, free] = parseDfOutput("");
    expect(total).toBe(0);
    expect(free).toBe(0);
  });
});
