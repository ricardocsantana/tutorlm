import type { KonvaEventObject } from "konva/lib/Node";
import { Text, Image as KonvaImage } from "react-konva";
import { useEffect, useState } from "react";
import { useAppStore, type CanvasElement, type Tool } from "../store/useAppStore";
import React from "react";

const useImage = (src: string | undefined): [HTMLImageElement | undefined, string] => {
    const [image, setImage] = useState<HTMLImageElement>();
    const [status, setStatus] = useState('loading');

    useEffect(() => {
        if (!src) return;

        const img = document.createElement('img');
        img.crossOrigin = 'Anonymous';
        img.src = src;

        const handleLoad = () => {
            setImage(img);
            setStatus('loaded');
        };

        const handleError = () => {
            setStatus('failed');
        };

        img.addEventListener('load', handleLoad);
        img.addEventListener('error', handleError);

        return () => {
            img.removeEventListener('load', handleLoad);
            img.removeEventListener('error', handleError);
        };
    }, [src]);

    return [image, status];
};

export const KonvaElement: React.FC<{
    element: CanvasElement;
    currentTool: Tool;
    editingElementId: string | null;
}> = React.memo(({ element, currentTool, editingElementId }) => {
    const actions = useAppStore(state => state.actions);
    const [image] = useImage(element.type === 'image' ? element.content : undefined);

    const handleSelect = () => {
        if (currentTool === 'move') {
            actions.setSelectedElementId(element.id);
        }
    };

    const handleTransformEnd = (e: KonvaEventObject<Event>) => {
        const node = e.target;
        actions.updateElement(element.id, {
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
        });
    };

    const commonProps = {
        id: element.id,
        x: element.x,
        y: element.y,
        rotation: element.rotation ?? 0,
        scaleX: element.scaleX ?? 1,
        scaleY: element.scaleY ?? 1,
        draggable: currentTool === 'move',
        onClick: handleSelect,
        onTap: handleSelect,
        onDragEnd: (e: KonvaEventObject<DragEvent>) =>
            actions.updateElement(element.id, {
                x: e.target.x(),
                y: e.target.y(),
            }),
        onTransformEnd: handleTransformEnd,
        opacity: 1,
        shadowColor: "rgba(0,0,0,0.1)",
        shadowBlur: 10,
        shadowOffset: { x: 0, y: 4 },
        shadowOpacity: 0.7,
    };

    switch (element.type) {
        case 'text':
            return (
                <Text
                    {...commonProps}
                    text={element.content}
                    fontSize={element.fontSize}
                    fontFamily="Inter, system-ui, sans-serif"
                    fill={element.fill}
                    visible={editingElementId !== element.id}
                    fontStyle={element.fontStyle || 'normal'}
                    textDecoration={element.textDecoration}
                    onDblClick={() => {
                        if (currentTool === 'move') {
                            actions.setEditingElementId(element.id);
                        }
                    }}
                />
            );
        case 'image':
            return (
                <KonvaImage
                    {...commonProps}
                    image={image}
                    width={element.width}
                    height={element.height}
                    cornerRadius={element.cornerRadius}
                />
            );
        default:
            return null;
    }
});