import type { ClassIdentifiable } from "../model/types";

export function setID(elem: Element, id: string) {
    elem.setAttribute("id", id);
}

export function getID(elem: Element) {
    return elem.getAttribute("id") ?? "";
}

export function setX(elem: Element, x: number) {
    elem.setAttribute("x", `${x}`);
}

export function setY(elem: Element, y: number) {
    elem.setAttribute("y", `${y}`);
}

export function centerX(elem: SVGGraphicsElement, x: number) {
    elem.setAttribute("x", `${x - elem.getBBox().width/2}`);
}

export function getX(elem: Element): number {
    return Number.parseInt(elem.getAttribute("x")!);
}

export function getY(elem: Element): number {
    return Number.parseInt(elem.getAttribute("y")!);
}

export function setPosition(elem: Element, x: number, y: number) {
    setX(elem, x);
    setY(elem, y);
}

export function setX1(elem: Element, x: number) {
    elem.setAttribute("x1", `${x}`);
}

export function setY1(elem: Element, y: number) {
    elem.setAttribute("y1", `${y}`);
}

export function setPosition1(elem: Element, x: number, y: number) {
    setX1(elem, x);
    setY1(elem, y);
}

export function setX2(elem: Element, x: number) {
    elem.setAttribute("x2", `${x}`);
}

export function setY2(elem: Element, y: number) {
    elem.setAttribute("y2", `${y}`);
}

export function setPosition2(elem: Element, x: number, y: number) {
    setX2(elem, x);
    setY2(elem, y);
}

export function setWidth(elem: Element, width: number) {
    elem.setAttribute("width", `${width}`);
}

export function setHeight(elem: Element, height: number) {
    elem.setAttribute("height", `${height}`);
}

export function setSize(elem: Element, width: number, height: number) {
    setWidth(elem, width);
    setHeight(elem, height);
}

/**
 * A shorthand for applying transformation (translation and scaling) to an element
 * @param elem the element to apply the transformation on
 * @param x the x component to translate with
 * @param y the y component to translate with
 * @param scale the x and y scaling to scale with
 */
export function applyTransformation(elem: Element, x: number, y: number, scale: number) {
    elem.setAttribute("transform", `scale(${scale}, ${scale}) translate(${x},${y}) `);
}

/**
 * Takes an element and searches for a child node in it that has a given class with a prefix "t-", if it finds a node
 * like that it replaces the text content within it to a given text.
 * @param elem the elem to search in
 * @param clazz the class to search for
 * @param text the text to replace the text content for
 */
export function setTemplateText(elem: HTMLElement, clazz: string, text: string): void {
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
export function getTemplateText(elem: HTMLElement, clazz: string): string {
    const n = elem.querySelector(`.t-${clazz}`) as HTMLElement | undefined;
    return n!.textContent;
}

/**
 * This function takes a string parses it into an HTMLElement by the browser.
 * @param text the text to convert
 * @returns the converted html node
 */
export function parseIntoHTML(text: string) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = text;
    return tempDiv.firstChild as HTMLElement;
}

export class ResourceManager {
    private resourceCache: Record<string, string> = {};

    public register(typeID: string, html: string) {
        this.resourceCache[typeID] = html;
    }

    public getHTMLForObject(object: ClassIdentifiable | undefined) {
        if(object) {
            return this.getHTMLFor(object.getClassIdentifier());
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

/**
 * A simple class representing a window containing a list.
 * Used for the error and result windows.
 */
export class ListWindow {
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

export function lerp(v1: number, v2: number, t: number) {
    return v1 + (v2-v1)*t;
}