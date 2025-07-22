let exportKeys = []; // Global for keys data
let uniqueNotes = [];
let canvas, ctx;
let imgWidth, imgHeight;
let NOTE_SEQ = [
  "C3", "Db3", "D3", "Eb3", "E3", "F3", "Gb3", "G3", "Ab3", "A3", "Bb3", "B3",
  "C4", "Db4", "D4", "Eb4", "E4", "F4", "Gb4", "G4", "Ab4", "A4", "Bb4", "B4",
  "C5", "Db5", "D5", "Eb5", "E5"
];
let cvReady = false;

// is opencv ready?
function onOpenCvReady() {
  cv['onRuntimeInitialized'] = () => {
    console.log("✅ OpenCV initialized");
    cvReady = true;

    canvas = document.getElementById('output-masks');
    ctx = canvas.getContext('2d');

    // The shared event handler function
    const handleMakeMask = () => {
      if (!cvReady) {
        alert('OpenCV not ready yet!');
        return;
      }

      const sourceCanvas = document.getElementById('raw-canvas');
      canvas.width = sourceCanvas.width;
      canvas.height = sourceCanvas.height;
      ctx.drawImage(sourceCanvas, 0, 0);

      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        processImage();
      };
      img.src = sourceCanvas.toDataURL();
    };

    // Add event listener to first button
    document.getElementById('make-mask').addEventListener('click', handleMakeMask);

    // Add event listener to second button (replace 'another-btn-id' with your actual id)
    document.getElementById('dummy-layout').addEventListener('click', () => {
  setTimeout(handleMakeMask, 200);
});

  };
}


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
  let src = cv.imread(canvas);
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