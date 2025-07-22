import cv2
import numpy as np
import json

def polygon_area(pts):
    x, y = pts[:, 0], pts[:, 1]
    return 0.5 * np.abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))

def is_point_in_contour(pt, contour):
    return cv2.pointPolygonTest(contour, tuple(pt.astype(float)), False) >= 0

def equally_spaced_points(p1, p2, n):
    return np.linspace(p1, p2, n)

def draw_polygon(img, pts, color, label=None, text_color=(0, 0, 0)):
    pts = np.array(pts, dtype=np.int32).reshape(-1, 1, 2)
    cv2.fillPoly(img, [pts], color)
    cv2.polylines(img, [pts], True, (0, 0, 0), 1)
    if label:
        cx = int(np.mean([p[0] for p in pts[:, 0]]))
        cy = int(np.mean([p[1] for p in pts[:, 0]]))
        cv2.putText(img, label, (cx - 10, cy + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, text_color, 1, cv2.LINE_AA)

# === MAIN ===

img = cv2.imread("output_mask.png")
if img is None:
    raise ValueError("Image not found!")

canvas = img.copy()

color_regions = [
    {"name": "red", "lower": np.array([0, 0, 255]), "upper": np.array([0, 0, 255]), "num_cells": 4},
    {"name": "blue", "lower": np.array([255, 0, 0]), "upper": np.array([255, 0, 0]), "num_cells": 3},
]
# i know its right to left
WHITE_NOTES_LEFT_TO_RIGHT = [
  "E5", "D5", "C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4",
  "B3", "A3", "G3", "F3", "E3", "D3", "C3"
];
BLACK_NOTES_LEFT_TO_RIGHT = [
  "Eb5", "Db5",
  "Bb4", "Ab4", "Gb4", "Eb4", "Db4",
  "Bb3", "Ab3", "Gb3", "Eb3", "Db3"
];
export_keys = []
raw_white_keys = []
raw_black_keys = []

for color_def in color_regions:
    mask = cv2.inRange(img, color_def["lower"], color_def["upper"])
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    for contour in contours:
        if cv2.contourArea(contour) < 500:
            continue

        quads = []
        for eps in np.linspace(0.01, 0.05, 10):
            approx = cv2.approxPolyDP(contour, eps * cv2.arcLength(contour, True), True)
            if len(approx) == 4:
                quad = approx.reshape(4, 2)
                if all(is_point_in_contour(pt, contour) for pt in quad):
                    quads.append((polygon_area(quad), quad))
        if not quads:
            continue

        best_quad = max(quads, key=lambda q: q[0])[1]
        sorted_pts = sorted(best_quad, key=lambda p: p[1])
        top_pts = sorted(sorted_pts[:2], key=lambda p: p[0])
        bottom_pts = sorted(sorted_pts[2:], key=lambda p: p[0])

        p1a, p1b = bottom_pts
        p2a, p2b = top_pts

        n_white = color_def["num_cells"]
        pts1 = equally_spaced_points(p1a, p1b, n_white + 1)
        pts2 = equally_spaced_points(p2a, p2b, n_white + 1)

        for i in range(n_white):
            poly = [
                pts1[i].tolist(),
                pts1[i + 1].tolist(),
                pts2[i + 1].tolist(),
                pts2[i].tolist()
            ]
            raw_white_keys.append({"note": "", "polygon": poly, "type": "white"})

        # === PURPLE BLACK KEYS ===
        n_black = n_white - 1
        pts1b = equally_spaced_points(p1a, p1b, n_black + 1)
        pts2b = equally_spaced_points(p2a, p2b, n_black + 1)

        for i in range(n_black):
            top_left = pts1b[i]
            top_right = pts1b[i + 1]
            direction_left = pts2b[i] - pts1b[i]
            direction_right = pts2b[i + 1] - pts1b[i + 1]
            bot_left = pts1b[i] + direction_left * (6 / 9)
            bot_right = pts1b[i + 1] + direction_right * (6 / 9)

            poly = [top_left.tolist(), top_right.tolist(), bot_right.tolist(), bot_left.tolist()]
            raw_black_keys.append({"note": "", "polygon": poly, "type": "black"})

# === Subtract black keys from white keys ===
for wkey in raw_white_keys:
    mask = np.zeros(canvas.shape[:2], dtype=np.uint8)
    wpoly = np.array(wkey["polygon"], dtype=np.int32)
    cv2.fillPoly(mask, [wpoly], 255)
    for bkey in raw_black_keys:
        bpoly = np.array(bkey["polygon"], dtype=np.int32)
        cv2.fillPoly(mask, [bpoly], 0)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        largest = max(contours, key=cv2.contourArea)
        refined_poly = largest[:, 0, :].tolist()
        export_keys.append({"note": "", "polygon": refined_poly, "type": "white"})

# Add black keys unchanged
export_keys.extend(raw_black_keys)

# === Assign note names from left to right ===
white_keys = [k for k in export_keys if k["type"] == "white"]
black_keys = [k for k in export_keys if k["type"] == "black"]

white_keys.sort(key=lambda k: np.mean([p[0] for p in k["polygon"]]))
black_keys.sort(key=lambda k: np.mean([p[0] for p in k["polygon"]]))

for i, key in enumerate(white_keys):
    key["note"] = WHITE_NOTES_LEFT_TO_RIGHT[i] if i < len(WHITE_NOTES_LEFT_TO_RIGHT) else f"White{i}"

for i, key in enumerate(black_keys):
    key["note"] = BLACK_NOTES_LEFT_TO_RIGHT[i] if i < len(BLACK_NOTES_LEFT_TO_RIGHT) else f"Black{i}"

export_keys = white_keys + black_keys

# === Draw on canvas ===
for key in export_keys:
    draw_polygon(
        canvas,
        key["polygon"],
        (255, 255, 255) if key["type"] == "white" else (128, 0, 128),
        label=key["note"],
        text_color=(0, 0, 0) if key["type"] == "white" else (255, 255, 255)
    )

with open("piano_keys.json", "w") as f:
    json.dump(export_keys, f, indent=2)

cv2.imshow("Output Piano Layout", canvas)
cv2.imwrite("output_piano_layout.png", canvas)
cv2.waitKey(0)
cv2.destroyAllWindows()