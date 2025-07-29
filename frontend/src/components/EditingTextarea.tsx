// src/components/canvas/EditingTextarea.tsx

import React, { useState, useRef, useEffect } from 'react';
import { useAppStore, type CanvasElement as Element } from '../store/useAppStore';

interface EditingTextareaProps {
    element: Element;
    stagePos: { x: number; y: number };
    stageScale: number;
}

export const EditingTextarea: React.FC<EditingTextareaProps> = ({ element, stagePos, stageScale }) => {
    if (element.type !== 'text') return null;
    
    const actions = useAppStore(state => state.actions);
    const [editingText, setEditingText] = useState(element.content || '');
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const textArea = textAreaRef.current;
        if (textArea) {
            textArea.focus();
            textArea.select();
        }
    }, []);

    const handleBlur = () => {
        actions.updateElement(element.id, { content: editingText });
        actions.setEditingElementId(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleBlur();
        } else if (e.key === 'Escape') {
            actions.setEditingElementId(null);
        }
    };
    
    // Calculate style based on Konva element properties
    const style: React.CSSProperties = {
        position: 'absolute',
        top: element.y * stageScale + stagePos.y,
        left: element.x * stageScale + stagePos.x,
        width: 'auto',
        minWidth: (element.fontSize || 24) * 2,
        height: 'auto',
        fontSize: (element.fontSize || 24) * (element.scaleY || 1) * stageScale,
        lineHeight: 1.4,
        fontFamily: 'Inter, system-ui, sans-serif',
        border: '2px solid #3b82f6',
        borderRadius: '4px',
        background: 'white',
        outline: 'none',
        padding: '4px',
        color: element.fill,
        resize: 'none',
        transformOrigin: 'top left',
        transform: `rotate(${element.rotation || 0}deg) scale(${element.scaleX || 1})`,
        zIndex: 1000,
    };

    return (
        <textarea
            ref={textAreaRef}
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={style}
        />
    );
};