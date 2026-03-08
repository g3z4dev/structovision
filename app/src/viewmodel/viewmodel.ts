import {AnyStatementOption, AssignmentBlock, BackTestingLoopBlock, BlockOption, BooleanStatementListOption, CountingLoopBlock, FrontTestingLoopBlock, KeyOption, MultiBranchingBlock, PrintBlock, StatementOption, Structogram, StructogramBlock, TrueFalseBranchingBlock, type Identifiable, type TypeIdentifiable} from "../model/structogram";
import EventEmitter2 from "eventemitter2";
import {type Listener} from "eventemitter2";
import type { Primitive } from "../model/util";
import { Memory, MemoryEntry, type VariableType} from "../model/memory";
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

import statementOptionTemplate from "../../resources/settings/structogram-options/statementoption.html";
import booleanStatementListOptionTemplate from "../../resources/settings/structogram-options/booleanstatementlistoption.html";
import keyOptionTemplate from "../../resources/settings/structogram-options/keyoption.html";
import dataSettingsTemplate from "../../resources/settings/datasettings.html";

import outputViewTemplate from "../../resources/program-views/outputview.html";
import memoryViewTemplate from "../../resources/program-views/memoryview.html";
import logicViewTemplate from "../../resources/program-views/logicview.html";
import operatorTemplate from "../../resources/program-views/logic-view-templates/operator.html";
import operandTemplate from "../../resources/program-views/logic-view-templates/operand.html";

import inputDataEntryTemplate from "../../resources/settings/inputdataentry.html";

const baseBlockWidth = 100;
const baseBlockHeight = 30;
const baseRunSpeed = 2000;
const textPadding = 8;
const runningClass = ["fill-green-100"];
const notRunningClass = ["fill-white", "hover:fill-cyan-50"];
const selectedClass = ["fill-cyan-100"];
const unselectedClass = ["fill-white", "hover:fill-cyan-50"];

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

function getX(elem: Element): number {
    return Number.parseInt(elem.getAttribute("x")!);
}

function getY(elem: Element): number {
    return Number.parseInt(elem.getAttribute("y")!);
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

/**
 * This function takes a string parses it into an HTMLElement by the browser.
 * @param text the text to convert
 * @returns the converted html node
 */
function parseIntoHTML(text: string) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = text;
    return tempDiv.firstChild as HTMLElement;
}

async function wait(ms: number) {
    await new Promise(r => setTimeout(r, ms));
}

/**
 * Takes an element and searches for a child node in it that has a given class with a prefix "t-", if it finds a node
 * like that it replaces the text content within it to a given text.
 * @param elem the elem to search in
 * @param clazz the class to search for
 * @param text the text to replace the text content for
 */
function setTemplateText(elem: HTMLElement, clazz: string, text: string): void {
    const n = elem.querySelector(`.t-${clazz}`) as HTMLElement | undefined;
    if(n) {
        n.textContent = text;
    }
}

/**
 * Takes an element and searches for a child node in it that has a given class with a prefix "t-", if it finds a node
 * like that it returns its text content.
 * @param elem the elem to search in
 * @param clazz the class to search for
 * @returns the text content of that found node
 */
function getTemplateText(elem: HTMLElement, clazz: string): string {
    const n = elem.querySelector(`.t-${clazz}`) as HTMLElement | undefined;
    return n!.textContent;
}

/**
 * A shorthand for applying transformation (translation and scaling) to an element
 * @param elem the element to apply the transformation on
 * @param x the x component to translate with
 * @param y the y component to translate with
 * @param scale the x and y scaling to scale with
 */
function applyTransformation(elem: Element, x: number, y: number, scale: number) {
    elem.setAttribute("transform", `scale(${scale}, ${scale}) translate(${x},${y}) `);
}

type ViewMode = "builder" | "runner";

export class ViewModel {
    private emitter: EventEmitter2 = new EventEmitter2({"maxListeners": 100});
    public structogram: Structogram = new Structogram(this.emitter);
    public readonly structogramBuilder = new StructogramBuilder(this.structogram, this);
    public readonly structogramRunner = new StructogramRunner(this.structogram, this);
    public readonly structogramSpecificator = new StructogramSpecificator(this);
    private readonly structogramBuilderElem = document.querySelector("#structogram-builder")!;
    private readonly structogramRunnerElem = document.querySelector("#structogram-runner")!;
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
            this.structogramBuilderElem.classList.remove("hidden");
            this.structogramRunnerElem.classList.add("hidden");
        } else if(mode == "runner") {
            this.structogramRunnerElem.classList.remove("hidden");
            this.structogramBuilderElem.classList.add("hidden");
            this.structogramRunner.updateHTML();
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

/**
 * This class is used identify the context in which an undefined block was found in.
 */
class UndefinedBlockContext {
    public readonly parent: StructogramBlock | undefined;
    public readonly superBlock: StructogramBlock | undefined;
    public readonly subBlockKey: string | undefined;
    public readonly isStartBlock: boolean;

    constructor(parent: StructogramBlock | undefined, superBlock: StructogramBlock | undefined, subBlockKey: string | undefined, isStartBlock: boolean) {
        this.parent = parent;
        this.superBlock = superBlock;
        this.subBlockKey = subBlockKey;
        this.isStartBlock = isStartBlock;
    }
}

class StructogramRenderer {
    protected readonly viewModel: ViewModel;
    protected readonly blockResourceManager: ResourceManager = new ResourceManager();
    protected readonly mainDiv;
    protected readonly renderTarget;
    protected readonly structogramSVG: SVGSVGElement;
    public readonly structogram: Structogram;
    protected readonly originOffsetX;
    protected readonly originOffsetY;
    protected originX = 0;
    protected originY = 0;
    protected structogramWidth = 1024;
    protected scale = 1;
    protected rightClickDown = false;

    /**
     * This is potentially a temporary solution for removing specified listeners from an emitter.
     * Could be replaced for a more robust solution.
     */
    private optionListenerRemovers: (() => void)[] = [];

    constructor(structogram: Structogram, viewModel: ViewModel, mainDiv: HTMLElement) {
        this.viewModel = viewModel;
        this.mainDiv = mainDiv;
        this.renderTarget = mainDiv.querySelector(".render-target") as SVGSVGElement;
        this.structogramSVG = this.renderTarget.querySelector(".structogram-svg") as SVGSVGElement;
        this.originOffsetX = getX(this.structogramSVG);
        this.originOffsetY = getY(this.structogramSVG);
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

    /**
     * Sets up the controls for moving around the virtual "camera" of what we see from the structogram.
     */
    private setUpMovement() {
        let lastX = 0;
        let lastY = 0;
        this.mainDiv.addEventListener("mousedown", event => {
            if(event.button == 2) {
                lastX = event.clientX;
                lastY = event.clientY;
                this.rightClickDown = true;
                event.preventDefault();
            }
        });
        this.mainDiv.addEventListener("mousemove", event => {
            if(this.rightClickDown) {
                const deltaX = event.clientX - lastX;
                const deltaY = event.clientY - lastY;
                lastX = event.clientX;
                lastY = event.clientY;
                this.originX += deltaX;
                this.originY += deltaY;
                this.updateStructogramViewTransformation();
            }
        });
        document.addEventListener("mouseup", event => {
            if(event.button == 2) {
                this.rightClickDown = false;
            }
        });
        this.mainDiv.addEventListener("contextmenu", event => {
            event.preventDefault();
        });
        this.mainDiv.addEventListener("wheel", event => {
            this.scale *= (1+Math.sign(event.deltaY)/20);
            this.updateStructogramViewTransformation();
            event.preventDefault();
        })
    }

    /**
     * Updates the transformation used on the strutogramview to give the illusion of a camera moving.
     */
    protected updateStructogramViewTransformation() {
        applyTransformation(this.renderTarget, this.originX - this.originOffsetX, this.originY - this.originOffsetY, this.scale);
    }

    /**
     * Updates the HTML for the active structogram.
     */
    public updateHTML() {
        if(!this.structogramSVG) return;
        for(const remover of this.optionListenerRemovers) {
            remover();
        }
        this.optionListenerRemovers = [];
        this.structogramSVG.textContent = "";
        let block = this.structogram.startingBlock;
        const height = this.resolveHTMLFor(this.structogramSVG, block);
        setSize(this.structogramSVG, this.structogramWidth, height);
        this.updateStructogramViewTransformation();
    }

    /**
     * Used to update the text content of an element. It will take the values given by a block option and display them
     * in element with the same class as the option's name.
     * 
     * The index is used for options that have multiple values, like BooleanStatementListOptions.
     * @param elem the elem to replace the values on
     * @param options the block options
     * @param index the index
     */
    private replaceOptionValues(elem: HTMLElement, options: BlockOption[], index: number) {
        for(const option of options) {
            const values = option.getRawValues();
            if(values.length > 1) {
                setTemplateText(elem, option.name, values[index]!);
            } else {
                setTemplateText(elem, option.name, values[0]!);
            }
        }
    }

    /**
     * Sets up the text label for a given strutogramblock in accordance of how it was defined.
     * See developer documentation on how structogramblocks are defined.
     * 
     * The index is used for blocks with subblock headers to differentiate between them.
     * @param elem the element represeting the block
     * @param options the options of the block
     * @param width the width given to the block
     * @param height the height given to the block
     * @param index the index of the header
     */
    private setupTextFor(elem: HTMLElement, options: BlockOption[], width: number, height:number, index: number = 0) {
        if(!this.structogramSVG) return;
        this.replaceOptionValues(elem, options, index);
        const textLabel = elem.querySelector(".t-text") as SVGTextElement;
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

    /**
     * The main function of the StructogramRenderer. Takes a parent element and generates and svg image into it containing
     * the HTML representation of a full StructogramBlock tree. This function is recursive for subblocks.
     * @param parent the element to generate the image into
     * @param block the starting block of the tree
     * @param width the width to use for the tree
     * @param xOffset the x offset of the tree
     * @param _yOffset the y offset of the tree
     * @returns the height of the tree generated
     */
    protected resolveHTMLFor(parent: Element, block: StructogramBlock | undefined, width: number = this.structogramWidth, xOffset: number = 0, _yOffset: number = 0): number {
        let prevBlock: StructogramBlock | undefined = undefined;
        let currentBlock: StructogramBlock | undefined = block;
        let yOffset = _yOffset;
        while(currentBlock != undefined) {
            const elem = this.blockResourceManager.getHTMLForObject(currentBlock)!;
            this.onBlockAdded(currentBlock, prevBlock, elem);
            parent.appendChild(elem);
            const subBlocks = currentBlock.getSubBlocks();
            const subBlockKeys = Object.keys(subBlocks);
            const subBlockCount = Object.keys(subBlocks).length;
            let maxSubBlockHeight = 0;
            
            function resolveSubBlocks(renderer: StructogramRenderer, currentBlock: StructogramBlock, i: number) {
                let subBlockXOffset = Number.parseInt(elem.dataset.subblockXOffset ?? "0");
                let subBlockYOffset = Number.parseInt(elem.dataset.subblockYOffset ?? "0");
                const newWidth = (width-subBlockXOffset)/subBlockCount;
                const childHeader = elem.querySelector(".t-subblock-header") as HTMLElement | undefined;
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
                    const x = subBlockXOffset + newWidth*i;
                    const y = 0;
                    setPosition(header, x, y);
                    setSize(header, newWidth, baseBlockHeight);
                    renderer.setupTextFor(header, currentBlock.getOptions(), newWidth, baseBlockHeight, i);
                }
                const subBlock = subBlocks[subBlockKeys[i]!];
                if(subBlock) {
                    const subBlockHeight = renderer.resolveHTMLFor(elem, subBlock, newWidth, subBlockXOffset+newWidth*i, subBlockYOffset);
                    if(subBlockHeight > maxSubBlockHeight) maxSubBlockHeight = subBlockHeight;
                } else {
                    const subBlockHeight = renderer.onUndefinedBlock(elem, new UndefinedBlockContext(undefined, currentBlock, subBlockKeys[i]!, false), newWidth, subBlockXOffset+newWidth*i, subBlockYOffset);
                    if(subBlockHeight > maxSubBlockHeight) maxSubBlockHeight = subBlockHeight;
                }
            }
            for(let i = 0; i < subBlockCount; i++) {
                resolveSubBlocks(this, currentBlock, i);
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
        yOffset += this.onUndefinedBlock(parent, new UndefinedBlockContext(prevBlock, undefined, undefined, !prevBlock && (parent == this.structogramSVG)), width, xOffset, yOffset);
        return yOffset-_yOffset;
    }

    /**
     * This method is called when a block has been resolved into an HTML element.
     * @param block the block that has been resolved
     * @param parent the parent block
     * @param elem the HTML element it was resolve into
     */
    protected onBlockAdded(block: StructogramBlock, parent: StructogramBlock | undefined, elem: HTMLElement) {

    }

    /**
     * This method is called when the end of a block tree is reached. Can be used to add special elements at the end of trees.
     * @param parent the element it was rendered into
     * @param context the context of the undefined block
     * @param width the width to use
     * @param xOffset the x offset
     * @param yOffset the y offset
     * @returns the height of the special element if there's one
     */
    protected onUndefinedBlock(parent: Element, context: UndefinedBlockContext, width: number, xOffset: number, yOffset: number) {
        return 0;
    }
}

/**
 * Represents a block that is currently being dragged by the mouse with all of its context clues included.
 */
class MovingBlock {
    public associatedElement: Element | undefined;
    public block: StructogramBlock;
    public readonly startX: number;
    public readonly startY: number;

    constructor(block: StructogramBlock, startX: number, startY: number) {
        this.block = block;
        this.startX = startX;
        this.startY = startY;
    }
}

/**
 * Represents an action that can be taken in the builder. Used for timeline management.
 */
abstract class BuilderAction {
    /**
     * Reverts the action and returns the action it performed to do said revertion.
     */
    public abstract revert(): BuilderAction;
}

class OptionSetAction extends BuilderAction {
    private readonly option: BlockOption;
    private readonly rawValues: string[];
    private readonly previousRawValues: string[];

    constructor(option: BlockOption, rawValues: string[], previousRawValues: string[]) {
        super();
        this.option = option;
        this.rawValues = rawValues;
        this.previousRawValues = previousRawValues;
    }

    public override revert(): BuilderAction {
        this.option.setRawValues(this.previousRawValues);
        return new OptionSetAction(this.option, this.previousRawValues, this.rawValues);
    }
}

class NextSetAction extends BuilderAction {
    private readonly parentBlock: StructogramBlock | undefined;
    private readonly previousParentBlock: StructogramBlock | undefined;
    private readonly block: StructogramBlock;

    constructor(parentBlock: StructogramBlock | undefined, previousParentBlock: StructogramBlock | undefined, block: StructogramBlock) {
        super();
        this.parentBlock = parentBlock;
        this.previousParentBlock = previousParentBlock;
        this.block = block;
    }

    public override revert(): BuilderAction {
        if(this.parentBlock) {
            this.parentBlock.next = undefined;
        }
        if(this.previousParentBlock) {
            this.previousParentBlock.next = this.block;
        }
        return new NextSetAction(this.previousParentBlock, this.parentBlock, this.block);
    }
}

class SubBlockSetAction extends BuilderAction {
    private readonly superBlock: StructogramBlock | undefined;
    private readonly subBlockKey: string | undefined;
    private readonly previousSuperBlock: StructogramBlock | undefined;
    private readonly previousSubBlockKey: string | undefined;
    private readonly block: StructogramBlock;

    constructor(superBlock: StructogramBlock | undefined, subBlockKey: string | undefined, previousSuperBlock: StructogramBlock | undefined, previousSubBlockKey: string | undefined, block: StructogramBlock) {
        super();
        this.superBlock = superBlock;
        this.subBlockKey = subBlockKey;
        this.previousSuperBlock = previousSuperBlock;
        this.previousSubBlockKey = previousSubBlockKey;
        this.block = block;
    }

    public override revert(): BuilderAction {
        if(this.superBlock && this.subBlockKey) {
            this.superBlock.setSubBlock(this.subBlockKey, undefined);
        }
        if(this.previousSuperBlock && this.previousSubBlockKey) {
            this.previousSuperBlock.setSubBlock(this.previousSubBlockKey, this.block);
        }
        return new SubBlockSetAction(this.previousSuperBlock, this.previousSubBlockKey, this.superBlock, this.subBlockKey, this.block);
    }
}

class AddBlockAction extends BuilderAction {
    private readonly block: StructogramBlock;

    constructor(block: StructogramBlock) {
        super();
        this.block = block;
    }

    public override revert() {
        this.block.associatedStructogram.removeBlock(this.block);
        return new DeleteBlockAction(this.block);
    }
}

class DeleteBlockAction extends BuilderAction {
    private readonly block: StructogramBlock;
    constructor(block: StructogramBlock) {
        super();
        this.block = block;
    }

    public revert(): BuilderAction {
        this.block.associatedStructogram.addBlock(this.block);
        return new AddBlockAction(this.block);
    }
}

class ChangeStartingBlockAction extends BuilderAction {
    private readonly structogram: Structogram;
    private readonly block: StructogramBlock | undefined;
    private readonly previousBlock: StructogramBlock | undefined;

    constructor(structogram: Structogram, block: StructogramBlock | undefined, previousBlock: StructogramBlock | undefined) {
        super();
        this.structogram = structogram;
        this.block = block;
        this.previousBlock = previousBlock;
    }

    public revert(): BuilderAction {
        this.structogram.startingBlock = this.previousBlock;
        return new ChangeStartingBlockAction(this.structogram, this.previousBlock, this.block);
    }
}

class CreateSegmentAction extends BuilderAction {
    private readonly renderTarget: Element;
    private readonly associatedSegment: Element;

    constructor(renderTarget: Element, associatedSegment: Element) {
        super();
        this.renderTarget = renderTarget;
        this.associatedSegment = associatedSegment;
    }

    public override revert(): BuilderAction {
        this.renderTarget.removeChild(this.associatedSegment);
        return new RemoveSegmentAction(this.renderTarget, this.associatedSegment);
    }
}

class RemoveSegmentAction extends BuilderAction {
    private readonly renderTarget: Element;
    private readonly associatedSegment: Element;

    constructor(renderTarget: Element, associatedSegment: Element) {
        super();
        this.renderTarget = renderTarget;
        this.associatedSegment = associatedSegment;
    }

    public override revert(): BuilderAction {
        this.renderTarget.appendChild(this.associatedSegment);
        return new CreateSegmentAction(this.renderTarget, this.associatedSegment);
    }
}

class SpecificationChangeAction extends BuilderAction {
    private readonly structogram: Structogram;
    private readonly newInput: [string, string][];
    private readonly newAux: [string, string][];
    private readonly newOutput: [string, string][];
    private readonly oldInput: [string, string][];
    private readonly oldAux: [string, string][];
    private readonly oldOutput: [string, string][];

    constructor(structogram: Structogram, newInput: [string, string][], newAux: [string, string][], newOutput: [string, string][], oldInput: [string, string][], oldAux: [string, string][], oldOutput: [string, string][]) {
        super();
        this.structogram = structogram;
        this.newInput = newInput;
        this.newAux = newAux;
        this.newOutput = newOutput;
        this.oldInput = oldInput;
        this.oldAux = oldAux;
        this.oldOutput = oldOutput;
    }

    public override revert(): BuilderAction {
        this.structogram.clearData();

        function loader(entries: [string, string][], loadFn: (key: string, type: string) => void) {
            for(const [key, type] of entries) {
                loadFn(key, type);
            }
        }

        loader(this.oldInput, (key, type) => this.structogram.defineInputData(key, type as VariableType));
        loader(this.oldAux, (key, type) => this.structogram.defineAuxData(key, type as VariableType));
        loader(this.oldOutput, (key, type) => this.structogram.defineOutputData(key, type as VariableType));

        return new SpecificationChangeAction(this.structogram, this.oldInput, this.oldAux, this.oldOutput, this.newInput, this.newAux, this.newOutput);
    }
}

type ActionStart = "start";

class ActionTimeLine {
    private readonly historyLimit = 64;
    private past: (BuilderAction | ActionStart)[] = [];
    private future: (BuilderAction | ActionStart)[] = [];

    public didAction(action: BuilderAction) {
        this.past.push(action);
        if(this.past.length > this.historyLimit) {
            this.past.splice(0, 1);
            while(this.past[0] != "start") {
                this.past.splice(0, 1);
            }
        }
        this.future = [];
    }

    public start() {
        if(this.past.at(-1) != "start") this.past.push("start");
    }

    public undo() {
        if(this.past.length == 0) return; 
        let action = this.past.pop();
        // the last action could be empty we should skip it
        if(action == "start") {
            action = this.past.pop();
        }
        this.future.push("start");
        while(action && action != "start") {
            const newAction = action.revert();
            this.future.push(newAction);
            action = this.past.pop();
        }
    }

    public redo() {
        if(this.future.length == 0) return;
        let action = this.future.pop();
        this.past.push("start");
        while(action && action != "start") {
            const newAction = action.revert();
            this.past.push(newAction);
            action = this.future.pop();
        }
    }
}

class StructogramBuilder extends StructogramRenderer {
    private saveButton = document.querySelector("#save-button") as HTMLElement;
    private loadButton = document.querySelector("#load-button") as HTMLElement;
    private undoButton = document.querySelector("#undo-button") as HTMLElement;
    private redoButton = document.querySelector("#redo-button") as HTMLElement;
    private movingBlock: MovingBlock | undefined;
    public readonly timeLine = new ActionTimeLine();
    public readonly toolbar = new BlockToolbar(this.structogram);
    public readonly structogramSettings = new StructogramSettings(this);

    /**
     * Creates an HTML element that can accomodate a block tree.
     * @param block the first block of the tree 
     * @param x x coordinate of the starting position
     * @param y y coordinate of the starting positon
     */
    private addSegmentFor(block: StructogramBlock, x: number, y: number): Element {
        const elem = this.structogramSVG.cloneNode() as SVGSVGElement;
        elem.id = `${block.id}-segment`;
        setX(elem, x);
        setY(elem, y);
        elem.classList.add("opacity-50");
        elem.classList.remove("structogram-svg");
        this.renderTarget.appendChild(elem);
        this.timeLine.didAction(new CreateSegmentAction(this.renderTarget, elem));
        this.updateHTML();
        return elem;
    }

    private disconnectBlock(block: StructogramBlock) {
        const structogram = this.structogram;
        function isStartingBlock(block: StructogramBlock) {
            return structogram.startingBlock == block;
        }
        function isSubBlock(block: StructogramBlock) {
            return !!block.superBlock && !!block.subBlockKey;
        }
        function hasParent(block: StructogramBlock) {
            return !!block.parent;
        }
        if(isStartingBlock(block)) {
            structogram.startingBlock = undefined;
            this.timeLine.didAction(new ChangeStartingBlockAction(structogram, undefined, block));
        } else if(isSubBlock(block)) {
            const superBlock = block.superBlock!;
            const subBlockKey = block.subBlockKey!;
            superBlock.setSubBlock(subBlockKey, undefined);
            this.timeLine.didAction(new SubBlockSetAction(undefined, undefined, superBlock, subBlockKey, block));
        } else if(hasParent(block)){
            const parent = block.parent!;
            parent.next = undefined;
            this.timeLine.didAction(new NextSetAction(undefined, parent, block));
        }
    }

    /**
     * Converts an x coordinate relative to the main div of the structogramview to be the coordinate system of the svg of the structogramview.
     * @param x the coordinate relative to the main div
     * @returns the coordinate in the coordinate system of the svg og the structogramview
     */
    private xDivToSvg(x: number) {
        return this.originOffsetX - this.originX + x / this.scale;
    }

    /**
     * Converts an y coordinate relative to the main div of the structogramview to be the coordinate system of the svg of the structogramview.
     * @param y the coordinate relative to the main div
     * @returns the coordinate in the coordinate system of the svg og the structogramview
     */
    private yDivToSvg(y: number) {
        return this.originOffsetY - this.originY + y / this.scale;
    }

    private setupPersistenceButtons(structogram: Structogram) {
        // https://www.javaspring.net/blog/create-and-save-a-file-with-javascript/
        const a = document.createElement("a");
        a.download = "structogram.json"

        this.saveButton.addEventListener("click", () => {
            const data = JSON.stringify(structogram.getData());
            const blob = new Blob([data], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            a.href = url;
            a.click();
            URL.revokeObjectURL(url);
        });

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
                            structogram.loadData(JSON.parse(readerEvent.target.result as string));
                        } catch (error) {
                            alert("Structogram failed to load! Invalid format!");
                            this.structogram.reset();
                        }
                    }
                }
            }
        };
        this.loadButton.addEventListener("click", () => {
            input.click();
        });
    }

    private setupTimeLineControlButtons() {
        this.undoButton.addEventListener("click", () => {
            this.timeLine.undo();
            this.updateHTML();
            this.structogramSettings.generateHTML();
        });

        this.redoButton.addEventListener("click", () => {
            this.timeLine.redo();
            this.updateHTML();
            this.structogramSettings.generateHTML();
        });
    }

    private setupBlockDropping() {
        this.mainDiv.addEventListener("mouseup", event => {
            if(event.button == 0) {
                if(this.movingBlock) {
                    this.movingBlock = undefined;
                    event.stopPropagation();
                }
            }
        });
        this.mainDiv.addEventListener("mouseenter", event => {
            if(this.toolbar.blockBrush) {
                this.timeLine.start();
                const block = this.toolbar.applyBrush();
                this.timeLine.didAction(new AddBlockAction(block));
                const segment = this.addSegmentFor(block, this.xDivToSvg(event.offsetX), this.yDivToSvg(event.offsetY));
                this.movingBlock = new MovingBlock(block, event.offsetX, event.offsetY);
                this.movingBlock.associatedElement = segment;
            } else if(this.movingBlock) {
                this.timeLine.start();
                if(!this.movingBlock.associatedElement && (Math.abs(this.movingBlock.startX - event.clientX) > 5 || Math.abs(this.movingBlock.startY - event.clientY) > 5)) {
                    const segment = this.addSegmentFor(this.movingBlock.block, this.xDivToSvg(event.offsetX), this.yDivToSvg(event.offsetY));
                    this.disconnectBlock(this.movingBlock.block);
                    this.movingBlock.associatedElement = segment;
                }
            }
        });
        document.addEventListener("mouseup", event => {
            if(event.button == 0 && this.movingBlock) {
                this.timeLine.start();
                this.disconnectBlock(this.movingBlock.block);
                this.structogram.removeBlock(this.movingBlock.block);
                this.timeLine.didAction(new DeleteBlockAction(this.movingBlock.block));
                if(this.movingBlock.associatedElement) {
                    this.renderTarget.removeChild(this.movingBlock.associatedElement);
                    this.timeLine.didAction(new RemoveSegmentAction(this.renderTarget, this.movingBlock.associatedElement));
                }
                if(this.structogramSettings.currentBlock == this.movingBlock.block) {
                    this.structogramSettings.currentBlock = undefined;
                }
                this.movingBlock = undefined;
            }
        });
    }

    private setupBlockMoving() {
        this.mainDiv.addEventListener("mousemove", event => {
            if(this.movingBlock) {
                if(this.movingBlock.associatedElement) {
                    setPosition(this.movingBlock.associatedElement, this.xDivToSvg(event.offsetX+10), this.yDivToSvg(event.offsetY));
                } else {
                    if(Math.abs(this.movingBlock.startX - event.clientX) > 5 || Math.abs(this.movingBlock.startY - event.clientY) > 5) {
                        this.timeLine.start();
                        const segment = this.addSegmentFor(this.movingBlock.block, this.xDivToSvg(event.offsetX), this.yDivToSvg(event.offsetY));
                        this.disconnectBlock(this.movingBlock.block);
                        this.movingBlock.associatedElement = segment;
                    }
                }
            }
        });
    }

    constructor(structogram: Structogram, viewModel: ViewModel) {
        super(structogram, viewModel, document.querySelector("#build-view")!)
        this.toolbar.generateHTML();
        this.setupBlockDropping();
        this.setupBlockMoving();
        this.setupPersistenceButtons(structogram);
        this.setupTimeLineControlButtons();
        this.structogramSettings.emitter.addListener(StructogramSettings.blockOptionChanged, (option, newValues, oldValues) => {
            this.timeLine.start();
            this.timeLine.didAction(new OptionSetAction(option, newValues, oldValues));
            this.saveCache();
        });
        this.structogramSettings.emitter.addListener(StructogramSettings.specificationChanged, (newInput, newAux, newOutput, oldInput, oldAux, oldOutput) => {
            this.timeLine.start();
            this.timeLine.didAction(new SpecificationChangeAction(structogram, newInput, newAux, newOutput, oldInput, oldAux, oldOutput));
            this.saveCache();
        });
        this.loadCache();
    }

    public loadCache() {
        const data = localStorage.getItem("lastStructogram");
        if(data) {
            try {
                this.structogram.loadData(JSON.parse(data));
            } catch (error) {
                alert("Cache failed to load!");
                this.structogram.reset();
            }
        }
    }

    public saveCache() {
        localStorage.setItem("lastStructogram", JSON.stringify(this.structogram.getData()));
    }

    public override updateHTML(): void {
        super.updateHTML();
        for(const block of this.structogram.getIndependentRootBlocks()) {
            const associatedElem = this.renderTarget.querySelector(`#${block.id}-segment`);
            if(associatedElem instanceof SVGSVGElement) {
                associatedElem.textContent = "";
                const height = this.resolveHTMLFor(associatedElem, block, this.structogramWidth, 0, 0);
                setHeight(associatedElem, height);
            }
        }
        this.saveCache();
    }

    protected override onBlockAdded(block: StructogramBlock, parent: StructogramBlock | undefined, elem: HTMLElement): void {
        setID(elem, block.getID());
        elem.addEventListener("mousedown", event => {
            if(event.button == 0) {
                this.structogramSettings.currentBlock = block;
                this.movingBlock = new MovingBlock(block, event.clientX, event.clientY);
                const associatedElem = this.renderTarget.querySelector(`#${block.id}-segment`);
                if(associatedElem) {
                    this.movingBlock.associatedElement = associatedElem;
                }
                event.stopPropagation();
            }
        })
        if(this.structogramSettings.currentBlock == block) {
            elem.classList.remove(...unselectedClass);
            elem.classList.add(...selectedClass);
        }
    }

    protected override onUndefinedBlock(parentElem: Element, context: UndefinedBlockContext, width:number, xOffset: number, yOffset: number): number {
        const elem = this.blockResourceManager.getHTMLForObject(undefined)!;
        setPosition(elem, xOffset, yOffset);
        setSize(elem, width, baseBlockHeight);
        function highlight() {
            elem.classList.remove("fill-white");
            elem.classList.add("fill-green-50");
        }
        function unhighlight() {
            elem.classList.add("fill-white");
            elem.classList.remove("fill-green-50");
        }
        elem.addEventListener("mouseup", event => {
            if(event.button == 0) {
                let block = undefined;
                if(this.toolbar.blockBrush) {
                    this.timeLine.start();
                    block = this.toolbar.applyBrush();
                    this.timeLine.didAction(new AddBlockAction(block));
                } else if(this.movingBlock && this.movingBlock.block != context.parent && this.movingBlock.block != context.superBlock) {
                    this.timeLine.start();
                    block = this.movingBlock.block;
                    if(this.movingBlock.associatedElement) {
                        this.renderTarget.removeChild(this.movingBlock.associatedElement);
                        this.timeLine.didAction(new RemoveSegmentAction(this.renderTarget, this.movingBlock.associatedElement));
                    }
                    this.disconnectBlock(block);
                    this.movingBlock = undefined;
                }
                if(block) {
                    if(context.parent) {
                        const parent = block.parent;
                        context.parent.next = block;
                        this.timeLine.didAction(new NextSetAction(context.parent, parent, block));
                        unhighlight();
                    } else if(context.superBlock && context.subBlockKey){
                        const superBlock = block.superBlock;
                        const subBlockKey = block.subBlockKey;
                        context.superBlock.setSubBlock(context.subBlockKey, block);
                        this.timeLine.didAction(new SubBlockSetAction(context.superBlock, context.subBlockKey, superBlock, subBlockKey, block));
                        unhighlight();
                    } else if(context.isStartBlock) {
                        const startingBlock = this.structogram.startingBlock;
                        this.structogram.startingBlock = block;
                        this.timeLine.didAction(new ChangeStartingBlockAction(this.structogram, block, startingBlock));
                        unhighlight();
                    }
                    event.stopPropagation();
                }
            }
        });
        elem.addEventListener("mouseenter", () => {
            if(this.movingBlock) {
                highlight();
            }
        });
        elem.addEventListener("mouseleave", () => {
            unhighlight();
        });

        // event listener is required to prevent accidentally moving the parent element through an undefined block
        elem.addEventListener("mousedown", event => {
            if(event.button == 0) {
                event.stopPropagation();
            }
        })
        parentElem.appendChild(elem);
        return baseBlockHeight;
    }
}

/**
 * A simple class representing a window containing a list.
 * Used for the error and result windows.
 */
class ListWindow {
    private window: HTMLElement;
    private list: HTMLElement;

    constructor(windowID:string , okButtonID: string){
        this.window = document.querySelector(`#${windowID}`) as HTMLElement;
        this.list = this.window.querySelector("ul") as HTMLElement;
        const okButton = this.window.querySelector(`#${okButtonID}`) as HTMLElement;
        okButton.addEventListener("click", () => {
            this.hide();
            this.clearEntries();
        });
    }

    public addEntry(text: string) {
        const li = document.createElement("li");
        li.textContent = text;
        this.list.appendChild(li);
    }

    public clearEntries() {
        this.list.textContent = "";
    }

    public show() {
        this.window.classList.remove("hidden");
    }

    public hide() {
        this.window.classList.add("hidden");
    }
}

class StructogramRunner extends StructogramRenderer {
    private _currentBlock: StructogramBlock | undefined;
    private _activeBlockStep: string | undefined;
    private paused: boolean = false;
    private readonly inputDataElem = document.querySelector("#input-data") as HTMLElement;
    private readonly runIssueWindow = new ListWindow("issues", "issues-ok");
    private readonly runResultsWindow = new ListWindow("results", "results-ok");
    public readonly timeControl = new TimeControl(this.viewModel);
    public readonly programViewManager = new ProgramViewManager(this.viewModel);

    public set currentBlock(currentBlock: StructogramBlock | undefined) {
        if(this._currentBlock) {
            const node = this.renderTarget.querySelector(`#${this._currentBlock.id}`);
            node?.classList.remove(...runningClass);
            node?.classList.add(...notRunningClass);
            currentBlock?.emitter.removeAllListeners(StructogramBlock.activeStepChanged);
        }
        this.activeBlockStep = undefined;
        this._currentBlock = currentBlock;
        if(currentBlock) {
            const node = this.renderTarget.querySelector(`#${currentBlock.id}`);
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
            for(const e of this.renderTarget.querySelectorAll(`#${this.currentBlock.id} > :not(svg) .t-step-${this._activeBlockStep}, #${this.currentBlock.id} >  svg.t-subblock-header .t-step-${this._activeBlockStep}`) ?? []) {
                e?.classList.remove("font-bold", "stroke-green-500");
            }
        }
        this._activeBlockStep = step;
        if(this._activeBlockStep && this.currentBlock) {
            for(const e of this.renderTarget.querySelectorAll(`#${this.currentBlock.id} > :not(svg) .t-step-${this._activeBlockStep}, #${this.currentBlock.id} >  svg.t-subblock-header .t-step-${this._activeBlockStep}`) ?? []) {
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

    public addInputEntry(key: string) {
        const entry = parseIntoHTML(inputDataEntryTemplate);
        setTemplateText(entry, "key", key);
        this.inputDataElem.appendChild(entry);
    }

    public getInputs() {
        return [...this.inputDataElem.querySelectorAll(".t-data") as NodeListOf<HTMLFormElement>].map(n => n.value);
    }

    constructor(structogram: Structogram, viewModel: ViewModel) {
        super(structogram, viewModel, document.querySelector("#run-view")!)
        for(const [key, _] of structogram.inputData) {
            this.addInputEntry(key);
        }
        viewModel.structogram.emitter.addListener(Structogram.inputSpecificationEvent, (key, _) => {
            this.addInputEntry(key);
        });
        viewModel.structogram.emitter.addListener(Structogram.specificationClearEvent, () => {
            this.inputDataElem.textContent = "";
        });
    }

    public async start() {
        if(!this.structogram.isRunning()) {
            const issues = this.structogram.preRun(this.getInputs());
            if(issues.length > 0) {
                for(const issue of issues) {
                    this.runIssueWindow.addEntry(issue.id + ": " + issue.message);
                }
                this.runIssueWindow.show();
                return;
            }
            this.programViewManager.reset();
        }
        this.paused = false;
        this.currentBlock = this.structogram.currentBlock;
        let partialResults: [string, Primitive][] = [];
        do {
            this.programViewManager.clearEffects();
            partialResults = this.structogram.runStep();
            await wait(baseRunSpeed / this.timeControl.currentSpeed);
            if(!this.paused) this.currentBlock = this.structogram.currentBlock;
        } while (this.structogram.isRunning() && !this.paused);
        if(!this.structogram.isRunning()) {
            this.currentBlock = undefined;
            for(const [key, value] of partialResults) {
                this.runResultsWindow.addEntry(key + " = " + value);
            }
            this.runResultsWindow.show();
        }
    }

    public pause() {
        this.paused = true;
    }

    protected override onBlockAdded(block: StructogramBlock, parent: StructogramBlock | undefined, elem: HTMLElement): void {
        setID(elem, block.getID());
    }
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
        document.addEventListener("mouseup", event => {
            if(event.button == 0) {
                this.blockBrush = undefined;
            }
        })
    }

    public get blockBrush() {
        return this._blockBrush;
    }

    public set blockBrush(blockBrush: (() => StructogramBlock) | undefined) {
        this._blockBrush = blockBrush;
    }

    public hasBrush(): boolean {
        return !!this.blockBrush;
    }

    public applyBrush(): StructogramBlock {
        if(!this.hasBrush()) throw Error("No brush!");
        const result = this.blockBrush!();
        this.blockBrush = undefined;
        return result;
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
    public static readonly changed = "optionhandler.changed";
    public readonly emitter: EventEmitter2 = new EventEmitter2();
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
    protected changed(option: BlockOption, newValues: string[], oldValues: string[]) {
        this.emitter.emit(OptionHandler.changed, option, newValues, oldValues);
    }
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
            const oldValues = option.getRawValues();
            option.setStatement(textField.value);
            this.changed(option, option.getRawValues(), oldValues);
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
            const oldValues = option.getRawValues();
            this.updateStatements(form, option);
            this.changed(option, option.getRawValues(), oldValues);
        })
    }

    private cloneAndAddTextField(form: HTMLElement, conditionEntry: HTMLElement, index: number, option: BooleanStatementListOption) {
        const copy = conditionEntry.cloneNode(true) as HTMLElement;
        form.appendChild(copy);
        const textField = copy.querySelector("input[type=\"text\"]") as HTMLFormElement;
        const removeButton = copy.querySelector("input[type=\"button\"]") as HTMLFormElement;
        removeButton.addEventListener("click", event => {
            if(event.button == 0) {
                const oldValues = option.getRawValues();
                form.removeChild(copy);
                this.updateStatements(form, option);
                this.changed(option, option.getRawValues(), oldValues);
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
                const oldValues = option.getRawValues();
                form.removeChild(conditionEntry);
                this.updateStatements(form, option);
                this.changed(option, option.getRawValues(), oldValues);
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
                const oldValues = option.getRawValues();
                i++;
                this.cloneAndAddTextField(form, conditionEntry, i, option);
                this.updateStatements(form, option);
                this.changed(option, option.getRawValues(), oldValues);
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
            const oldValues = option.getRawValues();
            option.setKey(textField.value);
            this.changed(option, option.getRawValues(), oldValues);
        });
    }   
}

class SpecificationSettingHandler {
    public static readonly specificationChanged = "specification.changed"
    public readonly emitter = new EventEmitter2();
    private readonly dataSettingsTemplateElem = parseIntoHTML(dataSettingsTemplate);
    private readonly structogramBuilder: StructogramBuilder;
    private entryTemplateElem = this.dataSettingsTemplateElem.querySelector(".t-data-entry") as HTMLElement;
    private inDataElem = this.dataSettingsTemplateElem.cloneNode(true) as HTMLElement;
    private auxDataElem = this.dataSettingsTemplateElem.cloneNode(true) as HTMLElement;
    private outDataElem = this.dataSettingsTemplateElem.cloneNode(true) as HTMLElement;

    private parseEntryElem(elem: HTMLElement): [string, VariableType] {
        const textfield = elem.querySelector(`.t-key-textfield`) as HTMLFormElement;
        const select = elem.querySelector(`.t-type-selector`) as HTMLSelectElement;
        return [textfield.value, select.value as VariableType];
    }

    private parseEntryElems(elems: NodeListOf<HTMLElement>) {
        return [...elems].map(this.parseEntryElem);
    }

    private flushToStructogram() {
        const inputDataEntries = this.inDataElem.querySelectorAll(".t-data-entry") as NodeListOf<HTMLElement>;
        const auxDataEntries = this.auxDataElem.querySelectorAll(".t-data-entry") as NodeListOf<HTMLElement>;
        const outputDataEntries = this.outDataElem.querySelectorAll(".t-data-entry") as NodeListOf<HTMLElement>;
        
        const oldInput = this.structogramBuilder.structogram.inputData;
        const oldAux = this.structogramBuilder.structogram.auxData;
        const oldOutput = this.structogramBuilder.structogram.outputData;

        this.structogramBuilder.structogram.clearData();

        const inputEntries = this.parseEntryElems(inputDataEntries);
        for(const [key, type] of inputEntries) {
            this.structogramBuilder.structogram.defineInputData(key, type);
        }

        const auxEntries = this.parseEntryElems(auxDataEntries);
        for(const [key, type] of auxEntries) {
            this.structogramBuilder.structogram.defineAuxData(key, type);
        }

        const outputEntries = this.parseEntryElems(outputDataEntries);
        for(const [key, type] of outputEntries) {
            this.structogramBuilder.structogram.defineOutputData(key, type);
        }

        this.emitter.emit(SpecificationSettingHandler.specificationChanged, inputEntries, auxEntries, outputEntries, oldInput, oldAux, oldOutput);

        this.structogramBuilder.saveCache();
    }

    private setupElements() {
        this.setupDataSettings(this.structogramBuilder.structogram.inputData, this.inDataElem, "Input");
        this.setupDataSettings(this.structogramBuilder.structogram.auxData, this.auxDataElem, "Auxilary");
        this.setupDataSettings(this.structogramBuilder.structogram.outputData, this.outDataElem, "Output");
    }

    private loadEntriesFor(entries: [string, VariableType][], target: HTMLElement) {
        const entriesElem = target.querySelector(".t-entries") as HTMLElement;
        entriesElem.textContent = "";
        for(const [key, entry] of entries) {
            this.addEntry(key, entry, entriesElem);
        }
    }


    private loadEntries() {
        this.loadEntriesFor(this.structogramBuilder.structogram.inputData, this.inDataElem);
        this.loadEntriesFor(this.structogramBuilder.structogram.auxData, this.auxDataElem);
        this.loadEntriesFor(this.structogramBuilder.structogram.outputData, this.outDataElem);
    }

    private setupDataSettings(entries: [string, VariableType][], target: HTMLElement, name: string) {
        this.loadEntriesFor(entries, target);
        setTemplateText(target, "name", name);
        const entriesElem = target.querySelector(".t-entries") as HTMLElement;
        const addButton = target.querySelector(".t-add-button") as HTMLButtonElement;
        addButton.addEventListener("click", () =>  {
            this.addEntry("", "number", entriesElem);
        });
    }

    private addEntry(key: string, type: VariableType, entriesElem: HTMLElement) {
        const entryElem = this.entryTemplateElem?.cloneNode(true) as HTMLElement;
        const textfield = entryElem.querySelector(`.t-key-textfield`) as HTMLFormElement;
        textfield.value = key;
        const select = entryElem.querySelector(`.t-type-selector`) as HTMLSelectElement;
        select.value = type;
        const removeButton = entryElem.querySelector(`.t-del-button`) as HTMLButtonElement;
        entriesElem.appendChild(entryElem);
        removeButton.addEventListener("click", () => {
            entriesElem.removeChild(entryElem);
            this.flushToStructogram();
        });
        textfield.addEventListener("change", () => {
            this.flushToStructogram();
        });
        select.addEventListener("change", () => {
            this.flushToStructogram();
        });
    }

    constructor(structogramBuilder: StructogramBuilder) {
        this.structogramBuilder = structogramBuilder;
        this.setupElements();
    }

    public getHTML(): HTMLElement[] {
        this.loadEntries();
        return [this.inDataElem, this.auxDataElem, this.outDataElem];
    }
    
}

class StructogramSettings {
    public static readonly blockOptionChanged = "settings.blockoption.change"
    public static readonly specificationChanged = "settings.specification.change"
    public readonly emitter: EventEmitter2 = new EventEmitter2();
    private _currentBlock: StructogramBlock | undefined;
    private structogramSettingsElem = document.querySelector("#structogram-settings")!;
    private optionResourceManager: ResourceManager = new ResourceManager();
    private optionHandlers: Record<string, OptionHandler> = {};
    private specificationSettingsHandler: SpecificationSettingHandler;

    constructor(structogramBuilder: StructogramBuilder) {
        this.specificationSettingsHandler = new SpecificationSettingHandler(structogramBuilder);
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
        this.addListenersForHandlers();
    }

    private addListenersForHandlers() {
        for(const handler of Object.values(this.optionHandlers)) {
            handler.emitter.addListener(OptionHandler.changed, (option, newValues, oldValues) => {
                this.emitter.emit(StructogramSettings.blockOptionChanged, option, newValues, oldValues);
            });
        }
        this.specificationSettingsHandler.emitter.addListener(SpecificationSettingHandler.specificationChanged, (newInput, newAux, newOutput, oldInput, oldAux, oldOutput) => {
            this.emitter.emit(StructogramSettings.specificationChanged, newInput, newAux, newOutput, oldInput, oldAux, oldOutput);
        });
    }

    public generateHTML() {
        this.structogramSettingsElem.textContent = "";
        if(this._currentBlock) {
            for(const option of this._currentBlock.getOptions()) {
                if(option.getTypeIdentifier() in this.optionHandlers) {
                    const node = this.optionHandlers[option.getTypeIdentifier()]!.getHTMLNodeFor(option, this._currentBlock);
                    if(node) this.structogramSettingsElem.appendChild(node);
                }
            }
        } else {
            const nodes = this.specificationSettingsHandler.getHTML();
            for(const n of nodes) {
                this.structogramSettingsElem.appendChild(n);
            }
        }
    }

    public set currentBlock(block: StructogramBlock | undefined) {
        if(this._currentBlock) {
            const node = document.querySelector(`#${this._currentBlock.id}`);
            node?.classList.remove(...selectedClass);
            node?.classList.add(...unselectedClass);
        } else {
            const speci = document.querySelector("#specification");
            speci?.classList.remove("bg-cyan-100");
            speci?.classList.add("bg-white", "hover:bg-cyan-50");
        }
        this._currentBlock = block;
        if(this._currentBlock) {
            const node = document.querySelector(`#${this._currentBlock.id}`);
            node?.classList.remove(...unselectedClass);
            node?.classList.add(...selectedClass);
        } else {
            const speci = document.querySelector("#specification");
            speci?.classList.remove("bg-white", "hover:bg-cyan-50");
            speci?.classList.add("bg-cyan-100");
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
    private logsElem = this.outputViewElem.querySelector(".t-logs") as HTMLElement;
    private logTemplateElem = this.outputViewElem.querySelector("p.t-log-template")!.cloneNode() as HTMLElement;

    constructor(viewModel: ViewModel) {
        super(viewModel);
        this.reset();
        this.viewModel.structogram.emitter.addListener(Structogram.printEvent, msg => {
            const log = this.logTemplateElem.cloneNode() as HTMLElement;
            log.textContent = msg;
            this.logsElem.appendChild(log);
        });
    }

    public override getElement(): HTMLElement {
        return this.outputViewElem;
    }


    public override reset() {
        this.logsElem.textContent = "";
    }
}

class MemoryView extends ProgramView {
    private memoryViewElem = parseIntoHTML(memoryViewTemplate) as HTMLElement;
    private memoryViewEntriesElem = this.memoryViewElem.querySelector(".t-memory-entries") as HTMLElement;
    private memoryTemplateElem = this.memoryViewElem.querySelector(".t-memory-template")!.cloneNode(true) as HTMLElement;
    private readonly changedStyle = ["bg-orange-600"];
    private readonly accessedStyle = ["bg-green-600"];

    private addEntry(key: string, value: MemoryEntry) {
        const memoryEntry = this.memoryTemplateElem.cloneNode(true) as HTMLElement;
        setTemplateText(memoryEntry, "memory-key", key);
        setTemplateText(memoryEntry, "memory-value", value.value.toString());
        setTemplateText(memoryEntry, "memory-constant", value.constant.toString());
        setID(memoryEntry, `v-${key}`);
        this.memoryViewEntriesElem.appendChild(memoryEntry);
    }

    constructor(viewModel: ViewModel) {
        super(viewModel);
        this.reset();
        const memory = this.viewModel.structogram.memory;
        memory.emitter.addListener(Memory.variableAddedEvent, (key, value) => {   
            this.addEntry(key, value);
        });
        memory.emitter.addListener(Memory.variableChangedEvent, (key, value) => {
            const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${key}`) as HTMLElement;
            setTemplateText(memoryEntry, "memory-value", value);
            memoryEntry.classList.add(...this.changedStyle);
        });
        memory.emitter.addListener(Memory.variableAccessedEvent, key => {
            const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${key}`) as HTMLElement;
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
        const memory = this.viewModel.structogram.memory;
        for(const [key, _] of memory.getEntries()) {
            const memoryEntry = this.memoryViewEntriesElem.querySelector(`#v-${key}`) as HTMLElement;
            this.clearStyle(memoryEntry, this.changedStyle);
            this.clearStyle(memoryEntry, this.accessedStyle);
        }
    }

    public override getElement(): HTMLElement {
        return this.memoryViewElem;
    }

    public reset(): void {
        this.memoryViewEntriesElem.textContent = "";
        const memory = this.viewModel.structogram.memory;
        for(const [key, value] of memory.getEntries()) {
            this.addEntry(key, value);
        }
    }
}

class LogicView extends ProgramView implements AnimatedView {
    private logicViewElem = parseIntoHTML(logicViewTemplate) as HTMLElement;
    private logicElem = this.logicViewElem.querySelector(".t-logic") as HTMLElement;
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

    private addOperand(operand: Operand | string) {
        const elem = this.operandTemplateElem.cloneNode(true) as HTMLElement;
        if(operand instanceof Operand) {
            setTemplateText(elem, "representation", operand.getRepresentation());
            setTemplateText(elem, "value", operand.resolve().toString());
        } else {
            setTemplateText(elem, "representation", "");
            setTemplateText(elem, "value", operand);
        }
        this.logicElem.appendChild(elem);
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
        this.logicElem.textContent = "";
    }

    public override getElement(): HTMLElement {
        return this.logicViewElem;
    }
}

interface AnimatedView {
    render(delta: number): void;
}

class StructogramSpecificator {
    private viewModel: ViewModel;
    private specificationElem = document.querySelector("#specification") as HTMLElement;

    private addEntryTo(clazz: string, entry: string) {
        const currentText = getTemplateText(this.specificationElem, clazz);
        if(currentText.length > 0) {
            setTemplateText(this.specificationElem, clazz, currentText + `, ${entry}`);  
        } else {
            setTemplateText(this.specificationElem, clazz, `${entry}`);  
        }
    }

    constructor(viewModel: ViewModel) {
        this.viewModel = viewModel;
        this.reset();
        viewModel.structogram.emitter.addListener(Structogram.inputSpecificationEvent, (key, type) => {
            this.addEntryTo("spec-in", `${key}: ${type}`);
        });
        viewModel.structogram.emitter.addListener(Structogram.auxSpecificationEvent, (key, type) => {
            this.addEntryTo("spec-aux", `${key}: ${type}`);
        });
        viewModel.structogram.emitter.addListener(Structogram.outputSpecificationEvent, (key, type) => {
            this.addEntryTo("spec-out", `${key}: ${type}`);
        });
        viewModel.structogram.emitter.addListener(Structogram.specificationClearEvent, () => {
            setTemplateText(this.specificationElem, "spec-in", "");
            setTemplateText(this.specificationElem, "spec-aux", "");
            setTemplateText(this.specificationElem, "spec-out", "");
        });
        this.specificationElem.addEventListener("click", () => {
            viewModel.structogramBuilder.structogramSettings.currentBlock = undefined;
        });
    }

    private reset() {
        let inEntries = [];
        for(const [key, type]of this.viewModel.structogram.inputData) {
            inEntries.push(`${key}: ${type}`);
        }
        let auxEntries = [];
        for(const [key, type]of this.viewModel.structogram.auxData) {
            auxEntries.push(`${key}: ${type}`);
        }
        let outEntries = [];
        for(const [key, type]of this.viewModel.structogram.outputData) {
            outEntries.push(`${key}: ${type}`);
        }
        setTemplateText(this.specificationElem, "spec-in", inEntries.join(", "));
        setTemplateText(this.specificationElem, "spec-aux", auxEntries.join(", "));
        setTemplateText(this.specificationElem, "spec-out", outEntries.join(", "));
    }
}