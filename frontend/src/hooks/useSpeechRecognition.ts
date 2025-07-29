// src/hooks/useSpeechRecognition.ts

import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { handleAIChatRequest } from '../api/ai';
import { useShallow } from 'zustand/react/shallow';

/**
 * A custom hook to manage the Web Speech Recognition API.
 * @param getPointerPosition - A function to get the current pointer's position on the canvas.
 * @returns An object with `startListening` and `stopListening` functions.
 */
export const useSpeechRecognition = (getPointerPosition: () => { x: number; y: number }) => {
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const { aiState, editingElementId, isUploading, recognitionLang, actions } = useAppStore(useShallow(state => ({
        aiState: state.aiState,
        editingElementId: state.editingElementId,
        isUploading: state.isUploading,
        recognitionLang: state.recognitionLang,
        transcript: state.transcript,
        actions: state.actions,
    })));

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("Speech Recognition API not supported in this browser.");
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
            const fullTranscript = Array.from(event.results)
                .map(result => (result as any)[0].transcript)
                .join('');
            actions.setTranscript(fullTranscript);
        };
        recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            actions.setAiState('idle');
        };
        recognition.onend = () => {
            // Only set to idle if it was previously in a listening state
            if (useAppStore.getState().aiState === 'listening') {
                actions.setAiState('idle');
            }
        };
        recognitionRef.current = recognition;
    }, [actions]);

    const startListening = useCallback(() => {
        if (aiState === 'idle' && !editingElementId && !isUploading) {
            actions.setTranscript('');
            if (recognitionRef.current) {
                recognitionRef.current.lang = recognitionLang; // Set language before starting
                recognitionRef.current.start();
                actions.setAiState('listening');
            }
        }
    }, [aiState, editingElementId, isUploading, recognitionLang, actions]);

    const stopListening = useCallback(() => {
        if (aiState === 'listening') {
            recognitionRef.current?.stop();
            const finalTranscript = useAppStore.getState().transcript.trim();
            if (finalTranscript) {
                // The AI request handler is now self-contained
                handleAIChatRequest(finalTranscript, getPointerPosition);
            } else {
                actions.setAiState('idle');
            }
        }
    }, [aiState, actions, getPointerPosition]);

    return { startListening, stopListening };
};