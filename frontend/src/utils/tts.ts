let currentAudio: HTMLAudioElement | null = null;
let audioQueue: string[] = [];
let isPlaying = false;

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
    audioQueue.push(text);
    playNext();
}