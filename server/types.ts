export interface StoryRowData {
    sceneId: string;
    key: string;
    speaker: string;
    emotion: string;
    level: string | number;
    direction: string;
    location: string;
    innerThought: Record<string, string> | string; // JSON 객체 혹은 문자열
    narrationTone: string;
    writingStyle: string;
    introContext: string;
    model: string;
}

export interface GenerationResult {
    key: string;
    generatedText: string;
}