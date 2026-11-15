/**
 * Service for streaming download, extraction, and indexing of VEX IQ STL models
 * from ZIP archives (either remote GitHub Releases URL or local computer file).
 */

import JSZip from 'jszip';
import { saveCachedModel } from './modelCache';

export interface ZipLoadProgress {
  stage: 'downloading' | 'unzipping' | 'indexing' | 'completed' | 'error';
  percent: number;
  message: string;
  processedCount: number;
  totalCount: number;
}

/**
 * Resolves a standard GitHub Releases download URL to the CORS-enabled GitHub REST Asset API endpoint.
 */
async function tryFetchViaGitHubApi(url: string): Promise<Response | null> {
  const match = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/(.+)$/i
  );
  if (!match) return null;

  const [, owner, repo, rawTag, rawFilename] = match;
  const filename = decodeURIComponent(rawFilename);
  const tagApiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(rawTag)}`;

  const relResp = await fetch(tagApiUrl, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!relResp.ok) return null;

  const releaseData = await relResp.json();
  const assets: Array<{ id: number; name: string }> = releaseData?.assets || [];
  const asset = assets.find((a) => a.name.toLowerCase() === filename.toLowerCase());
  if (!asset) return null;

  return await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${asset.id}`, {
    headers: { Accept: 'application/octet-stream' },
  });
}

/**
 * Downloads a ZIP file from a URL with progress reporting and extracts all STL/3MF models
 */
export async function loadModelsFromZipUrl(
  url: string,
  onProgress: (progress: ZipLoadProgress) => void
): Promise<{ count: number; filenames: string[] }> {
  try {
    onProgress({
      stage: 'downloading',
      percent: 5,
      message: 'Подключение к серверу загрузки...',
      processedCount: 0,
      totalCount: 0,
    });

    let response: Response | null = null;
    try {
      response = await tryFetchViaGitHubApi(url);
    } catch {
      response = null;
    }

    if (!response) {
      response = await fetch(url);
    }

    if (!response.ok) {
      throw new Error(`Ошибка загрузки архива: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

    let buffer: ArrayBuffer;

    if (response.body && totalBytes > 0) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedBytes += value.length;

        const downloadPct = Math.min(80, Math.round((receivedBytes / totalBytes) * 75) + 5);
        const mbReceived = (receivedBytes / (1024 * 1024)).toFixed(1);
        const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);

        onProgress({
          stage: 'downloading',
          percent: downloadPct,
          message: `Скачивание архива моделей: ${mbReceived} из ${mbTotal} МБ (${downloadPct}%)`,
          processedCount: receivedBytes,
          totalCount: totalBytes,
        });
      }

      // Combine chunks into single ArrayBuffer
      const combined = new Uint8Array(receivedBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      buffer = combined.buffer;
    } else {
      onProgress({
        stage: 'downloading',
        percent: 50,
        message: 'Скачивание архива моделей...',
        processedCount: 0,
        totalCount: 0,
      });
      buffer = await response.arrayBuffer();
    }

    return await loadModelsFromZipBuffer(buffer, onProgress, 'remote');
  } catch (error: any) {
    const rawMsg = error?.message || 'Не удалось загрузить архив';
    const isCorsOrNetwork =
      error instanceof TypeError ||
      /failed to fetch|networkerror|cors|load failed/i.test(rawMsg);

    const friendlyMessage = isCorsOrNetwork
      ? 'Браузер заблокировал прямой CORS-запрос к GitHub Releases. Нажмите «Скачать ZIP вручную» ниже и откройте его во вкладке «Локальный ZIP» (или используйте нативное Rust-приложение).'
      : `Ошибка: ${rawMsg}`;

    onProgress({
      stage: 'error',
      percent: 0,
      message: friendlyMessage,
      processedCount: 0,
      totalCount: 0,
    });
    throw error;
  }
}

/**
 * Extracts and caches all STL/3MF models from an ArrayBuffer of a ZIP file
 */
export async function loadModelsFromZipBuffer(
  buffer: ArrayBuffer,
  onProgress: (progress: ZipLoadProgress) => void,
  source: 'remote' | 'user-upload' = 'user-upload'
): Promise<{ count: number; filenames: string[] }> {
  try {
    onProgress({
      stage: 'unzipping',
      percent: 80,
      message: 'Чтение структуры ZIP архива...',
      processedCount: 0,
      totalCount: 0,
    });

    const zip = await JSZip.loadAsync(buffer);
    const entries: { name: string; file: JSZip.JSZipObject }[] = [];

    zip.forEach((relativePath, file) => {
      const lower = relativePath.toLowerCase();
      if (!file.dir && (lower.endsWith('.stl') || lower.endsWith('.3mf'))) {
        entries.push({ name: relativePath, file });
      }
    });

    const totalCount = entries.length;
    if (totalCount === 0) {
      throw new Error('В архиве не найдено файлов моделей .stl или .3mf');
    }

    onProgress({
      stage: 'indexing',
      percent: 85,
      message: `Найдено ${totalCount} моделей деталей. Сохранение в IndexedDB...`,
      processedCount: 0,
      totalCount,
    });

    const savedFilenames: string[] = [];

    // Process and save into IndexedDB in chunks
    for (let i = 0; i < totalCount; i++) {
      const { name, file } = entries[i];
      const modelBuffer = await file.async('arraybuffer');
      const filenameOnly = name.split('/').pop() || name;

      // Cache under filename and normalized path
      await saveCachedModel(filenameOnly, modelBuffer, source);
      await saveCachedModel(name, modelBuffer, source);
      savedFilenames.push(filenameOnly);

      if (i % 5 === 0 || i === totalCount - 1) {
        const pct = 85 + Math.round(((i + 1) / totalCount) * 15);
        onProgress({
          stage: 'indexing',
          percent: pct,
          message: `Распаковано: ${i + 1} из ${totalCount} деталей (${filenameOnly.slice(0, 30)}...)`,
          processedCount: i + 1,
          totalCount,
        });
      }
    }

    onProgress({
      stage: 'completed',
      percent: 100,
      message: `Успешно сохранено ${savedFilenames.length} моделей в локальный кэш!`,
      processedCount: savedFilenames.length,
      totalCount,
    });

    return { count: savedFilenames.length, filenames: savedFilenames };
  } catch (error: any) {
    onProgress({
      stage: 'error',
      percent: 0,
      message: `Ошибка распаковки: ${error.message || 'Сбой распаковки архива'}`,
      processedCount: 0,
      totalCount: 0,
    });
    throw error;
  }
}
