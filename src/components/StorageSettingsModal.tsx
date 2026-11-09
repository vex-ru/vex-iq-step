/**
 * Storage Settings & Local STL Folder Importer Modal
 * Allows:
 * - Loading user's local STL/3MF directory via Drag & Drop or Directory picker
 * - Configuring remote Cloudflare R2 / S3 / GitHub Releases base URL
 * - Viewing and clearing IndexedDB cache
 */

import React, { useState, useRef } from 'react';
import {
  X,
  FolderUp,
  HardDrive,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Globe,
  Save,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  getStorageConfig,
  saveStorageConfig,
  registerLocalFiles,
  type StorageConfig,
} from '../services/modelSource';
import { clearModelCache } from '../services/modelCache';

export interface StorageSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cacheCount: number;
  cacheSizeMB: number;
  onCacheCleared: () => void;
  onFilesImported: (count: number) => void;
}

export const StorageSettingsModal: React.FC<StorageSettingsModalProps> = ({
  isOpen,
  onClose,
  cacheCount,
  cacheSizeMB,
  onCacheCleared,
  onFilesImported,
}) => {
  const [config, setConfig] = useState<StorageConfig>(getStorageConfig());
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    saveStorageConfig(config);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleClearCache = async () => {
    if (window.confirm('Очистить локальный кэш 3D моделей IndexedDB?')) {
      await clearModelCache();
      onCacheCleared();
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsImporting(true);
    setImportProgress({ current: 0, total: files.length });

    try {
      const count = await registerLocalFiles(files, (curr, total) => {
        setImportProgress({ current: curr, total });
      });
      onFilesImported(count);
    } catch (err) {
      console.error('Import error:', err);
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  const setPreset = (presetUrl: string) => {
    setConfig({ ...config, remoteBaseUrl: presetUrl, enableRemoteFetch: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Управление хранилищем и кэшем STL
              </h2>
              <p className="text-xs text-slate-400">
                Загрузите локальную папку моделей или укажите URL облачного хранилища
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-300">
          {/* Section 1: Local Folder Drag & Drop */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FolderUp className="w-4 h-4 text-cyan-400" />
              1. Загрузка папки STL с вашего компьютера
            </h3>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                isDragOver
                  ? 'border-cyan-400 bg-cyan-950/30'
                  : 'border-slate-700 hover:border-slate-600 bg-slate-950/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                // @ts-expect-error webkitdirectory is standard in modern browsers
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFolderSelect}
                className="hidden"
              />

              <FolderUp className="w-10 h-10 mx-auto mb-2 text-cyan-400" />
              <p className="text-sm font-semibold text-white">
                Перетащите сюда папку <span className="font-mono text-cyan-300">stl/</span> или выберите её
              </p>
              <p className="text-slate-400 mt-1 max-w-sm mx-auto text-[11px]">
                Браузер автоматически проиндексирует все 483 файла STL/3MF и сохранит их в IndexedDB для мгновенного просмотра офлайн.
              </p>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer shadow-lg disabled:opacity-50"
              >
                {isImporting ? 'Индексация файлов...' : 'Выбрать папку на диске'}
              </button>

              {isImporting && importProgress && (
                <div className="mt-4 max-w-xs mx-auto">
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Импорт моделей...</span>
                    <span>
                      {importProgress.current} / {importProgress.total}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 transition-all duration-150"
                      style={{
                        width: `${Math.round(
                          (importProgress.current / importProgress.total) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Remote Cloud Storage (R2 / S3 / Releases) */}
          <form onSubmit={handleSaveConfig} className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-cyan-400" />
              2. Удаленное облачное хранилище (Cloudflare R2, AWS S3, GitHub CDN)
            </h3>

            <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Базовый URL хранилища (Remote Base URL):
                </label>
                <input
                  type="text"
                  value={config.remoteBaseUrl}
                  onChange={(e) => setConfig({ ...config, remoteBaseUrl: e.target.value })}
                  placeholder="https://pub-xxxxxx.r2.dev или https://raw.githubusercontent.com/owner/repo/main"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-500 text-[11px]">Шаблоны:</span>
                <button
                  type="button"
                  onClick={() => setPreset('https://pub-example.r2.dev')}
                  className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 cursor-pointer"
                >
                  Cloudflare R2 Bucket
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPreset('https://github.com/owner/vex-iq-cad/releases/download/v1.0.0')
                  }
                  className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 cursor-pointer"
                >
                  GitHub Release Assets
                </button>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  id="enableRemote"
                  type="checkbox"
                  checked={config.enableRemoteFetch}
                  onChange={(e) => setConfig({ ...config, enableRemoteFetch: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="enableRemote" className="text-slate-300 cursor-pointer">
                  Разрешить скачивание недостающих файлов с удаленного URL
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 cursor-pointer"
                >
                  {saveSuccess ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Save className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                  {saveSuccess ? 'Сохранено!' : 'Сохранить настройки'}
                </button>
              </div>
            </div>
          </form>

          {/* Section 3: IndexedDB Cache Stats */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              3. Состояние локального кэша IndexedDB
            </h3>

            <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white font-mono">
                  {cacheCount} / 476 моделей сохранено
                </p>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  Занято памяти: {cacheSizeMB.toFixed(2)} МБ • Повторные открытия происходят мгновенно (0 мс)
                </p>
              </div>

              <button
                type="button"
                onClick={handleClearCache}
                disabled={cacheCount === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-900/60 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Очистить кэш
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
