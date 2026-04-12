import EventEmitter2 from "eventemitter2";
import { SimpleValue, type _Value, type Value, type ValueType } from "./types";

export type VariableType = "number" | "string" | "boolean";


export class VariableCreationError extends Error {
    public readonly translationKey: string;

    constructor(m: string, translationKey: string) {
        super(m);
        this.translationKey = translationKey;
        Object.setPrototypeOf(this, VariableCreationError.prototype);
    }
}

export class Memory {
    private variables: Record<string, MemoryEntry>;
    public readonly emitter: EventEmitter2 = new EventEmitter2();

    private static readonly forbiddenKeys = [
        "true",
        "false",
        "undefined"
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

    public createVariable(key: string, value: ValueType, constant: boolean = false) {
        if(Memory.forbiddenKeys.includes(key) || !this.validateKeyName(key)) {
            throw new VariableCreationError(`Using [${key}] as a variable key is forbidden due to unsupported characters or matching literals!`, "error_forbidden_key");
        }
        if(key in this.variables) {
            throw new VariableCreationError(`Variable with key [${key}] is already defined!`, "error_duplicate_key");
        }
        const entry = new MemoryEntry(key, value, constant);
        this.variables[key] = entry;
        this.emitter.emit(Memory.variableAddedEvent, entry);
    }

    public setVariable(key: string, value: Value) {
        if(key in this.variables) {
            const prevValue = this.variables[key]!.value;
            this.variables[key]!.value = value;
            this.emitter.emit(Memory.variableChangedEvent, key, prevValue, value);
            return;
        }
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    public getVariable(key: string): Value {
        if(key in this.variables) {
            this.emitter.emit(Memory.variableAccessedEvent, key);
            return this.variables[key]!.value;
        }
        
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    public getEntries(): MemoryEntry[] {
        return [...Object.values(this.variables)].map(e => new ReadOnlyMemoryEntry(e));
    }

    public getAllValuesWithBaseIdentifier(id: string) {
        return this.getEntries().filter(value => value.type.baseIdentifier == id);
    }

    public getType(key: string): ValueType {
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

    public changeVariable(key: string, fn: (v:Value) => Value) {
        if(key in this.variables) {
            const prevValue = this.variables[key]!.value;
            const value = fn(this.variables[key]!.value)
            this.variables[key]!.value = value;
            this.emitter.emit(Memory.variableChangedEvent, key, prevValue, value);
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
    protected _value: Value;
    public readonly type: ValueType;
    public readonly constant: boolean;

    constructor(key: string, type: ValueType, constant: boolean) {
        this.key = key;
        this._value = SimpleValue.undefined();
        this.type = type;
        this.constant = constant;
    }

    public get value() {
        return this._value;
    }

    public set value(value: Value) {
        if(this.constant && this._value.getType().baseIdentifier != "undefined") {
            throw new Error("Constant variable cannot be modified!");
        }
        if(!this.type.matches(value.getType())) {
            throw new Error(`Value must be of type [${this.type.baseIdentifier}] but is [${value.getType().baseIdentifier}]!`);
        }
        this._value = value;
    }
}

export class ReadOnlyMemoryEntry extends MemoryEntry {

    constructor(entry: MemoryEntry) {
        super(entry.key, entry.type, entry.constant);
        this._value = entry.value;
    }

    // the overridden setter will also override the getter so we need to redefine it
    public get value() {
        return this._value;
    }

    public override set value(_value: Value) {
        throw new Error("ReadOnlyMemoryEntry cannot be changed!");
    }
}