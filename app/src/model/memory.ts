import EventEmitter2 from "eventemitter2";
import { SimpleValue, type _Value, type Value, type ValueType } from "./types";

export type VariableType = "number" | "string" | "boolean";

export class VariableCreationError extends Error {
    public readonly errorID: string;

    constructor(m: string, errorID: string) {
        super(m);
        this.errorID = errorID;
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

    /**
     * Fired when a variable is declared.
     * Its arguments are: entry: entry: ReadOnlyMemoryEntry
     */
    public static readonly variableDeclaredEvent: string = "memory.variable.declared";

    /**
     * Fired when a variable is changed.
     * Its arguments are: entry: key: string, prevValue: Value, value: Value
     */
    public static readonly variableChangedEvent: string = "memory.variable.changed";

    /**
     * Fired when a variable is accessed.
     * Its arguments are: key: string, value: Value
     */
    public static readonly variableAccessedEvent: string = "memory.variable.accessed";

    constructor() {
        this.variables = {};
    }

    private validateKey(key: string): boolean {
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

    /**
     * Declares a variable with a given key and type.
     * @param key The key the variable can be accessed with.
     * @param type The type of the variable.
     * @param constant Whether or not the variable is constant.
     * @throws {VariableCreationError} Key must not be forbidden.
     * @throws {VariableCreationError} Key must not be already defined.
     */
    public createVariable(key: string, type: ValueType, constant: boolean = false) {
        if(Memory.forbiddenKeys.includes(key) || !this.validateKey(key)) {
            throw new VariableCreationError(`Using [${key}] as a variable key is forbidden!`, "error_forbidden_key");
        }
        if(key in this.variables) {
            throw new VariableCreationError(`Variable with key [${key}] is already defined!`, "error_duplicate_key");
        }
        const entry = new MemoryEntry(key, type, constant);
        this.variables[key] = entry;
        this.emitter.emit(Memory.variableDeclaredEvent, new ReadOnlyMemoryEntry(entry));
    }

    /**
     * Sets the value of a variable with a given key.
     * @param key The key of the variable.
     * @param value The new value of the variable.
     * @throws {Error} Variable with key must exist.
     */
    public setVariable(key: string, value: Value) {
        if(key in this.variables) {
            const prevValue = this.variables[key]!.value;
            this.variables[key]!.value = value;
            this.emitter.emit(Memory.variableChangedEvent, key, prevValue, value);
            return;
        }
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    /**
     * @param key The key of the variable.
     * @returns The value of the variable.
     * @throws {Error} Variable with key must exist.
     */
    public getVariable(key: string): Value {
        if(key in this.variables) {
            this.emitter.emit(Memory.variableAccessedEvent, key, this.variables[key]!.value);
            return this.variables[key]!.value;
        }
        
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    /**
     * A snapshot of all the entries in memory.
     */
    public get entries(): MemoryEntry[] {
        return [...Object.values(this.variables)].map(e => new ReadOnlyMemoryEntry(e));
    }

    /**
     * @param id The base identifier of the value type.
     * @returns A list of all the entries whose value has the requested base identifier.
     */
    public getAllValuesWithBaseIdentifier(id: string) {
        return this.entries.filter(value => value.type.baseIdentifier == id);
    }

    /**
     * @param key The key of the variable.
     * @returns The type of the variable.
     * @throws {Error} Variable with key must exist.
     */
    public getType(key: string): ValueType {
        if(key in this.variables) {
            this.emitter.emit(Memory.variableAccessedEvent, key, this.variables[key]!.value);
            return this.variables[key]!.type;
        }
        
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    /**
     * Checks if a variable of a given key has an entry in the memory.
     * @param key The key of the variable.
     * @returns Whether or not the variable exists.
     */
    public hasVariable(key: string): boolean {
        return key in this.variables;
    }

    /**
     * Checks if a variable of a given key is constant.
     * @param key The key of the variable.
     * @returns Whether or not the variable is constant.
     * @throws {Error} Variable with key must exist.
     */
    public isConstant(key: string): boolean {
        if(key in this.variables) {
            this.emitter.emit(Memory.variableAccessedEvent, key, this.variables[key]!.value);
            return this.variables[key]!.constant;
        }
        
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    /**
     * Changes the value of a variable with a given function.
     * @param key The key of the variable.
     * @param fn The function to modify it with.
     * @throws {Error} Variable with key must exist.
     */
    public changeVariable(key: string, fn: (v:Value) => Value) {
        if(key in this.variables) {
            const prevValue = this.variables[key]!.value;
            const value = fn(this.variables[key]!.value);
            this.variables[key]!.value = value;
            this.emitter.emit(Memory.variableChangedEvent, key, prevValue, value);
            return;
        }
        
        throw new Error(`Variable with key [${key}] does not exist!`);
    }

    /**
     * Removes all the variable entries.
     */
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
        if(this.constant && this._value.type.baseIdentifier != "undefined") {
            throw new Error("Constant variable cannot be modified!");
        }
        if(!this.type.matches(value.type)) {
            throw new Error(`Value must be of type [${this.type.baseIdentifier}] but is [${value.type.baseIdentifier}]!`);
        }
        this._value = value;
    }
}

export class ReadOnlyMemoryEntry extends MemoryEntry {

    constructor(entry: MemoryEntry) {
        super(entry.key, entry.type, entry.constant);
        this._value = entry.value;
    }

    // The overridden setter will also override the getter so we need to redefine it.
    public get value() {
        return this._value;
    }

    public override set value(_value: Value) {
        throw new Error("ReadOnlyMemoryEntry cannot be changed!");
    }
}