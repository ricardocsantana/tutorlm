// src/components/toolbar/MobileToolbar.tsx

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Move, Pen, Eraser, Type, File, Image, Download, Group, GripVertical, Trash2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ToolButton } from './ToolButton.tsx';
import { LanguageSelector } from './LanguageSelector.tsx';
import { DifficultySelector } from './DifficultySelector';
import { useShallow } from 'zustand/react/shallow';

interface MobileToolbarProps {
    isOpen: boolean;
    setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
    onProcessDrawing: () => void;
    onUploadPdfClick: () => void;
    onUploadImageClick: () => void;
    onDownload: () => void;
    onClearCanvas: () => void;
}

export const MobileToolbar: React.FC<MobileToolbarProps> = ({
    isOpen, setIsOpen, onProcessDrawing, onUploadPdfClick, onUploadImageClick, onDownload, onClearCanvas
}) => {
    const { currentTool, isUploading, actions } = useAppStore(
        useShallow(state => ({
            currentTool: state.currentTool,
            isUploading: state.isUploading,
            actions: state.actions,
        }))
    );

    const handleToolClick = (tool: 'move' | 'pen' | 'eraser' | 'text') => {
        actions.setCurrentTool(tool);
        setIsOpen(false);
    };

    const handleActionClick = (action: () => void) => {
        action();
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="toolbar-mobile-expanded"
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.9 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        className="absolute bottom-full mb-3 grid grid-cols-4 gap-2 bg-white/95 backdrop-blur-xl p-3 rounded-2xl shadow-2xl w-64"
                    >
                        <ToolButton label="Navigate" icon={Move} active={currentTool === 'move'} onClick={() => handleToolClick('move')} disabled={isUploading} />
                        <ToolButton label="Draw" icon={Pen} active={currentTool === 'pen'} onClick={() => handleToolClick('pen')} disabled={isUploading} />
                        <ToolButton label="Erase" icon={Eraser} active={currentTool === 'eraser'} onClick={() => handleToolClick('eraser')} disabled={isUploading} />
                        <ToolButton label="Text" icon={Type} active={currentTool === 'text'} onClick={() => handleToolClick('text')} disabled={isUploading} />
                        <ToolButton label="Process" icon={Group} onClick={() => handleActionClick(onProcessDrawing)} disabled={isUploading} />
                        <ToolButton label="PDF" icon={File} onClick={() => handleActionClick(onUploadPdfClick)} disabled={isUploading} />
                        <ToolButton label="Image" icon={Image} onClick={() => handleActionClick(onUploadImageClick)} disabled={isUploading} />
                        <ToolButton label="Download" icon={Download} onClick={() => handleActionClick(onDownload)} disabled={isUploading} />
                        <ToolButton label="Clear" icon={Trash2} onClick={() => handleActionClick(onClearCanvas)} disabled={isUploading} />

                        <div className="col-span-4 -m-1 mt-1">
                            <LanguageSelector isMobile />
                            <DifficultySelector isMobile />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <motion.button
                key="toolbar-mobile-toggle"
                onClick={() => setIsOpen(!isOpen)}
                whileTap={{ scale: 0.9 }}
                className="p-4 rounded-full bg-white/95 backdrop-blur-xl shadow-2xl"
            >
                <GripVertical size={28} className="text-gray-700" />
            </motion.button>
        </div>
    );
};