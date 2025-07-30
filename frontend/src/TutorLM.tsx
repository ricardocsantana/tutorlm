// src/TutorLM.tsx

import React, { useState, useRef, useEffect, useMemo } from 'react';
import type Konva from 'konva';
import { AnimatePresence, motion } from 'framer-motion';

// Global State & Types
import { useAppStore, type NotificationType, type CanvasElement as Element } from './store/useAppStore';


// Custom Hooks
import { useCanvasInteraction } from './hooks/useCanvasInteraction';
import { useFileHandlers } from './hooks/useFileHandlers';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';

// UI Components
import { Notification } from './components/Notification';
import { WelcomeMessage } from './components/WelcomeMessage';
import { DesktopToolbar } from './components/DesktopToolbar';
import { MobileToolbar } from './components/MobileToolbar';
import { AIStateIndicator } from './components/AIStateIndicator';
import { SpeechButton } from './components/SpeechButton';
import { CanvasStage } from './components/CanvasStage';
import { EditingTextarea } from './components/EditingTextarea';
import { ToolOptionsPanel } from './components/ToolOptionsPanel'; // Assuming this is an existing component
import { MobileToolOptions, MobileOptionsToggle } from './components/MobileOptions'; // Assuming this is an existing component
import { useShallow } from 'zustand/react/shallow';

const TutorLM: React.FC = () => {
    // Refs
    const stageRef = useRef<Konva.Stage>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const pdfInputRef = useRef<HTMLInputElement>(null);

    // Zustand State
    const { selectedElementId, editingElementId, elements, aiState, actions } = useAppStore(useShallow(
        state => ({
            selectedElementId: state.selectedElementId,
            editingElementId: state.editingElementId,
            elements: state.elements,
            aiState: state.aiState,
            actions: state.actions,
        })),
    );

    // Local UI State
    const [notification, setNotification] = useState<{ id: number; message: string; type: NotificationType } | null>(null);
    const [showWelcome, setShowWelcome] = useState(true);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isToolOptionsOpen, setIsToolOptionsOpen] = useState(false);

    // Memoized derived state
    const editingElement = useMemo(() => elements.find((el: Element) => el.id === editingElementId), [elements, editingElementId]);

    // Custom Hooks Initialization
    const { stagePos, stageScale, cursorStyle, eventHandlers, getPointerPositionForExternals } = useCanvasInteraction();
    const { startListening, stopListening } = useSpeechRecognition(getPointerPositionForExternals);
    const showNotification = (message: string, type: NotificationType, duration = 4000) => {
        const newId = Date.now();
        setNotification({ id: newId, message, type });
        if (type !== 'info') setTimeout(() => setNotification(current => (current?.id === newId ? null : current)), duration);
    };
    const { handlePdfUpload, handleImageUpload, handleProcessDrawing, handleDownload, handleClearCanvas } = useFileHandlers(
        stageRef as React.RefObject<Konva.Stage>, showNotification, () => setNotification(null), getPointerPositionForExternals
    );

    // Effects for managing global state and events
    useEffect(() => {
        const timer = setTimeout(() => setShowWelcome(false), 8000);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Backspace' && selectedElementId && !editingElementId) {
                const target = e.target as HTMLElement;
                if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    actions.deleteElement(selectedElementId);
                }
                return;
            }
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                startListening();
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                stopListening();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [selectedElementId, editingElementId, actions, startListening, stopListening]);

    return (
        <div className="h-screen w-screen bg-gray-50 overflow-hidden relative font-sans touch-none" style={{ cursor: cursorStyle }}>
            <Notification notification={notification} />
            <div className="absolute top-7 left-7 z-50 select-none text-5xl" style={{ fontFamily: "'Satisfy', cursive" }}>TutorLM</div>
            <WelcomeMessage show={showWelcome} />

            {/* Hidden File Inputs */}
            <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" style={{ display: 'none' }} />
            <input type="file" ref={pdfInputRef} onChange={handlePdfUpload} accept="application/pdf" style={{ display: 'none' }} />

            {/* Desktop UI */}
            <div className="fixed top-7 left-1/2 -translate-x-1/2 z-50 md:block hidden">
                <AnimatePresence mode="wait">
                    {aiState !== 'idle' ? (
                        <motion.div key="indicator"><AIStateIndicator /></motion.div>
                    ) : (
                        <motion.div key="toolbar">
                            <DesktopToolbar
                                onProcessDrawing={handleProcessDrawing}
                                onUploadPdfClick={() => pdfInputRef.current?.click()}
                                onUploadImageClick={() => imageInputRef.current?.click()}
                                onDownload={handleDownload}
                                onClearCanvas={handleClearCanvas}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Mobile UI */}
            <div className="md:hidden fixed bottom-24 left-4 z-50">
                <AnimatePresence>
                    {isToolOptionsOpen && <MobileToolOptions />}
                </AnimatePresence>
                <MobileOptionsToggle onClick={() => setIsToolOptionsOpen(p => !p)} />
            </div>

            <div className="md:hidden fixed bottom-4 left-4 z-50">
                <AnimatePresence>
                    {aiState === 'idle' && (
                        <MobileToolbar
                            isOpen={isMenuOpen}
                            setIsOpen={setIsMenuOpen}
                            onProcessDrawing={handleProcessDrawing}
                            onUploadPdfClick={() => pdfInputRef.current?.click()}
                            onUploadImageClick={() => imageInputRef.current?.click()}
                            onDownload={handleDownload}
                            onClearCanvas={handleClearCanvas}
                        />
                    )}
                </AnimatePresence>
            </div>

            <AIStateIndicator isMobile />
            <ToolOptionsPanel />

            <div className="fixed bottom-4 right-4 z-50">
                <SpeechButton onStart={startListening} onStop={stopListening} />
            </div>

            <CanvasStage
                ref={stageRef}
                stagePos={stagePos}
                stageScale={stageScale}
                draggable={useAppStore.getState().currentTool === 'move' && !selectedElementId}
                eventHandlers={eventHandlers}
            />

            {editingElement?.type === 'text' && (
                <EditingTextarea
                    element={editingElement}
                    stagePos={stagePos}
                    stageScale={stageScale}
                />
            )}
        </div>
    );
};

export default TutorLM;