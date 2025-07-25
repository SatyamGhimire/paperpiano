# Paper piano (piano on pages)

Play piano on printed paper, or just in the air using a dummy layout. I highly recommend **[watching the tutorial first.](https://youtu.be/89Pao1wtyRs)**

Website: [piano on pages](https://pianoon.pages.dev)

_Although detecting touch with a camera has flaws, I think it's still fun._

## Available versions
- Web version
- Python version

### Python version installation and dependencies
```bash
pip install -r requirements.txt
```
Dependencies:
- `opencv-python`
- `numpy`
- `playsound`
- `mediapipe`
- `onnxruntime` (onnx is faster than tflite imo)

I wanted to use `pydub` and `simpleaudio` for fade out effect, but ran into problem with installation, so staying with `playsound`.
Open `runme.bat` and it will run the files in order.
This project was created in a computer running `python 3.12` , so other versions might not work.

### Run locally web version
 Clone the repo and just run with the liveserver or with this command: `npx serve`


## How it works?

1. Uses a UNET segmentation model (with pretrained MobileNetV2 backbone) trained on a custom dataset to mask small and big regions (red and blue colour)
2. Then uses geometry to draw keys inside these regions and store this info as a json
   - Divides the bottom line into three cells and four cells for drawing white notes.
   - Divides the top line into two and three cells for drawing black notes.
   - The height of black notes is 6/9 of the total height, and the overlapping is subtracted.
4. Uses this json to render the layout and uses mediaipie hand landmarker to detect fingers

## Acknowledgement
Huge thanks to [University of Iowa Electronics Music Studios](https://theremin.music.uiowa.edu/MISpiano.html) for the publicly available sounds for each piano keys.

## Contributing
I am always open to suggestions, teaching, ideas, and improvements.

## License

[MIT](https://choosealicense.com/licenses/mit/)