/**
 * Deployment, Git LFS, GitHub Actions & Cloud Storage Architecture Guide Modal
 * Solves the user's explicit questions:
 * - How to host 483 heavy STL files on GitHub Pages
 * - How to use Cloudflare R2 / AWS S3 with 0$ egress
 * - How to use GitHub Releases as a free CDN
 * - How to build cross-platform desktop installers (Windows/Mac/Linux) via GitHub Actions
 * - How local IndexedDB caching ensures sub-millisecond offline loads
 */

import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Cloud,
  Github,
  Monitor,
  HardDrive,
  Database,
  ArrowRight,
  ExternalLink,
  Download,
  Terminal,
} from 'lucide-react';

export interface DeploymentGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeploymentGuideModal: React.FC<DeploymentGuideModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'r2' | 'releases' | 'lfs' | 'desktop'>('r2');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyCode = (code: string, key: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const cloudflareR2Script = `#!/usr/bin/env python3
"""
Скрипт загрузки STL моделей VEX IQ в Cloudflare R2 / S3-совместимое хранилище
Cloudflare R2 предоставляет 10 ГБ бесплатно и 0$ за исходящий трафик (No Egress Fees)!
"""
import os
import boto3
from botocore.config import Config

# Получите ключи в Cloudflare Dashboard -> R2 -> Manage R2 API Tokens
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "your_cloudflare_account_id")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "your_access_key_id")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY", "your_secret_access_key")
BUCKET_NAME = os.environ.get("R2_BUCKET", "vex-iq-models")

s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    config=Config(signature_version="s3v4"),
)

STL_ROOT = "stl"
print(f"[*] Начало загрузки моделей из {STL_ROOT} в R2 бакет '{BUCKET_NAME}'...")

for root, dirs, files in os.walk(STL_ROOT):
    for file in files:
        if file.endswith((".stl", ".3mf")):
            local_path = os.path.join(root, file)
            # Сохраняем относительный путь: stl/01_Beams/1x10 Beam (228-2500-009).stl
            rel_path = os.path.relpath(local_path, ".").replace("\\\\", "/")
            
            print(f"Загрузка: {rel_path}...")
            s3.upload_file(
                local_path,
                BUCKET_NAME,
                rel_path,
                ExtraArgs={
                    "ContentType": "model/stl" if file.endswith(".stl") else "model/3mf",
                    "CacheControl": "public, max-age=31536000, immutable"
                }
            )

print("[✓] Все модели успешно синхронизированы с Cloudflare R2!")
print(f"Публичный URL для настройки в приложении: https://pub-<hash>.r2.dev")
`;

  const githubReleaseScript = `#!/usr/bin/env python3
"""
Скрипт загрузки STL моделей в GitHub Releases (Бесплатный CDN без лимитов трафика)
GitHub Releases позволяет загружать ассеты до 2 ГБ на файл бесплатно!
"""
import os
import subprocess
import json

REPO = "owner/vex-iq-cad"
TAG = "v1.0.0"

print(f"[*] Создание релиза {TAG} в {REPO} через GitHub CLI...")
subprocess.run(["gh", "release", "create", TAG, "--title", "VEX IQ 3D Models Library", "--notes", "Full 483 STL & 3MF dataset"], check=False)

STL_ROOT = "stl"
for root, dirs, files in os.walk(STL_ROOT):
    for file in files:
        if file.endswith((".stl", ".3mf")):
            file_path = os.path.join(root, file)
            print(f"Загрузка в релиз: {file}...")
            subprocess.run(["gh", "release", "upload", TAG, file_path, "--clobber"], check=True)

print("[✓] Все файлы прикреплены к GitHub Release!")
print(f"Шаблон прямой ссылки: https://github.com/{REPO}/releases/download/{TAG}/<filename>")
`;

  const githubPagesWorkflow = `name: Deploy VEX IQ 3D Viewer to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          lfs: true # Если вы используете Git LFS

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install --legacy-peer-deps

      - name: Build web application
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;

  const desktopInstallerWorkflow = `name: Build Desktop Installers (Windows, Mac, Linux)

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  release:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    runs-on: \${{ matrix.os }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          lfs: true

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install

      - name: Build web dist
        run: npm run build

      # Для сборки Electron / Tauri инсталлеров (.exe, .dmg, .AppImage)
      - name: Package Desktop Executable
        run: npx electron-builder --publish always
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;

  const gitAttributesContent = `# Настройка Git LFS для бинарных 3D моделей
*.stl filter=lfs diff=lfs merge=lfs -text
*.3mf filter=lfs diff=lfs merge=lfs -text
*.step filter=lfs diff=lfs merge=lfs -text
*.stp filter=lfs diff=lfs merge=lfs -text
*.bin filter=lfs diff=lfs merge=lfs -text
`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Архитектура хранения & Хостинг (GitHub, R2, LFS)
              </h2>
              <p className="text-xs text-slate-400">
                Решение проблемы тяжелых STL-файлов (483 шт.), деплой на GitHub Pages и офлайн-кэширование
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('r2')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'r2'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cloud className="w-4 h-4" />
            Вариант 1: Cloudflare R2 + GH Pages (Рекомендуется)
          </button>

          <button
            onClick={() => setActiveTab('releases')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'releases'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Github className="w-4 h-4" />
            Вариант 2: GitHub Releases (Бесплатный CDN)
          </button>

          <button
            onClick={() => setActiveTab('lfs')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'lfs'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            Вариант 3: Git LFS + GitHub Pages
          </button>

          <button
            onClick={() => setActiveTab('desktop')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'desktop'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-4 h-4" />
            Вариант 4: Десктоп-инсталлер (GitHub Actions)
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-300 text-xs leading-relaxed">
          {activeTab === 'r2' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-500/30">
                <h3 className="text-sm font-bold text-cyan-300 mb-1">
                  Почему это лучшее решение для GitHub Pages?
                </h3>
                <p className="text-slate-300 mb-2">
                  Хранить гигабайты STL в самом репозитории Git замедляет клонирование. При этом в GitHub Pages есть лимит на вес сайта (1 ГБ).
                  <strong> Cloudflare R2</strong> решает это идеально:
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li><strong>Бесплатно 10 ГБ</strong> хранилища навсегда (ваши 483 модели весят около 500 МБ - хватит с 20-кратным запасом).</li>
                  <li><strong>0$ за исходящий трафик (Zero Egress Fees)</strong> — даже если тысячи людей скачивают модели, платить ничего не нужно.</li>
                  <li>Статическое веб-приложение хостится на <strong>GitHub Pages</strong>, а модели мгновенно подгружаются с R2 CDN.</li>
                  <li>Встроенный в наше приложение <strong>IndexedDB-кэш</strong> гарантирует, что модель скачивается пользователем ровно один раз!</li>
                </ul>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    Скрипт синхронизации моделей с Cloudflare R2 (Python / Boto3):
                  </span>
                  <button
                    onClick={() => copyCode(cloudflareR2Script, 'r2_script')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                  >
                    {copiedKey === 'r2_script' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedKey === 'r2_script' ? 'Скопировано!' : 'Копировать скрипт'}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 font-mono text-[11px] text-slate-300 overflow-x-auto border border-slate-800">
                  {cloudflareR2Script}
                </pre>
              </div>

              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700">
                <p className="font-medium text-slate-200 mb-1">Как подключить в приложении:</p>
                <p className="text-slate-400">
                  После создания публичного бакета вставьте его URL в разделе <strong>«Хранилище»</strong> (кнопка внизу сайдбара). Например:
                  <code className="mx-1 px-1.5 py-0.5 rounded bg-slate-900 text-cyan-400 font-mono">https://pub-your-id.r2.dev</code>
                </p>
              </div>
            </div>
          )}

          {activeTab === 'releases' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-500/30">
                <h3 className="text-sm font-bold text-purple-300 mb-1">
                  GitHub Releases как бесплатный CDN (Без внешних аккаунтов)
                </h3>
                <p className="text-slate-300 mb-2">
                  Если вы не хотите регистрировать Cloudflare или AWS, можно использовать сам GitHub!
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>В GitHub Releases размер одного файла может быть <strong>до 2 ГБ</strong>.</li>
                  <li>Трафик со страниц скачивания релизов не учитывается в квотах Git LFS.</li>
                  <li>Каждая модель доступна по прямой ссылке вида:
                    <code className="block mt-1 p-1 bg-slate-900 rounded text-cyan-300 font-mono text-[10px]">
                      https://github.com/&lt;owner&gt;/&lt;repo&gt;/releases/download/v1.0.0/&lt;filename.stl&gt;
                    </code>
                  </li>
                </ul>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    Автоматическая выгрузка всех 483 файлов в релиз (GitHub CLI):
                  </span>
                  <button
                    onClick={() => copyCode(githubReleaseScript, 'gh_rel')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                  >
                    {copiedKey === 'gh_rel' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedKey === 'gh_rel' ? 'Скопировано!' : 'Копировать скрипт'}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 font-mono text-[11px] text-slate-300 overflow-x-auto border border-slate-800">
                  {githubReleaseScript}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'lfs' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                <h3 className="text-sm font-bold text-slate-200 mb-1">
                  Настройка Git LFS для репозитория
                </h3>
                <p className="text-slate-400 mb-2">
                  Файл <code className="text-cyan-400 font-mono">.gitattributes</code> указывает Git выносить бинарные файлы STL и 3MF из истории коммитов в Large File Storage:
                </p>
                <div className="relative">
                  <pre className="p-3 rounded-lg bg-slate-950 font-mono text-[11px] text-slate-300 border border-slate-800">
                    {gitAttributesContent}
                  </pre>
                  <button
                    onClick={() => copyCode(gitAttributesContent, 'gitattr')}
                    className="absolute top-2 right-2 px-2 py-1 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                  >
                    {copiedKey === 'gitattr' ? 'Скопировано!' : 'Копировать'}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Github className="w-4 h-4 text-cyan-400" />
                    GitHub Actions: .github/workflows/deploy.yml
                  </span>
                  <button
                    onClick={() => copyCode(githubPagesWorkflow, 'gh_pages')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                  >
                    {copiedKey === 'gh_pages' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedKey === 'gh_pages' ? 'Скопировано!' : 'Копировать'}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 font-mono text-[11px] text-slate-300 overflow-x-auto border border-slate-800">
                  {githubPagesWorkflow}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'desktop' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
                <h3 className="text-sm font-bold text-emerald-300 mb-1">
                  Кроссплатформенное приложение с авто-сборкой в GitHub Actions
                </h3>
                <p className="text-slate-300 mb-2">
                  Вы можете упаковать просмотрщик в нативное приложение (Electron или Tauri) со всеми 483 деталями, запакованными прямо внутрь!
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li><strong>100% Офлайн</strong>: работает без интернета прямо на соревнованиях робототехники.</li>
                  <li><strong>Авто-билд</strong>: при создании тега <code className="text-cyan-400 font-mono">git tag v1.0.0 &amp;&amp; git push --tags</code> GitHub Actions автоматически соберет инсталлеры для Windows (.exe/.msi), macOS (.dmg) и Linux (.AppImage).</li>
                  <li>Готовые инсталлеры автоматически прикрепляются к разделу <strong>Releases</strong> репозитория.</li>
                </ul>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    GitHub Actions Workflow: .github/workflows/desktop.yml
                  </span>
                  <button
                    onClick={() => copyCode(desktopInstallerWorkflow, 'desktop_wf')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                  >
                    {copiedKey === 'desktop_wf' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedKey === 'desktop_wf' ? 'Скопировано!' : 'Копировать'}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 font-mono text-[11px] text-slate-300 overflow-x-auto border border-slate-800">
                  {desktopInstallerWorkflow}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Встроенное IndexedDB кэширование уже активно в текущей версии приложения.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer"
          >
            Понятно, закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
