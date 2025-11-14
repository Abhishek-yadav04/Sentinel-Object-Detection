import Webcam from 'react-webcam';
import { useRef, useState, useEffect } from 'react';
import { runModelUtils } from '../utils';
import { InferenceSession, Tensor } from 'onnxruntime-web';
import { config } from '../utils/config';
import { Detection, Point } from '../types/detection';
import { isPointInPolygon, segmentsIntersect, signedSide } from '../utils/geometry';
import { yoloClasses } from '../data/yolo_classes';
import dynamic from 'next/dynamic';
import Button from './common/Button';
import { Camera, Download, Play, Square, RefreshCw, Shuffle, Map as MapIcon, Route, Upload, FolderOpen, Video, Circle, Volume2, VolumeX, Link2 } from 'lucide-react';

const ZoneEditor = dynamic(() => import('./ZoneEditor'), {
  ssr: false,
  loading: () => null,
});
const TripwireEditor = dynamic(() => import('./TripwireEditor'), {
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
  type Zone = { id: string; label: string; points: Point[]; color: string; enabled?: boolean };
  type Tripwire = { id: string; label: string; a: Point; b: Point; color: string; enabled?: boolean; direction?: 'any' | 'a->b' | 'b->a' };
  const ZONE_STORAGE_KEY = 'sentinel_zones';
  const TRIPWIRE_STORAGE_KEY = 'sentinel_tripwires';
  const generateZoneId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `zone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  };
  const generateTripwireId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `tw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  };

  const [inferenceTime, setInferenceTime] = useState<number>(0);
  const [totalTime, setTotalTime] = useState<number>(0);
  const [avgFps, setAvgFps] = useState<number>(0);
  const [lastDetections, setLastDetections] = useState<Detection[]>([]);
  const webcamRef = useRef<Webcam>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveDetection = useRef<boolean>(false);

  const [facingMode, setFacingMode] = useState<string>('environment');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const originalSize = useRef<number[]>([0, 0]);
  const [overlaySize, setOverlaySize] = useState<{ width: number; height: number }>({
    width: props.width,
    height: props.height,
  });

  const colorPalette = ['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#84cc16'];
  const pickColor = (idx: number) => colorPalette[idx % colorPalette.length];

  const [zones, setZones] = useState<Zone[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(ZONE_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((z: any, idx: number) => ({
          id: z.id,
          label: z.label ?? `Zone ${idx + 1}`,
          points: z.points ?? [],
          color: z.color ?? pickColor(idx),
          enabled: z.enabled ?? true,
        }));
      }
      return [];
    } catch (error) {
      console.warn('Failed to parse saved zones', error);
      return [];
    }
  });
  const [tripwires, setTripwires] = useState<Tripwire[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(TRIPWIRE_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((t: any, idx: number) => ({
          id: t.id || generateTripwireId(),
          label: t.label ?? `Tripwire ${idx + 1}`,
          a: t.a,
          b: t.b,
          color: t.color ?? '#f59e0b',
          enabled: t.enabled ?? true,
          direction: t.direction ?? 'any',
        }));
      }
      return [];
    } catch (e) {
      console.warn('Failed to parse tripwires', e);
      return [];
    }
  });
  const [showTripwireEditor, setShowTripwireEditor] = useState<boolean>(false);
  const [showZoneEditor, setShowZoneEditor] = useState<boolean>(false);
  const [zoneAlerts, setZoneAlerts] = useState<string[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem('sentinel_sound');
    return v === null ? true : v === 'true';
  });
  const [fpsCap, setFpsCap] = useState<number | null>(() => {
    if (typeof window === 'undefined') return config.flags.capFps;
    const v = window.localStorage.getItem('sentinel_fps');
    return v ? Number(v) : (config.flags.capFps ?? 30);
  });
  const [classFilter, setClassFilter] = useState<Set<number>>(() => {
    if (typeof window === 'undefined') return new Set<number>();
    const raw = window.localStorage.getItem('sentinel_classes');
    if (!raw) return new Set<number>();
    try {
      const arr = JSON.parse(raw) as number[];
      return new Set<number>(arr);
    } catch {
      return new Set<number>();
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastWebhookSentRef = useRef<Record<string, number>>({});
  const [webhookEnabled, setWebhookEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return config.flags.enableAlertWebhook ?? false;
    const v = window.localStorage.getItem('sentinel_webhook');
    return v === null ? (config.flags.enableAlertWebhook ?? false) : v === 'true';
  });
  // Batched webhook queue
  type AlertEvent = { ts: number; zone: Zone; det: Detection };
  const alertQueueRef = useRef<AlertEvent[]>([]);
  const [isFlusherRunning, setIsFlusherRunning] = useState(false);
  const retryStateRef = useRef<{ retries: number; nextDelay: number }>({ retries: 0, nextDelay: config.alerts?.retryBackoffMs ?? 1500 });

  const [modelResolution, setModelResolution] = useState<number[]>(
    props.currentModelResolution
  );
  // Zone history for undo/redo
  const zonePastRef = useRef<Zone[][]>([]);
  const zoneFutureRef = useRef<Zone[][]>([]);

  // Recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState<number>(5);

  // FPS sparkline
  const metricsCanvasRef = useRef<HTMLCanvasElement>(null);
  const fpsHistoryRef = useRef<number[]>([]);

  // Class thresholds for alerts
  const [classThresholds, setClassThresholds] = useState<Record<number, number>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem('sentinel_class_thresholds');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const prevDetectionsRef = useRef<Detection[]>([]);

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
  const persistTripwires = (nextTripwires: Tripwire[]) => {
    setTripwires(nextTripwires);
    try {
      window.localStorage.setItem(TRIPWIRE_STORAGE_KEY, JSON.stringify(nextTripwires));
    } catch (error) {
      console.warn('Unable to persist tripwires', error);
    }
  };

  const handleZonesChange = (polygonList: Point[][]) => {
    // Save current zones to history before mutating
    zonePastRef.current.push(zones.map((z) => ({ ...z, points: [...z.points] })));
    zoneFutureRef.current = [];
    const nextZones = polygonList.map((points, idx) => ({
      id: zones[idx]?.id ?? generateZoneId(),
      label: zones[idx]?.label ?? `Zone ${idx + 1}`,
      points,
      color: zones[idx]?.color ?? pickColor(idx),
      enabled: zones[idx]?.enabled ?? true,
    }));
    persistZones(nextZones);
  };

  const undoZones = () => {
    const prev = zonePastRef.current.pop();
    if (!prev) return;
    zoneFutureRef.current.push(zones.map((z) => ({ ...z, points: [...z.points] })));
    persistZones(prev);
  };

  const redoZones = () => {
    const next = zoneFutureRef.current.pop();
    if (!next) return;
    zonePastRef.current.push(zones.map((z) => ({ ...z, points: [...z.points] })));
    persistZones(next);
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

  const signPayload = async (body: string) => {
    try {
      const key = config.alerts?.hmacKey;
      if (!key) return undefined;
      const enc = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(body));
      const bytes = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
      return bytes;
    } catch { return undefined; }
  };

  const postAlertWebhook = async (payload: any) => {
    try {
      if (!webhookEnabled) return;
      if (!config.flags.enableAlertWebhook) return;
      const url = config.alerts?.webhookUrl;
      if (!url) return;
      const body = JSON.stringify(payload);
      const signature = await signPayload(body);
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(signature ? { 'X-Signature': signature } : {}) },
        keepalive: true,
        body,
      }).catch(() => {});
    } catch {}
  };

  const maybeSendWebhook = (zone: Zone, det: Detection) => {
    const key = `${zone.id}:${det.classId}`;
    const now = Date.now();
    const last = lastWebhookSentRef.current[key] ?? 0;
    const cooldownMs = 5000;
    if (now - last < cooldownMs) return;
    lastWebhookSentRef.current[key] = now;
    if (config.alerts?.batchEnabled) {
      alertQueueRef.current.push({ ts: now, zone, det });
    } else {
      const payload = {
        timestamp: new Date(now).toISOString(),
        model: props.modelName,
        zone: { id: zone.id, label: zone.label },
        detection: {
          classId: det.classId,
          label: det.label,
          score: Number(det.score?.toFixed?.(4) ?? det.score),
          center: det.center,
          bbox: det.bbox,
        },
      };
      postAlertWebhook(payload);
    }
  };

  const maybeSendTripwireWebhook = (tw: Tripwire, det: Detection, crossingDirection: 'a->b' | 'b->a' | 'any') => {
    const key = `tw:${tw.id}:${det.classId}`;
    const now = Date.now();
    const last = lastWebhookSentRef.current[key] ?? 0;
    const cooldownMs = 3000;
    if (now - last < cooldownMs) return;
    lastWebhookSentRef.current[key] = now;
    const payload = {
      timestamp: new Date(now).toISOString(),
      model: props.modelName,
      event: 'tripwire',
      tripwire: { id: tw.id, label: tw.label, direction: tw.direction ?? 'any', firedDirection: crossingDirection },
      detection: {
        classId: det.classId,
        label: det.label,
        score: Number(det.score?.toFixed?.(4) ?? det.score),
        center: det.center,
        bbox: det.bbox,
      },
    };
    postAlertWebhook(payload);
  };

  // Flusher effect for batched webhooks
  useEffect(() => {
    if (!config.alerts?.batchEnabled) return;
    if (isFlusherRunning) return;
    let timer: any;
    const windowMs = config.alerts?.batchWindowMs ?? 1500;
    const maxRetries = config.alerts?.maxRetries ?? 3;
    const runFlush = async () => {
      setIsFlusherRunning(true);
      try {
        const queue = alertQueueRef.current;
        if (queue.length === 0) return;
        // Aggregate by zone/class
        const groups = new Map<string, { zone: Zone; classId: number; label: string; count: number; maxScore: number; sample: Detection }>();
        for (const { zone, det } of queue) {
          const k = `${zone.id}:${det.classId}`;
          const g = groups.get(k) ?? { zone, classId: det.classId, label: det.label, count: 0, maxScore: 0, sample: det };
          g.count += 1;
          if (det.score > g.maxScore) { g.maxScore = det.score; g.sample = det; }
          groups.set(k, g);
        }
        const batch = Array.from(groups.values()).map((g) => ({
          zone: { id: g.zone.id, label: g.zone.label },
          classId: g.classId,
          label: g.label,
          count: g.count,
          maxScore: Number(g.maxScore.toFixed(4)),
          sample: { center: g.sample.center, bbox: g.sample.bbox },
        }));
        const payload = {
          timestamp: new Date().toISOString(),
          model: props.modelName,
          events: batch,
        };
        // attempt send
        const body = JSON.stringify(payload);
        const signature = await signPayload(body);
        const resp = await fetch(String(config.alerts?.webhookUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(signature ? { 'X-Signature': signature } : {}) },
          keepalive: true,
          body,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        // success: clear queue and reset retry state
        alertQueueRef.current = [];
        retryStateRef.current = { retries: 0, nextDelay: config.alerts?.retryBackoffMs ?? 1500 };
      } catch (err) {
        // failure: keep queue, schedule retry with backoff
        const st = retryStateRef.current;
        if (st.retries < (config.alerts?.maxRetries ?? 3)) {
          st.retries += 1;
          st.nextDelay = Math.min((st.nextDelay || 1000) * 2, 30000);
        }
      }
    };
    const tick = () => {
      const st = retryStateRef.current;
      const delay = alertQueueRef.current.length > 0 ? (st.retries > 0 ? st.nextDelay : (config.alerts?.batchWindowMs ?? 1500)) : (config.alerts?.batchWindowMs ?? 1500);
      timer = setTimeout(async () => {
        await runFlush();
        tick();
      }, delay);
    };
    tick();
    return () => { clearTimeout(timer); setIsFlusherRunning(false); };
  }, [isFlusherRunning, props.modelName]);

  const handleDetectionsAgainstZones = (detections: Detection[] = []) => {
    if (!zones.length || !detections.length) return;
    const hits: string[] = [];
    detections.forEach((det) => {
      if (classFilter.size && !classFilter.has(det.classId)) return;
      const minTh = classThresholds[det.classId] ?? 0.25;
      if (typeof det.score === 'number' && det.score < minTh) return;
      zones.forEach((zone) => {
        if (zone.enabled !== false && isPointInPolygon(det.center, zone.points)) {
          hits.push(`${zone.label}: ${det.label} ${(det.score * 100).toFixed(1)}%`);
          maybeSendWebhook(zone, det);
        }
      });
    });
    if (hits.length) {
      setZoneAlerts((prev) => [...hits, ...prev].slice(0, 5));
      if (soundEnabled) beep();
    }
  };

  const handleDetectionsAgainstTripwires = (detections: Detection[] = []) => {
    if (!tripwires.length || !detections.length) return;
    // filter detections by class and threshold similar to zones
    const filt = detections.filter((det) => {
      if (classFilter.size && !classFilter.has(det.classId)) return false;
      const minTh = classThresholds[det.classId] ?? 0.25;
      if (typeof det.score === 'number' && det.score < minTh) return false;
      return true;
    });
    if (!filt.length) return;
    const prev = prevDetectionsRef.current || [];
    const unmatched = prev.slice();
    const used = new Set<number>();
    const maxDist = Math.max(20, Math.min(overlaySize.width, overlaySize.height) * 0.12);

    const pickNearestPrev = (det: Detection) => {
      let bestIdx = -1;
      let bestD = Infinity;
      for (let i = 0; i < unmatched.length; i++) {
        if (used.has(i)) continue;
        const pd = unmatched[i];
        if (pd.classId !== det.classId) continue;
        const dx = pd.center.x - det.center.x;
        const dy = pd.center.y - det.center.y;
        const d = Math.hypot(dx, dy);
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      if (bestIdx >= 0 && bestD <= maxDist) {
        used.add(bestIdx);
        return unmatched[bestIdx];
      }
      return undefined;
    };

    const hits: string[] = [];
    for (const det of filt) {
      const prevMatch = pickNearestPrev(det);
      if (!prevMatch) continue;
      for (const tw of tripwires) {
        if (tw.enabled === false) continue;
        const crossed = segmentsIntersect(prevMatch.center, det.center, tw.a, tw.b);
        if (!crossed) continue;
        const s0 = signedSide(tw.a, tw.b, prevMatch.center);
        const s1 = signedSide(tw.a, tw.b, det.center);
        let dir: 'a->b' | 'b->a' | 'any' = 'any';
        if (s0 < 0 && s1 > 0) dir = 'a->b';
        else if (s0 > 0 && s1 < 0) dir = 'b->a';
        // direction filter
        const want = tw.direction ?? 'any';
        if (want !== 'any' && want !== dir) continue;
        hits.push(`${tw.label}: ${det.label} ${(det.score * 100).toFixed(1)}% (${dir})`);
        maybeSendTripwireWebhook(tw, det, dir);
      }
    }
    if (hits.length) {
      setZoneAlerts((prevAlerts) => [...hits, ...prevAlerts].slice(0, 5));
      if (soundEnabled) beep();
    }
  };

  const beep = () => {
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      o.start();
      o.stop(ctx.currentTime + 0.26);
    } catch {}
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
    const dets = detections as Detection[];
    handleDetectionsAgainstZones(dets);
    handleDetectionsAgainstTripwires(dets);
    setInferenceTime(inferenceTime);
    setLastDetections(dets);
    // update prev detections for tripwire tracking
    prevDetectionsRef.current = dets;
  };

  const runLiveDetection = async () => {
    if (liveDetection.current) {
      liveDetection.current = false;
      return;
    }
    liveDetection.current = true;
    while (liveDetection.current) {
      if (config.flags.capFps) {
        const cap = fpsCap ?? config.flags.capFps!;
        await new Promise((r) => setTimeout(r, 1000 / cap));
      }
      const startTime = Date.now();
      const ctx = capture();
      if (!ctx) return;
      await runModel(ctx);
      const elapsed = Date.now() - startTime;
      setTotalTime(elapsed);
      const instFps = 1000 / Math.max(elapsed, 1);
      setAvgFps((prev) => (prev === 0 ? instFps : prev * 0.85 + instFps * 0.15));
      // update FPS sparkline
      fpsHistoryRef.current.push(instFps);
      if (fpsHistoryRef.current.length > 100) fpsHistoryRef.current.shift();
      drawFpsSparkline();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
    }
  };

  const startRecording = () => {
    if (isRecording) return;
    const canvas = videoCanvasRef.current;
    if (!canvas) return;
    try {
      const stream = canvas.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      recordedChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setIsRecording(true);
      // auto-stop after recordSeconds
      setTimeout(() => { stopRecording(); }, Math.max(1, recordSeconds) * 1000);
    } catch (e) {
      // ignore errors
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state !== 'inactive') rec.stop();
    setIsRecording(false);
  };

  const drawFpsSparkline = () => {
    const cv = metricsCanvasRef.current;
    if (!cv) return;
    const w = (cv.width = 180);
    const h = (cv.height = 40);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0,0,w,h);
    const data = fpsHistoryRef.current;
    if (data.length === 0) return;
    const max = Math.max(10, ...data);
    const min = Math.min(0, ...data);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * (w - 10) + 5;
      const y = h - 5 - ((v - min) / (max - min)) * (h - 10);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${avgFps.toFixed(1)} fps`, 6, 12);
  };

  const downloadSnapshot = () => {
    const canvas = videoCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `snapshot-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const exportZones = () => {
    const data = JSON.stringify(zones, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zones.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importZones = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed)) {
          const next: Zone[] = parsed.map((z: any, idx: number) => ({
            id: z.id || generateZoneId(),
            label: z.label || `Zone ${idx + 1}`,
            points: z.points || [],
            color: z.color || pickColor(idx),
            enabled: z.enabled ?? true,
          }));
          persistZones(next);
        }
      } catch (e) {
        console.warn('Failed to import zones', e);
      }
    };
    reader.readAsText(file);
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

  const refreshDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter((d) => d.kind === 'videoinput');
      setDevices(cams);
      if (!selectedDeviceId && cams.length > 0) {
        setSelectedDeviceId(cams[0].deviceId || undefined);
      }
    } catch (e) {
      // ignore
    }
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

  // Populate device list after mount
  useEffect(() => {
    refreshDevices();
  }, []);

  // Persist settings
  useEffect(() => {
    try { window.localStorage.setItem('sentinel_sound', String(soundEnabled)); } catch {}
  }, [soundEnabled]);
  useEffect(() => {
    try { window.localStorage.setItem('sentinel_fps', String(fpsCap ?? '')); } catch {}
  }, [fpsCap]);
  useEffect(() => {
    try { window.localStorage.setItem('sentinel_classes', JSON.stringify(Array.from(classFilter.values()))); } catch {}
  }, [classFilter]);
  useEffect(() => {
    try { window.localStorage.setItem('sentinel_webhook', String(webhookEnabled)); } catch {}
  }, [webhookEnabled]);
  useEffect(() => {
    try { window.localStorage.setItem('sentinel_class_thresholds', JSON.stringify(classThresholds)); } catch {}
  }, [classThresholds]);

  // Keyboard shortcuts
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key.toLowerCase() === 'l') {
        if (liveDetection.current) {
          liveDetection.current = false;
        } else {
          runLiveDetection();
        }
      } else if (e.key.toLowerCase() === 'z') {
        setShowZoneEditor((v) => !v);
      } else if (e.key.toLowerCase() === 't') {
        setShowTripwireEditor((v) => !v);
      } else if (e.key.toLowerCase() === 's') {
        downloadSnapshot();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    if (!SSR && config.flags.useVideoFallback && !webcamRef.current?.video) {
      const v = videoRef.current;
      if (v && config.demoVideoPath) {
        v.src = config.demoVideoPath;
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
    <div className="w-full flex justify-center">
      <div className="w-full max-w-6xl px-4 md:px-6">
      <div
        id="webcam-container"
        className="relative webcam-container mx-auto flex items-center justify-center rounded-2xl border border-neutral-800/60 bg-neutral-900/30 backdrop-blur-sm shadow-xl overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-3 px-3 py-2 bg-black/40 backdrop-blur supports-[backdrop-filter]:bg-black/25">
          <span className="text-xs text-neutral-300">
            Camera: {(() => {
              const d = devices.find((x) => x.deviceId === selectedDeviceId);
              return d?.label || (facingMode === 'user' ? 'User-facing' : 'Environment');
            })()}
          </span>
          <span className="text-xs text-neutral-300">Engine: {props.executionProvider?.toUpperCase?.() || 'CPU'}</span>
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-300 border border-emerald-600/40 bg-emerald-900/20 rounded px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {avgFps.toFixed(1)} fps
          </span>
        </div>
        <Webcam
          mirrored={facingMode === 'user'}
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          imageSmoothing={true}
          videoConstraints={selectedDeviceId ? { deviceId: selectedDeviceId } : { facingMode }}
          onUserMedia={() => { setCameraError(null); setWebcamCanvasOverlaySize(); refreshDevices(); }}
          onUserMediaError={(err) => {
            const msg = typeof err === 'string' ? err : (err as any)?.message || 'Unable to access camera';
            setCameraError(msg);
            // try flipping to user-facing if environment fails
            if (facingMode === 'environment' && !selectedDeviceId) setFacingMode('user');
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
        <canvas id="cv1" ref={videoCanvasRef} style={{ position: 'absolute', zIndex: 10, backgroundColor: 'rgba(0,0,0,0)' }} />
        <canvas
          ref={metricsCanvasRef}
          style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 20, opacity: 0.9 }}
        />
        <div className="absolute top-2 right-2 z-40">
          <HelpOverlayButton position="top-right" />
        </div>
        {showZoneEditor && (
          <ZoneEditor
            width={overlaySize.width}
            height={overlaySize.height}
            zones={zones.map((z) => z.points)}
            zoneStyles={zones.map((z) => ({ label: z.label, color: z.color }))}
            onZonesChange={handleZonesChange}
          />
        )}
        {showTripwireEditor && (
          <TripwireEditor
            width={overlaySize.width}
            height={overlaySize.height}
            tripwires={tripwires}
            onTripwiresChange={(tw) => persistTripwires(tw)}
          />
        )}
      </div>
      <div className="flex flex-col items-center justify-center w-full">
        <div className="w-full max-w-6xl mx-auto mt-4 rounded-xl border border-neutral-800/60 bg-neutral-900/30 p-3 transition-shadow duration-300">
        <div className="flex flex-row flex-wrap items-center justify-center gap-2">
          <div className="flex items-stretch items-center justify-center gap-1">
            <Button
              onClick={async () => {
                const startTime = Date.now();
                await processImage();
                setTotalTime(Date.now() - startTime);
              }}
              variant="solid"
              color="neutral"
              iconLeft={<Camera size={16} />}
            >
              Capture Photo
            </Button>
            <Button
              onClick={downloadSnapshot}
              variant="solid"
              color="neutral"
              iconLeft={<Download size={16} />}
            >
              Download Snapshot
            </Button>
            <Button
              onClick={async () => {
                if (liveDetection.current) {
                  liveDetection.current = false;
                } else {
                  runLiveDetection();
                }
              }}
              variant="solid"
              color={liveDetection.current ? 'success' : 'neutral'}
              iconLeft={liveDetection.current ? <Square size={14} /> : <Play size={16} />}
            >
              Live Detection
            </Button>
            {!webcamRef.current?.video && (
              <Button
                onClick={async () => {
                  try {
                    await navigator.mediaDevices.getUserMedia({ video: true });
                    setCameraError(null);
                    refreshDevices();
                  } catch (e: any) {
                    setCameraError(e?.message || 'Camera permission denied');
                  }
                }}
                title="Request camera access"
                variant="solid"
                color="primary"
                iconLeft={<Video size={16} />}
              >
                Enable Camera
              </Button>
            )}
          </div>
          <div className="flex items-stretch items-center justify-center gap-1">
            <Button
              onClick={() => {
                reset();
                setFacingMode(facingMode === 'user' ? 'environment' : 'user');
              }}
              variant="solid"
              color="neutral"
              iconLeft={<RefreshCw size={16} />}
            >
              Switch Camera
            </Button>
            <select
              className="px-2 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm"
              value={selectedDeviceId || ''}
              onChange={(e) => { setSelectedDeviceId(e.target.value || undefined); reset(); }}
              title="Select video input"
            >
              {devices.length === 0 && <option value="">No cameras detected</option>}
              {devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
            <Button
              onClick={() => {
                reset();
                props.changeCurrentModelResolution();
              }}
              variant="solid"
              color="neutral"
              iconLeft={<Shuffle size={16} />}
            >
              Change Model
            </Button>
            <Button
              onClick={() => setShowZoneEditor((prev) => !prev)}
              variant="solid"
              color="neutral"
              iconLeft={<MapIcon size={16} />}
            >
              {showZoneEditor ? 'Hide Zones' : 'Edit Zones'}
            </Button>
            <Button
              onClick={() => setShowTripwireEditor((prev) => !prev)}
              variant="solid"
              color="neutral"
              iconLeft={<Route size={16} />}
            >
              {showTripwireEditor ? 'Hide Tripwires' : 'Edit Tripwires'}
            </Button>
            <Button
              onClick={exportZones}
              variant="outline"
              color="neutral"
              iconLeft={<Upload size={16} />}
            >
              Export Zones
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              color="neutral"
              iconLeft={<FolderOpen size={16} />}
            >
              Import Zones
            </Button>
            <div className="flex items-center gap-2 ml-2">
              <Button
                onClick={() => (isRecording ? stopRecording() : startRecording())}
                title={isRecording ? 'Stop recording and download' : 'Start recording a short clip'}
                variant="solid"
                color={isRecording ? 'danger' : 'neutral'}
                iconLeft={isRecording ? <Square size={14} /> : <Circle size={14} />}
              >
                {isRecording ? 'Stop Recording' : 'Record'}
              </Button>
              {!isRecording && (
                <span className="text-xs text-neutral-400 flex items-center gap-1">
                  <label>sec</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={recordSeconds}
                    onChange={(e) => setRecordSeconds(Math.max(1, Math.min(60, Number(e.target.value))))}
                    className="w-14 bg-neutral-900 border border-neutral-700 rounded px-1 py-1"
                  />
                </span>
              )}
            </div>
            <Button onClick={reset} variant="solid" color="neutral">Reset</Button>
          </div>
        </div>
        </div>
        {cameraError && (
          <div className="w-full px-5">
            <div className="rounded-lg border border-red-500/40 bg-red-900/30 p-3 text-sm text-red-100">
              <div className="font-semibold mb-1">Camera not accessible</div>
              <div>{cameraError}</div>
              <ul className="list-disc pl-5 mt-2 space-y-1 opacity-90">
                <li>Allow camera permission in your browser.</li>
                <li>Use HTTPS or localhost. Some browsers block camera on insecure origins.</li>
                <li>On Windows, check Privacy Settings → Camera → Allow apps and browsers.</li>
                <li>Pick a camera from the dropdown or click Enable Camera.</li>
              </ul>
              {!config.demoVideoPath && (
                <div className="mt-2 opacity-80">Tip: Set <code>NEXT_PUBLIC_DEMO_VIDEO</code> to show a fallback demo when no camera is available.</div>
              )}
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importZones(f);
            // reset to allow importing same file twice
            e.currentTarget.value = '';
          }}
        />
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
        <div className="w-full px-5">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[220px] rounded-lg border border-neutral-800/60 bg-neutral-900/30 p-3">
              <div className="text-xs uppercase text-neutral-400">Model</div>
              <div className="text-sm font-semibold break-all">{props.modelName}</div>
              {props.executionProvider && (
                <div className="mt-1 text-xs text-neutral-400">Engine: {props.executionProvider.toUpperCase()}</div>
              )}
            </div>
            <div className="flex-1 min-w-[220px] rounded-lg border border-neutral-800/60 bg-neutral-900/30 p-3">
              <div className="text-xs uppercase text-neutral-400">Latency</div>
              <div className="text-sm">Inference: {inferenceTime.toFixed()} ms</div>
              <div className="text-sm">Total: {totalTime.toFixed()} ms</div>
              <div className="text-sm">Overhead: +{(totalTime - inferenceTime).toFixed(2)} ms</div>
            </div>
            <div className="flex-1 min-w-[220px] rounded-lg border border-neutral-800/60 bg-neutral-900/30 p-3">
              <div className="text-xs uppercase text-neutral-400">Throughput</div>
              <div className="text-sm">Model FPS: {(1000 / Math.max(inferenceTime, 1)).toFixed(2)}</div>
              <div className="text-sm">Total FPS: {(1000 / Math.max(totalTime, 1)).toFixed(2)} (avg {avgFps.toFixed(1)})</div>
            </div>
            <div className="flex-1 min-w-[220px] rounded-lg border border-neutral-800/60 bg-neutral-900/30 p-3">
              <div className="text-xs uppercase text-neutral-400 mb-1">Detections</div>
              {(() => {
                const counts = new Map<number, number>();
                for (const d of lastDetections) counts.set(d.classId, (counts.get(d.classId) ?? 0) + 1);
                const top = Array.from(counts.entries()).sort((a,b) => b[1]-a[1]).slice(0,4);
                return (
                  <div className="text-xs text-neutral-300 flex flex-wrap gap-2">
                    <span className="opacity-70">total {lastDetections.length}</span>
                    {top.map(([cls,n]) => (
                      <span key={cls} className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800">
                        {(yoloClasses[cls] ?? String(cls))}: {n}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="flex-1 min-w-[220px] rounded-lg border border-neutral-800/60 bg-neutral-900/30 p-3">
              <div className="text-xs uppercase text-neutral-400 mb-1">Class Filters</div>
              <div className="flex flex-wrap gap-2">
                {['person','car','dog','bicycle'].map((name) => {
                  const idx = yoloClasses.indexOf(name);
                  const active = classFilter.has(idx);
                  return (
                    <button
                      key={name}
                      className={`px-2 py-1 text-xs rounded border ${active ? 'border-blue-500/50 bg-blue-700/30' : 'border-neutral-700 bg-neutral-800'}`}
                      onClick={() => {
                        setClassFilter((prev) => {
                          const next = new Set(prev);
                          if (next.has(idx)) next.delete(idx); else next.add(idx);
                          return next;
                        });
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-xs text-neutral-400">Alert thresholds</div>
              <div className="mt-1 flex flex-wrap gap-3">
                {['person','car','dog','bicycle'].map((name) => {
                  const cid = yoloClasses.indexOf(name);
                  const th = classThresholds[cid] ?? 0.25;
                  return (
                    <label key={`th-${name}`} className="flex items-center gap-2 text-xs">
                      <span className="w-14 capitalize">{name}</span>
                      <input type="range" min={0} max={1} step={0.05} value={th}
                        onChange={(e) => setClassThresholds((prev) => ({ ...prev, [cid]: Number(e.target.value) }))} />
                      <span className="w-10 tabular-nums">{th.toFixed(2)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex-1 min-w-[220px] rounded-lg border border-neutral-800/60 bg-neutral-900/30 p-3">
              <div className="text-xs uppercase text-neutral-400">Settings</div>
              <div className="mt-1 text-sm flex items-center gap-2">
                <label className="text-xs text-neutral-400">FPS Cap</label>
                <input
                  type="range"
                  min={5}
                  max={60}
                  value={fpsCap ?? config.flags.capFps ?? 30}
                  onChange={(e) => setFpsCap(Number(e.target.value))}
                />
                <span className="text-xs">{fpsCap ?? config.flags.capFps ?? 30}</span>
              </div>
              <div className="mt-2 text-sm flex items-center gap-2">
                <label className="text-xs text-neutral-400">Sound</label>
                <button
                  className={`px-2 py-1 rounded border ${soundEnabled ? 'border-green-500/50 bg-green-700/30' : 'border-neutral-700 bg-neutral-800'}`}
                  onClick={() => setSoundEnabled((v) => !v)}
                >
                  {soundEnabled ? 'On' : 'Off'}
                </button>
              </div>
              <div className="mt-2 text-sm flex items-center gap-2">
                <label className="text-xs text-neutral-400">Webhook</label>
                <button
                  className={`px-2 py-1 rounded border ${webhookEnabled ? 'border-blue-500/50 bg-blue-700/30' : 'border-neutral-700 bg-neutral-800'}`}
                  onClick={() => setWebhookEnabled((v) => !v)}
                  title={config.alerts?.webhookUrl ? config.alerts.webhookUrl : 'No webhook URL set'}
                >
                  {webhookEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="w-full px-5 mt-3 flex gap-2 items-center">
          <button
            onClick={undoZones}
            className="px-2 py-1 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-xs disabled:opacity-50"
            disabled={!zonePastRef.current.length}
            title="Undo zone change"
          >
            Undo
          </button>
          <button
            onClick={redoZones}
            className="px-2 py-1 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-xs disabled:opacity-50"
            disabled={!zoneFutureRef.current.length}
            title="Redo zone change"
          >
            Redo
          </button>
        </div>
        {zones.length > 0 && (
          <div className="mt-4 w-full px-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Zones ({zones.length})</h3>
                <span className="text-sm text-neutral-400">Right-click to finish drawing</span>
            </div>
              <div className="mt-2 flex flex-col gap-2">
                {zones.map((zone, idx) => (
                  <div key={zone.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="color"
                      value={zone.color}
                      onChange={(e) => {
                        const next = zones.slice();
                        next[idx] = { ...next[idx], color: e.target.value };
                        persistZones(next);
                      }}
                      title="Zone color"
                    />
                    <input
                      value={zone.label}
                      onChange={(e) => {
                        const next = zones.slice();
                        next[idx] = { ...next[idx], label: e.target.value };
                        persistZones(next);
                      }}
                      className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded"
                    />
                    <label className="flex items-center gap-1 text-xs text-neutral-400">
                      <input
                        type="checkbox"
                        checked={zone.enabled !== false}
                        onChange={(e) => {
                          const next = zones.slice();
                          next[idx] = { ...next[idx], enabled: e.target.checked };
                          persistZones(next);
                        }}
                      />
                      Active
                    </label>
                  </div>
                ))}
              </div>
          </div>
        )}
        {tripwires.length > 0 && (
          <div className="mt-4 w-full px-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Tripwires ({tripwires.length})</h3>
              <span className="text-sm text-neutral-400">Click Add Tripwire, then two points</span>
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {tripwires.map((tw, idx) => (
                <div key={tw.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <input
                    type="color"
                    value={tw.color}
                    onChange={(e) => {
                      const next = tripwires.slice();
                      next[idx] = { ...next[idx], color: e.target.value };
                      persistTripwires(next);
                    }}
                    title="Tripwire color"
                  />
                  <input
                    value={tw.label}
                    onChange={(e) => {
                      const next = tripwires.slice();
                      next[idx] = { ...next[idx], label: e.target.value };
                      persistTripwires(next);
                    }}
                    className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded"
                  />
                  <label className="flex items-center gap-1 text-xs text-neutral-400">
                    <input
                      type="checkbox"
                      checked={tw.enabled !== false}
                      onChange={(e) => {
                        const next = tripwires.slice();
                        next[idx] = { ...next[idx], enabled: e.target.checked };
                        persistTripwires(next);
                      }}
                    />
                    Active
                  </label>
                  <select
                    className="px-2 py-1 bg-neutral-900 border border-neutral-700 rounded text-xs"
                    value={tw.direction ?? 'any'}
                    onChange={(e) => {
                      const next = tripwires.slice();
                      next[idx] = { ...next[idx], direction: e.target.value as any };
                      persistTripwires(next);
                    }}
                    title="Direction filter"
                  >
                    <option value="any">Any</option>
                    <option value="a->b">A → B</option>
                    <option value="b->a">B → A</option>
                  </select>
                  <button
                    onClick={() => {
                      const next = tripwires.slice();
                      next.splice(idx, 1);
                      persistTripwires(next);
                    }}
                    className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
          {/* Help overlay moved to webcam top-right to avoid overlap */}
        
        {zoneAlerts.length > 0 && (
          <div className="fixed bottom-4 right-4 z-50 space-y-2">
            {zoneAlerts.map((alert, idx) => (
              <div
                key={`alert-${idx}`}
                className="max-w-sm rounded-lg border border-red-500/40 bg-red-900/40 px-3 py-2 text-sm text-red-50 shadow-lg backdrop-blur"
              >
                {alert}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

  // Lightweight help overlay component (client-side only UI)
  const HelpOverlayButton = ({ position = 'bottom-left' as 'top-right' | 'bottom-left' }) => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className={`${position === 'top-right' ? 'px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm' : 'fixed bottom-4 left-4 z-50 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm'}`}
          title="Show help"
        >
          Help
        </button>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
            <div className="max-w-lg w-[92%] rounded-lg border border-neutral-700 bg-neutral-900 p-4 text-sm" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">How to draw zones</h4>
                <button onClick={() => setOpen(false)} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700">Close</button>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-neutral-300">
                <li>Click "Edit Zones" to open the editor.</li>
                <li>Click "Add Zone", then left-click to add polygon points.</li>
                <li>Right-click to finish the polygon.</li>
                <li>Press <code>Z</code> to toggle zones, <code>T</code> tripwires, <code>L</code> live, <code>S</code> snapshot.</li>
              </ul>
            </div>
          </div>
        )}
      </>
    );
  };

export default ObjectDetectionCamera;
