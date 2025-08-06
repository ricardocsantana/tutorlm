// src/hooks/useAudioRecorder.ts

import { useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { handleAudioAndGenerateCanvas } from '../api/ai';
import { useShallow } from 'zustand/react/shallow';
import { v4 as uuidv4 } from 'uuid';
import { unlockAudioContext } from '../utils/tts';

/**
 * A custom hook to manage audio recording via the MediaRecorder API.
 * It captures audio and sends it to the backend for processing.
 */
export const useAudioRecorder = () => {
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const { aiState, editingElementId, isUploading, actions } = useAppStore(useShallow(state => ({
        aiState: state.aiState,
        editingElementId: state.editingElementId,
        isUploading: state.isUploading,
        actions: state.actions,
    })));

    /**
     * Stops the recording, assembles the audio blob, and sends it to the backend.
     */
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    }, []);

    /**
     * Starts the audio recording process.
     */
    const startRecording = useCallback(async () => {
        // Unlock both Web Audio API and <audio> element on first user gesture
        unlockAudioContext();

        if (aiState !== 'idle' || editingElementId || isUploading) {
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            actions.setAiState('listening');
            audioChunksRef.current = [];
            const newSessionId = uuidv4();

            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            // When recording stops, trigger the full API flow
            recorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                // Ensure there's actual audio data to send
                if (audioBlob.size > 100) {
                    handleAudioAndGenerateCanvas(audioBlob, newSessionId);
                } else {
                    actions.setAiState('idle');
                }
                // Clean up by stopping the microphone track
                stream.getTracks().forEach(track => track.stop());
            };

            recorder.start();

        } catch (error) {
            console.error('Failed to get microphone access or start recording:', error);
            actions.setAiState('idle');
        }
    }, [aiState, editingElementId, isUploading, actions]);

    return { startRecording, stopRecording };
};
