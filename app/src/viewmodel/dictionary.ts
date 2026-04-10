import EventEmitter2 from "eventemitter2";

export abstract class Dictionary {
    protected abstract get typeFromTo(): Record<string, string>;
    protected abstract get textDictionary(): Record<string, string>;

    protected get typeToFrom() {
        return Object.entries(this.typeFromTo).reduce((acc, cur) => {
            acc[cur[1]!] = cur[0]!
            return acc;
        }, {} as Record<string, string>);
    }

    public translateType(type: string): string {
        Object.entries(this.typeFromTo).forEach(entry => type = type.replace(entry[0]!, entry[1]!));
        return type;
    }

    public untranslateType(type: string): string {
        Object.entries(this.typeFromTo).forEach(entry => type = type.replace(entry[1]!, entry[0]!));
        return type;
    }

    public translateElement(element: HTMLElement) {
        const key = element.dataset["trkey"]!;
        element.textContent = this.textDictionary[key] ?? key;
    }

    public abstract getFlag(): string;
}

export class EnglishDictionary extends Dictionary {
    protected override typeFromTo = {
        "number": "number",
        "char": "char",
        "boolean": "boolean",
        "array": "array",
        "string": "string",
        "s1l": "s1l",
        "s2l": "s2l",
        "btn": "btn",
    }

    protected override textDictionary = {
        "specification_in": "In",
        "specification_aux": "Aux",
        "specification_out": "Out",
        "specification_in_full": "Input",
        "specification_aux_full": "Auxiliary Data",
        "specification_out_full": "Output",
        "new_confirm_message": "Are you sure you want a new structogram? This cannot be reverted!",
        "button_yes": "Yes",
        "button_no": "No",
        "button_done": "Done",
        "variable_key": "Key",
        "variable_value": "Value",
        "variable_constant": "Constant",
        "title_logs": "Logs",
        "title_logic": "Logic",
        "title_objects": "Objects",
        "title_issues": "Issues",
        "title_results": "Results",
        "title_structogram_general_settings": "Structogram General Settings",
        "option_name_key": "Key",
        "option_name_value": "Value",
        "option_name_condition": "Condition",
        "option_name_conditions": "Conditions",
        "option_name_from": "From",
        "option_name_to": "To",
        "option_name_step": "Step",
        "structogram_general_settings_index": "Starting Index",
        "object_view_keys": "Keys",
        "structogram-width": "Width"
    }

    public override getFlag(): string {
        return "en_flag.png"
    }
}

export class HungarianDictionary extends Dictionary {
    protected override typeFromTo = {
        "number": "szám",
        "char": "karakter",
        "boolean": "logikai",
        "array": "tömb",
        "string": "szöveg",
        "s1l": "s1l",
        "s2l": "s2l",
        "btn": "btn",
    }

    protected override textDictionary = {
        "specification_in": "Be",
        "specification_aux": "SA",
        "specification_out": "Ki",
        "specification_in_full": "Bemenet",
        "specification_aux_full": "Segéd Adat",
        "specification_out_full": "Kimenet",
        "new_confirm_message": "Biztos vagy benne, hogy új struktogramot akarsz? Ezt nem lehet visszavonni!",
        "button_yes": "Igen",
        "button_no": "Nem",
        "button_done": "Kész",
        "variable_key": "Kulcs",
        "variable_value": "Érték",
        "variable_constant": "Konstans",
        "title_logs": "Kiírások",
        "title_logic": "Logika",
        "title_objects": "Objektumok",
        "title_issues": "Problémák",
        "title_results": "Eredmények",
        "title_structogram_general_settings": "Struktogram Általános Beállítások",
        "option_name_key": "Kulcs",
        "option_name_value": "Érték",
        "option_name_condition": "Feltétel",
        "option_name_conditions": "Feltételek",
        "option_name_from": "Kezdő érték",
        "option_name_to": "Felső határ",
        "option_name_step": "Lépésszám",
        "structogram_general_settings_index": "Kezdő Index",
        "object_view_keys": "Kulcsok",
        "structogram-width": "Szélesség"
    }

    public override getFlag(): string {
        return "hu_flag.png"
    }
}

export type Language = "hu" | "en";
const langToTranslation: Record<string, Dictionary> = {
    "en": new EnglishDictionary(),
    "hu": new HungarianDictionary()
}

export class Translator {
    private static _language: Language = "hu";
    private static languageButtons = document.querySelectorAll(".t-language-button") as NodeListOf<HTMLButtonElement>;
    public static readonly emitter = new EventEmitter2();
    public static readonly languageChanged = "translator.language.changed";
    public static listenerFN: () => void;

    public static set language(language: Language) {
        this._language = language;
        const oldListener = this.listenerFN;
        let nextLanguage: Language = "en";
        if(this._language == "en") {
            nextLanguage = "hu";
        } else {
            nextLanguage = "en";
        }
        this.listenerFN = () => {
            Translator.language = nextLanguage;
        }
        for(const button of this.languageButtons) {
            button.removeEventListener("click", oldListener);
            button.addEventListener("click", this.listenerFN);
            const img = button.querySelector("img") as HTMLImageElement;
            img.src = `icons/flags/${this._language}.png`;
        }
        Translator.translateElementsIn(document);
        localStorage["language"] = this._language;
        Translator.emitter.emit(Translator.languageChanged);
    }
    
    public static get language(): Language {
        return this._language;
    }
    
    public static getDictionary(): Dictionary {
        return langToTranslation[this.language]!
    }
    
    public static translateElementsIn(element: ParentNode) {
        [...element.querySelectorAll(".t-translatable")].filter(elem => elem instanceof HTMLElement).forEach(e => Translator.getDictionary().translateElement(e));
    }
}