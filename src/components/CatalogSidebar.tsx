/**
 * Catalog Sidebar with instant SKU & Name search, category filters,
 * local folder dropzone, favorites, and cache indicators.
 */

import React, { useState, useMemo } from 'react';
import type { VexPartItem, VexCategory } from '../data/vexCatalog';
import { VEX_CATEGORIES } from '../data/vexCatalog';
import {
  Search,
  Filter,
  FolderUp,
  Star,
  CheckCircle2,
  HardDrive,
  Download,
  Layers,
  Grid,
  Cog,
  ChevronsLeftRight,
  Pin,
  Disc,
  Zap,
  Wrench,
  Box,
  X,
  FileCode,
} from 'lucide-react';

export interface CatalogSidebarProps {
  parts: VexPartItem[];
  selectedPart: VexPartItem;
  onSelectPart: (part: VexPartItem) => void;
  onDownloadStl: (part: VexPartItem) => void;
  onOpenFolderPicker: () => void;
  onOpenDeployGuide: () => void;
  onOpenSettings: () => void;
  cachedPaths: Set<string>;
  favorites: Set<string>;
  onToggleFavorite: (sku: string) => void;
  cacheCount: number;
  cacheSizeMB: number;
  isOpen: boolean;
  onToggleOpen: () => void;
}

const CATEGORY_ICONS: Record<string, React.FC<{ className?: string }>> = {
  '01_Beams': Layers,
  '02_Plates_and_Panels': Grid,
  '03_Connectors_and_Corners': Box,
  '04_Gears_and_Sprockets': Cog,
  '05_Shafts_Standoffs_and_Spacers': ChevronsLeftRight,
  '06_Pins': Pin,
  '07_Wheels_Tires_and_Pulleys': Disc,
  '08_Motors_and_Power': Zap,
  '09_Specialty_Mechanisms_and_Misc': Wrench,
  '99_Other': Box,
};

export const CatalogSidebar: React.FC<CatalogSidebarProps> = ({
  parts,
  selectedPart,
  onSelectPart,
  onDownloadStl,
  onOpenFolderPicker,
  onOpenDeployGuide,
  onOpenSettings,
  cachedPaths,
  favorites,
  onToggleFavorite,
  cacheCount,
  cacheSizeMB,
  isOpen,
  onToggleOpen,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyCached, setOnlyCached] = useState(false);

  // Quick filter categories
  const filteredParts = useMemo(() => {
    return parts.filter((part) => {
      // 1. Search Query (SKU or Name or pitch)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesSku = part.sku.toLowerCase().includes(q);
        const matchesName = part.name.toLowerCase().includes(q);
        const matchesFilename = part.filename.toLowerCase().includes(q);
        const matchesPitch = (part.pitchDimensions || '').toLowerCase().includes(q);
        if (!matchesSku && !matchesName && !matchesFilename && !matchesPitch) {
          return false;
        }
      }

      // 2. Category filter
      if (selectedCategory !== 'ALL' && part.categoryId !== selectedCategory) {
        return false;
      }

      // 3. Type filter
      if (activeTypeFilter !== 'all' && part.partType !== activeTypeFilter) {
        return false;
      }

      // 4. Favorites filter
      if (onlyFavorites && !favorites.has(part.sku)) {
        return false;
      }

      // 5. Cached filter
      if (onlyCached && !cachedPaths.has(part.filename.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [parts, searchQuery, selectedCategory, activeTypeFilter, onlyFavorites, onlyCached, favorites, cachedPaths]);

  const quickTypes = [
    { id: 'all', label: 'Все' },
    { id: 'beam', label: 'Балки' },
    { id: 'gear', label: 'Шестерни' },
    { id: 'wheel', label: 'Колёса' },
    { id: 'shaft', label: 'Оси' },
    { id: 'pin', label: 'Пины' },
    { id: 'plate', label: 'Пластины' },
    { id: 'connector', label: 'Уголки' },
  ];

  return (
    <aside
      className={`fixed lg:relative inset-y-0 left-0 z-30 w-80 sm:w-96 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-800/80 bg-slate-950/60">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center shadow-lg shadow-cyan-900/50">
              <Box className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight leading-none">
                VEX IQ 3D CAD
              </h2>
              <span className="text-[11px] text-slate-400 font-mono">
                Каталог: 476 деталей
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onOpenFolderPicker}
              title="Загрузить папку STL с компьютера"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-slate-700 transition-colors cursor-pointer"
            >
              <FolderUp className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleOpen}
              className="lg:hidden p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search input with SKU highlighting */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по артикулу (напр. 228-2500-213) или имени..."
            className="w-full pl-9 pr-8 py-2 bg-slate-950 rounded-xl text-xs text-white placeholder-slate-500 border border-slate-700/80 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-slate-500 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick Type Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-2 scrollbar-none">
          {quickTypes.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTypeFilter(t.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeTypeFilter === t.id
                  ? 'bg-cyan-600 text-white shadow'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filter Toggle Badges (Favorites, Cached only) */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60 mt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOnlyFavorites(!onlyFavorites)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                onlyFavorites
                  ? 'bg-amber-950/80 text-amber-400 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Star className="w-3 h-3 fill-current" />
              Избранное ({favorites.size})
            </button>
            <button
              onClick={() => setOnlyCached(!onlyCached)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                onlyCached
                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              В кэше ({cacheCount})
            </button>
          </div>

          <span className="text-[11px] text-slate-400 font-mono">
            {filteredParts.length} из {parts.length}
          </span>
        </div>
      </div>

      {/* Category selector dropdown */}
      <div className="px-4 py-2 bg-slate-950/30 border-b border-slate-800/80">
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-cyan-500 cursor-pointer"
        >
          <option value="ALL">Все категории (10 разделов)</option>
          {VEX_CATEGORIES.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name} ({cat.count})
            </option>
          ))}
        </select>
      </div>

      {/* Parts List Scroll View */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 p-2">
        {filteredParts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
            <p className="font-medium text-slate-400">Детали не найдены</p>
            <p className="mt-1 text-[11px]">
              Попробуйте изменить поисковый запрос или сбросить фильтры.
            </p>
          </div>
        ) : (
          filteredParts.map((item) => {
            const isSelected = selectedPart.id === item.id;
            const isItemCached = cachedPaths.has(item.filename.toLowerCase());
            const isFav = favorites.has(item.sku);
            const Icon = CATEGORY_ICONS[item.categoryId] || Box;

            return (
              <div
                key={item.id}
                onClick={() => onSelectPart(item)}
                className={`group flex items-start gap-2.5 p-2.5 rounded-xl transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-950/50 border border-cyan-500/50 shadow-md'
                    : 'hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                {/* Part icon badge */}
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-800 text-slate-400 group-hover:text-cyan-400 group-hover:bg-slate-700'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-xs font-mono font-bold tracking-tight truncate ${
                        isSelected ? 'text-cyan-300' : 'text-slate-200'
                      }`}
                    >
                      {item.sku}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {isItemCached && (
                        <span title="Сохранено в локальном кэше (Offline доступ)">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(item.sku);
                        }}
                        className="text-slate-500 hover:text-amber-400 p-0.5 cursor-pointer"
                        title={isFav ? 'Удалить из избранного' : 'Добавить в избранное'}
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            isFav ? 'fill-amber-400 text-amber-400' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <p className="text-[12px] text-slate-300 font-medium line-clamp-1 leading-snug mt-0.5">
                    {item.name}
                  </p>

                  <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-mono">
                    {item.pitchDimensions && (
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-amber-400 font-medium">
                        {item.pitchDimensions}
                      </span>
                    )}
                    <span>{item.sizeStr}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-400 truncate">
                      {item.categoryName.split(' ')[0]}
                    </span>
                  </div>
                </div>

                {/* Quick Download STL Icon on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownloadStl(item);
                  }}
                  title="Скачать STL"
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-cyan-400 transition-opacity cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer / Storage & Architecture Hub */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            Кэш IndexedDB:
          </span>
          <span className="font-mono text-slate-300">
            {cacheCount} мод. ({cacheSizeMB.toFixed(1)} МБ)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onOpenDeployGuide}
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/20 transition-colors cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5" />
            GitHub / Cloud
          </button>

          <button
            onClick={onOpenSettings}
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
          >
            <FolderUp className="w-3.5 h-3.5" />
            Хранилище
          </button>
        </div>
      </div>
    </aside>
  );
};
