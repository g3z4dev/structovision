import EventEmitter2 from "eventemitter2";
import {booleanType, numberType, charType, UtilityArray, ValueType, UtilityObject, type _Value, type Primitive, anyType, TokenType, ObjectType, ArrayType, UtilityObjectTemplate, SinglyLinkedListNodeTemplate, DoublyLinkedListNodeTemplate, BinaryTreeNodeTemplate, type Value, SimpleValue, UtilityString, stringType, type Ordered, undefinedType} from "./types.ts";
import type { Memory } from "./memory.ts";

type OpeningBracket = "(";
type ClosingBracket = ")";
export type Bracket = OpeningBracket | ClosingBracket;
type Comma = ",";

export class StatementParseError extends Error {
    public readonly errorID: string;

    constructor(m: string, errorID: string) {
        super(m);
        this.errorID = errorID;
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

    /**
     * Translates the index given by a user to an index to be used in code.
     * @param index The user given index.
     * @returns The index to be used in code.
     */
    public resolve(index: number) {
        return index - this.startIndex;
    }
}

export abstract class Operator {
    /**
     * The precedence of an Operator determines which operator takes priority over another.
     * An Operator with higher precedence will always be evaluated first.
     */
    public readonly precedence: number;

    /**
     * The type of the Operator. Decides how the it's applied.
     */
    public readonly type: OperatorType;

    /**
     * The text representing the Operator in statements.
     */
    public readonly token: string;

    /**
     * How many Operands does the Operator expect.
     */
    public readonly operandCount: number;
    private condition: (ops: ValueType[]) => boolean;
    protected returnType: ValueType;
    protected rightToLeft: boolean;

    /**
     * @param precedence The priority.
     * @param operandCount How many Operands it will be applicable to.
     * @param type How it can be applied.
     * @param token The text that represents it inside statements.
     * @param condition The preconditions of the Operands it can be applied to.
     * @param returnType The type of the value it will be evaluated into.
     * @param rightToLeft Is it evaluated from left to right or from right to left?
     */
    protected constructor(precedence: number, operandCount: number, type: OperatorType, token: string, condition: (ops: ValueType[]) => boolean, returnType: ValueType, rightToLeft: boolean) {
        this.precedence = precedence;
        this.type = type;
        this.token = token;
        this.operandCount = operandCount;
        this.condition = condition;
        this.returnType = returnType;
        this.rightToLeft = rightToLeft;
    }

    /**
     * @param other The other Operator.
     * @returns Whether or not this Operator has precedence over the other Operator.
     */
    public hasPrecedenceOver(other: Operator): boolean {
        if(this.rightToLeft) {
            return other.precedence < this.precedence;
        }
        return other.precedence <= this.precedence;
    }

    /**
     * @param operandTypes The types of the Operands this Operator would be applied on.
     * @returns The type of the value the Operator will be evaluated into.
     */
    public getReturnType(operandTypes: ValueType[] = []): ValueType {
        return this.returnType;
    }

    protected hasUndefinedOperand(operands: Value[]) {
        return operands.some(op => op.type.id == "undefined");
    }

    /**
     * Evaluates the Operator on given Operands.
     * @param operands The operands.
     * @param indexResolver The index resolver to be used on indicies.
     * @returns The value it's evaluated into
     */
    abstract apply(operands: Value[], indexResolver: IndexResolver): Value;

    /**
     * @param operandTypes The types of the Operands this Operator would be applied on.
     * @returns Whether or not this Operator accepts these Operands.
     */
    public isApplicableTo(operandTypes: ValueType[]): boolean {
        if(operandTypes.some(t => t.id == "undefined")) return true;
        return this.condition(operandTypes);
    }
}

class BinaryOperator extends Operator {
    protected operation: (a: Value, b: Value) => Value;

    /**
     * @param precedence The priority.
     * @param token The text that represents it inside statements.
     * @param condition The preconditions of the Operands it can be applied to.
     * @param returnType The type of the value it will be evaluated into.
     * @param operation What it does to the given Operands.
     * @param rightToLeft Is it evaluated from left to right or from right to left?
     */
    public constructor(precedence: number, token: string, condition: (ops: ValueType[]) => boolean, returnType: ValueType, operation: (a: Value, b: Value) => Value, rightToLeft: boolean = false) {
        super(precedence, 2, "infix", token, condition, returnType, rightToLeft);
        this.operation = operation;
    }

    /**
     * @param operandTypePairs The pair of types the function will accept.
     * @returns A function which returns true if the pair of types given to it is contained in the given parameter.
     */
    public static matchesSomePairsFn(operandTypePairs: [ValueType, ValueType][]) {
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
}

/**
 * Exists as a special case to the undefined operands evaluate to undefined value rule.
 * This Operator should not return an undefined value when given undefined Operands because
 * it is needed for checking whether or not a value is defined.
 */
class EqualityOperator extends BinaryOperator {
    public override apply(operands: Value[], indexResolver: IndexResolver): Value {
        if(operands.length != 2) {
            throw new StatementEvaluationError(`EqualityOperator expected 2 operands but received ${operands.length}!`);
        }

        const a = operands[0]!;
        const b = operands[1]!;

        return this.operation(a, b);
    }
}

class UnaryOperator extends Operator {
    private operation: (a: Value) => Value;

    /**
     * @param precedence The priority.
     * @param token The text that represents it inside statements.
     * @param condition The preconditions of the Operands it can be applied to.
     * @param returnType The type of the value it will be evaluated into.
     * @param operation What it does to the given Operands.
     */
    public constructor(precedence: number, token: string, condition: (ops: ValueType[]) => boolean, returnType: ValueType, operation: (a: Value) => Value) {
        super(precedence, 1, "prefix", token, condition, returnType, true);
        this.operation = operation;
    }

    /**
     * @param operandTypes The list of types the function will accept.
     * @returns A function that returns true if the all the types given to it are contained in the parameter.
     */
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
}

class FunctionOperator extends Operator {
    private operation: (a: Value[], idxr: IndexResolver) => void;

    /**
     * @param token The text that represents it inside statements.
     * @param operandCount How many Operands it will be applicable to.
     * @param condition The preconditions of the Operands it can be applied to.
     * @param operation What it does to the given Operands.
     */
    public constructor(token: string, operandCount: number, condition: (ops: ValueType[]) => boolean, returnType: ValueType, operation: (a: Value[], idxr: IndexResolver) => void) {
        super(98, operandCount, "prefix", token, condition, returnType, true);
        this.operation = operation;
    }

    public override apply(operands: Value[], indexResolver: IndexResolver): Value {
        if(operands.length != this.operandCount) {
            throw new StatementEvaluationError(`[${this.token}] function expected [${this.operandCount}] operands but received [${operands.length}!]`);
        }
        this.operation(operands, indexResolver);
        return SimpleValue.undefined();
    }
}

class ObjectConstructor extends Operator {
    private template: UtilityObjectTemplate;

    /**
     * @param token The text that represents it inside statements.
     * @param operandTypes The list of type of Operands in order it can be applied to.
     * @param template The object template to use.
     */
    public constructor(token: string, operandTypes: ValueType[], template: UtilityObjectTemplate) {
        super(100, operandTypes.length, "prefix", token, UnaryOperator.matchesSomeFn(operandTypes), anyType, true);
        this.template = template;
    }

    public override apply(operands: Value[], indexResolver: IndexResolver): Value {
        if(operands.length != this.operandCount) {
            throw new StatementEvaluationError(`Unary expected 1 operands but received [${operands.length}!]`);
        }
        if(this.hasUndefinedOperand(operands)) return SimpleValue.undefined();

        return this.template.construct(operands);
    }

    public override getReturnType(operandTypes: ValueType[]): ValueType {
        return this.template.getType(operandTypes);
    }
}

/**
 * A special binary operator used to access fields of Objects.
 */
class ObjectGetOperator extends Operator {

    public constructor() {
        super(99, 2, "infix", ".", types => types[0]!.hasFields() && types[1]!.id == "token", new ValueType("unknown"), false);
    }

    public override apply(operands: Value[], indexResolver: IndexResolver): Value {
        if(operands.length != 2) {
            throw new StatementEvaluationError(`ObjectGetOperator expected 2 operands but received ${operands.length}!`);
        }
        if(this.hasUndefinedOperand(operands)) return SimpleValue.undefined();
        if(!this.isApplicableTo(operands.map(o => o.type))) {
            throw new StatementEvaluationError("Type mismatch! Expected an object and a token!");
        }

        const a = operands[0]! as UtilityObject;
        const b = operands[1]! as SimpleValue;

        return a.get(b.value as string);
    }

    public override getReturnType(operandTypes: ValueType[]): ValueType {
        if(operandTypes.length != 2) throw new Error("Invalid number of parameter types!");
        if(!(operandTypes[0] instanceof ObjectType)) throw new Error("First parameter is not an object!");
        if(!(operandTypes[1] instanceof TokenType)) throw new Error("Second parameter is not a token!");
        const objectType = operandTypes[0]!;
        const field = operandTypes[1].token;
        if(!objectType.hasField(field)) throw new StatementParseError(`Accessing non-existing field [${field}] on object [${objectType.id}]!`, "error_no_field");
        return objectType.getFieldType(field);
    }
}

/**
 * A special binary operator used to access elements of arrays. Every indexed array expression will be converted to this in the background.
 */
class ObjectIndexOperator extends Operator {

    public constructor() {
        super(99, 2, "infix", "@", types => types[0]!.id.startsWith("array") && types[1]!.id == "number", anyType, false);
    }

    public override apply(operands: Value[], indexResolver: IndexResolver): Value {
        if(operands.length != 2) {
            throw new StatementEvaluationError(`BinaryOperator expected 2 operands but received ${operands.length}!`);
        }
        if(this.hasUndefinedOperand(operands)) return SimpleValue.undefined();
        if(!this.isApplicableTo(operands.map(o => o.type))) {
            throw new StatementEvaluationError("Type mismatch! Expected an array or array like object and a number!");
        }

        const a = operands[0]! as UtilityArray;
        const b = operands[1]! as SimpleValue;

        return a.indexGet(indexResolver.resolve(b.value as number));
    }

    public getReturnType(operandTypes: ValueType[]): ValueType {
        if(operandTypes.length != 2) throw new Error("Invalid number of parameter types!");
        if(!(operandTypes[0] instanceof ArrayType)) throw new Error("Invalid usage of return type!");
        return operandTypes[0]!.elementType;
    }
}

type OperatorType = "prefix" | "infix";

/**
 * All the text representations of operators that exists.
 */
export const operatorTokens: Set<string> = new Set();

const operatorsByType: Record<OperatorType, Record<string, Operator>> = {
    "prefix": {},
    "infix": {}
};

/**
 * Registers an Operator to be used in the Statement logic.
 * @param op The Operator to register.
 */
function registerOperator(op: Operator) {
    operatorTokens.add(op.token);
    operatorsByType[op.type]![op.token] = op;
}

// Numeric Operators
registerOperator(new BinaryOperator(4, "+", BinaryOperator.matchesSomePairsFn([[numberType, numberType]]), numberType, (a, b) => SimpleValue.number(((a as SimpleValue).value as number) + ((b as SimpleValue).value as number))));
registerOperator(new BinaryOperator(4, "-", BinaryOperator.matchesSomePairsFn([[numberType, numberType]]), numberType, (a, b) => SimpleValue.number(((a as SimpleValue).value as number) - ((b as SimpleValue).value as number))));
registerOperator(new BinaryOperator(5, "*", BinaryOperator.matchesSomePairsFn([[numberType, numberType]]), numberType, (a, b) => SimpleValue.number(((a as SimpleValue).value as number) * ((b as SimpleValue).value as number))));
registerOperator(new BinaryOperator(5, "/", BinaryOperator.matchesSomePairsFn([[numberType, numberType]]), numberType, (a, b) => {
    const aNum = (a as SimpleValue).value as number
    const bNum = (b as SimpleValue).value as number;
    if(bNum == 0) return SimpleValue.undefined();
    return SimpleValue.number(aNum / bNum)
}));
registerOperator(new BinaryOperator(5, "div", BinaryOperator.matchesSomePairsFn([[numberType, numberType]]), numberType, (a, b) => {
    const aNum = (a as SimpleValue).value as number
    const bNum = (b as SimpleValue).value as number;
    if(bNum == 0) return SimpleValue.undefined();
    return SimpleValue.number(Math.floor(aNum / bNum));
}));
registerOperator(new BinaryOperator(5, "mod", BinaryOperator.matchesSomePairsFn([[numberType, numberType]]), numberType, (a, b) => {
    const aNum = (a as SimpleValue).value as number
    const bNum = (b as SimpleValue).value as number;
    if(bNum == 0) return SimpleValue.undefined();
    return SimpleValue.number(aNum % bNum)
}));
registerOperator(new BinaryOperator(6, "^", BinaryOperator.matchesSomePairsFn([[numberType, numberType]]), numberType, (a, b) => SimpleValue.number(((a as SimpleValue).value as number) ** ((b as SimpleValue).value as number)), true));
registerOperator(new UnaryOperator(7, "-", UnaryOperator.matchesSomeFn([numberType]), numberType, a => SimpleValue.number(-((a as SimpleValue).value as number))));
registerOperator(new UnaryOperator(7, "sqrt", UnaryOperator.matchesSomeFn([numberType]), numberType, a => {
    const aNum = (a as SimpleValue).value as number;
    if(aNum < 0) return SimpleValue.undefined();
    return SimpleValue.number(Math.sqrt(aNum));
}));
registerOperator(new UnaryOperator(7, "log", UnaryOperator.matchesSomeFn([numberType]), numberType, a => {
    const aNum = (a as SimpleValue).value as number;
    if(aNum <= 0) return SimpleValue.undefined();
    return SimpleValue.number(Math.log2(((a as SimpleValue).value as number)))
}));
registerOperator(new UnaryOperator(7, "abs", UnaryOperator.matchesSomeFn([numberType]), numberType, a => SimpleValue.number(Math.abs(((a as SimpleValue).value as number)))));
registerOperator(new UnaryOperator(7, "len", types => types[0]!.isUndefined() || types[0]!.baseIdentifier == "array" || types[0]!.baseIdentifier == "string", numberType, a => SimpleValue.number((a as UtilityArray).length)));

// Logic Operators
registerOperator(new BinaryOperator(1, "and", BinaryOperator.matchesSomePairsFn([[booleanType, booleanType]]), booleanType, (a, b) => SimpleValue.boolean(((a as SimpleValue).value as boolean) && ((b as SimpleValue).value as boolean))));
registerOperator(new BinaryOperator(0, "or", BinaryOperator.matchesSomePairsFn([[booleanType, booleanType]]), booleanType, (a, b) => SimpleValue.boolean(((a as SimpleValue).value as boolean) || ((b as SimpleValue).value as boolean))));
registerOperator(new UnaryOperator(7, "!", UnaryOperator.matchesSomeFn([booleanType]), booleanType, a => SimpleValue.boolean((!(a as SimpleValue).value as boolean))));
registerOperator(new EqualityOperator(2, "=", BinaryOperator.matchesSomePairsFn([[anyType, anyType]]), booleanType, (a, b) => SimpleValue.boolean(a.equals(b))));
registerOperator(new EqualityOperator(2, "!=", BinaryOperator.matchesSomePairsFn([[anyType, anyType]]), booleanType, (a, b) => SimpleValue.boolean(!a.equals(b))));
registerOperator(new BinaryOperator(3, "<", BinaryOperator.matchesSomePairsFn([[numberType, numberType], [charType, charType], [stringType, stringType]]), booleanType, <T extends Value> (a: T, b: T) => SimpleValue.boolean(!a.equals(b) && !(a as unknown as Ordered<T>).greaterThan(b))));
registerOperator(new BinaryOperator(3, "<=", BinaryOperator.matchesSomePairsFn([[numberType, numberType], [charType, charType], [stringType, stringType]]), booleanType, <T extends Value> (a: T, b: T) => SimpleValue.boolean(a.equals(b) || !(a as unknown as Ordered<T>).greaterThan(b))));
registerOperator(new BinaryOperator(3, ">", BinaryOperator.matchesSomePairsFn([[numberType, numberType], [charType, charType], [stringType, stringType]]), booleanType, <T extends Value> (a: T, b: T) => SimpleValue.boolean(!a.equals(b) && (a as unknown as Ordered<T>).greaterThan(b))));
registerOperator(new BinaryOperator(3, ">=", BinaryOperator.matchesSomePairsFn([[numberType, numberType], [charType, charType], [stringType, stringType]]), booleanType, <T extends Value> (a: T, b: T) => SimpleValue.boolean(a.equals(b) || (a as unknown as Ordered<T>).greaterThan(b))));

// Array Operators
registerOperator(new class extends BinaryOperator {
    public getReturnType(operandTypes: ValueType[]): ValueType {
        const type1 = operandTypes[0]!;
        const type2 = operandTypes[1]!;
        if(type1 instanceof ArrayType) {
            if(type1.elementType.isDefined()) return type1;
        }
        if(type2 instanceof ArrayType) {
            if(type2.elementType.isDefined()) return type2;
        }
        return type1;
    }
}(4, "&", types => (types[0]!.baseIdentifier == "array" || types[0]!.id == "string" || types[0]!.isUndefined()) && types[0]!.matches(types[1]!), anyType, (a, b) => (a as UtilityArray).concat(b as UtilityArray)));
registerOperator(new UnaryOperator(100, "str", UnaryOperator.matchesSomeFn([anyType]), stringType, a => new UtilityString([...a.asString()].map(SimpleValue.char))));

// Constructors
registerOperator(new ObjectConstructor("s1l", [anyType], SinglyLinkedListNodeTemplate));
registerOperator(new ObjectConstructor("s2l", [anyType], DoublyLinkedListNodeTemplate));
registerOperator(new ObjectConstructor("btn", [anyType], BinaryTreeNodeTemplate));

// Object Operators
registerOperator(new ObjectGetOperator());
registerOperator(new ObjectIndexOperator());

// Function Operators
registerOperator(new FunctionOperator("swap", 3,
    ops => {
        return (ops[0]!.baseIdentifier == "array" || ops[0]!.baseIdentifier == "string") && ops[1]!.matches(numberType) && ops[2]!.matches(numberType)
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
        if(!(operands[0] instanceof UtilityObject)) return;
        const c = (operands[0] as UtilityObject);
        const d = (operands[1] as Value);
        const e = c.get("next");
        c.set("next", d);
        if(d instanceof UtilityObject) {
            d.set("next", e);
        }
    }
));
registerOperator(new FunctionOperator("is2l", 2,
    ops => {
        return ops[0]!.baseIdentifier == "s2l" && ops[0]!.matches(ops[1]!);
    },
    undefinedType,
    (operands) => {
        if(!(operands[0] instanceof UtilityObject)) return;
        const c = (operands[0] as UtilityObject);
        const d = (operands[1] as Value);
        const e = c.get("next");
        c.set("next", d);
        if(d instanceof UtilityObject) {
            d.set("prev", c);
            d.set("next", e);
        }
        if(e instanceof UtilityObject) {
            e.set("prev", d);
        }
    }
));
registerOperator(new FunctionOperator("ileft", 2,
    ops => {
        return ops[0]!.baseIdentifier == "btn" && ops[0]!.matches(ops[1]!);
    },
    undefinedType,
    (operands) => {
        if(!(operands[0] instanceof UtilityObject)) return;
        const p = (operands[0] as UtilityObject);
        const c = (operands[1] as UtilityObject);
        const l = p.get("left")!;
        p.set("left", c);
        c.set("parent", p);
        if(l instanceof UtilityObject) {
            l.set("parent", SimpleValue.undefined());
        }
    }
));
registerOperator(new FunctionOperator("iright", 2,
    ops => {
        return ops[0]!.baseIdentifier == "btn" && ops[0]!.matches(ops[1]!);
    },
    undefinedType,
    (operands) => {
        if(!(operands[0] instanceof UtilityObject)) return;
        const p = (operands[0] as UtilityObject);
        const c = (operands[1] as UtilityObject);
        const r = p.get("right")!;
        p.set("right", c);
        c.set("parent", p);
        if(r instanceof UtilityObject) {
            r.set("parent", SimpleValue.undefined());
        }
    }
));

export abstract class Operand {
    public abstract get type(): ValueType;
    /**
     * @returns Flattens the Operand into a List of ResolvableOperand and Operators.
     */
    public abstract flatten(): (ResolvableOperand | Operator)[];
}

export abstract class ResolvableOperand extends Operand {
    /**
     * The text representation of the Operand. Can be an empty string.
     */
    public readonly representation: string;

    /**
     * @returns The value this Operand can be resolved to.
     */
    public abstract resolve(): Value;

    /**
     * @param representation The text representation of the Operand. Can be an empty string.
     */
    constructor(representation: string) {
        super();
        this.representation = representation;
    }
}

export class GroupedOperand extends Operand {
    public readonly tokens: (Operand | Operator)[];
    public readonly type: ValueType;

    /**
     * @param tokens The group of Operands and Operators it represents.
     * @param type The type the group would be evaluated to eventually.
     */
    constructor(tokens: (Operand | Operator)[], type: ValueType) {
        super();
        this.tokens = tokens;
        this.type = type;
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
        return ArrayLiteralOperand.parse(text, memory, indexResolver);
    }
    if(text.startsWith("\"") && text.endsWith("\"")) {
        return StringLiteralOperand.parse(text);
    }
    return SimpleLiteralOperand.parse(text);
}

class SimpleLiteralOperand extends ResolvableOperand {
    value: Value;

    protected constructor(value: Value) {
        super("");
        this.value = value;
    }

    public static parse(text: string): SimpleLiteralOperand {
        if(!isNaN(Number(text))) {
            return new SimpleLiteralOperand(SimpleValue.number(Number(text)));
        } else if (text == "true") {
            return new SimpleLiteralOperand(SimpleValue.boolean(true));
        } else if (text == "false") {
            return new SimpleLiteralOperand(SimpleValue.boolean(false));
        } else if (text == "undefined") {
            return new SimpleLiteralOperand(SimpleValue.undefined());
        } else if (text.startsWith("\'") && text.endsWith("\'") && text.length == 3) {
            return new SimpleLiteralOperand(SimpleValue.char(text.substring(1,2)));
        } else {
            return new SimpleLiteralOperand(SimpleValue.token(text));
        }
    }

    public override resolve(): Value {
        return this.value;
    }

    public override get type(): ValueType {
        return this.value.type;
    }

    public override flatten(): (ResolvableOperand | Operator)[] {
        return [this];
    }
}

class ArrayLiteralOperand extends ResolvableOperand {
    values: AnyStatement[];
    public readonly type: ArrayType;

    protected constructor(values: AnyStatement[], elementType: ValueType) {
        super("");
        this.values = values;
        this.type = new ArrayType(elementType);
    }

    private static splitElements(text: string) {
        const tokens = [];
        let currentToken = "";
        let arrayDepth = 0;
        let bracketDepth = 0;
        for(const c of [...text]) {
            if(c == "," && arrayDepth == 0 && bracketDepth == 0) {
                tokens.push(currentToken);
                currentToken = "";
                continue;
            } else if(c == "{") {
                arrayDepth += 1;
            } else if(c == "}") {
                arrayDepth -= 1;
            } else if(c == "(") {
                bracketDepth += 1;
            } else if(c == ")") {
                bracketDepth -= 1;
            }
            currentToken += c;
        }
        if(arrayDepth > 0 || bracketDepth > 0) throw new StatementParseError("Array brackets and normal brackets are in the wrong order!", "error_array_bracket");
        tokens.push(currentToken);
        return tokens;
    }

    public static parse(text: string, memory: Memory, indexResolver: IndexResolver): ArrayLiteralOperand {
        if(!text.startsWith("{") || !text.endsWith("}")) {
            throw new Error("Not an array literal!");
        }
        text = text.substring(1,text.length-1);
        if(text.length == 0) {
            return new ArrayLiteralOperand([], undefinedType);
        }
        const values = ArrayLiteralOperand.splitElements(text).map(token => AnyStatement.parse(token, memory, indexResolver));
        for(let i = 0; i < values.length; i++) {
            for(let j = i+1; j < values.length; j++) {
                if(!values[i]!.returnType.matches(values[j]!.returnType)) throw new StatementParseError("Arrays cannot be heterogeneous!", "error_array_heterogeneous")
            }
        }
        return new ArrayLiteralOperand(values, values.length > 0 ? values[0]!.returnType : undefinedType);
    }

    public resolve(): Value {
        const evaluatedValues = this.values.map(v => v.evaluate());
        if(evaluatedValues.some(v => v.type.id == "undefined")) return SimpleValue.undefined();
        return new UtilityArray(evaluatedValues, this.type.elementType);
    }

    public override flatten(): (ResolvableOperand | Operator)[] {
        return [this];
    }
}

class StringLiteralOperand extends ResolvableOperand {
    values: Value[];

    protected constructor(values: Value[]) {
        super("");
        this.values = values;
    }

    public static parse(text: string): StringLiteralOperand {
        if(!text.startsWith("\"") || !text.endsWith("\"")) {
            throw new Error("Not a string literal!");
        }
        text = text.substring(1,text.length-1);
        const values = [...text].map(token => SimpleValue.char(token));
        return new StringLiteralOperand(values);
    }

    public resolve(): Value {
        return new UtilityString(this.values);
    }

    public get type(): ValueType {
        return stringType;
    }

    public override flatten(): (ResolvableOperand | Operator)[] {
        return [this];
    }
}

class VariableOperand extends ResolvableOperand {
    private key: string;
    private memory: Memory;

    constructor(key: string, memory: Memory) {
        super(key);
        this.key = key;
        this.memory = memory;
        if(!this.memory.hasVariable(key)) {
            throw new StatementParseError(`Invalid variable key [${key}]!`, "error_undefined_variable");
        }
    }

    public override resolve(): Value {
        return this.memory.getVariable(this.key);
    }

    public override get type(): ValueType {
        return this.memory.getType(this.key);
    }

    public override flatten(): (ResolvableOperand | Operator)[] {
        return [this];
    }
}

export abstract class Statement<T> {
    /**
     * Emitted when an operator is applied on operands.
     * Its arguments are: operator: Operator, operands: Value[]
     * */
    public static readonly computeEvent = "statement.compute";

    /**
     * Emitted when an operand is resolved.
     * Its arguments are: operand: Operand, result: Value
     * */
    public static readonly operandResolutionEvent = "statement.operandresolution";

    /**
     * Emitted when the evaluation is started.
     * It has no arguments.
     * */

    public static readonly evaluationStart = "statement.evaluation.start";

    /**
     * Emitted when the evaluation is ended.
     * It has no arguments.
     * */
    public static readonly evaluationEnd = "statement.evaluation.end";

    public static readonly emitter: EventEmitter2 = new EventEmitter2();
    protected evaluatableTokens: (ResolvableOperand | Operator)[] = [];
    protected readableTokens: (ResolvableOperand | Operator | Bracket)[] = [];
    protected _returnType: ValueType = undefinedType;
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
                const opCount = token.operandCount;
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

        function isCurrentTokenAFinishedOperatorToken(c: string) {
            return operatorTokens.has(currentToken) && !operatorTokens.has(currentToken+c);
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
                if(isCurrentTokenAFinishedOperatorToken(c)) {
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
                // we replace the indexers with the indexing operator
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
                    throw new StatementParseError(`Statement ends with an operator! There are no postfix operators!`, "error_postfix");
                }

                function decideOperandType(): OperatorType {
                    const afterComma = () => partialParsedTokens[i-1] == ",";
                    const afterOperand = () => partialParsedTokens[i-1] instanceof Operand || partialParsedTokens[i-1] == ")" || partialParsedTokens[i-1] == "]";
                    const afterOperator = () => !(partialParsedTokens[i-1] instanceof Operand);
                    if((i == 0 || i == partialParsedTokens.length-1) && partialParsedTokens[i+1] instanceof Operand) {
                        return "prefix";
                    } else if (afterOperand()) {
                        return "infix";
                    } else if(afterOperator() || afterComma()) {
                        return "prefix";
                    } else {
                        throw new StatementParseError(`Cannot decide the operator type for given operator [${token}]`, "error_undecidable_operator_type");
                    }
                }

                const operatorType = decideOperandType();
                const operator = operatorsByType[operatorType]![token]!;
                if(!operator) {
                    throw new StatementParseError(`Operator was used at the wrong location!`, "error_operator_location");
                }

                parsedTokens.push(operatorsByType[operatorType]![token]!);
            }
            return parsedTokens;
        }

        const parsedTokens: (Operand | Operator | Bracket)[] = fullyParseTokens();

        function arrangeIntoPostfix(): (Operator | ResolvableOperand)[] {
            function applyOperator(operator: Operator) {
                const postFix: (Operand | Operator)[] = []
                const _operands = [];
                for(let i = 0; i < operator.operandCount; i++) {
                    _operands.push(operands.pop()!);
                }
                if(!operator.isApplicableTo(_operands.map(operand => operand.type).reverse())) {
                    throw new StatementParseError(`Operator type mismatch! [${operator.token}] is not applicable to [${_operands.map(operand => operand.type.id).reverse()}]!`, "error_operator_type_mismatch");
                }
                postFix.push(..._operands);
                postFix.push(operator);
                operands.push(new GroupedOperand(postFix, operator.getReturnType(_operands.map(op => op.type).reverse())));
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
                        // this should be ensured here to avoid runtime errors
                        if(bracketDepth < 0) {
                            throw new StatementParseError("At least one closing bracket is missing its opening bracket!", "error_missing_opening_bracket");
                        }
                        flushOperatorsWhile(() => operators.at(-1) != "(");
                        operators.pop();
                    } else {
                        try {
                            operands.push(new GroupedOperand([token], token.type));
                        } catch(error) {
                            throw error;
                        }
                    }
                }
            }

            // missing opening bracket must be handled earlier to avoid runtime errors
            if(bracketDepth != 0) {
                throw new StatementParseError("At least one opening bracket is missing its closing bracket!", "error_missing_closing_bracket");
            }

            flushOperatorsWhile(() => operators.length > 0);

            if(operands.length > 1) throw new StatementParseError("Statement result is ambigous!", "error_ambigous_result");
            statement.assertReturnType(operands[0]!.type);
            statement.returnType = operands[0]!.type;

            return operands[0]!.flatten();
        }

        statement.indexResolver = indexResolver;
        statement.evaluatableTokens.push(...arrangeIntoPostfix());
        statement.readableTokens.push(...parsedTokens.map(v => v instanceof Operand ? v.flatten() : v).flat());
    }

    public get returnType() {
        return this._returnType;
    }

    protected set returnType(value: ValueType) {
        this._returnType = value;
    }
}

export class NumericStatement extends Statement<number> {
    public override evaluate(): number {
        const result = this.evaluateInternally();
        if(result.type.id == "undefined") return 0;
        return (result as SimpleValue).value as number;
    }

    protected override assertReturnType(type: ValueType): void {
        super.assertReturnType(type);
        if(!numberType.matches(type)) {
            throw new StatementParseError(`Numeric statement expects to receive a number as its result but instead received [${type.id}]!`, "error_numeric_result_mismatch");
        }
    }

    protected constructor() {
        super();
    }

    /**
     * @param text the statement text to parse
     * @param memory the memory to be used by the statement
     * @param indexResolver the index resolver to be used by the statement
     * @returns a numeric statement
     */
    public static parse(text: string, memory: Memory, indexResolver: IndexResolver): NumericStatement {
        const statement = new NumericStatement();
        Statement.parseInto<number>(statement, text, memory, indexResolver);

        return statement;
    }
}

export class CharStatement extends Statement<string> {
    public override evaluate(): string {
        const result = this.evaluateInternally();
        if(result.type.isUndefined()) return "a";
        return (result as SimpleValue).value as string;
    }

    protected override assertReturnType(type: ValueType): void {
        super.assertReturnType(type);
        if(!charType.matches(type)) {
            throw new StatementParseError(`Char statement expects to get a char as its result but instead received [${type.id}]!`, "error_char_result_mismatch");
        }
    }

    protected constructor() {
        super();
    }

    /**
     * @param text the statement text to parse
     * @param memory the memory to be used by the statement
     * @param indexResolver the index resolver to be used by the statement
     * @returns a char statement
     */
    public static parse(text: string, memory: Memory, indexResolver: IndexResolver): CharStatement {
        const statement = new CharStatement();
        Statement.parseInto<string>(statement, text, memory, indexResolver);

        return statement;
    }
}

export class StringStatement extends Statement<string> {
    public override evaluate(): string {
        const result = this.evaluateInternally();
        if(result.type.isUndefined()) return "";
        return (result as UtilityString).getString();
    }

    protected override assertReturnType(type: ValueType): void {
        super.assertReturnType(type);
        if(!stringType.matches(type)) {
            throw new StatementParseError(`String statement expects to get a string as its result but instead received [${type.id}]!`, "error_string_result_mismatch");
        }
    }

    protected constructor() {
        super();
    }

    /**
     * @param text the statement text to parse
     * @param memory the memory to be used by the statement
     * @param indexResolver the index resolver to be used by the statement
     * @returns a string statement
     */
    public static parse(text: string, memory: Memory, indexResolver: IndexResolver): StringStatement {
        const statement = new StringStatement();
        Statement.parseInto<string>(statement, text, memory, indexResolver);

        return statement;
    }
}

export class BooleanStatement extends Statement<boolean> {
    public override evaluate(): boolean {
        const result = this.evaluateInternally();
        if(result.type.isUndefined()) return false;
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

    /**
     * @param text the statement text to parse
     * @param memory the memory to be used by the statement
     * @param indexResolver the index resolver to be used by the statement
     * @returns a boolean statement
     */
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

    /**
     * @param text the statement text to parse
     * @param memory the memory to be used by the statement
     * @param indexResolver the index resolver to be used by the statement
     * @returns a any statement
     */
    public static parse(text: string, memory: Memory, indexResolver: IndexResolver): AnyStatement {
        const statement = new AnyStatement();
        Statement.parseInto<any>(statement, text, memory, indexResolver);

        return statement;
    }
}