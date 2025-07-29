// src/components/ui/AIStateIndicator.tsx

import React from 'react';
import { motion } from 'framer-motion';
import { Mic, BrainCircuit } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';

interface AIStateIndicatorProps {
    isMobile?: boolean;
}

export const AIStateIndicator: React.FC<AIStateIndicatorProps> = ({ isMobile = false }) => {
    const { aiState, transcript } = useAppStore(
        useShallow(state => ({
            aiState: state.aiState,
            transcript: state.transcript,
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
                        className="p-2 bg-red-500 rounded-full"
                    >
                        <Mic size={20} className="text-white" />
                    </motion.div>
                    <span className="text-gray-800 font-semibold text-md">Listening...</span>
                </div>
            ) : (
                <div className="flex items-center gap-3">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        className="p-2 bg-gradient-to-br from-blue-500 to-blue-400 rounded-full"
                    >
                        <BrainCircuit size={20} className="text-white" />
                    </motion.div>
                    <span className="text-gray-800 font-semibold text-md">AI Processing...</span>
                </div>
            )}
            {transcript && (
                <p className="text-md text-gray-500 max-w-xs md:max-w-md text-center pt-2 border-t border-gray-200/80 mt-2">
                    {transcript}
                </p>
            )}
        </motion.div>
    );

    if (aiState === 'idle') return null;

    return isMobile ? <div className={wrapperClasses}>{content}</div> : content;
};