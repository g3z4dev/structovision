import { Structogram, StructogramBlock, StructogramIssue } from "../model/structogram";
import { baseRunSpeed, notRunningClass, runningClass } from "./constants";
import { StructogramRenderer } from "./structogramrenderer";
import { ListWindow, parseIntoHTML, setID, setTemplateText } from "./util";
import EventEmitter2 from "eventemitter2";
import { Memory, type MemoryEntry } from "../model/memory";
import { Operand, Operator, ResolvableOperand, Statement, type Bracket } from "../model/statement";

import operatorTemplate from "../../resources/program-views/logic-view-templates/operator.html";
import operandTemplate from "../../resources/program-views/logic-view-templates/operand.html";

import inputDataEntryTemplate from "../../resources/settings/inputdataentry.html";
import type { Value } from "../model/types";

type RunMode = "onestep" | "run" | "paused";

export class StructogramRunner extends StructogramRenderer {
    private _currentBlock: StructogramBlock | undefined;
    private _activeBlockStep: string | undefined;
    private prepared: boolean = false;
    private readonly inputDataElem = document.querySelector("#input-data") as HTMLElement;
    private readonly runIssueWindow = new ListWindow("issues", "issues-ok");
    private readonly runResultsWindow = new ListWindow("results", "results-ok");
    public readonly timeControl = new TimeControl(this);
    public readonly programViewManager = new ProgramViewManager(this);
    private runMode: RunMode = "paused";

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
            for(const e of this.renderTarget.querySelectorAll(`#${this.idPrefix}-${this.currentBlock.id} > :not(svg) .t-step-${this._activeBlockStep}, #${this.currentBlock.id} >  svg.t-subblock-header .t-step-${this._activeBlockStep}`) ?? []) {
                e?.classList.remove("font-bold", "stroke-green-500");
            }
        }
        this._activeBlockStep = step;
        if(this._activeBlockStep && this.currentBlock) {
            for(const e of this.renderTarget.querySelectorAll(`#${this.idPrefix}-${this.currentBlock.id} > :not(svg) .t-step-${this._activeBlockStep}, #${this.currentBlock.id} >  svg.t-subblock-header .t-step-${this._activeBlockStep}`) ?? []) {
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
        return this.timeElapsed / this.stepLength;
    }

    public addInputEntry(key: string) {
        const entry = parseIntoHTML(inputDataEntryTemplate);
        setTemplateText(entry, "key", key);
        this.inputDataElem.appendChild(entry);
    }

    public getInputs() {
        return [...this.inputDataElem.querySelectorAll(".t-data") as NodeListOf<HTMLFormElement>].map(n => n.value);
    }

    constructor(structogram: Structogram) {
        super(structogram, document.querySelector("#structogram-runner")!, "runner")
        for(const [key, _] of structogram.inputData) {
            this.addInputEntry(key);
        }
        structogram.emitter.addListener(Structogram.inputSpecificationEvent, (key, _) => {
            this.addInputEntry(key);
        });
        structogram.emitter.addListener(Structogram.specificationClearEvent, () => {
            this.inputDataElem.textContent = "";
        });
    }

    private prepareRunning(): boolean {
        const issues = this.structogram.preRun(this.getInputs());
        if(issues.length > 0) {
            for(const issue of issues) {
                this.runIssueWindow.addEntry(issue.id + ": " + issue.message);
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
            this.runResultsWindow.addEntry(key + " = " + value);
        }
        this.runResultsWindow.show();
    }

    public restart() {
        this.structogram.restart();
        this.runMode = "paused";
        this.currentBlock = undefined;
        this.prepared = false;
    }

    public start() {
        this.timeElapsed = 0;
        this.runMode = "run";
        this._step();
    }

    public step() {
        if(this.runMode != "run") {
            this.timeElapsed = 0;
            this.runMode = "onestep";
            this._step();
        }
    }

    private _step(): boolean {
        if(!this.structogram.isRunning()) {
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
        if(this.runMode != "paused") {
            this.timeElapsed += delta;
            if(this.timeElapsed > this.stepLength) { 
                this.timeElapsed = 0;
                if(!this.structogram.isRunning()) {
                    this.runMode = "paused";
                }
                if(this.runMode == "onestep") {
                    this.runMode = "paused";
                } else if(this.runMode == "run") {
                    if(!this._step()) {
                        this.runMode = "paused";
                    }
                }
            }
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
        this.speedLabel.innerText = `${speed}x`;
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
        });
        this.pauseButton.addEventListener("click", () => {
            this.runner.pause();
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

class ProgramViewManager {
    public static readonly ready = "programviewmanager.ready";
    private printView: OutputView;
    private memoryView: MemoryView;
    private logicView: LogicView;
    private readonly programViewsElem = document.querySelector("#program-views")!;

    constructor(runner: StructogramRunner) {
        this.printView = new OutputView(runner);
        this.memoryView = new MemoryView(runner);
        this.logicView = new LogicView(runner);
        this.programViewsElem.appendChild(this.printView.getElement());
        this.programViewsElem.appendChild(this.memoryView.getElement());
        this.programViewsElem.appendChild(this.logicView.getElement());
    }

    public clearEffects() {
        this.printView.clearEffects();
        this.memoryView.clearEffects();
        this.logicView.clearEffects();
    }

    public reset() {
        this.clearEffects();
        this.printView.reset();
        this.memoryView.reset();
        this.logicView.reset();
    }

    public render(delta: number) {
        
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
    private changedElems: HTMLElement[] = [];
    private accessedElems: HTMLElement[] = [];

    private addEntry(key: string, value: MemoryEntry) {
        const memoryEntry = this.memoryTemplateElem.cloneNode(true) as HTMLElement;
        setTemplateText(memoryEntry, "memory-key", key);
        setTemplateText(memoryEntry, "memory-value", value.value.asString());
        setTemplateText(memoryEntry, "memory-constant", value.constant.toString());
        setID(memoryEntry, `v-${key}`);
        this.memoryViewEntriesElem.appendChild(memoryEntry);
    }

    constructor(runner: StructogramRunner) {
        super(document.querySelector("#memory-view")!, runner);
        this.reset();
        const memory = this.runner.structogram.memory;
        memory.emitter.addListener(Memory.variableAddedEvent, (key, value) => {   
            this.addEntry(key, value);
        });
        memory.emitter.addListener(Memory.variableChangedEvent, (key, value) => {
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
        for(const [key, _] of memory.getEntries()) {
            const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${key}`) as HTMLElement;
            this.clearStyle(memoryEntry, this.changedStyle);
            this.clearStyle(memoryEntry, this.accessedStyle);
        }
    }

    public reset(): void {
        this.memoryViewEntriesElem.textContent = "";
        const memory = this.runner.structogram.memory;
        for(const [key, value] of memory.getEntries()) {
            this.addEntry(key, value);
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
            setTemplateText(elem, "representation", operator.getRepresentingChar());
        } else {
            setTemplateText(elem, "representation", operator);
        }
        this.logicElem.appendChild(elem);
    }

    private addOperand(operand: ResolvableOperand | string) {
        const elem = this.operandTemplateElem.cloneNode(true) as HTMLElement;
        if(operand instanceof ResolvableOperand) {
            setTemplateText(elem, "representation", operand.getRepresentation());
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
        Statement.emitter.on(Statement.evaluationStart, (statementTokens: (ResolvableOperand | Operator | Bracket)[]) =>{
            for(const token of statementTokens) {
                if(token instanceof ResolvableOperand) {
                    this.addOperand(token);
                } else {
                    this.addOperator(token);
                }
            }
        });
        
        Statement.emitter.on(Statement.evaluationEnd, (result: Value) =>{
            this.addOperator("->");
            this.addOperand(result.asString());
        });
    }

    public clearEffects(): void {
        this.reset();
    }

    public render(delta: number): void {
        
    }

    public override reset(): void {
        this.logicElem.textContent = "";
    }
}

interface AnimatedView {
    render(delta: number): void;
}