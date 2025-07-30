// src/api/ai.ts

import { BACKEND_URL } from '../config';
import { useAppStore, type LineData } from '../store/useAppStore';
import renderMarkdownToImage from '../utils/renderToImage';
import { speakText } from '../utils/tts';

/**
 * Handles the streaming chat request to the AI backend.
 * Parses JSON objects from the stream and adds corresponding elements to the canvas.
 * @param prompt The user's text prompt for the AI.
 * @param getPointerPosition A function to get the current pointer's position on the canvas.
 */
export const handleAIChatRequest = async (prompt: string, getPointerPosition: () => { x: number; y: number }) => {
    const { actions } = useAppStore.getState();
    actions.setAiState('thinking');

    const processElement = async (element: any) => {
        if (!element.type) {
            console.error("Invalid element received from stream (missing type):", element);
            return;
        }
        const id = `${element.type}-${Date.now()}-${Math.random()}`;

        switch (element.type) {
            case 'card': {
                if (typeof element.x === 'undefined' || typeof element.y === 'undefined') {
                    console.error("Invalid card element (missing x/y):", element);
                    return;
                }
                const content = element.content || '';
                const width = element.width || 500;
                try {
                    // Speak only if speakAloud is present
                    if (element.speakAloud && typeof element.speakAloud === 'string') {
                        speakText(element.speakAloud).catch(console.error);
                    }
                    const { dataURL, height } = await renderMarkdownToImage(content, width, {
                        backgroundColor: element.backgroundColor || '#ffffff',
                        textColor: element.textColor || '#1f2937',
                        padding: '16px',
                        borderRadius: '12px',
                        fontSize: element.fontSize ? `${element.fontSize}px` : '18px',
                    });
                    actions.addElement({
                        id, type: 'image', x: element.x, y: element.y,
                        content: dataURL, width: width, height: height, cornerRadius: 12,
                    });
                } catch (renderError) {
                    console.error("Error rendering card element:", renderError);
                    actions.addElement({ id, type: 'text', x: element.x, y: element.y, content: 'Error rendering card.', fill: 'red' });
                }
                break;
            }
            case 'text': {
                if (typeof element.x === 'undefined' || typeof element.y === 'undefined') {
                    console.error("Invalid text element (missing x/y):", element);
                    return;
                }
                const content = element.content || '';
                const width = element.width || 550;
                try {
                    // Speak only if speakAloud is present
                    if (element.speakAloud && typeof element.speakAloud === 'string') {
                        speakText(element.speakAloud).catch(console.error);
                    }
                    const { dataURL, height } = await renderMarkdownToImage(content, width, {
                        fontSize: '18px',
                        backgroundColor: 'transparent'
                    });
                    actions.addElement({
                        id, type: 'image', x: element.x, y: element.y,
                        content: dataURL, width: width, height: height,
                    });
                } catch (renderError) {
                    console.error("Error rendering text element:", renderError);
                    actions.addElement({ id, type: 'text', x: element.x, y: element.y, content: 'Error rendering content.', fill: 'red' });
                }
                break;
            }
            case 'line': {
                const thicknessMap: { [key: string]: number } = { 's': 2, 'm': 4, 'l': 8 };
                if (typeof element.x1 === 'undefined' || typeof element.y1 === 'undefined' || typeof element.x2 === 'undefined' || typeof element.y2 === 'undefined') {
                    console.error("Invalid line element (missing x1/y1/x2/y2):", element);
                    return;
                }
                const newLine: LineData = {
                    id, tool: 'pen',
                    points: [element.x1, element.y1, element.x2, element.y2],
                    color: element.color || '#3b82f6',
                    thickness: thicknessMap[element.thickness] || 4
                };
                const currentLines = useAppStore.getState().lines;
                actions.setLines([...currentLines, newLine]);
                break;
            }
            case 'image': {
                if (typeof element.x === 'undefined' || typeof element.y === 'undefined') {
                    console.error("Invalid image element (missing x/y):", element);
                    return;
                }
                const placeholderId = `placeholder-${id}`;
                actions.addElement({
                    id: placeholderId, type: 'text', x: element.x, y: element.y,
                    content: `AI is searching for "${element.search}"...`, fontSize: 16, fill: '#6b7280'
                });
                try {
                    const searchResponse = await fetch(`${BACKEND_URL}/api/image-search?q=${encodeURIComponent(element.search)}`);
                    if (!searchResponse.ok) throw new Error(`Image search failed for "${element.search}"`);
                    const { imageUrl, width: originalWidth, height: originalHeight } = await searchResponse.json();
                    const targetHeight = element.height || 250;
                    const aspectRatio = originalHeight > 0 ? originalWidth / originalHeight : 1;
                    const newWidth = targetHeight * aspectRatio;
                    actions.deleteElement(placeholderId);
                    actions.addElement({
                        id, type: 'image', content: imageUrl, x: element.x, y: element.y,
                        width: newWidth, height: targetHeight, cornerRadius: 8,
                    });
                } catch (searchError) {
                    console.error("Error fetching image:", searchError);
                    actions.updateElement(placeholderId, { content: `Error: Could not load image.` });
                }
                break;
            }
            default:
                console.warn("Unknown element type received from stream:", element.type);
        }
    };

    try {
        const response = await fetch(`${BACKEND_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        if (!response.ok || !response.body) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let braceDepth = 0;
        let objectStartIndex = -1;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            while (true) {
                if (objectStartIndex === -1) {
                    objectStartIndex = buffer.indexOf('{');
                    if (objectStartIndex === -1) break;
                }
                let objectEndIndex = -1;
                braceDepth = 0;
                for (let i = objectStartIndex; i < buffer.length; i++) {
                    if (buffer[i] === '{') braceDepth++;
                    else if (buffer[i] === '}') braceDepth--;
                    if (braceDepth === 0) {
                        objectEndIndex = i;
                        break;
                    }
                }
                if (objectEndIndex !== -1) {
                    const objectStr = buffer.substring(objectStartIndex, objectEndIndex + 1);
                    try {
                        const element = JSON.parse(objectStr);
                        await processElement(element);
                    } catch (e) {
                        console.error("Failed to parse JSON object from stream:", objectStr, e);
                    }
                    buffer = buffer.substring(objectEndIndex + 1);
                    objectStartIndex = -1;
                } else {
                    break;
                }
            }
        }
    } catch (error) {
        console.error("Error handling AI chat request:", error);
        const pos = getPointerPosition();
        actions.addElement({
            id: `err-${Date.now()}`, type: 'text', content: `An AI communication error occurred.`,
            x: pos.x, y: pos.y, fontSize: 18, fill: '#ef4444',
        });
    } finally {
        actions.setAiState('idle');
        actions.setTranscript('');
    }
};