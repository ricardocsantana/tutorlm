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
                    animate={{ opacity: 1, scale: 1, backgroundColor: '#ef4444' }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    disabled={isUploading}
                    className="p-5 rounded-full text-white shadow-2xl shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Stop Recording (Spacebar)"
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
                    className="p-5 rounded-full bg-gradient-to-br from-blue-500 to-blue-400 text-white shadow-2xl shadow-blue-500/30 transition-transform duration-200 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Click or Hold Spacebar to Talk"
                >
                    <Mic size={28} />
                </motion.button>
            )}
        </AnimatePresence>
    );
};