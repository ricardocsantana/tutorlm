import { motion } from "framer-motion";
import { Bold, Italic, Minus, Spline, Underline } from "lucide-react";
import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { useShallow } from "zustand/react/shallow";

export const ToolOptionsPanel: React.FC = () => {
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
        () => elements.find((el: { id: any }) => el.id === selectedElementId),
        [elements, selectedElementId]
    );

    const showPenOptions = currentTool === 'pen';
    const showEraserOptions = currentTool === 'eraser';
    const showTextOptions = currentTool === 'move' && selectedElement?.type === 'text';

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

    if (!showPenOptions && !showEraserOptions && !showTextOptions) return null;

    return (
        <>
            {/* Desktop Options */}
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="hidden md:flex fixed bottom-4 left-1/2 -translate-x-1/2 z-50 items-center justify-center gap-4 bg-white/95 backdrop-blur-xl p-3 rounded-2xl shadow-2xl"
            >
                {showPenOptions && (
                    <>
                        {['#1f2937', '#ef4444', '#3b82f6', '#16a34a'].map(color => (
                            <button
                                key={color}
                                onClick={() => setPenColor(color)}
                                title={color}
                                style={{ backgroundColor: color }}
                                className={`w-7 h-7 rounded-full border-2 transition-transform duration-150 ${
                                    penColor === color
                                        ? 'border-blue-500 scale-110'
                                        : 'border-transparent hover:scale-110'
                                }`}
                            />
                        ))}
                        <div className="w-px h-6 bg-gray-200" />
                        {[2, 4, 8].map(thick => (
                            <button
                                key={thick}
                                onClick={() => setPenThickness(thick)}
                                className={`p-1 rounded-md transition-colors ${
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
                        <div className="w-px h-6 bg-gray-200" />
                        <div className="flex gap-1">
                            <button
                                onClick={() => setPenMode('free')}
                                title="Freehand"
                                className={`p-2 rounded-md transition-colors ${
                                    penMode === 'free'
                                        ? 'bg-blue-100 text-blue-600'
                                        : 'hover:bg-gray-100 text-gray-600'
                                }`}
                            >
                                <Spline size={18} />
                            </button>
                            <button
                                onClick={() => setPenMode('line')}
                                title="Straight Line"
                                className={`p-2 rounded-md transition-colors ${
                                    penMode === 'line'
                                        ? 'bg-blue-100 text-blue-600'
                                        : 'hover:bg-gray-100 text-gray-600'
                                }`}
                            >
                                <Minus size={18} />
                            </button>
                        </div>
                    </>
                )}
                {showEraserOptions && (
                    <>
                        {[20, 40, 60].map(thick => (
                            <button
                                key={thick}
                                onClick={() => setEraserThickness(thick)}
                                className={`p-1 rounded-md transition-colors ${
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
                )}
                {showTextOptions && selectedElement && (
                    <>
                        {['#1f2937', '#ef4444', '#3b82f6', '#16a34a'].map(color => (
                            <button
                                key={color}
                                onClick={() => updateElement(selectedElement.id, { fill: color })}
                                title={color}
                                style={{ backgroundColor: color }}
                                className={`w-7 h-7 rounded-full border-2 transition-transform duration-150 ${
                                    selectedElement.fill === color
                                        ? 'border-blue-500 scale-110'
                                        : 'border-transparent hover:scale-110'
                                }`}
                            />
                        ))}
                        <div className="w-px h-6 bg-gray-200" />
                        <button
                            title="Bold"
                            onClick={handleToggleBold}
                            className={`p-2 rounded-md transition-colors ${
                                isBold
                                    ? 'bg-blue-100 text-blue-600'
                                    : 'hover:bg-gray-100 text-gray-600'
                            }`}
                        >
                            <Bold size={18} />
                        </button>
                        <button
                            title="Italic"
                            onClick={handleToggleItalic}
                            className={`p-2 rounded-md transition-colors ${
                                isItalic
                                    ? 'bg-blue-100 text-blue-600'
                                    : 'hover:bg-gray-100 text-gray-600'
                            }`}
                        >
                            <Italic size={18} />
                        </button>
                        <button
                            title="Underline"
                            onClick={handleToggleUnderline}
                            className={`p-2 rounded-md transition-colors ${
                                isUnderlined
                                    ? 'bg-blue-100 text-blue-600'
                                    : 'hover:bg-gray-100 text-gray-600'
                            }`}
                        >
                            <Underline size={18} />
                        </button>
                    </>
                )}
            </motion.div>
        </>
    );
};