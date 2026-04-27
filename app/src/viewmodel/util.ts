import type { ClassIdentifiable } from "../model/types";

/**
 * Sets the value of an Element's id attribute.
 * @param elem The element to the set the id of.
 * @param id The id to set.
 */
export function setID(elem: Element, id: string) {
    elem.setAttribute("id", id);
}

/**
 * Retrieves the value of an Element's id attribute.
 * @param elem The element to the get the id of.
 * @returns The id of the Element.
 */
export function getID(elem: Element) {
    return elem.getAttribute("id") ?? "";
}

/**
 * Sets value of an Element's x attribute.
 * @param elem The element to the set the x attribute of.
 * @param x The new value of x.
 */
export function setX(elem: Element, x: number) {
    elem.setAttribute("x", `${x}`);
}

/**
 * Sets the value of an Element's y attribute.
 * @param elem The element to the set the y attribute of.
 * @param y The new value of y.
 */
export function setY(elem: Element, y: number) {
    elem.setAttribute("y", `${y}`);
}

/**
 * Sets an SVGGraphicsElement's x attribute to be centered around an x coordinate.
 * @param elem The element to the set the x attribute of.
 * @param x The x coordinate of the center.
 */
export function centerX(elem: SVGGraphicsElement, x: number) {
    elem.setAttribute("x", `${x - elem.getBBox().width/2}`);
}

/**
 * Retrieves the value of an Element's x attribute.
 * @param elem The element to the get the x attribute of.
 * @returns The value of the x attribute of the Element.
 */
export function getX(elem: Element): number {
    return Number.parseInt(elem.getAttribute("x")!);
}

/**
 * Retrieves the value of an Element's y attribute.
 * @param elem The element to the get the y attribute of.
 * @returns The value of the y attribute of the Element.
 */
export function getY(elem: Element): number {
    return Number.parseInt(elem.getAttribute("y")!);
}

/**
 * Sets the value of the x and y attribute of an Element.
 * @param elem The element to the get the attributes of.
 * @param x The new value of x.
 * @param y The new value of y.
 */
export function setPosition(elem: Element, x: number, y: number) {
    setX(elem, x);
    setY(elem, y);
}

/**
 * Sets the value of an Element's width attribute.
 * @param elem The element to the set the width attribute of.
 * @param width The new value of width.
 */
export function setWidth(elem: Element, width: number) {
    elem.setAttribute("width", `${width}`);
}

/**
 * Sets the value of an Element's height attribute.
 * @param elem The element to the set the height attribute of.
 * @param height The new value of height.
 */
export function setHeight(elem: Element, height: number) {
    elem.
    setAttribute("height", `${height}`);
}
/**
 * Sets the value of the width and height attribute of an Element.
 * @param elem The element to the get the attributes of.
 * @param width The new value of width.
 * @param height The new value of height.
 */
export function setSize(elem: Element, width: number, height: number) {
    setWidth(elem, width);
    setHeight(elem, height);
}

/**
 * A shorthand for applying transformation (translation and scaling) to an element
 * @param elem The element to apply the transformation on.
 * @param x The x component to translate with.
 * @param y The y component to translate with.
 * @param scale The x and y scaling to scale with.
 */
export function applyTranslationAndScale(elem: Element, x: number, y: number, scale: number) {
    elem.setAttribute("transform", `scale(${scale}, ${scale}) translate(${x},${y}) `);
}

/**
 * Takes an element and searches for a child node in it that has a given class with a prefix "t-", if it finds a node
 * like that it replaces the text content within it to a given text.
 * @param elem The elem to search in.
 * @param clazz The class to search for.
 * @param text The text to replace the text content for.
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
 * @param elem The elem to search in.
 * @param clazz The class to search for.
 * @returns The text content of that found node.
 */
export function getTemplateText(elem: HTMLElement, clazz: string): string {
    const n = elem.querySelector(`.t-${clazz}`) as HTMLElement | undefined;
    return n!.textContent;
}

/**
 * This function takes a string parses it into an HTMLElement by the browser.
 * @param text The text to convert.
 * @returns The converted html node.
 */
export function parseIntoHTML(text: string) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = text;
    return tempDiv.firstChild as HTMLElement;
}

/**
 * Handles the pairing of class identifiers to HTML templates.
 */
export class ResourceManager {
    private resourceCache: Record<string, string> = {};

    public register(typeID: string, html: string) {
        this.resourceCache[typeID] = html;
    }

    public getHTMLForObject(object: ClassIdentifiable | undefined) {
        if(object) {
            return this.getHTMLFor(object.classIdentifier);
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

/**
 * An object that handles moving the "camera" with right-click and scroll.
 */
export class CameraHandler {
    private _x = 0;
    private _y = 0;
    private _scale = 1;
    private rightClickDown = false;

    public get x() {
        return this._x;
    }

    private set x(x: number) {
        this._x = x;
    }

    public get y() {
        return this._y;
    }

    private set y(y: number) {
        this._y = y;
    }

    public get scale() {
        return this._scale;
    }

    private set scale(scale: number) {
        this._scale = scale;
    }

    constructor(associatedElement: HTMLElement, onChange: () => void = () => {}) {
        let lastX = 0;
        let lastY = 0;
        associatedElement.addEventListener("mousedown", event => {
            if(event.button == 2) {
                lastX = event.clientX;
                lastY = event.clientY;
                this.rightClickDown = true;
                event.preventDefault();
            }
        });
        associatedElement.addEventListener("mousemove", event => {
            if(this.rightClickDown) {
                const deltaX = event.clientX - lastX;
                const deltaY = event.clientY - lastY;
                lastX = event.clientX;
                lastY = event.clientY;
                this.x += deltaX;
                this.y += deltaY;
                onChange();
            }
        });
        document.addEventListener("mouseup", event => {
            if(event.button == 2) {
                this.rightClickDown = false;
            }
        });
        associatedElement.addEventListener("contextmenu", event => {
            event.preventDefault();
        });
        associatedElement.addEventListener("wheel", event => {
            this.scale *= (1+Math.sign(event.deltaY)/20);
            onChange();
            event.preventDefault();
        });
    }
}