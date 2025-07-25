// variables
const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const IMAGE_SIZE = 512;
const CLASS_COLORS = {
  0: [0, 0, 0],
  1: [0, 0, 255],
  2: [255, 0, 0],
};

let frameCount = 0;
let currentlyHoveredNotes = new Set();
let hoveredKeyIndices = new Set();

// getting elements
const video = document.getElementById('webcam');
const layoutCanvas = document.getElementById('layout-canvas');
const ctxLC = layoutCanvas.getContext('2d');

const noteDisplay = document.getElementById('note-display');
const dummyButton = document.getElementById('dummy-layout');

let exportKeys;
async function loadExportKeys() {
  try {
    const response = await fetch('./dummylayout.json');
    exportKeys = await response.json();
  } catch (error) {
    console.error("Failed to load dummylayout.json:", error);
  }
}
loadExportKeys();
// console.log(exportKeys);

dummyButton.addEventListener('click', loadExportKeys);

if ('serviceWorker' in navigator) {
window.addEventListener('load', () => {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => {
      console.log('Service Worker registered:', reg);
    })
    .catch(err => {
      console.error('Service Worker registration failed:', err);
    });
});
}



async function setupWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: VIDEO_WIDTH,
        height: VIDEO_HEIGHT
      }
    });
    video.srcObject = stream;
    await new Promise(resolve => video.onloadedmetadata = resolve);
    video.play();
  } 
  catch (err) {
    alert('Webcam access error: ' + err);
  }
}

// mediapipe
const maxHandsSlider = document.getElementById('maxHandsSlider');
const detectSlider = document.getElementById('detectSlider');
const trackSlider = document.getElementById('trackSlider');

maxHandsSlider.addEventListener('input', () => {
  document.getElementById('hands-count').textContent = maxHandsSlider.value;
  handLandmarker.setOptions({ numHands: parseInt(maxHandsSlider.value) });
});
detectSlider.addEventListener('input', () => {
  const val = parseFloat(detectSlider.value);
  document.getElementById('detect-conf').textContent = val.toFixed(2);
  handLandmarker.setOptions({ minHandDetectionConfidence: val });
});
trackSlider.addEventListener('input', () => {
  const val = parseFloat(trackSlider.value);
  document.getElementById('track-conf').textContent = val.toFixed(2);
  handLandmarker.setOptions({ minTrackingConfidence: val });
});

import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";
let handLandmarker;
const drawingUtils = new DrawingUtils(ctxLC);

async function createLandmarker() {

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: parseInt(maxHandsSlider.value),
    minHandDetectionConfidence: parseFloat(detectSlider.value),
    minTrackingConfidence: parseFloat(trackSlider.value)
  });

}

function processLandmarkerResults(results) {
  layoutCanvas.width = VIDEO_WIDTH;
  layoutCanvas.height = VIDEO_HEIGHT;
  hoveredKeyIndices.clear();
  ctxLC.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

  if (results.landmarks && results.landmarks.length > 0) {
    results.landmarks.forEach(landmarks => {
      const fingerTips = [8, 12, 16, 20].map(i => landmarks[i]);
      const canvasPoints = fingerTips.map(pt => [
        pt.x * layoutCanvas.width,
        pt.y * layoutCanvas.height
      ]);

      canvasPoints.forEach(([x, y]) => {
        for (let i = 0; i < exportKeys.length; i++) {
          if (isPointInPolygon(x, y, exportKeys[i].polygon)) {
            hoveredKeyIndices.add(i);
            break;
          }
        }
      });
    });

    drawAllKeys(hoveredKeyIndices);

    results.landmarks.forEach(landmarks => {
      drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color: '#00ffff', lineWidth: 1 });
      drawingUtils.drawLandmarks(landmarks, { color: '#ff0000', lineWidth: 1 });
    });

    const newHoveredNotes = new Set([...hoveredKeyIndices].slice(0, 4).map(i => exportKeys[i].note));

    // Start new notes
    newHoveredNotes.forEach(note => {
      if (!currentlyHoveredNotes.has(note)) {
        tryPlayNote(note);
      }
    });
    // Stop notes no longer hovered
    currentlyHoveredNotes.forEach(note => {
      if (!newHoveredNotes.has(note)) {
        stopNote(note);
      }
    });
    currentlyHoveredNotes = newHoveredNotes;


    if (newHoveredNotes.size > 0) {
      const anyIndex = [...hoveredKeyIndices][0];
      const [x, y] = exportKeys[anyIndex].polygon[0];
      showHoverNote([...newHoveredNotes], x, y);
    } else {
      hideHoverNote();
    }
  } else {
    hoveredKeyIndices.clear();
    currentlyHoveredNotes.clear();
    drawAllKeys();
    hideHoverNote();
  }
}

async function processLoop() {
  if (video.readyState >= 2) {
    if (++frameCount % 2 === 0) {
      const results = await handLandmarker.detectForVideo(video, performance.now());
      processLandmarkerResults(results);
    }
  }
  requestAnimationFrame(processLoop);
}


async function startAll() {
  try {
    await setupWebcam()
    await createLandmarker();
    requestAnimationFrame(processLoop);  
  } 
  catch (err) {
    alert('error');
  }
}
startAll();


// utilities functions for playing

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const activeNotes = {}; // note -> { source, gainNode }
// Add this at the start of your code
if (audioContext.state === 'suspended') {
  audioContext.resume().then(() => {
    console.log('AudioContext resumed');
  });
}
async function tryPlayNote(note) {
  if (activeNotes[note]) return;

  const response = await fetch(`sounds/${note}.mp3`);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const gainNode = audioContext.createGain();
  gainNode.gain.setValueAtTime(1, audioContext.currentTime); // start at full volume

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(gainNode).connect(audioContext.destination);
  source.start();

  activeNotes[note] = { source, gainNode };
}
function stopNote(note) {
  const active = activeNotes[note];
  if (active) {
    const { source, gainNode } = active;
    const now = audioContext.currentTime;

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(0, now + 2); // fade out over 2 seconds

    source.stop(now + 2);
    delete activeNotes[note];
  }
}

function drawAllKeys(hoveredIndices = new Set()) {
  ctxLC.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  ctxLC.font = "14px monospace";

  exportKeys.forEach((k, i) => {
    const isHovered = hoveredIndices.has(i);
    if (k.type === "white") {
      const fill = isHovered ? "rgba(255,255,0,0.3)" : "#fff";
      drawPoly(ctxLC, k.polygon, fill, "#000", k.note, isHovered);
    }
  });

  exportKeys.forEach((k, i) => {
    const isHovered = hoveredIndices.has(i);
    if (k.type === "black") {
      const fill = isHovered ? "rgba(255,255,0,0.6)" : "#800080";
      drawPoly(ctxLC, k.polygon, fill, "#000", k.note, isHovered);
    }
  });
}

function drawPoly(ctxLC, pts, fillStyle, strokeStyle, text, highlight = false) {
  ctxLC.beginPath();
  pts.forEach((p, i) => i === 0 ? ctxLC.moveTo(...p) : ctxLC.lineTo(...p));
  ctxLC.closePath();
  if (fillStyle) {
    ctxLC.fillStyle = fillStyle;
    ctxLC.fill();
  }
  if (strokeStyle) {
    ctxLC.strokeStyle = strokeStyle;
    ctxLC.lineWidth = highlight ? 3 : 1;
    ctxLC.stroke();
  }
  if (text) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    ctxLC.fillStyle = strokeStyle || "black";
    ctxLC.font = "14px monospace";
    ctxLC.fillText(text, cx - 10, cy + 5);
  }
}

function showHoverNote(notes, x, y) {
  noteDisplay.innerText = notes.join(", ");
  noteDisplay.style.left = `${x + 10}px`;
  noteDisplay.style.display = 'inline';
}

function hideHoverNote() {
  noteDisplay.style.display = 'none';
}

function isPointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
                      (x < (xj - xi) * (y - yi) / (yj - yi + 1e-10) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}


// model loading (printed paper mode)

const MODEL_URL = 'model.onnx';
let session;
let modelLoaded = false;
const captureBtn = document.getElementById('capture-btn');
const likeMask = document.getElementById('make-mask');
const capturedImg = document.getElementById('captured-img');
const rawCanvas = document.getElementById('raw-canvas');
const ctxRaw = rawCanvas.getContext('2d');

async function loadModel() {
  console.log('Loading ONNX model...');
  const response = await fetch(MODEL_URL);
  const arrayBuffer = await response.arrayBuffer();
  return ort.InferenceSession.create(arrayBuffer);
}

function preprocessImage(canvas) {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = IMAGE_SIZE;
  tempCanvas.height = IMAGE_SIZE;
  const ctxTemp = tempCanvas.getContext('2d');
  ctxTemp.drawImage(canvas, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
  const { data } = ctxTemp.getImageData(0, 0, IMAGE_SIZE, IMAGE_SIZE);
  const floatData = new Float32Array(IMAGE_SIZE * IMAGE_SIZE * 3);
  for (let i = 0; i < IMAGE_SIZE * IMAGE_SIZE; i++) {
    floatData[i * 3 + 0] = data[i * 4 + 2] / 255;
    floatData[i * 3 + 1] = data[i * 4 + 1] / 255;
    floatData[i * 3 + 2] = data[i * 4 + 0] / 255;
  }
  return new ort.Tensor('float32', floatData, [1, IMAGE_SIZE, IMAGE_SIZE, 3]);
}

function renderRawMask(predMask, w, h) {
  rawCanvas.width = VIDEO_WIDTH;
  rawCanvas.height = VIDEO_HEIGHT;
  const temp = document.createElement('canvas');
  temp.width = w;
  temp.height = h;
  const tempCtx = temp.getContext('2d');
  const rawData = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const color = CLASS_COLORS[predMask[i]];
    rawData[i * 4 + 0] = color[0];
    rawData[i * 4 + 1] = color[1];
    rawData[i * 4 + 2] = color[2];
    rawData[i * 4 + 3] = 255;
  }
  const imageData = new ImageData(rawData, w, h);
  tempCtx.putImageData(imageData, 0, 0);
  ctxRaw.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  ctxRaw.drawImage(temp, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
}

async function runInference(canvas) {
  const inputTensor = preprocessImage(canvas);
  const feeds = {};
  feeds[session.inputNames[0]] = inputTensor;
  const results = await session.run(feeds);
  const output = results[session.outputNames[0]];
  const [_, h, w, numClasses] = output.dims;
  const data = output.data;
  const predMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    let maxIdx = 0, maxVal = data[i * numClasses];
    for (let c = 1; c < numClasses; c++) {
      const val = data[i * numClasses + c];
      if (val > maxVal) {
        maxVal = val;
        maxIdx = c;
      }
    }
    predMask[i] = maxIdx;
  }
  renderRawMask(predMask, w, h);
}

captureBtn.addEventListener('click', async () => {
  if (!modelLoaded) {
    captureBtn.disabled = true;
    captureBtn.textContent = 'Loading Model...';
    try {
      session = await loadModel();
      modelLoaded = true;
      captureBtn.textContent = 'Play on paper (1)';
      captureBtn.disabled = false;
      likeMask.disabled = false;
    } catch (e) {
      console.error('Model load error:', e);
      captureBtn.textContent = 'Model Load Failed';
      return;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  capturedImg.src = canvas.toDataURL('image/png');
  await runInference(canvas);
});




let opencvLoaded = false; // Flag to prevent multiple loads

function makeOpenCvReady() {
  if (opencvLoaded) {
    return Promise.resolve(); // Already loaded, skip injection
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.x/opencv.js';
    script.async = true;
    script.onload = () => {
      cv['onRuntimeInitialized'] = () => {
        console.log("✅ OpenCV initialized");
        opencvLoaded = true;
        resolve();
      };
    };
    script.onerror = () => {
      reject(new Error("Failed to load OpenCV"));
    };
    document.body.appendChild(script);
  });
}

likeMask.addEventListener('click', async () => {
  likeMask.innerText = "Loading OpenCV...";
  try {
    await makeOpenCvReady();
    likeMask.innerText = "Like the mask? (2)";
    handleMakeMask();
  } catch (err) {
    likeMask.innerText = "Failed !";
  }
});


const handleMakeMask = () => {
  if (!opencvLoaded) {
    alert('OpenCV not ready yet!');
    return;
  }
  layoutCanvas.width = rawCanvas.width;
  layoutCanvas.height = rawCanvas.height;
  ctxLC.drawImage(rawCanvas, 0, 0);
  const img = new Image();
  img.onload = () => {
    ctxLC.drawImage(img, 0, 0);
    processImage();
  };
  img.src = rawCanvas.toDataURL();
};

// utility functions to process the canvas to json data
function avgX(pts) {
  return pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
}

function equallySpacedPoints(p1, p2, n) {
  let points = [];
  for (let i = 0; i < n; i++) {
    let alpha = i / (n - 1);
    points.push([
      p1[0] * (1 - alpha) + p2[0] * alpha,
      p1[1] * (1 - alpha) + p2[1] * alpha
    ]);
  }
  return points;
}

function polygonArea(pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    let j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return Math.abs(area) / 2;
}

function matFromPoints(pts) {
  return cv.matFromArray(pts.length, 1, cv.CV_32SC2, [].concat(...pts.map(p => [p[0], p[1]])));
}

// main process image function, big deal

function processImage() {
  let src = cv.imread(layoutCanvas);
  const WHITE_NOTES = [
  "E5", "D5", "C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4",
  "B3", "A3", "G3", "F3", "E3", "D3", "C3"
  ];
  const BLACK_NOTES = [
  "Eb5", "Db5",
  "Bb4", "Ab4", "Gb4", "Eb4", "Db4",
  "Bb3", "Ab3", "Gb3", "Eb3", "Db3"
  ];
  const colorRegions = [
    { name: "red", bgr: [0, 0, 255], num_cells: 3 },
    { name: "blue", bgr: [255, 0, 0], num_cells: 4 },
  ];
  let rawWhite = [], rawBlack = [];

  for (let region of colorRegions) {
    let lower = new cv.Mat(src.rows, src.cols, src.type(), new cv.Scalar(...region.bgr, 255));
    let upper = new cv.Mat(src.rows, src.cols, src.type(), new cv.Scalar(...region.bgr, 255));
    let mask = new cv.Mat();
    cv.inRange(src, lower, upper, mask);
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      let cnt = contours.get(i);
      if (cv.contourArea(cnt) < 500) {
        cnt.delete();
        continue;
      }

      let bestQuad = null;
      let maxArea = 0;

      for (let epsFactor = 0.01; epsFactor <= 0.05; epsFactor += 0.005) {
        let approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, epsFactor * cv.arcLength(cnt, true), true);
        if (approx.rows === 4) {
          let pts = [];
          for (let j = 0; j < 4; j++) {
            pts.push([approx.intPtr(j)[0], approx.intPtr(j)[1]]);
          }
          let area = polygonArea(pts);
          if (area > maxArea) {
            bestQuad = pts;
            maxArea = area;
          }
        }
        approx.delete();
      }
      cnt.delete();

      if (!bestQuad) continue;

      bestQuad.sort((a, b) => a[1] - b[1]);
      let top = bestQuad.slice(0, 2).sort((a, b) => a[0] - b[0]);
      let bottom = bestQuad.slice(2).sort((a, b) => a[0] - b[0]);

      let pts1 = equallySpacedPoints(bottom[0], bottom[1], region.num_cells + 1);
      let pts2 = equallySpacedPoints(top[0], top[1], region.num_cells + 1);

      for (let k = 0; k < region.num_cells; k++) {
        let poly = [ pts1[k], pts1[k+1], pts2[k+1], pts2[k] ];
        rawWhite.push({ note: "", polygon: poly, type: "white" });
      }

      let pts1b = equallySpacedPoints(bottom[0], bottom[1], region.num_cells);
      let pts2b = equallySpacedPoints(top[0], top[1], region.num_cells);
      for (let k = 0; k < region.num_cells - 1; k++) {
        let tl = pts1b[k];
        let tr = pts1b[k+1];
        const alpha = 6 / 9; // how far from top to bottom (0 = top, 1 = bottom)
        let bl = [
          tl[0] * (1 - alpha) + pts2b[k][0] * alpha,
          tl[1] * (1 - alpha) + pts2b[k][1] * alpha
        ];
        let br = [
          tr[0] * (1 - alpha) + pts2b[k+1][0] * alpha,
          tr[1] * (1 - alpha) + pts2b[k+1][1] * alpha
        ];
        rawBlack.push({ note: "", polygon: [tl, tr, br, bl], type: "black" });
      }
    }

    lower.delete(); upper.delete(); mask.delete(); contours.delete(); hierarchy.delete();
  }

  // subtract black keys from white keys
  let finalKeys = [];
  for (let wkey of rawWhite) {
    let mask = new cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);
    let wpoly = matFromPoints(wkey.polygon);
    let wMatVec = new cv.MatVector();
    wMatVec.push_back(wpoly);
    cv.fillPoly(mask, wMatVec, new cv.Scalar(255));
    wMatVec.delete();

    for (let bkey of rawBlack) {
      let bpoly = matFromPoints(bkey.polygon);
      let bMatVec = new cv.MatVector();
      bMatVec.push_back(bpoly);
      cv.fillPoly(mask, bMatVec, new cv.Scalar(0));
      bMatVec.delete();
      bpoly.delete();
    }

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    if (contours.size() > 0) {
      // Find largest contour by area
      let largest = contours.get(0);
      let largestArea = cv.contourArea(largest);
      for (let i = 1; i < contours.size(); i++) {
        let c = contours.get(i);
        let area = cv.contourArea(c);
        if (area > largestArea) {
          largestArea = area;
          largest = c;
        }
      }
      let refinedPoly = [];
      for (let i = 0; i < largest.rows; i++) {
        let pt = largest.intPtr(i);
        refinedPoly.push([pt[0], pt[1]]);
      }
      finalKeys.push({ note: "", polygon: refinedPoly, type: "white" });
    }

    mask.delete();
    wpoly.delete();
    contours.delete();
    hierarchy.delete();
  }

  finalKeys.push(...rawBlack);

  // Assign notes sorted left to right
  let whites = finalKeys.filter(k => k.type === "white").sort((a,b) => avgX(a.polygon) - avgX(b.polygon));
  let blacks = finalKeys.filter(k => k.type === "black").sort((a,b) => avgX(a.polygon) - avgX(b.polygon));

  whites.forEach((k, i) => k.note = WHITE_NOTES[i] || `white${i}`);
  blacks.forEach((k, i) => k.note = BLACK_NOTES[i] || `black${i}`);

  exportKeys = [...whites, ...blacks];      
  src.delete();
}