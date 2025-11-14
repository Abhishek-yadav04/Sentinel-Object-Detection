import React, { useState } from 'react';
import { Stage, Layer, Line, Circle, Text } from 'react-konva';
import type { Point } from '../types/detection';

export type Tripwire = {
  id: string;
  label: string;
  a: Point;
  b: Point;
  color: string;
  enabled?: boolean;
  direction?: 'any' | 'a->b' | 'b->a';
};

type Props = {
  width: number;
  height: number;
  tripwires: Tripwire[];
  onTripwiresChange: (tripwires: Tripwire[]) => void;
};

const TripwireEditor = ({ width, height, tripwires, onTripwiresChange }: Props) => {
  const [draft, setDraft] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = () => { setDraft([]); setIsDrawing(true); };

  const cancelDrawing = () => { setDraft([]); setIsDrawing(false); };

  const addPoint = (p: Point) => {
    if (!isDrawing) return;
    if (draft.length === 0) setDraft([p]);
    else if (draft.length === 1) {
      const next: Tripwire = {
        id: crypto.randomUUID?.() ?? `tw-${Date.now()}`,
        label: `Tripwire ${tripwires.length + 1}`,
        a: draft[0],
        b: p,
        color: '#f59e0b',
        enabled: true,
        direction: 'any',
      };
      onTripwiresChange([...tripwires, next]);
      setDraft([]);
      setIsDrawing(false);
    }
  };

  const arrowMidpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      <div className="absolute top-2 right-2 z-30 flex gap-2 pointer-events-auto">
        <button onClick={startDrawing} disabled={isDrawing} className="p-2 bg-green-600 text-white rounded-lg disabled:bg-gray-400">Add Tripwire</button>
        <button onClick={cancelDrawing} className="p-2 bg-neutral-800 border border-neutral-700 text-white rounded-lg">Cancel</button>
      </div>
      <Stage width={width} height={height} onClick={(e: any) => {
        const pos = e.target.getStage()?.getPointerPosition();
        if (pos) addPoint(pos);
      }} onContextMenu={(e: any) => { e.evt.preventDefault(); cancelDrawing(); }} className="pointer-events-auto">
        <Layer>
          {tripwires.map((tw) => {
            const mid = arrowMidpoint(tw.a, tw.b);
            return (
              <React.Fragment key={tw.id}>
                <Line points={[tw.a.x, tw.a.y, tw.b.x, tw.b.y]} stroke={tw.color} strokeWidth={3} opacity={tw.enabled === false ? 0.3 : 1} />
                <Text x={mid.x + 6} y={mid.y + 6} text={tw.label} fontSize={14} fill={tw.color} />
                {/* draggable endpoints */}
                <Circle x={tw.a.x} y={tw.a.y} radius={5} fill={tw.color} draggable onDragMove={(e) => {
                  const p = e.target.getStage()?.getPointerPosition();
                  if (!p) return;
                  const next = tripwires.map((it) => it.id === tw.id ? { ...it, a: { x: p.x, y: p.y } } : it);
                  onTripwiresChange(next);
                }} />
                <Circle x={tw.b.x} y={tw.b.y} radius={5} fill={tw.color} draggable onDragMove={(e) => {
                  const p = e.target.getStage()?.getPointerPosition();
                  if (!p) return;
                  const next = tripwires.map((it) => it.id === tw.id ? { ...it, b: { x: p.x, y: p.y } } : it);
                  onTripwiresChange(next);
                }} />
              </React.Fragment>
            );
          })}
          {isDrawing && draft.length === 1 && (
            <Circle x={draft[0].x} y={draft[0].y} radius={4} fill="dodgerblue" />
          )}
        </Layer>
      </Stage>
    </div>
  );
};

export default TripwireEditor;
