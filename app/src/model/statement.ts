import EventEmitter2 from "eventemitter2";
import {booleanType, numberType, charType, UtilityArray, ValueType, UtilityObject, type _Value, type Primitive, anyType, TokenType, ObjectType, ArrayType, UtilityObjectTemplate, SinglyLinkedListNodeTemplate, DoublyLinkedListNodeTemplate, BinaryTreeNodeTemplate, type Value, SimpleValue, UtilityString, stringType, type Ordered, undefinedType} from "./types.ts";
import type { Memory } from "./memory.ts";

type OpeningBracket = "(";
type ClosingBracket = ")";
export type Bracket = OpeningBracket | ClosingBracket;
type Comma = ",";

export class StatementParseError extends Error {
    public readonly translationKey: string;

    constructor(m: string, translationKey: string) {
        super(m);
        this.translationKey = translationKey;
        Object.setPrototypeOf(this, StatementParseError.prototype);
    }
}

export class StatementEvaluationError extends Error {
    constructor(m: string) {
        super(m);
        Object.setPrototypeOf(this, StatementEvaluationError.prototype);
    }
}

export class IndexResolver {
    public readonly startIndex: number;

    constructor(startIndex: number) {
        this.startIndex = startIndex;
    }

    public resolve(index: number) {
        return index - this.startIndex;
    }
}

function getAllSortedPairs<T>(array: T[]): T[][] {
    const pairs: T[][] = [];
    const sortedArray = array.sort();
    for(let i = 0; i < sortedArray.length; i++) {
        for(let j = i; j < sortedArray.length; j++) {
            pairs.push([sortedArray[i]!, sortedArray[j]!]);
        }
    }
    return pairs;
}

export abstract class Operator {
    protected precedence: number;
    public readonly type: OperatorType;
    protected representingChar: string;
    private condition: (ops: ValueType[]) => boolean;
    protected returnType: ValueType;
    protected rightToLeft: boolean;

    protected constructor(precedence: number, type: OperatorType, representingChar: string, condition: (ops: ValueType[]) => boolean, returnType: ValueType, rightToLeft: boolean) {
        this.precedence = precedence;
        this.type = type;
        this.representingChar = representingChar;
        this.condition = condition;
        this.returnType = returnType;
        this.rightToLeft = rightToLeft;
    }

    public getPrecedence(): number {
        return this.precedence;
    }

    public hasPrecedenceOver(other: Operator): boolean {
        if(this.rightToLeft) {
            return other.getPrecedence() < this.getPrecedence();
        }
        return other.getPrecedence() <= this.getPrecedence();
    }
    
    public getRepresentingChar(): string {
        return this.representingChar;
    }

    public getReturnType(parameterTypes: ValueType[] = []): ValueType {
        return this.returnType;
    }

    public getObjectIdentifier(): string | undefined {
        return undefined;
    }

    protected hasUndefinedOperand(operands: Value[]) {
        return operands.some(op => op.getType().getIdentifier() == "undefined");
    }

    abstract apply(operands: Value[], indexResolver: IndexResolver): Value;
    abstract getOperandCount(): number;
    public isApplicableTo(types: ValueType[]): boolean {
        if(types.some(t => t.getIdentifier() == "undefined")) return true;
        return this.condition(types);
    }
}

class BinaryOperator extends Operator {
    private operation: (a: Value, b: Value) => Value;

    public constructor(priority: number, representingChar: string, condition: (ops: ValueType[]) => boolean, returnType: ValueType, operation: (a: Value, b: Value) => Value, rightToLeft: boolean = false) {
        super(priority, "infix", representingChar, condition, returnType, rightToLeft);
        this.operation = operation;
    }

    public static matchesSomePairsFn(operandTypePairs: ValueType[][]) {
        return (types: ValueType[]) => {
            for(const pair of operandTypePairs) {
                let pairCopy = [...pair];
                for(const type of types) {
                    const idx = pairCopy.findIndex(t => t.matches(type));
                    if(idx >= 0) {
                        pairCopy.splice(idx, 1);
                    }
                }
                if(pairCopy.length == 0) return true;
            }
            return false;
        }
    }
    
    public override apply(operands: Value[], indexResolver: IndexResolver): Value {
        if(operands.length != 2) {
            throw new StatementEvaluationError(`BinaryOperator expected 2 operands but received ${operands.length}!`);
        }
        if(this.hasUndefinedOperand(operands)) return SimpleValue.undefined();

        const a = operands[0]!;
        const b = operands[1]!;
        
        return this.operation(a, b);
    }

    public override getOperandCount(): number {
        return 2;
    }
}

class UnaryOperator extends Operator {
    private operation: (a: Value) => Value;

    public constructor(priority: number, representingChar: string, condition: (ops: ValueType[]) => boolean, returnType: ValueType, operation: (a: Value) => Value) {
        super(priority, "prefix", representingChar, condition, returnType, true);
        this.operation = operation;
    }
    
    public static matchesSomeFn(operandTypes: ValueType[]) {
        return (types: ValueType[]) => operandTypes.some(type => type.matches(types[0]!));
    }

    public override apply(operands: Value[], indexResolver: IndexResolver): Value {
        if(operands.length != 1) {
            throw new StatementEvaluationError(`Unary expected 1 operands but received [${operands.length}!]`);
        }
        if(this.hasUndefinedOperand(operands)) return SimpleValue.undefined();

        const a = operands[0]!;
        return this.operation(a);
    }

    public override getOperandCount(): number {
        return 1;
    }
}

class FunctionOperator extends Operator {
    private operation: (a: Value[], idxr: IndexResolver) => void;
    private operandCount: number;

    public constructor(name: string, operandCount: number, operandCondition: (ops: ValueType[]) => boolean, returnType: ValueType, operation: (a: Value[], idxr: IndexResolver) => void) {
        super(98, "prefix", name, operandCondition, returnType, true);
        this.operation = operation;
        this.operandCount = operandCount;
    }
    
    public static matchesSomeFn(operandTypes: ValueType[]) {
        return (types: ValueType[]) => operandTypes.some(type => type.matches(types[0]!));
    }

    public override apply(operands: Value[], indexResolver: IndexResolver): Value {
        if(operands.length != this.operandCount) {
            throw new StatementEvaluationError(`[${this.representingChar}] function expected [${this.operandCount}] operands but received [${operands.length}!]`);
        }
        this.operation(operands, indexResolver);
        return SimpleValue.undefined();
    }

    public override getOperandCount(): number {
        return this.operandCount;
    }
}

class ObjectConstructor extends Operator {
    private template: UtilityObjectTemplate;
    private operandCount: number;

    public constructor(name: string, operandTypes: ValueType[], template: UtilityObjectTemplate) {
        super(100, "prefix", name, UnaryOperator.matchesSomeFn(operandTypes), anyType, true);
        this.template = template;
        this.operandCount = operandTypes.length;
    }

    public override apply(operands: Value[], indexResolver: IndexResolver): Value {
        if(operands.length != this.operandCount) {
            throw new StatementEvaluationError(`Unary expected 1 operands but received [${operands.length}!]`);
        }
        if(this.hasUndefinedOperand(operands)) return SimpleValue.undefined();

        return this.template.construct(operands);
    }

    public override getOperandCount(): number {
        return this.operandCount;
    }

    public override getReturnType(parameterTypes: ValueType[]): ValueType {
        return this.template.getType(parameterTypes);
    }
}

class ObjectGetOperator extends Operator {

    public constructor() {
        super(99, "prefix", ".", types => types[0]!.hasFields() && types[1]!.getIdentifier() == "token", new ValueType("unknown"), false);
    }

    public override apply(operands: Value[], indexResolver: IndexResolver): Value {
        if(operands.length != 2) {
            throw new StatementEvaluationError(`ObjectGetOperator expected 2 operands but received ${operands.length}!`);
        }
        if(this.hasUndefinedOperand(operands)) return SimpleValue.undefined();
        if(!this.isApplicableTo(operands.map(o => o.getType()))) {
            throw new StatementEvaluationError("Type mismatch! Expected an object and a token!");
        }

        const a = operands[0]! as UtilityObject;
        const b = operands[1]! as SimpleValue;
        
        return a.get(b.value as string);
    }

    public override getOperandCount(): number {
        return 2;
    }

    public override getReturnType(parameterTypes: ValueType[]): ValueType {
        if(parameterTypes.length != 2) throw new Error("Invalid number of parameter types!");
        if(!(parameterTypes[0] instanceof ObjectType)) throw new Error("First parameter is not an object!");
        if(!(parameterTypes[1] instanceof TokenType)) throw new Error("Second parameter is not a token!");
        const objectType = parameterTypes[0]!;
        const field = parameterTypes[1].token;
        if(!objectType.hasField(field)) throw new StatementParseError(`Accessing non-existing field [${field}] on object [${objectType.getIdentifier()}]!`, "error_no_field");
        return objectType.getFieldType(field);
    }
}

class ObjectIndexOperator extends Operator {

    public constructor() {
        super(99, "infix", "@", types => types[0]!.getIdentifier().startsWith("array") && types[1]!.getIdentifier() == "number", anyType, false);
    }

    public override apply(operands: Value[], indexResolver: IndexResolver): Value {
        if(operands.length != 2) {
            throw new StatementEvaluationError(`BinaryOperator expected 2 operands but received ${operands.length}!`);
        }
        if(this.hasUndefinedOperand(operands)) return SimpleValue.undefined();
        if(!this.isApplicableTo(operands.map(o => o.getType()))) {
            throw new StatementEvaluationError("Type mismatch! Expected an array or array like object and a number!");
        }

        const a = operands[0]! as UtilityArray;
        const b = operands[1]! as SimpleValue;
        
        return a.indexGet(indexResolver.resolve(b.value as number));
    }

    public override getOperandCount(): number {
        return 2;
    }

    public getReturnType(parameterTypes: ValueType[]): ValueType {
        if(parameterTypes.length != 2) throw new Error("Invalid number of parameter types!");
        if(!(parameterTypes[0] instanceof ArrayType)) throw new Error("Invalid usage of return type!");
        return parameterTypes[0]!.elementType;
    }
}

type OperatorType = "prefix" | "infix";

const operatorTokens: Set<string> = new Set();
const operatorsByType: Record<OperatorType, Record<string, Operator>> = {
    "prefix": {},
    "infix": {}
};

function registerOperator(op: Operator) {
    operatorTokens.add(op.getRepresentingChar());
    operatorsByType[op.type]![op.getRepresentingChar()] = op;
}

// Numeric Operators
registerOperator(new BinaryOperator(4, "+", BinaryOperator.matchesSomePairsFn([[numberType, numberType]]), numberType, (a, b) => SimpleValue.number(((a as SimpleValue).value as number) + ((b as SimpleValue).value as number))));
registerOperator(new BinaryOperator(4, "-", BinaryOperator.matchesSomePairsFn([[numberType, numberType]]), numberType, (a, b) => SimpleValue.number(((a as SimpleValue).value as number) - ((b as SimpleValue).value as number))));
registerOperator(new BinaryOperator(5, "*", BinaryOperator.matchesSomePairsFn([[numberType, numberType]]), numberType, (a, b) => SimpleValue.number(((a as SimpleValue).value as number) * ((b as SimpleValue).value as number))));
registerOperator(new BinaryOperator(5, "/", BinaryOperator.matchesSomePairsFn([[numberType, numberType]]), numberType, (a, b) => SimpleValue.number(((a as SimpleValue).value as number) / ((b as SimpleValue).value as number))));
registerOperator(new BinaryOperator(5, "div", BinaryOperator.matchesSomePairsFn([[numberType, numberType]]), numberType, (a, b) => SimpleValue.number(Math.floor(((a as SimpleValue).value as number) / ((b as SimpleValue).value as number)))));
registerOperator(new BinaryOperator(5, "mod", BinaryOperator.matchesSomePairsFn([[numberType, numberType]]), numberType, (a, b) => SimpleValue.number(((a as SimpleValue).value as number) % ((b as SimpleValue).value as number))));
registerOperator(new BinaryOperator(6, "^", BinaryOperator.matchesSomePairsFn([[numberType, numberType]]), numberType, (a, b) => SimpleValue.number(((a as SimpleValue).value as number) ** ((b as SimpleValue).value as number)), true));
registerOperator(new UnaryOperator(7, "-", UnaryOperator.matchesSomeFn([numberType]), numberType, a => SimpleValue.number(-((a as SimpleValue).value as number))));
registerOperator(new UnaryOperator(7, "sqrt", UnaryOperator.matchesSomeFn([numberType]), numberType, a => SimpleValue.number(Math.sqrt(((a as SimpleValue).value as number)))));
registerOperator(new UnaryOperator(7, "log", UnaryOperator.matchesSomeFn([numberType]), numberType, a => SimpleValue.number(Math.log2(((a as SimpleValue).value as number)))));
registerOperator(new UnaryOperator(7, "abs", UnaryOperator.matchesSomeFn([numberType]), numberType, a => SimpleValue.number(Math.abs(((a as SimpleValue).value as number)))));
registerOperator(new UnaryOperator(7, "len", types => types[0]!.baseIdentifier == "array" || types[0]!.baseIdentifier == "string", numberType, a => SimpleValue.number((a as UtilityArray).length)));

// Logic Operators
registerOperator(new BinaryOperator(1, "and", BinaryOperator.matchesSomePairsFn([[booleanType, booleanType]]), booleanType, (a, b) => SimpleValue.boolean(((a as SimpleValue).value as boolean) && ((b as SimpleValue).value as boolean))));
registerOperator(new BinaryOperator(0, "or", BinaryOperator.matchesSomePairsFn([[booleanType, booleanType]]), booleanType, (a, b) => SimpleValue.boolean(((a as SimpleValue).value as boolean) || ((b as SimpleValue).value as boolean))));
registerOperator(new UnaryOperator(7, "!", UnaryOperator.matchesSomeFn([booleanType]), booleanType, a => SimpleValue.boolean((!(a as SimpleValue).value as boolean))));
registerOperator(new BinaryOperator(2, "=", BinaryOperator.matchesSomePairsFn([[anyType, anyType]]), booleanType, (a, b) => SimpleValue.boolean(a.equals(b))));
registerOperator(new BinaryOperator(2, "!=", BinaryOperator.matchesSomePairsFn([[anyType, anyType]]), booleanType, (a, b) => SimpleValue.boolean(!a.equals(b))));
registerOperator(new BinaryOperator(3, "<", BinaryOperator.matchesSomePairsFn([[numberType, numberType], [charType, charType], [stringType, stringType]]), booleanType, <T extends Value> (a: T, b: T) => SimpleValue.boolean(!a.equals(b) && !(a as unknown as Ordered<T>).greaterThan(b))));
registerOperator(new BinaryOperator(3, "<=", BinaryOperator.matchesSomePairsFn([[numberType, numberType], [charType, charType], [stringType, stringType]]), booleanType, <T extends Value> (a: T, b: T) => SimpleValue.boolean(a.equals(b) || !(a as unknown as Ordered<T>).greaterThan(b))));
registerOperator(new BinaryOperator(3, ">", BinaryOperator.matchesSomePairsFn([[numberType, numberType], [charType, charType], [stringType, stringType]]), booleanType, <T extends Value> (a: T, b: T) => SimpleValue.boolean(!a.equals(b) && (a as unknown as Ordered<T>).greaterThan(b))));
registerOperator(new BinaryOperator(3, ">=", BinaryOperator.matchesSomePairsFn([[numberType, numberType], [charType, charType], [stringType, stringType]]), booleanType, <T extends Value> (a: T, b: T) => SimpleValue.boolean(a.equals(b) || (a as unknown as Ordered<T>).greaterThan(b))));

// Array Operators
registerOperator(new class extends BinaryOperator {
    public getReturnType(parameterTypes: ValueType[]): ValueType {
        return parameterTypes[0]!;
    }
}(4, "&", types => types[0]!.getIdentifier().startsWith("array") || types[0]!.getIdentifier() == "string" && types[0]!.matches(types[1]!), anyType, (a, b) => (a as UtilityString).concat(b as UtilityString)));
registerOperator(new UnaryOperator(100, "str", UnaryOperator.matchesSomeFn([anyType]), stringType, a => new UtilityString([...a.asString()].map(SimpleValue.char))));

// Constructors
registerOperator(new ObjectConstructor("s1l", [anyType], SinglyLinkedListNodeTemplate));
registerOperator(new ObjectConstructor("s2l", [anyType], DoublyLinkedListNodeTemplate));
registerOperator(new ObjectConstructor("btn", [anyType], BinaryTreeNodeTemplate));

// Object Operators
registerOperator(new ObjectGetOperator());
const indexOperator = new ObjectIndexOperator();
registerOperator(indexOperator);

// Function Operators
registerOperator(new FunctionOperator("swap", 3, 
    ops => {
        return ops[0]!.baseIdentifier == "array" && ops[1]!.matches(numberType) && ops[2]!.matches(numberType)
    },
    undefinedType,
    (operands, indexResolver) => {
        const array = operands[0] as UtilityArray;
        const idx1 = indexResolver.resolve((operands[1] as SimpleValue).value as number);
        const idx2 = indexResolver.resolve((operands[2] as SimpleValue).value as number);
        array.indexSwap(idx1, idx2);
    }
));
registerOperator(new FunctionOperator("is1l", 2, 
    ops => {
        return ops[0]!.baseIdentifier == "s1l" && ops[0]!.matches(ops[1]!);
    },
    undefinedType,
    (operands) => {
        const c = (operands[0] as UtilityObject);
        const d = (operands[1] as UtilityObject);
        const e = c.get("next");
        c.set("next", d);
        d.set("next", e);
    }
));
registerOperator(new FunctionOperator("is2l", 2, 
    ops => {
        return ops[0]!.baseIdentifier == "s2l" && ops[0]!.matches(ops[1]!);
    },
    undefinedType,
    (operands) => {
        const c = (operands[0] as UtilityObject);
        const d = (operands[1] as UtilityObject);
        const e = c.get("next");
        c.set("next", d);
        d.set("prev", c);
        d.set("next", e);
        if(e instanceof UtilityObject) {
            e.set("prev", d);
        }
    }
));

export abstract class Operand {
    public abstract getType(): ValueType;
    public abstract flatten(): (ResolvableOperand | Operator)[];
}

export abstract class ResolvableOperand extends Operand {
    public abstract resolve(): Value;
    public abstract getRepresentation(): string;
}

export class GroupedOperand extends Operand {
    public readonly tokens: (Operand | Operator)[];
    public readonly type: ValueType;

    constructor(tokens: (Operand | Operator)[], type: ValueType) {
        super();
        this.tokens = tokens;
        this.type = type;
    }

    public getType(): ValueType {
        return this.type;
    }

    public override flatten(): (ResolvableOperand | Operator)[] {
        return this.tokens.map(v => v instanceof Operand ? v.flatten() : v).flat();
    }
}

function parseOperand(text: string, memory: Memory, indexResolver: IndexResolver): ResolvableOperand {
    if(memory.hasVariable(text)) {
        return new VariableOperand(text, memory);
    }
    if(text.startsWith("{") && text.endsWith("}")) {
        return ArrayLiteral.parse(text, memory, indexResolver);
    }
    if(text.startsWith("\"") && text.endsWith("\"")) {
        return StringLiteral.parse(text);
    }
    return LiteralOperand.parse(text);
}

class LiteralOperand extends ResolvableOperand {
    value: Value;

    protected constructor(value: Value) {
        super();
        this.value = value;
    }

    public static parse(text: string): LiteralOperand {
        if(!isNaN(Number(text))) {
            return new LiteralOperand(SimpleValue.number(Number(text)));
        } else if (text == "true") {
            return new LiteralOperand(SimpleValue.boolean(true));
        } else if (text == "false") {
            return new LiteralOperand(SimpleValue.boolean(false));
        } else if (text.startsWith("\'") && text.endsWith("\'") && text.length == 3) {
            return new LiteralOperand(SimpleValue.char(text.substring(1,2)));
        } else {
            return new LiteralOperand(SimpleValue.token(text));
        }
    }

    public override resolve(): Value {
        return this.value;
    }

    public override getType(): ValueType {
        return this.value.getType();
    }

    public override getRepresentation() {
        return "";
    }

    public override flatten(): (ResolvableOperand | Operator)[] {
        return [this];
    }
}

class ArrayLiteral extends ResolvableOperand {
    values: AnyStatement[];
    type: ArrayType;

    protected constructor(values: AnyStatement[], elementType: ValueType) {
        super();
        this.values = values;
        this.type = new ArrayType(elementType);
    }

    private static splitElements(text: string) {
        const tokens = [];
        let currentToken = "";
        let arrayDepth = 0;
        for(const c of [...text]) {
            if(c == "," && arrayDepth == 0) {
                tokens.push(currentToken);
                currentToken = "";
                continue;
            } else if(c == "{") {
                arrayDepth += 1;
            } else if(c == "}") {
                arrayDepth -= 1;
            }
            currentToken += c;
        }
        tokens.push(currentToken);
        return tokens;
    }

    public static parse(text: string, memory: Memory, indexResolver: IndexResolver): ArrayLiteral {
        if(!text.startsWith("{") || !text.endsWith("}")) {
            throw new Error("Not an array literal!");
        }
        text = text.substring(1,text.length-1);
        const values = ArrayLiteral.splitElements(text).map(token => AnyStatement.parse(token, memory, indexResolver));
        for(let i = 0; i < values.length; i++) {
            for(let j = i+1; j < values.length; j++) {
                if(!values[i]!.getReturnType().matches(values[j]!.getReturnType())) throw new StatementParseError("Arrays cannot be heterogeneous!", "error_array_heterogeneous")
            }
        }
        return new ArrayLiteral(values, values.length > 0 ? values[0]!.getReturnType() : anyType);
    }

    public resolve(): Value {
        const evaluatedValues = this.values.map(v => v.evaluate());
        if(evaluatedValues.some(v => v.getType().getIdentifier() == "undefined")) return SimpleValue.undefined();
        return new UtilityArray(evaluatedValues, this.type.elementType);
    }

    public getType(): ValueType {
        return this.type;
    }

    public getRepresentation(): string {
        return "";
    }

    public override flatten(): (ResolvableOperand | Operator)[] {
        return [this];
    }
}

class StringLiteral extends ResolvableOperand {
    values: Value[];

    protected constructor(values: Value[]) {
        super();
        this.values = values;
    }

    public static parse(text: string): StringLiteral {
        if(!text.startsWith("\"") || !text.endsWith("\"")) {
            throw new Error("Not a string literal!");
        }
        text = text.substring(1,text.length-1);
        const values = [...text].map(token => SimpleValue.char(token));
        return new StringLiteral(values);
    }

    public resolve(): Value {
        return new UtilityString(this.values);
    }

    public getType(): ValueType {
        return stringType;
    }

    public getRepresentation(): string {
        return "";
    }

    public override flatten(): (ResolvableOperand | Operator)[] {
        return [this];
    }
}

class VariableOperand extends ResolvableOperand {
    private _key: string;
    private memory: Memory;

    constructor(key: string, memory: Memory) {
        super();
        this._key = key;
        this.memory = memory;
        if(!this.memory.hasVariable(key)) {
            throw new StatementParseError(`Invalid variable key [${key}]!`, "error_undefined_variable");
        }
    }

    public override resolve(): Value {
        return this.memory.getVariable(this.key);
    }

    public override getType(): ValueType {
        return this.memory.getType(this.key);
    }

    private set key(key: string) {
        this._key = key;
    }

    public get key() {
        return this._key;
    }
    
    public override getRepresentation() {
        return this.key;
    }

    public override flatten(): (ResolvableOperand | Operator)[] {
        return [this];
    }
}

export abstract class Statement<T> {
    /**
     * Emitted when an operator is applied on operands.
     * The event handler is given the operator and its operands in a list. (Operator, Primitive[])
     * */ 
    public static readonly computeEvent = "statement.compute";
    /**
     * Emitted when an operand is resolved.
     * The event handler is given the operand and how its resolved in a list. (Operand, Primitive)
     * */
    public static readonly operandResolutionEvent = "statement.operandresolution";/**
    /** 
     * Emitted when the evaluation is started.
     * */
    public static readonly evaluationStart = "statement.evaluation.start";
    /** 
     * Emitted when the evaluation is ended.
     * */
    public static readonly evaluationEnd = "statement.evaluation.end";
    public static readonly emitter: EventEmitter2 = new EventEmitter2();
    protected evaluatableTokens: (ResolvableOperand | Operator)[] = [];
    protected readableTokens: (ResolvableOperand | Operator | Bracket)[] = [];
    protected returnType: ValueType = numberType;
    protected indexResolver: IndexResolver = new IndexResolver(0);

    abstract evaluate(): T;
    protected evaluateInternally(): Value {
        Statement.emitter.emit(Statement.evaluationStart, this, this.readableTokens);
        const operands: (Value)[] = [];
        for(const token of this.evaluatableTokens) {
            if(token instanceof ResolvableOperand) {
                const resolvedOperand = token.resolve();
                operands.push(resolvedOperand);
            } else {
                const opCount = token.getOperandCount();
                const usedOperands = [];
                for(let i = 0; i < opCount; i++) {
                    usedOperands.push(operands.pop()!);
                }
                operands.push(token.apply(usedOperands, this.indexResolver));
            }
        }
        const value = operands.pop()!;
        Statement.emitter.emit(Statement.evaluationEnd, this, value);
        return value;
    }

    protected assertReturnType(type: ValueType): void {
        if(type instanceof TokenType) throw new StatementParseError("Tokens cannot be returned by a statement!", "error_token_return");
    }

    protected static splitTokens(text: string): string[] {
        let currentToken = "";
        const tokens: string[] = [];
        type TokenParseState = "none" | "number" | "string" | "alphanumeric" | "specialcharacter" | "array" | "char";
        let tokenParseState: TokenParseState = "none";
        let arrayDepth = 0

        function flushCurrentToken() {
            if(currentToken.length > 0) {
                tokens.push(currentToken);
            }
            currentToken = "";
        }

        function handleState(c: string, state: TokenParseState) {
            if(tokenParseState != state) {
                flushCurrentToken();
                tokenParseState = state;
            }
            currentToken += c;
        }

        function isAlphanumeric(c: string) {
            return ("a" <= c && c <= "z") || ("A" <= c && c <= "Z") || c == "_" || ("0" <= c && c <= "9");
        }

        function isNumeric(c: string) {
            return "0" <= c && c <= "9" || c == ".";
        }

        function isSpecialCharacter(c: string) {
            return !isNumeric(c) && !isAlphanumeric(c);
        }

        for(let c of text) {
            if(c == "{" || tokenParseState == "array" as TokenParseState) {
                if(c == "{") arrayDepth += 1;
                if(c == "}" && tokenParseState == "array" as TokenParseState) {
                    currentToken += c;
                    arrayDepth -= 1;
                    if(arrayDepth == 0) {
                        flushCurrentToken();
                        tokenParseState = "none";
                    }
                } else {
                    handleState(c, "array");
                }
            } else if(c == "\"" || tokenParseState == "string" as TokenParseState) {
                if(c == "\"" && tokenParseState == "string" as TokenParseState) {
                    currentToken += c;
                    flushCurrentToken();
                    tokenParseState = "none";
                } else {
                    handleState(c, "string");
                }
            } else if(c == "\'" || tokenParseState == "char" as TokenParseState) {
                if(c == "\'" && tokenParseState == "char" as TokenParseState) {
                    currentToken += c;
                    flushCurrentToken();
                    tokenParseState = "none";
                } else {
                    handleState(c, "char");
                }
            } else if(c == " ") {
                tokenParseState = "none";
                flushCurrentToken();
            } else if (c == "(" || c == ")" || c == "[" || c == "]") {
                tokenParseState = "none";
                flushCurrentToken();
                tokens.push(c);
            } else if(isNumeric(c) && (tokenParseState != "alphanumeric" as TokenParseState || !isAlphanumeric(c))) {
                handleState(c, "number");
            } else if(c == ",") {
                tokenParseState = "none";
                flushCurrentToken();
                currentToken += c;
                flushCurrentToken();
            } else if(isSpecialCharacter(c)) {
                if(operatorTokens.has(currentToken) && !operatorTokens.has(currentToken+c)) {
                    flushCurrentToken();
                }
                handleState(c, "specialcharacter");
            } else if(isAlphanumeric(c)) {
                handleState(c, "alphanumeric");
            }
        }
        
        flushCurrentToken();

        return tokens;
    }

    protected static parseInto<T>(statement: Statement<T>, text: string, memory: Memory, indexResolver: IndexResolver): void {
        if(text.length == 0) throw new StatementParseError("Cannot parse empty statement!", "error_empty_statement");
        const tokens: string[] = this.splitTokens(text);
        const operators: (Operator | OpeningBracket)[] = [];
        const operands: Operand[] = [];

        const partialParsedTokens: (string | Operand | Bracket | Comma)[] = tokens.map(token => {
            if(operatorTokens.has(token)) {
                return [token];
            } else if (token == "(" || token == ")" || token == ",") {
                return [token];
            } else if (token == "[") {
                return ["@", "("];
            } else if (token == "]") {
                return [")"];
            } else { 
                return [parseOperand(token, memory, indexResolver)];
            }
        }).flat();

        function fullyParseTokens(): (Operand | Operator | Bracket)[] {
            const parsedTokens: (Operand | Operator | Bracket)[] = [];
            for(let i = 0; i < partialParsedTokens.length; i++) {

                const token = partialParsedTokens[i]!;
                if(token instanceof Operand || token == "(" || token == ")") {
                    parsedTokens.push(token);
                    continue;
                }
                if(token == ",") continue;
                if(i == partialParsedTokens.length - 1) {
                    // TODO investigate if this can even be triggered, wouldn't token literals already cover this edge case?
                    throw new StatementParseError(`Statement ends with an operator! There are no postfix operators!`, "error_postfix");
                }

                function decideOperandType(): OperatorType {
                    const afterComma = () => partialParsedTokens[i-1] == ",";
                    const afterOperand = () => partialParsedTokens[i-1] instanceof Operand || partialParsedTokens[i-1] == ")" || partialParsedTokens[i-1] == "]";
                    const afterOperator = () => !(partialParsedTokens[i-1] instanceof Operand);
                    if((i == 0 || i == tokens.length-1) && partialParsedTokens[i+1] instanceof Operand) {
                        return "prefix";
                    } else if(afterOperator() || afterComma()) {
                        return "prefix";
                    } else if (afterOperand()) {
                        return "infix";
                    } else {
                        throw new StatementParseError(`Cannot decide the operator type for given operator [${token}]`, "error_undecidable_operator_type");
                    }
                }

                const operatorType = decideOperandType();

                parsedTokens.push(operatorsByType[operatorType]![token]!);
            }
            return parsedTokens;
        }

        const parsedTokens: (Operand | Operator | Bracket)[] = fullyParseTokens();

        function arrangeIntoPostfix(): (Operator | ResolvableOperand)[] {
            function applyOperator(operator: Operator) {
                const postFix: (Operand | Operator)[] = []
                const _operands = [];
                for(let i = 0; i < operator.getOperandCount(); i++) {
                    _operands.push(operands.pop()!);
                }
                if(!operator.isApplicableTo(_operands.map(operand => operand.getType()).reverse())) {
                    throw new StatementParseError(`Operator type mismatch! [${operator.getRepresentingChar()}] is not applicable to [${_operands.map(operand => operand.getType().getIdentifier()).reverse()}]!`, "error_operator_type_mismatch");
                }
                postFix.push(..._operands);
                postFix.push(operator);
                operands.push(new GroupedOperand(postFix, operator.getReturnType(_operands.map(op => op.getType()).reverse())));
            }
            function flushOperatorsWhile(condition: () => boolean) {
                while(condition()) {
                    const lastOp = operators.pop() as Operator;
                    applyOperator(lastOp);
                }
            }
            
            let bracketDepth = 0;
            for(let token of parsedTokens) {
                if(token instanceof Operator) {
                    const shouldPopOperator = () => operators.length > 0 && operators.at(-1) instanceof Operator && (operators.at(-1) as Operator).hasPrecedenceOver(token);
                    flushOperatorsWhile(shouldPopOperator);
                    operators.push(token);
                } else {
                    if(token == "(") {
                        bracketDepth += 1;
                        operators.push("(");
                    } else if (token == ")") {
                        bracketDepth -= 1;
                        flushOperatorsWhile(() => operators.at(-1) != "(");
                        operators.pop();
                    } else {
                        operands.push(new GroupedOperand([token], token.getType()));
                    }
                }
            }

            // TODO add tests for this
            if(bracketDepth != 0) {
                if(bracketDepth < 0) {
                    throw new StatementParseError("At least one closing bracket is missing its opening bracket!", "error_missing_opening_bracket");
                } else {
                    throw new StatementParseError("At least one opening bracket is missing its closing bracket!", "error_missing_closing_bracket");
                }
            }

            flushOperatorsWhile(() => operators.length > 0);

            if(operands.length > 1) throw new StatementParseError("Statement result is ambigous!", "error_ambigous_result");
            statement.assertReturnType(operands[0]!.getType());
            statement.returnType = operands[0]!.getType();

            return operands[0]!.flatten();
        }

        statement.indexResolver = indexResolver;
        statement.evaluatableTokens.push(...arrangeIntoPostfix());
        statement.readableTokens.push(...parsedTokens.map(v => v instanceof Operand ? v.flatten() : v).flat());
    }

    public getReturnType() {
        return this.returnType;
    }
}

export class NumericStatement extends Statement<number> {
    public override evaluate(): number {
        const result = this.evaluateInternally();
        if(result.getType().getIdentifier() == "undefined") return 0;
        return (result as SimpleValue).value as number;
    }

    protected override assertReturnType(type: ValueType): void {
        super.assertReturnType(type);
        if(!numberType.matches(type)) {
            throw new StatementParseError(`Numeric statement expects to receive a number as its result but instead received [${type.getIdentifier()}]!`, "error_numeric_result_mismatch");
        }
    }

    protected constructor() {
        super();
    }

    public static parse(text: string, memory: Memory, indexResolver: IndexResolver): NumericStatement {
        const statement = new NumericStatement();
        Statement.parseInto<number>(statement, text, memory, indexResolver);

        return statement;
    }
}

export class CharStatement extends Statement<string> {
    public override evaluate(): string {
        const result = this.evaluateInternally();
        if(result.getType().getIdentifier() == "undefined") return "a";
        return (result as SimpleValue).value as string;
    }

    protected override assertReturnType(type: ValueType): void {
        super.assertReturnType(type);
        if(!charType.matches(type)) {
            throw new StatementParseError(`Char statement expects to get a char as its result but instead received [${type.getIdentifier()}]!`, "error_char_result_mismatch");
        }
    }

    protected constructor() {
        super();
    }

    public static parse(text: string, memory: Memory, indexResolver: IndexResolver): CharStatement {
        const statement = new CharStatement();
        Statement.parseInto<string>(statement, text, memory, indexResolver);

        return statement;
    }
}

export class StringStatement extends Statement<string> {
    public override evaluate(): string {
        const result = this.evaluateInternally();
        if(result.getType().getIdentifier() == "undefined") return "";
        return (result as UtilityString).getString();
    }

    protected override assertReturnType(type: ValueType): void {
        super.assertReturnType(type);
        if(!stringType.matches(type)) {
            throw new StatementParseError(`String statement expects to get a string as its result but instead received [${type.getIdentifier()}]!`, "error_string_result_mismatch");
        }
    }

    protected constructor() {
        super();
    }

    public static parse(text: string, memory: Memory, indexResolver: IndexResolver): StringStatement {
        const statement = new StringStatement();
        Statement.parseInto<string>(statement, text, memory, indexResolver);

        return statement;
    }
}

export class BooleanStatement extends Statement<boolean> {
    public override evaluate(): boolean {
        const result = this.evaluateInternally();
        if(result.getType().getIdentifier() == "undefined") return false;
        return (result as SimpleValue).value as boolean;
    }

    protected override assertReturnType(type: ValueType): void {
        super.assertReturnType(type);
        if(!booleanType.matches(type)) {
            throw new StatementParseError(`Boolean statement expects to get a boolean as its result but instead received [${type}]!`, "error_boolean_result_mismatch");
        }
    }

    protected constructor() {
        super();
    }

    public static parse(text: string, memory: Memory, indexResolver: IndexResolver): BooleanStatement {
        const statement = new BooleanStatement();
        Statement.parseInto<boolean>(statement, text, memory, indexResolver);

        return statement;
    }
}

export class AnyStatement extends Statement<any> {
    public override evaluate(): Value {
        return this.evaluateInternally();
    }

    protected constructor() {
        super();
    }

    public static parse(text: string, memory: Memory, indexResolver: IndexResolver): AnyStatement {
        const statement = new AnyStatement();
        Statement.parseInto<any>(statement, text, memory, indexResolver);

        return statement;
    }
}