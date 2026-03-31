import {dictionary as enDictionary} from "./lang/en";
import {dictionary as huDictionary} from "./lang/hu";

export type Language = "hu" | "en";
const langToTranslation: Record<string, Record<string,string>> = {
    "en": enDictionary,
    "hu": huDictionary
}

export class Translator {
    public static language: Language = "en";
    
    public static translate(langID: string): string {
        return langToTranslation[Translator.language]![langID] ?? langID;
    }
    
    public static translateContent(elem: HTMLElement) {
        const translatables = elem.querySelectorAll(".t-translatable")! as NodeListOf<HTMLSpanElement>;
        for(const translatable of translatables) {
            translatable.textContent = Translator.translate(translatable.dataset["trkey"]!);
        }
    }
}