export interface StoryRowData {
    sceneId: string;
    key: string;
    speaker: string;
    emotion: string;
    level: string | number;
    direction: string;
    location: string;
    innerThought: any;
    narrationTone: string;
    writingStyle: string;
    introContext: string;
    model: string;
    temperature : number;
}

export interface StoryResult {
    key: string;
    result: string;
}