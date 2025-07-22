import cv2
import numpy as np
import mediapipe as mp
import json
import os
import threading
import time
from playsound import playsound
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Load piano keys
with open("piano_keys.json", "r") as f: #dummylayout.json for playing in the air
    keys = json.load(f)

# Colors
WHITE = (255, 255, 255)
PURPLE = (128, 0, 128)
BLACK = (0, 0, 0)
YELLOW = (0, 255, 255)
font = cv2.FONT_HERSHEY_SIMPLEX

# Load MediaPipe Hand Landmarker
base_options = python.BaseOptions(model_asset_path='hand_landmarker.task')
# Define the callback function first
def landmarker_callback(result, unused_output_image, timestamp_ms):
    global cached_landmarks
    cached_landmarks = result.hand_landmarks if result.hand_landmarks else []

# Then add it to the options
options = vision.HandLandmarkerOptions(
    base_options=base_options,
    running_mode=vision.RunningMode.LIVE_STREAM,
    num_hands=2,
    min_hand_detection_confidence=0.3,
    min_hand_presence_confidence=0.3,
    min_tracking_confidence=0.3,
    result_callback=landmarker_callback 
)


hand_landmarker = vision.HandLandmarker.create_from_options(options)

# FPS logic
frame_counter = 0
prev_time = time.time()
pressed_notes = set()
cached_landmarks = []

# Camera setup
cap = cv2.VideoCapture(0)
cap.set(3, 1280)
cap.set(4, 720)

# Callback function to receive async results
def landmarker_callback(result, unused_output_image, timestamp_ms):
    global cached_landmarks
    cached_landmarks = result.hand_landmarks if result.hand_landmarks else []

# Utility functions
def draw_key(overlay, key, fill_color, text_color):
    poly = np.array(key["polygon"], dtype=np.int32).reshape(-1, 1, 2)
    cv2.fillPoly(overlay, [poly], fill_color)
    cv2.polylines(overlay, [poly], True, BLACK, 1)
    cx = int(np.mean([p[0] for p in key["polygon"]]))
    cy = int(np.mean([p[1] for p in key["polygon"]]))
    cv2.putText(overlay, key["note"], (cx - 10, cy + 5),
                font, 0.5, text_color, 1, cv2.LINE_AA)

def point_inside(poly, x, y):
    pts = np.array(poly, dtype=np.int32)
    return cv2.pointPolygonTest(pts, (x, y), False) >= 0

# Main loop
while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.resize(frame, (1280, 720))
    overlay = np.zeros_like(frame)
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    timestamp = int(time.time() * 1000)
    if frame_counter % 2 == 0:
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
        hand_landmarker.detect_async(mp_image, timestamp)
    frame_counter += 1

    fingertip_data = []
    h, w = frame.shape[:2]
    for hand in cached_landmarks:
        for lm in [8, 12, 16]:  # finger tip
            x, y, z = int(hand[lm].x * w), int(hand[lm].y * h), hand[lm].z
            fingertip_data.append((x, y, z))
            cv2.circle(frame, (x, y), 8, (0, 255, 0), -1)

    candidate_notes = []
    for key in keys:
        for x, y, z in fingertip_data:
            if point_inside(key["polygon"], x, y):
                candidate_notes.append((z, key["note"], key))

    candidate_notes = sorted(candidate_notes)[:4]
    selected_notes = [note for z, note, key in candidate_notes]

    newly_pressed = set(selected_notes) - pressed_notes
    for note in newly_pressed:
        print(f"Pressed: {note}")
        path = os.path.join("../web_version/sounds", f"{note}.mp3")
        if os.path.exists(path):
            threading.Thread(target=playsound, args=(path,), daemon=True).start()
        else:
            print(f"🔇 Missing sound for {note}")
    pressed_notes = set(selected_notes)

    for key in keys:
        is_pressed = key["note"] in selected_notes
        fill = YELLOW if is_pressed else (WHITE if key.get("type") == "white" else PURPLE)
        txt = BLACK if is_pressed or key.get("type") == "white" else WHITE
        draw_key(overlay, key, fill, txt)

    blended = cv2.addWeighted(overlay, 0.5, frame, 0.5, 0)

    if selected_notes:
        label = "Playing: " + ", ".join(selected_notes)
        cv2.putText(blended, label, (30, 50), font, 1, (0, 0, 255), 2, cv2.LINE_AA)

    curr_time = time.time()
    fps = 1 / (curr_time - prev_time)
    prev_time = curr_time
    cv2.putText(blended, f"FPS: {int(fps)}", (30, 90), font, 0.7, (255, 255, 255), 2)

    cv2.imshow("paper piano", blended)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
