// --- Web Audio API Unlock Pattern for iOS/Chrome ---
let globalAudioContext: AudioContext | null = null;
let audioContextUnlocked = false;

export function getAudioContext(): AudioContext {
    if (!globalAudioContext) {
        globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return globalAudioContext;
}

export function unlockAudioContext(): void {
    const ctx = getAudioContext();
    if (audioContextUnlocked) return;
    // Resume if suspended
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
    // Generate a short silent sound to unlock
    const osc = ctx.createOscillator();
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    audioContextUnlocked = true;
}

/**
 * Plays audio from a base64 data URL.
 * Returns a Promise that resolves when the audio has finished playing.
 * @param audioDataUrl The base64 data URL (e.g., "data:audio/wav;base64,...") to be played.
 */
export async function speakText(audioDataUrl: string): Promise<void> {
    if (!audioDataUrl) {
        return Promise.resolve();
    }

    // Extract base64 and mime type
    const match = audioDataUrl.match(/^data:(audio\/[a-zA-Z0-9\-+.]+);base64,(.*)$/);
    if (!match) {
        console.error("Invalid audio data URL format");
        return Promise.resolve();
    }
    const base64 = match[2];
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    const ctx = getAudioContext();
    // Resume context if needed
    if (ctx.state === 'suspended') {
        await ctx.resume();
    }

    return new Promise((resolve) => {
        ctx.decodeAudioData(bytes.buffer.slice(0), (buffer) => {
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.onended = () => resolve();
            source.start();
        }, (err) => {
            console.error("Error decoding audio data:", err);
            resolve();
        });
    });
}

// Fallback: legacy unlock for <audio> element (still useful for some Android devices)
let audioUnlocked = false;
export function unlockAudioOnMobile(): void {
    if (audioUnlocked) return;
    audioUnlocked = true;
    // 1-second silent WAV
    const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");
    audio.play().catch(() => { });
}