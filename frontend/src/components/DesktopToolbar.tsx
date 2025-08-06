// src/components/toolbar/DesktopToolbar.tsx

import React from 'react';
import { Move, Pen, Eraser, Type, File, Image, Download, Group, Trash2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ToolButton } from './ToolButton';
import { LanguageSelector } from './LanguageSelector';
import { useShallow } from 'zustand/react/shallow';

interface ToolbarProps {
    onProcessDrawing: () => void;
    onUploadPdfClick: () => void;
    onUploadImageClick: () => void;
    onDownload: () => void;
    onClearCanvas: () => void;
}

export const DesktopToolbar: React.FC<ToolbarProps> = ({
    onProcessDrawing, onUploadPdfClick, onUploadImageClick, onDownload, onClearCanvas
}) => {
    const { currentTool, isUploading, actions } = useAppStore(
        useShallow(state => ({
            currentTool: state.currentTool,
            isUploading: state.isUploading,
            actions: state.actions,
        }))
    );

    return (
        <div
            className="flex items-center gap-3 px-5 py-3 rounded-full"
            style={{
                background: 'rgba(255, 255, 255, 0.25)',
                boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
            }}
        >
            <ToolButton label="Navigate" icon={Move} active={currentTool === 'move'} onClick={() => actions.setCurrentTool('move')} disabled={isUploading} />
            <ToolButton label="Draw" icon={Pen} active={currentTool === 'pen'} onClick={() => actions.setCurrentTool('pen')} disabled={isUploading} />
            <ToolButton label="Erase" icon={Eraser} active={currentTool === 'eraser'} onClick={() => actions.setCurrentTool('eraser')} disabled={isUploading} />
            <ToolButton label="Text" icon={Type} active={currentTool === 'text'} onClick={() => actions.setCurrentTool('text')} disabled={isUploading} />
            <div className="w-px h-6 bg-gray-200 mx-1" />
            <ToolButton label="Process Drawing" icon={Group} onClick={onProcessDrawing} disabled={isUploading} />
            <ToolButton label="Upload PDF" icon={File} onClick={onUploadPdfClick} disabled={isUploading} />
            <ToolButton label="Upload image" icon={Image} onClick={onUploadImageClick} disabled={isUploading} />
            <ToolButton label="Download" icon={Download} onClick={onDownload} disabled={isUploading} />
            <ToolButton label="Clear Canvas" icon={Trash2} onClick={onClearCanvas} disabled={isUploading} />
            <div className="w-px h-6 bg-gray-200 mx-1" />
            <LanguageSelector />
        </div>
    );
};