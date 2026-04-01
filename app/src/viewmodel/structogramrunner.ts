import { Structogram, StructogramBlock, StructogramIssue } from "../model/structogram";
import { baseRunSpeed, notRunningClass, runningClass } from "./constants";
import { StructogramRenderer } from "./structogramrenderer";
import { lerp, ListWindow, parseIntoHTML, setHeight, setID, setPosition, setPosition1, setPosition2, setSize, setTemplateText, setWidth, setX } from "./util";
import EventEmitter2 from "eventemitter2";
import { Memory, type MemoryEntry } from "../model/memory";
import { Operand, Operator, ResolvableOperand, Statement, type Bracket } from "../model/statement";

import operatorTemplate from "../../resources/program-views/logic-view-templates/operator.html";
import operandTemplate from "../../resources/program-views/logic-view-templates/operand.html";

import inputDataEntryTemplate from "../../resources/settings/inputdataentry.html";
import { SimpleValue, UtilityObject, type Value } from "../model/types";

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
        return Math.min(1, this.timeElapsed / this.stepLength);
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
        this.runMode = "run";
        this._step();
    }

    public step() {
        if(this.runMode != "run") {
            this.runMode = "onestep";
            this._step();
        }
    }

    private _step(): boolean {
        this.timeElapsed = 0;
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
        this.programViewManager.render(this.animationProgress);
        if(this.runMode != "paused") {
            this.timeElapsed += delta;
            if(this.timeElapsed > this.stepLength) { 
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
    private objectView: ObjectView;

    constructor(runner: StructogramRunner) {
        this.printView = new OutputView(runner);
        this.memoryView = new MemoryView(runner);
        this.logicView = new LogicView(runner);
        this.objectView = new ObjectView(runner);
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
        memory.emitter.addListener(Memory.variableAddedEvent, (entry) => {   
            this.addEntry(entry);
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

    public render(progress: number): void {
        
    }

    public override reset(): void {
        this.logicElem.textContent = "";
    }
}

abstract class ObjectRenderer {
    protected objectCanvas: HTMLCanvasElement;
    protected objectBaseIdentifier: string;
    protected allObjects: Record<string, UtilityObject>;
    protected memory: Memory;

    constructor(objectCanvas: HTMLCanvasElement, objectBaseIdentifier: string, memory: Memory) {
        this.objectCanvas = objectCanvas;
        this.objectBaseIdentifier = objectBaseIdentifier;
        this.memory = memory;
        this.allObjects = memory.getAllValuesWithBaseIdentifier(objectBaseIdentifier).reduce((acc, cur) => {
            acc[cur.key] = acc.value as UtilityObject;
            return acc;
        }, {} as Record<string, UtilityObject>);
        this.onObjectsChanged();
        this.memory.emitter.on(Memory.variableAddedEvent, (entry: MemoryEntry) => {
            if(entry.type.baseIdentifier == objectBaseIdentifier) {
                this.allObjects[entry.key] = entry.value as UtilityObject;
                this.onObjectsChanged();
            }
        });
        this.memory.emitter.on(Memory.variableChangedEvent, (key: string, value: Value) => {
            if(key in this.allObjects) {
                this.allObjects[key] = value as UtilityObject;
                this.onObjectsChanged();
            }
        });
        UtilityObject.emitter.addListener(UtilityObject.fieldChanged, (object: UtilityObject, key: string, value: Value) => {
            if(object.getType().baseIdentifier == objectBaseIdentifier) {
                this.onObjectsChanged();
            }
        })
    }

    protected abstract onObjectsChanged(): void;

    public abstract render(progress: number): void;
}

interface NodeRenderData {
    render(progress: number): void;
    getX(t: number): number;
    getY(t: number): number;
    get originX(): number;
    get originY(): number;
    set originX(originX: number);
    set originY(originY: number);
    get targetX(): number;
    get targetY(): number;
    set targetX(targetX: number);
    set targetY(targetY: number);
    get h(): number;
    get w(): number;
}

interface S1LRenderData extends NodeRenderData {
    get next(): S1LRenderData | undefined;
    set next(next: S1LRenderData | undefined);
}

class S1LRenderer extends ObjectRenderer {
    private independentRoots: UtilityObject[] = [];
    private nodeRegistry: Record<string, S1LRenderData> = {};

    private get nodes() {
        return Object.values(this.nodeRegistry);
    }

    constructor(objectCanvas: HTMLCanvasElement, memory: Memory) {
        super(objectCanvas, "s1l", memory);
        this.onObjectsChanged();
    }

    public override render(progress: number): void {
        this.nodes.forEach(r => r.render(progress));
    }

    public override onObjectsChanged() {
        const rootNodeSet = new Set<UtilityObject>();
        const childNodeSet = new Set<UtilityObject>();
        for(const node of Object.entries(this.allObjects).filter(e => e[0]! == "a").map(e => e[1]!)) {
            if(node.getType().baseIdentifier == "undefined") continue;
            if(childNodeSet.has(node)) continue;
            rootNodeSet.add(node);
            let child = node.get("next");
            while(child.getType().baseIdentifier != "undefined" && child instanceof UtilityObject) {
                if(rootNodeSet.has(child)) {
                    rootNodeSet.delete(child);
                    childNodeSet.add(child);
                    continue;
                }
                childNodeSet.add(child);
                child = child.get("next");
            }
        }
        this.independentRoots = [...rootNodeSet];
        let yOffset = 0;
        for(const ir of this.independentRoots) {
            const nodes: UtilityObject[] = [];
            let n: Value = ir;
            while(n.getType().isDefined() && n instanceof UtilityObject) {
                nodes.push(n);
                n = n.get("next");
            }

            let xOffset = nodes.length*40 - 40;
            nodes.reverse();
            for(let i = 0; i < nodes.length; i++) {
                let next = undefined;
                if(i > 0) {
                    next = this.nodeRegistry[nodes[i-1]!.id];
                }
                const node = nodes[i]!;
                if(node.id in this.nodeRegistry) {
                    const data = this.nodeRegistry[node.id]!;
                    data.targetX = xOffset;
                    data.targetY = yOffset;
                    if(Math.abs(data.targetX - data.originX) > 1 && Math.abs(data.targetY - data.originY) > 1) data.originY += 20;
                    data.next = next;
                } else {
                    this.nodeRegistry[node.id] = new S1LRenderer.S1LRenderData(node, next, this.objectCanvas, xOffset, yOffset);
                }
                xOffset -= 40;
            }
            
            yOffset += 30;
        }
    }
    
    protected static S1LRenderData = class implements S1LRenderData {
        private s1l;
        public next: S1LRenderData | undefined;
        private objectCanvas: HTMLCanvasElement;
        public originX;
        public originY;
        private x;
        private y;
        private _targetX;
        private _targetY;
        public w;
        public h;

        public set targetX(targetX: number) {
            this.originX = this._targetX;
            this._targetX = targetX;
        }
        
        public set targetY(targetY: number) {
            this.originY = this._targetY;
            this._targetY = targetY;
        }

        public get targetX() {
            return this._targetX;
        }

        public get targetY() {
            return this._targetY;
        }

        public getX(t: number) {
            return lerp(this.originX, this.targetX, t);
        }

        public getY(t: number) {
            return lerp(this.originY, this.targetY, t);
        }

        constructor(s1l: UtilityObject, next: S1LRenderData | undefined, objectCanvas: HTMLCanvasElement, x: number, y:number) {
            this.s1l = s1l;
            this.objectCanvas = objectCanvas;
            this.next = next;
            this.originX = x;
            this.originY = y+20;
            this.x = this.originX;
            this.y = this.originY;
            this._targetX = x;
            this._targetY = y;
            this.w = 20;
            this.h = 20;
        }

        public render(progress: number) {
            const ctx = this.objectCanvas.getContext("2d")!;
            let node: UtilityObject = this.s1l;
            ctx.fillStyle = "white";
            const x = this.getX(progress);
            const y = this.getY(progress);
            ctx.fillRect(x, y, this.w, this.h);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "black";
            ctx.fillText(node.get("key").asString(), x + this.w / 2, y + this.h / 2);
            if(this.next) {
                ctx.strokeStyle = "white";
                ctx.beginPath();
                ctx.moveTo(x + this.w, y + this.h/2);
                const nextX = this.next.getX(progress);
                const nextY = this.next.getY(progress);
                ctx.lineTo(nextX, nextY + this.next.h/2);
                ctx.lineTo(nextX - 5, nextY + this.next.h/2 - 5);
                ctx.lineTo(nextX, nextY + this.next.h/2);
                ctx.lineTo(nextX - 5, nextY + this.next.h/2 + 5);
                ctx.stroke();
            }
        }
    }
}

class ObjectView extends ProgramView implements AnimatedView {
    private objectCanvas: HTMLCanvasElement;
    private renderers: ObjectRenderer[];

    private addObject(key: string) {
    }

    constructor(runner: StructogramRunner) {
        super(document.querySelector("#object-view")!, runner);
        this.objectCanvas = this.viewElem.querySelector("canvas") as HTMLCanvasElement;
        window.addEventListener("load", () => {
            this.objectCanvas.width = this.objectCanvas.clientWidth;
            this.objectCanvas.height = this.objectCanvas.clientHeight;
        });
        window.addEventListener("resize", () => {
            this.objectCanvas.width = this.objectCanvas.clientWidth;
            this.objectCanvas.height = this.objectCanvas.clientHeight;
        });
        this.renderers = [
            new S1LRenderer(this.objectCanvas, runner.structogram.memory)
        ];
        this.reset();
    }

    public clearEffects(): void {
        this.reset();
    }

    public render(progress: number): void {
        const ctx = this.objectCanvas.getContext("2d")!;
        ctx.clearRect(0, 0, this.objectCanvas.width, this.objectCanvas.height);
        ctx.setTransform(3,0,0,3,0,0);
        this.renderers.forEach(r => r.render(progress));
    }

    public override reset(): void {
        this.objectCanvas.width = this.objectCanvas.clientWidth;
        this.objectCanvas.height = this.objectCanvas.clientHeight;
    }
}

interface AnimatedView {
    render(progress: number): void;
}