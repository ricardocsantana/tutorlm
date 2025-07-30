// src/components/ui/WelcomeMessage.tsx

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface WelcomeMessageProps {
    show: boolean;
}

export const WelcomeMessage: React.FC<WelcomeMessageProps> = ({ show }) => {
    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -20 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className="fixed top-20 md:top-32 left-1/2 -translate-x-1/2 z-40 w-[90vw] max-w-md p-4 md:p-6 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl"
                >
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-gradient-to-tr from-[#745bff] via-[#f95bf6] to-[#ff7a41] text-white rounded-lg">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="font-bold text-gray-800">Welcome to TutorLM!</h3>
                    </div>
                    <p className="text-sm text-gray-600">
                        Your AI learning companion. Upload files, draw, and talk to the AI by holding the <strong>Spacebar</strong> or clicking the mic button.
                    </p>
                </motion.div>
            )}
        </AnimatePresence>
    );
};