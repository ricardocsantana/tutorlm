// src/hooks/useSpeechRecognition.ts

import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { handleAIChatRequest } from '../api/ai';
import { useShallow } from 'zustand/react/shallow';
import { createModel, Model, type KaldiRecognizer } from 'vosk-browser';

/**
 * A custom hook to manage Vosk speech recognition.
 * @param getPointerPosition - A function to get the current pointer's position on the canvas.
 * @returns An object with `startListening` and `stopListening` functions.
 */
export const useSpeechRecognition = (getPointerPosition: () => { x: number; y: number }) => {
    const modelRef = useRef<Model | null>(null);
    const recognizerRef = useRef<KaldiRecognizer | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);

    const { aiState, editingElementId, isUploading, recognitionLang, actions } = useAppStore(useShallow(state => ({
        aiState: state.aiState,
        editingElementId: state.editingElementId,
        isUploading: state.isUploading,
        recognitionLang: state.recognitionLang,
        transcript: state.transcript,
        actions: state.actions,
    })));

    const VOSK_MODEL_PATHS: Record<string, string> = {
        'en-US': '/models/vosk-model-small-en-us-0.15.tar.gz',
        'es-ES': '/models/vosk-model-small-es-0.3.tar.gz',
        'pt-PT': '/models/vosk-model-small-pt-0.3.tar.gz',
    };

    // Load Vosk model once
    useEffect(() => {
        let isMounted = true;
        const loadModel = async () => {
            if (!modelRef.current) {
                const lang = recognitionLang || 'en-US';
                const modelPath = VOSK_MODEL_PATHS[lang];
                const model = await createModel(modelPath);
                if (isMounted) {
                    modelRef.current = model;
                }
            }
        };
        loadModel();
        return () => { isMounted = false; };
    }, [recognitionLang]);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            modelRef.current?.terminate();
            processorRef.current?.disconnect();
            sourceRef.current?.disconnect();
            audioContextRef.current?.close();
            mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        };
    }, []);

    const startListening = useCallback(async () => {
        if (aiState === 'idle' && !editingElementId && !isUploading && modelRef.current) {
            actions.setTranscript('');
            actions.setAiState('listening');

            // Get user mic
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
            sourceRef.current = source;
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            // Create recognizer
            const recognizer = new modelRef.current.KaldiRecognizer(audioContext.sampleRate);
            recognizer.setWords(true);
            recognizerRef.current = recognizer;

            recognizer.on('result', (msg: any) => {
                actions.setTranscript(msg.result.text);
            });
            recognizer.on('partialresult', (msg: any) => {
                actions.setTranscript(msg.result.partial);
            });

            processor.onaudioprocess = (event) => {
                // 👇 Get the most current state directly from the store
                if (useAppStore.getState().aiState !== 'listening') return;

                // Ensure the recognizer exists before using it
                if (recognizerRef.current) {
                    recognizerRef.current.acceptWaveform(event.inputBuffer);
                }
            };

            source.connect(processor);
            processor.connect(audioContext.destination);
        }
    }, [aiState, editingElementId, isUploading, actions]);

    const stopListening = useCallback(() => {
        if (aiState === 'listening') {
            processorRef.current?.disconnect();
            sourceRef.current?.disconnect();
            audioContextRef.current?.close();
            mediaStreamRef.current?.getTracks().forEach(track => track.stop());

            const finalTranscript = useAppStore.getState().transcript.trim();
            if (finalTranscript) {
                handleAIChatRequest(finalTranscript, getPointerPosition);
            } else {
                actions.setAiState('idle');
            }
        }
    }, [aiState, actions, getPointerPosition]);

    return { startListening, stopListening };
};