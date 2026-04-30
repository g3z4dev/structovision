import { Structogram, StructogramBlock } from "../model/structogram";
import { baseRunSpeed, blockNeutralStyle, blockRunningStyle, stepActiveStyle } from "./constants";
import { StructogramRenderer } from "./structogramrenderer";
import { CameraHandler, lerp, ListWindow, parseIntoHTML, setID, setTemplateText } from "./util";
import EventEmitter2 from "eventemitter2";
import { Memory, type MemoryEntry } from "../model/memory";
import { Operator, ResolvableOperand, Statement, type Bracket } from "../model/statement";

import operatorTemplate from "../../resources/program-views/logic-view-templates/operator.html";
import operandTemplate from "../../resources/program-views/logic-view-templates/operand.html";

import inputDataEntryTemplate from "../../resources/settings/inputdataentry.html";
import { UtilityArray, UtilityObject, ValueType, type Value } from "../model/types";
import type { ViewModel } from "./viewmodel";
import { Translator } from "./dictionary";

type RunMode = "onestep" | "run" | "paused";

export class StructogramRunner extends StructogramRenderer {
    private _currentBlock: StructogramBlock | undefined;
    private _activeBlockStep: string | undefined;
    private prepared: boolean = false;
    private readonly inputDataElem = document.querySelector("#input-data") as HTMLElement;
    private previousInput = {};
    private readonly runIssueWindow = new ListWindow("issues", "issues-ok");
    private readonly runResultsWindow = new ListWindow("results", "results-ok");
    public readonly emitter = new EventEmitter2();
    public readonly timeControl = new TimeControl(this);
    public readonly programViewManager = new ProgramViewManager(this);
    private runMode: RunMode = "paused";

    /**
     * It fires when the running of the structogram is finished.
     * It has no arguments.
     */
    public static readonly runFinished = "structogramrunner.finished";

    public set currentBlock(currentBlock: StructogramBlock | undefined) {
        if(this._currentBlock) {
            const node = this.renderTarget.querySelector(`#${this.idPrefix}-${this._currentBlock.id}`);
            node?.classList.remove(...blockRunningStyle);
            node?.classList.add(...blockNeutralStyle);
            currentBlock?.emitter.removeAllListeners(StructogramBlock.activeStepChanged);
        }
        this.activeBlockStep = undefined;
        this._currentBlock = currentBlock;
        if(currentBlock) {
            const node = this.renderTarget.querySelector(`#${this.idPrefix}-${currentBlock.id}`);
            node?.classList.remove(...blockNeutralStyle);
            node?.classList.add(...blockRunningStyle);
            this.activeBlockStep = currentBlock.activeStep;
            currentBlock.emitter.addListener(StructogramBlock.activeStepChanged, step => {
                this.activeBlockStep = step;
            });
        } else {
            this.activeBlockStep = undefined;
        }
    }

    protected set activeBlockStep(step: string | undefined) {
        if(this._activeBlockStep && this.currentBlock) {
            const nonSVGChildrenContent = `#${this.idPrefix}-${this.currentBlock.id} > :not(svg) .t-step-${this._activeBlockStep}`;
            const subSVGChildrenContent = `#${this.idPrefix}-${this.currentBlock.id} >  svg.t-subsvg .t-step-${this._activeBlockStep}`;
            for(const e of this.renderTarget.querySelectorAll(`${nonSVGChildrenContent}, ${subSVGChildrenContent}`) ?? []) {
                e?.classList.remove(...stepActiveStyle);
            }
        }
        this._activeBlockStep = step;
        if(this._activeBlockStep && this.currentBlock) {
            const nonSVGChildrenContent = `#${this.idPrefix}-${this.currentBlock.id} > :not(svg) .t-step-${this._activeBlockStep}`;
            const subSVGChildrenContent = `#${this.idPrefix}-${this.currentBlock.id} >  svg.t-subsvg .t-step-${this._activeBlockStep}`;
            for(const e of this.renderTarget.querySelectorAll(`${nonSVGChildrenContent}, ${subSVGChildrenContent}`) ?? []) {
                e?.classList.add(...stepActiveStyle);
            }
        }
    }

    protected get activeBlockStep(): string | undefined {
        return this._activeBlockStep;
    }

    public get currentBlock() {
        return this._currentBlock;
    }

    /**
     * How much time one step takes in milliseconds.
     */
    public get stepLength() {
        return baseRunSpeed / this.timeControl.currentSpeedMultiplier
    }

    /**
     * A number between 0 and 1 that is 0 at the beginning of a step and 1 at the end of it.
     */
    public get animationProgress() {
        return Math.min(1, this.timeElapsed / this.stepLength);
    }

    private addInputEntry(key: string, type: ValueType) {
        const entry = parseIntoHTML(inputDataEntryTemplate);
        setTemplateText(entry, "key", `${key}: ${Translator.getDictionary().translateType(type.id)}`);
        const textField = entry.querySelector("input[type=\"text\"]") as HTMLInputElement;
        textField.addEventListener("change", () => {
            this.viewModel.saveCache();
        });
        textField.dataset["variableKey"] = key;
        this.inputDataElem.appendChild(entry);
        this.inputDataElem.classList.remove("hidden");
    }

    private getInputs(): Record<string, string> {
        return [...this.inputDataElem.querySelectorAll(".t-data") as NodeListOf<HTMLInputElement>].reduce((acc, cur) => {
            acc[cur.dataset["variableKey"]!] = cur.value;
            return acc;
        }, {} as Record<string, string>);
    }

    private setInputs(inputs: Record<string, string>) {
        const fields = this.inputDataElem.querySelectorAll(".t-data") as NodeListOf<HTMLFormElement>;
        for(const field of fields) {
            field!.value = inputs[field.dataset["variableKey"]!] ?? "";
        }
    }

    /**
     * @returns A snapshot of the inner state of the settings to be used for saving and loading.
     */
    public getData(): any {
        return {
            "inputs": this.getInputs(),
            "program_view_data": this.programViewManager.getData()
        }
    }

    /**
     * Loads data that was generated by getData.
     * @param data The data to be loaded.
     */
    public loadData(data: any) {
        this.setInputs(data["inputs"] ?? {});
        this.programViewManager.loadData(data["program_view_data"] ?? {});
    }

    constructor(structogram: Structogram, viewModel: ViewModel) {
        super(viewModel, structogram, document.querySelector("#structogram-runner")!, "runner")
        for(const [key, type] of structogram.inputData) {
            this.addInputEntry(key, type);
        }
        structogram.emitter.addListener(Structogram.inputSpecificationEvent, (key, type) => {
            this.addInputEntry(key, type);
            this.setInputs(this.previousInput);
            this.viewModel.saveCache();
        });
        structogram.emitter.addListener(Structogram.specificationClearEvent, () => {
            this.previousInput = this.getInputs();
            this.inputDataElem.textContent = "";
        });
        this.programViewManager.objectView.selectorsField.addEventListener("change", () => {
            this.viewModel.saveCache();
        })
    }

    private prepareRunning(): boolean {
        const issues = this.structogram.preRun(this.getInputs());
        if(issues.length > 0) {
            for(const issue of issues) {
                this.runIssueWindow.addEntry(issue.id + ": " + Translator.getDictionary().translate(issue.issueID));
            }
            this.restart();
            this.runIssueWindow.show();
            return false;
        }
        this.programViewManager.reset();
        this.prepared = true;
        return true;
    }

    private finishRunning() {
        this.currentBlock = undefined;
        this.prepared = false;
        for(const [key, value] of this.structogram.results) {
            this.runResultsWindow.addEntry(key + " = " + value.asString());
        }
        this.runResultsWindow.show();
        this.runMode = "paused";
        this.emitter.emit(StructogramRunner.runFinished);
    }

    public restart() {
        this.programViewManager.reset();
        this.structogram.restart();
        this.runMode = "paused";
        this.currentBlock = undefined;
        this.prepared = false;
        this.emitter.emit(StructogramRunner.runFinished);
    }

    public start() {
        this.runMode = "run";
        if(!this._step() && !this.structogram.running) {
            this.restart();
        }
    }

    public step() {
        if(this.runMode != "run") {
            this.runMode = "onestep";
            if(!this._step() && !this.structogram.running) {
                this.restart();
            }
        }
    }

    private _step(): boolean {
        this.timeElapsed = 0;
        if(!this.structogram.running) {
            if(!this.prepared) {
                if(!this.prepareRunning()) {
                    return false;
                }
            } else {
                this.finishRunning();
                return false;
            }
        }
        this.currentBlock = this.structogram.currentBlock;
        this.programViewManager.clearEffects();
        this.structogram.runStep();
        return true;
    }

    public pause() {
        this.runMode = "paused";
    }

    public override updateHTML(): void {
        super.updateHTML();
        this.restart();
    }

    private timeElapsed = 0;

    public override runFrame(delta: number) {
        super.runFrame(delta);
        this.programViewManager.render(this.animationProgress);
        if(this.runMode != "paused") {
            if(this.timeElapsed > this.stepLength) {
                if(this.runMode == "onestep") {
                    this.runMode = "paused";
                } else if(this.runMode == "run") {
                    if(!this._step()) {
                        this.runMode = "paused";
                    }
                }
            }
            this.timeElapsed += delta;
        }
    }

    public override clearSettings(): void {
        this.programViewManager.clearSettings();
    }

}

class TimeControl {
    private readonly runner: StructogramRunner;
    private readonly startButton = document.querySelector("#start-button") as HTMLButtonElement;
    private readonly pauseButton = document.querySelector("#pause-button") as HTMLButtonElement;
    private readonly stepButton = document.querySelector("#step-button") as HTMLButtonElement;
    private readonly resetButton = document.querySelector("#reset-button") as HTMLButtonElement;
    private readonly fasterButton = document.querySelector("#faster-button") as HTMLButtonElement;
    private readonly slowerButton = document.querySelector("#slower-button") as HTMLButtonElement;
    private readonly speedLabel = document.querySelector("#speed-label") as HTMLElement;
    private readonly speeds: Record<number, number> = {
        0: 0.1,
        1: 0.25,
        2: 0.5,
        3: 0.75,
        4: 1,
        5: 1.5,
        6: 2,
        7: 3,
        8: 4,
        9: 8
    }
    private _currentSpeedIndex = 4;

    private set currentSpeedIndex(currentSpeed: number) {
        if(currentSpeed < 0) currentSpeed = 0;
        if(currentSpeed > 9) currentSpeed = 9;
        this._currentSpeedIndex = currentSpeed;
        const speed = this.speeds[this._currentSpeedIndex]!;
        this.speedLabel.innerText = `${speed.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}x`;
    }

    private get currentSpeedIndex() {
        return this._currentSpeedIndex;
    }

    public get currentSpeedMultiplier(): number {
        return this.speeds[this._currentSpeedIndex] ?? 1;
    }

    constructor(runner: StructogramRunner) {
        this.runner = runner;
        this.setupButtons();
    }

    private setupButtons() {
        this.startButton.addEventListener("click", () => {
            this.startButton.classList.add("hidden");
            this.pauseButton.classList.remove("hidden");
            this.runner.start();
        });
        this.pauseButton.addEventListener("click", () => {
            this.startButton.classList.remove("hidden");
            this.pauseButton.classList.add("hidden");
            this.runner.pause();
        });
        this.runner.emitter.on(StructogramRunner.runFinished, () => {
            this.startButton.classList.remove("hidden");
            this.pauseButton.classList.add("hidden");
        });
        this.stepButton.addEventListener("click", () => {
            this.runner.step();
        });
        this.resetButton.addEventListener("click", () => {
            this.runner.restart();
        });
        this.slowerButton.addEventListener("click", () => {
            this.currentSpeedIndex -= 1;
        });
        this.fasterButton.addEventListener("click", () => {
            this.currentSpeedIndex += 1;
        });
    }
}

class ProgramViewSettings {
    private readonly viewManager: ProgramViewManager;
    private readonly settingWindow = document.querySelector("#view-settings") as HTMLElement;
    private readonly settingsButton = document.querySelector("#view-settings-button") as HTMLButtonElement;
    private readonly settingsDoneButton = document.querySelector("#view-settings-done") as HTMLButtonElement;
    private readonly outputVisibleInput = this.settingWindow.querySelector("#view-settings-logs-visible") as HTMLInputElement;
    private readonly memoryVisibleInput = this.settingWindow.querySelector("#view-settings-memory-visible") as HTMLInputElement;
    private readonly logicVisibleInput = this.settingWindow.querySelector("#view-settings-logic-visible") as HTMLInputElement;
    private readonly objectsVisibleInput = this.settingWindow.querySelector("#view-settings-objects-visible") as HTMLInputElement;

    constructor(viewModel: ViewModel, viewManager: ProgramViewManager) {
        this.viewManager = viewManager;
        this.settingsDoneButton.addEventListener("click", () => {
            this.hide();
            viewModel.saveCache();
        });
        this.settingsButton.addEventListener("click", () => {
            this.show();
        });

        function setupInput(input: HTMLInputElement, programView: ProgramView) {
            input.addEventListener("change", () => {
                programView.setVisibility(input.checked);
            });
        }

        setupInput(this.outputVisibleInput, viewManager.outputView);
        setupInput(this.memoryVisibleInput, viewManager.memoryView);
        setupInput(this.logicVisibleInput, viewManager.logicView);
        setupInput(this.objectsVisibleInput, viewManager.objectView);
    }

    /**
     * @returns A snapshot of the inner state of the settings to be used for saving and loading.
     */
    public getData(): any {
        return {
            "output_visible": this.outputVisibleInput.checked,
            "memory_visible": this.memoryVisibleInput.checked,
            "logic_visible": this.logicVisibleInput.checked,
            "objects_visible": this.objectsVisibleInput.checked
        }
    }

    /**
     * Loads data that was generated by getData.
     * @param data The data to be loaded.
     */
    public loadData(data: any) {
        function load(input: HTMLInputElement, view: ProgramView, key: string) {
            input.checked = data[key] ?? true;
            view.setVisibility(input.checked);
        }
        load(this.outputVisibleInput, this.viewManager.outputView, "output_visible");
        load(this.memoryVisibleInput, this.viewManager.memoryView, "memory_visible");
        load(this.logicVisibleInput, this.viewManager.logicView, "logic_visible");
        load(this.objectsVisibleInput, this.viewManager.objectView, "objects_visible");
    }

    public show() {
        this.settingWindow.classList.remove("hidden");
    }

    public hide() {
        this.settingWindow.classList.add("hidden");
    }

    public clear() {
        this.outputVisibleInput.checked = true;
        this.memoryVisibleInput.checked = true;
        this.logicVisibleInput.checked = true;
        this.objectsVisibleInput.checked = true;
    }
}

class ProgramViewManager {
    public readonly outputView: OutputView;
    public readonly memoryView: MemoryView;
    public readonly logicView: LogicView;
    public readonly objectView: ObjectView;
    private readonly settings: ProgramViewSettings;

    constructor(runner: StructogramRunner) {
        this.outputView = new OutputView(runner);
        this.memoryView = new MemoryView(runner);
        this.logicView = new LogicView(runner);
        this.objectView = new ObjectView(runner);
        this.settings = new ProgramViewSettings(runner.viewModel, this);
    }

    /**
     * @returns A snapshot of the inner state of the settings to be used for saving and loading.
     */
    public getData() {
        return {
            "settings": this.settings.getData(),
            "object_keys": this.objectView.selectors
        }
    }

    /**
     * Loads data that was generated by getData.
     * @param data The data to be loaded.
     */
    public loadData(data: any) {
        this.settings.loadData(data["settings"] ?? {});
        this.objectView.selectorsField.value = (data["object_keys"] ?? []).join(",");
    }

    public clearEffects() {
        this.outputView.clearEffects();
        this.memoryView.clearEffects();
        this.logicView.clearEffects();
        this.objectView.clearEffects();
    }

    public reset() {
        this.clearEffects();
        this.outputView.reset();
        this.memoryView.reset();
        this.logicView.reset();
        this.objectView.reset();
    }

    public render(progress: number) {
        this.objectView.render(progress);
    }

    public clearSettings() {
        this.reset();
        this.objectView.clearSettings();
        this.settings.clear();
    }
}

abstract class ProgramView {
    protected viewElem: HTMLElement;
    protected runner: StructogramRunner;

    constructor(viewElem: HTMLElement, runner: StructogramRunner) {
        this.viewElem = viewElem;
        this.runner = runner;
    }

    public abstract reset(): void;

    public getElement(): HTMLElement {
        return this.viewElem;
    }

    public clearEffects() {

    }

    /**
     * Changes the visibility of the view.
     * @param visibility If true the view is visible, if false the view is hidden.
     */
    public setVisibility(visibility: boolean) {
        if(visibility) {
            this.viewElem.classList.remove("hidden");
        } else {
            this.viewElem.classList.add("hidden");
        }
    }

    public clearSettings() {

    }
}

class OutputView extends ProgramView {
    private logsElem = this.viewElem.querySelector(".t-logs") as HTMLElement;
    private logTemplateElem = this.viewElem.querySelector("p.t-log-template")!.cloneNode() as HTMLElement;

    constructor(runner: StructogramRunner) {
        super(document.querySelector("#output-view")!, runner);
        this.reset();
        this.runner.structogram.emitter.addListener(Structogram.printEvent, msg => {
            const log = this.logTemplateElem.cloneNode() as HTMLElement;
            log.textContent = msg;
            this.logsElem.appendChild(log);
        });
    }


    public override reset() {
        this.logsElem.textContent = "";
    }
}

class MemoryView extends ProgramView {
    private memoryViewEntriesElem = this.viewElem.querySelector(".t-memory-entries") as HTMLElement;
    private memoryTemplateElem = this.viewElem.querySelector(".t-memory-template")!.cloneNode(true) as HTMLElement;
    private readonly changedStyle = ["bg-orange-600"];
    private readonly accessedStyle = ["bg-green-600"];
    private valueIDToMemoryKey: Record<string, string> = {};
    private changedElems: HTMLElement[] = [];
    private accessedElems: HTMLElement[] = [];

    private addEntry(entry: MemoryEntry) {
        const memoryEntry = this.memoryTemplateElem.cloneNode(true) as HTMLElement;
        setTemplateText(memoryEntry, "memory-key", entry.key);
        setTemplateText(memoryEntry, "memory-value", entry.value.asString());
        setTemplateText(memoryEntry, "memory-constant", entry.constant.toString());
        setID(memoryEntry, `v-${entry.key}`);
        this.memoryViewEntriesElem.appendChild(memoryEntry);
    }

    private onVariableDeclared(entry: MemoryEntry) {
        this.valueIDToMemoryKey[entry.value.id] = entry.key;
        this.addEntry(entry);
    }

    private onVariableChanged(key: string, prevValue: Value, value: Value) {
        if(prevValue.id in this.valueIDToMemoryKey && prevValue.id != value.id) delete this.valueIDToMemoryKey[prevValue.id];
        this.valueIDToMemoryKey[value.id] = key;
        const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${key}`) as HTMLElement;
        setTemplateText(memoryEntry, "memory-value", value.asString());
        this.changedElems.push(memoryEntry);
        memoryEntry.classList.add(...this.changedStyle);
    }

    private onVariableAccessed(key: string) {
        const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${key}`) as HTMLElement;
        this.accessedElems.push(memoryEntry);
        memoryEntry.classList.add(...this.accessedStyle);
    }

    private onArrayElementChanged(array: UtilityArray) {
        const key = this.valueIDToMemoryKey[array.id];
        if(key) {
            const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${key}`) as HTMLElement;
            setTemplateText(memoryEntry, "memory-value", array.asString());
            this.changedElems.push(memoryEntry);
            memoryEntry.classList.add(...this.changedStyle);
        }
    }

    constructor(runner: StructogramRunner) {
        super(document.querySelector("#memory-view")!, runner);
        this.reset();

        const memory = this.runner.structogram.memory;

        memory.emitter.addListener(Memory.variableDeclaredEvent, (entry: MemoryEntry) => this.onVariableDeclared(entry));

        memory.emitter.addListener(Memory.variableChangedEvent, (key: string, prevValue: Value, value: Value) => this.onVariableChanged(key, prevValue, value));

        memory.emitter.addListener(Memory.variableAccessedEvent, (key: string) => this.onVariableAccessed(key));

        UtilityArray.emitter.on(UtilityArray.elementChanged, (array: UtilityArray) => this.onArrayElementChanged(array));
    }

    private clearStyle(elem: HTMLElement, styles: string[]) {
        for(const style of styles) {
            if(elem.classList.contains(style)) {
                elem.classList.remove(style);
            }
        }
    }

    public override clearEffects(): void {
        const memory = this.runner.structogram.memory;
        for(const entry of memory.entries) {
            const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${entry.key}`) as HTMLElement;
            this.clearStyle(memoryEntry, this.changedStyle);
            this.clearStyle(memoryEntry, this.accessedStyle);
        }
    }

    public reset(): void {
        this.memoryViewEntriesElem.textContent = "";
        const memory = this.runner.structogram.memory;
        for(const entry of memory.entries) {
            this.addEntry(entry);
        }
    }
}

class LogicView extends ProgramView {
    private logicElem = this.viewElem.querySelector(".t-logic") as HTMLElement;
    private operandTemplateElem = parseIntoHTML(operandTemplate) as HTMLElement;
    private operatorTemplateElem = parseIntoHTML(operatorTemplate) as HTMLElement;
    private arrayDepth: number = 0;

    private addOperator(operator: Operator | string) {
        const elem = this.operatorTemplateElem.cloneNode(true) as HTMLElement;
        if(operator instanceof Operator) {
            setTemplateText(elem, "representation", operator.token);
        } else {
            setTemplateText(elem, "representation", operator);
        }
        this.logicElem.appendChild(elem);
    }

    private addOperand(operand: ResolvableOperand | string) {
        const elem = this.operandTemplateElem.cloneNode(true) as HTMLElement;
        if(operand instanceof ResolvableOperand) {
            setTemplateText(elem, "representation", operand.representation);
            setTemplateText(elem, "value", operand.resolve().asString());
        } else {
            setTemplateText(elem, "representation", "");
            setTemplateText(elem, "value", operand);
        }
        this.logicElem.appendChild(elem);
    }

    private onEvaluationStart(statement: Statement<any>, statementTokens: (ResolvableOperand | Operator | Bracket)[]) {
        if(statement.returnType.baseIdentifier == "array") {
            this.arrayDepth++;
            this.addOperator("{");
        } else {
            for(const token of statementTokens) {
                if(token instanceof ResolvableOperand) {
                    this.addOperand(token);
                } else {
                    this.addOperator(token);
                }
            }
        }
    }

    private onEvaluationEnd(statement: Statement<any>, result: Value) {
        if(statement.returnType.baseIdentifier == "array") {
            this.arrayDepth--;
            this.addOperator("}");
        } else {
            this.addOperator("->");
            this.addOperand(result.asString());
            if(this.arrayDepth > 0) {
                this.addOperator(",");
            }
        }
    }

    constructor(runner: StructogramRunner) {
        super(document.querySelector("#logic-view")!, runner);
        this.reset();
        Statement.emitter.on(Statement.evaluationStart, (statement: Statement<any>, statementTokens: (ResolvableOperand | Operator | Bracket)[]) => this.onEvaluationStart(statement, statementTokens));
        Statement.emitter.on(Statement.evaluationEnd, (statement: Statement<any>, result: Value) => this.onEvaluationEnd(statement, result));
    }

    public clearEffects(): void {
        this.reset();
    }

    public override reset(): void {
        this.logicElem.textContent = "";
    }
}

function getTextWidth(canvas: HTMLCanvasElement, text: string) {
    return canvas.getContext("2d")!.measureText(text).width;
}

abstract class ObjectRenderer<T extends NodeRenderData> {
    protected nodeRegistry: Record<string, T> = {};
    protected objectCanvas: HTMLCanvasElement;
    protected objectBaseIdentifier: string;
    protected allObjectsByMemoryKey: Record<string, Value> = {};
    protected allObjectsByID: Record<string, Value> = {};
    protected idToMemoryKey: Record<string, Set<string>> = {};
    protected memory: Memory;
    protected selectors: string[];
    private _height = 0;
    private _y = 0;
    private objectReloadQueued = false;
    public get y() {
        return this._y;
    };
    public set y(y: number) {
        if(this._y != y) {
            this._y = y;
            this.reloadObjects();
        }
    };
    protected get nodes() {
        return Object.values(this.nodeRegistry);
    }

    public static readonly emitter = new EventEmitter2();

    /**
     * It fires when the height of the renderer changes.
     * It has no arguments.
     */
    public static readonly heightChanged = "objectrenderer.heightchange";

    public get height() {
        return this._height;
    }

    protected set height(height: number) {
        this._height = height;
        ObjectRenderer.emitter.emit(ObjectRenderer.heightChanged);
    }

    protected get selectedObjects(): Value[] {
        return this.selectedObjectsWithKey.map(e => e[1]!) as Value[];
    }

    protected get selectedObjectsWithKey(): [string, Value][] {
        return Object.entries(this.allObjectsByMemoryKey).filter(e => this.selectors.includes(e[0]!)) as [string, Value][];
    }

    /**
     * @param objectCanvas The canvas where the object will be rendered on.
     * @param objectBaseIdentifier The base type identifier of the objects it will render.
     * @param selectors The memory keys of the objects it will render.
     * @param memory The memory the objects are part of.
     */
    constructor(objectCanvas: HTMLCanvasElement, objectBaseIdentifier: string, selectors: string[], memory: Memory) {
        this.objectCanvas = objectCanvas;
        this.objectBaseIdentifier = objectBaseIdentifier;
        this.selectors = selectors;
        this.memory = memory;
        this.reset();
        this.reloadObjects();
        this.setupListeners();
        this.setupAccessEffectHandling();
    }

    private onVariableChanged(key: string, value: Value) {
        const prevValue = this.allObjectsByMemoryKey[key];
        if(value.type.baseIdentifier == this.objectBaseIdentifier) {
            this.allObjectsByMemoryKey[key] = value;
            if(value.type.isDefined()) {
                this.allObjectsByID[value.id] = value;
                if(value.id in this.idToMemoryKey) {
                    this.idToMemoryKey[value.id]!.add(key);
                } else {
                    this.idToMemoryKey[value.id] = new Set([key]);
                }
            }
            this.objectReloadQueued = true;
        }
        if(prevValue) {
            if(prevValue.id in this.idToMemoryKey) {
                this.idToMemoryKey[prevValue.id]!.delete(key);
            }
        }
    }

    private onObjectFieldChanged(object: UtilityObject, value: Value) {
        if(value.type.baseIdentifier == this.objectBaseIdentifier) {
            this.allObjectsByID[value.id] = value;
        }
        if(object.type.baseIdentifier == this.objectBaseIdentifier) {
            this.objectReloadQueued = true;
        }
    }

    private onArrayElementChanged(array: UtilityArray, value: Value) {
        if(value.type.baseIdentifier == this.objectBaseIdentifier) {
            this.allObjectsByID[value.id] = value;
        }
        if(array.type.baseIdentifier == this.objectBaseIdentifier) {
            this.objectReloadQueued = true;
        }
    }

    private onArrayElementsSwapped(array: UtilityArray) {
        if(array.type.baseIdentifier == this.objectBaseIdentifier) {
            this.objectReloadQueued = true;
        }
    }

    private setupListeners() {
        this.memory.emitter.on(Memory.variableChangedEvent, (key: string, _prevValue: Value, value: Value) => this.onVariableChanged(key, value));
        UtilityObject.emitter.addListener(UtilityObject.fieldChanged, (object: UtilityObject, _key: string, value: Value) => this.onObjectFieldChanged(object, value));
        UtilityArray.emitter.addListener(UtilityArray.elementChanged, (array: UtilityArray, _idx: number, value: Value) => this.onArrayElementChanged(array, value));
        UtilityArray.emitter.addListener(UtilityArray.elementSwapped, (array: UtilityArray) => this.onArrayElementsSwapped(array));
    }

    public updateSelectors(selectors: string[]) {
        this.selectors = [...selectors];
        this.reloadObjects();
    }

    /**
     * Reloads the list of rendered objects,
     */
    public abstract reloadObjects(): void;

    /**
     * Renders the animation for the objects.
     * @param progress A number between 0 and 1. 0 is the start of the step and 1 is the end of it.
     */
    public render(progress: number): void {
        if(this.objectReloadQueued) {
            this.reloadObjects();
            this.objectReloadQueued = false;
        }
    }

    public reset() {
        this.idToMemoryKey = {};
        this.allObjectsByMemoryKey = this.memory.getAllValuesWithBaseIdentifier(this.objectBaseIdentifier).reduce((acc, cur) => {
            acc[cur.key] = cur.value;
            this.idToMemoryKey[cur.value.id] = new Set([cur.key]);
            return acc;
        }, {} as Record<string, Value>);
        this.allObjectsByID = Object.values(this.allObjectsByMemoryKey).reduce((acc, cur) => {
            acc[cur.id] = cur;
            return acc;
        }, {} as Record<string, Value>);
    }

    protected setupAccessEffectHandling() {
        UtilityObject.emitter.addListener(UtilityObject.fieldAccessed, (object: UtilityObject, _fieldName: string, fieldValue: Value) => {
            if(object.type.baseIdentifier == this.objectBaseIdentifier) {
                if(fieldValue.id in this.nodeRegistry) {
                    this.nodeRegistry[fieldValue.id]!.highlighted = true;
                }
                if(object.id in this.nodeRegistry) {
                    this.nodeRegistry[object.id]!.highlighted = true;
                }
            }
        });
        UtilityObject.emitter.addListener(UtilityObject.fieldChanged, (object: UtilityObject, _fieldName: string, fieldValue: Value) => {
            if(object.type.baseIdentifier == this.objectBaseIdentifier) {
                if(fieldValue.id in this.nodeRegistry) {
                    this.nodeRegistry[fieldValue.id]!.highlighted = true;
                }
                if(object.id in this.nodeRegistry) {
                    this.nodeRegistry[object.id]!.highlighted = true;
                }
            }
        });
        UtilityArray.emitter.addListener(UtilityArray.elementAccessed, (array: UtilityArray, _idx: number, elementValue: Value) => {
            if(array.type.baseIdentifier == this.objectBaseIdentifier) {
                if(elementValue.id in this.nodeRegistry) {
                    this.nodeRegistry[elementValue.id]!.highlighted = true;
                }
                if(array.id in this.nodeRegistry) {
                    this.nodeRegistry[array.id]!.highlighted = true;
                }
            }
        });
        UtilityArray.emitter.addListener(UtilityArray.elementChanged, (array: UtilityArray, _idx: number, elementValue: Value) => {
            if(array.type.baseIdentifier == this.objectBaseIdentifier) {
                if(elementValue.id in this.nodeRegistry) {
                    this.nodeRegistry[elementValue.id]!.highlighted = true;
                }
                if(array.id in this.nodeRegistry) {
                    this.nodeRegistry[array.id]!.highlighted = true;
                }
            }
        });
        UtilityArray.emitter.addListener(UtilityArray.elementSwapped, (array: UtilityArray, idx1: number, idx2: number) => {
            if(array.type.baseIdentifier == this.objectBaseIdentifier) {
                const elem1 = array.indexGet(idx1, true);
                const elem2 = array.indexGet(idx2, true);
                if(elem1.id in this.nodeRegistry) {
                    this.nodeRegistry[elem1.id]!.highlighted = true;
                }
                if(elem2.id in this.nodeRegistry) {
                    this.nodeRegistry[elem2.id]!.highlighted = true;
                }
                if(array.id in this.nodeRegistry) {
                    this.nodeRegistry[array.id]!.highlighted = true;
                }
            }
        });
        this.memory.emitter.addListener(Memory.variableAccessedEvent, (_key: string, value: Value) => {
            if(value.type.baseIdentifier == this.objectBaseIdentifier && value.id in this.nodeRegistry) {
                this.nodeRegistry[value.id]!.highlighted = true;
            }
        });
        this.memory.emitter.addListener(Memory.variableChangedEvent, (_key: string, _prevValue: Value, value: Value) => {
            if(value.type.baseIdentifier == this.objectBaseIdentifier && value.id in this.nodeRegistry) {
                this.nodeRegistry[value.id]!.highlighted = true;
            }
        });
    }

    public clearEffects() {
        for(const node of this.nodes) {
            node.highlighted = false;
            node.finishAnimations();
        }
    }
}


function drawArrowFromTo(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2:number) {
    ctx.beginPath();
    const xlen = x2-x1;
    const ylen = y2-y1;
    const deg = Math.atan2(ylen, xlen) + Math.PI;
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + xlen/3, y1 + Math.sign(ylen)*Math.sqrt(Math.abs(ylen)/3), x1 + 2*xlen/3, y2 - Math.sign(ylen)*Math.sqrt(Math.abs(ylen)/3), x2, y2);
    ctx.lineTo(x2 + 5 * Math.cos(deg - Math.PI/4), y2 + 5 * Math.sin(deg - Math.PI/4));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 + 5 * Math.cos(deg + Math.PI/4), y2 + 5 * Math.sin(deg + Math.PI/4));
    ctx.stroke();
}

/**
 * Represents a single node to render for object renderers.
 */
abstract class NodeRenderData {
    abstract render(progress: number): void;
    protected objectCanvas: HTMLCanvasElement;
    public originX;
    public originY;
    private _targetX;
    private _targetY;
    public w;
    public h;
    private _content: string;
    public highlighted = false;
    protected readonly hightlightStyle: string = "LightBlue";

    public get content() {
        return this._content;
    }

    public set content(value: string) {
        this._content = value;
        this.w = Math.max(NodeRenderData.getNodeWidthWithContent(this.objectCanvas, this.content), NodeRenderData.getNodeWidthWithContent(this.objectCanvas, this.representation ?? ""));
    }

    private _representation: string | undefined;

    public get representation() {
        return this._representation;
    }
    public set representation(value: string | undefined) {
        this._representation = value;
        this.w = Math.max(NodeRenderData.getNodeWidthWithContent(this.objectCanvas, this.content), NodeRenderData.getNodeWidthWithContent(this.objectCanvas, this.representation ?? ""));
    }

    protected static textPadding = 4;

    public static getNodeWidthWithContent(canvas: HTMLCanvasElement, content: string) {
        return getTextWidth(canvas, content) + NodeRenderData.textPadding;
    }

    constructor(content: string, representation: string | undefined, objectCanvas: HTMLCanvasElement, x: number, y:number, h: number) {
        this._content = content;
        this._representation = representation;
        this.objectCanvas = objectCanvas;
        this.originX = x;
        this.originY = y;
        this._targetX = x;
        this._targetY = y;
        this.w = Math.max(NodeRenderData.getNodeWidthWithContent(objectCanvas, content), NodeRenderData.getNodeWidthWithContent(objectCanvas, representation ?? ""));
        this.h = h;
        this.highlighted = true;
    }

    public set targetX(targetX: number) {
        this._targetX = targetX;
    }

    public set targetY(targetY: number) {
        this._targetY = targetY;
    }

    public get targetX() {
        return this._targetX;
    }

    public get targetY() {
        return this._targetY;
    }

    public getX(t: number): number {
        if(t == 1) {
            this.finishAnimations();
        }
        return lerp(this.originX, this.targetX, t);
    }

    public getY(t: number): number {
        if(t == 1) {
            this.finishAnimations();
        }
        return lerp(this.originY, this.targetY, t);
    }

    /**
     * Forces the animation to finish.
     */
    public finishAnimations() {
        this.originX = this.targetX;
        this.originY = this.targetY;
    }

    /**
     * Draws the contents of the node and the content only.
     */
    protected drawOnlyContent(ctx: CanvasRenderingContext2D, x: number, y: number) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "black";
        ctx.fillText(this.content, x + this.w / 2, y + this.h / 2, this.w);
    }

    /**
     * Draws the contents of the node with the representation above it.
     */
    protected drawContentWithRepresentation(ctx: CanvasRenderingContext2D, x: number, y: number) {
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = "black";
        ctx.fillText(this.content, x + this.w / 2, y + this.h, this.w);
        ctx.textBaseline = "top";
        ctx.fillStyle = "gray";
        ctx.fillText("("+this.representation+")", x + this.w / 2, y, this.w);
    }

    /**
     * Draws the contents of the node.
     */
    protected drawContent(ctx: CanvasRenderingContext2D, x: number, y: number) {
        if(this.representation) {
            this.drawContentWithRepresentation(ctx, x, y);
        } else {
            this.drawOnlyContent(ctx, x, y);
        }
    }
}

class S1LRenderData extends NodeRenderData {
    public next: S1LRenderData | undefined;

    constructor(content: string, representation: string | undefined, objectCanvas: HTMLCanvasElement, x: number, y:number, h: number) {
        super(content, representation, objectCanvas, x, y, h);
        this.content = content;
        this.representation = representation;
    }

    public render(progress: number) {
        const ctx = this.objectCanvas.getContext("2d")!;
        ctx.fillStyle = this.highlighted ? this.hightlightStyle : "white";
        const x = this.getX(progress);
        const y = this.getY(progress);
        ctx.fillRect(x, y, this.w, this.h);
        this.drawContent(ctx, x, y);
        if(this.next) {
            ctx.strokeStyle = "white";
            const nextX = this.next.getX(progress);
            const nextY = this.next.getY(progress);
            drawArrowFromTo(ctx, x + this.w, y + this.h/2, nextX, nextY + this.next.h/2);
        }
    }
}

class S1LRenderer extends ObjectRenderer<S1LRenderData> {
    private readonly nodeHeight  = 20;
    private readonly nodeXSpacing = 20;
    private readonly nodeYSpacing = 20;

    constructor(objectCanvas: HTMLCanvasElement, selectors: string[], memory: Memory) {
        super(objectCanvas, "s1l", selectors, memory);
    }

    public override render(progress: number): void {
        super.render(progress);
        this.nodes.forEach(r => r.render(progress));
    }

    private findIndependentRoots() {
        const rootNodeSet = new Set<string>();
        const childNodeSet = new Set<string>();
        for(const node of this.selectedObjects as UtilityObject[]) {
            if(node.type.isUndefined()) continue;
            if(childNodeSet.has(node.id)) continue;
            rootNodeSet.add(node.id);
            let child = node.get("next", true);
            while(child.type.isDefined() && child instanceof UtilityObject) {
                if(rootNodeSet.has(child.id)) {
                    rootNodeSet.delete(child.id);
                    childNodeSet.add(child.id);
                    continue;
                }
                childNodeSet.add(child.id);
                child = child.get("next", true);
            }
        }
        return [...rootNodeSet].map(id => this.allObjectsByID[id]!) as UtilityObject[];
    }

    private createOrUpdateNodes(independentRoots: UtilityObject[]) {
        let yOffset = this.y;
        const newRegistry: Record<string, S1LRenderData> = {};
        for(const ir of independentRoots) {
            const nodes: UtilityObject[] = [];
            let n: Value = ir;
            while(n.type.isDefined() && n instanceof UtilityObject) {
                nodes.push(n);
                n = n.get("next", true);
            }

            let xOffset = 0;
            for(const node of nodes) {
                if(node.id in this.nodeRegistry) {
                    const data = this.nodeRegistry[node.id]!;
                    data.targetX = xOffset;
                    data.targetY = yOffset;
                    data.content = node.get("key", true).asString();
                    data.representation = [...this.idToMemoryKey[node.id] ?? []][0];
                    newRegistry[node.id] = data;
                } else {
                    newRegistry[node.id] = new S1LRenderData(node.get("key", true).asString(), [...this.idToMemoryKey[node.id] ?? []][0], this.objectCanvas, xOffset, yOffset, this.nodeHeight);
                    newRegistry[node.id]!.originY += this.nodeHeight;
                }
                xOffset += newRegistry[node.id]!.w + this.nodeXSpacing;
            }
            yOffset += this.nodeHeight + this.nodeYSpacing;
        }
        this.nodeRegistry = newRegistry;

        if(yOffset > this.y) {
            this.height = (yOffset-this.y)+this.nodeHeight;
        } else {
            this.height = 0;
        }
    }

    private updateLinks() {
        const allNodes = Object.entries(this.nodeRegistry);
        for(const [id, data] of allNodes) {
            const node = this.allObjectsByID[id]!;
            if(node instanceof UtilityObject) {
                const next = node.get("next", true)!;
                if(next instanceof UtilityObject) {
                    data.next = this.nodeRegistry[next.id];
                } else {
                    data.next = undefined;
                }
            }
        }
    }

    public override reloadObjects() {
        const independentRoots: UtilityObject[] = this.findIndependentRoots();
        this.createOrUpdateNodes(independentRoots);
        this.updateLinks();
    }
}

class S2LRenderData extends NodeRenderData {
    public next: S2LRenderData | undefined;
    public prev: S2LRenderData | undefined;

    constructor(content: string, representation: string | undefined, objectCanvas: HTMLCanvasElement, x: number, y:number, h: number) {
        super(content, representation, objectCanvas, x, y, h)
    }

    public render(progress: number) {
        const ctx = this.objectCanvas.getContext("2d")!;
        ctx.fillStyle = this.highlighted ? this.hightlightStyle : "white";
        const x = this.getX(progress);
        const y = this.getY(progress);
        ctx.fillRect(x, y, this.w, this.h);
        this.drawContent(ctx, x, y);
        if(this.next) {
            ctx.strokeStyle = "white";
            const nextX = this.next.getX(progress);
            const nextY = this.next.getY(progress);
            drawArrowFromTo(ctx, x + this.w, y + this.h/3, nextX, nextY + this.next.h/3);
        }
        if(this.prev) {
            ctx.strokeStyle = "white";
            const prevX = this.prev.getX(progress);
            const prevY = this.prev.getY(progress);
            drawArrowFromTo(ctx, x, y + 2*this.h/3, prevX + this.prev.w, prevY + 2*this.prev.h/3);
        }
    }
}

class S2LRenderer extends ObjectRenderer<S2LRenderData> {
    private readonly nodeHeight = 20;
    private readonly nodeXSpacing = 20;
    private readonly nodeYSpacing = 20;

    constructor(objectCanvas: HTMLCanvasElement, selectors: string[], memory: Memory) {
        super(objectCanvas, "s2l", selectors, memory);
    }

    public override render(progress: number): void {
        super.render(progress);
        this.nodes.forEach(r => r.render(progress));
    }

    private findIndependentRoots() {
        const rootNodeSet = new Set<string>();
        const childNodeSet = new Set<string>();
        for(const node of this.selectedObjects as UtilityObject[]) {
            if(node.type.isUndefined()) continue;
            if(node.get("prev", true).type.isDefined() || childNodeSet.has(node.id)) continue;
            rootNodeSet.add(node.id);
            let child = node.get("next", true);
            while(child.type.isDefined() && child instanceof UtilityObject) {
                if(rootNodeSet.has(child.id)) {
                    rootNodeSet.delete(child.id);
                    childNodeSet.add(child.id);
                    continue;
                }
                childNodeSet.add(child.id);
                child = child.get("next", true);
            }
        }
        return [...rootNodeSet].map(id => this.allObjectsByID[id]!) as UtilityObject[];
    }

    private createOrUpdateNodes(independentRoots: UtilityObject[]) {
        let yOffset = this.y;
        const newRegistry: Record<string, S2LRenderData> = {};
        const allNodes: UtilityObject[] = [];
        for(const ir of independentRoots) {
            let n: Value = ir;
            const nodes: UtilityObject[] = [];
            while(n.type.isDefined() && n instanceof UtilityObject) {
                nodes.push(n);
                n = n.get("next", true);
            }

            let xOffset = 0;

            for(const node of nodes) {
                allNodes.push(node);
                if(node.id in this.nodeRegistry) {
                    const data = this.nodeRegistry[node.id]!;
                    data.targetX = xOffset;
                    data.targetY = yOffset;
                    data.content = node.get("key", true).asString();
                    data.representation = [...this.idToMemoryKey[node.id] ?? []][0];
                    newRegistry[node.id] = data;
                } else {
                    newRegistry[node.id] = new S2LRenderData(node.get("key", true).asString(), [...this.idToMemoryKey[node.id] ?? []][0], this.objectCanvas, xOffset, yOffset, this.nodeHeight);
                    newRegistry[node.id]!.originY += this.nodeHeight;
                }
                xOffset += (newRegistry[node.id]!.w + this.nodeXSpacing);
            }

            yOffset += this.nodeHeight + this.nodeYSpacing;
        }

        if(yOffset > this.y) {
            this.height = (yOffset-this.y)+this.nodeHeight;
        } else {
            this.height = 0;
        }
        this.nodeRegistry = newRegistry;
    }

    private updateLinks() {
        const allNodes = Object.entries(this.nodeRegistry);
        for(const [id, data] of allNodes) {
            const node = this.allObjectsByID[id]!;
            if(node instanceof UtilityObject) {
                const prev = node.get("prev", true)!;
                if(prev instanceof UtilityObject) {
                    data.prev = this.nodeRegistry[prev.id];
                } else {
                    data.prev = undefined;
                }
                const next = node.get("next", true)!;
                if(next instanceof UtilityObject) {
                    data.next = this.nodeRegistry[next.id];
                } else {
                    data.next = undefined;
                }
            }
        }
    }

    public override reloadObjects() {
        const independentRoots: UtilityObject[] = this.findIndependentRoots();
        this.createOrUpdateNodes(independentRoots);
        this.updateLinks();
    }
}

class BTNRenderData extends NodeRenderData {
    public left: BTNRenderData | undefined;
    public right: BTNRenderData | undefined;

    constructor(content: string, representation: string | undefined, objectCanvas: HTMLCanvasElement, x: number, y:number, h: number) {
        super(content, representation, objectCanvas, x, y, h)
    }

    public render(progress: number) {
        const ctx = this.objectCanvas.getContext("2d")!;
        ctx.fillStyle = this.highlighted ? this.hightlightStyle : "white";
        const x = this.getX(progress);
        const y = this.getY(progress);
        ctx.fillRect(x, y, this.w, this.h);
        this.drawContent(ctx, x, y);
        if(this.left) {
            ctx.strokeStyle = "white";
            const leftX = this.left.getX(progress);
            const leftY = this.left.getY(progress);
            drawArrowFromTo(ctx, x + this.w/3, y + this.h, leftX + this.left.w/2, leftY);
        }
        if(this.right) {
            ctx.strokeStyle = "white";
            const rightX = this.right.getX(progress);
            const rightY = this.right.getY(progress);
            drawArrowFromTo(ctx, x + 2*this.w/3, y + this.h, rightX + this.right.w/2, rightY);
        }
    }
}

type TreeIndicator = "#" | "0";

class BTNRenderer extends ObjectRenderer<BTNRenderData> {
    private readonly nodeHeight = 20;
    private readonly nodeXSpacing = 20;
    private readonly nodeYSpacing = 20;

    constructor(objectCanvas: HTMLCanvasElement, selectors: string[], memory: Memory) {
        super(objectCanvas, "btn", selectors, memory);
    }

    public override render(progress: number): void {
        super.render(progress);
        this.nodes.forEach(r => r.render(progress));
    }

    private findIndependentRoots() {
        const rootNodeSet = new Set<string>();
        const childNodeSet = new Set<string>();
        for(const node of this.selectedObjects as UtilityObject[]) {
            if(node.type.isUndefined()) continue;
            if(node.get("parent", true).type.isDefined() || childNodeSet.has(node.id)) continue;
            rootNodeSet.add(node.id);
            let children = [node.get("left", true), node.get("right", true)];
            while(children.length > 0) {
                const child = children.shift();
                if(child instanceof UtilityObject) {
                    if(rootNodeSet.has(child.id)) {
                        rootNodeSet.delete(child.id);
                        childNodeSet.add(child.id);
                        continue;
                    }
                    childNodeSet.add(child.id);
                    children.push(child.get("left", true), child.get("right", true));
                }
            }
        }
        return [...rootNodeSet].map(id => this.allObjectsByID[id]!) as UtilityObject[];
    }

    /**
     * It does a level by level search of the tree to find nodes and decide their position.
     * The TreeIndicator type is used to mark the end of levels (#) and empty nodes (0).
     * The marking of empty nodes is needed for calculating the position of nodes as if it was a full tree.
     */
    private createOrUpdateNodes(independentRoots: UtilityObject[]) {
        let yOffset = this.y;
        const newRegistry: Record<string, BTNRenderData> = {};
        for(const ir of independentRoots) {
            const levels: (UtilityObject | TreeIndicator)[][] = [];
            let level: (UtilityObject | TreeIndicator)[] = [];
            let children: (UtilityObject | TreeIndicator)[] = [ir, "#"];
            let emptyTally = 0;
            let levelDepth = 0;
            while(emptyTally < 2**levelDepth) {
                const child = children.shift()!;
                if(child == "#") {
                    levels.push(level);
                    levelDepth++;
                    emptyTally = 0;
                    level = [];
                    children.push("#");
                    continue;
                } else if (child != "0") {
                    const left = child.get("left", true);
                    const right = child.get("right", true);
                    if(left.type.isUndefined()) {
                        children.push("0");
                    } else if(left instanceof UtilityObject) {
                        children.push(left);
                    }
                    if(right.type.isUndefined()) {
                        children.push("0");
                    } else if(right instanceof UtilityObject) {
                        children.push(right);
                    }
                } else {
                    emptyTally++;
                    children.push("0", "0");
                }
                level.push(child);
            }

            function calcTreeWidth(treeHeight: number, nodeWidth: number, nodeSpacing: number) {
                if(treeHeight <= 0) return 0;
                const length = 2**(treeHeight-1);
                return (length * nodeWidth + (length-1)*nodeSpacing);
            }

            let xOffset = 0;
            let maxNodeWidth = Math.max(...levels.flat().filter(n => n instanceof UtilityObject).map(n => NodeRenderData.getNodeWidthWithContent(this.objectCanvas, n.get("key", true).asString())));

            const treeHeight = levels.length;
            const treeWidth = calcTreeWidth(treeHeight, maxNodeWidth, this.nodeXSpacing);
            for(let i = 0; i < treeHeight; i++) {
                const level = levels[i]!;
                xOffset = 0;
                let step = 0;
                if(i < treeHeight-1) {
                    step = (treeWidth - (2**i * maxNodeWidth)) / (2**i+1);
                    xOffset += step;
                } else {
                    step = (treeWidth - (2**i * maxNodeWidth)) / (2**i-1);
                }
                for(let i = 0; i < level.length; i++) {
                    const node = level[i]!;
                    if(node instanceof UtilityObject) {
                        if(node.id in this.nodeRegistry) {
                            const data = this.nodeRegistry[node.id]!;
                            data.targetX = xOffset;
                            data.targetY = yOffset;
                            data.content = node.get("key", true).asString();
                            data.representation = [...this.idToMemoryKey[node.id] ?? []][0];
                            newRegistry[node.id] = data;
                        } else {
                            newRegistry[node.id] = new BTNRenderData(node.get("key", true).asString(), [...this.idToMemoryKey[node.id] ?? []][0], this.objectCanvas, xOffset, yOffset, this.nodeHeight);
                        }
                    }
                    xOffset += step + maxNodeWidth;
                }
                yOffset += (this.nodeHeight + this.nodeYSpacing);
            }

            yOffset += this.nodeHeight + this.nodeYSpacing;
        }

        if(yOffset > this.y) {
            this.height = (yOffset-this.y)+this.nodeHeight;
        } else {
            this.height = 0;
        }
        this.nodeRegistry = newRegistry;
    }

    private updateLinks() {
        const allNodes = Object.entries(this.nodeRegistry);
        for(const [id, data] of allNodes) {
            const node = this.allObjectsByID[id]!;
            if(node instanceof UtilityObject) {
                const left = node.get("left", true)!;
                if(left instanceof UtilityObject) {
                    data.left = this.nodeRegistry[left.id];
                } else {
                    data.left = undefined;
                }
                const right = node.get("right", true)!;
                if(right instanceof UtilityObject) {
                    data.right = this.nodeRegistry[right.id];
                } else {
                    data.right = undefined;
                }
            }
        }
    }

    public override reloadObjects() {
        const independentRoots: UtilityObject[] = this.findIndependentRoots();
        this.createOrUpdateNodes(independentRoots);
        this.updateLinks();
    }
}

class ArrayElementRenderData extends NodeRenderData {

    constructor(content: string, objectCanvas: HTMLCanvasElement, x: number, y:number, h: number) {
        super(content, undefined, objectCanvas, x, y, h);
    }

    public render(progress: number) {
        const ctx = this.objectCanvas.getContext("2d")!;
        ctx.fillStyle = this.highlighted ? this.hightlightStyle : "white";
        const x = this.getX(progress);
        const y = this.getY(progress);
        ctx.fillRect(x, y, this.w, this.h);
        ctx.strokeStyle = "black";
        ctx.strokeRect(x, y, this.w, this.h);
        this.drawOnlyContent(ctx, x, y);
    }

    public getY(t: number): number {
        if(this.targetX != this.originX) return super.getY(t)+30*(-2*Math.abs(t-0.5)+1);
        return super.getY(t);
    }
}

class ArrayRenderer extends ObjectRenderer<ArrayElementRenderData> {
    private readonly nodeHeight = 20;

    constructor(objectCanvas: HTMLCanvasElement, selectors: string[], memory: Memory) {
        super(objectCanvas, "array", selectors, memory);
    }

    public override render(progress: number): void {
        super.render(progress);
        this.nodes.forEach(r => r.render(progress));
    }

    public override reloadObjects() {
        const arraysWithKey: [string,UtilityArray][] = this.selectedObjectsWithKey as [string, UtilityArray][];
        let yOffset = this.y;
        const newRegistry: Record<string, ArrayElementRenderData> = {};
        for(const [key, array] of arraysWithKey) {
            let xOffset = 0;
            const headerID = key;
            if(headerID in this.nodeRegistry) {
                const data = this.nodeRegistry[headerID]!;
                data.targetX = xOffset;
                data.targetY = yOffset;
                data.content = key+":";
                newRegistry[headerID] = data;
            } else {
                newRegistry[headerID] = new ArrayElementRenderData(key+":", this.objectCanvas, xOffset, yOffset, this.nodeHeight);
            }
            xOffset += newRegistry[headerID].w;
            for(let i = 0; i < array.length; i++) {
                const element = array.indexGet(i, true);
                const elementID = element.id;
                if(elementID in this.nodeRegistry) {
                    const data = this.nodeRegistry[elementID]!;
                    data.targetX = xOffset;
                    data.targetY = yOffset;
                    data.content = element.asString();
                    newRegistry[elementID] = data;
                } else {
                    newRegistry[elementID] = new ArrayElementRenderData(element.asString(), this.objectCanvas, xOffset, yOffset, this.nodeHeight);
                }
                xOffset += newRegistry[elementID].w;
            }
        }

        if(yOffset > this.y) {
            this.height = (yOffset-this.y)+this.nodeHeight;
        } else {
            this.height = 0;
        }
        this.nodeRegistry = newRegistry;
    }
}

class ObjectView extends ProgramView implements AnimatedView {
    private objectCanvas: HTMLCanvasElement;
    private renderers: ObjectRenderer<NodeRenderData>[];
    public readonly selectorsField: HTMLInputElement;
    public get selectors(): string[] {
        return this.selectorsField.value.split(",").map(t => t.trim());
    }
    private readonly cameraHandler: CameraHandler;

    constructor(runner: StructogramRunner) {
        super(document.querySelector("#object-view")!, runner);
        this.objectCanvas = this.viewElem.querySelector("canvas") as HTMLCanvasElement;
        this.selectorsField = this.viewElem.querySelector(".t-object-keys") as HTMLInputElement;
        this.selectorsField.value = "";
        window.addEventListener("load", () => {
            this.objectCanvas.width = this.objectCanvas.clientWidth;
            this.objectCanvas.height = this.objectCanvas.clientHeight;
        });
        window.addEventListener("resize", () => {
            this.objectCanvas.width = this.objectCanvas.clientWidth;
            this.objectCanvas.height = this.objectCanvas.clientHeight;
        });
        this.renderers = [
            new S1LRenderer(this.objectCanvas, this.selectors, runner.structogram.memory),
            new S2LRenderer(this.objectCanvas, this.selectors, runner.structogram.memory),
            new BTNRenderer(this.objectCanvas, this.selectors, runner.structogram.memory),
            new ArrayRenderer(this.objectCanvas, this.selectors, runner.structogram.memory)
        ];
        ObjectRenderer.emitter.on(ObjectRenderer.heightChanged, () => {
            let yOffset = 0;
            for(const renderer of this.renderers) {
                renderer.y = yOffset;
                yOffset += renderer.height;
            }
        });
        this.selectorsField.addEventListener("change", () => {
            for(const renderer of this.renderers) {
                renderer.updateSelectors(this.selectors);
            }
        });
        this.cameraHandler = new CameraHandler(this.objectCanvas);
        this.reset();
    }

    public clearEffects(): void {
        for(const renderer of this.renderers) {
            renderer.clearEffects();
        }
    }

    public render(progress: number): void {
        const ctx = this.objectCanvas.getContext("2d")!;
        ctx.clearRect(0, 0, this.objectCanvas.width, this.objectCanvas.height);
        ctx.translate(this.cameraHandler.x, this.cameraHandler.y);
        ctx.scale(this.cameraHandler.scale, this.cameraHandler.scale);
        this.renderers.forEach(r => r.render(progress));
        ctx.resetTransform();
    }

    public override reset(): void {
        this.objectCanvas.width = this.objectCanvas.clientWidth;
        this.objectCanvas.height = this.objectCanvas.clientHeight;
        for(const renderer of this.renderers) {
            renderer.updateSelectors(this.selectors);
            renderer.reset();
            renderer.reloadObjects();
        }
    }

    public override clearSettings() {
        this.selectorsField.value = "";
    }
}

interface AnimatedView {
    render(progress: number): void;
}