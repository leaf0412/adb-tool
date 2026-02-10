/// Translate ADB install error codes to Chinese messages with suggestions.
///
/// Returns (chinese_message, suggestion, auto_fix_action).
pub fn translate_error(error_code: &str) -> (String, String, Option<String>) {
    match error_code {
        "INSTALL_FAILED_UPDATE_INCOMPATIBLE" => (
            "签名冲突：已安装的版本与新包签名不同".to_string(),
            "需要先卸载旧版本再安装新版本".to_string(),
            Some("uninstall_reinstall".to_string()),
        ),
        "INSTALL_FAILED_VERSION_DOWNGRADE" => (
            "版本降级：新包版本号低于已安装版本".to_string(),
            "可以强制降级安装（会覆盖现有数据）".to_string(),
            Some("force_downgrade".to_string()),
        ),
        "INSTALL_FAILED_INSUFFICIENT_STORAGE" => (
            "存储空间不足".to_string(),
            "请清理设备存储空间后重试".to_string(),
            None,
        ),
        "INSTALL_FAILED_ALREADY_EXISTS" => (
            "应用已存在".to_string(),
            "可以覆盖安装（替换现有版本）".to_string(),
            Some("replace_install".to_string()),
        ),
        "INSTALL_FAILED_INVALID_APK" => (
            "APK 文件损坏或格式无效".to_string(),
            "请检查 APK 文件是否完整，尝试重新下载".to_string(),
            None,
        ),
        "INSTALL_FAILED_NO_MATCHING_ABIS" => (
            "CPU 架构不兼容".to_string(),
            "该 APK 不支持当前设备的 CPU 架构，请使用对应架构的安装包".to_string(),
            None,
        ),
        "INSTALL_FAILED_OLDER_SDK" => (
            "系统版本过低".to_string(),
            "该应用要求更高的 Android 系统版本".to_string(),
            None,
        ),
        "INSTALL_FAILED_DUPLICATE_PERMISSION" => (
            "权限冲突".to_string(),
            "该应用声明的权限与设备上已安装的其他应用冲突".to_string(),
            None,
        ),
        "INSTALL_FAILED_TEST_ONLY" => (
            "仅测试包".to_string(),
            "该 APK 标记为仅供测试，可以强制安装".to_string(),
            Some("force_test_install".to_string()),
        ),
        "INSTALL_PARSE_FAILED_NO_CERTIFICATES" => (
            "APK 未签名".to_string(),
            "该 APK 缺少有效签名，请使用已签名的安装包".to_string(),
            None,
        ),
        "INSTALL_FAILED_VERIFICATION_FAILURE" => (
            "安装验证失败".to_string(),
            "设备安全策略阻止了安装，请检查设备安全设置".to_string(),
            None,
        ),
        "INSTALL_FAILED_USER_RESTRICTED" => (
            "用户受限".to_string(),
            "当前用户没有安装应用的权限，请检查设备管理设置".to_string(),
            None,
        ),
        _ => (
            format!("安装失败：{}", error_code),
            "请查看错误码获取更多信息".to_string(),
            None,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_known_error_code() {
        let (msg, _suggestion, auto_fix) = translate_error("INSTALL_FAILED_UPDATE_INCOMPATIBLE");
        assert!(msg.contains("签名冲突"));
        assert_eq!(auto_fix, Some("uninstall_reinstall".to_string()));
    }

    #[test]
    fn test_unknown_error_code() {
        let (msg, _suggestion, auto_fix) = translate_error("UNKNOWN_ERROR");
        assert!(msg.contains("UNKNOWN_ERROR"));
        assert_eq!(auto_fix, None);
    }
}
