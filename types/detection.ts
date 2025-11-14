export type Point = { x: number; y: number };

export type Detection = {
  bbox: { x0: number; y0: number; x1: number; y1: number };
  classId: number;
  score: number;
  label: string;
  center: Point;
};
