#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=================================================="
echo "  Сборка нативного VEX IQ 3D Viewer (Rust) — Linux"
echo "=================================================="

if ! command -v cargo >/dev/null 2>&1; then
  echo "[!] Rust/Cargo не найден. Установите через rustup:"
  echo "    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  exit 1
fi

echo "[1/3] Проверка системных зависимостей (Ubuntu/Debian)..."
if command -v apt-get >/dev/null 2>&1; then
  MISSING_PKGS=""
  for pkg in build-essential pkg-config libgtk-3-dev libgl1-mesa-dev libxkbcommon-dev libxcb-render0-dev libxcb-shape0-dev libxcb-xfixes0-dev; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
      MISSING_PKGS="$MISSING_PKGS $pkg"
    fi
  done
  if [ -n "$MISSING_PKGS" ]; then
    echo "    Не найдены пакеты:$MISSING_PKGS"
    echo "    Установите их командой:"
    echo "    sudo apt-get update && sudo apt-get install -y$MISSING_PKGS"
    read -r -p "Установить автоматически сейчас? [y/N]: " ans
    if [[ "$ans" =~ ^[Yy]$ ]]; then
      sudo apt-get update && sudo apt-get install -y $MISSING_PKGS
    fi
  fi
fi

echo "[2/3] Компиляция оптимизированного release-бинарника..."
cargo build --release

echo "[3/3] Упаковка портативной сборки (без установки)..."
OUT_DIR="dist/VEX-IQ-Viewer-Linux-x64"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

cp target/release/vex-iq-viewer "$OUT_DIR/vex-iq-viewer"
chmod +x "$OUT_DIR/vex-iq-viewer"

cat > "$OUT_DIR/README.txt" << 'EOF'
VEX IQ 3D CAD Viewer (Native Rust — Linux Portable)
==================================================

Запуск без установки:
1. Откройте терминал в этой папке (или кликните дважды в файловом менеджере).
2. Запустите: ./vex-iq-viewer
3. Если у вас есть папка stl/ с моделями — положите её рядом с программой
   или нажмите "Загрузить ZIP / Releases" внутри программы.

Кэш моделей автоматически сохраняется в ./vex_cache/ рядом с программой.
EOF

mkdir -p dist
tar -czf dist/VEX-IQ-Viewer-Linux-x64-Portable.tar.gz -C dist VEX-IQ-Viewer-Linux-x64

echo ""
echo "[✓] Готово!"
echo "    Бинарник:   $OUT_DIR/vex-iq-viewer"
echo "    Архив:      dist/VEX-IQ-Viewer-Linux-x64-Portable.tar.gz"
echo "    Размер:     $(du -h "$OUT_DIR/vex-iq-viewer" | cut -f1)"
