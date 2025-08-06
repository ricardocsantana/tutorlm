// src/hooks/useFileHandlers.ts

import React from 'react';
import Konva from 'konva';
import { useAppStore, type NotificationType } from '../store/useAppStore';
import { BACKEND_URL } from '../config';
import { getLineBoundingBox, dbscan } from '../utils/imageHelpers';
import { useShallow } from 'zustand/react/shallow';


type ShowNotificationFn = (message: string, type: NotificationType, duration?: number) => void;

/**
 * A custom hook to manage all file-related operations like uploads, downloads,
 * and processing canvas content.
 * @param stageRef - A ref to the Konva.Stage object.
 * @param showNotification - Function to display a notification.
 * @param clearNotification - Function to clear the current notification.
 * @param getPointerPosition - Function to get the current pointer position.
 * @returns An object containing all handler functions.
 */
export const useFileHandlers = (
    stageRef: React.RefObject<Konva.Stage>,
    showNotification: ShowNotificationFn,
    clearNotification: () => void,
    getPointerPosition: () => { x: number; y: number }
) => {
    const { actions, lines, elements } = useAppStore(
        useShallow(state => ({
            actions: state.actions,
            lines: state.lines,
            elements: state.elements,
        }))
    );

    const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (elements.some(el => el.type === 'pdf')) {
            showNotification("Only one PDF can be uploaded at a time. Please remove the existing one first.", 'error');
            if (e.target) e.target.value = '';
            return;
        }

        actions.setIsUploading(true);
        showNotification(`Processing "${file.name}"...`, 'info');

        try {
            const pos = getPointerPosition();
            const elementWidth = 200;
            const elementHeight = 100;

            actions.setPdfFile(file, null);
            actions.addElement({
                id: `pdf-placeholder-${Date.now()}`,
                type: 'pdf',
                x: pos.x - elementWidth / 2,
                y: pos.y,
                content: file.name,
                width: elementWidth,
                height: elementHeight,
                cornerRadius: 4
            });

            clearNotification();
            showNotification(`"${file.name}" is ready for questions!`, 'success');

        } catch (error) {
            console.error("Error processing PDF:", error);
            clearNotification();
            showNotification(`PDF Error: ${error instanceof Error ? error.message : String(error)}`, 'error');
            actions.setPdfFile(null, null);
        } finally {
            if (e.target) e.target.value = '';
            actions.setIsUploading(false);
            actions.setCurrentTool('move');
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        actions.setIsUploading(true);
        showNotification(`Processing "${file.name}"...`, 'info');

        try {
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                if (dataUrl) {
                    const img = new window.Image();
                    img.src = dataUrl;
                    img.onload = () => {
                        const pos = getPointerPosition();
                        const MAX_WIDTH = 400;
                        const scale = Math.min(1, MAX_WIDTH / img.width);
                        actions.addElement({
                            id: `img-${Date.now()}`,
                            type: 'image',
                            x: pos.x - (img.width * scale) / 2,
                            y: pos.y,
                            content: dataUrl,
                            width: img.width * scale,
                            height: img.height * scale,
                            cornerRadius: 8
                        });
                        clearNotification();
                        showNotification(`Image "${file.name}" is ready for the AI.`, 'success');
                    };
                    img.onerror = () => { throw new Error("Failed to load image from data URL."); };
                } else {
                    throw new Error("Could not read file as data URL.");
                }
            };
            reader.onerror = () => { throw new Error("Failed to read the selected file."); };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error("Error handling image upload:", err);
            clearNotification();
            showNotification(`Image Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
        } finally {
            if (e.target) e.target.value = '';
            actions.setIsUploading(false);
            actions.setCurrentTool('move');
        }
    };

    const handleProcessDrawing = async () => {
        if (lines.length === 0) {
            showNotification("There's nothing to process!", 'error');
            return;
        }
        const stage = stageRef.current;
        if (!stage) return;

        actions.setIsUploading(true);
        showNotification("Processing drawing(s)...", 'info');

        const gridLayer = stage.findOne('.grid-layer');
        if (gridLayer) gridLayer.visible(false);
        stage.batchDraw();

        try {
            const lineBoxes = lines.map(line => ({ ...getLineBoundingBox(line), id: line.id }));
            const clusters = dbscan(lineBoxes, 75, 1);

            if (clusters.length === 0) {
                throw new Error("No distinct drawings found to process.");
            }

            const processedLineIds = new Set<string>();

            for (const cluster of clusters) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                cluster.forEach(lineId => {
                    const box = lineBoxes.find(b => b.id === lineId);
                    if (box) {
                        minX = Math.min(minX, box.x);
                        minY = Math.min(minY, box.y);
                        maxX = Math.max(maxX, box.x + box.width);
                        maxY = Math.max(maxY, box.y + box.height);
                    }
                    processedLineIds.add(lineId);
                });

                const PADDING = 20;
                const clipRect = { x: minX - PADDING, y: minY - PADDING, width: (maxX - minX) + PADDING * 2, height: (maxY - minY) + PADDING * 2 };

                // Add paper-like background
                const layer = stage.getLayers()[1]; // Assuming content layer is at index 1
                const paperRect = new Konva.Rect({
                    x: clipRect.x,
                    y: clipRect.y,
                    width: clipRect.width,
                    height: clipRect.height,
                    fill: '#fffdfa', // slightly off-white for paper feel
                    cornerRadius: 16,
                    shadowColor: '#e0d7c6',
                    shadowBlur: 16,
                    shadowOffset: { x: 0, y: 4 },
                    shadowOpacity: 0.18,
                    listening: false,
                });
                layer.add(paperRect);
                paperRect.moveToBottom();
                layer.draw();

                const dataUrl = stage.toDataURL({ ...clipRect, pixelRatio: 2 });

                paperRect.destroy();
                layer.draw();

                actions.addElement({
                    id: `drawing-img-${Date.now()}`,
                    type: 'image',
                    content: dataUrl,
                    x: clipRect.x,
                    y: clipRect.y,
                    width: clipRect.width,
                    height: clipRect.height,
                    cornerRadius: 8
                });
            }

            actions.setLines(lines.filter(line => !processedLineIds.has(line.id)));
            clearNotification();
            showNotification(`Successfully processed and replaced ${clusters.length} drawing(s).`, 'success');

        } catch (error) {
            console.error("Error processing drawing:", error);
            clearNotification();
            showNotification(`Drawing Error: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            if (gridLayer) gridLayer.visible(true);
            stage.batchDraw();
            actions.setIsUploading(false);
        }
    };

    const handleDownload = () => {
        const stage = stageRef.current;
        let gridLayer: any = null;
        let gridLayerIndex: number | null = null;

        if (stage) {
            gridLayer = stage.findOne('.grid-layer');
            if (gridLayer) {
                gridLayerIndex = stage.getLayers().indexOf(gridLayer);
                if (gridLayer) gridLayer.visible(false);
                stage.batchDraw();
            }
        }
        if (!stage) { showNotification("Canvas is not ready.", "error"); return; }
        if (lines.length === 0 && elements.length === 0) { showNotification("The canvas is empty!", "error"); return; }
        actions.setSelectedElementId(null); // Deselect elements for a clean export
        setTimeout(() => { // Timeout to allow deselection to render
            const contentLayer = stage.getLayers()[1];
            if (!contentLayer) return;
            const box = contentLayer.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true });
            if (box.width === 0 || box.height === 0) { showNotification("Nothing to export.", "error"); return; }

            const PADDING = 20;
            const exportRect = { x: box.x - PADDING, y: box.y - PADDING, width: box.width + PADDING * 2, height: box.height + PADDING * 2 };
            const dataURL = stage.toDataURL({ ...exportRect, pixelRatio: 2, mimeType: 'image/png' });

            // Optionally, restore the grid layer after export
            if (gridLayer && gridLayerIndex !== null) {
                gridLayer.visible(true);
                gridLayer.setZIndex(gridLayerIndex);
                stage.batchDraw();
            }

            const link = document.createElement('a');
            link.download = 'tutorlm-canvas.png';
            link.href = dataURL;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, 50);
    };

    const handleClearCanvas = async () => {
        try {
            await fetch(`${BACKEND_URL}/api/clear`, { method: 'POST' });
            actions.clearCanvas();
            showNotification("Canvas cleared", "success");
        } catch (error) {
            console.error("Failed to clear backend context:", error);
            showNotification("Could not clear server context, but cleared canvas.", "error");
            actions.clearCanvas(); // Still clear the frontend
        }
    };

    return { handlePdfUpload, handleImageUpload, handleProcessDrawing, handleDownload, handleClearCanvas };
};