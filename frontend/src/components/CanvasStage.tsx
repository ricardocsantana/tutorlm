import React from 'react';
import { Stage, Layer, Line, Transformer } from 'react-konva';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';

import { useAppStore } from '../store/useAppStore';
import { GridLayer } from './GridLayer';
import { KonvaElement } from './KonvaElement';
import { useShallow } from 'zustand/react/shallow';

// Props interface remains the same
interface CanvasStageProps {
    stagePos: { x: number; y: number };
    stageScale: number;
    draggable: boolean;
    eventHandlers: {
        onMouseDown: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void;
        onMouseMove: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void;
        onMouseUp: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void;
        onTouchStart: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void;
        onTouchMove: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void;
        onTouchEnd: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void;
        onWheel: (e: KonvaEventObject<WheelEvent>) => void;
        onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
    };
}

// 1. Wrap the component definition in React.forwardRef
// The 'ref' is passed as the second argument to the render function.
export const CanvasStage = React.forwardRef<Konva.Stage, CanvasStageProps>(
    ({ stagePos, stageScale, draggable, eventHandlers }, ref) => {
        const { lines, elements, selectedElementId, editingElementId, currentTool } = useAppStore(
            useShallow(state => ({
                lines: state.lines,
                elements: state.elements,
                selectedElementId: state.selectedElementId,
                editingElementId: state.editingElementId,
                currentTool: state.currentTool,
            }))
        );

        return (
            <Stage
                // 2. Pass the forwarded ref to the underlying Konva <Stage> component
                ref={ref}
                width={window.innerWidth}
                height={window.innerHeight}
                scaleX={stageScale}
                scaleY={stageScale}
                x={stagePos.x}
                y={stagePos.y}
                draggable={draggable}
                {...eventHandlers}
            >
                <GridLayer />
                <Layer>
                    {lines.map((ln) => (
                        <Line
                            key={ln.id}
                            points={ln.points}
                            stroke={ln.color}
                            strokeWidth={ln.thickness}
                            tension={0.5}
                            lineCap="round"
                            lineJoin="round"
                            globalCompositeOperation={ln.tool === 'eraser' ? 'destination-out' : 'source-over'}
                        />
                    ))}
                    {elements.map((el) => (
                        <KonvaElement
                            key={el.id}
                            element={el}
                            currentTool={currentTool}
                            editingElementId={editingElementId}
                        />
                    ))}
                    <Transformer
                        ref={(node) => {
                            if (node) {
                                const stage = node.getStage();
                                const selectedNode = stage?.findOne('#' + selectedElementId);
                                node.nodes(selectedNode ? [selectedNode] : []);
                                node.getLayer()?.batchDraw();
                            }
                        }}
                        boundBoxFunc={(oldBox, newBox) => (newBox.width < 10 || newBox.height < 10 ? oldBox : newBox)}
                        borderStroke="#3b82f6"
                        anchorStroke="#3b82f6"
                        anchorFill="#fff"
                        anchorSize={10}
                        rotateAnchorOffset={24}
                        borderStrokeWidth={2}
                    />
                </Layer>
            </Stage>
        );
    }
);

// Optional: Add a display name for easier debugging in React DevTools
CanvasStage.displayName = 'CanvasStage';