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
    const [isFocused, setIsFocused] = useState(true);

    // Use a ref to hold the latest editingText to avoid stale closures in event listeners
    const editingTextRef = useRef(editingText);
    useEffect(() => {
        editingTextRef.current = editingText;
    }, [editingText]);

    useEffect(() => {
        const textArea = textAreaRef.current;
        if (textArea) {
            textArea.focus();
            textArea.select();
        }

        const handleFinishEditing = () => {
            actions.updateElement(element.id, { content: editingTextRef.current });
            actions.setEditingElementId(null);
        };

        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (textAreaRef.current && !textAreaRef.current.contains(event.target as Node)) {
                handleFinishEditing();
            }
        };

        // Add event listeners for clicks and touches outside the textarea
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);

        return () => {
            // Cleanup the event listeners when the component unmounts
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [element.id, actions]);

    const handleBlur = () => {
        setIsFocused(false);
        // The click outside handler will now manage saving.
        // We keep onBlur on the textarea to hide the "Done" button,
        // but the actual save logic is triggered by the document event listener.
    };

    const handleFocus = () => {
        setIsFocused(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Stop propagation to prevent parent components from handling the event
        e.stopPropagation();

        if (e.key === 'Escape') {
            actions.setEditingElementId(null);
        }
        // Allow all other keys (including Enter) to work normally for multiline input
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Ensure key events don't bubble up
        e.stopPropagation();
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        e.stopPropagation();
        setEditingText(e.target.value);
    };

    const handleDoneClick = () => {
        actions.updateElement(element.id, { content: editingText });
        actions.setEditingElementId(null);
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

    const doneButtonStyle: React.CSSProperties = {
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1001,
        width: '50px',
        height: '50px',
        background: '#3b82f6',
        color: 'white',
        border: 'none',
        borderRadius: '50%',
        cursor: 'pointer',
        display: isFocused ? 'flex' : 'none',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
    };

    return (
        <>
            <textarea
                ref={textAreaRef}
                value={editingText}
                onChange={handleChange}
                onBlur={handleBlur}
                onFocus={handleFocus}
                onKeyDown={handleKeyDown}
                onKeyPress={handleKeyPress}
                style={style}
            />
            {isFocused && (
                <button style={doneButtonStyle} onMouseDown={handleDoneClick}>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </button>
            )}
        </>
    );
};