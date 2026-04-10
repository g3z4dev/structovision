import EventEmitter2 from "eventemitter2";
import { Structogram, StructogramIssue } from "../model/structogram";
import { StructogramBuilder } from "./structogrambuilder";
import { StructogramRunner } from "./structogramrunner";
import { Translator, type Language } from "./dictionary";

type ViewMode = "builder" | "runner";

export class ViewModel {
    public readonly structogram: Structogram;
    public readonly structogramBuilder;
    public readonly structogramRunner;
    private readonly switchToBuilderButton = document.querySelector("#switch-to-builder-button") as HTMLButtonElement;
    private readonly switchToRunnerButton = document.querySelector("#switch-to-runner-button") as HTMLButtonElement;
    protected issues: StructogramIssue[] = [];
    private _mode: ViewMode = "builder";
   
    /**
     * Determines what is shown to the user.
     * - builder: the builder view is shown
     * - runner: the runner view is shown
     */
    private set mode(mode: ViewMode) {
        if(mode == "builder") {
            this.structogram.restart();
            this.structogramBuilder.show();
            this.structogramRunner.hide();
        } else if(mode == "runner") {
            this.structogramRunner.show();
            this.structogramBuilder.hide();
        }

        this._mode = mode;
    } 

    public get mode() {
        return this._mode;
    }

    constructor(structogram: Structogram) {
        this.structogram = structogram;
        this.structogramBuilder = new StructogramBuilder(this.structogram, this);
        this.structogramRunner = new StructogramRunner(this.structogram, this);
        this.structogram.emitter.addListener(Structogram.changedEvent, () => {
            this.structogramBuilder.updateHTML();
        });
        this.switchToBuilderButton.addEventListener("click", event => {
            if(event.button == 0) {
                this.mode = "builder";
            }
        });
        this.switchToRunnerButton.addEventListener("click", event => {
            if(event.button == 0) {
                this.mode = "runner";
            }
        });
        const observer = new MutationObserver((mutationList, _observer) => {
            for(const mutation of mutationList) {
                if(mutation.type == "childList") {
                    for(const node of mutation.addedNodes) {
                        if(node instanceof HTMLElement) {
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
        this.setupPersistenceButtons();
        this.loadCache();
        this.structogramBuilder.updateHTML();
    }

    public begin() {
        requestAnimationFrame(timestamp => this.runFrame(timestamp));
    }

    private lastTimestamp = -1;

    private loadData(data: any) {
        this.structogram.loadData(data["structogram"]);
        this.structogramRunner.setInputs(data["inputs"]);
        this.structogramRunner.setObjectKeys(data["object_keys"]);
    }

    private getData() {
        const data = {
            "structogram": this.structogram.getData(),
            "inputs": this.structogramRunner.getInputs(),
            "object_keys": this.structogramRunner.getObjectKeys()
        }
        const dataJson = JSON.stringify(data);
        return dataJson;
    }
    
    private setupPersistenceButtons() {
        // https://www.javaspring.net/blog/create-and-save-a-file-with-javascript/
        const a = document.createElement("a");
        a.download="";

        for(const button of document.querySelectorAll(".t-save-button")) {
            button.addEventListener("click", () => {
                const dataJson = this.getData();
                const blob = new Blob([dataJson], {type: "application/json"});
                const url = URL.createObjectURL(blob);
                a.href = url;
                a.click();
                URL.revokeObjectURL(url);
            });
        }

        // https://stackoverflow.com/questions/16215771/how-to-open-select-file-dialog-via-js
        const input = document.createElement("input");
        input.type = "file";

        input.onchange = _ => {
            if(input.files && input.files[0]) {
                const file = input.files[0];
                const reader = new FileReader();
                reader.readAsText(file);

                reader.onload = readerEvent => {
                    if(readerEvent.target && readerEvent.target.result) {
                        try {
                            const data = JSON.parse(readerEvent.target.result as string);
                            this.loadData(data);
                        } catch (error) {
                            alert("Structogram failed to load! Invalid format!");
                            this.structogram.reset();
                        }
                    }
                }
            }
        };
        for(const button of document.querySelectorAll(".t-load-button")) {
            button.addEventListener("click", () => {
                input.click();
            });
        }
    }
    
    public loadCache() {
        const data = localStorage.getItem("lastData");
        if(data) { 
            try {
                this.loadData(JSON.parse(data));
            } catch (error) {
                alert("Cache failed to load!");
                this.structogram.reset();
            }
        }
    }

    public saveCache() {
        localStorage.setItem("lastData", this.getData());
    }

    private runFrame(timestamp: number, delta: number = 0) {
        if(this.lastTimestamp < 0) {
            this.lastTimestamp = timestamp;
        }
        if(this.mode == "builder") {
            this.structogramBuilder.runFrame(delta);
        } else {
            this.structogramRunner.runFrame(delta);
        }
        const _delta = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;
        requestAnimationFrame(timestamp => this.runFrame(timestamp, _delta));
    }
}