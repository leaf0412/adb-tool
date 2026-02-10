export interface AdbDevice {
  serial: string;
  state: string;
  model: string;
  product: string;
}

export interface DeviceDetail {
  serial: string;
  model: string;
  android_version: string;
  sdk_version: string;
  storage_total_mb: number;
  storage_free_mb: number;
}

export interface InstallResult {
  success: boolean;
  error_code: string | null;
  error_message_cn: string | null;
  suggestion: string | null;
  auto_fix: string | null;
  raw_output: string;
}

export interface InstalledApp {
  package_name: string;
  version_name: string;
  version_code: string;
  is_system: boolean;
}

export interface LogcatLine {
  timestamp: string;
  pid: string;
  tid: string;
  level: string;
  tag: string;
  message: string;
  raw: string;
}

export interface OpLogEntry {
  timestamp: string;
  op_type: string;
  device: string;
  detail: string;
  success: boolean;
  error_message: string | null;
  raw_output: string | null;
}
