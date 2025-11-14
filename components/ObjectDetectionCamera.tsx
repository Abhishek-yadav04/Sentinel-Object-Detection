import Webcam from 'react-webcam';
import { useRef, useState, useEffect } from 'react';
import { runModelUtils } from '../utils';
import { InferenceSession, Tensor } from 'onnxruntime-web';
import { config } from '../utils/config';
import { Detection, Point } from '../types/detection';
import { isPointInPolygon } from '../utils/geometry';
import dynamic from 'next/dynamic';

const ZoneEditor = dynamic(() => import('./ZoneEditor'), {
  ssr: false,
  loading: () => null,
});

const ObjectDetectionCamera = (props: {
  width: number;
  height: number;
  modelName: string;
  session: InferenceSession;
  preprocess: (ctx: CanvasRenderingContext2D) => Tensor;
  postprocess: (
    outputTensor: Tensor,
    inferenceTime: number,
    ctx: CanvasRenderingContext2D,
    modelName: string
  ) => Promise<Detection[]> | Detection[];
  currentModelResolution: number[];
  changeCurrentModelResolution: (width?: number, height?: number) => void;
  executionProvider?: string | null;
}) => {
  type Zone = { id: string; label: string; points: Point[] };
  const ZONE_STORAGE_KEY = 'sentinel_zones';
  const generateZoneId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `zone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  };

  const [inferenceTime, setInferenceTime] = useState<number>(0);
  const [totalTime, setTotalTime] = useState<number>(0);
  const webcamRef = useRef<Webcam>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveDetection = useRef<boolean>(false);

  const [facingMode, setFacingMode] = useState<string>('environment');
  const originalSize = useRef<number[]>([0, 0]);
  const [overlaySize, setOverlaySize] = useState<{ width: number; height: number }>({
    width: props.width,
    height: props.height,
  });

  const [zones, setZones] = useState<Zone[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(ZONE_STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Failed to parse saved zones', error);
      return [];
    }
  });
  const [showZoneEditor, setShowZoneEditor] = useState<boolean>(false);
  const [zoneAlerts, setZoneAlerts] = useState<string[]>([]);

  const [modelResolution, setModelResolution] = useState<number[]>(
    props.currentModelResolution
  );

  useEffect(() => {
    setModelResolution(props.currentModelResolution);
  }, [props.currentModelResolution]);

  const persistZones = (nextZones: Zone[]) => {
    setZones(nextZones);
    try {
      window.localStorage.setItem(ZONE_STORAGE_KEY, JSON.stringify(nextZones));
    } catch (error) {
      console.warn('Unable to persist zones', error);
    }
  };

  const handleZonesChange = (polygonList: Point[][]) => {
    const nextZones = polygonList.map((points, idx) => ({
      id: zones[idx]?.id ?? generateZoneId(),
      label: zones[idx]?.label ?? `Zone ${idx + 1}`,
      points,
    }));
    persistZones(nextZones);
  };

  const capture = () => {
    const canvas = videoCanvasRef.current!;
    const context = canvas.getContext('2d', {
      willReadFrequently: true,
    })!;

    const sourceEl = webcamRef.current?.video ?? videoRef.current;
    if (!sourceEl) return context;

    const isUserFacing = facingMode === 'user' && sourceEl === webcamRef.current?.video;
    if (isUserFacing) {
      context.setTransform(-1, 0, 0, 1, canvas.width, 0);
    }

    context.drawImage(sourceEl, 0, 0, canvas.width, canvas.height);

    if (isUserFacing) {
      context.setTransform(1, 0, 0, 1, 0, 0);
    }
    return context;
  };

  const handleDetectionsAgainstZones = (detections: Detection[] = []) => {
    if (!zones.length || !detections.length) return;
    const hits: string[] = [];
    detections.forEach((det) => {
      zones.forEach((zone) => {
        if (isPointInPolygon(det.center, zone.points)) {
          hits.push(`${zone.label}: ${det.label} ${(det.score * 100).toFixed(1)}%`);
        }
      });
    });
    if (hits.length) {
      setZoneAlerts((prev) => [...hits, ...prev].slice(0, 5));
    }
  };

  const runModel = async (ctx: CanvasRenderingContext2D) => {
    const data = props.preprocess(ctx);
    let outputTensor: Tensor;
    let inferenceTime: number;
    [outputTensor, inferenceTime] = await runModelUtils.runModel(
      props.session,
      data
    );

    const detections =
      (await props.postprocess(
        outputTensor,
        inferenceTime,
        ctx,
        props.modelName
      )) ?? [];
    handleDetectionsAgainstZones(detections as Detection[]);
    setInferenceTime(inferenceTime);
  };

  const runLiveDetection = async () => {
    if (liveDetection.current) {
      liveDetection.current = false;
      return;
    }
    liveDetection.current = true;
    while (liveDetection.current) {
      if (config.flags.capFps) {
        await new Promise((r) => setTimeout(r, 1000 / config.flags.capFps!));
      }
      const startTime = Date.now();
      const ctx = capture();
      if (!ctx) return;
      await runModel(ctx);
      setTotalTime(Date.now() - startTime);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
    }
  };

  const processImage = async () => {
    reset();
    const ctx = capture();
    if (!ctx) return;

    // create a copy of the canvas
    const boxCtx = document
      .createElement('canvas')
      .getContext('2d') as CanvasRenderingContext2D;
    boxCtx.canvas.width = ctx.canvas.width;
    boxCtx.canvas.height = ctx.canvas.height;
    boxCtx.drawImage(ctx.canvas, 0, 0);

    await runModel(boxCtx);
    ctx.drawImage(boxCtx.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
  };

  const reset = async () => {
    var context = videoCanvasRef.current!.getContext('2d')!;
    context.clearRect(0, 0, originalSize.current[0], originalSize.current[1]);
    liveDetection.current = false;
  };

  const [SSR, setSSR] = useState<Boolean>(true);

  const setWebcamCanvasOverlaySize = () => {
    const element = webcamRef.current?.video ?? videoRef.current!;
    if (!element) return;
    var w = element.offsetWidth;
    var h = element.offsetHeight;
    var cv = videoCanvasRef.current;
    if (!cv) return;
    cv.width = w;
    cv.height = h;
    setOverlaySize({ width: w, height: h });
  };

  // close camera when browser tab is minimized
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        liveDetection.current = false;
      }
      // set SSR to true to prevent webcam from loading when tab is not active
      setSSR(document.hidden);
    };
    setSSR(document.hidden);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!SSR && config.flags.useVideoFallback && !webcamRef.current?.video) {
      // preload demo video
      const v = videoRef.current;
      if (v) {
        v.src = '/_next/static/chunks/pages/demo.mp4';
        v.loop = true;
        v.muted = true;
        v.play().catch(() => {/* ignore */});
      }
    }
  }, [SSR]);

  if (SSR) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-row flex-wrap w-full justify-evenly align-center">
      <div
        id="webcam-container"
        className="flex items-center justify-center webcam-container"
      >
        <Webcam
          mirrored={facingMode === 'user'}
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          imageSmoothing={true}
          videoConstraints={{
            facingMode: facingMode,
            // width: props.width,
            // height: props.height,
          }}
          onLoadedMetadata={() => {
            setWebcamCanvasOverlaySize();
            originalSize.current = [
              webcamRef.current!.video!.offsetWidth,
              webcamRef.current!.video!.offsetHeight,
            ] as number[];
          }}
          forceScreenshotSourceSize={true}
        />
        {config.flags.useVideoFallback && (
          <video
            ref={videoRef}
            style={{ position: 'absolute', visibility: webcamRef.current?.video ? 'hidden' : 'visible' }}
            width={props.width}
            height={props.height}
            onLoadedMetadata={() => setWebcamCanvasOverlaySize()}
          />
        )}
        <canvas
          id="cv1"
          ref={videoCanvasRef}
          style={{
            position: 'absolute',
            zIndex: 10,
            backgroundColor: 'rgba(0,0,0,0)',
          }}
        ></canvas>
        {showZoneEditor && (
          <ZoneEditor
            width={overlaySize.width}
            height={overlaySize.height}
            zones={zones.map((z) => z.points)}
            onZonesChange={handleZonesChange}
          />
        )}
      </div>
      <div className="flex flex-col items-center justify-center">
        <div className="flex flex-row flex-wrap items-center justify-center gap-1 m-5">
          <div className="flex items-stretch items-center justify-center gap-1">
            <button
              onClick={async () => {
                const startTime = Date.now();
                await processImage();
                setTotalTime(Date.now() - startTime);
              }}
              className="p-2 border-2 border-dashed rounded-xl hover:translate-y-1 "
            >
              Capture Photo
            </button>
            <button
              onClick={async () => {
                if (liveDetection.current) {
                  liveDetection.current = false;
                } else {
                  runLiveDetection();
                }
              }}
              //on hover, shift the button up
              className={`
              p-2  border-dashed border-2 rounded-xl hover:translate-y-1 
              ${liveDetection.current ? 'bg-white text-black' : ''}
              
              `}
            >
              Live Detection
            </button>
          </div>
          <div className="flex items-stretch items-center justify-center gap-1">
            <button
              onClick={() => {
                reset();
                setFacingMode(facingMode === 'user' ? 'environment' : 'user');
              }}
              className="p-2 border-2 border-dashed rounded-xl hover:translate-y-1 "
            >
              Switch Camera
            </button>
            <button
              onClick={() => {
                reset();
                props.changeCurrentModelResolution();
              }}
              className="p-2 border-2 border-dashed rounded-xl hover:translate-y-1 "
            >
              Change Model
            </button>
            <button
              onClick={() => setShowZoneEditor((prev) => !prev)}
              className="p-2 border-2 border-dashed rounded-xl hover:translate-y-1 "
            >
              {showZoneEditor ? 'Hide Zones' : 'Edit Zones'}
            </button>
            <button
              onClick={reset}
              className="p-2 border-2 border-dashed rounded-xl hover:translate-y-1 "
            >
              Reset
            </button>
          </div>
        </div>
        {/* <div>
          <div>Yolov10 has a dynamic resolution with a maximum of 640x640</div>
          <div className="flex items-stretch items-center justify-center gap-1">
            <input
              value={modelResolution[0]}
              max={640}
              type="number"
              className="p-2 border-2 border-dashed rounded-xl hover:translate-y-1"
              placeholder="Width"
              onChange={(e) => {
                setModelResolution([
                  parseInt(e.target.value),
                  modelResolution[1],
                ]);
              }}
            />
            <input
              value={modelResolution[1]}
              max={640}
              type="number"
              className="p-2 border-2 border-dashed rounded-xl hover:translate-y-1"
              placeholder="Height"
              onChange={(e) => {
                setModelResolution([
                  modelResolution[0],
                  parseInt(e.target.value),
                ]);
              }}
            />
            <button
              onClick={() => {
                reset();
                if (modelResolution[0] > 640 || modelResolution[1] > 640) {
                  alert('Maximum resolution is 640x640');
                  return;
                }
                props.changeCurrentModelResolution(
                  modelResolution[0],
                  modelResolution[1]
                );
              }}
              className="p-2 border-2 border-dashed rounded-xl hover:translate-y-1"
            >
              Apply
            </button>
          </div>
        </div> */}
        <div>Using {props.modelName}</div>
        <div className="flex flex-row flex-wrap items-center justify-between w-full gap-3 px-5">
          <div>
            {'Model Inference Time: ' + inferenceTime.toFixed() + 'ms'}
            <br />
            {'Total Time: ' + totalTime.toFixed() + 'ms'}
            <br />
            {'Overhead Time: +' + (totalTime - inferenceTime).toFixed(2) + 'ms'}
            <br />
            {props.executionProvider && (
              <span className="text-sm text-neutral-400">
                {'Engine: ' + props.executionProvider.toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <div>
              {'Model FPS: ' + (1000 / inferenceTime).toFixed(2) + 'fps'}
            </div>
            <div>{'Total FPS: ' + (1000 / totalTime).toFixed(2) + 'fps'}</div>
            <div>
              {'Overhead FPS: ' +
                (1000 * (1 / totalTime - 1 / inferenceTime)).toFixed(2) +
                'fps'}
            </div>
          </div>
        </div>
        {zones.length > 0 && (
          <div className="mt-4 w-full px-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Zones ({zones.length})</h3>
              <span className="text-sm text-neutral-400">Right-click to finish drawing</span>
            </div>
            <div className="text-sm text-neutral-300">
              {zones.map((zone) => zone.label).join(', ')}
            </div>
          </div>
        )}
        {zoneAlerts.length > 0 && (
          <div className="mt-4 w-full px-5">
            <h3 className="font-semibold text-red-400">Zone Alerts</h3>
            <ul className="text-sm text-red-200 list-disc list-inside space-y-1 max-h-32 overflow-auto">
              {zoneAlerts.map((alert, idx) => (
                <li key={`alert-${idx}`}>{alert}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default ObjectDetectionCamera;
