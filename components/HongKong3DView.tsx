"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, Minus, Plus, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { TilesRenderer, WGS84_ELLIPSOID } from "3d-tiles-renderer/three";
import { GLTFExtensionsPlugin } from "3d-tiles-renderer/three/plugins";
import { LoadingState } from "@/components/LoadingState";

type Props = { lat: number; lng: number; heading: number; active: boolean; language: "en" | "zh" };

export default function HongKong3DView({ lat, lng, heading, active, language }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<{ reset: () => void; zoom: (factor: number) => void } | null>(null);
  const latest = useRef({ active, heading });
  latest.current = { active, heading };
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const zh = language === "zh";

  useEffect(() => {
    const container = host.current!;
    setStatus("loading");
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setStatus("error");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0xe8eef0);
    renderer.domElement.setAttribute("aria-label", "Hong Kong 3D map");
    renderer.domElement.tabIndex = 0;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9294, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-300, -200, 800);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 20_000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 60;
    controls.maxDistance = 2500;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.screenSpacePanning = false;
    controls.listenToKeyEvents(renderer.domElement);
    const tiles = new TilesRenderer("/api/open3dhk/tiles/tileset.json");
    const textures = new KTX2Loader().setTranscoderPath("/open3dhk-3d/").setWorkerLimit(2).detectSupport(renderer);
    tiles.registerPlugin(new GLTFExtensionsPlugin({
      ktxLoader: textures,
      autoDispose: false,
      plugins: [(parser) => ({
        name: "LANDSD_KTX2",
        beforeRoot: async () => {
          // LandsD embeds KTX2 images without declaring the standard texture extension.
          for (const texture of parser.json.textures || []) {
            if (parser.json.images?.[texture.source]?.mimeType !== "image/ktx2") continue;
            texture.extensions = { ...texture.extensions, KHR_texture_basisu: { source: texture.source } };
          }
        }
      })]
    }));
    tiles.errorTarget = 12;
    tiles.lruCache.maxBytesSize = 180 * 1024 * 1024;
    tiles.lruCache.minBytesSize = 140 * 1024 * 1024;
    tiles.downloadQueue.maxJobsPerOrigin = 6;
    const frame = WGS84_ELLIPSOID.getEastNorthUpFrame(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), 0, new THREE.Matrix4());
    tiles.group.matrix.copy(frame.invert());
    tiles.group.matrixAutoUpdate = false;
    scene.add(tiles.group);
    tiles.setCamera(camera);

    // This marks the panorama's horizontal location, not a measured 3D camera pose.
    const marker = new THREE.Group();
    const dot = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xb83129, depthTest: false }));
    dot.renderOrder = 10;
    marker.add(dot);
    const direction = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 38, 0xb83129, 12, 9);
    marker.add(direction);
    marker.position.z = 5;
    scene.add(marker);
    const reset = () => {
      const bearing = THREE.MathUtils.degToRad(latest.current.heading);
      controls.target.set(0, 0, 35);
      camera.position.set(-Math.sin(bearing) * 470, -Math.cos(bearing) * 470, 510);
      controls.update();
    };
    reset();
    runtime.current = {
      reset,
      zoom: (factor) => {
        const offset = camera.position.clone().sub(controls.target);
        offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
        camera.position.copy(controls.target).add(offset);
        controls.update();
      }
    };
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      tiles.setResolutionFromRenderer(camera, renderer);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    const ray = new THREE.Raycaster();
    const loaded = () => {
      setStatus("ready");
      tiles.group.updateMatrixWorld(true);
      ray.set(new THREE.Vector3(0, 0, 1200), new THREE.Vector3(0, 0, -1));
      const surface = ray.intersectObject(tiles.group, true)[0];
      if (surface) marker.position.z = surface.point.z + 7;
    };
    tiles.addEventListener("load-model", loaded);
    tiles.addEventListener("load-error", () => setStatus("error"));
    let animation = 0;
    let wasActive = false;
    function render() {
      animation = requestAnimationFrame(render);
      if (!latest.current.active) { wasActive = false; return; }
      if (!wasActive) { reset(); wasActive = true; }
      const bearing = THREE.MathUtils.degToRad(latest.current.heading);
      direction.setDirection(new THREE.Vector3(Math.sin(bearing), Math.cos(bearing), 0));
      controls.update();
      camera.updateMatrixWorld();
      tiles.update();
      renderer.render(scene, camera);
    }
    render();
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      runtime.current = null;
      controls.dispose();
      tiles.dispose();
      textures.dispose();
      dot.geometry.dispose();
      dot.material.dispose();
      direction.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [lat, lng, attempt]);

  return (
    <div className="absolute inset-0 bg-[#e8eef0]">
      <div ref={host} className="absolute inset-0 [&_canvas]:h-full [&_canvas]:w-full" />
      <div className="absolute left-3 top-3 flex items-center gap-2 bg-paper/95 px-3 py-2 text-sm text-ink shadow-sm">
        <span className="h-2 w-2 rounded-full bg-[#b83129]" aria-hidden="true" />
        {zh ? "街景拍摄点" : "Street View location"}
      </div>
      <div className="absolute right-3 top-3 flex flex-col gap-px overflow-hidden border border-[var(--line)] bg-paper">
        {[
          { label: zh ? "回到拍摄点" : "Reset view", icon: LocateFixed, action: () => runtime.current?.reset() },
          { label: zh ? "放大" : "Zoom in", icon: Plus, action: () => runtime.current?.zoom(0.8) },
          { label: zh ? "缩小" : "Zoom out", icon: Minus, action: () => runtime.current?.zoom(1.25) }
        ].map(({ label, icon: Icon, action }) => (
          <button key={label} type="button" aria-label={label} title={label} onClick={action} className="flex h-11 w-11 items-center justify-center bg-paper text-ink hover:bg-black/5"><Icon size={18} /></button>
        ))}
      </div>
      {status === "loading" ? <div className="absolute bottom-9 left-3 bg-paper/95 px-3 py-2"><LoadingState label={zh ? "正在加载三维地图" : "Loading 3D map"} /></div> : null}
      {status === "error" ? <div role="alert" className="absolute bottom-9 left-3 right-3 flex items-center justify-between gap-3 bg-paper p-3 text-sm text-ink">
        <span>{zh ? "三维地图未能加载，请检查服务权限或稍后重试。" : "3D map could not be loaded. Check service access or try again."}</span>
        <button type="button" title={zh ? "重试" : "Retry"} aria-label={zh ? "重试" : "Retry"} onClick={() => setAttempt((value) => value + 1)} className="p-2"><RotateCcw size={18} /></button>
      </div> : null}
      <a href="https://www.landsd.gov.hk/" target="_blank" rel="noreferrer" className="absolute bottom-0 right-0 bg-paper/90 px-2 py-1 text-xs text-ink">© {new Date().getFullYear()} {zh ? "地政總署" : "Lands Department"}</a>
    </div>
  );
}
