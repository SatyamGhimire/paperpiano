import cv2
width, height = 1280, 720
cap = cv2.VideoCapture(0)
# camera resolution
cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
while True:
    ret, frame = cap.read()
    if not ret:
        print("failed to capture frame! :(")
        break
    cv2.imshow("press 's' to save | 'q' to quit", frame)
    key = cv2.waitKey(1)
    if key == ord('s'):
        resized = cv2.resize(frame, (width, height))
        cv2.imwrite("captured_image.jpg", resized)
        print("Image saved as 'captured_image.jpg'")
        break
    elif key == ord('q'):
        break
cap.release()
cv2.destroyAllWindows()