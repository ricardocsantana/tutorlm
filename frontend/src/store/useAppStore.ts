import { create } from 'zustand';

//——————————————————————————————————————//
// 1. TYPE DEFINITIONS & ZUSTAND STORE
//——————————————————————————————————————//
export type Tool = 'move' | 'pen' | 'eraser' | 'text';
export type AIState = 'idle' | 'listening' | 'thinking';
export type CanvasElementType = 'text' | 'image' | 'line';
export type NotificationType = 'info' | 'success' | 'error';

export interface LineData {
    id: string;
    points: number[];
    color: string;
    thickness: number;
    tool: 'pen' | 'eraser';
}

export interface CanvasElement {
    id: string;
    type: CanvasElementType;
    x: number;
    y: number;
    points?: number[];
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
    content?: string;
    fontSize?: number;
    fill?: string;
    fontStyle?: string;
    textDecoration?: string;
    width?: number;
    height?: number;
    cornerRadius?: number;
}

export interface AppState {
    currentTool: Tool;
    penColor: string;
    penThickness: number;
    eraserThickness: number;
    lines: LineData[];
    elements: CanvasElement[];
    selectedElementId: string | null;
    editingElementId: string | null;
    aiState: AIState;
    transcript: string;
    isUploading: boolean;
    penMode: 'free' | 'line';
    recognitionLang: string; // ✨ STATE ADDED
    difficulty: string; // ✨ STATE ADDED
    actions: {
        setCurrentTool: (tool: Tool) => void;
        setPenColor: (color: string) => void;
        setPenThickness: (thickness: number) => void;
        setEraserThickness: (thickness: number) => void;
        startDrawing: (point: { x: number; y: number }) => void;
        draw: (point: { x: number; y: number }) => void;
        addElement: (element: Omit<CanvasElement, 'isAI'>) => void;
        updateElement: (id: string, props: Partial<CanvasElement>) => void;
        deleteElement: (id: string) => void;
        setSelectedElementId: (id: string | null) => void;
        setEditingElementId: (id: string | null) => void;
        setAiState: (state: AIState) => void;
        setTranscript: (text: string) => void;
        streamAIResponse: (id: string, word: string) => void;
        setLines: (lines: LineData[]) => void;
        setIsUploading: (isUploading: boolean) => void;
        setPenMode: (mode: 'free' | 'line') => void;
        setRecognitionLang: (lang: string) => void; // ✨ ACTION ADDED
        setDifficulty: (difficulty: string) => void; // ✨ ACTION ADDED
        clearCanvas: () => void;
    };
}

export const useAppStore = create<AppState>((set, get) => ({
    currentTool: 'move',
    penColor: '#3b82f6',
    penThickness: 4,
    eraserThickness: 20,
    lines: [],
    elements: [],
    selectedElementId: null,
    editingElementId: null,
    aiState: 'idle',
    transcript: '',
    isUploading: false,
    penMode: 'free',
    recognitionLang: 'en-US', // ✨ DEFAULT LANGUAGE
    difficulty: 'easy', // ✨ DEFAULT DIFFICULTY
    actions: {
        setCurrentTool: (tool) => set({ currentTool: tool, selectedElementId: null }),
        setPenColor: (color) => set({ penColor: color }),
        setPenThickness: (thickness) => set({ penThickness: thickness }),
        setEraserThickness: (thickness) => set({ eraserThickness: thickness }),
        startDrawing: (point) => {
            const { currentTool, penColor, penThickness, eraserThickness, penMode } = get();
            if (currentTool === 'eraser') {
                const newLine: LineData = { id: `line-${Date.now()}`, tool: 'eraser', points: [point.x, point.y], color: penColor, thickness: eraserThickness };
                set((state) => ({ lines: [...state.lines, newLine] }));
                return;
            }
            if (currentTool === 'pen' && penMode === 'free') {
                const newLine: LineData = { id: `line-${Date.now()}`, tool: 'pen', points: [point.x, point.y], color: penColor, thickness: penThickness };
                set((state) => ({ lines: [...state.lines, newLine] }));
            }
        },
        draw: (point) => {
            const { currentTool, lines, penMode } = get();
            if (currentTool === 'pen' && penMode === 'line') return;
            if (currentTool !== 'pen' && currentTool !== 'eraser') return;
            const lastLine = lines[lines.length - 1];
            if (lastLine) {
                lastLine.points = lastLine.points.concat([point.x, point.y]);
                set({ lines: [...lines.slice(0, -1), lastLine] });
            }
        },
        addElement: (element) => {
            const newElement: CanvasElement = { ...element, x: element.x || 0, y: element.y || 0 };
            set((state) => ({ elements: [...state.elements, newElement] }));
        },
        updateElement: (id, props) => {
            set((state) => ({ elements: state.elements.map((el) => (el.id === id ? { ...el, ...props } : el)) }));
        },
        deleteElement: (id) => {
            set((state) => ({ elements: state.elements.filter((el) => el.id !== id), selectedElementId: null }));
        },
        setSelectedElementId: (id) => set({ selectedElementId: id, editingElementId: null }),
        setEditingElementId: (id) => set({ editingElementId: id, selectedElementId: null }),
        setAiState: (state) => set({ aiState: state }),
        setTranscript: (text) => set({ transcript: text }),
        streamAIResponse: (id, word) => {
            set(state => ({ elements: state.elements.map(el => el.id === id ? { ...el, content: (el.content === '...' ? '' : el.content) + word } : el) }))
        },
        setLines: (lines) => set({ lines }),
        setIsUploading: (isUploading) => set({ isUploading }),
        setPenMode: (mode) => set({ penMode: mode }),
        setRecognitionLang: (lang) => set({ recognitionLang: lang }), // ✨ ACTION IMPLEMENTED
        setDifficulty: (difficulty) => set({ difficulty }), // ✨ ACTION IMPLEMENTED
        clearCanvas: () => set({
            lines: [], elements: [], selectedElementId: null, editingElementId: null
        }),
    },
}));