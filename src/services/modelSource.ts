/**
 * Multi-Source Model Loader & Storage Resolver for VEX IQ 3D Models
 * Supports:
 * 1. Local IndexedDB cache (instant offline load)
 * 2. User-dropped local files or folder (HTML5 File System / Directory drop)
 * 3. Remote Cloud Storage (Cloudflare R2, AWS S3, GitHub Releases, Git LFS CDN)
 * 4. High-precision procedural 3D model fallback with auto-caching and STL export
 */

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { VexPartItem } from '../data/vexCatalog';
import { getCachedModel, saveCachedModel } from './modelCache';
import { createVexProceduralMesh, exportGroupToBinarySTL } from '../three/proceduralVexParts';

export type ModelSourceType = 'cache' | 'user-upload' | 'remote' | 'procedural';

export interface LoadedModelResult {
  object: THREE.Object3D;
  source: ModelSourceType;
  arrayBuffer?: ArrayBuffer;
  geometry?: THREE.BufferGeometry;
}

// In-memory registry of files uploaded by user in the current session
const userLoadedFiles = new Map<string, { buffer: ArrayBuffer; filename: string }>();

// Storage settings stored in localStorage
const STORAGE_CONFIG_KEY = 'vex_iq_storage_config_v1';

export interface StorageConfig {
  remoteBaseUrl: string;
  enableRemoteFetch: boolean;
  preferProceduralFallback: boolean;
  gitRepoOwner: string;
  gitRepoName: string;
  gitReleaseTag: string;
}

const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  remoteBaseUrl: '', // e.g. "https://raw.githubusercontent.com/user/vex-iq-cad/main/"
  enableRemoteFetch: true,
  preferProceduralFallback: true,
  gitRepoOwner: 'my-org',
  gitRepoName: 'vex-iq-models',
  gitReleaseTag: 'v1.0.0',
};

export function getStorageConfig(): StorageConfig {
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (raw) return { ...DEFAULT_STORAGE_CONFIG, ...JSON.parse(raw) };
  } catch {
    // fallback
  }
  return DEFAULT_STORAGE_CONFIG;
}

export function saveStorageConfig(config: Partial<StorageConfig>): StorageConfig {
  const current = getStorageConfig();
  const updated = { ...current, ...config };
  try {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save storage config', e);
  }
  return updated;
}

/**
 * Register files chosen from a folder or dragged & dropped by the user
 */
export async function registerLocalFiles(
  fileList: FileList | File[],
  onProgress?: (loaded: number, total: number) => void
): Promise<number> {
  const files = Array.from(fileList);
  let indexedCount = 0;
  const total = files.length;

  for (let i = 0; i < total; i++) {
    const file = files[i];
    const nameLower = file.name.toLowerCase();
    if (!nameLower.endsWith('.stl') && !nameLower.endsWith('.3mf')) {
      continue;
    }

    try {
      const buffer = await file.arrayBuffer();
      // Store under filename and full relative path if available
      const relPath = (file as any).webkitRelativePath || file.name;
      const key = relPath.toLowerCase();

      userLoadedFiles.set(key, { buffer, filename: file.name });
      userLoadedFiles.set(file.name.toLowerCase(), { buffer, filename: file.name });

      // Save into IndexedDB cache for offline access across reloads
      await saveCachedModel(file.name, buffer, 'user-upload');
      if (relPath !== file.name) {
        await saveCachedModel(relPath, buffer, 'user-upload');
      }

      indexedCount++;
    } catch (err) {
      console.warn('Failed reading file:', file.name, err);
    }

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return indexedCount;
}

/**
 * Load 3D model for a given VEX IQ part
 */
export async function loadModelForPart(
  part: VexPartItem,
  materialColor = 0x00a3e0,
  onProgress?: (percent: number) => void
): Promise<LoadedModelResult> {
  const stlLoader = new STLLoader();

  // 1. Check local session memory first
  const memoryKey = part.filename.toLowerCase();
  if (userLoadedFiles.has(memoryKey)) {
    const { buffer } = userLoadedFiles.get(memoryKey)!;
    const geometry = stlLoader.parse(buffer);
    geometry.computeVertexNormals();
    centerGeometry(geometry);

    const mat = createDefaultPartMaterial(materialColor);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return {
      object: mesh,
      source: 'user-upload',
      arrayBuffer: buffer,
      geometry,
    };
  }

  // 2. Check IndexedDB persistent cache
  const cachedBuffer = await getCachedModel(part.filename);
  if (cachedBuffer) {
    try {
      const geometry = stlLoader.parse(cachedBuffer);
      geometry.computeVertexNormals();
      centerGeometry(geometry);

      const mat = createDefaultPartMaterial(materialColor);
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      return {
        object: mesh,
        source: 'cache',
        arrayBuffer: cachedBuffer,
        geometry,
      };
    } catch (err) {
      console.warn('Failed to parse cached STL:', err);
    }
  }

  // 3. Try Remote URL if configured
  const config = getStorageConfig();
  if (config.enableRemoteFetch && config.remoteBaseUrl) {
    try {
      const trimmedBase = config.remoteBaseUrl.replace(/\/+$/, '');
      const remoteUrl = `${trimmedBase}/${part.relativePath}`;

      const res = await fetch(remoteUrl);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        await saveCachedModel(part.filename, buffer, 'remote');

        const geometry = stlLoader.parse(buffer);
        geometry.computeVertexNormals();
        centerGeometry(geometry);

        const mat = createDefaultPartMaterial(materialColor);
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return {
          object: mesh,
          source: 'remote',
          arrayBuffer: buffer,
          geometry,
        };
      }
    } catch {
      // Remote fetch failed, fallback seamlessly
    }
  }

  // 4. Procedural CAD Generation Fallback
  // Produces an authentic parametric 3D model adhering to VEX IQ engineering standards
  const proceduralGroup = createVexProceduralMesh(part);
  applyMaterialToGroup(proceduralGroup, materialColor);

  // Generate binary STL so user can download it or cache it
  const proceduralSTL = exportGroupToBinarySTL(proceduralGroup, part.name);
  saveCachedModel(part.filename, proceduralSTL, 'procedural').catch(() => {});

  return {
    object: proceduralGroup,
    source: 'procedural',
    arrayBuffer: proceduralSTL,
  };
}

function centerGeometry(geom: THREE.BufferGeometry) {
  geom.computeBoundingBox();
  if (geom.boundingBox) {
    const center = new THREE.Vector3();
    geom.boundingBox.getCenter(center);
    geom.translate(-center.x, -geom.boundingBox.min.y, -center.z);
  }
}

export function createDefaultPartMaterial(colorHex: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.35,
    metalness: 0.12,
  });
}

function applyMaterialToGroup(group: THREE.Group, colorHex: number) {
  const mat = createDefaultPartMaterial(colorHex);
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      (child as THREE.Mesh).material = mat;
      (child as THREE.Mesh).castShadow = true;
      (child as THREE.Mesh).receiveShadow = true;
    }
  });
}
