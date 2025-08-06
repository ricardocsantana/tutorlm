// src/components/ui/SpeechButton.tsx

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';

interface SpeechButtonProps {
    onStart: () => void;
    onStop: () => void;
}

export const SpeechButton: React.FC<SpeechButtonProps> = ({ onStart, onStop }) => {
    const { aiState, isUploading } = useAppStore(
        useShallow(state => ({
            aiState: state.aiState,
            isUploading: state.isUploading,
        }))
    );

    return (
        <AnimatePresence mode="wait">
            {aiState === 'listening' ? (
                <motion.button
                    key="listening"
                    onClick={onStop}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1, backgroundColor: '#fe726c' }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    disabled={isUploading}
                    className="p-5 rounded-full text-white shadow-2xl shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Stop Recording"
                >
                    <Square size={28} fill="white" />
                </motion.button>
            ) : (
                <motion.button
                    key="idle"
                    onClick={onStart}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    disabled={isUploading || aiState !== 'idle'}
                    className="relative p-5 rounded-full bg-gradient-to-br from-[#745bff] via-[#f95bf6] to-[#ff7a41] text-white transition-transform duration-200 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-fuchsia-400/30 hover:shadow-2xl hover:shadow-fuchsia-400/50 before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-br before:from-[#745bff] before:via-[#f95bf6] before:to-[#ff7a41] before:blur-md before:opacity-60 before:animate-pulse"
                    title="Click to Talk"
                    style={{ overflow: 'visible' }}
                >
                    <span className="relative z-10 flex items-center justify-center">
                        <Mic size={28} />
                    </span>
                </motion.button>
            )}
        </AnimatePresence>
    );
};