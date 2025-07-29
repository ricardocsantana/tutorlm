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