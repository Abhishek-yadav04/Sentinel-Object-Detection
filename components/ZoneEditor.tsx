import React, { useState } from 'react';
import { Stage, Layer, Line, Circle, Text } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import type { Point } from '../types/detection';

type Props = {
  width: number;
  height: number;
  zones: Point[][];
  onZonesChange: (zones: Point[][]) => void;
  zoneStyles?: { label?: string; color?: string }[];
};

const ZoneEditor = ({ width, height, zones, onZonesChange, zoneStyles }: Props) => {
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [editMode, setEditMode] = useState(true);

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (!isDrawing) return;
    const pos = e.target.getStage()?.getPointerPosition();
    if (pos) {
      setDraftPoints((prev) => [...prev, pos]);
    }
  };

  const handleRightClick = (e: KonvaEventObject<MouseEvent>) => {
    e.evt.preventDefault();
    if (isDrawing && draftPoints.length > 2) {
      const updated = [...zones, draftPoints];
      onZonesChange(updated);
      setDraftPoints([]);
    }
    setIsDrawing(false);
  };

  const startDrawing = () => {
    setDraftPoints([]);
    setIsDrawing(true);
  };

  const reset = () => {
    setDraftPoints([]);
    onZonesChange([]);
    setIsDrawing(false);
  };

  const flattenedDraft = draftPoints.flatMap((p) => [p.x, p.y]);

  const centroid = (pts: Point[]) => {
    if (!pts.length) return { x: 0, y: 0 };
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    return { x: x / pts.length, y: y / pts.length };
  };

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      <div className="absolute top-2 left-2 z-30 flex gap-2 pointer-events-auto">
        <button
          onClick={startDrawing}
          disabled={isDrawing}
          className="p-2 bg-green-600 text-white rounded-lg disabled:bg-gray-400"
        >
          Add Zone
        </button>
        <button
          onClick={() => setEditMode((v) => !v)}
          className="p-2 bg-neutral-800 border border-neutral-700 text-white rounded-lg"
        >
          {editMode ? 'Disable Edit' : 'Enable Edit'}
        </button>
        <button onClick={reset} className="p-2 bg-red-600 text-white rounded-lg">
          Reset Zones
        </button>
      </div>
      <Stage
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onContextMenu={handleRightClick}
        className="pointer-events-auto"
      >
        <Layer>
          {zones.map((zone, i) => {
            const color = zoneStyles?.[i]?.color ?? 'red';
            const label = zoneStyles?.[i]?.label;
            const c = centroid(zone);
            // If color is a named color, we cannot easily apply alpha by suffix; use Konva opacity instead
            const useAlphaFill = undefined; // placeholder to keep lint calm
            return (
              <React.Fragment key={`zone-${i}`}>
                <Line
                  points={zone.flatMap((p) => [p.x, p.y])}
                  closed
                  fill={color}
                  opacity={0.25}
                  stroke={color}
                  strokeWidth={2}
                />
                {label && (
                  <Text x={c.x + 6} y={c.y + 6} text={label} fontSize={14} fill={color} />
                )}
                {editMode && zone.map((pt, idx) => (
                  <Circle
                    key={`handle-${i}-${idx}`}
                    x={pt.x}
                    y={pt.y}
                    radius={5}
                    fill={color}
                    stroke={"#111827"}
                    strokeWidth={1}
                    draggable
                    onDragMove={(e) => {
                      const pos = e.target.getStage()?.getPointerPosition();
                      if (!pos) return;
                      const next = zones.map((z) => z.map((p) => ({ ...p })));
                      next[i][idx] = { x: pos.x, y: pos.y };
                      onZonesChange(next);
                    }}
                    onContextMenu={(e) => {
                      e.evt.preventDefault();
                      if (zones[i].length <= 3) return; // keep polygon valid
                      const next = zones.map((z) => z.map((p) => ({ ...p })));
                      next[i] = next[i].filter((_, k) => k !== idx);
                      onZonesChange(next);
                    }}
                  />
                ))}
              </React.Fragment>
            );
          })}
          {isDrawing && (
            <Line points={flattenedDraft} stroke="dodgerblue" strokeWidth={2} />
          )}
          {draftPoints.map((point, i) => (
            <Circle key={`draft-${i}`} x={point.x} y={point.y} radius={4} fill="dodgerblue" />
          ))}
        </Layer>
      </Stage>
    </div>
  );
};

export default ZoneEditor;
