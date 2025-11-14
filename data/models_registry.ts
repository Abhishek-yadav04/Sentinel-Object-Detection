export type ModelInfo = {
  name: string;
  path: string; // relative path candidate
  dims: [number, number];
  sha256?: string; // optional integrity check
};

export const registry: ModelInfo[] = [
  { name: 'yolov7-tiny_256x256.onnx', path: 'yolov7-tiny_256x256.onnx', dims: [256, 256] },
  { name: 'yolov7-tiny_320x320.onnx', path: 'yolov7-tiny_320x320.onnx', dims: [320, 320] },
  { name: 'yolov7-tiny_640x640.onnx', path: 'yolov7-tiny_640x640.onnx', dims: [640, 640] },
  { name: 'yolov10n.onnx', path: 'yolov10n.onnx', dims: [256, 256] },
  { name: 'yolo11n.onnx', path: 'yolo11n.onnx', dims: [256, 256] },
  { name: 'yolo12n.onnx', path: 'yolo12n.onnx', dims: [256, 256] },
];
