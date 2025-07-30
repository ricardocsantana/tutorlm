let currentAudio: HTMLAudioElement | null = null;
let audioQueue: string[] = [];
let isPlaying = false;

// Simple function to remove common Markdown syntax and emojis
function stripMarkdown(text: string): string {
    return text
        .replace(/!\[.*?\]\(.*?\)/g, "") // images
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
        .replace(/[`*_>#~\-]/g, "") // code, emphasis, headings, strikethrough, lists
        .replace(/^\s*\d+\.\s+/gm, "") // numbered lists
        .replace(/^\s*[-*+]\s+/gm, "") // bullet lists
        .replace(/^\s*>+\s?/gm, "") // blockquotes
        .replace(/\n{2,}/g, "\n") // extra newlines
        .replace(
            /([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83D[\uDE00-\uDE4F])/g,
            ""
        ) // emojis
        .trim();
}

async function playNext() {
    if (isPlaying || audioQueue.length === 0) return;
    isPlaying = true;
    const text = audioQueue.shift()!;
    const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
    });
    if (!response.ok) {
        isPlaying = false;
        playNext();
        return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    audio.play();
    audio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudio = null;
        isPlaying = false;
        playNext();
    };
}

export async function speakText(text: string) {
    const cleanText = stripMarkdown(text);
    audioQueue.push(cleanText);
    playNext();
}