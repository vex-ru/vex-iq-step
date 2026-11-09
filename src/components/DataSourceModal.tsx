/**
 * Startup & Data Source Selector Modal
 * Prompts user on launch:
 * 1. Download & auto-extract ZIP from GitHub Releases CDN
 * 2. Upload local ZIP archive from disk
 * 3. Pick local stl/ directory
 * 4. Proceed in standalone procedural CAD mode
 */

import React, { useState, useRef } from 'react';
import {
  X,
  Github,
  FolderArchive,
  FolderUp,
  DownloadCloud,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
  HardDrive,
  ExternalLink,
} from 'lucide-react';
import { loadModelsFromZipUrl, loadModelsFromZipBuffer, type ZipLoadProgress } from '../services/zipLoader';
import { registerLocalFiles } from '../services/modelSource';

export interface DataSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
  cachedCount: number;
}

const DEFAULT_ZIP_URL =
  'https://github.com/vkontakte258/vex-iq-models/releases/download/v1.0.0/vex-iq-models.zip';
const PREVENT_STARTUP_MODAL_KEY = 'vex_iq_hide_startup_modal';

export const DataSourceModal: React.FC<DataSourceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  cachedCount,
}) => {
  const [zipUrl, setZipUrl] = useState<string>(() => {
    return localStorage.getItem('vex_iq_custom_zip_url') || DEFAULT_ZIP_URL;
  });
  const [loadingMode, setLoadingMode] = useState<'idle' | 'url' | 'local_zip' | 'local_folder'>('idle');
  const [progress, setProgress] = useState<ZipLoadProgress | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'github' | 'local_zip' | 'local_folder'>('github');
  const [isDragOver, setIsDragOver] = useState(false);

  const zipFileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFinish = (count: number) => {
    if (dontShowAgain) {
      localStorage.setItem(PREVENT_STARTUP_MODAL_KEY, 'true');
    }
    onSuccess(count);
  };

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem(PREVENT_STARTUP_MODAL_KEY, 'true');
    }
    onClose();
  };

  // 1. Download from GitHub Releases ZIP URL
  const handleDownloadRemoteZip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zipUrl.trim()) return;

    setLoadingMode('url');
    localStorage.setItem('vex_iq_custom_zip_url', zipUrl.trim());

    try {
      const result = await loadModelsFromZipUrl(zipUrl.trim(), (p) => {
        setProgress(p);
      });
      setTimeout(() => {
        handleFinish(result.count);
      }, 1200);
    } catch (err: any) {
      console.error('Remote ZIP download error:', err);
    } finally {
      setLoadingMode('idle');
    }
  };

  // 2. Load Local ZIP File
  const handleLocalZipFile = async (file: File) => {
    if (!file) return;
    setLoadingMode('local_zip');

    try {
      setProgress({
        stage: 'downloading',
        percent: 20,
        message: `Чтение файла ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} МБ)...`,
        processedCount: 0,
        totalCount: 0,
      });

      const buffer = await file.arrayBuffer();
      const result = await loadModelsFromZipBuffer(buffer, (p) => {
        setProgress(p);
      });

      setTimeout(() => {
        handleFinish(result.count);
      }, 1200);
    } catch (err) {
      console.error('Local ZIP error:', err);
    } finally {
      setLoadingMode('idle');
    }
  };

  // 3. Load Local Folder
  const handleLocalFolder = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLoadingMode('local_folder');

    try {
      setProgress({
        stage: 'indexing',
        percent: 30,
        message: `Импорт файлов из папки (${files.length} шт.)...`,
        processedCount: 0,
        totalCount: files.length,
      });

      const count = await registerLocalFiles(files, (curr, total) => {
        const pct = Math.round((curr / total) * 100);
        setProgress({
          stage: 'indexing',
          percent: pct,
          message: `Сохранение в кэш: ${curr} из ${total} деталей`,
          processedCount: curr,
          totalCount: total,
        });
      });

      setTimeout(() => {
        handleFinish(count);
      }, 1200);
    } catch (err) {
      console.error('Folder import error:', err);
    } finally {
      setLoadingMode('idle');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center shadow-lg shadow-cyan-900/50">
              <DownloadCloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Загрузка библиотеки 3D моделей VEX IQ
              </h2>
              <p className="text-xs text-slate-400">
                Выберите источник архива STL (GitHub Releases CDN или локальный файл)
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab selection */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-4 gap-2">
          <button
            onClick={() => setActiveTab('github')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'github'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Github className="w-4 h-4" />
            1. GitHub Releases (ZIP URL)
          </button>

          <button
            onClick={() => setActiveTab('local_zip')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'local_zip'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderArchive className="w-4 h-4" />
            2. Локальный ZIP-файл
          </button>

          <button
            onClick={() => setActiveTab('local_folder')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'local_folder'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderUp className="w-4 h-4" />
            3. Папка stl/ на диске
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-300">
          {/* Tab 1: GitHub Releases ZIP */}
          {activeTab === 'github' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-500/30">
                <div className="flex items-center gap-2 mb-1">
                  <Github className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-cyan-300">
                    Автоматическая загрузка из GitHub Releases (Бесплатный CDN)
                  </h3>
                </div>
                <p className="text-slate-300 text-xs">
                  Приложение скачивает один упакованный архив <code className="text-cyan-400 font-mono">vex-iq-models.zip</code> прямо из релиза GitHub, мгновенно распаковывает все 476 файлов и сохраняет в IndexedDB.
                </p>
              </div>

              <form onSubmit={handleDownloadRemoteZip} className="space-y-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Прямой URL на ZIP архив моделей (GitHub Release Asset):
                  </label>
                  <input
                    type="url"
                    value={zipUrl}
                    onChange={(e) => setZipUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo/releases/download/v1.0.0/vex-iq-models.zip"
                    disabled={loadingMode !== 'idle'}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-500 text-[11px]">Примеры:</span>
                    <button
                      type="button"
                      onClick={() => setZipUrl(DEFAULT_ZIP_URL)}
                      className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 cursor-pointer"
                    >
                      По умолчанию (v1.0.0)
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loadingMode !== 'idle' || !zipUrl.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/50 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {loadingMode === 'url' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Загрузка архива...
                      </>
                    ) : (
                      <>
                        <DownloadCloud className="w-4 h-4" />
                        Скачать и распаковать в кэш
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tab 2: Local ZIP */}
          {activeTab === 'local_zip' && (
            <div className="space-y-4">
              <input
                ref={zipFileInputRef}
                type="file"
                accept=".zip"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleLocalZipFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleLocalZipFile(e.dataTransfer.files[0]);
                  }
                }}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                  isDragOver
                    ? 'border-cyan-400 bg-cyan-950/40'
                    : 'border-slate-700 hover:border-slate-600 bg-slate-950/50'
                }`}
              >
                <FolderArchive className="w-12 h-12 mx-auto mb-3 text-cyan-400" />
                <h4 className="text-sm font-bold text-white mb-1">
                  Перетащите ZIP-архив с моделями деталей
                </h4>
                <p className="text-slate-400 text-xs max-w-sm mx-auto mb-4">
                  Архив распаковывается полностью внутри вашего браузера без отправки в интернет, заполняя локальный кэш IndexedDB.
                </p>

                <button
                  type="button"
                  onClick={() => zipFileInputRef.current?.click()}
                  disabled={loadingMode !== 'idle'}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all cursor-pointer shadow-lg disabled:opacity-50"
                >
                  {loadingMode === 'local_zip' ? 'Распаковка архива...' : 'Выбрать ZIP-файл на компьютере'}
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: Local Folder */}
          {activeTab === 'local_folder' && (
            <div className="space-y-4">
              <input
                ref={folderInputRef}
                type="file"
                // @ts-expect-error webkitdirectory is standard
                webkitdirectory=""
                directory=""
                multiple
                onChange={(e) => handleLocalFolder(e.target.files)}
                className="hidden"
              />

              <div className="border-2 border-dashed border-slate-700 rounded-2xl p-8 text-center bg-slate-950/50">
                <FolderUp className="w-12 h-12 mx-auto mb-3 text-cyan-400" />
                <h4 className="text-sm font-bold text-white mb-1">
                  У вас уже есть распакованная папка stl/?
                </h4>
                <p className="text-slate-400 text-xs max-w-sm mx-auto mb-4">
                  Выберите локальную папку с файлами деталей, и приложение автоматически добавит все 483 модели в офлайн-базу.
                </p>

                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={loadingMode !== 'idle'}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 transition-all cursor-pointer shadow-lg disabled:opacity-50"
                >
                  {loadingMode === 'local_folder' ? 'Индексация папки...' : 'Выбрать папку stl на компьютере'}
                </button>
              </div>
            </div>
          )}

          {/* Progress Bar & Status */}
          {progress && (
            <div className="p-4 bg-slate-950 rounded-xl border border-cyan-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 flex items-center gap-2">
                  {progress.stage === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : progress.stage === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                  )}
                  {progress.message}
                </span>
                <span className="text-cyan-400 font-bold">{progress.percent}%</span>
              </div>

              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    progress.stage === 'error'
                      ? 'bg-rose-500'
                      : progress.stage === 'completed'
                      ? 'bg-emerald-500'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                  }`}
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Current Status info */}
          <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-slate-400 text-xs">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              В локальном кэше IndexedDB:
            </span>
            <span className="font-mono text-slate-200 font-semibold">
              {cachedCount} из 476 моделей
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 cursor-pointer"
            />
            <span>Больше не показывать это окно при запуске</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            >
              Продолжить в автономном CAD-режиме
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
