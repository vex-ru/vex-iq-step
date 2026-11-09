import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Monitor, CheckCircle, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return (
      <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
        <CheckCircle className="w-3.5 h-3.5" />
        Приложение установлено
      </span>
    );
  }

  // Desktop / Android flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/40 border border-cyan-400/40 transition-all cursor-pointer"
        title="Установить как автономное приложение на компьютер или телефон"
      >
        <Monitor className="w-3.5 h-3.5" />
        Установить как приложение
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 transition-all cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Установить на iOS
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">Установка на iPhone / iPad</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                1. Нажмите кнопку <strong>Поделиться</strong> (Share) в нижней панели Safari.<br />
                2. Прокрутите список и выберите <strong>«На экран Домой»</strong> (Add to Home Screen).<br />
                3. Приложение появится на рабочем столе и будет работать офлайн!
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-cyan-600 py-2 text-xs font-semibold text-white hover:bg-cyan-500 transition-colors cursor-pointer"
              >
                Понятно
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback button that explains installability or triggers prompt
  return (
    <button
      onClick={() => {
        alert(
          'Чтобы установить приложение: в строке браузера (Chrome, Edge) нажмите иконку установки (значок монитора со стрелкой) или меню браузера -> "Установить приложение VEX IQ 3D".'
        );
      }}
      className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition-all cursor-pointer"
      title="Установить PWA веб-приложение"
    >
      <Monitor className="w-3.5 h-3.5 text-cyan-400" />
      Установить PWA
    </button>
  );
};
