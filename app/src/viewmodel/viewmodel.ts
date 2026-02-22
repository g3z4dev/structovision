import {BackTestingLoopBlock, BlockOption, Structogram, StructogramBlock, type Identifiable, type TypeIdentifiable} from "../model/structogram";
import EventEmitter2 from "eventemitter2";

import assignmentBlockTemplate from "../../resources/assignmentblock.html";
import printBlockTemplate from "../../resources/printblock.html";
import truefalseBranchingBlockTemplate from "../../resources/truefalsebranchingblock.html";
import multiBranchingBlockTemplate from "../../resources/multibranchingblock.html";
import countingLoopBlockTemplate from "../../resources/countingloopblock.html";
import frontTestingLoopBlockTemplate from "../../resources/fronttestingloopblock.html";
import backTestingLoopBlockTemplate from "../../resources/backtestingloopblock.html";

const structogram = document.getElementById("structogram");

export class ViewModel {
    private emitter: EventEmitter2 = new EventEmitter2();
    public currentStructogram: Structogram = new Structogram(this.emitter);
    private selectedBlock: StructogramBlock | undefined;
    private runSpeed: number = 100;
    private blockResourceManager: ResourceManager = new ResourceManager();
    private structogramX = 0;
    private structogramY = 0;
    private structogramWidth = 1024;

    constructor() {
        this.blockResourceManager.register("assignmentblock", assignmentBlockTemplate);
        this.blockResourceManager.register("printblock", printBlockTemplate);
        this.blockResourceManager.register("truefalsebranchingblock", truefalseBranchingBlockTemplate);
        this.blockResourceManager.register("multibranchingblock", multiBranchingBlockTemplate);
        this.blockResourceManager.register("countingloopblock", countingLoopBlockTemplate);
        this.blockResourceManager.register("fronttestingloopblock", frontTestingLoopBlockTemplate);
        this.blockResourceManager.register("backtestingloopblock", backTestingLoopBlockTemplate);
        this.onWindowSizeUpdate();
        window.onresize = this.onWindowSizeUpdate;
        this.currentStructogram.emitter.addListener(Structogram.changedEvent, () => this.onStructogramUpdated());
    }

    private static updateValuesFor(option: BlockOption, elem: HTMLElement) {
        let innerHTML = elem.innerHTML;
        const values = option.getValue();
        if(values.length == 1) {
            innerHTML = innerHTML.replace(`%${option.name}%`, values[0]!);
        } else if(values.length > 1) {
            for(let i = 0; i < values.length; i++) {
                innerHTML = innerHTML.replace(`%${option.name}${i}%`, values[i]!);
            }
        }
        elem.innerHTML = innerHTML;
    }

    private static setTransformationFor(elem: HTMLElement, width: number, height: number, textXOffset: number, textYOffset: number) {
        elem.innerHTML = elem.innerHTML
            .replace("{width}", (width-2).toString())
            .replace("{height}", (height-2).toString())
            .replace("{textXOffset}", textXOffset.toString())
            .replace("{textYOffset}", textYOffset.toString());
        elem.setAttribute("width", width.toString());
        elem.setAttribute("height", height.toString());
    }

    public setStartingBlock(block: StructogramBlock) {
        this.currentStructogram?.setStartingBlock(block);
    }

    public onWindowSizeUpdate() {
        const posInfo = structogram?.getBoundingClientRect();
        this.structogramX = posInfo!.left + posInfo!.width/2 - this.structogramWidth/2;
        this.structogramY = posInfo!.top + posInfo!.height/2;
    }

    private resolveHTMLFor(block: StructogramBlock | undefined, width: number = this.structogramWidth, xOffset: number = 0, _yOffset: number = 0): number {
        if(!structogram) return 0;
        let currentBlock: StructogramBlock | undefined = block;
        let yOffset = _yOffset;
        while(currentBlock != undefined) {
            const elem = this.blockResourceManager.getHTMLFor(currentBlock)!;
            elem.setAttribute("x", (this.structogramX + xOffset).toString());
            elem.setAttribute("y", (this.structogramY + yOffset).toString());
            for(const option of currentBlock.getOptions()) {
                ViewModel.updateValuesFor(option, elem);
                option.emitter.addListener(BlockOption.optionChangedEvent, () => {
                    ViewModel.updateValuesFor(option, elem);
                });
            }
            structogram.appendChild(elem);
            const extraChildren = currentBlock.getExtraChildren();
            const extraChildrenCount = Object.keys(extraChildren).length;
            const startY = yOffset;
            let maxOffset = yOffset + 20;
            if(extraChildrenCount == 1) {
                const newWidth = width - 20;
                const offset = this.resolveHTMLFor(extraChildren[Object.keys(extraChildren)[0]!], newWidth, xOffset+20, 
                                                    currentBlock instanceof BackTestingLoopBlock ? yOffset : yOffset + 20);
                if(offset > maxOffset) maxOffset = offset;
            } else {
                for(let i = 0; i < extraChildrenCount; i++) {
                    const newWidth = width/extraChildrenCount;
                    const offset = this.resolveHTMLFor(extraChildren[Object.keys(extraChildren)[i]!], newWidth, xOffset+newWidth*i, yOffset + 20);
                    if(offset > maxOffset) maxOffset = offset;
                }
            }
            if(currentBlock instanceof BackTestingLoopBlock) {
                maxOffset += 20;
            }
            ViewModel.setTransformationFor(elem, width, maxOffset-startY, 4, currentBlock instanceof BackTestingLoopBlock ? maxOffset-startY - 4 : 16);
            currentBlock = currentBlock?.next;
            yOffset = maxOffset;
        }
        return yOffset;
    }

    public onStructogramUpdated() {
        if(!structogram) return;
        structogram.innerHTML = "";
        let block = this.currentStructogram?.startingBlock;
        this.resolveHTMLFor(block);
    }
}

class ResourceManager {
    private resourceCache: Record<string, string> = {};

    public register(typeID: string, html: string) {
        this.resourceCache[typeID] = html;
    }

    public getHTMLFor(object: TypeIdentifiable & Identifiable) {
        if(!(object.getTypeIdentifier() in this.resourceCache)) {
            return undefined;
        }
        const htmlText = this.resourceCache[object.getTypeIdentifier()]!;
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = htmlText;
        const element: HTMLElement = tempDiv.firstChild! as HTMLElement;
        element.setAttribute("id", object.getID());
        return element;
    }
}