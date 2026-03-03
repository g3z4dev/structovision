import {AnyStatementOption, AssignmentBlock, BackTestingLoopBlock, BlockOption, BooleanStatementListOption, CountingLoopBlock, FrontTestingLoopBlock, KeyOption, MultiBranchingBlock, PrintBlock, StatementOption, Structogram, StructogramBlock, TrueFalseBranchingBlock, type Identifiable, type TypeIdentifiable} from "../model/structogram";
import EventEmitter2 from "eventemitter2";
import {type Listener} from "eventemitter2";
import type { Primitive } from "../model/util";
import { Memory } from "../model/memory";
import { Operand, Operator, Statement, type Bracket } from "../model/statement";

import assignmentBlockTemplate from "../../resources/blocks/assignmentblock.html";
import printBlockTemplate from "../../resources/blocks/printblock.html";
import truefalseBranchingBlockTemplate from "../../resources/blocks/truefalsebranchingblock.html";
import multiBranchingBlockTemplate from "../../resources/blocks/multibranchingblock.html";
import countingLoopBlockTemplate from "../../resources/blocks/countingloopblock.html";
import frontTestingLoopBlockTemplate from "../../resources/blocks/fronttestingloopblock.html";
import backTestingLoopBlockTemplate from "../../resources/blocks/backtestingloopblock.html";
import undefinedBlockTemplate from "../../resources/blocks/undefinedblock.html";

import assignmentBlockIcon from "../../resources/toolbar-icons/assignmentblockicon.html";
import printBlockIcon from "../../resources/toolbar-icons/printblockicon.html";
import truefalseBranchingBlockIcon from "../../resources/toolbar-icons/truefalsebranchingblockicon.html";
import multiBranchingBlockIcon from "../../resources/toolbar-icons/multibranchingblockicon.html";
import countingLoopBlockIcon from "../../resources/toolbar-icons/countingloopblockicon.html";
import frontTestingLoopBlockIcon from "../../resources/toolbar-icons/fronttestingloopblockicon.html";
import backTestingLoopBlockIcon from "../../resources/toolbar-icons/backtestingloopblockicon.html";

import statementOptionTemplate from "../../resources/options/statementoption.html";
import booleanStatementListOptionTemplate from "../../resources/options/booleanstatementlistoption.html";
import keyOptionTemplate from "../../resources/options/keyoption.html";

import outputViewTemplate from "../../resources/program-views/outputview.html";
import memoryViewTemplate from "../../resources/program-views/memoryview.html";
import logicViewTemplate from "../../resources/program-views/logicview.html";
import operatorTemplate from "../../resources/program-views/logic-view-templates/operator.html";
import operandTemplate from "../../resources/program-views/logic-view-templates/operand.html";

const baseBlockWidth = 100;
const baseBlockHeight = 30;
const baseRunSpeed = 2000;
const textPadding = 8;
const runningClass = "fill-green-100";
const selectedClass = "fill-cyan-100";
const unselectedClass = "fill-white";

function setID(elem: Element, id: string) {
    elem.setAttribute("id", id);
}

function getID(elem: Element) {
    return elem.getAttribute("id") ?? "";
}

function setX(elem: Element, x: number) {
    elem.setAttribute("x", `${x}`);
}

function setY(elem: Element, y: number) {
    elem.setAttribute("y", `${y}`);
}

function setPosition(elem: Element, x: number, y: number) {
    setX(elem, x);
    setY(elem, y);
}

function setWidth(elem: Element, width: number) {
    elem.setAttribute("width", `${width}`);
}

function setHeight(elem: Element, height: number) {
    elem.setAttribute("height", `${height}`);
}

function setSize(elem: Element, width: number, height: number) {
    setWidth(elem, width);
    setHeight(elem, height);
}

function setScaleFor(elem: Element, xScale: number, yScale: number) {
    elem.setAttribute("transform", `scale(${xScale}, ${yScale})`);
}

function setRelativeScaleFor(elem: HTMLElement, width: number, height: number) {
    setScaleFor(elem, width/baseBlockWidth, height/baseBlockHeight);
}

function parseIntoHTML(text: string) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = text;
    return tempDiv.firstChild as HTMLElement;
}

async function wait(ms: number) {
    await new Promise(r => setTimeout(r, ms));
}

function setTemplateText(elem: HTMLElement, clazz: string, text: string): void {
    const n = elem.querySelector(`.t-${clazz}`) as HTMLElement | undefined;
    if(n) {
        n.textContent = text;
    }
}

type ViewMode = "builder" | "runner";

export class ViewModel {
    private emitter: EventEmitter2 = new EventEmitter2({"maxListeners": 100});
    public currentStructogram: Structogram = new Structogram(this.emitter);
    public readonly structogramBuilder = new StructogramBuilder(this.currentStructogram, this);
    public readonly structogramRunner = new StructogramRunner(this.currentStructogram, this);
    public readonly toolbar = new BlockToolbar(this.currentStructogram);
    public readonly blockEditor = new BlockEditor();
    public readonly timeControl = new TimeControl(this);
    public readonly programViewManager = new ProgramViewManager(this);
    private readonly structogramBuilderElem = document.querySelector("#structogram-builder")!;
    private readonly structogramRunnerElem = document.querySelector("#structogram-runner")!;
    private readonly switchToBuilderButton = document.querySelector("#switch-to-builder-button") as HTMLButtonElement;
    private readonly switchToRunnerButton = document.querySelector("#switch-to-runner-button") as HTMLButtonElement;
    private _mode: ViewMode = "builder";
   
    private set mode(mode: ViewMode) {
        if(mode == "builder") {
            this.structogramBuilderElem.classList.remove("hidden");
            this.structogramRunnerElem.classList.add("hidden");
        } else if(mode == "runner") {
            this.structogramRunnerElem.classList.remove("hidden");
            this.structogramBuilderElem.classList.add("hidden");
            this.structogramRunner.generateHTML();
        }

        this._mode = mode;
    } 

    public get mode() {
        return this._mode;
    }

    constructor() {
        this.structogramBuilder.generateHTML();
        this.currentStructogram.emitter.addListener(Structogram.changedEvent, () => {
            this.structogramBuilder.generateHTML();
        })
        this.toolbar.generateHTML();
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

class StructogramRenderer {
    protected readonly viewModel: ViewModel;
    protected readonly blockResourceManager: ResourceManager = new ResourceManager();
    protected readonly renderTarget;
    protected readonly structogramSVG: HTMLElement;
    protected readonly structogram: Structogram;
    protected structogramX = 0;
    protected structogramY = 0;
    protected structogramWidth = 1024;
    protected scale = 1;
    protected rightClickDown = false;

    private optionListenerRemovers: (() => void)[] = [];

    constructor(structogram: Structogram, viewModel: ViewModel, renderTarget: HTMLElement) {
        this.viewModel = viewModel;
        this.renderTarget = renderTarget;
        this.structogramSVG = this.renderTarget.querySelector(".structogram-svg") as HTMLElement;
        this.blockResourceManager.register("assignmentblock", assignmentBlockTemplate);
        this.blockResourceManager.register("printblock", printBlockTemplate);
        this.blockResourceManager.register("truefalsebranchingblock", truefalseBranchingBlockTemplate);
        this.blockResourceManager.register("multibranchingblock", multiBranchingBlockTemplate);
        this.blockResourceManager.register("countingloopblock", countingLoopBlockTemplate);
        this.blockResourceManager.register("fronttestingloopblock", frontTestingLoopBlockTemplate);
        this.blockResourceManager.register("backtestingloopblock", backTestingLoopBlockTemplate);
        this.blockResourceManager.register("undefined", undefinedBlockTemplate);
        this.structogram = structogram;
        this.setUpMovement();
    }

    private setUpMovement() {
        let lastX = 0;
        let lastY = 0;
        this.renderTarget.addEventListener("mousedown", event => {
            if(event.button == 2) {
                lastX = event.clientX;
                lastY = event.clientY;
                this.rightClickDown = true;
                event.preventDefault();
            }
        });
        this.renderTarget.addEventListener("mousemove", event => {
            if(this.rightClickDown) {
                const deltaX = event.clientX - lastX;
                const deltaY = event.clientY - lastY;
                lastX = event.clientX;
                lastY = event.clientY;
                this.structogramX += deltaX;
                this.structogramY += deltaY;
                this.updateStructogramTransformation();
            }
        });
        document.addEventListener("mouseup", event => {
            if(event.button == 2) {
                this.rightClickDown = false;
            } else if(event.button == 0) {
                this.viewModel.toolbar.blockBrush = undefined;
            }
        });
        this.renderTarget.addEventListener("contextmenu", event => {
            event.preventDefault();
        });
        this.renderTarget.addEventListener("wheel", event => {
            this.scale *= (1+Math.sign(event.deltaY)/20);
            this.updateStructogramTransformation();
            event.preventDefault();
        })
    }

    private updateStructogramTransformation() {
        this.structogramSVG.setAttribute("transform", `translate(${this.structogramX},${this.structogramY}) scale(${this.scale}, ${this.scale})`)
    }

    public generateHTML() {
        if(!this.structogramSVG) return;
        for(const remover of this.optionListenerRemovers) {
            remover();
        }
        this.optionListenerRemovers = [];
        this.structogramSVG.textContent = "";
        let block = this.structogram.startingBlock;
        const height = this.resolveHTMLFor(this.structogramSVG, block);
        setSize(this.structogramSVG, this.structogramWidth, height);
    }

    private replaceOptionValues(elem: HTMLElement, options: BlockOption[], index: number) {
        for(const option of options) {
            const values = option.getValue();
            if(values.length > 1) {
                setTemplateText(elem, option.name, values[index]!);
            } else {
                setTemplateText(elem, option.name, values[0]!);
            }
        }
    }

    private setupTextFor(elem: HTMLElement, options: BlockOption[], width: number, height:number, index: number = 0) {
        if(!this.structogramSVG) return;
        this.replaceOptionValues(elem, options, index);
        const textLabel = elem.querySelector(".t-text") as SVGAElement;
        const textHLocation = elem.dataset.textHLocation ?? "left";
        if(textHLocation == "center") {
            textLabel.setAttribute("x", `${width/2-textLabel.getBBox().width/2}`);
        } else {
            textLabel.setAttribute("x", `${textPadding}`);
        }
        const textVLocation = elem.dataset.textVLocation ?? "top";
        if(textVLocation == "bottom") {
            textLabel.setAttribute("y", `${height - textPadding}`);
        } else {
            textLabel.setAttribute("y", `${baseBlockHeight - textPadding}`);
        }
        for(const option of options) {
            const listener = () => {
                this.replaceOptionValues(elem, options, index);
                if(textHLocation == "center") {
                    textLabel.setAttribute("x", `${width/2-textLabel.getBBox().width/2}`);
                }
            };
            option.emitter.addListener(BlockOption.optionChangedEvent, listener);
            this.optionListenerRemovers.push(() => {
                option.emitter.removeListener(BlockOption.optionChangedEvent, listener);
            });
        }
    }

    private resolveHTMLFor(parent: Element, block: StructogramBlock | undefined, width: number = this.structogramWidth, xOffset: number = 0, _yOffset: number = 0): number {
        if(!this.structogramSVG) return 0;
        let prevBlock: StructogramBlock | undefined = undefined;
        let currentBlock: StructogramBlock | undefined = block;
        let yOffset = _yOffset;
        while(currentBlock != undefined) {
            const elem = this.blockResourceManager.getHTMLForObject(currentBlock)!;
            this.onBlockAdded(currentBlock, elem);
            parent.appendChild(elem);
            const subBlocks = currentBlock.getSubBlocks();
            const subBlockKeys = Object.keys(subBlocks);
            const subBlockCount = Object.keys(subBlocks).length;
            let maxSubBlockHeight = 0;
            for(let i = 0; i < subBlockCount; i++) {
                let childXOffset = Number.parseInt(elem.dataset.childXOffset ?? "0");
                let childYOffset = Number.parseInt(elem.dataset.childYOffset ?? "0");
                const newWidth = (width-childXOffset)/subBlockCount;
                const childHeader = elem.querySelector(".t-child-header") as HTMLElement | undefined;
                if(childHeader) {
                    const header = childHeader.cloneNode(true) as HTMLElement;
                    elem.appendChild(header);
                    for(const child of header.querySelectorAll(":not(svg) *") ?? []) {
                        for(const clazz of child.classList.values()) {
                            if(clazz.includes("%i%")) {
                                child.classList.remove(clazz);
                                child.classList.add(clazz.replace("%i%", `${i}`));
                            }
                        }
                    }
                    const x = childXOffset + newWidth*i;
                    const y = 0;
                    setPosition(header, x, y);
                    setSize(header, newWidth, baseBlockHeight);
                    this.setupTextFor(header, currentBlock.getOptions(), newWidth, baseBlockHeight, i);
                }
                const subBlock = subBlocks[subBlockKeys[i]!];
                if(subBlock) {
                    const subBlockHeight = this.resolveHTMLFor(elem, subBlock, newWidth, childXOffset+newWidth*i, childYOffset);
                    if(subBlockHeight > maxSubBlockHeight) maxSubBlockHeight = subBlockHeight;
                } else {
                    const subBlockHeight = this.onUndefinedSubBlock(elem, currentBlock, subBlockKeys[i]!, newWidth, childXOffset+newWidth*i, childYOffset);
                    if(subBlockHeight > maxSubBlockHeight) maxSubBlockHeight = subBlockHeight;
                }
            }
            const blockHeight = maxSubBlockHeight + baseBlockHeight;
            const heightMode = elem.dataset.height ?? "static";
            function calcVisualHeight() {
                if(heightMode == "dynamic") {
                    return blockHeight;
                } else {
                    return baseBlockHeight;
                }
            }
            const visualHeight = calcVisualHeight();
            setPosition(elem, xOffset, yOffset);
            setSize(elem, width, visualHeight);
            this.setupTextFor(elem, currentBlock.getOptions(), width, visualHeight);
            prevBlock = currentBlock;
            currentBlock = currentBlock?.next;
            yOffset += blockHeight;
        }
        yOffset += this.onUndefinedBlock(parent, prevBlock, width, xOffset, yOffset);
        return yOffset-_yOffset;
    }

    protected onBlockAdded(block: StructogramBlock, elem: HTMLElement) {

    }

    protected onUndefinedBlock(parent: Element, prevBlock: StructogramBlock | undefined, width: number, xOffset: number, yOffset: number) {
        return 0;
    }

    protected onUndefinedSubBlock(parent: Element, parentBlock: StructogramBlock, key: string, width: number, xOffset: number, yOffset: number) {
        return 0;
    }
}

class StructogramBuilder extends StructogramRenderer {
    constructor(structogram: Structogram, viewModel: ViewModel) {
        super(structogram, viewModel, document.querySelector("#build-view")!)
    }

    protected override onBlockAdded(block: StructogramBlock, elem: HTMLElement): void {
        setID(elem, block.getID());
        elem.addEventListener("click", event => {
            if(event.button == 0) {
                this.viewModel.blockEditor.currentBlock = block;
                event.stopPropagation();
            }
        })
        if(this.viewModel.blockEditor.currentBlock == block) {
            for(const e of elem.querySelectorAll(`.${unselectedClass}`)) {
                e.classList.remove(unselectedClass);
                e.classList.add(selectedClass);
            }
        }
    }

    protected override onUndefinedBlock(parent: Element, prevBlock: StructogramBlock | undefined, width:number, xOffset: number, yOffset: number): number {
        const elem = this.blockResourceManager.getHTMLForObject(undefined)!;
        setPosition(elem, xOffset, yOffset);
        setSize(elem, width, baseBlockHeight);
        elem.addEventListener("mouseup", event => {
            if(event.button == 0 && this.viewModel.toolbar.blockBrush) {
                if(prevBlock) {
                    prevBlock.next = this.viewModel.toolbar.blockBrush();
                } else {
                    this.structogram.startingBlock = this.viewModel.toolbar.blockBrush();
                }
            }
        });
        parent.appendChild(elem);
        return baseBlockHeight;
    }

    protected override onUndefinedSubBlock(parent: Element, parentBlock: StructogramBlock, key: string, width: number, xOffset: number, yOffset: number): number {
        const subElem = this.blockResourceManager.getHTMLForObject(undefined)!;
        setPosition(subElem, xOffset, yOffset);
        setSize(subElem, width, baseBlockHeight);
        subElem.addEventListener("mouseup", event => {
            if(event.button == 0 && this.viewModel.toolbar.blockBrush) {
                parentBlock.setSubBlock(key, this.viewModel.toolbar.blockBrush());
            }
        });
        parent.appendChild(subElem);
        return baseBlockHeight;
    }
}

class StructogramRunner extends StructogramRenderer {
    private _currentBlock: StructogramBlock | undefined;
    private _activeBlockStep: string | undefined;
    private paused: boolean = false;

    public set currentBlock(currentBlock: StructogramBlock | undefined) {
        if(this._currentBlock) {
            for(const e of this.renderTarget.querySelectorAll(`#${this._currentBlock.id} > .${runningClass}, #${this._currentBlock.id} > svg.t-child-header > .${runningClass}`) ?? []) {
                e?.classList.remove(runningClass);
                e?.classList.add(unselectedClass);
            }
            currentBlock?.emitter.removeAllListeners(StructogramBlock.activeStepChanged);
        }
        this.activeBlockStep = undefined;
        this._currentBlock = currentBlock;
        if(currentBlock) {
            for(const e of this.renderTarget.querySelectorAll(`#${currentBlock.id} > .${unselectedClass}, #${currentBlock.id} > svg.t-child-header > .${unselectedClass}`) ?? []) {
                e?.classList.remove(unselectedClass);
                e?.classList.add(runningClass);
                this.activeBlockStep = currentBlock.activeStep;
            }
            currentBlock.emitter.addListener(StructogramBlock.activeStepChanged, step => {
                this.activeBlockStep = step;
            });
        } else {
            this.activeBlockStep = undefined;
        }
    }

    protected set activeBlockStep(step: string | undefined) {
        if(this._activeBlockStep && this.currentBlock) {
            for(const e of this.renderTarget.querySelectorAll(`#${this.currentBlock.id} > :not(svg) .t-step-${this._activeBlockStep}, #${this.currentBlock.id} >  svg.t-child-header .t-step-${this._activeBlockStep}`) ?? []) {
                e?.classList.remove("font-bold", "stroke-green-500");
            }
        }
        this._activeBlockStep = step;
        if(this._activeBlockStep && this.currentBlock) {
            for(const e of this.renderTarget.querySelectorAll(`#${this.currentBlock.id} > :not(svg) .t-step-${this._activeBlockStep}, #${this.currentBlock.id} >  svg.t-child-header .t-step-${this._activeBlockStep}`) ?? []) {
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

    constructor(structogram: Structogram, viewModel: ViewModel) {
        super(structogram, viewModel, document.querySelector("#run-view")!)
    }

    public async start() {
        if(!this.structogram.isRunning()) this.structogram.preRun();
        this.paused = false;
        this.currentBlock = this.structogram.currentBlock;
        do {
            this.viewModel.programViewManager.clearEffects();
            this.structogram.runStep();
            await wait(baseRunSpeed / this.viewModel.timeControl.currentSpeed);
            if(!this.paused) this.currentBlock = this.structogram.currentBlock;
        } while (this.structogram.isRunning() && !this.paused);
        if(!this.structogram.isRunning()) this.currentBlock = undefined;
    }

    public pause() {
        this.paused = true;
    }

    protected override onBlockAdded(block: StructogramBlock, elem: HTMLElement): void {
        setID(elem, block.getID());
    }

    /*protected override onUndefinedBlock(parent: Element, prevBlock: StructogramBlock | undefined, width:number, xOffset: number, yOffset: number): number {
        const elem = this.blockResourceManager.getHTMLForObject(undefined)!;
        setPosition(elem, xOffset, yOffset);
        setSize(elem, width, baseBlockHeight);
        parent.appendChild(elem);
        return baseBlockHeight;
    }

    protected override onUndefinedSubBlock(parent: Element, parentBlock: StructogramBlock, key: string, width: number, xOffset: number, yOffset: number): number {
        const subElem = this.blockResourceManager.getHTMLForObject(undefined)!;
        setPosition(subElem, xOffset, yOffset);
        setSize(subElem, width, baseBlockHeight);
        parent.appendChild(subElem);
        return baseBlockHeight;
    }*/
}

class ToolbarEntry {
    private readonly icon: HTMLElement;
    private readonly _name: string;
    private readonly _description: string;
    private readonly factory: () => StructogramBlock;

    constructor(toolbar: BlockToolbar, icon: string, name: string, description: string, factory: () => StructogramBlock) {
        this.icon = parseIntoHTML(icon);
        this.icon.classList.add("w-full");
        this.icon.classList.add("h-full");
        this._name = name;
        this._description = description;
        this.factory = factory;
        this.icon.addEventListener("mousedown", event => {
            if(event.button == 0) {
                toolbar.blockBrush = factory;
                event.stopPropagation();
            }
        })
    }

    public get name() {
        return this._name;
    }

    public get description() {
        return this._description;
    }

    public createBlock(): StructogramBlock {
        return this.factory();
    }

    public getIcon() {
        return this.icon;
    }
}

class BlockToolbar {
    private readonly toolbarEntries: ToolbarEntry[];
    private readonly toolbarNode = document.querySelector("#toolbar")!;
    private _blockBrush: (() => StructogramBlock) | undefined;

    constructor(structogram: Structogram) {
        this.toolbarEntries = [
            new ToolbarEntry(
                this,
                assignmentBlockIcon, 
                "Assignment block", 
                "desc",
                () => new AssignmentBlock(structogram)),
            new ToolbarEntry(
                this,
                printBlockIcon, 
                "Print block", 
                "desc",
                () => new PrintBlock(structogram)),
                
            new ToolbarEntry(
                this,
                truefalseBranchingBlockIcon, 
                "True False branching block", 
                "desc",
                () => new TrueFalseBranchingBlock(structogram)),
            new ToolbarEntry(
                this,
                multiBranchingBlockIcon, 
                "Multi branching block", 
                "desc",
                () => new MultiBranchingBlock(structogram)),
            new ToolbarEntry(
                this,
                countingLoopBlockIcon, 
                "Counting loop block", 
                "desc",
                () => new CountingLoopBlock(structogram)),
            new ToolbarEntry(
                this,
                frontTestingLoopBlockIcon, 
                "Front testing loop block", 
                "desc",
                () => new FrontTestingLoopBlock(structogram)),
            new ToolbarEntry(
                this,
                backTestingLoopBlockIcon, 
                "Back testing loop block", 
                "desc",
                () => new BackTestingLoopBlock(structogram))
            ];
    }

    public get blockBrush() {
        return this._blockBrush;
    }

    public set blockBrush(blockBrush: (() => StructogramBlock) | undefined) {
        this._blockBrush = blockBrush;
    }

    public generateHTML() {
        this.toolbarNode.innerHTML = "";
        for(const entry of this.toolbarEntries) {
            const toolbarIcon = entry.getIcon();
            const div = document.createElement("div");
            div.classList.add("flex-auto");
            div.classList.add("p-2");
            div.appendChild(toolbarIcon);
            this.toolbarNode.appendChild(div);
        }
    }
}

class ResourceManager {
    private resourceCache: Record<string, string> = {};

    public register(typeID: string, html: string) {
        this.resourceCache[typeID] = html;
    }

    public getHTMLForObject(object: TypeIdentifiable | undefined) {
        if(object) {
            return this.getHTMLFor(object.getTypeIdentifier());
        }
        return this.getHTMLFor("undefined");
    }

    public getHTMLFor(id: string) {
        if(!(id in this.resourceCache)) {
            return undefined;
        }
        const htmlText = this.resourceCache[id]!;
        const element: HTMLElement = parseIntoHTML(htmlText);
        return element;
    }
}

abstract class OptionHandler {
    private optionResourceManager: ResourceManager;

    constructor(optionResourceManager: ResourceManager) {
        this.optionResourceManager = optionResourceManager;
    }

    public getHTMLNodeFor(option: BlockOption, block: StructogramBlock) {
        const node = this.optionResourceManager.getHTMLForObject(option);
        if(!node) return undefined;
        this.applyLogic(option, block, node);
        return node;
    }

    protected abstract applyLogic(option: BlockOption, block: StructogramBlock, node: Element): void;
}

class StatementOptionHandler<J extends Primitive> extends OptionHandler {
    protected override applyLogic(option: StatementOption<J>, block: StructogramBlock, node: Element): void {
        node.innerHTML = 
            node.innerHTML
                .replaceAll("%id%", block.id + "-" + option.name)
                .replaceAll("%name%", option.name);     
        const textField = node.querySelector("input[type=\"text\"]")! as HTMLFormElement;
        textField.value = option.getStatement();
        textField.addEventListener("change", () => {
            option.setStatement(textField.value);
        });
    }   
}

class BooleanStatementListOptionHandler extends OptionHandler {

    private updateStatements(form: HTMLElement, option: BooleanStatementListOption) {
        const fields = [...form.querySelectorAll("input[type=\"text\"]")!.values()] as HTMLFormElement[];
        option.setStatements(fields.map(f => f.value));
    }

    private addUpdateEventTo(form: HTMLElement, textField: HTMLFormElement, option: BooleanStatementListOption) {
        textField.addEventListener("change", () => {
            this.updateStatements(form, option);
        })
    }

    private cloneAndAddTextField(form: HTMLElement, conditionEntry: HTMLElement, index: number, option: BooleanStatementListOption) {
        const copy = conditionEntry.cloneNode(true) as HTMLElement;
        form.appendChild(copy);
        const textField = copy.querySelector("input[type=\"text\"]") as HTMLFormElement;
        const removeButton = copy.querySelector("input[type=\"button\"]") as HTMLFormElement;
        removeButton.addEventListener("click", event => {
            if(event.button == 0) {
                form.removeChild(copy);
                this.updateStatements(form, option);
            }
        })
        textField.value = option.getStatements()[index];
        this.addUpdateEventTo(form, textField, option);
        return copy;
    }

    protected override applyLogic(option: BooleanStatementListOption, block: StructogramBlock, node: Element): void {
        node.innerHTML = 
            node.innerHTML
                .replaceAll("%id%", block.id + "-" + option.name)
                .replaceAll("%name%", option.name);
        const form = node.querySelector("form") as HTMLElement;
        const conditionEntry = node.querySelector(".js-condition-entry") as HTMLElement;
        const textField = conditionEntry.querySelector("input[type=\"text\"]") as HTMLFormElement;
        const removeButton = conditionEntry.querySelector("input[type=\"button\"]") as HTMLFormElement;
        removeButton.addEventListener("click", event => {
            if(event.button == 0) {
                form.removeChild(conditionEntry);
                this.updateStatements(form, option);
            }
        })
        const statementCount = option.getStatements().length;
        textField.value = option.getStatements()[0];
        this.addUpdateEventTo(form, textField, option);
        let i = 1;
        for(; i < statementCount; i++) {
            this.cloneAndAddTextField(form, conditionEntry, i, option);
        }
        const addButton = node.querySelector(`#${block.id}-${option.name}-add-button`) as HTMLElement;
        addButton.addEventListener("click", event => {
            if(event.button == 0) {
                i++;
                this.cloneAndAddTextField(form, conditionEntry, i, option);
                this.updateStatements(form, option);
            }
        })
    }   
}

class KeyOptionHandler extends OptionHandler {
    protected override applyLogic(option: KeyOption, block: StructogramBlock, node: Element): void {
        node.innerHTML = 
            node.innerHTML
                .replaceAll("%id%", block.id + "-" + option.name)
                .replaceAll("%name%", option.name);     
        const textField = node.querySelector("input[type=\"text\"]")! as HTMLFormElement;
        textField.value = option.getKey();
        textField.addEventListener("change", () => {
            option.setValue(textField.value);
        });
    }   
}

class BlockEditor {
    private _currentBlock: StructogramBlock | undefined;
    private blockEditorNode = document.querySelector("#block-editor")!;
    private optionResourceManager: ResourceManager = new ResourceManager();
    private optionHandlers: Record<string, OptionHandler> = {};

    constructor() {
        this.optionResourceManager.register("anystatementoption", statementOptionTemplate);
        this.optionHandlers["anystatementoption"] = new StatementOptionHandler<Primitive>(this.optionResourceManager);
        this.optionResourceManager.register("numericstatementoption", statementOptionTemplate);
        this.optionHandlers["numericstatementoption"] = new StatementOptionHandler<number>(this.optionResourceManager);
        this.optionResourceManager.register("stringstatementoption", statementOptionTemplate);
        this.optionHandlers["stringstatementoption"] = new StatementOptionHandler<string>(this.optionResourceManager);
        this.optionResourceManager.register("booleanstatementoption", statementOptionTemplate);
        this.optionHandlers["booleanstatementoption"] = new StatementOptionHandler<boolean>(this.optionResourceManager);
        this.optionResourceManager.register("booleanstatementlistoption", booleanStatementListOptionTemplate);
        this.optionHandlers["booleanstatementlistoption"] = new BooleanStatementListOptionHandler(this.optionResourceManager);
        this.optionResourceManager.register("keyoption", keyOptionTemplate);
        this.optionHandlers["keyoption"] = new KeyOptionHandler(this.optionResourceManager);
    }

    public generateHTML() {
        this.blockEditorNode.textContent = "";
        if(this._currentBlock) {
            for(const option of this._currentBlock.getOptions()) {
                if(option.getTypeIdentifier() in this.optionHandlers) {
                    const node = this.optionHandlers[option.getTypeIdentifier()]!.getHTMLNodeFor(option, this._currentBlock);
                    if(node) this.blockEditorNode.appendChild(node);
                }
            }
        }
    }

    public set currentBlock(block: StructogramBlock | undefined) {
        if(this._currentBlock) {
            const node = document.querySelector(`#${this._currentBlock.id}`);
            if(node) {
                for(const e of node.querySelectorAll(`.${selectedClass}`)) {
                    e.classList.remove(selectedClass);
                    e.classList.add(unselectedClass);
                }
            }
        }
        this._currentBlock = block;
        if(this._currentBlock) {
            const node = document.querySelector(`#${this._currentBlock.id}`);
            if(node) {
                for(const e of node.querySelectorAll(`.${unselectedClass}`)) {
                    e.classList.remove(unselectedClass);
                    e.classList.add(selectedClass);
                }
            }
        }
        this.generateHTML();
    }

    public get currentBlock() {
        return this._currentBlock;
    }

}

class TimeControl {
    private readonly viewModel: ViewModel;
    private readonly startButton = document.querySelector("#start-button") as HTMLButtonElement;
    private readonly pauseButton = document.querySelector("#pause-button") as HTMLButtonElement;
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
        8: 4
    }
    private _currentSpeedIndex = 4;

    private set currentSpeedIndex(currentSpeed: number) {
        if(currentSpeed < 0) currentSpeed = 0;
        if(currentSpeed > 8) currentSpeed = 8;
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

    constructor(viewModel: ViewModel) {
        this.viewModel = viewModel;
        this.setupButtons();
    }

    private setupButtons() {
        this.startButton.addEventListener("click", event => {
            if(this.viewModel.mode == "runner") {
                this.viewModel.structogramRunner.start();
            }
        });
        this.pauseButton.addEventListener("click", event => {
            if(this.viewModel.mode == "runner") {
                this.viewModel.structogramRunner.pause();
            }
        });
        this.slowerButton.addEventListener("click", event => {
            if(this.viewModel.mode == "runner") {
                this.currentSpeedIndex -= 1;
            }
        });
        this.fasterButton.addEventListener("click", event => {
            if(this.viewModel.mode == "runner") {
                this.currentSpeedIndex += 1;
            }
        });
    }
}

class ProgramViewManager {
    public static readonly ready = "programviewmanager.ready";
    private emitter: EventEmitter2 = new EventEmitter2();
    private viewModel: ViewModel;
    private printView: OutputView;
    private memoryView: MemoryView;
    private logicView: LogicView;
    private readonly programViewsElem = document.querySelector("#program-views")!;

    constructor(viewModel: ViewModel) {
        this.viewModel = viewModel;
        this.printView = new OutputView(viewModel);
        this.memoryView = new MemoryView(viewModel);
        this.logicView = new LogicView(viewModel);
        this.programViewsElem.appendChild(this.printView.getElement());
        this.programViewsElem.appendChild(this.memoryView.getElement());
        this.programViewsElem.appendChild(this.logicView.getElement());
    }

    public clearEffects() {
        this.printView.clearEffects();
        this.memoryView.clearEffects();
        this.logicView.clearEffects();
    }

    public render(delta: number) {
        
    }
}

abstract class ProgramView {
    protected viewModel: ViewModel;
    
    constructor(viewModel: ViewModel) {
        this.viewModel = viewModel;
    }

    public abstract getElement(): HTMLElement;
    public abstract reset(): void;

    public clearEffects() {

    }

}

class OutputView extends ProgramView {
    private outputViewElem = parseIntoHTML(outputViewTemplate) as HTMLElement;
    private logTemplateElem = this.outputViewElem.querySelector("p.js-log-template")!.cloneNode() as HTMLElement;

    constructor(viewModel: ViewModel) {
        super(viewModel);
        this.reset();
        this.viewModel.currentStructogram.emitter.addListener(Structogram.printEvent, msg => {
            const log = this.logTemplateElem.cloneNode() as HTMLElement;
            log.textContent = msg;
            this.outputViewElem.appendChild(log);
        });
    }

    public override getElement(): HTMLElement {
        return this.outputViewElem;
    }


    public override reset() {
        this.outputViewElem.innerText = "";
    }
}

class MemoryView extends ProgramView {
    private memoryViewElem = parseIntoHTML(memoryViewTemplate) as HTMLElement;
    private memoryViewEntriesElem = this.memoryViewElem.querySelector(".js-memory-entries") as HTMLElement;
    private memoryTemplateElem = this.memoryViewElem.querySelector(".js-memory-template")!.cloneNode(true) as HTMLElement;
    private readonly changedStyle = ["bg-orange-300"];
    private readonly accessedStyle = ["bg-green-300"];
    private readonly changedAndAccessedStyle = ["bg-blue-300"];

    private addEntry(key: string, value: Primitive) {
        const memoryEntry = this.memoryTemplateElem.cloneNode(true) as HTMLElement;
        const keyElem = memoryEntry.querySelector(".js-memory-key") as HTMLElement;
        const valueElem = memoryEntry.querySelector(".js-memory-value") as HTMLElement;
        keyElem.textContent = key;
        valueElem.textContent = value.toString();
        setID(memoryEntry, `v-${key}`);
        this.memoryViewEntriesElem.appendChild(memoryEntry);
    }

    constructor(viewModel: ViewModel) {
        super(viewModel);
        this.reset();
        const memory = this.viewModel.currentStructogram.memory;
        memory.emitter.addListener(Memory.variableAddedEvent, (key, value) => {   
            this.addEntry(key, value);
        });
        memory.emitter.addListener(Memory.variableChangedEvent, (key, value) => {
            const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${key}`) as HTMLElement;
            const valueElem = memoryEntry.querySelector(".js-memory-value") as HTMLElement;
            valueElem.textContent = value;
            if(this.isStyleSubset(memoryEntry, this.changedStyle)) {
                this.clearStyle(memoryEntry, this.changedStyle);
                memoryEntry.classList.add(...this.changedAndAccessedStyle);
            }
            memoryEntry.classList.add(...this.changedStyle);
        });
        memory.emitter.addListener(Memory.variableAccessedEvent, key => {
            const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${key}`) as HTMLElement;
            if(this.isStyleSubset(memoryEntry, this.accessedStyle)) {
                this.clearStyle(memoryEntry, this.accessedStyle);
                memoryEntry.classList.add(...this.changedAndAccessedStyle);
            }
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

    private isStyleSubset(elem: HTMLElement, styles: string[]) {
        for(const style of styles) {
            if(!elem.classList.contains(style)) {
                return false;
            }
        }
        return true;
    }

    public override clearEffects(): void {
        const memory = this.viewModel.currentStructogram.memory;
        for(const [key, _] of memory.getEntries()) {
            const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${key}`) as HTMLElement;
            this.clearStyle(memoryEntry, this.changedStyle);
            this.clearStyle(memoryEntry, this.accessedStyle);
            this.clearStyle(memoryEntry, this.changedAndAccessedStyle);
        }
    }

    public override getElement(): HTMLElement {
        return this.memoryViewElem;
    }

    public reset(): void {
        this.memoryViewEntriesElem.textContent = "";
        const memory = this.viewModel.currentStructogram.memory;
        for(const [key, value] of memory.getEntries()) {
            this.addEntry(key, value);
        }
    }
}

class LogicView extends ProgramView implements AnimatedView {
    private logicViewElem = parseIntoHTML(logicViewTemplate) as HTMLElement;
    private operandTemplateElem = parseIntoHTML(operandTemplate) as HTMLElement;
    private operatorTemplateElem = parseIntoHTML(operatorTemplate) as HTMLElement;

    private addOperator(operator: Operator | string) {
        const elem = this.operatorTemplateElem.cloneNode(true) as HTMLElement;
        if(operator instanceof Operator) {
            setTemplateText(elem, "representation", operator.getRepresentingChar());
        } else {
            setTemplateText(elem, "representation", operator);
        }
        this.logicViewElem.appendChild(elem);
    }

    private addOperand(operand: Operand | string) {
        const elem = this.operandTemplateElem.cloneNode(true) as HTMLElement;
        if(operand instanceof Operand) {
            setTemplateText(elem, "representation", operand.getRepresentation());
            setTemplateText(elem, "value", operand.resolve().toString());
        } else {
            setTemplateText(elem, "representation", "");
            setTemplateText(elem, "value", operand);
        }
        this.logicViewElem.appendChild(elem);
    }

    constructor(viewModel: ViewModel) {
        super(viewModel);
        this.reset();
        Statement.emitter.on(Statement.evaluationStart, (statementTokens: (Operand | Operator | Bracket)[]) =>{
            for(const token of statementTokens) {
                if(token instanceof Operand) {
                    this.addOperand(token);
                } else {
                    this.addOperator(token);
                }
            }
        });
        
        Statement.emitter.on(Statement.evaluationEnd, (result: Primitive) =>{
            this.addOperator("->");
            this.addOperand(result.toString());
        });
    }

    public clearEffects(): void {
        this.reset();
    }

    public render(delta: number): void {
        
    }

    public override reset(): void {
        this.logicViewElem.textContent = "";
    }

    public override getElement(): HTMLElement {
        return this.logicViewElem;
    }
}

interface AnimatedView {
    render(delta: number): void;
}