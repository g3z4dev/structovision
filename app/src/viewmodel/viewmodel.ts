import EventEmitter2 from "eventemitter2";
import { Structogram, StructogramIssue } from "../model/structogram";
import { StructogramBuilder } from "./structogrambuilder";
import { StructogramRunner } from "./structogramrunner";
import { Translator } from "./dictionary";

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

    private translateElementsIn(element: ParentNode) {
        [...element.querySelectorAll(".t-translatable")].filter(elem => elem instanceof HTMLElement).forEach(e => Translator.getDictionary().translateElement(e));
    }

    constructor(structogram: Structogram) {
        this.structogram = structogram;
        this.structogramBuilder = new StructogramBuilder(this.structogram);
        this.structogramRunner = new StructogramRunner(this.structogram);
        this.structogramBuilder.updateHTML();
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
                            this.translateElementsIn(node);
                        }
                    }
                }
            }
        });
        observer.observe(document, {"childList": true, "subtree": true});
        window.addEventListener("load", () => {
            this.translateElementsIn(document);
        });
    }

    public begin() {
        requestAnimationFrame(timestamp => this.runFrame(timestamp));
    }

    private lastTimestamp = -1;

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