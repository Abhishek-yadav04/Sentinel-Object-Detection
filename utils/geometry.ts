// point-in-polygon test
export function isPointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
    let isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        const intersect = ((yi > point.y) !== (yj > point.y))
            && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
}

export type Point = { x: number; y: number };

function orient(a: Point, b: Point, c: Point): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
    return (
        Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) &&
        Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y)
    );
}

// Proper or colinear intersection of segments AB and CD
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);

    if ((o1 === 0 && onSegment(a, b, c)) || (o2 === 0 && onSegment(a, b, d)) || (o3 === 0 && onSegment(c, d, a)) || (o4 === 0 && onSegment(c, d, b))) {
        return true;
    }
    return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

// Signed side of point p relative to directed line a->b (positive = left side)
export function signedSide(a: Point, b: Point, p: Point): number {
    return orient(a, b, p);
}
