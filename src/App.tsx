/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { VEX_PARTS, type VexPartItem } from './data/vexCatalog';
import { VexViewer3D } from './components/VexViewer3D';
import { CatalogSidebar } from './components/CatalogSidebar';
import { DeploymentGuideModal } from './components/DeploymentGuideModal';
import { StorageSettingsModal } from './components/StorageSettingsModal';
import { DataSourceModal } from './components/DataSourceModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { downloadPartSTL } from './services/downloadHelper';
import { getCacheStats } from './services/modelCache';
import {
  Menu,
  FileCode,
  HardDrive,
  DownloadCloud,
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
} from 'lucide-react';

const FAVORITES_KEY = 'vex_iq_favorites_v1';
const PREVENT_STARTUP_MODAL_KEY = 'vex_iq_hide_startup_modal';

export default function App() {
  // Active part (Default to 24 Tooth Gear or 1x10 Beam)
  const [selectedPart, setSelectedPart] = useState<VexPartItem>(() => {
    return VEX_PARTS.find((p) => p.sku === '228-2500-227') || VEX_PARTS[0];
  });

  // UI Modals
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDeployGuideOpen, setIsDeployGuideOpen] = useState(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const [isDataSourceModalOpen, setIsDataSourceModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Favorites
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set(['228-2500-227', '228-2500-009']);
    } catch {
      return new Set(['228-2500-227', '228-2500-009']);
    }
  });

  // Cache stats
  const [cacheStats, setCacheStats] = useState<{
    count: number;
    sizeMB: number;
    paths: Set<string>;
  }>({
    count: 0,
    sizeMB: 0,
    paths: new Set(),
  });

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  // Refresh cache status from IndexedDB
  const refreshCacheStats = useCallback(async () => {
    try {
      const stats = await getCacheStats();
      const pathSet = new Set(stats.items.map((i) => i.path.toLowerCase()));
      setCacheStats({
        count: stats.count,
        sizeMB: stats.totalBytes / (1024 * 1024),
        paths: pathSet,
      });
      return stats.count;
    } catch (e) {
      console.warn('Cache stats error', e);
      return 0;
    }
  }, []);

  // Check on initial mount whether to prompt data source modal
  useEffect(() => {
    refreshCacheStats().then((count) => {
      const shouldHide = localStorage.getItem(PREVENT_STARTUP_MODAL_KEY) === 'true';
      if (!shouldHide && count === 0) {
        setIsDataSourceModalOpen(true);
      }
    });
  }, [refreshCacheStats]);

  // Toggle favorite
  const handleToggleFavorite = (sku: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) {
        next.delete(sku);
        showToast(`Деталь ${sku} удалена из избранного`);
      } else {
        next.add(sku);
        showToast(`Деталь ${sku} добавлена в избранное`);
      }
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // Download single STL
  const handleDownloadPart = async (part: VexPartItem) => {
    showToast(`Подготовка STL файла для ${part.name}...`);
    try {
      await downloadPartSTL(part);
      refreshCacheStats();
      showToast(`Файл ${part.filename} успешно скачан!`);
    } catch (err) {
      console.error(err);
      showToast('Ошибка при подготовке STL файла');
    }
  };

  // Next / Previous part navigation
  const currentIndex = VEX_PARTS.findIndex((p) => p.id === selectedPart.id);
  const handleNextPart = () => {
    const nextIdx = (currentIndex + 1) % VEX_PARTS.length;
    setSelectedPart(VEX_PARTS[nextIdx]);
  };
  const handlePrevPart = () => {
    const prevIdx = (currentIndex - 1 + VEX_PARTS.length) % VEX_PARTS.length;
    setSelectedPart(VEX_PARTS[prevIdx]);
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ']') {
        handleNextPart();
      } else if (e.key === 'ArrowLeft' || e.key === '[') {
        handlePrevPart();
      } else if (e.key === 'f' || e.key === 'F') {
        handleToggleFavorite(selectedPart.sku);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, selectedPart.sku]);

  const isCurrentPartCached = cacheStats.paths.has(selectedPart.filename.toLowerCase());

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans">
      {/* Catalog Sidebar */}
      <CatalogSidebar
        parts={VEX_PARTS}
        selectedPart={selectedPart}
        onSelectPart={(p) => {
          setSelectedPart(p);
          if (window.innerWidth < 1024) {
            setIsSidebarOpen(false);
          }
        }}
        onDownloadStl={handleDownloadPart}
        onOpenFolderPicker={() => setIsDataSourceModalOpen(true)}
        onOpenDeployGuide={() => setIsDeployGuideOpen(true)}
        onOpenSettings={() => setIsStorageModalOpen(true)}
        cachedPaths={cacheStats.paths}
        favorites={favorites}
        onToggleFavorite={handleToggleFavorite}
        cacheCount={cacheStats.count}
        cacheSizeMB={cacheStats.sizeMB}
        isOpen={isSidebarOpen}
        onToggleOpen={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      {/* Main 3D Viewport Area */}
      <main className="flex-1 relative h-full flex flex-col min-w-0">
        {/* Top Floating App Bar */}
        <header className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none gap-2">
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Sidebar toggle button */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-lg transition-all cursor-pointer"
              title="Переключить каталог"
            >
              <Menu className="w-4 h-4 text-cyan-400" />
            </button>

            {/* Quick Prev / Next Part stepper */}
            <div className="flex items-center bg-slate-900/90 rounded-xl border border-slate-700/80 p-0.5 shadow-lg">
              <button
                onClick={handlePrevPart}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Предыдущая деталь ([ или ←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono text-slate-400 px-2 select-none hidden sm:inline">
                {currentIndex + 1} / {VEX_PARTS.length}
              </span>
              <button
                onClick={handleNextPart}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Следующая деталь (] или →)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Action Group */}
          <div className="flex items-center gap-2 pointer-events-auto flex-wrap justify-end">
            {/* Install PWA Button */}
            <PWAInstallButton />

            {/* Auto-load ZIP / GitHub Releases Button */}
            <button
              onClick={() => setIsDataSourceModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-700 to-cyan-600 hover:from-blue-600 hover:to-cyan-500 text-white shadow-lg shadow-cyan-950/40 border border-cyan-400/30 transition-all cursor-pointer"
              title="Загрузка архива ZIP с GitHub Releases или с диска"
            >
              <DownloadCloud className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Загрузить архив (ZIP / Releases)</span>
              <span className="md:hidden">ZIP</span>
              {cacheStats.count > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-950 text-cyan-300 font-mono">
                  {cacheStats.count}
                </span>
              )}
            </button>

            {/* Guide Button */}
            <button
              onClick={() => setIsDeployGuideOpen(true)}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900/90 hover:bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-lg transition-all cursor-pointer"
            >
              <FileCode className="w-3.5 h-3.5" />
              GitHub & CI/CD
            </button>

            {/* Storage Settings Button */}
            <button
              onClick={() => setIsStorageModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-700/80 shadow-lg transition-all cursor-pointer"
              title="Управление локальным кэшем и облачным хранилищем"
            >
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden xl:inline">Кэш</span>
            </button>
          </div>
        </header>

        {/* 3D Scene Viewport */}
        <div className="flex-1 w-full h-full">
          <VexViewer3D
            part={selectedPart}
            onDownloadStl={handleDownloadPart}
            isCached={isCurrentPartCached}
            onModelLoaded={(source) => {
              if (source === 'user-upload') {
                refreshCacheStats();
              }
            }}
          />
        </div>

        {/* Global Toast Notification */}
        {toastMessage && (
          <div className="absolute top-18 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl bg-slate-900/95 text-white text-xs font-medium border border-cyan-500/40 shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}
      </main>

      {/* Startup & Data Source Selector Modal */}
      <DataSourceModal
        isOpen={isDataSourceModalOpen}
        onClose={() => setIsDataSourceModalOpen(false)}
        cachedCount={cacheStats.count}
        onSuccess={(count) => {
          setIsDataSourceModalOpen(false);
          refreshCacheStats();
          showToast(`Успешно загружено и сохранено в кэш ${count} деталей VEX IQ!`);
        }}
      />

      {/* Deployment & Architecture Guide Modal */}
      <DeploymentGuideModal
        isOpen={isDeployGuideOpen}
        onClose={() => setIsDeployGuideOpen(false)}
      />

      {/* Storage Settings Modal */}
      <StorageSettingsModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
        cacheCount={cacheStats.count}
        cacheSizeMB={cacheStats.sizeMB}
        onCacheCleared={() => {
          refreshCacheStats();
          showToast('Кэш IndexedDB полностью очищен');
        }}
        onFilesImported={(count) => {
          refreshCacheStats();
          showToast(`Импортировано и сохранено в кэш ${count} файлов STL!`);
        }}
      />
    </div>
  );
}
