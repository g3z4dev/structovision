import EventEmitter2 from "eventemitter2";
import { Structogram } from "../model/structogram";
import { StructogramBuilder } from "./structogrambuilder";
import { StructogramRunner } from "./structogramrunner";

type ViewMode = "builder" | "runner";

export class ViewModel {
    private emitter: EventEmitter2 = new EventEmitter2({"maxListeners": 100});
    public structogram: Structogram = new Structogram(this.emitter);
    public readonly structogramBuilder = new StructogramBuilder(this.structogram);
    public readonly structogramRunner = new StructogramRunner(this.structogram);
    private readonly switchToBuilderButton = document.querySelector("#switch-to-builder-button") as HTMLButtonElement;
    private readonly switchToRunnerButton = document.querySelector("#switch-to-runner-button") as HTMLButtonElement;
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

    constructor() {
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
    }
}