// src/components/ui/AIStateIndicator.tsx

import React from 'react';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';

interface AIStateIndicatorProps {
    isMobile?: boolean;
}

type TranscriptType = string | { refined_prompt?: string; [key: string]: any };

export const AIStateIndicator: React.FC<AIStateIndicatorProps> = ({ isMobile = false }) => {
    const { aiState, transcript } = useAppStore(
        useShallow(state => ({
            aiState: state.aiState,
            transcript: state.transcript as TranscriptType,
        }))
    );

    const containerClasses = isMobile
        ? "flex flex-col items-center gap-2 px-6 py-3 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl"
        : "flex flex-col items-center gap-2 px-8 py-4 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl";

    const wrapperClasses = isMobile
        ? "md:hidden fixed bottom-20 left-1/2 -translate-x-1/2 z-50"
        : ""; // Desktop version is wrapped by parent

    const content = (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className={containerClasses}
        >
            {aiState === 'listening' ? (
                <div className="flex items-center gap-3">
                    <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="p-2 bg-[#fe726c] rounded-full w-8 h-8 flex items-center justify-center"
                    >
                        <Mic className="text-white" />
                    </motion.div>
                    <span className="text-gray-800 font-semibold text-md">Listening...</span>
                </div>
            ) : (
                <div className="flex items-center gap-3">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        className="w-7 h-7 flex"
                    >
                        <img src="/logo.png" alt="Logo" />
                    </motion.div>
                    <span className="text-gray-800 font-semibold text-md">Thinking...</span>
                </div>
            )}
            {transcript && (
                <p className="text-md text-gray-500 max-w-xs md:max-w-md text-center pt-2 border-t border-gray-200/80 mt-2">
                    {typeof transcript === 'string' ? transcript : transcript.refined_prompt || JSON.stringify(transcript)}
                </p>
            )}
        </motion.div>
    );

    if (aiState === 'idle') return null;

    return isMobile ? <div className={wrapperClasses}>{content}</div> : content;
};