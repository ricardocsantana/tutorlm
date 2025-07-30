// src/hooks/useFileHandlers.ts

import React from 'react';
import Konva from 'konva';
import { useAppStore, type NotificationType } from '../store/useAppStore';
import { BACKEND_URL } from '../config';
import { getLineBoundingBox, dbscan, dataURLtoBlob } from '../utils/imageHelpers';
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

    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        actions.setIsUploading(true);
        showNotification(`Processing "${file.name}"...`, 'info');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${BACKEND_URL}/api/upload-pdf`, { method: 'POST', body: formData });
            if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.detail || 'Failed to process PDF.'); }
            const result = await response.json();

            if (result.imageDataUrl) {
                const img = new window.Image();
                img.src = result.imageDataUrl;
                img.onload = () => {
                    const pos = getPointerPosition();
                    const MAX_WIDTH = 500;
                    const scale = Math.min(1, MAX_WIDTH / img.width);
                    actions.addElement({ id: `pdf-preview-${Date.now()}`, type: 'image', x: pos.x - (img.width * scale) / 2, y: pos.y, content: result.imageDataUrl, width: img.width * scale, height: img.height * scale, cornerRadius: 4 });
                    clearNotification();
                    showNotification(`"${result.filename}" is ready for questions!`, 'success');
                };
                img.onerror = () => { throw new Error("Failed to load PDF preview image from server data."); };
            } else {
                clearNotification();
                showNotification(`"${result.filename}" processed (no preview).`, 'success');
            }
        } catch (error) {
            console.error("Error uploading PDF:", error);
            clearNotification();
            showNotification(`PDF Error: ${error instanceof Error ? error.message : String(error)}`, 'error');
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

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${BACKEND_URL}/api/upload-image`, { method: 'POST', body: formData });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "Image processing failed on server.");
            }

            const result = await response.json();

            if (result.imageDataUrl) {
                const img = new window.Image();
                img.src = result.imageDataUrl;
                img.onload = () => {
                    const pos = getPointerPosition();
                    const MAX_WIDTH = 400;
                    const scale = Math.min(1, MAX_WIDTH / img.width);
                    actions.addElement({
                        id: `img-${Date.now()}`,
                        type: 'image',
                        x: pos.x - (img.width * scale) / 2,
                        y: pos.y,
                        content: result.imageDataUrl,
                        width: img.width * scale,
                        height: img.height * scale,
                        cornerRadius: 8
                    });
                    clearNotification();
                    showNotification(`Image "${file.name}" is ready for the AI.`, 'success');
                };
                img.onerror = () => { throw new Error("Failed to load image from server data."); };
            } else {
                throw new Error("Server did not return image data.");
            }
        } catch (err) {
            console.error("Error uploading image:", err);
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

        // Get current stage transform
        const stageX = stage.x();
        const stageY = stage.y();
        const scaleX = stage.scaleX();
        const scaleY = stage.scaleY();

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

                const absClipRect = {
                    x: (clipRect.x * scaleX) + stageX,
                    y: (clipRect.y * scaleY) + stageY,
                    width: clipRect.width * scaleX,
                    height: clipRect.height * scaleY,
                };

                // This version is for display, with a transparent background.
                const displayDataUrl = stage.toDataURL({ ...absClipRect, pixelRatio: 2 });
                const displayBlob = dataURLtoBlob(displayDataUrl);

                // Create a temporary white background for the backend version.
                const tempLayer = new Konva.Layer();
                tempLayer.add(new Konva.Rect({ ...clipRect, fill: 'white' }));
                stage.add(tempLayer);
                tempLayer.moveToBottom();
                stage.batchDraw();

                const backendDataUrl = stage.toDataURL({ ...absClipRect, pixelRatio: 2 });
                tempLayer.destroy();
                stage.batchDraw();
                const backendBlob = dataURLtoBlob(backendDataUrl);

                // Send both to the backend
                const formData = new FormData();
                formData.append('file', backendBlob, `drawing-backend-${Date.now()}.png`);
                formData.append('display_file', displayBlob, `drawing-display-${Date.now()}.png`);

                const response = await fetch(`${BACKEND_URL}/api/upload-image`, { method: 'POST', body: formData });
                if (!response.ok) throw new Error((await response.json()).detail || 'Processing drawing cluster failed.');

                const result = await response.json();
                const imageUrlForDisplay = result.displayImageDataUrl || result.imageDataUrl; // Prioritize display version

                actions.addElement({ id: `drawing-img-${Date.now()}`, type: 'image', content: imageUrlForDisplay, x: clipRect.x, y: clipRect.y, width: clipRect.width, height: clipRect.height, cornerRadius: 8 });
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