import {type Primitive} from "./util.ts";
import EventEmitter2 from "eventemitter2";

class UtilityObject {

}

type MemoryValue = Primitive | UtilityObject;

export type VariableType = "number" | "string" | "boolean";

export class VariableCreationError extends Error {

    constructor(m: string) {
        super(m);
        Object.setPrototypeOf(this, VariableCreationError.prototype);
    }
}

export class Memory {
    private variables: Record<string, MemoryEntry>;
    public readonly emitter: EventEmitter2 = new EventEmitter2();

    private static readonly forbiddenKeys = [
        "true",
        "false"
    ];

    public static readonly variableAddedEvent: string = "memory.variable.added";
    public static readonly variableChangedEvent: string = "memory.variable.changed";
    public static readonly variableAccessedEvent: string = "memory.variable.accessed";
    public static readonly objectAddedEvent: string = "memory.object.added";

    constructor() {
        this.variables = {};
    }

    private validateKeyName(key: string): boolean {
        if(key.length == 0) return false;

        function isAlphabethic(c: string) {
            return ("a" <= c && c <= "z") || ("A" <= c && c <= "Z");
        }

        function isNumeric(c: string) {
            return "0" <= c && c <= "9";
        }

        function isAllowedSpecial(c: string) {
            return c == "_";
        }

        if(isNumeric(key.charAt(0))) {
            return false;
        }

        let onlyNumeric = true;
        for(const c of key) {
            if(!(isAlphabethic(c) || isNumeric(c) || isAllowedSpecial(c))) {
                return false;
            }
            onlyNumeric = onlyNumeric && !isAlphabethic(c) && !isAllowedSpecial(c);
        }

        return !onlyNumeric;
    }

    public createVariable(key: string, type: VariableType, value: Primitive | undefined = undefined, constant: boolean = false) {
        if(Memory.forbiddenKeys.includes(key) || !this.validateKeyName(key)) {
            throw new VariableCreationError(`Using [${key}] as a variable key is forbidden due to unsupported characters or matching literals!`);
        }
        if(key in this.variables) {
            throw new VariableCreationError(`Variable with key [${key}] is already defined!`);
        }
        if(!value) {
            if(type == "number") {
                value = 0;
            } else if(type == "string") {
                value = "";
            } else if(type == "boolean") {
                value = false;
            }
        }
        const entry = new MemoryEntry(key, value!, type, constant);
        this.variables[key] = entry;
        this.emitter.emit(Memory.variableAddedEvent, key, entry);
    }

    public setVariable(key: string, value: Primitive) {
        if(key in this.variables) {
            this.variables[key]!.value = value;
            this.emitter.emit(Memory.variableChangedEvent, key, value);
            return;
        }
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    public getVariable(key: string): Primitive {
        if(key in this.variables) {
            this.emitter.emit(Memory.variableAccessedEvent, key);
            return this.variables[key]!.value;
        }
        
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    // todo test if this exposes the inner state or not
    public getEntries(): [string, MemoryEntry][] {
        return [...Object.entries(this.variables)];
    }

    public getType(key: string): string {
        if(key in this.variables) {
            this.emitter.emit(Memory.variableAccessedEvent, key);
            return this.variables[key]!.type;
        }
        
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    public hasVariable(key: string): boolean {
        return key in this.variables;
    }

    public isConstant(key: string): boolean {
        if(key in this.variables) {
            this.emitter.emit(Memory.variableAccessedEvent, key);
            return this.variables[key]!.constant;
        }
        
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    public changeVariable(key: string, fn: (v:Primitive) => Primitive) {
        if(key in this.variables) {
            const value = fn(this.variables[key]!.value)
            this.variables[key]!.value = value;
            this.emitter.emit(Memory.variableChangedEvent, key, value);
            return;
        }
        
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    public clear(): void {
        this.variables = {};
    }
}

export class MemoryEntry {
    public readonly key: string;
    private _value: Primitive;
    public readonly type: string;
    public readonly constant: boolean;

    constructor(key: string, value: Primitive, type: VariableType, constant: boolean) {
        this.key = key;
        this._value = value;
        this.type = type;
        this.constant = constant;
    }

    public get value() {
        return this._value;
    }

    public set value(value: Primitive) {
        if(this.constant) {
            throw new Error("Constant variable cannot be modified!");
        }
        if((typeof value) != this.type) {
            throw new Error(`Value must be of type [${this.type}] but is ${typeof value}!`);
        }
        this._value = value;
    }
}