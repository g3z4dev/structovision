import {BackTestingLoopBlock, BlockOption, Structogram, StructogramBlock, type Identifiable, type TypeIdentifiable} from "../model/structogram";
import EventEmitter2 from "eventemitter2";

import assignmentBlockTemplate from "../../resources/assignmentblock.html";
import printBlockTemplate from "../../resources/printblock.html";
import truefalseBranchingBlockTemplate from "../../resources/truefalsebranchingblock.html";
import multiBranchingBlockTemplate from "../../resources/multibranchingblock.html";
import countingLoopBlockTemplate from "../../resources/countingloopblock.html";
import frontTestingLoopBlockTemplate from "../../resources/fronttestingloopblock.html";
import backTestingLoopBlockTemplate from "../../resources/backtestingloopblock.html";

const baseBlockWidth = 100;
const baseBlockHeight = 30;
const textPadding = 8;

function setID(elem: Element, id: string) {
    elem.setAttribute("id", id);
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

export class ViewModel {
    private emitter: EventEmitter2 = new EventEmitter2();
    public currentStructogram: Structogram = new Structogram(this.emitter);
    private structogramEditorView = new StructogramEditorView(this.currentStructogram);
    private runSpeed: number = 100;
   
    constructor() {
        this.structogramEditorView.generateHTML();
        this.currentStructogram.emitter.addListener(Structogram.changedEvent, () => {
            this.structogramEditorView.generateHTML();
        })
    }
}

class StructogramEditorView {
    private readonly blockResourceManager: ResourceManager = new ResourceManager();
    private readonly editor = document.querySelector("#editor") as HTMLElement;
    private readonly structogramSVG = document.querySelector("#structogram-svg") as HTMLElement;
    private readonly structogram: Structogram;
    private structogramX = 0;
    private structogramY = 0;
    private structogramWidth = 1024;
    private scale = 1;
    private rightClickDown = false;

    constructor(structogram: Structogram) {
        this.blockResourceManager.register("assignmentblock", assignmentBlockTemplate);
        this.blockResourceManager.register("printblock", printBlockTemplate);
        this.blockResourceManager.register("truefalsebranchingblock", truefalseBranchingBlockTemplate);
        this.blockResourceManager.register("multibranchingblock", multiBranchingBlockTemplate);
        this.blockResourceManager.register("countingloopblock", countingLoopBlockTemplate);
        this.blockResourceManager.register("fronttestingloopblock", frontTestingLoopBlockTemplate);
        this.blockResourceManager.register("backtestingloopblock", backTestingLoopBlockTemplate);
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
        this.structogramSVG.innerHTML = "";
        let block = this.structogram.startingBlock;
        this.resolveHTMLFor(this.structogramSVG, block);
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
            option.emitter.removeAllListeners();
            option.emitter.addListener(BlockOption.optionChangedEvent, () => {
                const text = this.replaceOptionValues(elem.dataset.text ?? "", options);
                textLabel.textContent = text;
            }) 
        }
    }

    private resolveHTMLFor(parent: Element, block: StructogramBlock | undefined, width: number = this.structogramWidth, xOffset: number = 0, _yOffset: number = 0): number {
        if(!this.structogramSVG) return 0;
        let currentBlock: StructogramBlock | undefined = block;
        let yOffset = _yOffset;
        while(currentBlock != undefined) {
            const elem = this.blockResourceManager.getHTMLFor(currentBlock)!;
            parent.appendChild(elem);
            const extraChildren = currentBlock.getExtraChildren();
            const extraChildrenCount = Object.keys(extraChildren).length;
            let maxChildrenHeight = 0;
            for(let i = 0; i < extraChildrenCount; i++) {
                let childXOffset = Number.parseInt(elem.dataset.childXOffset ?? "0");
                let childYOffset = Number.parseInt(elem.dataset.childYOffset ?? "0");
                const newWidth = (width-childXOffset)/extraChildrenCount;
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
                const childrenHeight = this.resolveHTMLFor(elem, extraChildren[Object.keys(extraChildren)[i]!], newWidth, childXOffset+newWidth*i, childYOffset);
                if(childrenHeight > maxChildrenHeight) maxChildrenHeight = childrenHeight;
            }
            const blockHeight = maxChildrenHeight + baseBlockHeight;
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
            currentBlock = currentBlock?.next;
            yOffset += blockHeight;
        }
        return yOffset-_yOffset;
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
        setID(element, object.getID());
        return element;
    }
}