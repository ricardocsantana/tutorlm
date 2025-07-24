// (Keep all your imports as they are)
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Stage, Layer, Line, Text, Transformer, Image as KonvaImage } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import Konva from 'konva';
import { motion, AnimatePresence } from 'framer-motion';
import { Move, Pen, Eraser, Type, File, Image, Download, Sparkles, BrainCircuit, Mic, Bold, Italic, Underline, Group, CheckCircle, AlertTriangle, Loader, Square, Trash2, Spline, Minus, GripVertical, Settings2 } from 'lucide-react';
import { create } from 'zustand';
import throttle from 'lodash.throttle';
import html2canvas from 'html2canvas';
import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

//——————————————————————————————————————//
// 0. CONFIGURATION
//——————————————————————————————————————//

//const BACKEND_URL = 'http://192.168.1.84:8000';
const BACKEND_URL = 'http://localhost:8000';

// Configure marked to use highlight.js
marked.use({
  renderer: {
    code(token) {
      const code = token.text;
      const lang = token.lang;
      if (lang && hljs.getLanguage(lang)) {
        try {
          const highlighted = hljs.highlight(code, { language: lang }).value;
          return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
        } catch (err) {
          console.error('Syntax highlighting error:', err);
        }
      }
      return `<pre><code class="hljs">${marked.parse(code)}</code></pre>`;
    }
  }
});


//——————————————————————————————————————//
// 1. TYPE DEFINITIONS & ZUSTAND STORE
//——————————————————————————————————————//  
type Tool = 'move' | 'pen' | 'eraser' | 'text';
type AIState = 'idle' | 'listening' | 'thinking';
type CanvasElementType = 'text' | 'image';
type NotificationType = 'info' | 'success' | 'error';

interface LineData {
  id: string;
  points: number[];
  color: string;
  thickness: number;
  tool: 'pen' | 'eraser';
}

interface CanvasElement {
  id: string;
  type: CanvasElementType;
  x: number;
  y: number;
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

interface AppState {
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
    clearCanvas: () => void;
  };
}

const useAppStore = create<AppState>((set, get) => ({
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
    clearCanvas: () => set({
      lines: [], elements: [], selectedElementId: null, editingElementId: null
    }),
  },
}));


//——————————————————————————————————————//
// 2. HELPER COMPONENTS & UTILS
//——————————————————————————————————————//
const ToolButton: React.FC<{ icon: React.ElementType; label: string; active?: boolean; onClick: () => void; disabled?: boolean; }> = React.memo(({ icon: Icon, label, active, onClick, disabled }) => (<motion.button onClick={onClick} title={label} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} disabled={disabled} className={`relative p-3 rounded-xl transition-all duration-200 ${active ? 'bg-gradient-to-br from-blue-500 to-blue-400 text-white shadow-lg shadow-blue-500/25' : 'bg-white/90 text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-md border border-gray-200/50'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`} > <Icon size={20} strokeWidth={active ? 2.5 : 2} /> </motion.button>));
const useImage = (src: string | undefined): [HTMLImageElement | undefined, string] => { const [image, setImage] = useState<HTMLImageElement>(); const [status, setStatus] = useState('loading'); useEffect(() => { if (!src) return; const img = document.createElement('img'); img.crossOrigin = 'Anonymous'; img.src = src; img.addEventListener('load', () => { setImage(img); setStatus('loaded'); }); img.addEventListener('error', () => { setStatus('failed'); }); return () => { img.removeEventListener('load', () => setStatus('loaded')); img.removeEventListener('error', () => setStatus('failed')); }; }, [src]); return [image, status]; };
const KonvaElement: React.FC<{ element: CanvasElement; currentTool: Tool; editingElementId: string | null; }> = React.memo(({ element, currentTool, editingElementId }) => { const { actions } = useAppStore(); const [image] = useImage(element.type === 'image' ? element.content : undefined); const handleSelect = () => { if (currentTool === 'move') { actions.setSelectedElementId(element.id); } }; const handleTransformEnd = (e: KonvaEventObject<Event>) => { const node = e.target; actions.updateElement(element.id, { x: node.x(), y: node.y(), rotation: node.rotation(), scaleX: node.scaleX(), scaleY: node.scaleY() }); }; const commonProps = { id: element.id, x: element.x, y: element.y, rotation: element.rotation ?? 0, scaleX: element.scaleX ?? 1, scaleY: element.scaleY ?? 1, draggable: currentTool === 'move', onClick: handleSelect, onTap: handleSelect, onDragEnd: (e: KonvaEventObject<DragEvent>) => actions.updateElement(element.id, { x: e.target.x(), y: e.target.y() }), onTransformEnd: handleTransformEnd, opacity: 1, shadowColor: "rgba(0,0,0,0.1)", shadowBlur: 10, shadowOffset: { x: 0, y: 4 }, shadowOpacity: 0.7, }; switch (element.type) { case 'text': return (<Text {...commonProps} text={element.content} fontSize={element.fontSize} fontFamily="Inter, system-ui, sans-serif" fill={element.fill} visible={editingElementId !== element.id} fontStyle={element.fontStyle || 'normal'} textDecoration={element.textDecoration} onDblClick={() => { if (currentTool === 'move') { actions.setEditingElementId(element.id); } }} />); case 'image': return (<KonvaImage {...commonProps} image={image} width={element.width} height={element.height} cornerRadius={element.cornerRadius} />); default: return null; } });
const ToolOptionsPanel: React.FC = () => {
  const { currentTool, penColor, penThickness, eraserThickness, selectedElementId, elements, penMode } = useAppStore();
  const { setPenColor, setPenThickness, setEraserThickness, updateElement, setPenMode } = useAppStore(s => s.actions);
  const selectedElement = useMemo(() => elements.find(el => el.id === selectedElementId), [elements, selectedElementId]);
  const showPenOptions = currentTool === 'pen';
  const showEraserOptions = currentTool === 'eraser';
  const showTextOptions = currentTool === 'move' && selectedElement?.type === 'text';
  const isBold = selectedElement?.fontStyle?.includes('bold');
  const isItalic = selectedElement?.fontStyle?.includes('italic');
  const isUnderlined = selectedElement?.textDecoration === 'underline';
  const handleToggleBold = () => { if (!selectedElement) return; const newStyle = isBold ? (isItalic ? 'italic' : 'normal') : (isItalic ? 'bold italic' : 'bold'); updateElement(selectedElement.id, { fontStyle: newStyle }); };
  const handleToggleItalic = () => { if (!selectedElement) return; const newStyle = isItalic ? (isBold ? 'bold' : 'normal') : (isBold ? 'bold italic' : 'italic'); updateElement(selectedElement.id, { fontStyle: newStyle }); };
  const handleToggleUnderline = () => { if (!selectedElement) return; const newDecoration = isUnderlined ? undefined : 'underline'; updateElement(selectedElement.id, { textDecoration: newDecoration }); };

  if (!showPenOptions && !showEraserOptions && !showTextOptions) return null;

  return (
    <>
      {/* Desktop Options */}
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} className="hidden md:flex fixed bottom-4 left-1/2 -translate-x-1/2 z-50 items-center justify-center gap-4 bg-white/95 backdrop-blur-xl p-3 rounded-2xl shadow-2xl">
        {showPenOptions && (
          <>
            {['#1f2937', '#ef4444', '#3b82f6', '#16a34a'].map(color => (
              <button key={color} onClick={() => setPenColor(color)} title={color} style={{ backgroundColor: color }} className={`w-7 h-7 rounded-full border-2 transition-transform duration-150 ${penColor === color ? 'border-blue-500 scale-110' : 'border-transparent hover:scale-110'}`} />
            ))}
            <div className="w-px h-6 bg-gray-200" />
            {[2, 4, 8].map(thick => (
              <button key={thick} onClick={() => setPenThickness(thick)} className={`p-1 rounded-md transition-colors ${penThickness === thick ? 'bg-blue-100' : 'hover:bg-gray-100'}`}>
                <div style={{ width: thick + 6, height: thick + 6, backgroundColor: penColor }} className="rounded-full" />
              </button>
            ))}
            <div className="w-px h-6 bg-gray-200" />
            <div className="flex gap-1">
              <button onClick={() => setPenMode('free')} title="Freehand" className={`p-2 rounded-md transition-colors ${penMode === 'free' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}><Spline size={18} /></button>
              <button onClick={() => setPenMode('line')} title="Straight Line" className={`p-2 rounded-md transition-colors ${penMode === 'line' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}><Minus size={18} /></button>
            </div>
          </>
        )}
        {showEraserOptions && (
          <>
            {[20, 40, 60].map(thick => (
              <button key={thick} onClick={() => setEraserThickness(thick)} className={`p-1 rounded-md transition-colors ${eraserThickness === thick ? 'bg-blue-100' : 'hover:bg-gray-100'}`}>
                <div style={{ width: thick / 2 + 8, height: thick / 2 + 8 }} className="rounded-full bg-gray-300 border-2 border-gray-400" />
              </button>
            ))}
          </>
        )}
        {showTextOptions && selectedElement && (
          <>
            {['#1f2937', '#ef4444', '#3b82f6', '#16a34a'].map(color => (
              <button key={color} onClick={() => updateElement(selectedElement.id, { fill: color })} title={color} style={{ backgroundColor: color }} className={`w-7 h-7 rounded-full border-2 transition-transform duration-150 ${selectedElement.fill === color ? 'border-blue-500 scale-110' : 'border-transparent hover:scale-110'}`} />
            ))}
            <div className="w-px h-6 bg-gray-200" />
            <button title="Bold" onClick={handleToggleBold} className={`p-2 rounded-md transition-colors ${isBold ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}><Bold size={18} /></button>
            <button title="Italic" onClick={handleToggleItalic} className={`p-2 rounded-md transition-colors ${isItalic ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}><Italic size={18} /></button>
            <button title="Underline" onClick={handleToggleUnderline} className={`p-2 rounded-md transition-colors ${isUnderlined ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}><Underline size={18} /></button>
          </>
        )}
      </motion.div>
    </>
  );
};
const MobileOptionsToggle: React.FC<{ onClick: () => void }> = React.memo(({ onClick }) => {
  const { currentTool, selectedElementId, elements } = useAppStore();
  const selectedElement = useMemo(() => elements.find(el => el.id === selectedElementId), [elements, selectedElementId]);
  const showPenOptions = currentTool === 'pen';
  const showEraserOptions = currentTool === 'eraser';
  const showTextOptions = currentTool === 'move' && selectedElement?.type === 'text';

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
      {!showPenOptions && !showEraserOptions && !showTextOptions && <Settings2 size={24} />}
    </motion.button>
  );
});
const MobileToolOptions: React.FC = React.memo(() => {
  const { currentTool, penColor, penThickness, eraserThickness, selectedElementId, elements, penMode } = useAppStore();
  const { setPenColor, setPenThickness, setEraserThickness, updateElement, setPenMode } = useAppStore(s => s.actions);
  const selectedElement = useMemo(() => elements.find(el => el.id === selectedElementId), [elements, selectedElementId]);
  const showPenOptions = currentTool === 'pen';
  const showEraserOptions = currentTool === 'eraser';
  const showTextOptions = currentTool === 'move' && selectedElement?.type === 'text';
  const isBold = selectedElement?.fontStyle?.includes('bold');
  const isItalic = selectedElement?.fontStyle?.includes('italic');
  const isUnderlined = selectedElement?.textDecoration === 'underline';
  const handleToggleBold = () => { if (!selectedElement) return; const newStyle = isBold ? (isItalic ? 'italic' : 'normal') : (isItalic ? 'bold italic' : 'bold'); updateElement(selectedElement.id, { fontStyle: newStyle }); };
  const handleToggleItalic = () => { if (!selectedElement) return; const newStyle = isItalic ? (isBold ? 'bold' : 'normal') : (isBold ? 'bold italic' : 'italic'); updateElement(selectedElement.id, { fontStyle: newStyle }); };
  const handleToggleUnderline = () => { if (!selectedElement) return; const newDecoration = isUnderlined ? undefined : 'underline'; updateElement(selectedElement.id, { textDecoration: newDecoration }); };

  if (showPenOptions) {
    return (
      <>
        {['#1f2937', '#ef4444', '#3b82f6', '#16a34a'].map(color => (
          <button key={color} onClick={() => setPenColor(color)} title={color} style={{ backgroundColor: color }} className={`w-10 h-10 rounded-lg border-2 transition-transform duration-150 ${penColor === color ? 'border-blue-500 scale-110' : 'border-transparent hover:scale-110'}`} />
        ))}
        {[2, 4, 8].map(thick => (
          <button key={thick} onClick={() => setPenThickness(thick)} className={`p-1 rounded-lg transition-colors flex items-center justify-center ${penThickness === thick ? 'bg-blue-100' : 'hover:bg-gray-100'}`}>
            <div style={{ width: thick + 6, height: thick + 6, backgroundColor: penColor }} className="rounded-full" />
          </button>
        ))}
        <button onClick={() => setPenMode(penMode === 'free' ? 'line' : 'free')} title={penMode === 'free' ? "Straight Line" : "Freehand"} className={`p-2 rounded-lg transition-colors flex items-center justify-center hover:bg-gray-100 text-gray-600`}>
          {penMode === 'free' ? <Minus size={20} /> : <Spline size={20} />}
        </button>
      </>
    );
  }
  if (showEraserOptions) {
    return (
      <>
        {[20, 40, 60].map(thick => (
          <button key={thick} onClick={() => setEraserThickness(thick)} className={`p-1 rounded-lg transition-colors flex items-center justify-center ${eraserThickness === thick ? 'bg-blue-100' : 'hover:bg-gray-100'}`}>
            <div style={{ width: thick / 2 + 8, height: thick / 2 + 8 }} className="rounded-full bg-gray-300 border-2 border-gray-400" />
          </button>
        ))}
      </>
    );
  }
  if (showTextOptions && selectedElement) {
    return (
      <>
        {['#1f2937', '#ef4444', '#3b82f6', '#16a34a'].map(color => (
          <button key={color} onClick={() => updateElement(selectedElement.id, { fill: color })} title={color} style={{ backgroundColor: color }} className={`w-10 h-10 rounded-lg border-2 transition-transform duration-150 ${selectedElement.fill === color ? 'border-blue-500 scale-110' : 'border-transparent hover:scale-110'}`} />
        ))}
        <button title="Bold" onClick={handleToggleBold} className={`p-2 rounded-lg transition-colors flex items-center justify-center ${isBold ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}><Bold size={20} /></button>
        <button title="Italic" onClick={handleToggleItalic} className={`p-2 rounded-lg transition-colors flex items-center justify-center ${isItalic ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}><Italic size={20} /></button>
        <button title="Underline" onClick={handleToggleUnderline} className={`p-2 rounded-lg transition-colors flex items-center justify-center ${isUnderlined ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}><Underline size={20} /></button>
      </>
    );
  }
  return null;
});
const GridLayer = React.memo(() => {
  const GRID_SIZE = 40000;
  const GRID_SPACING = 100;
  const GRID_COLOR = '#e0e0e0';
  const GRID_STROKE_WIDTH = 1;

  const lines = useMemo(() => {
    const newLines = [];
    const halfGridSize = GRID_SIZE / 2;
    for (let i = -halfGridSize; i <= halfGridSize; i += GRID_SPACING) {
      newLines.push(<Line key={`v-${i}`} points={[i, -halfGridSize, i, halfGridSize]} stroke={GRID_COLOR} strokeWidth={GRID_STROKE_WIDTH} />);
    }
    for (let i = -halfGridSize; i <= halfGridSize; i += GRID_SPACING) {
      newLines.push(<Line key={`h-${i}`} points={[-halfGridSize, i, halfGridSize, i]} stroke={GRID_COLOR} strokeWidth={GRID_STROKE_WIDTH} />);
    }
    return newLines;
  }, []);

  return <Layer listening={false} name="grid-layer">{lines}</Layer>;
});

interface BoundingBox { x: number; y: number; width: number; height: number; }
const getLineBoundingBox = (line: LineData): BoundingBox => { let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; for (let i = 0; i < line.points.length; i += 2) { minX = Math.min(minX, line.points[i]); maxX = Math.max(maxX, line.points[i]); minY = Math.min(minY, line.points[i + 1]); maxY = Math.max(maxY, line.points[i + 1]); } return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }; };
const dbscan = (points: (BoundingBox & { id: string })[], epsilon: number, minPts: number) => { const clusters: string[][] = []; const visited = new Set<string>(); const dist = (p1: BoundingBox, p2: BoundingBox) => { const dx = Math.max(0, Math.abs((p1.x + p1.width / 2) - (p2.x + p2.width / 2)) - (p1.width + p2.width) / 2); const dy = Math.max(0, Math.abs((p1.y + p1.height / 2) - (p2.y + p2.height / 2)) - (p1.height + p2.height) / 2); return Math.sqrt(dx * dx + dy * dy); }; const getNeighbors = (pointIndex: number) => { const neighbors: number[] = []; for (let i = 0; i < points.length; i++) { if (i !== pointIndex && dist(points[pointIndex], points[i]) < epsilon) { neighbors.push(i); } } return neighbors; }; for (let i = 0; i < points.length; i++) { if (visited.has(points[i].id)) continue; visited.add(points[i].id); const neighbors = getNeighbors(i); if (neighbors.length < minPts) continue; const newCluster: string[] = [points[i].id]; let queue = [...neighbors]; while (queue.length > 0) { const neighborIndex = queue.shift()!; const neighborId = points[neighborIndex].id; if (!visited.has(neighborId)) { visited.add(neighborId); const newNeighbors = getNeighbors(neighborIndex); if (newNeighbors.length >= minPts) { queue = [...queue, ...newNeighbors]; } } if (!newCluster.some(id => points.find(p => p.id === id) === points.find(p => p.id === neighborId))) { newCluster.push(neighborId); } } clusters.push(newCluster); } return clusters; };
const dataURLtoBlob = (dataurl: string): Blob => { const arr = dataurl.split(','); const mimeMatch = arr[0].match(/:(.*?);/); if (!mimeMatch) throw new Error("Invalid data URL"); const mime = mimeMatch[1]; const bstr = atob(arr[1]); let n = bstr.length; const u8arr = new Uint8Array(n); while (n--) { u8arr[n] = bstr.charCodeAt(n); } return new Blob([u8arr], { type: mime }); }

// ✨ --- CORRECTED & ENHANCED RENDER-TO-IMAGE FUNCTION --- ✨
interface RenderOptions {
  backgroundColor?: string;
  textColor?: string;
  padding?: string;
  borderRadius?: string;
  lineHeight?: string;
  fontSize?: string;
}

const renderMarkdownToImage = async (
  content: string,
  width: number,
  options: RenderOptions = {}
): Promise<{ dataURL: string; height: number }> => {
  const container = document.createElement('div');
  document.body.appendChild(container);

  Object.assign(container.style, {
    position: 'absolute',
    left: '-9999px',
    width: `${width}px`,
    boxSizing: 'border-box',
    fontFamily: 'Inter, system-ui, sans-serif',
    backgroundColor: options.backgroundColor || 'transparent',
    color: options.textColor || '#1f2937',
    padding: options.padding || '8px',
    borderRadius: options.borderRadius || '0px',
    fontSize: options.fontSize || '18px',
    lineHeight: options.lineHeight || '1.6',
  });

  const style = document.createElement('style');
  style.innerHTML = `
    .math-inline { display:inline-block; }
    table { width: 100%; border-collapse: collapse; margin: 1em 0; background-color: white; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    th { background-color: #f9fafb; font-weight: 600; }
    pre { background-color: #0d1117; color: #c9d1d9; margin-top: 16px; margin-bottom: 16px; padding: 16px; border-radius: 6px; overflow-x: auto; }
    pre code.hljs { display: block; overflow-x: auto; padding: 0; background: transparent; color: inherit; white-space: pre-wrap; }
  `;
  container.appendChild(style);

  const processedContent = content
    .replace(/\$\$(.*?)\$\$/gs, '<div class="math-display">$$$1$$</div>')
    .replace(/\$(.*?)\$/g, '<span class="math-inline">$$$1$</span>')
    .replace(/\\\[(.*?)\\\]/gs, '<div class="math-display">$$$1$$</div>')
    .replace(/\\\((.*?)\\\)/g, '<span class="math-inline">$$$1$</span>');

  container.insertAdjacentHTML('beforeend', await marked.parse(processedContent));

  container.querySelectorAll('.math-display, .math-inline').forEach((el) => {
    const isDisplay = el.classList.contains('math-display');
    const tex = el.innerHTML.slice(isDisplay ? 2 : 1, isDisplay ? -2 : -1).trim();
    try {
      katex.render(tex, el as HTMLElement, {
        throwOnError: false,
        displayMode: isDisplay,
      });
    } catch (e) {
      console.error('KaTeX rendering error:', e);
      el.textContent = tex;
    }
  });

  const canvas = await html2canvas(container, {
    backgroundColor: options.backgroundColor || null,
    scale: 2,
  });
  const dataURL = canvas.toDataURL('image/png');
  const height = container.offsetHeight;
  document.body.removeChild(container);

  return { dataURL, height };
};


//——————————————————————————————————————//
// 3. MAIN TUTORLM COMPONENT
//——————————————————————————————————————//
const TutorLM: React.FC = () => {
  const stageRef = useRef<Konva.Stage>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const isDrawing = useRef(false);
  const isPanning = useRef(false);
  const lineStart = useRef<{ x: number; y: number } | null>(null);

  const { currentTool, lines, elements, selectedElementId, editingElementId, aiState, transcript, isUploading, penMode, penColor, penThickness } = useAppStore();
  const actions = useAppStore((state) => state.actions);

  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [showWelcome, setShowWelcome] = useState(true);
  const [editingText, setEditingText] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isToolOptionsOpen, setIsToolOptionsOpen] = useState(false);

  const [notification, setNotification] = useState<{ id: number; message: string; type: NotificationType } | null>(null);

  const editingElement = useMemo(() => elements.find(el => el.id === editingElementId), [elements, editingElementId]);

  const showNotification = (message: string, type: NotificationType, duration = 4000) => {
    const newId = Date.now();
    setNotification({ id: newId, message, type });
    if (type !== 'info') {
      setTimeout(() => {
        setNotification(current => (current?.id === newId ? null : current));
      }, duration);
    }
  };

  const clearNotification = () => setNotification(null);

  const getPointerPosition = () => {
    const stage = stageRef.current;
    if (!stage) {
      return { x: window.innerWidth / 2 - stagePos.x, y: window.innerHeight / 2 - stagePos.y };
    }
    const pointer = stage.getPointerPosition() || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return { x: (pointer.x - stage.x()) / stage.scaleX(), y: (pointer.y - stage.y()) / stage.scaleY() };
  };

  useEffect(() => {
    if (editingElement && textAreaRef.current) {
      setEditingText(editingElement.content || '');
      textAreaRef.current.focus();
    }
  }, [editingElement]);
  
 // ✨ --- CORRECTED & ENHANCED AI REQUEST HANDLER --- ✨
  const handleAIChatRequest = async (prompt: string) => {
    actions.setAiState('thinking');

    const processElement = async (element: any) => {
      if (!element.type || typeof element.x === 'undefined' || typeof element.y === 'undefined') {
        console.error("Invalid element received from stream:", element);
        return;
      }
      const id = `${element.type}-${Date.now()}-${Math.random()}`;

      switch (element.type) {
        case 'card': {
          const content = element.content || '';
          const width = element.width || 500;
          const styleOptions = {
            backgroundColor: element.backgroundColor || '#ffffff',
            textColor: element.textColor || '#1f2937',
            padding: '16px',
            borderRadius: '12px',
            fontSize: '16px',
          };
          try {
            const { dataURL, height } = await renderMarkdownToImage(content, width, styleOptions);
            actions.addElement({
              id: id, type: 'image', x: element.x, y: element.y,
              content: dataURL, width: width, height: height,
              cornerRadius: 12,
            });
          } catch (renderError) {
            console.error("Error rendering card element:", renderError);
            actions.addElement({ id, type: 'text', x: element.x, y: element.y, content: 'Error rendering card.', fill: 'red' });
          }
          break;
        }

        case 'text': {
          const content = element.content || '';
          const width = element.width || 550;
          try {
            const { dataURL, height } = await renderMarkdownToImage(content, width, { fontSize: '18px' });
            actions.addElement({
              id: id, type: 'image', x: element.x, y: element.y,
              content: dataURL, width: width, height: height,
            });
          } catch (renderError) {
            console.error("Error rendering text element:", renderError);
            actions.addElement({ id, type: 'text', x: element.x, y: element.y, content: 'Error rendering content.', fill: 'red' });
          }
          break;
        }

        case 'line': {
          const thicknessMap: { [key: string]: number } = { 's': 2, 'm': 4, 'l': 8 };
          if (typeof element.x1 === 'undefined' || typeof element.y1 === 'undefined' || typeof element.x2 === 'undefined' || typeof element.y2 === 'undefined') break;
          const newLine: LineData = {
            id: id, tool: 'pen',
            points: [element.x1, element.y1, element.x2, element.y2],
            color: element.color || '#3b82f6',
            thickness: thicknessMap[element.thickness] || 4
          };
          const currentLines = useAppStore.getState().lines;
          actions.setLines([...currentLines, newLine]);
          break;
        }

        case 'image': {
          const placeholderId = `placeholder-${id}`;
          actions.addElement({
            id: placeholderId, type: 'text', x: element.x, y: element.y,
            content: `AI is searching for "${element.search}"...`, fontSize: 16, fill: '#6b7280'
          });
          try {
            const searchResponse = await fetch(`${BACKEND_URL}/api/image-search?q=${encodeURIComponent(element.search)}`);
            if (!searchResponse.ok) throw new Error(`Image search failed for "${element.search}"`);
            const { imageUrl, width: originalWidth, height: originalHeight } = await searchResponse.json();
            const targetHeight = element.height || 250;
            const aspectRatio = originalHeight > 0 ? originalWidth / originalHeight : 1;
            const newWidth = targetHeight * aspectRatio;
            actions.deleteElement(placeholderId);
            actions.addElement({
              id: id, type: 'image', content: imageUrl, x: element.x, y: element.y,
              width: newWidth, height: targetHeight, cornerRadius: 8,
            });
          } catch (searchError) {
            console.error("Error fetching image:", searchError);
            actions.updateElement(placeholderId, { content: `Error: Could not load image.` });
          }
          break;
        }

        default:
          console.warn("Unknown element type received from stream:", element.type);
      }
    };

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (!response.ok || !response.body) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let braceDepth = 0;
      let objectStartIndex = -1;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        while (true) {
          if (objectStartIndex === -1) {
            objectStartIndex = buffer.indexOf('{');
            if (objectStartIndex === -1) break;
          }
          let objectEndIndex = -1;
          braceDepth = 0;
          for (let i = objectStartIndex; i < buffer.length; i++) {
            if (buffer[i] === '{') braceDepth++;
            else if (buffer[i] === '}') braceDepth--;
            if (braceDepth === 0) {
              objectEndIndex = i;
              break;
            }
          }
          if (objectEndIndex !== -1) {
            const objectStr = buffer.substring(objectStartIndex, objectEndIndex + 1);
            try {
              const element = JSON.parse(objectStr);
              processElement(element);
            } catch (e) {
              console.error("Failed to parse JSON object from stream:", objectStr, e);
            }
            buffer = buffer.substring(objectEndIndex + 1);
            objectStartIndex = -1;
          } else {
            break;
          }
        }
      }
    } catch (error) {
      console.error("Error handling AI chat request:", error);
      const pos = getPointerPosition();
      actions.addElement({
        id: `err-${Date.now()}`, type: 'text', content: `An AI communication error occurred.`,
        x: pos.x, y: pos.y, fontSize: 18, fill: '#ef4444',
      });
    } finally {
      actions.setAiState('idle');
      actions.setTranscript('');
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    actions.setIsUploading(true);
    showNotification(`Processing "${file.name}"...`, 'info');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${BACKEND_URL}/api/upload-pdf`, { method: 'POST', body: formData });
      if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.detail || 'Failed to process PDF.'); }
      const result = await response.json();

      if (result.imageDataUrl) {
        const img = new window.Image();
        img.src = result.imageDataUrl;
        img.onload = () => {
          const pos = getPointerPosition();
          const MAX_WIDTH = 500;
          const scale = Math.min(1, MAX_WIDTH / img.width);
          actions.addElement({ id: `pdf-preview-${Date.now()}`, type: 'image', x: pos.x - (img.width * scale) / 2, y: pos.y, content: result.imageDataUrl, width: img.width * scale, height: img.height * scale, cornerRadius: 4 });
          clearNotification();
          showNotification(`"${result.filename}" is ready for questions!`, 'success');
        };
        img.onerror = () => { throw new Error("Failed to load PDF preview image from server data."); };
      } else {
        clearNotification();
        showNotification(`"${result.filename}" processed (no preview).`, 'success');
      }
    } catch (error) {
      console.error("Error uploading PDF:", error);
      clearNotification();
      showNotification(`PDF Error: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      if (e.target) e.target.value = '';
      actions.setIsUploading(false);
      actions.setCurrentTool('move');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    actions.setIsUploading(true);
    showNotification(`Processing "${file.name}"...`, 'info');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${BACKEND_URL}/api/upload-image`, { method: 'POST', body: formData });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Image processing failed on server.");
      }

      const result = await response.json();

      if (result.imageDataUrl) {
        const img = new window.Image();
        img.src = result.imageDataUrl;
        img.onload = () => {
          const pos = getPointerPosition();
          const MAX_WIDTH = 400;
          const scale = Math.min(1, MAX_WIDTH / img.width);
          actions.addElement({
            id: `img-${Date.now()}`,
            type: 'image',
            x: pos.x - (img.width * scale) / 2,
            y: pos.y,
            content: result.imageDataUrl,
            width: img.width * scale,
            height: img.height * scale,
            cornerRadius: 8
          });
          clearNotification();
          showNotification(`Image "${file.name}" is ready for the AI.`, 'success');
        };
        img.onerror = () => { throw new Error("Failed to load image from server data."); };
      } else {
        throw new Error("Server did not return image data.");
      }
    } catch (err) {
      console.error("Error uploading image:", err);
      clearNotification();
      showNotification(`Image Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      if (e.target) e.target.value = '';
      actions.setIsUploading(false);
      actions.setCurrentTool('move');
    }
  };

  const handleProcessDrawing = async () => {
    const allLines = useAppStore.getState().lines;
    if (allLines.length === 0) {
      showNotification("There's nothing to process!", 'error');
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;

    actions.setIsUploading(true);
    showNotification("Processing drawing(s)...", 'info');

    const gridLayer = stage.findOne('.grid-layer');
    if (gridLayer) {
      gridLayer.visible(false);
      stage.batchDraw();
    }

    try {
      const lineBoxes = allLines.map(line => ({ ...getLineBoundingBox(line), id: line.id }));
      const clusters = dbscan(lineBoxes, 75, 1);

      if (clusters.length === 0) {
        throw new Error("No distinct drawings found to process.");
      }

      const processedLineIds = new Set<string>();

      for (const cluster of clusters) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        cluster.forEach(lineId => {
          const box = lineBoxes.find(b => b.id === lineId);
          if (box) {
            minX = Math.min(minX, box.x);
            minY = Math.min(minY, box.y);
            maxX = Math.max(maxX, box.x + box.width);
            maxY = Math.max(maxY, box.y + box.height);
          }
          processedLineIds.add(lineId);
        });

        const PADDING = 20;
        const clipRect = {
          x: minX - PADDING,
          y: minY - PADDING,
          width: (maxX - minX) + PADDING * 2,
          height: (maxY - minY) + PADDING * 2,
        };

        const displayDataUrl = stage.toDataURL({ ...clipRect, pixelRatio: 2 });
        const displayBlob = dataURLtoBlob(displayDataUrl);

        const tempLayer = new Konva.Layer();
        const whiteRect = new Konva.Rect({
          x: clipRect.x,
          y: clipRect.y,
          width: clipRect.width,
          height: clipRect.height,
          fill: 'white',
        });
        tempLayer.add(whiteRect);
        stage.add(tempLayer);
        tempLayer.moveToBottom();
        stage.batchDraw();

        const backendDataUrl = stage.toDataURL({ ...clipRect, pixelRatio: 2 });

        tempLayer.destroy();
        stage.batchDraw();

        const backendBlob = dataURLtoBlob(backendDataUrl);

        const formData = new FormData();
        formData.append('file', backendBlob, `drawing-backend-${Date.now()}.png`);
        formData.append('display_file', displayBlob, `drawing-display-${Date.now()}.png`);

        const response = await fetch(`${BACKEND_URL}/api/upload-image`, { method: 'POST', body: formData });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || 'Processing drawing cluster failed.');
        }
        const result = await response.json();

        const imageUrlForDisplay = result.displayImageDataUrl || result.imageDataUrl;

        actions.addElement({
          id: `drawing-img-${Date.now()}`,
          type: 'image',
          content: imageUrlForDisplay,
          x: clipRect.x,
          y: clipRect.y,
          width: clipRect.width,
          height: clipRect.height,
          cornerRadius: 8,
        });
      }

      const remainingLines = allLines.filter(line => !processedLineIds.has(line.id));
      actions.setLines(remainingLines);

      clearNotification();
      showNotification(`Successfully processed and replaced ${clusters.length} drawing(s).`, 'success');

    } catch (error) {
      console.error("Error processing drawing:", error);
      clearNotification();
      showNotification(`Drawing Error: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      if (gridLayer) {
        gridLayer.visible(true);
        stage.batchDraw();
      }
      actions.setIsUploading(false);
    }
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { console.warn("Speech Recognition API not supported."); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
    recognition.onresult = (event) => { const fullTranscript = Array.from(event.results).map(result => (result as any)[0].transcript).join(''); actions.setTranscript(fullTranscript); };
    recognition.onerror = (event) => { console.error("Speech recognition error:", event.error); actions.setAiState('idle'); };
    recognition.onend = () => { if (useAppStore.getState().aiState === 'listening') { actions.setAiState('idle'); } };
    recognitionRef.current = recognition;
  }, [actions]);

  const startListening = React.useCallback(() => {
    if (aiState === 'idle' && !editingElementId && !isUploading) {
      actions.setTranscript('');
      recognitionRef.current?.start();
      actions.setAiState('listening');
    }
  }, [aiState, editingElementId, isUploading, actions]);

  const stopListening = React.useCallback(() => {
    if (aiState === 'listening') {
      recognitionRef.current?.stop();
      actions.setAiState('thinking');
      const finalTranscript = useAppStore.getState().transcript;
      if (finalTranscript.trim()) {
        handleAIChatRequest(finalTranscript.trim());
      } else {
        actions.setAiState('idle');
      }
    }
  }, [aiState, actions, handleAIChatRequest]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' && selectedElementId && !editingElementId) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        actions.deleteElement(selectedElementId);
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
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [selectedElementId, editingElementId, actions, startListening, stopListening]);

  const handleDownload = () => { if (!stageRef.current) { showNotification("Canvas is not ready.", "error"); return; } const stage = stageRef.current; if (lines.length === 0 && elements.length === 0) { showNotification("The canvas is empty!", "error"); return; } actions.setSelectedElementId(null); setTimeout(() => { const contentLayer = stage.getLayers()[1]; if (!contentLayer) return; const box = contentLayer.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true }); if (box.width === 0 || box.height === 0) { showNotification("Nothing to export.", "error"); return; } const PADDING = 20; const exportRect = { x: box.x - PADDING, y: box.y - PADDING, width: box.width + PADDING * 2, height: box.height + PADDING * 2, }; const dataURL = stage.toDataURL({ ...exportRect, pixelRatio: 2, mimeType: 'image/png', }); const link = document.createElement('a'); link.download = 'tutorlm-canvas.png'; link.href = dataURL; document.body.appendChild(link); link.click(); document.body.removeChild(link); }, 50); };
  const handleTextareaBlur = () => { if (!editingElement) return; actions.updateElement(editingElement.id, { content: editingText }); actions.setEditingElementId(null); };
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextareaBlur(); } else if (e.key === 'Escape') { actions.setEditingElementId(null); } };
  const handleThrottledMouseMove = useMemo(() => throttle(() => { if (!stageRef.current || !isDrawing.current) return; if (currentTool === 'pen' || currentTool === 'eraser') { const pos = getPointerPosition(); actions.draw(pos); } }, 16), [currentTool, actions]);
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) {
      actions.setSelectedElementId(null);
      actions.setEditingElementId(null);
    }
    if (currentTool === 'text' && clickedOnEmpty) {
      const newId = `text-${Date.now()}`;
      actions.addElement({ id: newId, type: 'text', x: getPointerPosition().x, y: getPointerPosition().y, content: 'Type here...', fontSize: 24, fill: '#1f2937' });
      actions.setEditingElementId(newId);
      actions.setCurrentTool('move');
      return;
    }
    if (currentTool === 'pen' && penMode === 'line' && clickedOnEmpty) {
      lineStart.current = getPointerPosition();
      isDrawing.current = true;
      return;
    }
    if ((currentTool === 'pen' || currentTool === 'eraser') && clickedOnEmpty) {
      isDrawing.current = true;
      actions.startDrawing(getPointerPosition());
    } else if (currentTool === 'move' && clickedOnEmpty) {
      isPanning.current = true;
    }
  };
  const handleMouseUp = () => {
    if (currentTool === 'pen' && penMode === 'line' && lineStart.current) {
      const end = getPointerPosition();
      const currentLines = useAppStore.getState().lines;
      actions.setLines([
        ...currentLines,
        { id: `line-${Date.now()}`, tool: 'pen', points: [lineStart.current.x, lineStart.current.y, end.x, end.y], color: penColor, thickness: penThickness }
      ]);
      lineStart.current = null;
    }
    isDrawing.current = false; isPanning.current = false;
  };
  const handleWheel = (e: KonvaEventObject<WheelEvent>) => { e.evt.preventDefault(); const stage = stageRef.current!; const scaleBy = 1.05; const oldScale = stage.scaleX(); const pointer = stage.getPointerPosition() || { x: 0, y: 0 }; const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale, }; const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy; setStageScale(Math.max(0.1, Math.min(5, newScale))); setStagePos({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale, }); };
  useEffect(() => { const timer = setTimeout(() => setShowWelcome(false), 8000); return () => clearTimeout(timer); }, []);
  const cursorStyle = useMemo(() => { if (currentTool === 'move') return isPanning.current ? 'grabbing' : 'grab'; if (currentTool === 'text') return 'text'; return 'crosshair'; }, [currentTool, isPanning.current]);

  const { clearCanvas } = useAppStore(s => s.actions);
  const handleClearCanvas = async () => {
    await fetch(`${BACKEND_URL}/api/clear`, { method: 'POST' });
    clearCanvas();
    showNotification("Canvas cleared", "success");
  };

  return (
    <div className="h-screen w-screen bg-gray-100 overflow-hidden relative font-sans touch-none" style={{ cursor: cursorStyle }}>
      <AnimatePresence>
        {notification && (
          <motion.div key={notification.id} initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.95 }} className={`fixed top-20 md:top-24 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-white ${notification.type === 'success' ? 'bg-green-500' : ''} ${notification.type === 'error' ? 'bg-red-500' : ''} ${notification.type === 'info' ? 'bg-blue-500' : ''}`}>
            {notification.type === 'success' && <CheckCircle size={20} />}
            {notification.type === 'error' && <AlertTriangle size={20} />}
            {notification.type === 'info' && <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}><Loader size={20} /></motion.div>}
            <span className="font-medium text-sm">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-4 left-4 md:top-7 md:left-7 z-50 select-none"><h1 className="text-xl md:text-2xl font-bold" style={{ fontFamily: "'Satisfy', cursive" }}>TutorLM</h1></div>
      <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" style={{ display: 'none' }} disabled={isUploading} />
      <input type="file" ref={pdfInputRef} onChange={handlePdfUpload} accept="application/pdf" style={{ display: 'none' }} disabled={isUploading} />
      <AnimatePresence>{showWelcome && (<motion.div initial={{ opacity: 0, scale: .9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .9, y: -20 }} className="fixed top-20 md:top-30 left-1/2 -translate-x-1/2 z-40 w-[90vw] max-w-md p-4 md:p-6 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl"><div className="flex items-center gap-3 mb-3"><div className="p-2 bg-gradient-to-br from-blue-500 to-blue-400 rounded-lg"><Sparkles className="w-5 h-5 text-white" /></div><h3 className="font-bold text-gray-800">Welcome to TutorLM!</h3></div><p className="text-sm text-gray-600">Your AI learning companion. Upload files, draw, and talk to the AI by holding [Space].</p></motion.div>)}</AnimatePresence>

      {/* Toolbar & AI State Container */}
      <div className="fixed top-7 left-1/2 -translate-x-1/2 z-50 md:block hidden">
        <AnimatePresence mode="wait">
          {aiState !== 'idle' ? (
            <motion.div key="indicator" initial={{ opacity: 0, y: -20, scale: .95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: .95 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="flex flex-col items-center gap-2 px-8 py-4 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl">
              {aiState === 'listening' ? (<div className="flex items-center gap-4"><motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="p-2 bg-red-500 rounded-full"><Mic size={20} className="text-white" /></motion.div><span className="text-gray-800 font-semibold text-sm">Listening...</span></div>) : (<div className="flex items-center gap-4"><motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="p-2 bg-gradient-to-br from-blue-500 to-blue-400 rounded-full"><BrainCircuit size={20} className="text-white" /></motion.div><span className="text-gray-800 font-semibold text-sm">AI Processing...</span></div>)}
              {transcript && (<p className="text-sm text-gray-500 max-w-md text-center pt-2 border-t border-gray-200/80 mt-2">{transcript}</p>)}
            </motion.div>
          ) : (
            <motion.div key="toolbar-desktop" initial={{ opacity: 0, y: -20, scale: .95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: .95 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="flex items-center gap-3 bg-white/95 backdrop-blur-xl p-3 rounded-2xl shadow-2xl">
              <ToolButton label="Navigate" icon={Move} active={currentTool === 'move'} onClick={() => actions.setCurrentTool('move')} disabled={isUploading} />
              <ToolButton label="Draw" icon={Pen} active={currentTool === 'pen'} onClick={() => actions.setCurrentTool('pen')} disabled={isUploading} />
              <ToolButton label="Erase" icon={Eraser} active={currentTool === 'eraser'} onClick={() => actions.setCurrentTool('eraser')} disabled={isUploading} />
              <ToolButton label="Text" icon={Type} active={currentTool === 'text'} onClick={() => actions.setCurrentTool('text')} disabled={isUploading} />
              <div className="w-px h-6 bg-gray-200 mx-1" />
              <ToolButton label="Process Drawing" icon={Group} onClick={handleProcessDrawing} disabled={isUploading} />
              <ToolButton label="Upload PDF" icon={File} onClick={() => pdfInputRef.current?.click()} disabled={isUploading} />
              <ToolButton label="Upload image" icon={Image} onClick={() => imageInputRef.current?.click()} disabled={isUploading} />
              <ToolButton label="Download" icon={Download} onClick={handleDownload} disabled={isUploading} />
              <ToolButton label="Clear Canvas" icon={Trash2} onClick={handleClearCanvas} disabled={isUploading} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Tool Options (should be above menu button on the left) */}
      <div className="md:hidden fixed bottom-24 left-4 z-50 flex flex-col items-start gap-2">
        <AnimatePresence>
          {isToolOptionsOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="mb-2 grid grid-cols-4 gap-2 bg-white/95 backdrop-blur-xl p-3 rounded-2xl shadow-2xl w-64"
            >
              <MobileToolOptions />
            </motion.div>
          )}
        </AnimatePresence>
        <MobileOptionsToggle onClick={() => setIsToolOptionsOpen(prev => !prev)} />
      </div>

      {/* Mobile Toolbar & AI State */}
      <div className="md:hidden fixed bottom-4 left-4 z-50">
        <AnimatePresence>
          {aiState === 'idle' && (
            <div className="relative">
              <AnimatePresence>
                {isMenuOpen && (
                  <motion.div
                    key="toolbar-mobile-expanded"
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="absolute bottom-full mb-3 flex flex-wrap justify-center gap-2 bg-white/95 backdrop-blur-xl p-3 rounded-2xl shadow-2xl w-56"
                  >
                    <ToolButton label="Navigate" icon={Move} active={currentTool === 'move'} onClick={() => { actions.setCurrentTool('move'); setIsMenuOpen(false); }} disabled={isUploading} />
                    <ToolButton label="Draw" icon={Pen} active={currentTool === 'pen'} onClick={() => { actions.setCurrentTool('pen'); setIsMenuOpen(false); }} disabled={isUploading} />
                    <ToolButton label="Erase" icon={Eraser} active={currentTool === 'eraser'} onClick={() => { actions.setCurrentTool('eraser'); setIsMenuOpen(false); }} disabled={isUploading} />
                    <ToolButton label="Text" icon={Type} active={currentTool === 'text'} onClick={() => { actions.setCurrentTool('text'); setIsMenuOpen(false); }} disabled={isUploading} />
                    <ToolButton label="Process Drawing" icon={Group} onClick={() => { handleProcessDrawing(); setIsMenuOpen(false); }} disabled={isUploading} />
                    <ToolButton label="Upload PDF" icon={File} onClick={() => { pdfInputRef.current?.click(); setIsMenuOpen(false); }} disabled={isUploading} />
                    <ToolButton label="Upload image" icon={Image} onClick={() => { imageInputRef.current?.click(); setIsMenuOpen(false); }} disabled={isUploading} />
                    <ToolButton label="Download" icon={Download} onClick={() => { handleDownload(); setIsMenuOpen(false); }} disabled={isUploading} />
                    <ToolButton label="Clear Canvas" icon={Trash2} onClick={() => { handleClearCanvas(); setIsMenuOpen(false); }} disabled={isUploading} />
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.button
                key="toolbar-mobile"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                whileTap={{ scale: 0.9 }}
                className="p-4 rounded-full bg-white/95 backdrop-blur-xl shadow-2xl"
              >
                <GripVertical size={28} className="text-gray-700" />
              </motion.button>
            </div>
          )}
        </AnimatePresence>
      </div>
      <div className="md:hidden fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
        <AnimatePresence>
          {aiState !== 'idle' && (
            <motion.div key="indicator-mobile" initial={{ opacity: 0, y: 20, scale: .95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: .95 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="flex flex-col items-center gap-2 px-6 py-3 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl">
              {aiState === 'listening' ? (<div className="flex items-center gap-3"><motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="p-2 bg-red-500 rounded-full"><Mic size={20} className="text-white" /></motion.div><span className="text-gray-800 font-semibold text-sm">Listening...</span></div>) : (<div className="flex items-center gap-3"><motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="p-2 bg-gradient-to-br from-blue-500 to-blue-400 rounded-full"><BrainCircuit size={20} className="text-white" /></motion.div><span className="text-gray-800 font-semibold text-sm">AI Processing...</span></div>)}
              {transcript && (<p className="text-sm text-gray-500 max-w-xs text-center pt-2 border-t border-gray-200/80 mt-2">{transcript}</p>)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>


      <AnimatePresence><ToolOptionsPanel /></AnimatePresence>


      <div className="fixed bottom-4 right-4 z-50">
        <AnimatePresence mode="wait">
          {aiState === 'listening' ? (
            <motion.button
              key="listening"
              onClick={stopListening}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, backgroundColor: '#ef4444' }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              disabled={isUploading}
              className="p-5 rounded-full text-white shadow-2xl shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Stop Recording"
            >
              <Square size={28} fill="white" />
            </motion.button>
          ) : (
            <motion.button
              key="idle"
              onClick={startListening}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              disabled={isUploading || aiState !== 'idle'}
              className="p-5 rounded-full bg-gradient-to-br from-blue-500 to-blue-400 text-white shadow-2xl shadow-blue-500/30 transition-transform duration-200 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Click to Talk"
            >
              <Mic size={28} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <Stage ref={stageRef} width={window.innerWidth} height={window.innerHeight} onMouseDown={handleMouseDown} onMouseMove={handleThrottledMouseMove} onMouseUp={handleMouseUp} onTouchStart={handleMouseDown} onTouchMove={handleThrottledMouseMove} onTouchEnd={handleMouseUp} onWheel={handleWheel} draggable={currentTool === 'move' && !selectedElementId} onDragEnd={(e) => { if (isPanning.current) setStagePos(e.target.position()) }} scaleX={stageScale} scaleY={stageScale} x={stagePos.x} y={stagePos.y}>
        <GridLayer />
        <Layer>
          {lines.map((ln) => (<Line key={ln.id} points={ln.points} stroke={ln.color} strokeWidth={ln.thickness} tension={0.5} lineCap="round" lineJoin="round" globalCompositeOperation={ln.tool === 'eraser' ? 'destination-out' : 'source-over'} />))}
          {elements.map((el) => (<KonvaElement key={el.id} element={el} currentTool={currentTool} editingElementId={editingElementId} />))}
          <Transformer ref={(node) => { if (node) { const stage = node.getStage(); const selectedNode = stage?.findOne('#' + selectedElementId); node.nodes(selectedNode ? [selectedNode] : []); node.getLayer()?.batchDraw(); } }} boundBoxFunc={(oldBox, newBox) => (newBox.width < 10 || newBox.height < 10 ? oldBox : newBox)} borderStroke="#3b82f6" anchorStroke="#3b82f6" anchorFill="#fff" anchorSize={10} rotateAnchorOffset={24} borderStrokeWidth={2} />
        </Layer>
      </Stage>

      {editingElement && editingElement.type === 'text' && (
        <textarea ref={textAreaRef} value={editingText} onChange={(e) => setEditingText(e.target.value)} onBlur={handleTextareaBlur} onKeyDown={handleTextareaKeyDown} style={{ position: 'absolute', top: editingElement.y * stageScale + stagePos.y - 4, left: editingElement.x * stageScale + stagePos.x - 4, width: 'auto', minWidth: (editingElement.fontSize || 24) * 2, height: 'auto', fontSize: (editingElement.fontSize || 24) * (editingElement.scaleY || 1) * stageScale, lineHeight: 1.4, fontFamily: 'Inter, system-ui, sans-serif', border: 'none', background: 'transparent', outline: 'none', padding: '4px', color: editingElement.fill, resize: 'none', transformOrigin: 'top left', transform: `rotate(${editingElement.rotation || 0}deg)`, zIndex: 1000 }} />
      )}
    </div>
  );
};

export default TutorLM;

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    grammars: any;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    serviceURI: string;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((this: SpeechRecognition, ev: any) => any) | null;
    onerror: ((this: SpeechRecognition, ev: any) => any) | null;
    onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  }
  const SpeechRecognition: {
    prototype: SpeechRecognition;
    new(): SpeechRecognition;
  };
}

export { };