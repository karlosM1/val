import * as THREE from "three";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

// --- Configuration ---
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const PARTICLE_COUNT = isMobile ? 8000 : 15000;
const SMOOTHING = 0.08;
const ELASTICITY = 0.05;

let currentGesture = "none";
let time = 0;
let handDisplacement = new THREE.Vector3(0, 0, 0);

// --- Three.js Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
camera.position.z = 35;

// --- Circular Texture ---
function createCircleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

// --- Responsive Text Scaling Logic ---
function getResponsiveScale() {
  // This calculates how big the text should be relative to the camera FOV
  const vFOV = THREE.MathUtils.degToRad(camera.fov);
  const height = 2 * Math.tan(vFOV / 2) * camera.position.z;
  const width = height * camera.aspect;
  // We want the text to take up about 80% of the screen width
  return (width / 512) * 0.8;
}

function createTextPoints(text, count) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 512;
  canvas.height = 128;
  ctx.fillStyle = "white";
  ctx.font = "bold 70px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);

  const imageData = ctx.getImageData(0, 0, 512, 128).data;
  const points = [];
  const scale = getResponsiveScale();

  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 512; x += 2) {
      if (imageData[(y * 512 + x) * 4] > 128) {
        points.push(new THREE.Vector3((x - 256) * scale, (64 - y) * scale, 0));
      }
    }
  }
  return Array.from({ length: count }, (_, i) =>
    points[i % points.length].clone(),
  );
}

// --- Initialize Points ---
let willYouPoints, beMyPoints, valentinesPoints, saturnPoints, randomPoints;

function initShapes() {
  const scale = getResponsiveScale();

  willYouPoints = createTextPoints("WILL YOU", PARTICLE_COUNT);
  beMyPoints = createTextPoints("BE MY", PARTICLE_COUNT);
  valentinesPoints = createTextPoints("VALENTINE?", PARTICLE_COUNT);

  randomPoints = Array.from(
    { length: PARTICLE_COUNT },
    () =>
      new THREE.Vector3(
        (Math.random() - 0.5) * 60,
        (Math.random() - 0.5) * 60,
        (Math.random() - 0.5) * 60,
      ),
  );

  saturnPoints = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const v = new THREE.Vector3();
    const s = isMobile ? 0.6 : 1.0;
    if (i < PARTICLE_COUNT * 0.4) {
      const phi = Math.acos(-1 + (2 * i) / (PARTICLE_COUNT * 0.4));
      const theta = Math.sqrt(PARTICLE_COUNT * 0.4 * Math.PI) * phi;
      return v.setFromSphericalCoords(15 * s, phi, theta);
    } else {
      const angle = Math.random() * Math.PI * 2;
      const radius = (20 + Math.random() * 6) * s;
      return v.set(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * 0.6,
        Math.sin(angle) * radius,
      );
    }
  });
}

initShapes();

// --- Particle System ---
const geometry = new THREE.BufferGeometry();
const posArray = new Float32Array(PARTICLE_COUNT * 3);
geometry.setAttribute("position", new THREE.BufferAttribute(posArray, 3));

const material = new THREE.PointsMaterial({
  size: isMobile ? 0.35 : 0.15,
  transparent: true,
  opacity: 0.8,
  map: createCircleTexture(),
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  color: 0x666666,
});
const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);

// --- MediaPipe & Video ---
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.6,
});

hands.onResults((results) => {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm = results.multiHandLandmarks[0];
    // Mirror the movement for natural interaction
    handDisplacement.x = (lm[0].x - 0.5) * -40;
    handDisplacement.y = (0.5 - lm[0].y) * 30;

    const indexUp = lm[8].y < lm[6].y;
    const middleUp = lm[12].y < lm[10].y;
    const pinkyUp = lm[20].y < lm[18].y;
    const thumbUp = lm[4].y < lm[2].y;

    if (indexUp && middleUp && !pinkyUp) currentGesture = "peace";
    else if (indexUp && pinkyUp && !middleUp) currentGesture = "rock";
    else if (thumbUp && !indexUp && !middleUp) currentGesture = "like";
    else if (!indexUp && !middleUp && !pinkyUp) currentGesture = "fist";
    else currentGesture = "detected";
  } else {
    currentGesture = "none";
    handDisplacement.lerp(new THREE.Vector3(0, 0, 0), 0.05);
  }
});

const video = document.createElement("video");
video.setAttribute("playsinline", "");
const cam = new Camera(video, {
  onFrame: async () => await hands.send({ image: video }),
  width: 640,
  height: 480,
});
cam.start();

// --- Animation Loop ---
function animate() {
  time += 0.01;
  let targetSet = null;

  if (currentGesture === "fist") targetSet = saturnPoints;
  else if (currentGesture === "peace") targetSet = willYouPoints;
  else if (currentGesture === "rock") targetSet = beMyPoints;
  else if (currentGesture === "like") targetSet = valentinesPoints;

  // Smooth material updates
  if (currentGesture === "like") {
    material.color.lerp(new THREE.Color(0xff4488), 0.1);
    material.size = (isMobile ? 0.35 : 0.15) + Math.sin(time * 5) * 0.05;
  } else if (currentGesture !== "none") {
    material.color.lerp(new THREE.Color(0x00ccff), 0.1);
  } else {
    material.color.lerp(new THREE.Color(0x666666), 0.1);
  }

  particleSystem.position.lerp(handDisplacement, ELASTICITY);

  const positions = geometry.attributes.position.array;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    const t = targetSet ? targetSet[i] : randomPoints[i];
    const drift = targetSet ? 0 : Math.sin(time + i) * 0.04;
    positions[i3] += (t.x - positions[i3]) * SMOOTHING + drift;
    positions[i3 + 1] += (t.y - positions[i3 + 1]) * SMOOTHING + drift;
    positions[i3 + 2] += (t.z - positions[i3 + 2]) * SMOOTHING + drift;
  }

  geometry.attributes.position.needsUpdate = true;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// --- THE FIX: Responsive Resize ---
window.addEventListener("resize", () => {
  // 1. Update Camera
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  // 2. Update Renderer
  renderer.setSize(window.innerWidth, window.innerHeight);

  // 3. Re-calculate shapes so text fits the new width
  initShapes();
});
