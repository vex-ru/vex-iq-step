# VEX IQ 3D CAD Viewer (Native Rust)

Нативное, сверхбыстрое десктоп-приложение на **Rust + OpenGL (`eframe` / `glow`)** для просмотра 3D-моделей деталей VEX IQ (476 деталей).

## Почему Rust вместо Electron/JS?
- **Размер исполняемого файла ~6 МБ** (вместо 150+ МБ у Electron).
- **Мгновенный запуск** (< 100 мс) и минимальное потребление ОЗУ (~35 МБ).
- **Парсинг бинарного STL на нативной скорости CPU** — даже тяжелые детали весом 50–80 МБ открываются за миллисекунды.
- **Portable-режим без установки**: один файл `.exe` (Windows) или бинарник (Linux) — просто распакуйте и запустите.
- **Локальное кэширование на диск** в папку `./vex_cache` рядом с программой (или автоподхват папки `stl/` рядом с бинарником).

---

## Сборка на Linux
Убедитесь, что установлен Rust (`https://rustup.rs`), и выполните:
```bash
cd native-rust
chmod +x build_linux.sh
./build_linux.sh
```
Готовая портативная сборка появится в:
- `native-rust/dist/VEX-IQ-Viewer-Linux-x64/vex-iq-viewer`
- `native-rust/dist/VEX-IQ-Viewer-Linux-x64-Portable.tar.gz`

---

## Сборка на Windows
Убедитесь, что установлен Rust (`https://win.rustup.rs`), и запустите двойным кликом:
- `native-rust/build_windows.bat`
или через PowerShell:
```powershell
cd native-rust
.\build_windows.ps1
```
Если на компьютере не установлена Visual Studio (`link.exe`), скрипт автоматически подключит автономный GNU-тулчейн (`stable-x86_64-pc-windows-gnu`) через `rustup` — установка Visual Studio C++ не требуется.

Готовая портативная сборка без установки появится в:
- `native-rust/dist/VEX-IQ-Viewer-Windows-x64/vex-iq-viewer.exe`
- `native-rust/dist/VEX-IQ-Viewer-Windows-x64-Portable.zip`

---

## Автоматическая сборка готовых файлов через GitHub Actions
При отправке тега (например `git tag v1.0.0 && git push --tags`) или ручном запуске **Actions -> Build Native Rust App** в GitHub автоматически собираются и публикуются в **Releases**:
1. `VEX-IQ-Viewer-Windows-x64-Portable.zip` (готовый `.exe` для Windows)
2. `VEX-IQ-Viewer-Linux-x64-Portable.tar.gz` (готовый бинарник для Linux)
3. `vex-iq-models.zip` (архив STL-моделей, если папка `stl/` есть в репозитории)
