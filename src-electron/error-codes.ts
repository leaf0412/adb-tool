export interface ErrorTranslation {
  messageCn: string;
  suggestion: string;
  autoFix: string | null;
}

const ERROR_MAP: Record<string, ErrorTranslation> = {
  INSTALL_FAILED_UPDATE_INCOMPATIBLE: {
    messageCn: "签名冲突：已安装的版本与新包签名不同",
    suggestion: "需要先卸载旧版本再安装新版本",
    autoFix: "uninstall_reinstall",
  },
  INSTALL_FAILED_VERSION_DOWNGRADE: {
    messageCn: "版本降级：新包版本号低于已安装版本",
    suggestion: "可以强制降级安装（会覆盖现有数据）",
    autoFix: "force_downgrade",
  },
  INSTALL_FAILED_INSUFFICIENT_STORAGE: {
    messageCn: "存储空间不足",
    suggestion: "请清理设备存储空间后重试",
    autoFix: null,
  },
  INSTALL_FAILED_ALREADY_EXISTS: {
    messageCn: "应用已存在",
    suggestion: "可以覆盖安装（替换现有版本）",
    autoFix: "replace_install",
  },
  INSTALL_FAILED_INVALID_APK: {
    messageCn: "APK 文件损坏或格式无效",
    suggestion: "请检查 APK 文件是否完整，尝试重新下载",
    autoFix: null,
  },
  INSTALL_FAILED_NO_MATCHING_ABIS: {
    messageCn: "CPU 架构不兼容",
    suggestion: "该 APK 不支持当前设备的 CPU 架构，请使用对应架构的安装包",
    autoFix: null,
  },
  INSTALL_FAILED_OLDER_SDK: {
    messageCn: "系统版本过低",
    suggestion: "该应用要求更高的 Android 系统版本",
    autoFix: null,
  },
  INSTALL_FAILED_DUPLICATE_PERMISSION: {
    messageCn: "权限冲突",
    suggestion: "该应用声明的权限与设备上已安装的其他应用冲突",
    autoFix: null,
  },
  INSTALL_FAILED_TEST_ONLY: {
    messageCn: "仅测试包",
    suggestion: "该 APK 标记为仅供测试，可以强制安装",
    autoFix: "force_test_install",
  },
  INSTALL_PARSE_FAILED_NO_CERTIFICATES: {
    messageCn: "APK 未签名",
    suggestion: "该 APK 缺少有效签名，请使用已签名的安装包",
    autoFix: null,
  },
  INSTALL_FAILED_VERIFICATION_FAILURE: {
    messageCn: "安装验证失败",
    suggestion: "设备安全策略阻止了安装，请检查设备安全设置",
    autoFix: null,
  },
  INSTALL_FAILED_USER_RESTRICTED: {
    messageCn: "用户受限",
    suggestion: "当前用户没有安装应用的权限，请检查设备管理设置",
    autoFix: null,
  },
};

export function translateError(errorCode: string): ErrorTranslation {
  const entry = ERROR_MAP[errorCode];
  if (entry) return entry;
  return {
    messageCn: `安装失败：${errorCode}`,
    suggestion: "请查看错误码获取更多信息",
    autoFix: null,
  };
}
