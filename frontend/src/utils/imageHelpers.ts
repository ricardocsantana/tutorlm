import type { LineData } from "../store/useAppStore";

interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const getLineBoundingBox = (line: LineData): BoundingBox => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < line.points.length; i += 2) {
        minX = Math.min(minX, line.points[i]);
        maxX = Math.max(maxX, line.points[i]);
        minY = Math.min(minY, line.points[i + 1]);
        maxY = Math.max(maxY, line.points[i + 1]);
    }
    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };
};

export const dbscan = (
    points: (BoundingBox & { id: string })[],
    epsilon: number,
    minPts: number
) => {
    const clusters: string[][] = [];
    const visited = new Set<string>();

    const dist = (p1: BoundingBox, p2: BoundingBox) => {
        const dx = Math.max(
            0,
            Math.abs((p1.x + p1.width / 2) - (p2.x + p2.width / 2)) - (p1.width + p2.width) / 2
        );
        const dy = Math.max(
            0,
            Math.abs((p1.y + p1.height / 2) - (p2.y + p2.height / 2)) - (p1.height + p2.height) / 2
        );
        return Math.sqrt(dx * dx + dy * dy);
    };

    const getNeighbors = (pointIndex: number) => {
        const neighbors: number[] = [];
        for (let i = 0; i < points.length; i++) {
            if (i !== pointIndex && dist(points[pointIndex], points[i]) < epsilon) {
                neighbors.push(i);
            }
        }
        return neighbors;
    };

    for (let i = 0; i < points.length; i++) {
        if (visited.has(points[i].id)) continue;
        visited.add(points[i].id);
        const neighbors = getNeighbors(i);
        if (neighbors.length < minPts) continue;
        const newCluster: string[] = [points[i].id];
        let queue = [...neighbors];
        while (queue.length > 0) {
            const neighborIndex = queue.shift()!;
            const neighborId = points[neighborIndex].id;
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                const newNeighbors = getNeighbors(neighborIndex);
                if (newNeighbors.length >= minPts) {
                    queue = [...queue, ...newNeighbors];
                }
            }
            if (
                !newCluster.some(
                    id =>
                        points.find(p => p.id === id) ===
                        points.find(p => p.id === neighborId)
                )
            ) {
                newCluster.push(neighborId);
            }
        }
        clusters.push(newCluster);
    }
    return clusters;
};

export const dataURLtoBlob = (dataurl: string): Blob => {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error("Invalid data URL");
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
};