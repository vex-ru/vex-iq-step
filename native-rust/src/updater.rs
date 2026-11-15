use eframe::egui;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const GITHUB_RELEASES_API: &str = "https://api.github.com/repos/vex-ru/vex-iq-step/releases?per_page=15";

#[cfg(target_os = "windows")]
const EXPECTED_ASSET_NAME: &str = "VEX-IQ-Viewer-Windows-x64-Portable.zip";
#[cfg(not(target_os = "windows"))]
const EXPECTED_ASSET_NAME: &str = "VEX-IQ-Viewer-Linux-x64-Portable.tar.gz";

#[derive(Clone, Debug)]
pub struct ReleaseUpdateInfo {
    pub version: String,
    pub tag_name: String,
    pub download_url: String,
}

#[derive(Clone, Debug)]
pub enum UpdateState {
    Idle,
    Checking,
    UpToDate,
    Available(ReleaseUpdateInfo),
    Downloading { percent: u8, status: String },
    Restarting,
    Error(String),
}

#[derive(Clone)]
pub struct UpdateManager {
    pub state: Arc<Mutex<UpdateState>>,
}

impl Default for UpdateManager {
    fn default() -> Self {
        Self {
            state: Arc::new(Mutex::new(UpdateState::Idle)),
        }
    }
}

/// Remove leftover `.old.exe` created during self-replacement on Windows.
pub fn cleanup_old_binary_on_startup() {
    #[cfg(target_os = "windows")]
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let old_exe = dir.join("vex-iq-viewer.old.exe");
            if old_exe.exists() {
                let _ = fs::remove_file(old_exe);
            }
            let new_exe = dir.join("vex-iq-viewer.new.exe");
            if new_exe.exists() {
                let _ = fs::remove_file(new_exe);
            }
        }
    }
}

pub fn parse_semver(raw: &str) -> Option<(u64, u64, u64)> {
    let clean = raw.trim().trim_start_matches(|c| c == 'v' || c == 'V');
    let core = clean.split('-').next()?.split('+').next()?;
    let mut parts = core.split('.');
    let major = parts.next()?.parse::<u64>().ok()?;
    let minor = parts.next().unwrap_or("0").parse::<u64>().ok()?;
    let patch = parts.next().unwrap_or("0").parse::<u64>().ok()?;
    Some((major, minor, patch))
}

impl UpdateManager {
    pub fn snapshot(&self) -> UpdateState {
        self.state
            .lock()
            .map(|s| s.clone())
            .unwrap_or(UpdateState::Idle)
    }

    pub fn check_for_updates(&self, ctx: egui::Context, silent_if_uptodate: bool) {
        {
            let Ok(mut st) = self.state.lock() else {
                return;
            };
            if matches!(
                *st,
                UpdateState::Checking | UpdateState::Downloading { .. } | UpdateState::Restarting
            ) {
                return;
            }
            *st = UpdateState::Checking;
        }
        ctx.request_repaint();

        let state = Arc::clone(&self.state);
        std::thread::spawn(move || {
            let res: Result<Option<ReleaseUpdateInfo>, String> = (|| {
                let agent = crate::storage::build_http_agent()?;
                let resp = agent
                    .get(GITHUB_RELEASES_API)
                    .set("User-Agent", "vex-iq-viewer")
                    .set("Accept", "application/vnd.github+json")
                    .call()
                    .map_err(|e| format!("Не удалось проверить обновления: {e}"))?;

                let body = resp
                    .into_string()
                    .map_err(|e| format!("Ошибка чтения ответа GitHub: {e}"))?;
                let releases: Vec<serde_json::Value> = serde_json::from_str(&body)
                    .map_err(|e| format!("Некорректный JSON от GitHub: {e}"))?;

                let local_ver = parse_semver(CURRENT_VERSION).unwrap_or((1, 0, 0));
                let mut best: Option<((u64, u64, u64), ReleaseUpdateInfo)> = None;

                for rel in &releases {
                    if rel["draft"].as_bool() == Some(true) || rel["prerelease"].as_bool() == Some(true) {
                        continue;
                    }
                    let Some(tag_name) = rel["tag_name"].as_str() else {
                        continue;
                    };
                    let Some(remote_ver) = parse_semver(tag_name) else {
                        // Skip non-version releases such as the static 'zip' models release
                        continue;
                    };
                    if remote_ver <= local_ver {
                        continue;
                    }
                    let Some(assets) = rel["assets"].as_array() else {
                        continue;
                    };
                    let Some(download_url) = assets
                        .iter()
                        .find(|a| a["name"].as_str() == Some(EXPECTED_ASSET_NAME))
                        .and_then(|a| a["browser_download_url"].as_str())
                    else {
                        continue;
                    };

                    if best.as_ref().map(|(v, _)| remote_ver > *v).unwrap_or(true) {
                        best = Some((
                            remote_ver,
                            ReleaseUpdateInfo {
                                version: format!("{}.{}.{}", remote_ver.0, remote_ver.1, remote_ver.2),
                                tag_name: tag_name.to_string(),
                                download_url: download_url.to_string(),
                            },
                        ));
                    }
                }

                Ok(best.map(|(_, info)| info))
            })();

            if let Ok(mut st) = state.lock() {
                match res {
                    Ok(Some(info)) => *st = UpdateState::Available(info),
                    Ok(None) => {
                        *st = if silent_if_uptodate {
                            UpdateState::Idle
                        } else {
                            UpdateState::UpToDate
                        };
                    }
                    Err(err) => {
                        *st = if silent_if_uptodate {
                            UpdateState::Idle
                        } else {
                            UpdateState::Error(err)
                        };
                    }
                }
            }
            ctx.request_repaint();
        });
    }

    pub fn install_update(&self, info: ReleaseUpdateInfo, ctx: egui::Context) {
        {
            let Ok(mut st) = self.state.lock() else {
                return;
            };
            if matches!(*st, UpdateState::Downloading { .. } | UpdateState::Restarting) {
                return;
            }
            *st = UpdateState::Downloading {
                percent: 2,
                status: format!("Скачивание v{}...", info.version),
            };
        }
        ctx.request_repaint();

        let state = Arc::clone(&self.state);
        std::thread::spawn(move || {
            let res: Result<(), String> = (|| {
                let agent = crate::storage::build_http_agent()?;
                let resp = agent
                    .get(&info.download_url)
                    .set("User-Agent", "vex-iq-viewer")
                    .call()
                    .map_err(|e| format!("Ошибка загрузки обновления: {e}"))?;

                let total_bytes: usize = resp
                    .header("Content-Length")
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);

                let mut reader = resp.into_reader();
                let mut archive_buf = if total_bytes > 0 {
                    Vec::with_capacity(total_bytes)
                } else {
                    Vec::new()
                };

                let mut chunk = [0u8; 64 * 1024];
                let mut downloaded = 0usize;

                loop {
                    let n = reader
                        .read(&mut chunk)
                        .map_err(|e| format!("Сбой загрузки: {e}"))?;
                    if n == 0 {
                        break;
                    }
                    archive_buf.extend_from_slice(&chunk[..n]);
                    downloaded += n;

                    let pct = if total_bytes > 0 {
                        (5 + (downloaded * 75) / total_bytes).min(80) as u8
                    } else {
                        40
                    };
                    if let Ok(mut st) = state.lock() {
                        *st = UpdateState::Downloading {
                            percent: pct,
                            status: format!("Загрузка v{}: {}%", info.version, pct),
                        };
                    }
                    ctx.request_repaint();
                }

                if let Ok(mut st) = state.lock() {
                    *st = UpdateState::Downloading {
                        percent: 85,
                        status: "Распаковка новой версии...".to_string(),
                    };
                }
                ctx.request_repaint();

                let bin_bytes = extract_binary_from_archive(&archive_buf)?;

                if let Ok(mut st) = state.lock() {
                    *st = UpdateState::Downloading {
                        percent: 95,
                        status: "Замена исполняемого файла...".to_string(),
                    };
                }
                ctx.request_repaint();

                replace_current_binary_and_relaunch(&bin_bytes)?;
                Ok(())
            })();

            if let Ok(mut st) = state.lock() {
                match res {
                    Ok(()) => *st = UpdateState::Restarting,
                    Err(err) => *st = UpdateState::Error(err),
                }
            }
            ctx.request_repaint();
        });
    }
}

#[cfg(target_os = "windows")]
fn extract_binary_from_archive(archive_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let cursor = std::io::Cursor::new(archive_bytes);
    let mut zip = zip::ZipArchive::new(cursor).map_err(|e| format!("Ошибка ZIP: {e}"))?;

    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_lowercase();
        if name.ends_with("vex-iq-viewer.exe") {
            let mut out = Vec::with_capacity(entry.size() as usize);
            entry.read_to_end(&mut out).map_err(|e| e.to_string())?;
            return Ok(out);
        }
    }
    Err("В архиве обновления не найден vex-iq-viewer.exe".to_string())
}

#[cfg(not(target_os = "windows"))]
fn extract_binary_from_archive(archive_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let cursor = std::io::Cursor::new(archive_bytes);
    let gz = flate2::read::GzDecoder::new(cursor);
    let mut archive = tar::Archive::new(gz);

    let entries = archive
        .entries()
        .map_err(|e| format!("Ошибка tar.gz: {e}"))?;
    for entry_res in entries {
        let mut entry = entry_res.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?;
        let is_target = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n == "vex-iq-viewer")
            .unwrap_or(false);
        if is_target && entry.header().entry_type().is_file() {
            let mut out = Vec::new();
            entry.read_to_end(&mut out).map_err(|e| e.to_string())?;
            return Ok(out);
        }
    }
    Err("В архиве обновления не найден бинарник vex-iq-viewer".to_string())
}

fn replace_current_binary_and_relaunch(new_binary: &[u8]) -> Result<(), String> {
    let current_exe: PathBuf = std::env::current_exe()
        .map_err(|e| format!("Не удалось определить путь к программе: {e}"))?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| "Не удалось определить папку программы".to_string())?;

    #[cfg(target_os = "windows")]
    {
        let new_exe = exe_dir.join("vex-iq-viewer.new.exe");
        let old_exe = exe_dir.join("vex-iq-viewer.old.exe");

        fs::write(&new_exe, new_binary).map_err(|e| {
            format!(
                "Нет прав на запись в {} ({e}). Переустановите программу через install.ps1.",
                exe_dir.display()
            )
        })?;

        if old_exe.exists() {
            let _ = fs::remove_file(&old_exe);
        }

        // Windows allows renaming the currently running executable, then putting the new one in its place.
        fs::rename(&current_exe, &old_exe).map_err(|e| {
            let _ = fs::remove_file(&new_exe);
            format!("Не удалось заменить запущенный exe: {e}")
        })?;

        if let Err(e) = fs::rename(&new_exe, &current_exe) {
            let _ = fs::rename(&old_exe, &current_exe);
            return Err(format!("Ошибка финализации обновления: {e}"));
        }

        std::process::Command::new(&current_exe)
            .spawn()
            .map_err(|e| format!("Не удалось перезапустить программу: {e}"))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::fs::PermissionsExt;

        let pid = std::process::id();
        let new_bin = exe_dir.join(format!(".vex-iq-viewer.new.{pid}"));
        fs::write(&new_bin, new_binary).map_err(|e| {
            format!(
                "Нет прав на запись в {} ({e}). Установите через install.sh в ~/.local.",
                exe_dir.display()
            )
        })?;

        let mut perms = fs::metadata(&new_bin)
            .map_err(|e| e.to_string())?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&new_bin, perms).map_err(|e| e.to_string())?;

        fs::rename(&new_bin, &current_exe).map_err(|e| {
            let _ = fs::remove_file(&new_bin);
            format!("Не удалось заменить бинарник: {e}")
        })?;

        std::process::Command::new(&current_exe)
            .spawn()
            .map_err(|e| format!("Не удалось перезапустить программу: {e}"))?;
        Ok(())
    }
}
