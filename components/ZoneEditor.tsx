import React, { useState } from 'react';
import { Stage, Layer, Line, Circle } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import type { Point } from '../types/detection';

type Props = {
  width: number;
  height: number;
  zones: Point[][];
  onZonesChange: (zones: Point[][]) => void;
};

const ZoneEditor = ({ width, height, zones, onZonesChange }: Props) => {
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

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
          {zones.map((zone, i) => (
            <Line
              key={`zone-${i}`}
              points={zone.flatMap((p) => [p.x, p.y])}
              closed
              fill="rgba(255, 0, 0, 0.25)"
              stroke="red"
              strokeWidth={2}
            />
          ))}
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
