import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.1/examples/jsm/loaders/GLTFLoader.js";

const MODEL_URL = "./model.glb";
const FALLBACK_DIMS_M = { width: 0.529467, height: 1.19844, depth: 0.213338 };

const appRoot = document.getElementById("appRoot");
const cameraLayer = document.getElementById("cameraLayer");
const camera = document.getElementById("camera");
const cameraFallback = document.getElementById("cameraFallback");
const fallbackMessage = document.getElementById("fallbackMessage");
const modelAnchor = document.getElementById("modelAnchor");
const previewCanvas = document.getElementById("previewCanvas");
const xrCanvas = document.getElementById("xrCanvas");

const modeText = document.getElementById("modeText");
const trackingText = document.getElementById("trackingText");
const placementText = document.getElementById("placementText");

const heightRange = document.getElementById("heightRange");
const heightValue = document.getElementById("heightValue");
const previewSizeRange = document.getElementById("previewSizeRange");
const previewSizeValue = document.getElementById("previewSizeValue");
const angleRange = document.getElementById("angleRange");
const angleValue = document.getElementById("angleValue");
const spinRange = document.getElementById("spinRange");
const spinValue = document.getElementById("spinValue");

const startArButton = document.getElementById("startArButton");
const endArButton = document.getElementById("endArButton");
const resetPlacementButton = document.getElementById("resetPlacementButton");
const flipCameraButton = document.getElementById("flipCameraButton");

let currentFacingMode = "environment";
let cameraStream = null;
let baseHeightM = FALLBACK_DIMS_M.height;
let baseWidthM = FALLBACK_DIMS_M.width;
let baseDepthM = FALLBACK_DIMS_M.depth;

const loader = new GLTFLoader();
let previewRenderer = null;
let previewScene = null;
let previewCamera = null;
let previewVisual = null;
const previewClock = new THREE.Clock();
let xrRenderer = null;
let xrScene = null;
let xrLight = null;
let xrReticle = null;
let xrController = null;
let xrModelTemplate = null;
let xrNormalizedCenter = new THREE.Vector3();
let xrModelBottom = 0;
let xrSession = null;
let xrHitTestSource = null;
let xrViewerSpace = null;
let xrAnchor = null;
let xrAnchorSpace = null;
let xrLastHit = null;
let xrPlacementRoot = null;
let xrPlacedVisual = null;
let xrPlacementStable = false;
const xrClock = new THREE.Clock();

function setMode(text) {
  modeText.textContent = text;
}

function setTracking(text) {
  trackingText.textContent = text;
}

function setPlacement(text) {
  placementText.textContent = text;
}

function targetHeightMeters() {
  return Number(heightRange.value) / 100;
}

function safeHeightScale(baseHeight) {
  return Math.max(0.0001, targetHeightMeters() / Math.max(baseHeight, 0.0001));
}

function updateOutputs() {
  heightValue.textContent = `${Number(heightRange.value).toFixed(1)} cm`;
  previewSizeValue.textContent = `${previewSizeRange.value} px`;
  angleValue.textContent = `${angleRange.value}°`;
  spinValue.textContent = `${spinRange.value}°/s`;
}

function updateFallbackPreview() {
  const previewSize = Number(previewSizeRange.value);

  modelAnchor.style.width = `${previewSize}px`;
}

function updatePlacedModelTransform(elapsed = xrClock.getElapsedTime()) {
  if (!xrPlacedVisual) {
    return;
  }

  const scale = safeHeightScale(baseHeightM);
  const baseAngle = THREE.MathUtils.degToRad(Number(angleRange.value));
  const spin = THREE.MathUtils.degToRad(Number(spinRange.value));

  xrPlacedVisual.scale.setScalar(scale);
  xrPlacedVisual.rotation.set(0, baseAngle + elapsed * spin, 0);
}

function stopCamera() {
  if (!cameraStream) {
    return;
  }

  for (const track of cameraStream.getTracks()) {
    track.stop();
  }

  cameraStream = null;
}

async function startCamera() {
  stopCamera();
  cameraFallback.hidden = false;
  fallbackMessage.textContent =
    "カメラを起動しています。許可ダイアログが出たらアクセスを許可してください。";

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    fallbackMessage.textContent =
      "このブラウザまたは環境では getUserMedia が使えません。HTTPS または localhost で開いてください。";
    setMode("カメラ不可");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    camera.srcObject = stream;
    cameraStream = stream;
    cameraLayer.dataset.facing = currentFacingMode;
    cameraFallback.hidden = true;

    if (!appRoot.classList.contains("xr-active")) {
      setMode(currentFacingMode === "environment" ? "カメラ重ね表示 / 背面" : "カメラ重ね表示 / 前面");
    }
  } catch (error) {
    fallbackMessage.textContent =
      `カメラアクセスに失敗しました (${error?.name || "CameraError"})。ブラウザ設定でカメラを許可してから再試行してください。`;
  }
}

async function checkArSupport() {
  if (!navigator.xr || !navigator.xr.isSessionSupported) {
    setTracking("このブラウザは WebXR 非対応です。カメラ重ね表示を使ってください");
    startArButton.disabled = true;
    return;
  }

  try {
    const supported = await navigator.xr.isSessionSupported("immersive-ar");
    if (supported) {
      setTracking("WebXR 対応端末です。床を検出して空間に配置できます");
      startArButton.disabled = false;
    } else {
      setTracking("この端末では空間ARを使えません。カメラ重ね表示のみです");
      startArButton.disabled = true;
    }
  } catch (_error) {
    setTracking("空間AR対応の確認に失敗しました");
    startArButton.disabled = true;
  }
}

function initPreviewScene() {
  if (previewRenderer || !xrModelTemplate) {
    return;
  }

  previewRenderer = new THREE.WebGLRenderer({
    canvas: previewCanvas,
    alpha: true,
    antialias: true
  });
  previewRenderer.setPixelRatio(window.devicePixelRatio);
  previewScene = new THREE.Scene();
  previewCamera = new THREE.PerspectiveCamera(32, 1, 0.01, 20);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x3b2c1f, 1.4);
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(2, 3, 3);
  previewScene.add(hemi, dir);

  previewVisual = buildPlacedVisual();
  previewScene.add(previewVisual);
  previewClock.start();
  renderPreview();
}

function resizePreviewRenderer() {
  if (!previewRenderer) {
    return;
  }

  const rect = modelAnchor.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));

  previewRenderer.setSize(width, height, false);
  previewCamera.aspect = width / height;
  previewCamera.updateProjectionMatrix();
}

function renderPreview() {
  if (!previewRenderer || !previewScene || !previewCamera || !previewVisual) {
    return;
  }

  resizePreviewRenderer();

  const scale = safeHeightScale(baseHeightM);
  const height = targetHeightMeters();
  const baseAngle = THREE.MathUtils.degToRad(Number(angleRange.value));
  const spin = THREE.MathUtils.degToRad(Number(spinRange.value));
  const elapsed = previewClock.getElapsedTime();
  const distance = Math.max(height * 3.6, 0.85);

  previewVisual.scale.setScalar(scale);
  previewVisual.rotation.set(0, baseAngle + elapsed * spin, 0);

  previewCamera.position.set(Math.sin(0.45) * distance, Math.max(height * 0.9, 0.18), Math.cos(0.45) * distance);
  previewCamera.lookAt(0, Math.max(height * 0.52, 0.08), 0);

  previewRenderer.render(previewScene, previewCamera);
  requestAnimationFrame(renderPreview);
}

async function ensureXrModel() {
  if (xrModelTemplate) {
    return;
  }

  const gltf = await loader.loadAsync(MODEL_URL);
  xrModelTemplate = gltf.scene;

  const box = new THREE.Box3().setFromObject(xrModelTemplate);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  baseWidthM = size.x > 0 ? size.x : baseWidthM;
  baseHeightM = size.y > 0 ? size.y : baseHeightM;
  baseDepthM = size.z > 0 ? size.z : baseDepthM;
  xrNormalizedCenter.copy(center);
  xrModelBottom = box.min.y;

  initPreviewScene();
  updateOutputs();
  updateFallbackPreview();
}

function buildPlacedVisual() {
  const wrapper = new THREE.Group();
  const clone = xrModelTemplate.clone(true);

  clone.position.set(-xrNormalizedCenter.x, -xrModelBottom, -xrNormalizedCenter.z);
  wrapper.add(clone);

  return wrapper;
}

function ensureXrScene() {
  if (xrRenderer) {
    return;
  }

  xrRenderer = new THREE.WebGLRenderer({
    canvas: xrCanvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: false
  });
  xrRenderer.setPixelRatio(window.devicePixelRatio);
  xrRenderer.setSize(window.innerWidth, window.innerHeight);
  xrRenderer.xr.enabled = true;
  xrRenderer.xr.setReferenceSpaceType("local-floor");

  xrScene = new THREE.Scene();
  xrLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4);
  xrScene.add(xrLight);

  const ring = new THREE.RingGeometry(0.08, 0.11, 32).rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb075,
    transparent: true,
    opacity: 0.95
  });
  xrReticle = new THREE.Mesh(ring, ringMaterial);
  xrReticle.matrixAutoUpdate = false;
  xrReticle.visible = false;
  xrScene.add(xrReticle);

  xrPlacementRoot = new THREE.Group();
  xrPlacementRoot.visible = false;
  xrScene.add(xrPlacementRoot);

  xrController = xrRenderer.xr.getController(0);
  xrController.addEventListener("select", onXrSelect);
  xrScene.add(xrController);

  window.addEventListener("resize", () => {
    if (xrRenderer) {
      xrRenderer.setSize(window.innerWidth, window.innerHeight);
    }
  });
}

async function startArSession() {
  if (xrSession) {
    return;
  }

  await ensureXrModel();
  ensureXrScene();

  try {
    const session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["anchors", "dom-overlay", "local-floor", "light-estimation"],
      domOverlay: { root: appRoot }
    });

    xrSession = session;
    xrClock.start();
    xrRenderer.xr.setReferenceSpaceType("local-floor");
    await xrRenderer.xr.setSession(session);

    xrViewerSpace = await session.requestReferenceSpace("viewer");
    xrHitTestSource = await session.requestHitTestSource({ space: xrViewerSpace });

    session.addEventListener("end", onXrSessionEnded);

    appRoot.classList.add("xr-active");
    setMode("空間AR");
    setTracking("床や平面を探しています");
    setPlacement("まだ配置していません");

    xrRenderer.setAnimationLoop(onXrFrame);
  } catch (error) {
    setTracking(`空間AR開始に失敗しました (${error?.name || "ARSessionError"})`);
  }
}

async function endArSession() {
  if (!xrSession) {
    return;
  }

  await xrSession.end();
}

function clearAnchor() {
  if (xrAnchor?.delete) {
    xrAnchor.delete();
  }

  xrAnchor = null;
  xrAnchorSpace = null;
}

function resetPlacement() {
  clearAnchor();
  xrLastHit = null;
  xrPlacementStable = false;
  if (xrPlacementRoot) {
    xrPlacementRoot.visible = false;
    xrPlacementRoot.position.set(0, 0, 0);
    xrPlacementRoot.quaternion.identity();
  }
  setPlacement("まだ配置していません");
  if (appRoot.classList.contains("xr-active")) {
    setTracking("床や平面を探しています");
  }
}

async function onXrSelect() {
  if (!xrReticle?.visible || !xrPlacementRoot || !xrModelTemplate) {
    return;
  }

  xrPlacementRoot.visible = true;

  if (!xrPlacedVisual) {
    xrPlacedVisual = buildPlacedVisual();
    xrPlacementRoot.add(xrPlacedVisual);
  }

  clearAnchor();
  updatePlacedModelTransform(0);

  xrPlacementRoot.position.setFromMatrixPosition(xrReticle.matrix);
  xrPlacementRoot.quaternion.setFromRotationMatrix(xrReticle.matrix);

  if (xrLastHit?.createAnchor) {
    try {
      xrAnchor = await xrLastHit.createAnchor();
      xrAnchorSpace = xrAnchor.anchorSpace;
      xrPlacementStable = true;
      setPlacement("床に固定しました");
      setTracking("空間固定済みです。もう一度タップすると置き直せます");
      return;
    } catch (_error) {
      xrPlacementStable = false;
    }
  }

  xrPlacementStable = false;
  setPlacement("床に配置しました");
  setTracking("アンカー未対応のため、その場配置として保持します");
}

function onXrFrame(_time, frame) {
  if (!frame || !xrRenderer || !xrScene) {
    return;
  }

  const referenceSpace = xrRenderer.xr.getReferenceSpace();
  if (!referenceSpace) {
    xrRenderer.render(xrScene, xrRenderer.xr.getCamera());
    return;
  }

  if (xrHitTestSource) {
    const hitTestResults = frame.getHitTestResults(xrHitTestSource);
    if (hitTestResults.length > 0) {
      xrLastHit = hitTestResults[0];
      const pose = xrLastHit.getPose(referenceSpace);

      if (pose) {
        xrReticle.visible = true;
        xrReticle.matrix.fromArray(pose.transform.matrix);

        if (!xrPlacementStable) {
          setTracking("床を検出しました。画面をタップして配置してください");
        }
      }
    } else {
      xrReticle.visible = false;
      if (!xrPlacementStable) {
        setTracking("床や平面を探しています");
      }
    }
  }

  if (xrAnchorSpace && xrPlacementRoot) {
    const pose = frame.getPose(xrAnchorSpace, referenceSpace);
    if (pose) {
      xrPlacementRoot.position.set(
        pose.transform.position.x,
        pose.transform.position.y,
        pose.transform.position.z
      );
      xrPlacementRoot.quaternion.set(
        pose.transform.orientation.x,
        pose.transform.orientation.y,
        pose.transform.orientation.z,
        pose.transform.orientation.w
      );
    }
  }

  updatePlacedModelTransform();
  xrRenderer.render(xrScene, xrRenderer.xr.getCamera());
}

function onXrSessionEnded() {
  if (xrHitTestSource) {
    xrHitTestSource.cancel();
    xrHitTestSource = null;
  }

  xrViewerSpace = null;
  clearAnchor();
  xrLastHit = null;
  xrPlacementStable = false;
  xrClock.stop();
  xrRenderer?.setAnimationLoop(null);
  xrReticle && (xrReticle.visible = false);
  xrPlacementRoot && (xrPlacementRoot.visible = false);
  xrSession = null;

  appRoot.classList.remove("xr-active");
  setMode(currentFacingMode === "environment" ? "カメラ重ね表示 / 背面" : "カメラ重ね表示 / 前面");
  setPlacement("まだ配置していません");
  checkArSupport();
}

heightRange.addEventListener("input", () => {
  updateOutputs();
  updateFallbackPreview();
  updatePlacedModelTransform();
});

previewSizeRange.addEventListener("input", () => {
  updateOutputs();
  updateFallbackPreview();
});

angleRange.addEventListener("input", () => {
  updateOutputs();
  updateFallbackPreview();
  updatePlacedModelTransform();
});

spinRange.addEventListener("input", () => {
  updateOutputs();
  updateFallbackPreview();
  updatePlacedModelTransform();
});

startArButton.addEventListener("click", startArSession);
endArButton.addEventListener("click", endArSession);
resetPlacementButton.addEventListener("click", resetPlacement);
flipCameraButton.addEventListener("click", async () => {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  await startCamera();
});

updateOutputs();
updateFallbackPreview();
startCamera();
checkArSupport();
ensureXrModel().catch(() => {
  setTracking("3Dモデルの事前読み込みに失敗しました");
  fallbackMessage.textContent =
    "固定3Dモデルの読み込みに失敗しました。`model.glb` が同じ場所にあるか確認してください。";
  cameraFallback.hidden = false;
});

window.addEventListener("beforeunload", () => {
  stopCamera();
  clearAnchor();
});
