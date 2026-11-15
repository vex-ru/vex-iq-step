use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug)]
pub struct DownloadProgress {
    pub is_active: Arc<AtomicBool>,
    pub percent: Arc<AtomicU8>,
    pub done_items: Arc<AtomicUsize>,
    pub total_items: Arc<AtomicUsize>,
    pub status_text: Arc<Mutex<String>>,
    pub error_text: Arc<Mutex<Option<String>>>,
}

impl Default for DownloadProgress {
    fn default() -> Self {
        Self {
            is_active: Arc::new(AtomicBool::new(false)),
            percent: Arc::new(AtomicU8::new(0)),
            done_items: Arc::new(AtomicUsize::new(0)),
            total_items: Arc::new(AtomicUsize::new(0)),
            status_text: Arc::new(Mutex::new(String::new())),
            error_text: Arc::new(Mutex::new(None)),
        }
    }
}

impl DownloadProgress {
    pub fn set_status(&self, msg: impl Into<String>, pct: u8) {
        if let Ok(mut s) = self.status_text.lock() {
            *s = msg.into();
        }
        self.percent.store(pct, Ordering::Relaxed);
    }

    pub fn set_error(&self, err: impl Into<String>) {
        if let Ok(mut e) = self.error_text.lock() {
            *e = Some(err.into());
        }
        self.is_active.store(false, Ordering::Relaxed);
    }
}

pub struct ModelStorage {
    pub cache_dir: PathBuf,
    /// Map of lowercase filename -> absolute path on disk (could be in cache_dir OR user's stl/ folder)
    pub indexed_files: HashMap<String, PathBuf>,
    pub total_cached_bytes: u64,
}

impl ModelStorage {
    pub fn new() -> Self {
        // Prefer portable `./vex_cache` next to executable if writable, otherwise OS cache dir
        let portable_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("vex_cache")));

        let cache_dir = if let Some(dir) = portable_dir {
            if fs::create_dir_all(&dir).is_ok() {
                dir
            } else {
                fallback_os_cache_dir()
            }
        } else {
            fallback_os_cache_dir()
        };

        let _ = fs::create_dir_all(&cache_dir);

        let mut storage = Self {
            cache_dir,
            indexed_files: HashMap::new(),
            total_cached_bytes: 0,
        };

        // Auto-detect adjacent `stl/` folder next to executable or CWD for instant zero-copy loading!
        if let Ok(cwd) = std::env::current_dir() {
            let local_stl = cwd.join("stl");
            if local_stl.is_dir() {
                storage.scan_directory(&local_stl);
            }
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                let exe_stl = dir.join("stl");
                if exe_stl.is_dir() {
                    storage.scan_directory(&exe_stl);
                }
            }
        }

        storage.rescan_cache();
        storage
    }

    pub fn rescan_cache(&mut self) {
        let dir = self.cache_dir.clone();
        self.total_cached_bytes = 0;
        self.scan_directory_internal(&dir, true);
    }

    pub fn scan_directory(&mut self, dir: &Path) -> usize {
        self.scan_directory_internal(dir, false)
    }

    fn scan_directory_internal(&mut self, dir: &Path, count_bytes: bool) -> usize {
        let mut added = 0;
        let Ok(entries) = fs::read_dir(dir) else {
            return 0;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                added += self.scan_directory_internal(&path, count_bytes);
            } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let lower_ext = ext.to_lowercase();
                if lower_ext == "stl" || lower_ext == "3mf" {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if count_bytes {
                            if let Ok(meta) = entry.metadata() {
                                self.total_cached_bytes += meta.len();
                            }
                        }
                        self.indexed_files.insert(name.to_lowercase(), path);
                        added += 1;
                    }
                }
            }
        }
        added
    }

    pub fn has_model(&self, filename: &str) -> bool {
        self.indexed_files.contains_key(&filename.to_lowercase())
    }

    pub fn read_model_bytes(&self, filename: &str) -> Option<Vec<u8>> {
        let path = self.indexed_files.get(&filename.to_lowercase())?;
        fs::read(path).ok()
    }

    pub fn clear_cache(&mut self) -> Result<(), String> {
        if self.cache_dir.exists() {
            fs::remove_dir_all(&self.cache_dir).map_err(|e| e.to_string())?;
            fs::create_dir_all(&self.cache_dir).map_err(|e| e.to_string())?;
        }
        self.indexed_files.clear();
        self.total_cached_bytes = 0;
        Ok(())
    }
}

fn fallback_os_cache_dir() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("vex-iq-3d-viewer")
}

/// Extract STL/3MF files from raw ZIP bytes straight into `cache_dir`.
pub fn extract_zip_bytes_to_cache(
    zip_bytes: &[u8],
    cache_dir: &Path,
    progress: &DownloadProgress,
) -> Result<usize, String> {
    progress.set_status("Открытие ZIP архива...", 82);
    let cursor = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("Ошибка ZIP: {e}"))?;

    let total = archive.len();
    progress.total_items.store(total, Ordering::Relaxed);
    let mut extracted = 0usize;

    for i in 0..total {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        if file.is_dir() {
            continue;
        }

        let name = file.name().to_string();
        let lower = name.to_lowercase();
        if !lower.ends_with(".stl") && !lower.ends_with(".3mf") {
            continue;
        }

        let file_only = Path::new(&name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("part.stl");

        let dest_path = cache_dir.join(file_only);
        let mut buf = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        fs::write(&dest_path, &buf).map_err(|e| e.to_string())?;

        extracted += 1;
        progress.done_items.store(extracted, Ordering::Relaxed);

        if extracted % 10 == 0 || i + 1 == total {
            let pct = 82 + (((i + 1) * 18) / total.max(1)) as u8;
            progress.set_status(format!("Распаковано моделей: {extracted}"), pct.min(99));
        }
    }

    progress.set_status(format!("Готово! Сохранено {extracted} моделей в кэш."), 100);
    Ok(extracted)
}

/// Builds an HTTP/HTTPS client with an explicit TLS backend (Windows SChannel / Unix rustls).
pub fn build_http_agent() -> Result<ureq::Agent, String> {
    #[cfg(target_os = "windows")]
    {
        let connector = native_tls::TlsConnector::new()
            .map_err(|e| format!("Ошибка инициализации TLS: {e}"))?;
        Ok(ureq::AgentBuilder::new()
            .tls_connector(std::sync::Arc::new(connector))
            .build())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(ureq::AgentBuilder::new().build())
    }
}

/// Download a ZIP archive from a URL (e.g. GitHub Releases) with live progress and extract it.
pub fn download_and_extract_zip(
    url: String,
    cache_dir: PathBuf,
    progress: DownloadProgress,
    ctx: eframe::egui::Context,
) {
    progress.is_active.store(true, Ordering::Relaxed);
    if let Ok(mut e) = progress.error_text.lock() {
        *e = None;
    }
    progress.set_status("Подключение к GitHub Releases...", 3);
    ctx.request_repaint();

    std::thread::spawn(move || {
        let result: Result<usize, String> = (|| {
            let agent = build_http_agent()?;
            let resp = agent
                .get(&url)
                .set("User-Agent", "vex-iq-viewer")
                .call()
                .map_err(|e| format!("Ошибка сети: {e}"))?;

            let total_bytes: usize = resp
                .header("Content-Length")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);

            let mut reader = resp.into_reader();
            let mut zip_buf = if total_bytes > 0 {
                Vec::with_capacity(total_bytes)
            } else {
                Vec::new()
            };

            let mut chunk = [0u8; 64 * 1024];
            let mut downloaded = 0usize;

            loop {
                let n = reader.read(&mut chunk).map_err(|e| format!("Сбой чтения: {e}"))?;
                if n == 0 {
                    break;
                }
                zip_buf.extend_from_slice(&chunk[..n]);
                downloaded += n;

                if total_bytes > 0 {
                    let pct = (5 + (downloaded * 75) / total_bytes).min(80) as u8;
                    let mb_done = downloaded as f64 / (1024.0 * 1024.0);
                    let mb_tot = total_bytes as f64 / (1024.0 * 1024.0);
                    progress.set_status(
                        format!("Скачивание ZIP: {mb_done:.1} / {mb_tot:.1} МБ"),
                        pct,
                    );
                } else {
                    let mb_done = downloaded as f64 / (1024.0 * 1024.0);
                    progress.set_status(format!("Скачано: {mb_done:.1} МБ"), 40);
                }
                ctx.request_repaint();
            }

            let count = extract_zip_bytes_to_cache(&zip_buf, &cache_dir, &progress)?;
            Ok(count)
        })();

        match result {
            Ok(_) => {
                progress.is_active.store(false, Ordering::Relaxed);
            }
            Err(err) => {
                progress.set_error(err);
            }
        }
        ctx.request_repaint();
    });
}
