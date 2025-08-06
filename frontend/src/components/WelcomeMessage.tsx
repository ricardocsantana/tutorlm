// src/components/ui/WelcomeMessage.tsx

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Move, Pen, Eraser, Type, Group, File, Image, Mic, Download, Trash2, X } from 'lucide-react';

interface WelcomeMessageProps {
    show: boolean;
    onDismiss: () => void;
}

export const WelcomeMessage: React.FC<WelcomeMessageProps> = ({ show, onDismiss }) => {
    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -20 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[90vw] max-w-lg p-4 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl"
                >
                    <button
                        onClick={onDismiss}
                        className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label="Dismiss welcome message"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-gradient-to-tr from-[#745bff] via-[#f95bf6] to-[#ff7a41] text-white rounded-lg">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="font-bold text-gray-800">Welcome to TutorLM!</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                        Your AI learning companion. Click the microphone button to talk to the AI and get visual explanations.
                    </p>

                    <div className="space-y-2 text-xs text-gray-600">
                        <div>
                            <h4 className="font-semibold text-gray-700 mb-1">Available Tools:</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                            <div className="flex items-center gap-2">
                                <Move className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                <div>
                                    <span className="font-medium">Navigate:</span>
                                    <span> Move and select elements</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Pen className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                <div>
                                    <span className="font-medium">Draw:</span>
                                    <span> Create freehand drawings</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Eraser className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                <div>
                                    <span className="font-medium">Erase:</span>
                                    <span> Remove parts of drawings</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Type className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                <div>
                                    <span className="font-medium">Text:</span>
                                    <span> Add text labels and notes</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Group className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                <div>
                                    <span className="font-medium">Process Drawing:</span>
                                    <span> Let AI analyze sketches</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <File className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                <div>
                                    <span className="font-medium">Upload PDF:</span>
                                    <span> Import documents</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Image className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                <div>
                                    <span className="font-medium">Upload Image:</span>
                                    <span> Add images for analysis</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Download className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                <div>
                                    <span className="font-medium">Download:</span>
                                    <span> Save canvas as an image</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Trash2 className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                <div>
                                    <span className="font-medium">Clear Canvas:</span>
                                    <span> Remove all content</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Mic className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                <div>
                                    <span className="font-medium">Voice Input:</span>
                                    <span> Speak your questions</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};