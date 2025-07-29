import html2canvas from "html2canvas";
import katex from "katex";
import { marked } from "marked";
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import hljs from "highlight.js";

// ✨ --- CORRECTED & ENHANCED RENDER-TO-IMAGE FUNCTION --- ✨
interface RenderOptions {
    backgroundColor?: string;
    textColor?: string;
    padding?: string;
    borderRadius?: string;
    lineHeight?: string;
    fontSize?: string;
}

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
export default renderMarkdownToImage;