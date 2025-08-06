// src/hooks/useCanvasInteraction.ts

import { useState, useRef, useMemo, useCallback } from 'react';
import { type KonvaEventObject } from 'konva/lib/Node';
import throttle from 'lodash.throttle';
import { useAppStore, type LineData } from '../store/useAppStore';
import type Konva from 'konva';
import { useShallow } from 'zustand/react/shallow';

/**
 * A custom hook to manage all user interactions with the Konva Stage,
 * including drawing, panning, zooming, and element creation.
 * @returns An object with state, refs, and event handlers for the Konva Stage.
 */
export const useCanvasInteraction = () => {
    const { currentTool, penMode, penColor, penThickness, actions } = useAppStore(useShallow(state => ({
        currentTool: state.currentTool,
        penMode: state.penMode,
        penColor: state.penColor,
        penThickness: state.penThickness,
        selectedElementId: state.selectedElementId,
        actions: state.actions,
    })));

    const isDrawing = useRef(false);
    const isPanning = useRef(false);
    const lineStart = useRef<{ x: number; y: number } | null>(null);
    const lastDist = useRef(0);

    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const [stageScale, setStageScale] = useState(1);

    const getPointerPosition = useCallback((stage: Konva.Stage | null) => {
        if (!stage) {
            // Fallback if stage is not available
            return { x: window.innerWidth / 2 - stagePos.x, y: window.innerHeight / 2 - stagePos.y };
        }
        const pointer = stage.getPointerPosition() || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        return {
            x: (pointer.x - stage.x()) / stage.scaleX(),
            y: (pointer.y - stage.y()) / stage.scaleY(),
        };
    }, [stagePos]);

    const handleMouseDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = getPointerPosition(stage);

        const clickedOnEmpty = e.target === stage;
        if (clickedOnEmpty) {
            actions.setSelectedElementId(null);
            actions.setEditingElementId(null);
        }

        if (currentTool === 'text' && clickedOnEmpty) {
            const newId = `text-${Date.now()}`;
            actions.addElement({ id: newId, type: 'text', x: pos.x, y: pos.y, content: 'Type here...', fontSize: 24, fill: '#1f2937' });
            actions.setEditingElementId(newId);
            actions.setCurrentTool('move');
            return;
        }

        if (currentTool === 'pen' && penMode === 'line' && clickedOnEmpty) {
            lineStart.current = pos;
            isDrawing.current = true;
            return;
        }

        if ((currentTool === 'pen' || currentTool === 'eraser') && clickedOnEmpty) {
            isDrawing.current = true;
            actions.startDrawing(pos);
            return;
        }

        if (currentTool === 'move' && clickedOnEmpty) {
            isPanning.current = true;
        }
    };

    const handleMouseMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
        if (!isDrawing.current) return;
        const stage = e.target.getStage();
        if (!stage) return;

        if (currentTool === 'pen' || currentTool === 'eraser') {
            const pos = getPointerPosition(stage);
            actions.draw(pos);
        }
    };

    const handleTouch = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
        const stage = e.target.getStage();
        if (!stage || !('touches' in e.evt)) return;

        const touch1 = e.evt.touches[0];
        const touch2 = e.evt.touches[1];

        if (touch1 && touch2) {
            // If two fingers are touching the screen
            if (stage.isDragging()) {
                stage.stopDrag();
            }
            stage.draggable(false); // Disable dragging during zoom
            e.evt.preventDefault();

            const p1 = { x: touch1.clientX, y: touch1.clientY };
            const p2 = { x: touch2.clientX, y: touch2.clientY };

            const newDist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

            if (lastDist.current === 0) {
                lastDist.current = newDist;
                return;
            }

            const oldScale = stage.scaleX();
            const newScale = oldScale * (newDist / lastDist.current);
            const clampedScale = Math.max(0.1, Math.min(5, newScale));

            const center = {
                x: (p1.x + p2.x) / 2,
                y: (p1.y + p2.y) / 2,
            };

            const mousePointTo = {
                x: (center.x - stage.x()) / oldScale,
                y: (center.y - stage.y()) / oldScale,
            };

            setStageScale(clampedScale);
            setStagePos({
                x: center.x - mousePointTo.x * clampedScale,
                y: center.y - mousePointTo.y * clampedScale,
            });

            lastDist.current = newDist;
        } else if (isDrawing.current) {
            // Fallback to drawing if only one finger is moving
            handleMouseMove(e);
        }
    };

    // Throttle mouse move for performance
    const handleThrottledMouseMove = useMemo(() => throttle(handleMouseMove, 16), [actions, currentTool]);
    const handleThrottledTouchMove = useMemo(() => throttle(handleTouch, 16), [actions, currentTool]);

    const handleMouseUp = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
        const stage = e.target.getStage();
        if (!stage) return;
        const end = getPointerPosition(stage);

        if (currentTool === 'pen' && penMode === 'line' && lineStart.current) {
            // 1. Get the current array of lines from the store
            const currentLines = useAppStore.getState().lines;

            // 2. Create the new line object with the correct type
            const newLine: LineData = {
                id: `line-${Date.now()}`,
                tool: 'pen',
                points: [lineStart.current.x, lineStart.current.y, end.x, end.y],
                color: penColor,
                thickness: penThickness,
            };

            // 3. Update the store with a new array containing all old lines plus the new one
            actions.setLines([...currentLines, newLine]);

            lineStart.current = null;
        }

        if (currentTool === 'move') {
            stage.draggable(true); // Re-enable dragging when touch ends
        }

        isDrawing.current = false;
        isPanning.current = false;
        lastDist.current = 0;
    };

    const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const stage = e.target.getStage();
        if (!stage) return;

        const scaleBy = 1.05;
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition() || { x: 0, y: 0 };
        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };

        const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
        const clampedScale = Math.max(0.1, Math.min(5, newScale));

        setStageScale(clampedScale);
        setStagePos({
            x: pointer.x - mousePointTo.x * clampedScale,
            y: pointer.y - mousePointTo.y * clampedScale,
        });
    };

    const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
        if (isPanning.current) {
            setStagePos(e.target.position());
        }
    };

    const cursorStyle = useMemo(() => {
        if (currentTool === 'move') return isPanning.current ? 'grabbing' : 'grab';
        if (currentTool === 'text') return 'text';
        return 'crosshair';
    }, [currentTool, isPanning.current]);

    // A simplified getPointerPosition to be passed to other hooks that don't have stage access
    const getPointerPositionForExternals = useCallback(() => {
        // This is a rough estimation and may not be perfectly accurate
        // A better approach would be to pass the stageRef around, but this avoids prop drilling
        return { x: window.innerWidth / 2 - stagePos.x, y: window.innerHeight / 2 - stagePos.y };
    }, [stagePos]);


    return {
        stagePos,
        stageScale,
        cursorStyle,
        getPointerPosition,
        getPointerPositionForExternals,
        eventHandlers: {
            onMouseDown: handleMouseDown,
            onMouseMove: handleThrottledMouseMove,
            onMouseUp: handleMouseUp,
            onTouchStart: handleMouseDown,
            onTouchMove: handleThrottledTouchMove,
            onTouchEnd: handleMouseUp,
            onWheel: handleWheel,
            onDragEnd: handleDragEnd,
        }
    };
};