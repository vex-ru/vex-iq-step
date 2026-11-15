use crate::catalog::{load_embedded_categories, load_embedded_parts, VexCategory, VexPartItem};
use crate::gl_viewer::{Camera, CameraPreset, GlViewer, RenderParams};
use crate::procedural::generate_procedural_mesh;
use crate::stl_loader::{encode_binary_stl, parse_stl, MeshData};
use crate::storage::{
    download_and_extract_zip, extract_zip_bytes_to_cache, DownloadProgress, ModelStorage,
};
use crate::updater::{UpdateManager, UpdateState, CURRENT_VERSION};
use eframe::egui;
use eframe::egui_glow;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

const DEFAULT_ZIP_URL: &str =
    "https://github.com/vex-ru/vex-iq-step/releases/download/v1.0.0/vex-iq-models.zip";

struct ColorSwatch {
    name: &'static str,
    rgb: [f32; 3],
    egui_color: egui::Color32,
}

const VEX_COLORS: &[ColorSwatch] = &[
    ColorSwatch {
        name: "VEX Teal",
        rgb: [0.0, 0.64, 0.88],
        egui_color: egui::Color32::from_rgb(0, 163, 224),
    },
    ColorSwatch {
        name: "Dark Gray",
        rgb: [0.22, 0.27, 0.35],
        egui_color: egui::Color32::from_rgb(56, 69, 89),
    },
    ColorSwatch {
        name: "Competition Red",
        rgb: [0.88, 0.11, 0.28],
        egui_color: egui::Color32::from_rgb(225, 29, 72),
    },
    ColorSwatch {
        name: "Safety Orange",
        rgb: [0.97, 0.45, 0.08],
        egui_color: egui::Color32::from_rgb(249, 115, 22),
    },
    ColorSwatch {
        name: "Pure White",
        rgb: [0.95, 0.96, 0.98],
        egui_color: egui::Color32::from_rgb(242, 245, 250),
    },
    ColorSwatch {
        name: "Cobalt Blue",
        rgb: [0.15, 0.39, 0.92],
        egui_color: egui::Color32::from_rgb(37, 99, 235),
    },
    ColorSwatch {
        name: "Lime Green",
        rgb: [0.40, 0.64, 0.05],
        egui_color: egui::Color32::from_rgb(101, 163, 13),
    },
    ColorSwatch {
        name: "Cyber Yellow",
        rgb: [0.92, 0.70, 0.03],
        egui_color: egui::Color32::from_rgb(234, 179, 8),
    },
];

pub struct VexCadApp {
    categories: Vec<VexCategory>,
    parts: Vec<VexPartItem>,
    selected_idx: usize,
    storage: ModelStorage,
    gl_viewer: Arc<Mutex<GlViewer>>,

    // Active mesh state
    current_mesh: Option<MeshData>,
    mesh_from_disk: bool,
    pending_gl_upload: bool,
    z_up_to_y_up: bool,

    // Search & Filters
    search_query: String,
    selected_category: String,
    active_type_filter: String,
    only_favorites: bool,
    only_cached: bool,
    favorites: HashSet<String>,

    // 3D Viewport Settings
    camera: Camera,
    color_idx: usize,
    wireframe: bool,
    show_grid: bool,
    show_bbox: bool,
    auto_rotate: bool,
    rotation_y: f32,

    // Modals & Background Tasks
    show_data_modal: bool,
    zip_url: String,
    download_progress: DownloadProgress,
    was_downloading: bool,
    scroll_to_selected: bool,
    updater: UpdateManager,
    notified_update_tag: Option<String>,
    toast: Option<(String, std::time::Instant)>,
}

impl VexCadApp {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        install_cyrillic_fonts(&cc.egui_ctx);
        configure_dark_theme(&cc.egui_ctx);

        let gl = cc
            .gl
            .as_ref()
            .expect("Требуется поддержка OpenGL (eframe glow)");
        let gl_viewer = Arc::new(Mutex::new(GlViewer::new(gl)));

        let categories = load_embedded_categories();
        let parts = load_embedded_parts();
        let storage = ModelStorage::new();

        // Default part: 24 Tooth Gear or first item
        let selected_idx = parts
            .iter()
            .position(|p| p.sku == "228-2500-227")
            .unwrap_or(0);

        let mut favorites = HashSet::new();
        favorites.insert("228-2500-227".to_string());
        favorites.insert("228-2500-009".to_string());

        let show_data_modal = storage.indexed_files.is_empty();

        let mut app = Self {
            categories,
            parts,
            selected_idx,
            storage,
            gl_viewer,
            current_mesh: None,
            mesh_from_disk: false,
            pending_gl_upload: false,
            z_up_to_y_up: true,
            search_query: String::new(),
            selected_category: "ALL".to_string(),
            active_type_filter: "all".to_string(),
            only_favorites: false,
            only_cached: false,
            favorites,
            camera: Camera::default(),
            color_idx: 0,
            wireframe: false,
            show_grid: true,
            show_bbox: true,
            auto_rotate: false,
            rotation_y: 0.0,
            show_data_modal,
            zip_url: DEFAULT_ZIP_URL.to_string(),
            download_progress: DownloadProgress::default(),
            was_downloading: false,
            scroll_to_selected: true,
            updater: UpdateManager::default(),
            notified_update_tag: None,
            toast: None,
        };

        app.load_selected_part();
        app.updater.check_for_updates(cc.egui_ctx.clone(), true);
        app
    }

    fn set_toast(&mut self, msg: impl Into<String>) {
        self.toast = Some((msg.into(), std::time::Instant::now()));
    }

    fn load_selected_part(&mut self) {
        let Some(part) = self.parts.get(self.selected_idx).cloned() else {
            return;
        };

        self.rotation_y = 0.0;
        let mut loaded_from_disk = false;

        let mesh = if !part.is3mf {
            if let Some(bytes) = self.storage.read_model_bytes(&part.filename) {
                match parse_stl(&bytes, self.z_up_to_y_up) {
                    Ok(m) => {
                        loaded_from_disk = true;
                        m
                    }
                    Err(err) => {
                        self.set_toast(format!("Ошибка STL ({}): {err}", part.filename));
                        generate_procedural_mesh(&part)
                    }
                }
            } else {
                generate_procedural_mesh(&part)
            }
        } else {
            generate_procedural_mesh(&part)
        };

        self.camera.frame_mesh(&mesh);
        self.current_mesh = Some(mesh);
        self.mesh_from_disk = loaded_from_disk;
        self.pending_gl_upload = true;
    }

    fn export_current_stl(&mut self) {
        let Some(part) = self.parts.get(self.selected_idx).cloned() else {
            return;
        };

        let target_name = if part.is3mf {
            format!("{}.stl", part.name)
        } else {
            part.filename.clone()
        };

        if let Some(save_path) = rfd::FileDialog::new()
            .set_file_name(&target_name)
            .add_filter("STL 3D Model", &["stl"])
            .save_file()
        {
            let bytes = if !part.is3mf {
                if let Some(disk_bytes) = self.storage.read_model_bytes(&part.filename) {
                    disk_bytes
                } else if let Some(mesh) = &self.current_mesh {
                    encode_binary_stl(mesh, &format!("VEX IQ {}", part.sku))
                } else {
                    Vec::new()
                }
            } else if let Some(mesh) = &self.current_mesh {
                encode_binary_stl(mesh, &format!("VEX IQ {}", part.sku))
            } else {
                Vec::new()
            };

            match fs::write(&save_path, bytes) {
                Ok(_) => self.set_toast(format!("Сохранено: {}", save_path.display())),
                Err(e) => self.set_toast(format!("Ошибка записи файла: {e}")),
            }
        }
    }

    fn pick_local_folder(&mut self) {
        if let Some(folder) = rfd::FileDialog::new().pick_folder() {
            let count = self.storage.scan_directory(&folder);
            self.set_toast(format!(
                "Подключено {count} моделей из папки {}",
                folder.display()
            ));
            self.load_selected_part();
        }
    }

    fn pick_local_zip(&mut self) {
        if let Some(zip_path) = rfd::FileDialog::new()
            .add_filter("ZIP Archive", &["zip"])
            .pick_file()
        {
            self.extract_zip_file(&zip_path);
        }
    }

    fn extract_zip_file(&mut self, zip_path: &PathBuf) {
        match fs::read(zip_path) {
            Ok(bytes) => {
                match extract_zip_bytes_to_cache(
                    &bytes,
                    &self.storage.cache_dir,
                    &self.download_progress,
                ) {
                    Ok(count) => {
                        self.storage.rescan_cache();
                        self.set_toast(format!("Распаковано {count} моделей в кэш!"));
                        self.load_selected_part();
                    }
                    Err(e) => {
                        self.download_progress.set_error(e.clone());
                        self.set_toast(e);
                    }
                }
            }
            Err(e) => self.set_toast(format!("Не удалось прочитать ZIP: {e}")),
        }
    }

    fn handle_dropped_files(&mut self, ctx: &egui::Context) {
        let dropped = ctx.input(|i| i.raw.dropped_files.clone());
        if dropped.is_empty() {
            return;
        }

        let mut folder_or_stl_loaded = false;
        for file in dropped {
            if let Some(path) = file.path {
                if path.is_dir() {
                    let count = self.storage.scan_directory(&path);
                    self.set_toast(format!("Проиндексировано {count} моделей из папки"));
                    folder_or_stl_loaded = true;
                } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let low = ext.to_lowercase();
                    if low == "zip" {
                        self.extract_zip_file(&path);
                        folder_or_stl_loaded = true;
                    } else if low == "stl" {
                        if let Ok(bytes) = fs::read(&path) {
                            if let Ok(mesh) = parse_stl(&bytes, self.z_up_to_y_up) {
                                self.camera.frame_mesh(&mesh);
                                self.current_mesh = Some(mesh);
                                self.mesh_from_disk = true;
                                self.pending_gl_upload = true;
                                self.set_toast(format!(
                                    "Открыт STL: {}",
                                    path.file_name().unwrap_or_default().to_string_lossy()
                                ));
                            }
                        }
                    }
                }
            }
        }
        if folder_or_stl_loaded {
            self.load_selected_part();
        }
    }

    fn filtered_indices(&self) -> Vec<usize> {
        self.parts
            .iter()
            .enumerate()
            .filter(|(_, p)| {
                if !p.matches_query(&self.search_query) {
                    return false;
                }
                if self.selected_category != "ALL" && p.category_id != self.selected_category {
                    return false;
                }
                if self.active_type_filter != "all" && p.part_type != self.active_type_filter {
                    return false;
                }
                if self.only_favorites && !self.favorites.contains(&p.sku) {
                    return false;
                }
                if self.only_cached && !self.storage.has_model(&p.filename) {
                    return false;
                }
                true
            })
            .map(|(i, _)| i)
            .collect()
    }

    fn step_filtered(&mut self, delta: isize) {
        let filtered = self.filtered_indices();
        if filtered.is_empty() {
            return;
        }
        let next_pos = match filtered.iter().position(|&idx| idx == self.selected_idx) {
            Some(pos) => {
                let len = filtered.len() as isize;
                (pos as isize + delta).rem_euclid(len) as usize
            }
            None => {
                if delta >= 0 {
                    0
                } else {
                    filtered.len() - 1
                }
            }
        };
        self.selected_idx = filtered[next_pos];
        self.scroll_to_selected = true;
        self.load_selected_part();
    }

    fn jump_filtered_edge(&mut self, to_end: bool) {
        let filtered = self.filtered_indices();
        if filtered.is_empty() {
            return;
        }
        self.selected_idx = if to_end {
            *filtered.last().unwrap()
        } else {
            filtered[0]
        };
        self.scroll_to_selected = true;
        self.load_selected_part();
    }
}

impl eframe::App for VexCadApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.handle_dropped_files(ctx);

        // Handle auto-updater transitions
        match self.updater.snapshot() {
            UpdateState::Restarting => {
                std::process::exit(0);
            }
            UpdateState::Available(info) => {
                if self.notified_update_tag.as_deref() != Some(info.tag_name.as_str()) {
                    self.notified_update_tag = Some(info.tag_name.clone());
                    self.set_toast(format!(
                        "Доступна новая версия v{}! Нажмите «Обновить» вверху.",
                        info.version
                    ));
                }
            }
            UpdateState::UpToDate => {
                self.set_toast(format!("У вас последняя версия v{CURRENT_VERSION}"));
                if let Ok(mut st) = self.updater.state.lock() {
                    *st = UpdateState::Idle;
                }
            }
            UpdateState::Error(err) => {
                self.set_toast(err);
                if let Ok(mut st) = self.updater.state.lock() {
                    *st = UpdateState::Idle;
                }
            }
            UpdateState::Downloading { .. } | UpdateState::Checking => {
                ctx.request_repaint();
            }
            UpdateState::Idle => {}
        }

        // Check if background ZIP download finished
        let is_downloading = self.download_progress.is_active.load(Ordering::Relaxed);
        if self.was_downloading && !is_downloading {
            self.storage.rescan_cache();
            self.load_selected_part();
            let err = self
                .download_progress
                .error_text
                .lock()
                .ok()
                .and_then(|e| e.clone());
            if let Some(e) = err {
                self.set_toast(e);
            } else {
                let done = self.download_progress.done_items.load(Ordering::Relaxed);
                if done > 0 {
                    self.set_toast(format!("Загружено и кэшировано {done} STL моделей!"));
                }
            }
        }
        self.was_downloading = is_downloading;
        if is_downloading {
            ctx.request_repaint();
        }

        // Keyboard navigation (Up/Down always work outside modal; Left/Right/Page/Home/End work when not typing)
        if !self.show_data_modal && !self.parts.is_empty() {
            let typing = ctx.wants_keyboard_input();

            if ctx.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::ArrowDown)) {
                self.step_filtered(1);
            } else if ctx.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::ArrowUp)) {
                self.step_filtered(-1);
            } else if !typing {
                if ctx.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::ArrowRight)) {
                    self.step_filtered(1);
                } else if ctx
                    .input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::ArrowLeft))
                {
                    self.step_filtered(-1);
                } else if ctx
                    .input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::PageDown))
                {
                    self.step_filtered(10);
                } else if ctx.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::PageUp))
                {
                    self.step_filtered(-10);
                } else if ctx.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::Home)) {
                    self.jump_filtered_edge(false);
                } else if ctx.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::End)) {
                    self.jump_filtered_edge(true);
                }
            }
        }

        // Auto-rotate animation
        if self.auto_rotate {
            let dt = ctx.input(|i| i.stable_dt).min(0.05);
            self.rotation_y += 0.85 * dt;
            ctx.request_repaint();
        }

        // Left Catalog Sidebar (forced dark slate frame independent of OS theme)
        egui::SidePanel::left("catalog_panel")
            .frame(
                egui::Frame::none()
                    .fill(egui::Color32::from_rgb(15, 23, 42))
                    .stroke(egui::Stroke::new(1.0, egui::Color32::from_rgb(30, 41, 59)))
                    .inner_margin(egui::Margin::symmetric(10.0, 8.0)),
            )
            .default_width(340.0)
            .min_width(280.0)
            .max_width(480.0)
            .resizable(true)
            .show(ctx, |ui| {
                self.render_sidebar(ui);
            });

        // Main 3D Viewport Area
        egui::CentralPanel::default()
            .frame(egui::Frame::none().fill(egui::Color32::from_rgb(10, 15, 29)))
            .show(ctx, |ui| {
                self.render_viewport(ui, ctx);
            });

        // Data Source / ZIP Modal
        if self.show_data_modal {
            self.render_data_modal(ctx);
        }
    }

    fn on_exit(&mut self, gl: Option<&eframe::glow::Context>) {
        if let Some(gl) = gl {
            if let Ok(viewer) = self.gl_viewer.lock() {
                viewer.destroy(gl);
            }
        }
    }
}

impl VexCadApp {
    fn render_sidebar(&mut self, ui: &mut egui::Ui) {
        ui.add_space(6.0);
        ui.horizontal(|ui| {
            ui.heading(egui::RichText::new("VEX IQ 3D CAD").strong().color(egui::Color32::WHITE));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(
                    egui::RichText::new(format!("{} шт.", self.parts.len()))
                        .monospace()
                        .size(11.0)
                        .color(egui::Color32::from_rgb(56, 189, 248)),
                );
            });
        });
        ui.label(
            egui::RichText::new("Нативный Rust + OpenGL движок")
                .size(11.0)
                .color(egui::Color32::from_rgb(148, 163, 184)),
        );
        ui.add_space(6.0);

        // Search input
        ui.horizontal(|ui| {
            let edit = egui::TextEdit::singleline(&mut self.search_query)
                .hint_text("Поиск SKU (228-2500-...) или имя...")
                .desired_width(ui.available_width() - 32.0);
            ui.add(edit);
            if ui.button("✖").on_hover_text("Очистить поиск").clicked() {
                self.search_query.clear();
            }
        });
        ui.add_space(4.0);

        // Category dropdown
        let selected_cat_label = if self.selected_category == "ALL" {
            "Все категории (10 разделов)".to_string()
        } else {
            self.categories
                .iter()
                .find(|c| c.id == self.selected_category)
                .map(|c| format!("{} ({})", c.name, c.count))
                .unwrap_or_else(|| self.selected_category.clone())
        };

        egui::ComboBox::from_id_salt("category_combo")
            .selected_text(selected_cat_label)
            .width(ui.available_width())
            .show_ui(ui, |ui| {
                ui.selectable_value(
                    &mut self.selected_category,
                    "ALL".to_string(),
                    "Все категории (10 разделов)",
                );
                for cat in &self.categories {
                    ui.selectable_value(
                        &mut self.selected_category,
                        cat.id.clone(),
                        format!("{} ({})", cat.name, cat.count),
                    );
                }
            });
        ui.add_space(4.0);

        // Quick Type Chips
        egui::ScrollArea::horizontal()
            .id_salt("type_chips")
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    let types = [
                        ("all", "Все"),
                        ("beam", "Балки"),
                        ("gear", "Шестерни"),
                        ("wheel", "Колёса"),
                        ("shaft", "Оси"),
                        ("pin", "Пины"),
                        ("plate", "Пластины"),
                        ("connector", "Уголки"),
                    ];
                    for (id, label) in types {
                        let active = self.active_type_filter == id;
                        if ui.selectable_label(active, label).clicked() {
                            self.active_type_filter = id.to_string();
                        }
                    }
                });
            });

        // Favorites / Cached toggles
        let filtered = self.filtered_indices();
        ui.horizontal(|ui| {
            ui.toggle_value(&mut self.only_favorites, "★ Избранное");
            ui.toggle_value(&mut self.only_cached, "💾 В кэше");
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(
                    egui::RichText::new(format!("Найдено: {}", filtered.len()))
                        .size(11.0)
                        .color(egui::Color32::from_rgb(148, 163, 184)),
                );
            });
        });

        ui.separator();

        // Parts List
        let footer_height = 68.0;
        let list_height = (ui.available_height() - footer_height).max(120.0);

        let mut scroll_area = egui::ScrollArea::vertical()
            .id_salt("parts_list_scroll")
            .max_height(list_height);

        if self.scroll_to_selected {
            if let Some(pos) = filtered.iter().position(|&idx| idx == self.selected_idx) {
                let stride = 44.0 + ui.spacing().item_spacing.y;
                let target_y = (pos as f32 * stride - list_height * 0.35).max(0.0);
                scroll_area = scroll_area.vertical_scroll_offset(target_y);
            }
            self.scroll_to_selected = false;
        }

        scroll_area.show_rows(ui, 44.0, filtered.len(), |ui, row_range| {
            for row_idx in row_range {
                let part_idx = filtered[row_idx];
                let part = &self.parts[part_idx];
                let is_selected = part_idx == self.selected_idx;
                let is_cached = self.storage.has_model(&part.filename);
                let is_fav = self.favorites.contains(&part.sku);

                let bg = if is_selected {
                    egui::Color32::from_rgb(12, 65, 96)
                } else {
                    egui::Color32::from_rgb(20, 29, 49)
                };
                let border = if is_selected {
                    egui::Stroke::new(1.0, egui::Color32::from_rgb(56, 189, 248))
                } else {
                    egui::Stroke::new(1.0, egui::Color32::from_rgb(30, 41, 59))
                };

                let frame_resp = egui::Frame::none()
                    .fill(bg)
                    .stroke(border)
                    .rounding(6.0)
                    .inner_margin(egui::Margin::symmetric(8.0, 5.0))
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            // Cache indicator
                            let status_col = if is_cached {
                                egui::Color32::from_rgb(52, 211, 153)
                            } else {
                                egui::Color32::from_rgb(100, 116, 139)
                            };
                            ui.label(egui::RichText::new("●").color(status_col).size(10.0));

                            ui.vertical(|ui| {
                                ui.horizontal(|ui| {
                                    ui.label(
                                        egui::RichText::new(&part.sku)
                                            .monospace()
                                            .strong()
                                            .size(12.0)
                                            .color(if is_selected {
                                                egui::Color32::from_rgb(125, 211, 252)
                                            } else {
                                                egui::Color32::from_rgb(241, 245, 249)
                                            }),
                                    );
                                    if !part.pitch_dimensions.is_empty() {
                                        ui.label(
                                            egui::RichText::new(&part.pitch_dimensions)
                                                .monospace()
                                                .size(10.0)
                                                .color(egui::Color32::from_rgb(251, 191, 36)),
                                        );
                                    }
                                    ui.label(
                                        egui::RichText::new(&part.size_str)
                                            .size(10.0)
                                            .color(egui::Color32::from_rgb(148, 163, 184)),
                                    );
                                });
                                ui.label(
                                    egui::RichText::new(&part.name)
                                        .size(11.5)
                                        .color(if is_selected {
                                            egui::Color32::WHITE
                                        } else {
                                            egui::Color32::from_rgb(203, 213, 225)
                                        }),
                                );
                            });

                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    let star = if is_fav { "★" } else { "☆" };
                                    let star_col = if is_fav {
                                        egui::Color32::from_rgb(251, 191, 36)
                                    } else {
                                        egui::Color32::from_rgb(100, 116, 139)
                                    };
                                    if ui
                                        .add(
                                            egui::Button::new(
                                                egui::RichText::new(star).color(star_col),
                                            )
                                            .frame(false),
                                        )
                                        .clicked()
                                    {
                                        let sku = part.sku.clone();
                                        if self.favorites.contains(&sku) {
                                            self.favorites.remove(&sku);
                                        } else {
                                            self.favorites.insert(sku);
                                        }
                                    }
                                },
                            );
                        });
                    });

                let click = frame_resp.response.interact(egui::Sense::click());
                if click.clicked() {
                    self.selected_idx = part_idx;
                    self.load_selected_part();
                }
            }
        });

        ui.separator();

        // Sidebar Footer: Cache Status & Import Buttons
        let cached_count = self.storage.indexed_files.len();
        let cached_mb = self.storage.total_cached_bytes as f64 / (1024.0 * 1024.0);
        ui.horizontal(|ui| {
            ui.label(
                egui::RichText::new(format!("Кэш: {cached_count} мод. ({cached_mb:.1} МБ)"))
                    .size(11.0)
                    .color(egui::Color32::from_rgb(148, 163, 184)),
            );
        });
        ui.add_space(4.0);
        ui.horizontal(|ui| {
            if ui
                .button("📦 Загрузить ZIP / Releases")
                .on_hover_text("Скачать архив из GitHub Releases или открыть локальный ZIP/папку")
                .clicked()
            {
                self.show_data_modal = true;
            }
            if ui
                .button("📁 Папка stl")
                .on_hover_text("Выбрать папку со скачанными STL файлами")
                .clicked()
            {
                self.pick_local_folder();
            }
        });
    }

    fn render_viewport(&mut self, ui: &mut egui::Ui, ctx: &egui::Context) {
        // Top HUD Strip
        egui::Frame::none()
            .fill(egui::Color32::from_rgb(15, 23, 42))
            .inner_margin(egui::Margin::symmetric(12.0, 8.0))
            .show(ui, |ui| {
                ui.horizontal_wrapped(|ui| {
                    if ui
                        .button("◀ Пред.")
                        .on_hover_text("Предыдущая деталь (← или ↑)")
                        .clicked()
                    {
                        self.step_filtered(-1);
                    }
                    if ui
                        .button("След. ▶")
                        .on_hover_text("Следующая деталь (→ или ↓)")
                        .clicked()
                    {
                        self.step_filtered(1);
                    }

                    if let Some(part) = self.parts.get(self.selected_idx) {
                        ui.separator();
                        ui.label(
                            egui::RichText::new(&part.sku)
                                .monospace()
                                .strong()
                                .color(egui::Color32::from_rgb(56, 189, 248)),
                        );
                        ui.label(
                            egui::RichText::new(&part.name)
                                .strong()
                                .color(egui::Color32::WHITE),
                        );

                        if let Some(mesh) = &self.current_mesh {
                            let sz = mesh.size();
                            let px = sz.x / 12.7;
                            let py = sz.y / 12.7;
                            let pz = sz.z / 12.7;
                            ui.label(
                                egui::RichText::new(format!(
                                    "| {:.1}×{:.1}×{:.1} мм ({:.1}P×{:.1}P×{:.1}P) | {} треуг.",
                                    sz.x, sz.z, sz.y, px, pz, py, mesh.triangle_count
                                ))
                                .monospace()
                                .size(11.0)
                                .color(egui::Color32::from_rgb(148, 163, 184)),
                            );
                        }

                        let badge_text = if self.mesh_from_disk {
                            "● Локальный STL"
                        } else {
                            "◈ CAD Генерация"
                        };
                        let badge_col = if self.mesh_from_disk {
                            egui::Color32::from_rgb(52, 211, 153)
                        } else {
                            egui::Color32::from_rgb(251, 191, 36)
                        };
                        ui.label(egui::RichText::new(badge_text).size(11.0).color(badge_col));
                    }

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        // Built-in auto-updater button
                        match self.updater.snapshot() {
                            UpdateState::Available(info) => {
                                let btn = egui::Button::new(
                                    egui::RichText::new(format!("⬆ Обновить v{}", info.version))
                                        .strong()
                                        .color(egui::Color32::WHITE),
                                )
                                .fill(egui::Color32::from_rgb(5, 150, 105));
                                if ui
                                    .add(btn)
                                    .on_hover_text("Скачать и установить обновление с перезапуском")
                                    .clicked()
                                {
                                    self.updater.install_update(info, ctx.clone());
                                }
                            }
                            UpdateState::Downloading { percent, status } => {
                                ui.label(
                                    egui::RichText::new(format!("⏳ {percent}%"))
                                        .color(egui::Color32::from_rgb(56, 189, 248)),
                                )
                                .on_hover_text(status);
                            }
                            UpdateState::Checking => {
                                ui.label(
                                    egui::RichText::new("🔄 ...")
                                        .size(11.0)
                                        .color(egui::Color32::from_rgb(148, 163, 184)),
                                );
                            }
                            _ => {
                                if ui
                                    .button(
                                        egui::RichText::new(format!("🔄 v{CURRENT_VERSION}"))
                                            .size(11.0),
                                    )
                                    .on_hover_text("Проверить обновления на GitHub Releases")
                                    .clicked()
                                {
                                    self.updater.check_for_updates(ctx.clone(), false);
                                }
                            }
                        }

                        if ui
                            .button(egui::RichText::new("💾 Скачать STL").strong())
                            .clicked()
                        {
                            self.export_current_stl();
                        }

                        if ui
                            .toggle_value(&mut self.z_up_to_y_up, "Z↔Y вверх")
                            .on_hover_text("Переключить ориентацию осей STL (CAD Z-up / Y-up)")
                            .changed()
                        {
                            self.load_selected_part();
                        }

                        let mesh_h = self
                            .current_mesh
                            .as_ref()
                            .map(|m| m.size().y)
                            .unwrap_or(10.0);
                        let radius = self
                            .current_mesh
                            .as_ref()
                            .map(|m| m.size().length() * 0.5)
                            .unwrap_or(30.0);

                        if ui.button("Сбоку").clicked() {
                            self.camera.set_preset(CameraPreset::Right, mesh_h, radius);
                        }
                        if ui.button("Спереди").clicked() {
                            self.camera.set_preset(CameraPreset::Front, mesh_h, radius);
                        }
                        if ui.button("Сверху").clicked() {
                            self.camera.set_preset(CameraPreset::Top, mesh_h, radius);
                        }
                        if ui.button("ISO").clicked() {
                            self.camera.set_preset(CameraPreset::Iso, mesh_h, radius);
                        }
                    });
                });
            });

        // Reserve bottom dock height
        let bottom_bar_height = 44.0;
        let viewport_size = egui::vec2(
            ui.available_width().max(100.0),
            (ui.available_height() - bottom_bar_height).max(100.0),
        );

        let (rect, response) = ui.allocate_exact_size(viewport_size, egui::Sense::click_and_drag());

        // Mouse Orbit (Left button), Pan (Right or Middle), Zoom (Scroll wheel)
        if response.dragged_by(egui::PointerButton::Primary) {
            let delta = response.drag_delta();
            self.camera.yaw -= delta.x * 0.008;
            self.camera.pitch = (self.camera.pitch + delta.y * 0.008).clamp(-1.55, 1.55);
        }

        if response.dragged_by(egui::PointerButton::Secondary)
            || response.dragged_by(egui::PointerButton::Middle)
        {
            let delta = response.drag_delta();
            let pan_speed = self.camera.distance * 0.0015;
            let right = glam::Vec3::new(self.camera.yaw.cos(), 0.0, -self.camera.yaw.sin());
            self.camera.target -= right * delta.x * pan_speed;
            self.camera.target.y += delta.y * pan_speed;
        }

        if response.hovered() {
            let scroll = ctx.input(|i| i.smooth_scroll_delta.y);
            if scroll.abs() > 0.01 {
                let zoom_factor = (1.0 - scroll * 0.002).clamp(0.75, 1.25);
                self.camera.distance = (self.camera.distance * zoom_factor).clamp(10.0, 1200.0);
            }
        }

        // Upload mesh to GPU if needed & queue OpenGL PaintCallback
        let pending_upload = if self.pending_gl_upload {
            self.pending_gl_upload = false;
            self.current_mesh.clone()
        } else {
            None
        };

        let render_params = RenderParams {
            camera: self.camera.clone(),
            model_color: VEX_COLORS[self.color_idx].rgb,
            wireframe: self.wireframe,
            show_grid: self.show_grid,
            show_bbox: self.show_bbox,
            rotation_y: self.rotation_y,
        };

        let gl_viewer = Arc::clone(&self.gl_viewer);
        let cb = egui_glow::CallbackFn::new(move |info, painter| {
            let gl = painter.gl();
            if let Ok(mut viewer) = gl_viewer.lock() {
                if let Some(mesh) = &pending_upload {
                    viewer.upload_mesh(gl, mesh);
                }
                viewer.paint(gl, &info, &render_params);
            }
        });

        ui.painter().add(egui::PaintCallback {
            rect,
            callback: Arc::new(cb),
        });

        // Toast Notification overlay (top center)
        if let Some((msg, at)) = &self.toast {
            if at.elapsed().as_secs_f32() < 4.0 {
                let toast_pos = egui::pos2(rect.center().x, rect.top() + 24.0);
                egui::Area::new(egui::Id::new("toast_area"))
                    .fixed_pos(toast_pos)
                    .pivot(egui::Align2::CENTER_TOP)
                    .show(ctx, |ui| {
                        egui::Frame::none()
                            .fill(egui::Color32::from_rgba_unmultiplied(15, 23, 42, 240))
                            .stroke(egui::Stroke::new(1.0, egui::Color32::from_rgb(56, 189, 248)))
                            .rounding(8.0)
                            .inner_margin(egui::Margin::symmetric(14.0, 8.0))
                            .show(ui, |ui| {
                                ui.label(egui::RichText::new(msg).color(egui::Color32::WHITE).size(12.0));
                            });
                    });
            }
        }

        // Bottom Controls Dock
        egui::Frame::none()
            .fill(egui::Color32::from_rgb(15, 23, 42))
            .inner_margin(egui::Margin::symmetric(12.0, 8.0))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new("Цвет:")
                            .size(11.5)
                            .color(egui::Color32::from_rgb(148, 163, 184)),
                    );

                    for (idx, swatch) in VEX_COLORS.iter().enumerate() {
                        let selected = idx == self.color_idx;
                        let (btn_rect, resp) =
                            ui.allocate_exact_size(egui::vec2(18.0, 18.0), egui::Sense::click());
                        ui.painter()
                            .circle_filled(btn_rect.center(), if selected { 8.5 } else { 7.0 }, swatch.egui_color);
                        if selected {
                            ui.painter().circle_stroke(
                                btn_rect.center(),
                                9.5,
                                egui::Stroke::new(2.0, egui::Color32::WHITE),
                            );
                        }
                        if resp.on_hover_text(swatch.name).clicked() {
                            self.color_idx = idx;
                        }
                    }

                    ui.separator();
                    ui.toggle_value(&mut self.auto_rotate, "🔄 Вращение");
                    ui.toggle_value(&mut self.wireframe, "🕸 Полисетка");
                    ui.toggle_value(&mut self.show_bbox, "📐 Габариты");
                    ui.toggle_value(&mut self.show_grid, "▦ Сетка");

                    if ui.button("Сброс камеры").clicked() {
                        if let Some(mesh) = &self.current_mesh {
                            self.camera.set_preset(
                                CameraPreset::Iso,
                                mesh.size().y,
                                mesh.size().length() * 0.5,
                            );
                        }
                        self.rotation_y = 0.0;
                    }

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        ui.label(
                            egui::RichText::new("ЛКМ: Вращать • ПКМ: Двигать • Колесо: Зум • ↑↓←→: Листать")
                                .size(11.0)
                                .color(egui::Color32::from_rgb(148, 163, 184)),
                        );
                    });
                });
            });
    }

    fn render_data_modal(&mut self, ctx: &egui::Context) {
        let mut open = self.show_data_modal;
        let is_active = self.download_progress.is_active.load(Ordering::Relaxed);

        egui::Window::new("Загрузка 3D моделей VEX IQ (STL)")
            .open(&mut open)
            .collapsible(false)
            .resizable(false)
            .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
            .fixed_size([560.0, 340.0])
            .show(ctx, |ui| {
                ui.label(
                    egui::RichText::new(
                        "Выберите способ подключения библиотеки 476 STL-файлов деталей VEX IQ:",
                    )
                    .size(12.5)
                    .color(egui::Color32::from_rgb(203, 213, 225)),
                );
                ui.add_space(10.0);

                // Option 1: GitHub Releases ZIP URL
                egui::Frame::none()
                    .fill(egui::Color32::from_rgb(15, 23, 42))
                    .stroke(egui::Stroke::new(1.0, egui::Color32::from_rgb(51, 65, 85)))
                    .rounding(8.0)
                    .inner_margin(10.0)
                    .show(ui, |ui| {
                        ui.label(
                            egui::RichText::new("1. Автозагрузка ZIP из GitHub Releases (Бесплатный CDN)")
                                .strong()
                                .color(egui::Color32::from_rgb(56, 189, 248)),
                        );
                        ui.add_space(4.0);
                        ui.add(
                            egui::TextEdit::singleline(&mut self.zip_url)
                                .desired_width(ui.available_width())
                                .hint_text("https://github.com/.../vex-iq-models.zip"),
                        );
                        ui.add_space(6.0);
                        ui.horizontal(|ui| {
                            if ui
                                .add_enabled(
                                    !is_active && !self.zip_url.trim().is_empty(),
                                    egui::Button::new("⬇ Скачать и распаковать в кэш"),
                                )
                                .clicked()
                            {
                                download_and_extract_zip(
                                    self.zip_url.trim().to_string(),
                                    self.storage.cache_dir.clone(),
                                    self.download_progress.clone(),
                                    ctx.clone(),
                                );
                            }
                            if ui.button("По умолчанию").clicked() {
                                self.zip_url = DEFAULT_ZIP_URL.to_string();
                            }
                        });
                    });

                ui.add_space(8.0);

                // Option 2 & 3: Local ZIP or Folder
                egui::Frame::none()
                    .fill(egui::Color32::from_rgb(15, 23, 42))
                    .stroke(egui::Stroke::new(1.0, egui::Color32::from_rgb(51, 65, 85)))
                    .rounding(8.0)
                    .inner_margin(10.0)
                    .show(ui, |ui| {
                        ui.label(
                            egui::RichText::new("2. Открыть с компьютера (или перетащите файлы прямо в окно)")
                                .strong()
                                .color(egui::Color32::WHITE),
                        );
                        ui.add_space(6.0);
                        ui.horizontal(|ui| {
                            if ui
                                .add_enabled(!is_active, egui::Button::new("🗜 Выбрать ZIP-архив..."))
                                .clicked()
                            {
                                self.pick_local_zip();
                            }
                            if ui
                                .add_enabled(!is_active, egui::Button::new("📁 Выбрать папку stl/..."))
                                .clicked()
                            {
                                self.pick_local_folder();
                            }
                            if ui
                                .add_enabled(
                                    !is_active && !self.storage.indexed_files.is_empty(),
                                    egui::Button::new("🗑 Очистить кэш"),
                                )
                                .clicked()
                            {
                                let _ = self.storage.clear_cache();
                                self.load_selected_part();
                                self.set_toast("Локальный кэш очищен");
                            }
                        });
                    });

                // Progress bar
                let status = self
                    .download_progress
                    .status_text
                    .lock()
                    .map(|s| s.clone())
                    .unwrap_or_default();
                let err = self
                    .download_progress
                    .error_text
                    .lock()
                    .ok()
                    .and_then(|e| e.clone());

                if is_active || !status.is_empty() || err.is_some() {
                    ui.add_space(8.0);
                    let pct = self.download_progress.percent.load(Ordering::Relaxed) as f32 / 100.0;
                    if let Some(err_msg) = err {
                        ui.label(
                            egui::RichText::new(err_msg)
                                .color(egui::Color32::from_rgb(248, 113, 113)),
                        );
                    } else {
                        ui.add(egui::ProgressBar::new(pct).text(status).animate(is_active));
                    }
                }

                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new(format!(
                            "Папка кэша: {}",
                            self.storage.cache_dir.display()
                        ))
                        .size(10.5)
                        .color(egui::Color32::from_rgb(148, 163, 184)),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.button("Закрыть / Продолжить в CAD").clicked() {
                            self.show_data_modal = false;
                        }
                    });
                });
            });

        if !open {
            self.show_data_modal = false;
        }
    }
}

fn configure_dark_theme(ctx: &egui::Context) {
    // Lock egui into Dark theme so Windows Light Mode never overrides sidebar/widget colors
    ctx.options_mut(|o| {
        o.theme_preference = egui::ThemePreference::Dark;
    });
    ctx.set_theme(egui::Theme::Dark);

    let mut visuals = egui::Visuals::dark();
    let slate_950 = egui::Color32::from_rgb(9, 14, 28);
    let slate_900 = egui::Color32::from_rgb(15, 23, 42);
    let slate_800 = egui::Color32::from_rgb(30, 41, 59);
    let slate_700 = egui::Color32::from_rgb(51, 65, 85);
    let slate_200 = egui::Color32::from_rgb(226, 232, 240);
    let cyan_400 = egui::Color32::from_rgb(56, 189, 248);
    let cyan_800 = egui::Color32::from_rgb(14, 116, 144);

    visuals.window_fill = slate_900;
    visuals.panel_fill = slate_900;
    visuals.extreme_bg_color = slate_950;
    visuals.faint_bg_color = egui::Color32::from_rgb(22, 32, 54);
    visuals.code_bg_color = slate_800;
    visuals.window_stroke = egui::Stroke::new(1.0, slate_700);

    visuals.selection.bg_fill = egui::Color32::from_rgb(12, 74, 110);
    visuals.selection.stroke = egui::Stroke::new(1.0, cyan_400);

    visuals.widgets.noninteractive.bg_fill = slate_900;
    visuals.widgets.noninteractive.weak_bg_fill = slate_800;
    visuals.widgets.noninteractive.bg_stroke = egui::Stroke::new(1.0, slate_700);
    visuals.widgets.noninteractive.fg_stroke = egui::Stroke::new(1.0, slate_200);

    visuals.widgets.inactive.bg_fill = slate_800;
    visuals.widgets.inactive.weak_bg_fill = slate_800;
    visuals.widgets.inactive.bg_stroke = egui::Stroke::new(1.0, slate_700);
    visuals.widgets.inactive.fg_stroke = egui::Stroke::new(1.0, slate_200);
    visuals.widgets.inactive.rounding = egui::Rounding::same(6.0);

    visuals.widgets.hovered.bg_fill = slate_700;
    visuals.widgets.hovered.weak_bg_fill = slate_700;
    visuals.widgets.hovered.bg_stroke = egui::Stroke::new(1.0, cyan_400);
    visuals.widgets.hovered.fg_stroke = egui::Stroke::new(1.0, egui::Color32::WHITE);
    visuals.widgets.hovered.rounding = egui::Rounding::same(6.0);

    visuals.widgets.active.bg_fill = cyan_800;
    visuals.widgets.active.weak_bg_fill = cyan_800;
    visuals.widgets.active.bg_stroke = egui::Stroke::new(1.0, cyan_400);
    visuals.widgets.active.fg_stroke = egui::Stroke::new(1.0, egui::Color32::WHITE);
    visuals.widgets.active.rounding = egui::Rounding::same(6.0);

    visuals.widgets.open.bg_fill = slate_800;
    visuals.widgets.open.weak_bg_fill = slate_800;
    visuals.widgets.open.bg_stroke = egui::Stroke::new(1.0, cyan_400);
    visuals.widgets.open.fg_stroke = egui::Stroke::new(1.0, egui::Color32::WHITE);

    ctx.set_visuals_of(egui::Theme::Dark, visuals.clone());
    ctx.set_visuals(visuals);
}

fn install_cyrillic_fonts(ctx: &egui::Context) {
    let mut fonts = egui::FontDefinitions::default();

    let proportional_candidates = [
        // Windows
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\tahoma.ttf",
        // Linux
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    ];

    for path in proportional_candidates {
        if let Ok(bytes) = fs::read(path) {
            fonts.font_data.insert(
                "sys_sans".to_owned(),
                egui::FontData::from_owned(bytes),
            );
            fonts
                .families
                .entry(egui::FontFamily::Proportional)
                .or_default()
                .insert(0, "sys_sans".to_owned());
            break;
        }
    }

    let mono_candidates = [
        // Windows
        r"C:\Windows\Fonts\consola.ttf",
        r"C:\Windows\Fonts\cour.ttf",
        // Linux
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
        "/usr/share/fonts/TTF/DejaVuSansMono.ttf",
    ];

    for path in mono_candidates {
        if let Ok(bytes) = fs::read(path) {
            fonts.font_data.insert(
                "sys_mono".to_owned(),
                egui::FontData::from_owned(bytes),
            );
            fonts
                .families
                .entry(egui::FontFamily::Monospace)
                .or_default()
                .insert(0, "sys_mono".to_owned());
            break;
        }
    }

    ctx.set_fonts(fonts);
}
