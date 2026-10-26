// Kept in an iframe so the official renderer's observers and WebGL context
// are released together when a scene is closed.
const origin = location.origin;
const container = document.getElementById("panorama");
const overlay = document.getElementById("boxes");
let viewer;
let imageId;
let fragments = [];
let activeId;
let loadTimer;
let loading = false;
let selecting = false;

function send(type, detail = {}) {
  parent.postMessage({ source: "open3dhk-viewer", type, imageId, ...detail }, origin);
}

function fail(error) {
  clearTimeout(loadTimer);
  loading = false;
  send("error", { message: error instanceof Error ? error.message : String(error) });
}

function view() {
  const direction = viewer.camera.target.clone().normalize();
  const vertical = viewer.camera.fov;
  return {
    heading: (Math.atan2(direction.x, -direction.z) * 180 / Math.PI + 360) % 360,
    pitch: Math.asin(direction.y) * 180 / Math.PI,
    fov: 2 * Math.atan(Math.tan(vertical * Math.PI / 360) * viewer.camera.aspect) * 180 / Math.PI,
    viewportWidth: container.clientWidth,
    viewportHeight: container.clientHeight
  };
}

function snapshot() {
  const canvas = document.createElement("canvas");
  const source = viewer.canvas;
  const scale = Math.min(1, 1280 / Math.max(source.width, source.height));
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return { url: canvas.toDataURL("image/jpeg", 0.88), width: canvas.width, height: canvas.height };
}

function restore(pov) {
  if (!pov) return;
  // The pinned official renderer exposes heading as cameraHeading, but has
  // no matching setter. These are its own orientation fields used by render().
  viewer._lng = (pov.heading || 0) - 90;
  viewer._lat = pov.pitch || 0;
  if (pov.fov) {
    viewer.camera.fov = 2 * Math.atan(Math.tan(pov.fov * Math.PI / 360) / viewer.camera.aspect) * 180 / Math.PI;
    viewer.camera.updateProjectionMatrix();
  }
  viewer.needsUpdate = true;
  viewer.render();
}

function projectBoxes() {
  overlay.replaceChildren();
  if (!viewer || loading || selecting) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
  for (const [index, fragment] of fragments.entries()) {
    const corners = fragment.panoramaPov?.boxCorners;
    if (!corners || corners.length !== 4) continue;
    const projected = corners.map(({ heading, pitch }) => {
      const h = heading * Math.PI / 180;
      const p = pitch * Math.PI / 180;
      return viewer.camera.position.clone().set(Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p)).project(viewer.camera);
    });
    if (projected.some((point) => point.z > 1) ||
        projected.every((point) => point.x < -1) || projected.every((point) => point.x > 1) ||
        projected.every((point) => point.y < -1) || projected.every((point) => point.y > 1)) continue;
    const points = projected.map((point) => ({ x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 }));
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
    polygon.setAttribute("stroke", "white");
    polygon.setAttribute("stroke-width", fragment.id === activeId ? "3" : "2");
    polygon.setAttribute("stroke-dasharray", "7 5");
    polygon.setAttribute("fill", fragment.id === activeId ? "#ffffff33" : "#00000015");
    polygon.setAttribute("tabindex", "0");
    polygon.setAttribute("role", "button");
    polygon.setAttribute("aria-label", `Select fragment ${index + 1}`);
    polygon.addEventListener("click", () => send("fragment", { fragmentId: fragment.id }));
    polygon.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        send("fragment", { fragmentId: fragment.id });
      }
    });
    overlay.append(polygon);
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(points[0].x + 6));
    label.setAttribute("y", String(points[0].y + 20));
    label.setAttribute("fill", "white");
    label.setAttribute("font-family", "Arial, sans-serif");
    label.setAttribute("font-size", "16");
    label.style.pointerEvents = "none";
    label.textContent = String(index + 1);
    overlay.append(label);
  }
}

const rendererModule = import("https://3d.map.gov.hk/mapviewer/files/mms-api/GS.module-20250508.js");
rendererModule.catch(fail);

window.addEventListener("message", async (event) => {
  if (event.source !== parent || event.origin !== origin || event.data?.source !== "open3dhk-host") return;
  const message = event.data;
  try {
    if (message.type === "load") {
      imageId = message.image.id;
      loading = true;
      const sdk = await rendererModule;
      viewer = new sdk.PanoramaViewer(container, {
        licensingServiceUrl: "https://3d.map.gov.hk/mapviewer/files/mms-api/license.json",
        syncViewer: false,
        fov: 60
      });
      const pano = message.image.open3dhk;
      if (!pano?.folderUrl?.startsWith("/api/open3dhk/asset/")) throw new Error("Invalid Streetscape imagery reference.");
      loadTimer = setTimeout(() => fail(new Error("Streetscape imagery could not be loaded. Please reopen this scene.")), 45000);
      viewer.on("render", projectBoxes);
      viewer.on("panoLoad", () => {
        clearTimeout(loadTimer);
        loading = false;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          try { projectBoxes(); send("ready", { snapshot: snapshot().url }); } catch (error) { fail(error); }
        }));
      });
      viewer.loadPano({ ...pano, id: message.image.panoId }, [], { heading: message.pov?.heading ?? 0 });
      restore(message.pov);
    } else if (message.type === "boxes") {
      fragments = message.fragments || [];
      activeId = message.activeId;
      selecting = message.selecting;
      projectBoxes();
    } else if (message.type === "restore" && viewer) {
      restore(message.pov);
    } else if (message.type === "capture" && viewer && !loading) {
      const box = message.box;
      const pov = view();
      const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]];
      pov.boxCorners = corners.map(([x, y]) => {
        const ray = viewer.camera.position.clone().set(x / pov.viewportWidth * 2 - 1, 1 - y / pov.viewportHeight * 2, 0.5).unproject(viewer.camera).sub(viewer.camera.position).normalize();
        return { heading: (Math.atan2(ray.x, -ray.z) * 180 / Math.PI + 360) % 360, pitch: Math.asin(ray.y) * 180 / Math.PI };
      });
      const capture = snapshot();
      send("capture", {
        screenBox: box, sourceImageUrl: capture.url, meta: pov,
        cropBox: { x: box.x / pov.viewportWidth * capture.width, y: box.y / pov.viewportHeight * capture.height,
          width: box.width / pov.viewportWidth * capture.width, height: box.height / pov.viewportHeight * capture.height }
      });
    }
  } catch (error) { fail(error); }
});
send("mounted");
