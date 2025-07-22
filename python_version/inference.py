import onnxruntime as ort
import numpy as np
import cv2

IMAGE_SIZE = 512
NUM_CLASSES = 3
CLASS_COLORS = {
    0: [0, 0, 0],       # background - black
    1: [0, 0, 255],     # small - red
    2: [255, 0, 0],     # big - blue
}
def mask_to_color_image(pred_mask):
    h, w = pred_mask.shape
    color_mask = np.zeros((h, w, 3), dtype=np.uint8)
    for class_idx, color in CLASS_COLORS.items():
        color_mask[pred_mask == class_idx] = color
    return color_mask

def predict_and_save_mask_onnx(image_path, save_path="predicted_mask.png", visualize=True):
    img = cv2.imread(image_path)
    img = cv2.resize(img, (IMAGE_SIZE, IMAGE_SIZE))
    input_img = img.astype(np.float32) / 255.0  # normalize to [0,1]

    # ONNX model expects NHWC: [batch, height, width, channels]
    input_tensor = np.expand_dims(input_img, axis=0).astype(np.float32)  # shape (1,512,512,3)

    # Load ONNX model and create session
    session = ort.InferenceSession("../web_version/model.onnx")

    # Get model input name and shape
    input_name = session.get_inputs()[0].name
    print("Model input name:", input_name)
    print("Model input shape:", session.get_inputs()[0].shape)

    # Run inference
    outputs = session.run(None, {input_name: input_tensor})

    output = outputs[0]  # get first output tensor

    # Output might be [1, H, W, NUM_CLASSES]
    if output.ndim == 4 and output.shape[-1] == NUM_CLASSES:
        pred = output[0]  # shape (H, W, NUM_CLASSES)
    else:
        raise ValueError(f"Unexpected output shape: {output.shape}")

    # Get predicted class mask (argmax on last dim)
    pred_mask = np.argmax(pred, axis=-1).astype(np.uint8)  # shape (H, W)

    # Convert mask to color image
    color_mask = mask_to_color_image(pred_mask)

    # Resize mask to bigger size for saving/viewing (optional)
    resized_mask = cv2.resize(color_mask, (1280, 720), interpolation=cv2.INTER_NEAREST)

    # Save colored mask (convert RGB to BGR for OpenCV)
    cv2.imwrite(save_path, cv2.cvtColor(resized_mask, cv2.COLOR_RGB2BGR))
    print(f"Saved predicted mask to {save_path}")

    if visualize:
    # Resize input img for display to same size as mask (optional, you can skip this since not displaying input)
    # display_input = cv2.resize(img, (1280, 720))

    # Convert color_mask from RGB to BGR for OpenCV display
        display_mask = cv2.cvtColor(resized_mask, cv2.COLOR_RGB2BGR)

        cv2.imshow("Predicted Mask", display_mask)
        cv2.waitKey(0)
        cv2.destroyAllWindows()

# Example usage
predict_and_save_mask_onnx("captured_image.jpg", save_path="output_mask.png")