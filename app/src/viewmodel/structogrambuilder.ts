import EventEmitter2 from "eventemitter2";
import type { VariableType } from "../model/memory";
import { AssignmentBlock, BackTestingLoopBlock, BooleanStatementListOption, CountingLoopBlock, FrontTestingLoopBlock, KeyOption, MultiBranchingBlock, ControlBlock, StatementOption, Structogram, StructogramBlock, TrueFalseBranchingBlock, type BlockOption, PrintBlock } from "../model/structogram";
import { baseBlockHeight, errorBorder, selectedClass, unselectedClass } from "./constants";
import { StructogramRenderer, UndefinedBlockContext } from "./structogramrenderer";
import { getTemplateText, parseIntoHTML, ResourceManager, setHeight, setID, setPosition, setSize, setTemplateText, setX, setY } from "./util";

import statementOptionTemplate from "../../resources/settings/structogram-options/statementoption.html";
import booleanStatementListOptionTemplate from "../../resources/settings/structogram-options/booleanstatementlistoption.html";
import keyOptionTemplate from "../../resources/settings/structogram-options/keyoption.html";
import dataSettingsTemplate from "../../resources/settings/datasettings.html";
import { booleanType, numberType, SimpleValue, stringType, parseType, typeRegistry, ValueType, type Value, TypeParseError } from "../model/types";
import { Translator } from "./dictionary";
import type { ViewModel } from "./viewmodel";

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

        loader(this.oldInput, (key, type) => this.structogram.declareInputData(key, parseType(type)));
        loader(this.oldAux, (key, type) => this.structogram.declareAuxData(key, parseType(type)));
        loader(this.oldOutput, (key, type) => this.structogram.declareOutputData(key, parseType(type)));

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

    public reset() {
        this.past = [];
        this.future = [];
    }
}

export class StructogramBuilder extends StructogramRenderer {
    public readonly emitter = new EventEmitter2();
    public static readonly currentBlockChanged = "structogrambuilder.currentblock.changed";

    private newButton = document.querySelector("#new-button") as HTMLButtonElement;
    private settingsButton = document.querySelector("#settings-button") as HTMLButtonElement;
    private undoButton = document.querySelector("#undo-button") as HTMLButtonElement;
    private redoButton = document.querySelector("#redo-button") as HTMLButtonElement;
    private newWindow = document.querySelector("#new-confirm") as HTMLElement;
    private newYesButton = this.newWindow.querySelector("#new-confirm-yes") as HTMLButtonElement;
    private newNoButton = this.newWindow.querySelector("#new-confirm-no") as HTMLButtonElement;
    public readonly structogramSpecificator = new StructogramSpecificator(this);
    private movingBlock: MovingBlock | undefined;
    private _currentBlock: StructogramBlock | undefined;
    private blockClipboard: string = "";
    public readonly timeLine = new ActionTimeLine();
    public readonly toolbar = new BlockToolbar(this.structogram);
    public readonly structogramSettings = new StructogramSettings(this);
    public readonly structogramGeneralSettings;

    public set currentBlock(block: StructogramBlock | undefined) {
        if(this._currentBlock) {
            const node = document.querySelector(`#${this.idPrefix}-${this._currentBlock.id}`);
            node?.classList.remove(...selectedClass);
            node?.classList.add(...unselectedClass);
        } else {
            const speci = document.querySelector("#specification");
            speci?.classList.remove("bg-cyan-100");
            speci?.classList.add("bg-white", "hover:bg-cyan-50");
        }
        this._currentBlock = block;
        if(this._currentBlock) {
            const node = document.querySelector(`#${this.idPrefix}-${this._currentBlock.id}`);
            node?.classList.remove(...unselectedClass);
            node?.classList.add(...selectedClass);
        } else {
            const speci = document.querySelector("#specification");
            speci?.classList.remove("bg-white", "hover:bg-cyan-50");
            speci?.classList.add("bg-cyan-100");
        }
        this.emitter.emit(StructogramBuilder.currentBlockChanged);
    }

    public get currentBlock() {
        return this._currentBlock;
    }

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
        document.addEventListener("keydown", event => {
            if(event.ctrlKey && event.shiftKey && event.key.toLowerCase() == "z") {
                this.redoButton.click();
            } else if(event.ctrlKey && event.key == "z") {
                this.undoButton.click();
            }
        });
    }

    private setupNewStructogramButtons() {
        this.newButton.addEventListener("click", () => {
            this.newWindow.classList.remove("hidden");
        });
        this.newYesButton.addEventListener("click", () => {
            this.structogram.reset();
            this.timeLine.reset();
            this.viewModel.saveCache();
            this.newWindow.classList.add("hidden");
        });
        this.newNoButton.addEventListener("click", () => {
            this.newWindow.classList.add("hidden");
        })
    }

    private setupBlockDropping() {
        this.viewElement.addEventListener("mouseup", event => {
            if(event.button == 0) {
                if(this.movingBlock) {
                    this.movingBlock = undefined;
                    event.stopPropagation();
                }
            }
        });
        this.viewElement.addEventListener("mouseenter", event => {
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
                if(this.currentBlock == this.movingBlock.block) {
                    this.currentBlock = undefined;
                }
                this.movingBlock = undefined;
            }
        });
    }

    private setupBlockMoving() {
        this.viewElement.addEventListener("mousemove", event => {
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

    private setupCopyPaste() {
        let mouseX = 0;
        let mouseY = 0;
        let mouseInView = false;
        let pressed = false;
        this.viewElement.addEventListener("mousemove", event => {
            mouseX = event.offsetX;
            mouseY = event.offsetY;
        });
        this.viewElement.addEventListener("mouseenter", () => {
            mouseInView = true;
        });
        this.viewElement.addEventListener("mouseleave", () => {
            mouseInView = false;
        });
        document.addEventListener("keydown", event => {
            if(!mouseInView) return;
            if(pressed) return;
            if(event.ctrlKey && event.key != "Control") {
                pressed = true;
                if(this.currentBlock && event.key == "c") {
                    this.blockClipboard = this.currentBlock.getData();
                } else if(this.currentBlock && event.key == "x") {
                    this.blockClipboard = this.currentBlock.getData()
                    this.timeLine.start();
                    this.disconnectBlock(this.currentBlock);
                    this.structogram.removeBlock(this.currentBlock);
                    this.timeLine.didAction(new DeleteBlockAction(this.currentBlock));
                    const associatedElem = this.renderTarget.querySelector(`#${this.currentBlock.id}-segment`);
                    if(associatedElem) {
                        this.renderTarget.removeChild(associatedElem);
                        this.timeLine.didAction(new RemoveSegmentAction(this.renderTarget, associatedElem));
                    }
                    this.currentBlock = undefined;
                } else if(this.blockClipboard != "" && event.key == "v") {
                    this.timeLine.start();
                    const block = StructogramBlock.BlockDataFactory.constructFromData(this.blockClipboard, this.structogram);
                    this.timeLine.didAction(new AddBlockAction(block));
                    this.addSegmentFor(block, this.xDivToSvg(mouseX), this.yDivToSvg(mouseY));
                }
            }
        });
        document.addEventListener("keyup", () => {
            pressed = false;
        })
    }

    constructor(structogram: Structogram, viewModel: ViewModel) {
        super(viewModel, structogram, document.querySelector("#structogram-builder")!, "builder")
        this.structogramGeneralSettings = new StructogramGeneralSettings(this.structogram, this.viewModel);
        this.toolbar.generateHTML();
        this.setupBlockDropping();
        this.setupBlockMoving();
        this.setupTimeLineControlButtons();
        this.setupNewStructogramButtons();
        this.setupCopyPaste();
        this.settingsButton.addEventListener("click", () => {
            this.structogramGeneralSettings.show();
        });
        this.structogramSettings.emitter.addListener(StructogramSettings.blockOptionChanged, (option: BlockOption, newValues: string[], oldValues: string[]) => {
            this.timeLine.start();
            this.timeLine.didAction(new OptionSetAction(option, newValues, oldValues));
            viewModel.saveCache();
        });
        this.structogramSettings.emitter.addListener(StructogramSettings.specificationChanged, (newInput: [string, string][], newAux: [string, string][], newOutput: [string, string][], oldInput: [string, string][], oldAux: [string, string][], oldOutput: [string, string][]) => {
            this.timeLine.start();
            this.timeLine.didAction(new SpecificationChangeAction(structogram, newInput, newAux, newOutput, oldInput, oldAux, oldOutput));
            viewModel.saveCache();
        });
    }

    public override updateHTML(): void {
        super.updateHTML();
        for(const block of this.structogram.getIndependentRootBlocks()) {
            const associatedElem = this.renderTarget.querySelector(`#${block.id}-segment`);
            if(associatedElem instanceof SVGSVGElement) {
                associatedElem.textContent = "";
                const height = this.resolveHTMLFor(associatedElem, block, this.viewModel.structogramWidth, 0, 0);
                setHeight(associatedElem, height);
            }
        }
        this.viewModel.saveCache();
    }

    protected override onBlockAdded(block: StructogramBlock, parent: StructogramBlock | undefined, elem: HTMLElement): void {
        super.onBlockAdded(block, parent, elem);
        elem.addEventListener("mousedown", event => {
            if(event.button == 0) {
                this.currentBlock = block;
                this.movingBlock = new MovingBlock(block, event.clientX, event.clientY);
                const associatedElem = this.renderTarget.querySelector(`#${block.id}-segment`);
                if(associatedElem) {
                    this.movingBlock.associatedElement = associatedElem;
                }
                event.stopPropagation();
            }
        })
        if(this.currentBlock == block) {
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

    public override runFrame(delta: number) {
        super.runFrame(delta);
    }
}

class ToolbarEntry {
    private readonly icon: HTMLElement;
    private readonly _name: string;
    private readonly _description: string;
    private readonly factory: () => StructogramBlock;

    constructor(toolbar: BlockToolbar, icon: HTMLElement, name: string, description: string, factory: () => StructogramBlock) {
        this.icon = icon;
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
                document.querySelector("#toolbar-assignment-block")!, 
                "Assignment block", 
                "desc",
                () => new AssignmentBlock(structogram)),
            new ToolbarEntry(
                this,
                document.querySelector("#toolbar-control-block")!, 
                "Control block", 
                "desc",
                () => new ControlBlock(structogram)),
            new ToolbarEntry(
                this,
                document.querySelector("#toolbar-print-block")!, 
                "Print block", 
                "desc",
                () => new PrintBlock(structogram)),
            new ToolbarEntry(
                this,
                document.querySelector("#toolbar-true-false-branching-block")!, 
                "True False branching block", 
                "desc",
                () => new TrueFalseBranchingBlock(structogram)),
            new ToolbarEntry(
                this,
                document.querySelector("#toolbar-multi-branching-block")!, 
                "Multi branching block", 
                "desc",
                () => new MultiBranchingBlock(structogram)),
            new ToolbarEntry(
                this,
                document.querySelector("#toolbar-counting-loop-block")!, 
                "Counting loop block", 
                "desc",
                () => new CountingLoopBlock(structogram)),
            new ToolbarEntry(
                this,
                document.querySelector("#toolbar-front-testing-loop-block")!, 
                "Front testing loop block", 
                "desc",
                () => new FrontTestingLoopBlock(structogram)),
            new ToolbarEntry(
                this,
                document.querySelector("#toolbar-back-testing-loop-block")!, 
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

class StatementOptionHandler<J extends Value> extends OptionHandler {
    protected override applyLogic(option: StatementOption<J>, block: StructogramBlock, node: Element): void {
        (node.querySelector(".t-name") as HTMLElement).dataset["trkey"] = `option_name_${option.name}`;
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
        (node.querySelector(".t-name") as HTMLElement).dataset["trkey"] = `option_name_${option.name}`;
        const form = node.querySelector("form") as HTMLElement;
        const conditionEntry = node.querySelector(".t-condition-entry") as HTMLElement;
        form.removeChild(conditionEntry);
        const statementCount = option.getStatements().length;
        let i = 0;
        for(; i < statementCount; i++) {
            this.cloneAndAddTextField(form, conditionEntry, i, option);
        }
        const addButton = node.querySelector(`.t-add-button`) as HTMLElement;
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
        (node.querySelector(".t-name") as HTMLElement).dataset["trkey"] = `option_name_${option.name}`;  
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

    private parseEntryElem(elem: HTMLElement): [string, string, HTMLElement] {
        const textfield = elem.querySelector(`.t-key-textfield`) as HTMLFormElement;
        const select = elem.querySelector(`.t-type-selector`) as HTMLSelectElement;
        return [textfield.value, Translator.getDictionary().untranslateType(select.value), elem];
    }

    private parseEntryElems(elems: NodeListOf<HTMLElement>) {
        return [...elems].map(this.parseEntryElem);
    }

    private flushToStructogram() {
        const inputDataEntries = this.inDataElem.querySelectorAll(".t-data-entry") as NodeListOf<HTMLElement>;
        const auxDataEntries = this.auxDataElem.querySelectorAll(".t-data-entry") as NodeListOf<HTMLElement>;
        const outputDataEntries = this.outDataElem.querySelectorAll(".t-data-entry") as NodeListOf<HTMLElement>;
        
        const oldInput = this.structogramBuilder.structogram.inputData.map(entry => [entry[0]!, entry[1]!.id]);
        const oldAux = this.structogramBuilder.structogram.auxData.map(entry => [entry[0]!, entry[1]!.id]);
        const oldOutput = this.structogramBuilder.structogram.outputData.map(entry => [entry[0]!, entry[1]!.id]);

        this.structogramBuilder.structogram.clearData();

        const inputEntries = this.parseEntryElems(inputDataEntries);
        for(const [key, type, elem] of inputEntries) {
            try {
                this.structogramBuilder.structogram.declareInputData(key, parseType(type));
                elem.classList.remove(...errorBorder);
            } catch(error) {
                if(error instanceof TypeParseError) {
                    elem.classList.add(...errorBorder);
                }
            }
        }

        const auxEntries = this.parseEntryElems(auxDataEntries);
        for(const [key, type, elem] of auxEntries) {
            try {
                this.structogramBuilder.structogram.declareAuxData(key, parseType(type));
                elem.classList.remove(...errorBorder);
            } catch(error) {
                if(error instanceof TypeParseError) {
                    elem.classList.add(...errorBorder);
                }
            }
        }

        const outputEntries = this.parseEntryElems(outputDataEntries);
        for(const [key, type, elem] of outputEntries) {
            try {
                this.structogramBuilder.structogram.declareOutputData(key, parseType(type));
                elem.classList.remove(...errorBorder);
            } catch(error) {
                if(error instanceof TypeParseError) {
                    elem.classList.add(...errorBorder);
                }
            }
        }

        this.emitter.emit(SpecificationSettingHandler.specificationChanged, inputEntries, auxEntries, outputEntries, oldInput, oldAux, oldOutput);

        this.structogramBuilder.viewModel.saveCache();
    }

    private setupElements() {
        this.setupDataSettings(this.structogramBuilder.structogram.inputData, this.inDataElem, "specification_in_full");
        this.setupDataSettings(this.structogramBuilder.structogram.auxData, this.auxDataElem, "specification_aux_full");
        this.setupDataSettings(this.structogramBuilder.structogram.outputData, this.outDataElem, "specification_out_full");
    }

    private loadEntriesFor(entries: [string, ValueType][], target: HTMLElement) {
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

    private setupDataSettings(entries: [string, ValueType][], target: HTMLElement, name: string) {
        this.loadEntriesFor(entries, target);
        (target.querySelector(".t-name") as HTMLElement).dataset["trkey"] = name;
        const entriesElem = target.querySelector(".t-entries") as HTMLElement;
        const addButton = target.querySelector(".t-add-button") as HTMLButtonElement;
        addButton.addEventListener("click", () =>  {
            this.addEntry("", numberType, entriesElem);
        });
    }

    private addEntry(key: string, type: ValueType, entriesElem: HTMLElement) {
        const entryElem = this.entryTemplateElem?.cloneNode(true) as HTMLElement;
        const textfield = entryElem.querySelector(`.t-key-textfield`) as HTMLFormElement;
        textfield.value = key;
        const typeSelectorField = entryElem.querySelector(`.t-type-selector`) as HTMLSelectElement;
        typeSelectorField.value = Translator.getDictionary().translateType(type.id);
        const removeButton = entryElem.querySelector(`.t-del-button`) as HTMLButtonElement;
        entriesElem.appendChild(entryElem);
        removeButton.addEventListener("click", () => {
            entriesElem.removeChild(entryElem);
            this.flushToStructogram();
        });
        textfield.addEventListener("change", () => {
            this.flushToStructogram();
        });
        typeSelectorField.addEventListener("change", () => {
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
    private structogramSettingsElem = document.querySelector("#structogram-settings")!;
    private optionResourceManager: ResourceManager = new ResourceManager();
    private optionHandlers: Record<string, OptionHandler> = {};
    private specificationSettingsHandler: SpecificationSettingHandler;
    private builder: StructogramBuilder;

    constructor(structogramBuilder: StructogramBuilder) {
        this.builder = structogramBuilder;
        this.specificationSettingsHandler = new SpecificationSettingHandler(structogramBuilder);
        this.optionResourceManager.register("anystatementoption", statementOptionTemplate);
        this.optionHandlers["anystatementoption"] = new StatementOptionHandler<SimpleValue>(this.optionResourceManager);
        this.optionResourceManager.register("numericstatementoption", statementOptionTemplate);
        this.optionHandlers["numericstatementoption"] = new StatementOptionHandler<SimpleValue>(this.optionResourceManager);
        this.optionResourceManager.register("stringstatementoption", statementOptionTemplate);
        this.optionHandlers["stringstatementoption"] = new StatementOptionHandler<SimpleValue>(this.optionResourceManager);
        this.optionResourceManager.register("booleanstatementoption", statementOptionTemplate);
        this.optionHandlers["booleanstatementoption"] = new StatementOptionHandler<SimpleValue>(this.optionResourceManager);
        this.optionResourceManager.register("booleanstatementlistoption", booleanStatementListOptionTemplate);
        this.optionHandlers["booleanstatementlistoption"] = new BooleanStatementListOptionHandler(this.optionResourceManager);
        this.optionResourceManager.register("keyoption", keyOptionTemplate);
        this.optionHandlers["keyoption"] = new KeyOptionHandler(this.optionResourceManager);
        this.addListenersForHandlers();
        this.addCurrentBlockHandler();
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

    private addCurrentBlockHandler() {
        this.builder.emitter.addListener(StructogramBuilder.currentBlockChanged, () => {
            this.generateHTML();
        });
    }

    public generateHTML() {
        this.structogramSettingsElem.textContent = "";
        if(this.builder.currentBlock) {
            for(const option of this.builder.currentBlock.getOptions()) {
                if(option.getClassIdentifier() in this.optionHandlers) {
                    const node = this.optionHandlers[option.getClassIdentifier()]!.getHTMLNodeFor(option, this.builder.currentBlock);
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

    
}

class StructogramSpecificator {
    private builder: StructogramBuilder;
    private specificationElem = document.querySelector("#specification") as HTMLElement;

    private addEntryTo(clazz: string, entry: string) {
        const currentText = getTemplateText(this.specificationElem, clazz);
        if(currentText.length > 0) {
            setTemplateText(this.specificationElem, clazz, currentText + `, ${entry}`);  
        } else {
            setTemplateText(this.specificationElem, clazz, `${entry}`);  
        }
    }

    constructor(builder: StructogramBuilder) {
        this.builder = builder;
        this.reset();
        builder.structogram.emitter.addListener(Structogram.inputSpecificationEvent, (key, type) => {
            this.addEntryTo("spec-in", `${key}: ${Translator.getDictionary().translateType(type.id)}`);
        });
        builder.structogram.emitter.addListener(Structogram.auxSpecificationEvent, (key, type) => {
            this.addEntryTo("spec-aux", `${key}: ${Translator.getDictionary().translateType(type.id)}`);
        });
        builder.structogram.emitter.addListener(Structogram.outputSpecificationEvent, (key, type) => {
            this.addEntryTo("spec-out", `${key}: ${Translator.getDictionary().translateType(type.id)}`);
        });
        builder.structogram.emitter.addListener(Structogram.specificationClearEvent, () => {
            setTemplateText(this.specificationElem, "spec-in", "");
            setTemplateText(this.specificationElem, "spec-aux", "");
            setTemplateText(this.specificationElem, "spec-out", "");
        });
        this.specificationElem.addEventListener("click", () => {
            builder.currentBlock = undefined;
        });
        Translator.emitter.addListener(Translator.languageChanged, () => {
            this.reset()
        });
    }

    private reset() {
        let inEntries = [];
        for(const [key, type]of this.builder.structogram.inputData) {
            inEntries.push(`${key}: ${Translator.getDictionary().translateType(type.id)}`);
        }
        let auxEntries = [];
        for(const [key, type]of this.builder.structogram.auxData) {
            auxEntries.push(`${key}: ${Translator.getDictionary().translateType(type.id)}`);
        }
        let outEntries = [];
        for(const [key, type]of this.builder.structogram.outputData) {
            outEntries.push(`${key}: ${Translator.getDictionary().translateType(type.id)}`);
        }
        setTemplateText(this.specificationElem, "spec-in", inEntries.join(", "));
        setTemplateText(this.specificationElem, "spec-aux", auxEntries.join(", "));
        setTemplateText(this.specificationElem, "spec-out", outEntries.join(", "));
    }
}

class StructogramGeneralSettings {
    private settingsWindow = document.querySelector("#structogram-general-settings")!;
    private doneButton = this.settingsWindow.querySelector("#structogram-general-settings-done") as HTMLButtonElement;
    private indexSetting = this.settingsWindow.querySelector("#structogram-general-settings-index") as HTMLInputElement;
    private structogram: Structogram;

    constructor(structogram: Structogram, viewModel: ViewModel) {
        this.structogram = structogram;
        this.doneButton.addEventListener("click", () => {
            this.hide();
            viewModel.saveCache();
        });
    }

    private loadSettings() {
        this.indexSetting.value = this.structogram.startingIndex.toString();
    }
    
    private saveSettings() {
        this.structogram.startingIndex = Number(this.indexSetting.value);
    }

    public show() {
        this.loadSettings();
        this.settingsWindow.classList.remove("hidden");
    }

    public hide() {
        this.saveSettings();
        this.settingsWindow.classList.add("hidden");
    }
}