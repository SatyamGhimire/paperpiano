import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const canvas2 = document.getElementById('output-masks');
const ctx2 = canvas2.getContext('2d');
const noteDisplay = document.getElementById('note-display');
let currentlyHoveredNotes = new Set();

let hoveredKeyIndices = new Set();
let frameCount = 0;

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
  ctx2.clearRect(0, 0, canvas.width, canvas.height);
  ctx2.font = "14px monospace";

  exportKeys.forEach((k, i) => {
    const isHovered = hoveredIndices.has(i);
    if (k.type === "white") {
      const fill = isHovered ? "rgba(255,255,0,0.3)" : "#fff";
      drawPoly(ctx2, k.polygon, fill, "#000", k.note, isHovered);
    }
  });

  exportKeys.forEach((k, i) => {
    const isHovered = hoveredIndices.has(i);
    if (k.type === "black") {
      const fill = isHovered ? "rgba(255,255,0,0.6)" : "#800080";
      drawPoly(ctx2, k.polygon, fill, "#000", k.note, isHovered);
    }
  });
}

function drawPoly(ctx2, pts, fillStyle, strokeStyle, text, highlight = false) {
  ctx2.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx2.moveTo(...p) : ctx2.lineTo(...p));
  ctx2.closePath();
  if (fillStyle) {
    ctx2.fillStyle = fillStyle;
    ctx2.fill();
  }
  if (strokeStyle) {
    ctx2.strokeStyle = strokeStyle;
    ctx2.lineWidth = highlight ? 3 : 1;
    ctx2.stroke();
  }
  if (text) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    ctx2.fillStyle = strokeStyle || "black";
    ctx2.font = "14px monospace";
    ctx2.fillText(text, cx - 10, cy + 5);
  }
}

function showHoverNote(notes, x, y) {
  noteDisplay.innerText = "Notes: " + notes.join(", ");
  noteDisplay.style.left = `${x + 10}px`;
  noteDisplay.style.display = 'block';
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

let handLandmarker;
const drawingUtils = new DrawingUtils(ctx2);

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

async function createLandmarker() {
  const loadingEl = document.getElementById('loading-message');

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

  // Hide the loading message
if (loadingEl) {
  loadingEl.style.display = 'none';
}
}


await createLandmarker();


function processLandmarkerResults(results) {
  hoveredKeyIndices.clear();
  ctx2.clearRect(0, 0, canvas2.width, canvas2.height);

  if (results.landmarks && results.landmarks.length > 0) {
    results.landmarks.forEach(landmarks => {
      const fingerTips = [8, 12, 16, 20].map(i => landmarks[i]);
      const canvasPoints = fingerTips.map(pt => [
        pt.x * canvas2.width,
        pt.y * canvas2.height
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

let animationFrameId;

async function processLoop() {
  if (video.readyState >= 2) {
    if (++frameCount % 2 === 0) {
      const results = handLandmarker.detectForVideo(video, performance.now());
      processLandmarkerResults(results);
    }
  }
  animationFrameId = requestAnimationFrame(processLoop);
}

// Add this to clean up before refresh
window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(animationFrameId);
  // Clean up audio sources
  Object.values(activeNotes).forEach(({ source }) => {
    source.stop();
  });
});
processLoop();