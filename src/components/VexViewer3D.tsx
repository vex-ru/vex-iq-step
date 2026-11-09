/**
 * High-performance 3D CAD Viewer for VEX IQ Parts
 * Adheres to Three.js architecture guidelines:
 * - Studio PBR environment lighting with RoomEnvironment
 * - OrbitControls with smooth damping and camera view presets
 * - Dimensions measurement bounding box overlay
 * - Binary STL parsing & procedural rendering
 * - Non-obstructive collapsible bottom dock
 * - Snapshot PNG generation
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { VexPartItem } from '../data/vexCatalog';
import { loadModelForPart, type ModelSourceType } from '../services/modelSource';
import {
  RotateCcw,
  Camera,
  Maximize2,
  Eye,
  Sliders,
  ChevronDown,
  ChevronUp,
  Ruler,
  SunMedium,
  Grid as GridIcon,
  Download,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
} from 'lucide-react';

export interface VexViewer3DProps {
  part: VexPartItem;
  onDownloadStl: (part: VexPartItem) => void;
  isCached: boolean;
  onModelLoaded?: (source: ModelSourceType) => void;
}

// Authentic VEX IQ color palette
export const VEX_COLORS = [
  { name: 'VEX Teal', hex: 0x00a3e0, css: '#00a3e0' },
  { name: 'Dark Gray', hex: 0x334155, css: '#334155' },
  { name: 'Competition Red', hex: 0xe11d48, css: '#e11d48' },
  { name: 'Safety Orange', hex: 0xf97316, css: '#f97316' },
  { name: 'Pure White', hex: 0xf8fafc, css: '#f8fafc' },
  { name: 'Cobalt Blue', hex: 0x2563eb, css: '#2563eb' },
  { name: 'Lime Green', hex: 0x65a30d, css: '#65a30d' },
  { name: 'Cyber Yellow', hex: 0xeab308, css: '#eab308' },
];

export const VexViewer3D: React.FC<VexViewer3DProps> = ({
  part,
  onDownloadStl,
  isCached,
  onModelLoaded,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // UI state
  const [currentColor, setCurrentColor] = useState<number>(0x00a3e0);
  const [isWireframe, setIsWireframe] = useState<boolean>(false);
  const [isAutoRotate, setIsAutoRotate] = useState<boolean>(false);
  const [showDimensions, setShowDimensions] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [currentSource, setCurrentSource] = useState<ModelSourceType>('procedural');
  const [modelBounds, setModelBounds] = useState<{
    width: number;
    height: number;
    depth: number;
    pitches: string;
  }>({ width: 0, height: 0, depth: 0, pitches: '' });

  // Three.js internal references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const currentModelGroupRef = useRef<THREE.Object3D | null>(null);
  const bboxHelperRef = useRef<THREE.BoxHelper | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const requestRef = useRef<number>(0);
  const currentPartIdRef = useRef<number>(part.id);

  // Keep part ref updated
  useEffect(() => {
    currentPartIdRef.current = part.id;
  }, [part.id]);

  // Initialize Three.js Scene once on mount
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect software WebGL
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.003);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 1, 2000);
    camera.position.set(70, 60, 90);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // Studio Environment map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Studio 3-Point Lighting Rig
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x0f172a, 0.9);
    hemiLight.position.set(0, 100, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(80, 120, 60);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 400;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
    fillLight.position.set(-80, 50, -60);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffedd5, 1.0);
    rimLight.position.set(0, 70, -100);
    scene.add(rimLight);

    // Engineering Ground Grid (12.7 mm pitch markers)
    const grid = new THREE.GridHelper(254, 20, 0x0284c7, 0x1e293b);
    grid.position.y = -0.1;
    scene.add(grid);
    gridHelperRef.current = grid;

    // Soft Contact Shadow Plane
    const shadowGeo = new THREE.PlaneGeometry(160, 160);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.45)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const shadowTex = new THREE.CanvasTexture(canvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.05;
    scene.add(shadowMesh);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 600;
    controls.minDistance = 10;
    controls.maxPolarAngle = Math.PI / 2 + 0.15; // Allow looking slightly from below
    controls.target.set(0, 10, 0);
    controlsRef.current = controls;

    // Render loop
    let lastTime = performance.now();
    const animate = (time: number) => {
      requestRef.current = requestAnimationFrame(animate);
      const delta = (time - lastTime) / 1000;
      lastTime = time;

      if (controlsRef.current) {
        controlsRef.current.update();
      }

      if (currentModelGroupRef.current && isAutoRotate) {
        currentModelGroupRef.current.rotation.y += 0.8 * delta;
      }

      renderer.render(scene, camera);
    };

    requestRef.current = requestAnimationFrame(animate);

    // Resize Observer
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(requestRef.current);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Sync auto rotate
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = isAutoRotate;
      controlsRef.current.autoRotateSpeed = 2.0;
    }
  }, [isAutoRotate]);

  // Sync grid visibility
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // Load and swap model when active part changes
  useEffect(() => {
    let active = true;

    async function loadPartModel() {
      const scene = sceneRef.current;
      const controls = controlsRef.current;
      const camera = cameraRef.current;
      if (!scene || !controls || !camera) return;

      // Remove previous model and helpers
      if (currentModelGroupRef.current) {
        scene.remove(currentModelGroupRef.current);
        currentModelGroupRef.current = null;
      }
      if (bboxHelperRef.current) {
        scene.remove(bboxHelperRef.current);
        bboxHelperRef.current = null;
      }

      try {
        const result = await loadModelForPart(part, currentColor);
        if (!active) return;

        const modelObj = result.object;
        scene.add(modelObj);
        currentModelGroupRef.current = modelObj;
        setCurrentSource(result.source);
        if (onModelLoaded) onModelLoaded(result.source);

        // Apply wireframe and current color
        applyColorAndWireframe(modelObj, currentColor, isWireframe);

        // Calculate bounding box and dimensions in mm and VEX pitches
        const box = new THREE.Box3().setFromObject(modelObj);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Pitch calculations (1 Pitch = 12.7 mm)
        const pitchX = (size.x / 12.7).toFixed(1);
        const pitchY = (size.y / 12.7).toFixed(1);
        const pitchZ = (size.z / 12.7).toFixed(1);

        setModelBounds({
          width: Math.round(size.x * 10) / 10,
          height: Math.round(size.y * 10) / 10,
          depth: Math.round(size.z * 10) / 10,
          pitches: `${pitchX}P × ${pitchZ}P × ${pitchY}P`,
        });

        // Add sleek bounding box helper if dimensions enabled
        const boxHelper = new THREE.BoxHelper(modelObj, 0x38bdf8);
        boxHelper.visible = showDimensions;
        scene.add(boxHelper);
        bboxHelperRef.current = boxHelper;

        // Auto-frame camera smoothly based on object bounding sphere
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        const radius = Math.max(sphere.radius, 15);
        const dist = radius * 2.8;

        controls.target.set(0, size.y / 2, 0);
        camera.position.set(dist * 0.75, dist * 0.65, dist * 0.9);
        camera.lookAt(controls.target);
        controls.update();
      } catch (err) {
        console.error('Failed to load part model:', err);
      }
    }

    loadPartModel();

    return () => {
      active = false;
    };
  }, [part.id]);

  // Update material color and wireframe dynamically
  useEffect(() => {
    if (currentModelGroupRef.current) {
      applyColorAndWireframe(currentModelGroupRef.current, currentColor, isWireframe);
    }
  }, [currentColor, isWireframe]);

  // Update bbox helper visibility
  useEffect(() => {
    if (bboxHelperRef.current) {
      bboxHelperRef.current.visible = showDimensions;
    }
  }, [showDimensions]);

  function applyColorAndWireframe(obj: THREE.Object3D, colorHex: number, wireframe: boolean) {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (!mesh.material) return;

        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => {
            if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
              const stdMat = mat as THREE.MeshStandardMaterial;
              stdMat.color.setHex(colorHex);
              stdMat.wireframe = wireframe;
              stdMat.needsUpdate = true;
            }
          });
        } else if ((mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          const stdMat = mesh.material as THREE.MeshStandardMaterial;
          stdMat.color.setHex(colorHex);
          stdMat.wireframe = wireframe;
          stdMat.needsUpdate = true;
        }
      }
    });
  }

  // Camera preset views
  const setCameraView = (view: 'iso' | 'top' | 'front' | 'right') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !currentModelGroupRef.current) return;

    const box = new THREE.Box3().setFromObject(currentModelGroupRef.current);
    const size = new THREE.Vector3();
    box.getSize(size);
    const radius = Math.max(size.length() / 2, 20);
    const dist = radius * 2.8;

    const targetY = size.y / 2;
    controls.target.set(0, targetY, 0);

    switch (view) {
      case 'iso':
        camera.position.set(dist * 0.75, dist * 0.65, dist * 0.9);
        break;
      case 'top':
        camera.position.set(0, dist * 1.5, 0.001);
        break;
      case 'front':
        camera.position.set(0, targetY, dist * 1.3);
        break;
      case 'right':
        camera.position.set(dist * 1.3, targetY, 0);
        break;
    }
    camera.lookAt(0, targetY, 0);
    controls.update();
  };

  // Reset View
  const handleResetCamera = () => {
    setCameraView('iso');
  };

  // Capture High-Res Snapshot
  const handleCaptureSnapshot = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    // Render current frame
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `VEX_IQ_${part.sku}_${part.name.replace(/\s+/g, '_')}_render.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="relative w-full h-full select-none bg-slate-950 overflow-hidden">
      {/* Three.js Isolated Canvas Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Left: Part Header & Spec Badge (Floating Minimal) */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-cyan-950/80 text-cyan-400 border border-cyan-500/30 shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            {part.sku}
          </span>
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800/80 text-slate-300 border border-slate-700/60">
            {part.categoryName.split(' ')[0]}
          </span>
          {isCached ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3" />
              Кэшировано (Offline)
            </span>
          ) : currentSource === 'user-upload' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-950/80 text-blue-400 border border-blue-500/30">
              <Layers className="w-3 h-3" />
              Локальный STL
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/80 text-amber-300 border border-amber-500/30">
              <Sparkles className="w-3 h-3" />
              CAD Генерация
            </span>
          )}
        </div>

        <h1 className="text-xl font-bold text-white tracking-tight drop-shadow-md">
          {part.name}
        </h1>

        {/* Real Dimensions & Pitch HUD */}
        {modelBounds.width > 0 && (
          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-0.5 bg-slate-900/70 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 pointer-events-auto">
            <span className="flex items-center gap-1 text-slate-200">
              <Ruler className="w-3.5 h-3.5 text-cyan-400" />
              {modelBounds.width} × {modelBounds.depth} × {modelBounds.height} мм
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-amber-400 font-medium">
              Шаг: {modelBounds.pitches}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">
              Вес файла: {part.sizeStr}
            </span>
          </div>
        )}
      </div>

      {/* Top Right: Quick Action Buttons */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          onClick={handleCaptureSnapshot}
          title="Сделать снимок рендера (PNG)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900/90 text-slate-200 hover:text-white hover:bg-slate-800 border border-slate-700/80 shadow-md transition-all cursor-pointer"
        >
          <Camera className="w-3.5 h-3.5 text-cyan-400" />
          Снимок PNG
        </button>

        <button
          onClick={() => onDownloadStl(part)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-950/40 border border-cyan-400/40 transition-all cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Скачать STL
        </button>
      </div>

      {/* Floating Camera Angle Selector (Top-right below buttons) */}
      <div className="absolute top-16 right-4 z-10 flex flex-col gap-1 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800/80 shadow-xl">
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 px-2 py-0.5">
          Вид
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setCameraView('iso')}
            className="px-2 py-1 text-xs font-mono font-medium rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Изометрический вид"
          >
            ISO
          </button>
          <button
            onClick={() => setCameraView('top')}
            className="px-2 py-1 text-xs font-mono font-medium rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Вид сверху"
          >
            Сверху
          </button>
          <button
            onClick={() => setCameraView('front')}
            className="px-2 py-1 text-xs font-mono font-medium rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Вид спереди"
          >
            Спереди
          </button>
          <button
            onClick={() => setCameraView('right')}
            className="px-2 py-1 text-xs font-mono font-medium rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Вид сбоку"
          >
            Сбоку
          </button>
        </div>
      </div>

      {/* Collapsible Bottom Control Dock (Follows Three.js Ergonomic Bottom Dock Specification) */}
      <div
        className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[95%] max-w-4xl transition-all duration-300 ease-in-out ${
          isDockCollapsed ? 'translate-y-[calc(100%-28px)]' : 'translate-y-0'
        }`}
      >
        {/* Dock Header / Collapse Toggle Bar */}
        <div className="flex justify-center -mb-2">
          <button
            onClick={() => setIsDockCollapsed(!isDockCollapsed)}
            className="flex items-center gap-1.5 px-4 py-1 rounded-t-lg bg-slate-900/95 text-slate-300 hover:text-white border-t border-x border-slate-700/80 text-xs font-medium cursor-pointer transition-colors shadow-lg"
          >
            {isDockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
                Панель управления 3D
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
                Свернуть панель
              </>
            )}
          </button>
        </div>

        {/* Dock Body */}
        <div className="bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-700/70 p-3 shadow-2xl flex flex-wrap items-center justify-between gap-3">
          {/* Section 1: Color Finish Swatches */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
              Цвет VEX:
            </span>
            <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
              {VEX_COLORS.map((col) => (
                <button
                  key={col.name}
                  onClick={() => setCurrentColor(col.hex)}
                  title={col.name}
                  style={{ backgroundColor: col.css }}
                  className={`w-5 h-5 rounded-full transition-transform cursor-pointer border ${
                    currentColor === col.hex
                      ? 'scale-125 ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-900 border-white'
                      : 'border-white/20 hover:scale-110'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Section 2: Viewport Modes (Wireframe, Grid, Dimensions, Auto-Rotate) */}
          <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setIsAutoRotate(!isAutoRotate)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                isAutoRotate
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Вращать модель 360°"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Вращение
            </button>

            <button
              onClick={() => setIsWireframe(!isWireframe)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                isWireframe
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Сетка полигонов (Wireframe)"
            >
              <Eye className="w-3.5 h-3.5" />
              Полисетка
            </button>

            <button
              onClick={() => setShowDimensions(!showDimensions)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                showDimensions
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Габаритная рамка (Bounding Box)"
            >
              <Ruler className="w-3.5 h-3.5" />
              Размеры
            </button>

            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                showGrid
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Инженерная сетка стола (Grid)"
            >
              <GridIcon className="w-3.5 h-3.5" />
              Сетка
            </button>
          </div>

          {/* Section 3: Reset View & Controls Hint */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetCamera}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
              title="Сбросить положение камеры"
            >
              Сброс камеры
            </button>
            <span className="hidden sm:inline text-[11px] text-slate-400">
              ЛКМ: Вращение • ПКМ: Панорама • Колесо: Зум
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
