import {type Primitive} from "./util.ts";
import EventEmitter2 from "eventemitter2";

class UtilityObject {

}

type MemoryValue = Primitive | UtilityObject;

export class VariableCreationError extends Error {

    constructor(m: string) {
        super(m);
        Object.setPrototypeOf(this, VariableCreationError.prototype);
    }
}

export class Memory {
    private variables: Record<string, Primitive>;
    private emitter: EventEmitter2 | undefined;

    private static readonly forbiddenKeys = [
        "true",
        "false"
    ];

    public static readonly variableAddedEvent: string = "memory.variable.added";
    public static readonly variableChangedEvent: string = "memory.variable.changed";
    public static readonly objectAddedEvent: string = "memory.object.added";

    constructor(emitter?: EventEmitter2) {
        this.variables = {};
        this.emitter = emitter;
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

    public createVariable(key: string, value: Primitive) {
        if(Memory.forbiddenKeys.includes(key) || !this.validateKeyName(key)) {
            throw new VariableCreationError(`Using [${key}] as a variable key is forbidden due to unsupported characters or matching literals!`);
        }
        if(key in this.variables) {
            throw new VariableCreationError(`Variable with key [${key}] is already defined!`);
        }
        this.variables[key] = value;
        this.emitter?.emit(Memory.variableAddedEvent, [key, value]);
    }

    public setVariable(key: string, value: Primitive) {
        if(key in this.variables) {
            this.variables[key] = value;
            this.emitter?.emit(Memory.variableChangedEvent, [key, value]);
            return;
        }
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    public getVariable(key: string): Primitive {
        if(key in this.variables) {
            return this.variables[key]!;
        }
        
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    public hasVariable(key: string): boolean {
        return key in this.variables;
    }

    public changeVariable(key: string, fn: (v:Primitive) => Primitive) {
        if(key in this.variables) {
            this.variables[key] = fn(this.variables[key]!);
            return;
        }
        
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    public clear(): void {
        this.variables = {};
    }
}