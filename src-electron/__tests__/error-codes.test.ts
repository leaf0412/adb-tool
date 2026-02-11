import { describe, it, expect } from "vitest";
import { translateError } from "../error-codes";

describe("translateError", () => {
  it("translates INSTALL_FAILED_UPDATE_INCOMPATIBLE", () => {
    const r = translateError("INSTALL_FAILED_UPDATE_INCOMPATIBLE");
    expect(r.messageCn).toContain("签名冲突");
    expect(r.autoFix).toBe("uninstall_reinstall");
  });

  it("translates INSTALL_FAILED_VERSION_DOWNGRADE", () => {
    const r = translateError("INSTALL_FAILED_VERSION_DOWNGRADE");
    expect(r.messageCn).toContain("版本降级");
    expect(r.autoFix).toBe("force_downgrade");
  });

  it("translates INSTALL_FAILED_TEST_ONLY", () => {
    const r = translateError("INSTALL_FAILED_TEST_ONLY");
    expect(r.messageCn).toContain("仅测试包");
    expect(r.autoFix).toBe("force_test_install");
  });

  it("returns default for unknown code", () => {
    const r = translateError("UNKNOWN_XYZ");
    expect(r.messageCn).toContain("UNKNOWN_XYZ");
    expect(r.autoFix).toBeNull();
  });
});
