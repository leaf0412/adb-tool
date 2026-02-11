use std::io::Read;

/// Extract the package name from an APK file by parsing AndroidManifest.xml binary XML.
pub fn extract_package_name(apk_path: &str) -> Result<String, String> {
    let file =
        std::fs::File::open(apk_path).map_err(|e| format!("无法打开 APK: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("无效的 APK 文件: {}", e))?;
    let mut manifest = archive
        .by_name("AndroidManifest.xml")
        .map_err(|_| "APK 中未找到 AndroidManifest.xml".to_string())?;
    let mut buf = Vec::new();
    manifest
        .read_to_end(&mut buf)
        .map_err(|e| format!("读取 Manifest 失败: {}", e))?;
    parse_package_name(&buf)
}

// ---------------------------------------------------------------------------
// Minimal Android binary XML parser — only extracts the `package` attribute
// from the `<manifest>` element.
// ---------------------------------------------------------------------------

fn read_u16(d: &[u8], o: usize) -> u16 {
    u16::from_le_bytes([d[o], d[o + 1]])
}

fn read_u32(d: &[u8], o: usize) -> u32 {
    u32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
}

/// Parse the string pool chunk and return all strings.
fn parse_string_pool(data: &[u8], cs: usize) -> Result<Vec<String>, String> {
    let string_count = read_u32(data, cs + 8) as usize;
    let flags = read_u32(data, cs + 16);
    let strings_start = read_u32(data, cs + 20) as usize;
    let is_utf8 = (flags & 0x100) != 0;

    let offsets_start = cs + 28;
    let abs_strings_start = cs + strings_start;

    let mut strings = Vec::with_capacity(string_count);
    for i in 0..string_count {
        let offset = abs_strings_start + read_u32(data, offsets_start + i * 4) as usize;
        if offset >= data.len() {
            strings.push(String::new());
            continue;
        }

        if is_utf8 {
            let mut pos = offset;
            // char count (1-2 bytes)
            if data[pos] & 0x80 != 0 {
                pos += 2;
            } else {
                pos += 1;
            }
            // byte count (1-2 bytes)
            let byte_count = if data[pos] & 0x80 != 0 {
                let hi = (data[pos] & 0x7F) as usize;
                let lo = data[pos + 1] as usize;
                pos += 2;
                (hi << 8) | lo
            } else {
                let c = data[pos] as usize;
                pos += 1;
                c
            };
            let end = (pos + byte_count).min(data.len());
            strings.push(String::from_utf8_lossy(&data[pos..end]).to_string());
        } else {
            let char_count = read_u16(data, offset) as usize;
            let start = offset + 2;
            let mut u16s = Vec::with_capacity(char_count);
            for j in 0..char_count {
                let idx = start + j * 2;
                if idx + 1 < data.len() {
                    u16s.push(read_u16(data, idx));
                }
            }
            strings.push(String::from_utf16_lossy(&u16s));
        }
    }
    Ok(strings)
}

/// Walk the binary XML to find `<manifest package="...">` and return the value.
fn parse_package_name(data: &[u8]) -> Result<String, String> {
    if data.len() < 8 || read_u32(data, 0) != 0x0008_0003 {
        return Err("非二进制 XML 格式".into());
    }

    // String pool is the first chunk (right after the 8-byte file header)
    if read_u16(data, 8) != 0x0001 {
        return Err("未找到字符串池".into());
    }
    let sp_chunk_size = read_u32(data, 12) as usize;
    let strings = parse_string_pool(data, 8)?;

    // Scan remaining chunks for the first START_ELEMENT (type 0x0102)
    let mut pos = 8 + sp_chunk_size;
    while pos + 8 <= data.len() {
        let chunk_type = read_u16(data, pos);
        let chunk_size = read_u32(data, pos + 4) as usize;
        if chunk_size == 0 {
            break;
        }

        if chunk_type == 0x0102 && pos + 36 <= data.len() {
            let name_idx = read_u32(data, pos + 20) as usize;
            if name_idx < strings.len() && strings[name_idx] == "manifest" {
                let attr_count = read_u16(data, pos + 28) as usize;
                for a in 0..attr_count {
                    let ao = pos + 36 + a * 20;
                    if ao + 20 > data.len() {
                        break;
                    }
                    let attr_name_idx = read_u32(data, ao + 4) as usize;
                    if attr_name_idx < strings.len() && strings[attr_name_idx] == "package" {
                        // Try raw string value
                        let raw_val = read_u32(data, ao + 8) as usize;
                        if raw_val < strings.len() {
                            return Ok(strings[raw_val].clone());
                        }
                        // Fallback: typed value (dataType 3 = string)
                        if data[ao + 15] == 3 {
                            let typed_data = read_u32(data, ao + 16) as usize;
                            if typed_data < strings.len() {
                                return Ok(strings[typed_data].clone());
                            }
                        }
                    }
                }
                return Err("manifest 元素未找到 package 属性".into());
            }
        }
        pos += chunk_size;
    }
    Err("未找到 manifest 元素".into())
}
