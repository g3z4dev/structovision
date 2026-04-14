import { Structogram, StructogramBlock } from "../model/structogram";
import { baseRunSpeed, notRunningClass, runningClass, textPadding } from "./constants";
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
            node?.classList.remove(...runningClass);
            node?.classList.add(...notRunningClass);
            currentBlock?.emitter.removeAllListeners(StructogramBlock.activeStepChanged);
        }
        this.activeBlockStep = undefined;
        this._currentBlock = currentBlock;
        if(currentBlock) {
            const node = this.renderTarget.querySelector(`#${this.idPrefix}-${currentBlock.id}`);
            node?.classList.remove(...notRunningClass);
            node?.classList.add(...runningClass);
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
                e?.classList.remove("font-bold", "stroke-green-500");
            }
        }
        this._activeBlockStep = step;
        if(this._activeBlockStep && this.currentBlock) {
            const nonSVGChildrenContent = `#${this.idPrefix}-${this.currentBlock.id} > :not(svg) .t-step-${this._activeBlockStep}`;
            const subSVGChildrenContent = `#${this.idPrefix}-${this.currentBlock.id} >  svg.t-subsvg .t-step-${this._activeBlockStep}`;
            for(const e of this.renderTarget.querySelectorAll(`${nonSVGChildrenContent}, ${subSVGChildrenContent}`) ?? []) {
                e?.classList.add("font-bold", "stroke-green-500");
            }
        }
    }

    protected get activeBlockStep(): string | undefined {
        return this._activeBlockStep;
    }

    public get currentBlock() {
        return this._currentBlock;
    }

    public get stepLength() {
        return baseRunSpeed / this.timeControl.currentSpeed
    }

    public get animationProgress() {
        return Math.min(1, this.timeElapsed / this.stepLength);
    }

    private addInputEntry(key: string, type: ValueType) {
        const entry = parseIntoHTML(inputDataEntryTemplate);
        setTemplateText(entry, "key", `${key}: ${Translator.getDictionary().translateType(type.id)}`);
        entry.querySelector("input[type=\"text\"]")!.addEventListener("change", () => {
            this.viewModel.saveCache();
        })
        this.inputDataElem.appendChild(entry);
        this.inputDataElem.classList.remove("hidden");
    }

    private getInputs(): string[] {
        return [...this.inputDataElem.querySelectorAll(".t-data") as NodeListOf<HTMLFormElement>].map(n => n.value);
    }

    private setInputs(inputs: string[]) {
        const fields = this.inputDataElem.querySelectorAll(".t-data") as NodeListOf<HTMLFormElement>;
        for(let i = 0; i < inputs.length; i++) {
            fields[i]!.value = inputs[i]!;
        }
    }

    public getData(): any {
        return {
            "inputs": this.getInputs(),
            "program_view_data": this.programViewManager.getData()
        }
    }

    public loadData(data: any) {
        this.setInputs(data["inputs"] ?? []);
        this.programViewManager.loadData(data["program_view_data"] ?? {});
    }

    constructor(structogram: Structogram, viewModel: ViewModel) {
        super(viewModel, structogram, document.querySelector("#structogram-runner")!, "runner")
        for(const [key, type] of structogram.inputData) {
            this.addInputEntry(key, type);
        }
        structogram.emitter.addListener(Structogram.inputSpecificationEvent, (key, type) => {
            this.addInputEntry(key, type);
        });
        structogram.emitter.addListener(Structogram.specificationClearEvent, () => {
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
        for(const [key, value] of this.structogram.getResults()) {
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

    public get currentSpeed(): number {
        return this.speeds[this._currentSpeedIndex] ?? 1;
    }

    constructor(runner: StructogramRunner) {
        this.runner = runner;
        this.setupButtons();
    }

    private setupButtons() {
        this.startButton.addEventListener("click", () => {
            this.runner.start();
            this.startButton.classList.add("hidden");
            this.pauseButton.classList.remove("hidden");
        });
        this.pauseButton.addEventListener("click", () => {
            this.runner.pause();
            this.startButton.classList.remove("hidden");
            this.pauseButton.classList.add("hidden");
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

    public getData(): any {
        return {
            "output_visible": this.outputVisibleInput.checked,
            "memory_visible": this.memoryVisibleInput.checked,
            "logic_visible": this.logicVisibleInput.checked,
            "objects_visible": this.objectsVisibleInput.checked
        }
    }

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

    public getData() {
        return {
            "settings": this.settings.getData(),
            "object_keys": this.objectView.selectors
        }
    }

    public loadData(data: any) {
        this.settings.loadData(data["settings"] ?? {});
        this.objectView.selectorsField.value = (data["object_keys"] ?? []).join(",");
    }

    public clearEffects() {
        this.outputView.clearEffects();
        this.memoryView.clearEffects();
        this.logicView.clearEffects();
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

    public setVisibility(visibility: boolean) {
        if(visibility) {
            this.viewElem.classList.remove("hidden");
        } else {
            this.viewElem.classList.add("hidden");
        }
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

    constructor(runner: StructogramRunner) {
        super(document.querySelector("#memory-view")!, runner);
        this.reset();
        const memory = this.runner.structogram.memory;
        memory.emitter.addListener(Memory.variableDeclaredEvent, (entry: MemoryEntry) => {
            this.valueIDToMemoryKey[entry.value.id] = entry.key;   
            this.addEntry(entry);
        });
        memory.emitter.addListener(Memory.variableChangedEvent, (key: string, prevValue: Value, value: Value) => {
            if(prevValue.id in this.valueIDToMemoryKey && prevValue.id != value.id) delete this.valueIDToMemoryKey[prevValue.id];
            this.valueIDToMemoryKey[value.id] = key;
            const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${key}`) as HTMLElement;
            setTemplateText(memoryEntry, "memory-value", value.asString());
            this.changedElems.push(memoryEntry);
            memoryEntry.classList.add(...this.changedStyle);
        });
        memory.emitter.addListener(Memory.variableAccessedEvent, key => {
            const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${key}`) as HTMLElement;
            this.accessedElems.push(memoryEntry);
            memoryEntry.classList.add(...this.accessedStyle);
        });
        UtilityArray.emitter.on(UtilityArray.elementChanged, (array: UtilityArray, _idx: number, value: Value) => {
            const key = this.valueIDToMemoryKey[array.id];
            if(key) {
                const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${key}`) as HTMLElement;
                setTemplateText(memoryEntry, "memory-value", array.asString());
                this.changedElems.push(memoryEntry);
                memoryEntry.classList.add(...this.changedStyle);
            }
        });
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
        for(const entry of memory.getEntries()) {
            const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${entry.key}`) as HTMLElement;
            this.clearStyle(memoryEntry, this.changedStyle);
            this.clearStyle(memoryEntry, this.accessedStyle);
        }
    }

    public reset(): void {
        this.memoryViewEntriesElem.textContent = "";
        const memory = this.runner.structogram.memory;
        for(const entry of memory.getEntries()) {
            this.addEntry(entry);
        }
    }
}

class LogicView extends ProgramView implements AnimatedView {
    private logicElem = this.viewElem.querySelector(".t-logic") as HTMLElement;
    private operandTemplateElem = parseIntoHTML(operandTemplate) as HTMLElement;
    private operatorTemplateElem = parseIntoHTML(operatorTemplate) as HTMLElement;

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

    constructor(runner: StructogramRunner) {
        super(document.querySelector("#logic-view")!, runner);
        this.reset();
        let arrayDepth = 0;
        Statement.emitter.on(Statement.evaluationStart, (statement: Statement<any>, statementTokens: (ResolvableOperand | Operator | Bracket)[]) =>{
            if(statement.returnType.baseIdentifier == "array") {
                arrayDepth++;
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
        });
        
        Statement.emitter.on(Statement.evaluationEnd, (statement: Statement<any>, result: Value) =>{
            if(statement.returnType.baseIdentifier == "array") {
                arrayDepth--;
                this.addOperator("}");
            } else {
                this.addOperator("->");
                this.addOperand(result.asString());
                if(arrayDepth > 0) {
                    this.addOperator(",");
                }
            }
        });
    }

    public clearEffects(): void {
        this.reset();
    }

    public render(progress: number): void {
        
    }

    public override reset(): void {
        this.logicElem.textContent = "";
    }
}

function getTextWidth(canvas: HTMLCanvasElement, text: string) {
    return canvas.getContext("2d")!.measureText(text).width;
}

abstract class ObjectRenderer {
    protected objectCanvas: HTMLCanvasElement;
    protected objectBaseIdentifier: string;
    protected allObjectsByMemoryKey: Record<string, Value>;
    protected allObjectsByID: Record<string, Value>;
    protected idToMemoryKey: Record<string, string>;
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

    constructor(objectCanvas: HTMLCanvasElement, objectBaseIdentifier: string, selectors: string[], memory: Memory) {
        this.objectCanvas = objectCanvas;
        this.objectBaseIdentifier = objectBaseIdentifier;
        this.selectors = selectors;
        this.memory = memory;
        this.idToMemoryKey = {};
        this.allObjectsByMemoryKey = memory.getAllValuesWithBaseIdentifier(objectBaseIdentifier).reduce((acc, cur) => {
            acc[cur.key] = cur.value;
            this.idToMemoryKey[cur.value.id] = cur.key;
            return acc;
        }, {} as Record<string, Value>);
        this.allObjectsByID = Object.values(this.allObjectsByMemoryKey).reduce((acc, cur) => {
            acc[cur.id] = cur;
            return acc;
        }, {} as Record<string, Value>);
        this.reloadObjects();
        this.memory.emitter.on(Memory.variableChangedEvent, (key: string, _prevValue: Value, value: Value) => {
            if(value.type.baseIdentifier == objectBaseIdentifier) {
                const prevValue = this.allObjectsByMemoryKey[key]!;
                this.allObjectsByMemoryKey[key] = value;
                if(value.type.isDefined()) {
                    this.allObjectsByID[value.id] = value;
                    this.idToMemoryKey[value.id] = key;
                } else if(prevValue.type.isDefined()){
                    delete this.allObjectsByID[prevValue.id];
                    delete this.idToMemoryKey[key];
                }
                this.objectReloadQueued = true;
            }
        });
        UtilityObject.emitter.addListener(UtilityObject.fieldChanged, (object: UtilityObject, _key: string, value: Value) => {
            if(value.type.baseIdentifier == objectBaseIdentifier) {
                this.allObjectsByID[value.id] = value;
            }
            if(object.type.baseIdentifier == objectBaseIdentifier) {
                this.objectReloadQueued = true;
            }
        });
        UtilityArray.emitter.addListener(UtilityArray.elementChanged, (object: UtilityObject, _idx: number, value: Value) => {
            if(value.type.baseIdentifier == objectBaseIdentifier) {
                this.allObjectsByID[value.id] = value;
            }
            if(object.type.baseIdentifier == objectBaseIdentifier) {
                this.objectReloadQueued = true;
            }
        });
        UtilityArray.emitter.addListener(UtilityArray.elementSwapped, (object: UtilityObject) => {
            if(object.type.baseIdentifier == objectBaseIdentifier) {
                this.objectReloadQueued = true;
            }
        });
    }

    public updateSelectors(selectors: string[]) {
        this.selectors = [...selectors];
        this.reloadObjects();
    }

    public abstract reloadObjects(): void;

    public render(progress: number): void {
        if(this.objectReloadQueued) {
            this.reloadObjects();
            this.objectReloadQueued = false;
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

abstract class NodeRenderData {
    abstract render(progress: number): void;
    protected objectCanvas: HTMLCanvasElement;
    public originX;
    public originY;
    private _targetX;
    private _targetY;
    public w;
    public h;
    public content: string;
    public representation: string | undefined;
    protected static textPadding = 4;

    public static getNodeWidthWithContent(canvas: HTMLCanvasElement, content: string) {
        return getTextWidth(canvas, content) + NodeRenderData.textPadding;
    }

    constructor(content: string, representation: string | undefined, objectCanvas: HTMLCanvasElement, x: number, y:number, h: number) {
        this.content = content;
        this.representation = representation;
        this.objectCanvas = objectCanvas;
        this.originX = x;
        this.originY = y;
        this._targetX = x;
        this._targetY = y;
        this.w = NodeRenderData.getNodeWidthWithContent(objectCanvas, content);
        this.h = h;
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
            this.originX = this.targetX;
        }
        return lerp(this.originX, this.targetX, t);
    }
    public getY(t: number): number {
        if(t == 1) {
            this.originY = this.targetY;
        }
        return lerp(this.originY, this.targetY, t);
    }

    protected drawOnlyContent(ctx: CanvasRenderingContext2D, x: number, y: number) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "black";
        ctx.fillText(this.content, x + this.w / 2, y + this.h / 2, this.w);
    }
    
    protected drawContentWithRepresentation(ctx: CanvasRenderingContext2D, x: number, y: number) {
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = "black";
        ctx.fillText(this.content, x + this.w / 2, y + this.h, this.w);
        ctx.textBaseline = "top";
        ctx.fillStyle = "gray";
        ctx.fillText("("+this.representation+")", x + this.w / 2, y, this.w);
    }

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
        ctx.fillStyle = "white";
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

class S1LRenderer extends ObjectRenderer {
    private nodeRegistry: Record<string, S1LRenderData> = {};
    private readonly nodeHeight  = 20;
    private readonly nodeXSpacing = 20;
    private readonly nodeYSpacing = 20;

    private get nodes() {
        return Object.values(this.nodeRegistry);
    }

    constructor(objectCanvas: HTMLCanvasElement, selectors: string[], memory: Memory) {
        super(objectCanvas, "s1l", selectors, memory);
        this.reloadObjects();
    }

    public override render(progress: number): void {
        super.render(progress);
        this.nodes.forEach(r => r.render(progress));
    }

    public override reloadObjects() {
        const rootNodeSet = new Set<string>();
        const childNodeSet = new Set<string>();
        for(const node of Object.entries(this.allObjectsByMemoryKey).filter(e => this.selectors.includes(e[0]!) && e[1] instanceof UtilityObject).map(e => e[1]!) as UtilityObject[]) {
            if(node.type.isUndefined()) continue;
            if(childNodeSet.has(node.id)) continue;
            rootNodeSet.add(node.id);
            let child = node.get("next");
            while(child.type.isDefined() && child instanceof UtilityObject) {
                if(rootNodeSet.has(child.id)) {
                    rootNodeSet.delete(child.id);
                    childNodeSet.add(child.id);
                    continue;
                }
                childNodeSet.add(child.id);
                child = child.get("next");
            }
        }
        const independentRoots: UtilityObject[] = [...rootNodeSet].map(id => this.allObjectsByID[id]!) as UtilityObject[];
        const allNodes: UtilityObject[] = [];
        let yOffset = this.y;
        const newRegistry: Record<string, S1LRenderData> = {};
        for(const ir of independentRoots) {
            const nodes: UtilityObject[] = [];
            let n: Value = ir;
            while(n.type.isDefined() && n instanceof UtilityObject) {
                nodes.push(n);
                n = n.get("next");
            }

            let xOffset = 0;
            for(const node of nodes) {
                allNodes.push(node);
                if(node.id in this.nodeRegistry) {
                    const data = this.nodeRegistry[node.id]!;
                    data.targetX = xOffset;
                    data.targetY = yOffset;
                    data.content = node.get("key").asString();
                    data.representation = this.idToMemoryKey[node.id];
                    newRegistry[node.id] = data;
                } else {
                    newRegistry[node.id] = new S1LRenderData(node.get("key").asString(), this.idToMemoryKey[node.id], this.objectCanvas, xOffset, yOffset, this.nodeHeight);
                    newRegistry[node.id]!.originY += this.nodeHeight;
                }
                xOffset += newRegistry[node.id]!.w + this.nodeXSpacing;
            }
            yOffset += this.nodeHeight + this.nodeYSpacing;
        }

        for(const node of allNodes) {
            if(node.get("next") instanceof UtilityObject) {
                newRegistry[node.id]!.next = newRegistry[node.get("next").id];
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

class S2LRenderData extends NodeRenderData {
    public next: S2LRenderData | undefined;
    public prev: S2LRenderData | undefined;

    constructor(content: string, representation: string | undefined, objectCanvas: HTMLCanvasElement, x: number, y:number, h: number) {
        super(content, representation, objectCanvas, x, y, h)
    }

    public render(progress: number) {
        const ctx = this.objectCanvas.getContext("2d")!;
        ctx.fillStyle = "white";
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

class S2LRenderer extends ObjectRenderer {
    private nodeRegistry: Record<string, S2LRenderData> = {};
    private readonly nodeHeight = 20;
    private readonly nodeXSpacing = 20;
    private readonly nodeYSpacing = 20;

    private get nodes() {
        return Object.values(this.nodeRegistry);
    }

    constructor(objectCanvas: HTMLCanvasElement, selectors: string[], memory: Memory) {
        super(objectCanvas, "s2l", selectors, memory);
        this.reloadObjects();
    }

    public override render(progress: number): void {
        super.render(progress);
        this.nodes.forEach(r => r.render(progress));
    }

    public override reloadObjects() {
        const rootNodeSet = new Set<string>();
        const childNodeSet = new Set<string>();
        for(const node of Object.entries(this.allObjectsByMemoryKey).filter(e => this.selectors.includes(e[0]!) && e[1] instanceof UtilityObject).map(e => e[1]!) as UtilityObject[]) {
            if(node.type.isUndefined()) continue;
            if(node.get("prev").type.isDefined() || childNodeSet.has(node.id)) continue;
            rootNodeSet.add(node.id);
            let child = node.get("next");
            while(child.type.isDefined() && child instanceof UtilityObject) {
                if(rootNodeSet.has(child.id)) {
                    rootNodeSet.delete(child.id);
                    childNodeSet.add(child.id);
                    continue;
                }
                childNodeSet.add(child.id);
                child = child.get("next");
            }
        }
        const independentRoots: UtilityObject[] = [...rootNodeSet].map(id => this.allObjectsByID[id]!) as UtilityObject[];
        let yOffset = this.y;
        const newRegistry: Record<string, S2LRenderData> = {};
        const allNodes: UtilityObject[] = [];
        for(const ir of independentRoots) {
            let n: Value = ir;
            const nodes: UtilityObject[] = [];
            while(n.type.isDefined() && n instanceof UtilityObject) {
                nodes.push(n);
                n = n.get("next");
            }

            let xOffset = 0;

            for(const node of nodes) {
                allNodes.push(node);
                if(node.id in this.nodeRegistry) {
                    const data = this.nodeRegistry[node.id]!;
                    data.targetX = xOffset;
                    data.targetY = yOffset;
                    data.content = node.get("key").asString();
                    data.representation = this.idToMemoryKey[node.id];
                    newRegistry[node.id] = data;
                } else {
                    newRegistry[node.id] = new S2LRenderData(node.get("key").asString(), this.idToMemoryKey[node.id], this.objectCanvas, xOffset, yOffset, this.nodeHeight);
                    newRegistry[node.id]!.originY += this.nodeHeight;
                }
                xOffset += (newRegistry[node.id]!.w + this.nodeXSpacing);
            }
            
            yOffset += this.nodeHeight + this.nodeYSpacing;
        }

        for(const node of allNodes) {
            const data = newRegistry[node.id]!;
            const prev = node.get("prev")!;
            if(prev instanceof UtilityObject) {
                data.prev = newRegistry[prev.id];
            }
            const next = node.get("next")!;
            if(next instanceof UtilityObject) {
                data.next = newRegistry[next.id];
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

class BTNRenderData extends NodeRenderData {
    public left: BTNRenderData | undefined;
    public right: BTNRenderData | undefined;

    constructor(content: string, representation: string | undefined, objectCanvas: HTMLCanvasElement, x: number, y:number, h: number) {
        super(content, representation, objectCanvas, x, y, h)
    }

    public render(progress: number) {
        const ctx = this.objectCanvas.getContext("2d")!;
        ctx.fillStyle = "white";
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

class BTNRenderer extends ObjectRenderer {
    private nodeRegistry: Record<string, BTNRenderData> = {};
    private readonly nodeHeight = 20;
    private readonly nodeXSpacing = 20;
    private readonly nodeYSpacing = 20;

    private get nodes() {
        return Object.values(this.nodeRegistry);
    }

    constructor(objectCanvas: HTMLCanvasElement, selectors: string[], memory: Memory) {
        super(objectCanvas, "btn", selectors, memory);
        this.reloadObjects();
    }

    public override render(progress: number): void {
        super.render(progress);
        this.nodes.forEach(r => r.render(progress));
    }

    public override reloadObjects() {
        const rootNodeSet = new Set<string>();
        const childNodeSet = new Set<string>();
        for(const node of Object.entries(this.allObjectsByMemoryKey).filter(e => this.selectors.includes(e[0]!) && e[1] instanceof UtilityObject).map(e => e[1]!) as UtilityObject[]) {
            if(node.type.isUndefined()) continue;
            if(node.get("parent").type.isDefined() || childNodeSet.has(node.id)) continue;
            rootNodeSet.add(node.id);
            let children = [node.get("left"), node.get("right")];
            while(children.length > 0) {
                const child = children.shift();
                if(child instanceof UtilityObject) {
                    if(rootNodeSet.has(child.id)) {
                        rootNodeSet.delete(child.id);
                        childNodeSet.add(child.id);
                        continue;
                    }
                    childNodeSet.add(child.id);
                    children.push(child.get("left"), child.get("right"));
                }
            }
        }
        const independentRoots: UtilityObject[] = [...rootNodeSet].map(id => this.allObjectsByID[id]!) as UtilityObject[];
        let yOffset = this.y;
        const newRegistry: Record<string, BTNRenderData> = {};
        const allNodes: UtilityObject[] = [];
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
                    const left = child.get("left");
                    const right = child.get("right");
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
            let maxNodeWidth = Math.max(...levels.flat().filter(n => n instanceof UtilityObject).map(n => NodeRenderData.getNodeWidthWithContent(this.objectCanvas, n.get("key").asString())));

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
                            data.content = node.get("key").asString();
                            data.representation = this.idToMemoryKey[node.id];
                            newRegistry[node.id] = data;
                        } else {
                            newRegistry[node.id] = new BTNRenderData(node.get("key").asString(), this.idToMemoryKey[node.id], this.objectCanvas, xOffset, yOffset, this.nodeHeight);
                        }
                    }
                    xOffset += step + maxNodeWidth;
                }
                yOffset += (this.nodeHeight + this.nodeYSpacing);
            }
            
            yOffset += this.nodeHeight + this.nodeYSpacing;
            allNodes.push(...levels.flat().filter(v => v instanceof UtilityObject));
        }

        for(const node of allNodes) {
            const data = newRegistry[node.id]!;
            const left = node.get("left")!;
            if(left instanceof UtilityObject) {
                data.left = newRegistry[left.id];
            }
            const right = node.get("right")!;
            if(right instanceof UtilityObject) {
                data.right = newRegistry[right.id];
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

class ArrayElementRenderData extends NodeRenderData {

    constructor(content: string, objectCanvas: HTMLCanvasElement, x: number, y:number, h: number) {
        super(content, undefined, objectCanvas, x, y, h);
    }

    public render(progress: number) {
        const ctx = this.objectCanvas.getContext("2d")!;
        ctx.fillStyle = "white";
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

class ArrayRenderer extends ObjectRenderer {
    private nodeRegistry: Record<string, ArrayElementRenderData> = {};
    private readonly nodeWidth = 20;
    private readonly nodeHeight = 20;

    private get nodes() {
        return Object.values(this.nodeRegistry);
    }

    constructor(objectCanvas: HTMLCanvasElement, selectors: string[], memory: Memory) {
        super(objectCanvas, "array", selectors, memory);
        this.reloadObjects();
    }

    public override render(progress: number): void {
        super.render(progress);
        this.nodes.forEach(r => r.render(progress));
    }

    public override reloadObjects() {
        const arraysWithKey: [string,UtilityArray][] = Object.entries(this.allObjectsByMemoryKey).filter(e => this.selectors.includes(e[0]!) && e[1] instanceof UtilityArray).map(e => [e[0]!, e[1]!]) as [string, UtilityArray][];
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
                const element = array.indexGet(i);
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
    private renderers: ObjectRenderer[];
    public readonly selectorsField: HTMLInputElement;
    public get selectors(): string[] {
        return this.selectorsField.value.split(",");
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
        this.reset();
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
            renderer.reloadObjects();
        }
    }
}

interface AnimatedView {
    render(progress: number): void;
}