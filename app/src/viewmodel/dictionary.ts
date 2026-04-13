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

    public translateElement(element: HTMLElement | SVGElement) {
        const key = element.dataset["trkey"]!;
        element.textContent = this.translate(key);
    }

    public translate(key: string): string {
        return this.textDictionary[key] ?? key;
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
        "title_memory": "Memory",
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
        "structogram-width": "Width",
        "structogram-print": "print",
        "structogram-step": "by",
        "view-settings": "View Settings",
        "error_specification_input_missing": "Missing inputs!",
        "error_specification_duplicate": "Duplicate key in data specification is not allowed!",
        "error_specification_input_type": "Wrong type returned by statement given to input data!",
        "error_undefined_variable": "Variable is not defined in memory!",
        "error_no_field": "Specified field(s) of the given object does not exist!",
        "error_type": "Type violation!",
        "error_query_field": "Specified field of the given object cannot be set!",
        "error_constant": "Constant variable cannot be set!",
        "error_array_heterogeneous": "Arrays cannot be heterogeneous!",
        "error_token_return": "Result of the statement cannot be identified!",
        "error_empty_statement": "Cannot parse empty statement!",
        "error_postfix": "Statement cannot end with an operator! Postfix operators do not exist!",
        "error_undecidable_operator_type": "Cannot decide the type of an operator! Invalid order of tokens!",
        "error_operator_type_mismatch": "Operator type mismatch!",
        "error_missing_opening_bracket": "At least one closing bracket is missing its opening bracket!",
        "error_missing_closing_bracket": "At least one opening bracket is missing its closing bracket!",
        "error_ambigous_result": "Statement result is ambigous! Multiple results!",
        "error_numeric_result_mismatch": "Numeric statement expects to receive a number as its result!",
        "error_char_result_mismatch": "Char statement expects to receive a char as its result!",
        "error_string_result_mismatch": "String statement expects to receive a string as its result!",
        "error_boolean_result_mismatch": "Boolean statement expects to receive a boolean as its result!",
        "error_forbidden_key": "Forbidden key was used for variable definition!",
        "error_duplicate_key": "Duplicate key was used for variable definition!",
        "error_operator_location": "Operator was used at the wrong location!",
        "structogram-else": "else"
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
        "specification_aux_full": "Segédadat",
        "specification_out_full": "Kimenet",
        "new_confirm_message": "Biztos vagy benne, hogy új struktogramot akarsz? Ezt nem lehet visszavonni!",
        "button_yes": "Igen",
        "button_no": "Nem",
        "button_done": "Kész",
        "variable_key": "Kulcs",
        "variable_value": "Érték",
        "variable_constant": "Konstans",
        "title_logs": "Kiírások",
        "title_memory": "Memória",
        "title_logic": "Logika",
        "title_objects": "Objektumok",
        "title_issues": "Problémák",
        "title_results": "Eredmények",
        "title_structogram_general_settings": "Struktogram Általános Beállítások",
        "option_name_key": "Kulcs",
        "option_name_value": "Érték",
        "option_name_condition": "Feltétel",
        "option_name_conditions": "Feltételek",
        "option_name_from": "Kezdőérték",
        "option_name_to": "Felsőhatár",
        "option_name_step": "Lépésérték",
        "structogram_general_settings_index": "Kezdő Index",
        "object_view_keys": "Kulcsok",
        "structogram-width": "Szélesség",
        "structogram-print": "kiír",
        "structogram-step": "növel",
        "view_settings": "Nézet Beállítások",
        "error_specification_input_missing": "Hiányzó bemenetek!",
        "error_specification_duplicate": "Kulcs újrahasználás adatok specifikációjánál nem megengedett!",
        "error_specification_input_type": "Bemeneti adatnak adott állítás visszatérési értéke nem megfelelő!",
        "error_undefined_variable": "A változó nincs definiálva a memóriában!",
        "error_no_field": "Az adott objektum keresett mezője nem létezik!",
        "error_type": "Típushiba!",
        "error_query_field": "Az adott objektum keresett mezőjét nem lehet módosítani!",
        "error_constant": "Konstans változót nem lehet módosítani!",
        "error_array_heterogeneous": "A tömbök nem lehetnek heterogének!",
        "error_token_return": "Állítás eredményét nem lehet értelmezni!",
        "error_empty_statement": "Üres állítást nem lehet értelmezni!",
        "error_postfix": "Állítás nem végződhet operátorra! Hibás operátor sorrend!",
        "error_undecidable_operator_type": "Operátor típusa nem meghatározható! Tokenek sorrendje hibás!",
        "error_operator_type_mismatch": "Operátor típushiba!",
        "error_missing_opening_bracket": "Legalább egy csukó zárójelnek hiányzik a nyitó zárójele!",
        "error_missing_closing_bracket": "Legalább egy nyitó zárójelnek hiányzik a csukó zárójele!",
        "error_ambigous_result": "Az állítás eredménye nem egyértelmű! Több eredmény!",
        "error_numeric_result_mismatch": "Számszerű állítás számszerű eredményt vár!",
        "error_char_result_mismatch": "Karakterszerű állítás karekterszerű eredményt vár!",
        "error_string_result_mismatch": "Szöveges állítás szöveges eredményt vár!",
        "error_boolean_result_mismatch": "Logikai állítás logikai eredményt vár!",
        "error_forbidden_key": "Tiltott kulcs használat a változó definíciójában!",
        "error_duplicate_key": "Foglalt kulcs használat a változó definíciójában!",
        "error_operator_location": "Rossz helyen használt operátor!",
        "structogram-else": "különben"
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
        [...element.querySelectorAll(".t-translatable")].filter(elem => elem instanceof HTMLElement || elem instanceof SVGElement).forEach(e => Translator.getDictionary().translateElement(e));
    }

    public static setupTranslation() {
        const observer = new MutationObserver((mutationList, _observer) => {
            for(const mutation of mutationList) {
                if(mutation.type == "childList") {
                    for(const node of mutation.addedNodes) {
                        if(node instanceof Element) {
                            Translator.translateElementsIn(node);
                        }
                    }
                }
            }
        });
        observer.observe(document, {"childList": true, "subtree": true});
        window.addEventListener("load", () => {
            Translator.translateElementsIn(document);
        });
        if(!localStorage["language"]) {
            localStorage["language"] = navigator.language;
            Translator.language = navigator.language as Language;
        } else {
            Translator.language = localStorage["language"]!;
        }
    }
}