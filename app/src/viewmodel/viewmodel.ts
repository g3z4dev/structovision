import {AnyStatementOption, AssignmentBlock, BackTestingLoopBlock, BlockOption, BooleanStatementListOption, CountingLoopBlock, FrontTestingLoopBlock, KeyOption, MultiBranchingBlock, PrintBlock, StatementOption, Structogram, StructogramBlock, TrueFalseBranchingBlock, type Identifiable, type TypeIdentifiable} from "../model/structogram";
import EventEmitter2 from "eventemitter2";
import {type Listener} from "eventemitter2";
import type { Primitive } from "../model/util";

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

const baseBlockWidth = 100;
const baseBlockHeight = 30;
const textPadding = 8;

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

export class ViewModel {
    private emitter: EventEmitter2 = new EventEmitter2({"maxListeners": 100});
    public currentStructogram: Structogram = new Structogram(this.emitter);
    public readonly structogramEditorView = new StructogramEditorView(this.currentStructogram, this);
    public readonly toolbar = new BlockToolbar(this.currentStructogram);
    public readonly blockEditor = new BlockEditor();
    private runSpeed: number = 100;
   
    constructor() {
        this.structogramEditorView.generateHTML();
        this.currentStructogram.emitter.addListener(Structogram.changedEvent, () => {
            this.structogramEditorView.generateHTML();
        })
        this.toolbar.generateHTML();
    }
}

class StructogramEditorView {
    private readonly viewModel: ViewModel;
    private readonly blockResourceManager: ResourceManager = new ResourceManager();
    private readonly editor = document.querySelector("#editor") as HTMLElement;
    private readonly structogramSVG = document.querySelector("#structogram-svg") as HTMLElement;
    private readonly structogram: Structogram;
    private structogramX = 0;
    private structogramY = 0;
    private structogramWidth = 1024;
    private scale = 1;
    private rightClickDown = false;

    private optionListenerRemovers: (() => void)[] = [];

    constructor(structogram: Structogram, viewModel: ViewModel) {
        this.viewModel = viewModel;
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
        this.editor.addEventListener("mousedown", event => {
            if(event.button == 2) {
                lastX = event.clientX;
                lastY = event.clientY;
                this.rightClickDown = true;
                event.preventDefault();
            }
        });
        this.editor.addEventListener("mousemove", event => {
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
        this.editor.addEventListener("contextmenu", event => {
            event.preventDefault();
        });
        this.editor.addEventListener("wheel", event => {
            this.scale *= (1+Math.sign(event.deltaY)/20);
            this.updateStructogramTransformation();
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
        setHeight(this.structogramSVG, height);
    }

    private replaceOptionValues(template: string, options: BlockOption[]) {
        let text = template ?? "";
        if(text.length == 0) return "";
        for(const option of options) {
            const values = option.getValue();
            if(values.length == 1) {
                text = text.replace(`%${option.name}%`, values[0]!);
            } else if(values.length > 1) {
                for(let i = 0; i < values.length; i++) {
                    text = text.replace(`%${option.name}${i}%`, values[i]!);
                }
            }
        }
        return text;
    }

    private addLabelFor(elem: HTMLElement, options: BlockOption[], x: number, y: number, width: number, height:number) {
        if(!this.structogramSVG) return;
        const text = this.replaceOptionValues(elem.dataset.text ?? "", options);
        const textLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
        textLabel.textContent = text;
        elem.append(textLabel);
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
                const text = this.replaceOptionValues(elem.dataset.text ?? "", options);
                textLabel.textContent = text;
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
            setID(elem, currentBlock.getID());
            const finalBlock = currentBlock;
            elem.addEventListener("click", event => {
                if(event.button == 0) {
                    this.viewModel.blockEditor.currentBlock = finalBlock;
                    event.stopPropagation();
                }
            })
            if(this.viewModel.blockEditor.currentBlock == currentBlock) {
                elem.classList.add("selected-block");
            }
            parent.appendChild(elem);
            const subBlocks = currentBlock.getSubBlocks();
            const subBlockKeys = Object.keys(subBlocks);
            const subBlockCount = Object.keys(subBlocks).length;
            let maxSubBlockHeight = 0;
            for(let i = 0; i < subBlockCount; i++) {
                let childXOffset = Number.parseInt(elem.dataset.childXOffset ?? "0");
                let childYOffset = Number.parseInt(elem.dataset.childYOffset ?? "0");
                const newWidth = (width-childXOffset)/subBlockCount;
                const childHeader = elem.querySelector(".js-childHeader") as HTMLElement | undefined;
                if(childHeader) {
                    const header = childHeader.cloneNode(true) as HTMLElement;
                    header.dataset.text = header.dataset.text!.replace("[i]", i.toString());
                    const x = childXOffset + newWidth*i;
                    const y = 0;
                    setPosition(header, x, y);
                    setSize(header, newWidth, baseBlockHeight)
                    elem.appendChild(header);
                    this.addLabelFor(header, currentBlock.getOptions(), x, y, newWidth, baseBlockHeight);
                }
                const subBlock = subBlocks[subBlockKeys[i]!];
                if(subBlock) {
                    const subBlockHeight = this.resolveHTMLFor(elem, subBlock, newWidth, childXOffset+newWidth*i, childYOffset);
                    if(subBlockHeight > maxSubBlockHeight) maxSubBlockHeight = subBlockHeight;
                } else {
                    const subElem = this.blockResourceManager.getHTMLForObject(undefined)!;
                    setPosition(subElem, childXOffset+newWidth*i, childYOffset);
                    setSize(subElem, newWidth, baseBlockHeight);
                    const finalBlock = currentBlock;
                    subElem.addEventListener("mouseup", event => {
                        if(event.button == 0 && this.viewModel.toolbar.blockBrush) {
                            finalBlock.setSubBlock(subBlockKeys[i]!, this.viewModel.toolbar.blockBrush());
                        }
                    });
                    elem.appendChild(subElem);
                    if(baseBlockHeight > maxSubBlockHeight) maxSubBlockHeight = baseBlockHeight;
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
            this.addLabelFor(elem, currentBlock.getOptions(), xOffset, yOffset, width, visualHeight);
            prevBlock = currentBlock;
            currentBlock = currentBlock?.next;
            yOffset += blockHeight;
        }
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
        return yOffset-_yOffset + baseBlockHeight;
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
                node.classList.remove("selected-block")
            }
        }
        this._currentBlock = block;
        if(this._currentBlock) {
            const node = document.querySelector(`#${this._currentBlock.id}`);
            if(node) {
                node.classList.add("selected-block")
            }
        }
        this.generateHTML();
    }

    public get currentBlock() {
        return this._currentBlock;
    }

}