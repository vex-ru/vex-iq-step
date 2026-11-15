#!/usr/bin/env bash
set -euo pipefail

REPO="vex-ru/vex-iq-step"
ASSET_NAME="VEX-IQ-Viewer-Linux-x64-Portable.tar.gz"
INSTALL_DIR="${HOME}/.local/share/vex-iq-viewer"
BIN_LINK_DIR="${HOME}/.local/bin"
APP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons/hicolor/scalable/apps"

echo "====================================================="
echo "  VEX IQ 3D CAD Viewer — Установка на Linux"
echo "====================================================="

if command -v wget >/dev/null 2>&1; then
  DOWNLOADER="wget"
elif command -v curl >/dev/null 2>&1; then
  DOWNLOADER="curl"
else
  echo "[!] Требуется wget или curl."
  exit 1
fi

fetch_stdout() {
  if [ "$DOWNLOADER" = "wget" ]; then
    wget -qO- "$1"
  else
    curl -fsSL "$1"
  fi
}

download_file() {
  if [ "$DOWNLOADER" = "wget" ]; then
    wget -q --show-progress -O "$2" "$1" || wget -qO "$2" "$1"
  else
    curl -fL --progress-bar "$1" -o "$2"
  fi
}

DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET_NAME}"
TAG_NAME="latest"

if JSON="$(fetch_stdout "https://api.github.com/repos/${REPO}/releases?per_page=15" 2>/dev/null || true)"; then
  FOUND_URL="$(printf '%s\n' "$JSON" | grep -o "https://[^\"]*${ASSET_NAME}" | head -n 1 || true)"
  if [ -n "$FOUND_URL" ]; then
    DOWNLOAD_URL="$FOUND_URL"
    TAG_NAME="$(printf '%s\n' "$FOUND_URL" | sed -n 's|.*/releases/download/\([^/]*\)/.*|\1|p')"
  fi
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
ARCHIVE_PATH="${TMP_DIR}/${ASSET_NAME}"

echo "[1/4] Скачивание релиза (${TAG_NAME})..."
download_file "$DOWNLOAD_URL" "$ARCHIVE_PATH"

echo "[2/4] Распаковка в ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR" "$BIN_LINK_DIR" "$APP_DIR" "$ICON_DIR"
tar -xzf "$ARCHIVE_PATH" -C "$TMP_DIR"

FOUND_BIN="$(find "$TMP_DIR" -type f -name "vex-iq-viewer" | head -n 1)"
if [ -z "$FOUND_BIN" ]; then
  echo "[!] Ошибка: бинарный файл vex-iq-viewer не найден в архиве."
  exit 1
fi

cp -f "$FOUND_BIN" "${INSTALL_DIR}/vex-iq-viewer.new"
chmod +x "${INSTALL_DIR}/vex-iq-viewer.new"
mv -f "${INSTALL_DIR}/vex-iq-viewer.new" "${INSTALL_DIR}/vex-iq-viewer"
ln -sf "${INSTALL_DIR}/vex-iq-viewer" "${BIN_LINK_DIR}/vex-iq-viewer"

echo "[3/4] Установка иконки и ярлыка меню приложений..."
cat > "${ICON_DIR}/vex-iq-viewer.svg" << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0f1d"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
    <linearGradient id="tealGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="110" fill="url(#bg)"/>
  <g transform="translate(256, 256) scale(1.6)">
    <path d="M 0 -70 L 65 -32 L 65 45 L 0 85 L -65 45 L -65 -32 Z" fill="#0f172a" stroke="#0284c7" stroke-width="4"/>
    <path d="M 0 -70 L 65 -32 L 0 6 L -65 -32 Z" fill="url(#tealGrad)"/>
    <path d="M 0 6 L 65 -32 L 65 45 L 0 85 Z" fill="#0369a1"/>
    <path d="M -65 -32 L 0 6 L 0 85 L -65 45 Z" fill="#0284c7"/>
    <ellipse cx="0" cy="-32" rx="16" ry="8" fill="#0a0f1d" stroke="#38bdf8" stroke-width="3"/>
  </g>
</svg>
EOF

cat > "${APP_DIR}/vex-iq-viewer.desktop" << EOF
[Desktop Entry]
Type=Application
Name=VEX IQ 3D CAD Viewer
Comment=Просмотрщик 3D моделей деталей VEX IQ (Native Rust)
Exec=${INSTALL_DIR}/vex-iq-viewer
Icon=vex-iq-viewer
Terminal=false
Categories=Engineering;Education;Graphics;
StartupNotify=true
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi

echo "[4/4] Проверка системных библиотек OpenGL/GTK..."
if command -v ldd >/dev/null 2>&1; then
  if ldd "${INSTALL_DIR}/vex-iq-viewer" 2>/dev/null | grep -q "not found"; then
    echo "[!] Не найдены некоторые системные библиотеки:"
    ldd "${INSTALL_DIR}/vex-iq-viewer" | grep "not found"
    echo "    Для Ubuntu/Debian установите: sudo apt-get install -y libgtk-3-0 libgl1 libxkbcommon0"
  fi
fi

echo ""
echo "[✓] Установка завершена!"
echo "    Команда запуска: vex-iq-viewer  (или из меню приложений «VEX IQ 3D CAD Viewer»)"
echo "    Папка программы: ${INSTALL_DIR}"
echo "    Автообновление встроено прямо в приложение."

case ":${PATH}:" in
  *":${BIN_LINK_DIR}:"*) ;;
  *)
    echo ""
    echo "[i] Добавьте ~/.local/bin в PATH (если команда vex-iq-viewer ещё не видна):"
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac
