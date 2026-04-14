import { BlockOption, MultiBranchingBlock, Structogram, StructogramIssue, type StructogramBlock } from "../model/structogram";
import { applyTransformation, CameraHandler, centerX, getX, getY, ResourceManager, setID, setPosition, setSize, setTemplateText, setX, setY } from "./util";

import assignmentBlockTemplate from "../../resources/blocks/assignmentblock.html";
import controlBlockTemplate from "../../resources/blocks/controlblock.html";
import printBlockTemplate from "../../resources/blocks/printblock.html";
import truefalseBranchingBlockTemplate from "../../resources/blocks/truefalsebranchingblock.html";
import multiBranchingBlockTemplate from "../../resources/blocks/multibranchingblock.html";
import countingLoopBlockTemplate from "../../resources/blocks/countingloopblock.html";
import frontTestingLoopBlockTemplate from "../../resources/blocks/fronttestingloopblock.html";
import backTestingLoopBlockTemplate from "../../resources/blocks/backtestingloopblock.html";
import undefinedBlockTemplate from "../../resources/blocks/undefinedblock.html";
import { baseBlockHeight, textPadding } from "./constants";
import type { ViewModel } from "./viewmodel";


/**
 * This class is used identify the context in which an undefined block was found in.
 */
export class UndefinedBlockContext {
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

export class StructogramRenderer {
    public readonly viewModel: ViewModel;
    protected readonly blockResourceManager: ResourceManager = new ResourceManager();
    protected readonly mainElement;
    protected readonly viewElement;
    protected readonly renderTarget;
    protected readonly structogramSVG: SVGSVGElement;
    public readonly structogram: Structogram;
    protected readonly originOffsetX;
    protected readonly originOffsetY;
    protected originX = 0;
    protected originY = 0;
    protected scale = 1;
    protected rightClickDown = false;
    public readonly idPrefix;
    private readonly cameraHandler: CameraHandler;

    /**
     * This is potentially a temporary solution for removing specified listeners from an emitter.
     * Could be replaced for a more robust solution.
     */
    private optionListenerRemovers: (() => void)[] = [];

    constructor(viewModel: ViewModel, structogram: Structogram, mainElement: HTMLElement, idPrefix: string) {
        this.viewModel = viewModel;
        this.mainElement = mainElement;
        this.viewElement = mainElement.querySelector(".structogram-view") as HTMLElement;
        this.renderTarget = this.viewElement.querySelector(".render-target") as SVGSVGElement;
        this.structogramSVG = this.renderTarget.querySelector(".structogram-svg") as SVGSVGElement;
        this.originOffsetX = getX(this.structogramSVG);
        this.originOffsetY = getY(this.structogramSVG);
        this.blockResourceManager.register("assignmentblock", assignmentBlockTemplate);
        this.blockResourceManager.register("controlblock", controlBlockTemplate);
        this.blockResourceManager.register("printblock", printBlockTemplate);
        this.blockResourceManager.register("truefalsebranchingblock", truefalseBranchingBlockTemplate);
        this.blockResourceManager.register("multibranchingblock", multiBranchingBlockTemplate);
        this.blockResourceManager.register("countingloopblock", countingLoopBlockTemplate);
        this.blockResourceManager.register("fronttestingloopblock", frontTestingLoopBlockTemplate);
        this.blockResourceManager.register("backtestingloopblock", backTestingLoopBlockTemplate);
        this.blockResourceManager.register("undefined", undefinedBlockTemplate);
        this.structogram = structogram;
        this.cameraHandler = new CameraHandler(this.viewElement, () => this.updateStructogramViewTransformation());
        this.idPrefix = idPrefix;
        this.structogram.emitter.addListener(Structogram.issuesChangedEvent, (oldIssues: StructogramIssue[], newIssues: StructogramIssue[]) => {
            for(const issue of oldIssues) {
                const block = this.renderTarget.querySelector(`#${idPrefix}-${issue.id}`);
                if(block) {
                    block.classList.remove("fill-red-100");
                    block.classList.add("fill-white");
                }
            }
            for(const issue of newIssues) {
                const block = this.renderTarget.querySelector(`#${idPrefix}-${issue.id}`);
                if(block) {
                    block.classList.add("fill-red-100");
                    block.classList.remove("fill-white");
                }
            }
        });
    }

    /**
     * Updates the transformation used on the strutogramview to give the illusion of a camera moving.
     */
    protected updateStructogramViewTransformation() {
        this.originX = this.cameraHandler.x;
        this.originY = this.cameraHandler.y;
        this.scale = this.cameraHandler.scale;
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
        setSize(this.structogramSVG, this.viewModel.structogramWidth, height);
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
        const textLabel = elem.querySelector(".t-text") as SVGTextElement | undefined;
        if(!textLabel) return;
        const textHLocation = elem.dataset.textHLocation ?? "left";
        if(textHLocation == "center") {
            centerX(textLabel, width/2);
        } else {
            setX(textLabel, textPadding);
        }
        const textVLocation = elem.dataset.textVLocation ?? "top";
        if(textVLocation == "bottom") {
            setY(textLabel, height-textPadding);
        } else {
            setY(textLabel, baseBlockHeight-textPadding);
        }
        for(const option of options) {
            const listener = () => {
                this.replaceOptionValues(elem, options, index);
                if(textHLocation == "center") {
                    centerX(textLabel, width/2);
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
    protected resolveHTMLFor(parent: Element, block: StructogramBlock | undefined, width: number = this.viewModel.structogramWidth, xOffset: number = 0, _yOffset: number = 0): number {
        let prevBlock: StructogramBlock | undefined = undefined;
        let currentBlock: StructogramBlock | undefined = block;
        let yOffset = _yOffset;
        while(currentBlock != undefined) {
            const elem = this.blockResourceManager.getHTMLForObject(currentBlock)!;
            this.onBlockAdded(currentBlock, prevBlock, elem);
            parent.appendChild(elem);
            const subBlocks = currentBlock.getSubBlocks();
            const orderedSubBlocks = currentBlock.getOrderedSubBlocks();
            const subBlockKeys = orderedSubBlocks.map(e => e[0]!);
            const subBlockCount = orderedSubBlocks.length;
            let maxSubBlockHeight = 0;
            
            function resolveSubBlocks(renderer: StructogramRenderer, currentBlock: StructogramBlock, i: number) {
                let subBlockXOffset = Number.parseInt(elem.dataset.subblockXOffset ?? "0");
                let subBlockYOffset = Number.parseInt(elem.dataset.subblockYOffset ?? "0");
                const newWidth = (width-subBlockXOffset)/subBlockCount;
                
                if(currentBlock instanceof MultiBranchingBlock) {
                    let header = undefined;
                    if(i == subBlockCount-1) {
                        header = elem.querySelector(".t-else-header")!.cloneNode(true) as HTMLElement;
                    } else {
                        const subBlockHeader = elem.querySelector(".t-subblock-header") as HTMLElement;
                        header = subBlockHeader.cloneNode(true) as HTMLElement;
                        for(const child of (header.querySelectorAll(":not(svg) *") ?? []) as NodeListOf<HTMLElement>) {
                            if("indexedClass" in child.dataset) {
                                child.classList.add(`${child.dataset["indexedClass"]!}${i}`);
                            }
                        }
                    }
                    elem.appendChild(header);
                    const x = subBlockXOffset + newWidth*i;
                    const y = 0;
                    setPosition(header, x, y);
                    setSize(header, newWidth, baseBlockHeight);
                    renderer.setupTextFor(header, currentBlock.options, newWidth, baseBlockHeight, i);
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
            this.setupTextFor(elem, currentBlock.options, width, visualHeight);
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
     * @param elem the HTML element it was resolved into
     */
    protected onBlockAdded(block: StructogramBlock, parent: StructogramBlock | undefined, elem: HTMLElement) {
        elem.id = this.idPrefix + "-" + block.id;
        if(this.structogram.issues.map(i => i.id).includes(block.id)) {
            elem.classList.add("fill-red-100");
            elem.classList.remove("fill-white");
        }
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

    public show() {
        this.mainElement.classList.remove("hidden");
        this.updateHTML();
    }

    public hide() {
        this.mainElement.classList.add("hidden");
    }

    public runFrame(delta: number) {

    }
}