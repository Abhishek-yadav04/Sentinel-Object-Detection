# Real-time Object Detection Web App

This project is a web-based application that utilizes real-time object detection to identify and label objects within an image or video stream. It is built using Next.js, ONNXRuntime Web (WebGL/WASM), and the latest ultra-light YOLO family models.

## What's New (2025 Upgrade)

- Automatic selection between WebGL and WASM execution providers with graceful fallback when a backend isn't available.
- Improved model bootstrapping UX with loading states, retry handling, and richer runtime diagnostics for presentations.
- Execution statistics panel now highlights the active inference engine to help benchmark hardware capabilities live.
- Hardened ONNX asset loading pipeline with deterministic wasm path configuration, eliminating the `no available backend found` runtime failure.
- Refreshed documentation with clearer onboarding, troubleshooting guidance, and presentation tips.

## Demo at [RTOD.vercel.app](https://rtod.vercel.app)

<div align="center" >
  <video autoplay loop muted
  src="https://user-images.githubusercontent.com/44163987/211734752-e354b590-0f55-465a-b783-504ed55d3ed3.mp4" alt="demo.mp4" >
  </video>
</div>

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

In order to run this project, you will need to have the following software installed on your machine:

- Node.js
- A web browser

### Installation

1. Clone the repository to your local machine (either the original upstream or your presentation fork):

```powershell
git clone <your-repo-url>
```

2. Navigate to the project directory:

```powershell
cd real-time-object-detection-web-app
```

3. Install the necessary dependencies by running:

```powershell
npm install
# or
yarn install
```

4. Start the development server by running:

```powershell
npm run dev
# or
yarn dev
```

5. Open your web browser and navigate to http://localhost:3000 to view the application.

6. (Optional) Verify the TypeScript and lint setup before presenting:

```powershell
npm run lint
```


### Adding Custom Models

1. Add your custom model to the `/models` directory (or publish it via a CDN and update the loader path).
2. Update the `RES_TO_MODEL` constant in `components/models/Yolo.tsx` to include your model's resolution and path.
3. Modify the `preprocess` and `postprocess` functions in `components/models/Yolo.tsx` to match the input and output requirements of your model.
4. If you encounter `protobuff error` while loading your `.onnx` model, your model may not be optimised for `onnxruntime webassembly`. Convert your model to `.ort` or optimised `.onnx` using [onnxruntime](https://onnxruntime.ai/docs/performance/model-optimizations/ort-format-models.html). See [ultralytics_pt_to_onnx.md](./convert_pt_to_onnx/ultralytics_pt_to_onnx.md) for example.

### Troubleshooting

- **`no available backend found`**: The runtime now auto-configures ONNX wasm assets, but if you deploy behind a custom CDN ensure `/_next/static/chunks/pages/ort-wasm*.wasm` is publicly reachable.
- **Browser blocks camera access**: Remind the audience to enable camera permissions; the UI pauses live detection while permission prompts are open.
- **Slow FPS on older laptops**: Switch to a smaller resolution preset; live stats and engine label help you explain the trade-offs.

### Installation as PWA

This app can also be installed on your device (desktop or mobile) as a progressive web app (PWA). Here's how:

1. Visit the app's URL in a web browser that supports PWAs (such as Google Chrome or Firefox).
2. Look for the "Install" or "Add to Homescreen" button in the browser's interface.
3. Click the button and follow the prompts to install the app.
4. The app will now be installed on your device and can be launched from the homescreen like any other app.

### Deployment

This project can be deployed to a web server for public access. For more information on deploying a Next.js application, please visit the official [documentation](https://nextjs.org/docs/deployment/)

## Built With

- [ONNXRuntime](https://onnxruntime.ai/) - An open-source project for running inferences using pre-trained models in a variety of formats.
- [YOLOv10](https://github.com/THU-MIG/yolov10) - An Object detection model which is used in this project.
- [YOLOv7](https://github.com/WongKinYiu/yolov7) - An Object detection model which is used in this project.
- [Next.js](https://nextjs.org/) - A JavaScript framework for building server-rendered React applications.
- [PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps) - A progressive web app that can be installed on a user's device and run offline, providing a native-like experience.

## Enterprise Features

- Feature flags via environment (`.env`): control FPS cap, video fallback, engine label, analytics hooks.
- Error isolation: global ErrorBoundary to avoid single failure crashing the app.
- Health endpoint: `GET /api/healthz` returns status/build info.
- Runtime caching (PWA): caches `.onnx`, ORT `.wasm/.mjs`, images, and videos.
- Security headers: CSP tailored for ONNX Runtime Web, plus common security headers.
- Dockerized build: reproducible deploys.

### Environment

Create `.env.local` from `.env.example` and adjust as needed:

```env
NEXT_PUBLIC_MODEL_BASE_PATH=
NEXT_PUBLIC_USE_VIDEO_FALLBACK=true
NEXT_PUBLIC_VERIFY_MODEL_INTEGRITY=false
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_SHOW_ENGINE_LABEL=true
NEXT_PUBLIC_CAP_FPS=30
NEXT_PUBLIC_LOG_LEVEL=info
```

### Run in Docker

```powershell
docker build -t sentinel-web .
docker run -p 3000:3000 sentinel-web
```

## Contributing

If you want to contribute to this project, please feel free to submit a pull request. Any contributions, big or small, are greatly appreciated!

## Maintainers

- **Abhishek Yadav**  Lead maintainer and 2025 modernisation effort.
- **Juan Sebastian (@juanjaho)**  Project creator and original implementation.

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Thank you to [@ultralytics](https://github.com/ultralytics) for the easy configuration of YOLOv10 model.

- Thank you to [@THU-MIG] (https://github.com/THU-MIG) for creating [YOLOv10](https://github.com/THU-MIG/yolov10) model.

- Thank you to [@WongKinYiu](https://github.com/WongKinYiu) for creating [YOLOv7](https://github.com/WongKinYiu/yolov7) model.

- Hats off to the ONNXRuntime team for making such a powerful tool accessible to developers.

- Referenced [ONNXRuntime Web Demo](https://github.com/microsoft/onnxruntime-web-demo) for guidance on how to use ONNXRuntime in a web application.

- Thank you to all the contributors to the open-source libraries used in this project.

- Inspiration for this project was taken from my previous project [AnimeArcaneGAN_Mobile](https://github.com/juanjaho/AnimeArcaneGAN_Mobile)

## Citation for YOLOv12

```
@article{tian2025yolov12,
  title={YOLOv12: Attention-Centric Real-Time Object Detectors},
  author={Tian, Yunjie and Ye, Qixiang and Doermann, David},
  journal={arXiv preprint arXiv:2502.12524},
  year={2025}
}

@software{yolo12,
  author = {Tian, Yunjie and Ye, Qixiang and Doermann, David},
  title = {YOLOv12: Attention-Centric Real-Time Object Detectors},
  year = {2025},
  url = {https://github.com/sunsmarterjie/yolov12},
  license = {AGPL-3.0}
}
```

## Citation for YOLOv11

```
@software{yolo11_ultralytics,
  author = {Glenn Jocher and Jing Qiu},
  title = {Ultralytics YOLO11},
  version = {11.0.0},
  year = {2024},
  url = {https://github.com/ultralytics/ultralytics},
  orcid = {0000-0001-5950-6979, 0000-0003-3783-7069},
  license = {AGPL-3.0}
}
```

## Citation for YOLOv10

```

@article{THU-MIGyolov10,
title={YOLOv10: Real-Time End-to-End Object Detection},
author={Ao Wang, Hui Chen, Lihao Liu, et al.},
journal={arXiv preprint arXiv:2405.14458},
year={2024},
institution={Tsinghua University},
license = {AGPL-3.0}
}

```

## Citation for YOLOv7

```

@article{wang2022yolov7,
title={{YOLOv7}: Trainable bag-of-freebies sets new state-of-the-art for real-time object detectors},
author={Wang, Chien-Yao and Bochkovskiy, Alexey and Liao, Hong-Yuan Mark},
journal={arXiv preprint arXiv:2207.02696},
year={2022}
}

```
