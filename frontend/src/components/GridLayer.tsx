import React, { useMemo } from "react";
import { Layer, Line } from "react-konva";

export const GridLayer = React.memo(() => {
    const GRID_SIZE = 40000;
    const GRID_SPACING = 100;
    const GRID_COLOR = '#e0e0e0';
    const GRID_STROKE_WIDTH = 1;

    const lines = useMemo(() => {
        const newLines = [];
        const halfGridSize = GRID_SIZE / 2;
        for (let i = -halfGridSize; i <= halfGridSize; i += GRID_SPACING) {
            newLines.push(<Line key={`v-${i}`} points={[i, -halfGridSize, i, halfGridSize]} stroke={GRID_COLOR} strokeWidth={GRID_STROKE_WIDTH} />);
        }
        for (let i = -halfGridSize; i <= halfGridSize; i += GRID_SPACING) {
            newLines.push(<Line key={`h-${i}`} points={[-halfGridSize, i, halfGridSize, i]} stroke={GRID_COLOR} strokeWidth={GRID_STROKE_WIDTH} />);
        }
        return newLines;
    }, []);

    return <Layer listening={false} name="grid-layer">{lines}</Layer>;
});