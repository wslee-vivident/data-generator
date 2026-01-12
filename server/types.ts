export interface BaseStoryRow {
    sceneId : string;
    model? : string;
    temperature? : number;
    [key : string] : any;
}

export interface StoryRowData extends BaseStoryRow {
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
}

export interface FullStoryRowData extends BaseStoryRow {
    character : string;
    level: string | number;
    systemKind : string;
    direction : string;
    place : string;
    location : string;
    emotions : string[];
}

export interface StoryResult {
    key: string;
    result: string;
}