// src/api/ai.ts

import { useAppStore, type LineData } from '../store/useAppStore'
import renderMarkdownToImage from '../utils/renderToImage'
import { speakText } from '../utils/tts'
// Import the backend URL from the config
import { BACKEND_URL } from '../config'

/**
 * Processes a single element object received from the backend and adds it to the canvas.
 * This contains the detailed rendering logic for each element type.
 * @param element The element object from the backend.
 */
const processElement = async (element: any) => {
    console.log('processElement called with:', element);

    if (!element.type) {
        console.error("Invalid element received (missing type):", element);
        return;
    }

    // Generate a unique ID for the new element
    const id = `${element.type}-${Date.now()}-${Math.random()}`;

    console.log(`Processing ${element.type} element with ID: ${id}`);

    // STEP 1: Render the element to the canvas immediately.
    // This switch statement handles the visual part.
    switch (element.type) {
        case 'card': {
            console.log('Processing card element:', element);
            if (typeof element.x === 'undefined' || typeof element.y === 'undefined') {
                console.error("Invalid card element (missing x/y):", element);
                return;
            }
            try {
                const { dataURL, height } = await renderMarkdownToImage(element.content || '', element.width || 500, {
                    backgroundColor: element.backgroundColor || '#ffffff',
                    textColor: element.textColor || '#1f2937',
                    padding: '16px',
                    borderRadius: '12px',
                    fontSize: element.fontSize ? `${element.fontSize}px` : '18px',
                });
                const { actions } = useAppStore.getState();
                actions.addElement({
                    id, type: 'image', x: element.x, y: element.y,
                    content: dataURL, width: element.width || 500, height: height, cornerRadius: 12,
                });
                console.log('Card element successfully added to canvas');
            } catch (renderError) {
                console.error("Error rendering card element:", renderError);
            }
            break;
        }
        case 'text': {
            console.log('Processing text element:', element);
            if (typeof element.x === 'undefined' || typeof element.y === 'undefined') {
                console.error("Invalid text element (missing x/y):", element);
                return;
            }
            try {
                const { dataURL, height } = await renderMarkdownToImage(element.content || '', element.width || 550, {
                    fontSize: element.fontSize ? `${element.fontSize}px` : '18px',
                    backgroundColor: 'transparent',
                    textColor: element.textColor || '#1f2937',
                });
                const { actions } = useAppStore.getState();
                actions.addElement({
                    id, type: 'image', x: element.x, y: element.y,
                    content: dataURL, width: element.width || 550, height: height,
                });
                console.log('Text element successfully added to canvas');
            } catch (renderError) {
                console.error("Error rendering text element:", renderError);
            }
            break;
        }
        case 'line': {
            console.log('Processing line element:', element);
            const thicknessMap: { [key: string]: number } = { 's': 2, 'm': 4, 'l': 8 };
            if (typeof element.x1 === 'undefined' || typeof element.y1 === 'undefined' || typeof element.x2 === 'undefined' || typeof element.y2 === 'undefined') {
                console.error("Invalid line element (missing coordinates):", element);
                return;
            }
            const newLine: LineData = {
                id, tool: 'pen',
                points: [element.x1, element.y1, element.x2, element.y2],
                color: element.color || '#3b82f6',
                thickness: thicknessMap[element.thickness] || 4
            };
            const lines = useAppStore.getState().lines;
            const { setLines } = useAppStore.getState().actions;
            setLines([...lines, newLine]);
            console.log('Line element successfully added to canvas');
            break;
        }
        case 'image': {
            console.log('Processing image element:', element);
            if (typeof element.x === 'undefined' || typeof element.y === 'undefined' || !element.imageUrl || !element.width || !element.height) {
                console.error("Invalid image element (missing x/y, imageUrl, or dimensions):", element);
                return;
            }
            const { actions } = useAppStore.getState();

            // The backend now sends the final, calculated display dimensions.
            // We can use them directly.
            actions.addElement({
                id, type: 'image', content: element.imageUrl, x: element.x, y: element.y,
                width: element.width, height: element.height, cornerRadius: 8,
            });
            console.log('Image element successfully added to canvas');
            break;
        }
        default:
            console.warn("Unknown element type received:", element.type);
    }

    // STEP 2: Speak the narration *after* rendering.
    // The 'await' here ensures the next element in the queue won't be processed
    // until this audio finishes, creating the desired sequential flow.
    const audioDataUrl = element.audioDataUrl || '';
    if (audioDataUrl && typeof audioDataUrl === 'string') {
        await speakText(audioDataUrl).catch(console.error);
    }

    console.log(`Finished processing ${element.type} element`);
};

// Queue system for sequential element processing
let elementQueue: any[] = [];
let isProcessingQueue = false;

const processElementQueue = async () => {
    if (isProcessingQueue || elementQueue.length === 0) return;

    isProcessingQueue = true;

    const element = elementQueue.shift();
    if (element) {
        await processElement(element).catch(console.error);
    }

    isProcessingQueue = false;

    // Schedule the next check instead of using a while loop.
    // This prevents blocking the event loop and allows TTS to start promptly.
    if (elementQueue.length > 0) {
        setTimeout(processElementQueue, 0);
    }
};

/**
 * Handles the entire audio-to-canvas flow without a user confirmation step.
 * 1. Sends audio to get a refined prompt.
 * 2. Informs the UI of the refined prompt.
 * 3. Immediately sends that prompt to get canvas elements via streaming.
 * @param audioBlob The audio data recorded from the user.
 * @param sessionId A unique identifier for the current session.
 */
export const handleAudioAndGenerateCanvas = async (audioBlob: Blob, sessionId: string) => {
    const { setAiState, setTranscript } = useAppStore.getState().actions
    const { pdfFile, elements } = useAppStore.getState();

    // --- STEP 1: Get refined prompt from audio ---
    setAiState('processing')
    const formData = new FormData()
    formData.append('audio_file', audioBlob, 'speech.webm')
    formData.append('session_id', sessionId)

    // Append PDF file if it exists
    if (pdfFile) {
        formData.append('pdf_file', pdfFile);
    }

    // Append image elements from the canvas
    const imageElements = elements.filter(el => el.type === 'image' && el.content);
    imageElements.forEach((el, index) => {
        // We assume el.content is a data URL. We need to convert it to a Blob.
        const blob = dataURLtoBlob(el.content!);
        formData.append(`image_file_${index}`, blob, `canvas-image-${index}.png`);
    });


    let promptPayload
    try {
        const response = await fetch(`${BACKEND_URL}/api/speech-to-prompt`, {
            method: 'POST',
            body: formData,
        })
        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Failed to get refined prompt.')
        }
        promptPayload = await response.json()
        setTranscript(promptPayload)
    } catch (error) {
        console.error('speech-to-prompt error:', error)
        setAiState('idle')
        setTranscript('')
        return
    }

    // --- STEP 2: Stream canvas elements via SSE ---
    setAiState('streaming')
    const query = new URLSearchParams({
        refined_prompt: promptPayload.refined_prompt,
        session_id: promptPayload.session_id,
        context_summary: promptPayload.context_summary,
    }).toString()

    const source = new EventSource(`${BACKEND_URL}/api/reply?${query}`)
    source.onmessage = (e) => {
        if (e.data === '[DONE]') {
            source.close()
            setAiState('idle')
            return
        }
        let element: any
        try {
            element = JSON.parse(e.data)
        } catch {
            console.error('SSE parse error', e.data)
            return
        }

        // Add element to queue for sequential processing
        elementQueue.push(element);
        // Start processing the queue if it's not already running.
        // This is non-blocking and allows the SSE handler to continue receiving messages.
        processElementQueue();
    }
    source.onerror = (err) => {
        console.error('SSE connection error:', err)
        source.close()
        setAiState('idle')
    }
}

function dataURLtoBlob(dataurl: string) {
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
}

