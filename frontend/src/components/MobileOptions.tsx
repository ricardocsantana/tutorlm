import { motion } from "framer-motion";
import {
    Bold,
    Eraser,
    Italic,
    Minus,
    Pen,
    Settings2,
    Spline,
    Type,
    Underline
} from "lucide-react";
import React, { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { useShallow } from "zustand/react/shallow";

export const MobileOptionsToggle: React.FC<{ onClick: () => void }> = React.memo(
    ({ onClick }) => {
        const { currentTool, selectedElementId, elements } = useAppStore(
            useShallow(state => ({
                currentTool: state.currentTool,
                selectedElementId: state.selectedElementId,
                elements: state.elements,
            }))
        );
        const selectedElement = useMemo(
            () => elements.find(el => el.id === selectedElementId),
            [elements, selectedElementId]
        );
        const showPenOptions = currentTool === 'pen';
        const showEraserOptions = currentTool === 'eraser';
        const showTextOptions =
            currentTool === 'move' && selectedElement?.type === 'text';

        if (!showPenOptions && !showEraserOptions && !showTextOptions) return null;

        return (
            <motion.button
                onClick={onClick}
                whileTap={{ scale: 0.9 }}
                className="p-4 rounded-full bg-white/95 backdrop-blur-xl shadow-2xl text-gray-700"
            >
                {showPenOptions && <Pen size={24} />}
                {showEraserOptions && <Eraser size={24} />}
                {showTextOptions && <Type size={24} />}
                {!showPenOptions &&
                    !showEraserOptions &&
                    !showTextOptions && <Settings2 size={24} />}
            </motion.button>
        );
    }
);

export const MobileToolOptions: React.FC = React.memo(() => {
    const {
        currentTool,
        penColor,
        penThickness,
        eraserThickness,
        selectedElementId,
        elements,
        penMode
    } = useAppStore(
        useShallow(state => ({
            currentTool: state.currentTool,
            penColor: state.penColor,
            penThickness: state.penThickness,
            eraserThickness: state.eraserThickness,
            selectedElementId: state.selectedElementId,
            elements: state.elements,
            penMode: state.penMode
        }))
    );
    const {
        setPenColor,
        setPenThickness,
        setEraserThickness,
        updateElement,
        setPenMode
    } = useAppStore(s => s.actions);
    const selectedElement = useMemo(
        () => elements.find(el => el.id === selectedElementId),
        [elements, selectedElementId]
    );
    const showPenOptions = currentTool === 'pen';
    const showEraserOptions = currentTool === 'eraser';
    const showTextOptions =
        currentTool === 'move' && selectedElement?.type === 'text';
    const isBold = selectedElement?.fontStyle?.includes('bold');
    const isItalic = selectedElement?.fontStyle?.includes('italic');
    const isUnderlined = selectedElement?.textDecoration === 'underline';

    const handleToggleBold = () => {
        if (!selectedElement) return;
        const newStyle = isBold
            ? (isItalic ? 'italic' : 'normal')
            : (isItalic ? 'bold italic' : 'bold');
        updateElement(selectedElement.id, { fontStyle: newStyle });
    };

    const handleToggleItalic = () => {
        if (!selectedElement) return;
        const newStyle = isItalic
            ? (isBold ? 'bold' : 'normal')
            : (isBold ? 'bold italic' : 'italic');
        updateElement(selectedElement.id, { fontStyle: newStyle });
    };

    const handleToggleUnderline = () => {
        if (!selectedElement) return;
        const newDecoration = isUnderlined ? undefined : 'underline';
        updateElement(selectedElement.id, { textDecoration: newDecoration });
    };

    if (showPenOptions) {
        return (
            <>
                {['#1f2937', '#ef4444', '#3b82f6', '#16a34a'].map(color => (
                    <button
                        key={color}
                        onClick={() => setPenColor(color)}
                        title={color}
                        style={{ backgroundColor: color }}
                        className={`w-10 h-10 rounded-lg border-2 transition-transform duration-150 ${
                            penColor === color
                                ? 'border-blue-500 scale-110'
                                : 'border-transparent hover:scale-110'
                        }`}
                    />
                ))}
                {[2, 4, 8].map(thick => (
                    <button
                        key={thick}
                        onClick={() => setPenThickness(thick)}
                        className={`p-1 rounded-lg transition-colors flex items-center justify-center ${
                            penThickness === thick
                                ? 'bg-blue-100'
                                : 'hover:bg-gray-100'
                        }`}
                    >
                        <div
                            style={{
                                width: thick + 6,
                                height: thick + 6,
                                backgroundColor: penColor
                            }}
                            className="rounded-full"
                        />
                    </button>
                ))}
                <button
                    onClick={() => setPenMode(penMode === 'free' ? 'line' : 'free')}
                    title={penMode === 'free' ? "Straight Line" : "Freehand"}
                    className="p-2 rounded-lg transition-colors flex items-center justify-center hover:bg-gray-100 text-gray-600"
                >
                    {penMode === 'free' ? <Minus size={20} /> : <Spline size={20} />}
                </button>
            </>
        );
    }
    if (showEraserOptions) {
        return (
            <>
                {[20, 40, 60].map(thick => (
                    <button
                        key={thick}
                        onClick={() => setEraserThickness(thick)}
                        className={`p-1 rounded-lg transition-colors flex items-center justify-center ${
                            eraserThickness === thick
                                ? 'bg-blue-100'
                                : 'hover:bg-gray-100'
                        }`}
                    >
                        <div
                            style={{
                                width: thick / 2 + 8,
                                height: thick / 2 + 8
                            }}
                            className="rounded-full bg-gray-300 border-2 border-gray-400"
                        />
                    </button>
                ))}
            </>
        );
    }
    if (showTextOptions && selectedElement) {
        return (
            <>
                {['#1f2937', '#ef4444', '#3b82f6', '#16a34a'].map(color => (
                    <button
                        key={color}
                        onClick={() => updateElement(selectedElement.id, { fill: color })}
                        title={color}
                        style={{ backgroundColor: color }}
                        className={`w-10 h-10 rounded-lg border-2 transition-transform duration-150 ${
                            selectedElement.fill === color
                                ? 'border-blue-500 scale-110'
                                : 'border-transparent hover:scale-110'
                        }`}
                    />
                ))}
                <button
                    title="Bold"
                    onClick={handleToggleBold}
                    className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
                        isBold
                            ? 'bg-blue-100 text-blue-600'
                            : 'hover:bg-gray-100 text-gray-600'
                    }`}
                >
                    <Bold size={20} />
                </button>
                <button
                    title="Italic"
                    onClick={handleToggleItalic}
                    className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
                        isItalic
                            ? 'bg-blue-100 text-blue-600'
                            : 'hover:bg-gray-100 text-gray-600'
                    }`}
                >
                    <Italic size={20} />
                </button>
                <button
                    title="Underline"
                    onClick={handleToggleUnderline}
                    className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
                        isUnderlined
                            ? 'bg-blue-100 text-blue-600'
                            : 'hover:bg-gray-100 text-gray-600'
                    }`}
                >
                    <Underline size={20} />
                </button>
            </>
        );
    }
    return null;
});