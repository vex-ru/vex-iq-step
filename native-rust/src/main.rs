#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod catalog;
mod gl_viewer;
mod procedural;
mod stl_loader;
mod storage;
mod updater;

use eframe::egui;

fn main() -> eframe::Result<()> {
    updater::cleanup_old_binary_on_startup();

    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1360.0, 860.0])
            .with_min_inner_size([900.0, 600.0])
            .with_drag_and_drop(true)
            .with_title("VEX IQ 3D CAD Viewer (Native Rust)"),
        depth_buffer: 24,
        ..Default::default()
    };

    eframe::run_native(
        "VEX IQ 3D CAD Viewer",
        options,
        Box::new(|cc| Ok(Box::new(app::VexCadApp::new(cc)))),
    )
}
