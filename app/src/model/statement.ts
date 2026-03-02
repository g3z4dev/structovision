import EventEmitter2 from "eventemitter2";
import {Memory} from "./memory.ts";
import {type Primitive} from "./util.ts";

type OpeningBracket = "(";
type ClosingBracket = ")";
export type Bracket = OpeningBracket | ClosingBracket;

export class StatementParseError extends Error {

    constructor(m: string) {
        super(m);
        Object.setPrototypeOf(this, StatementParseError.prototype);
    }
}

export class StatementEvaluationError extends Error {
    constructor(m: string) {
        super(m);

        Object.setPrototypeOf(this, StatementEvaluationError.prototype);
    }
}



function getAllSortedPairs(array: string[]): string[][] {
    const pairs: string[][] = [];
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
    protected representingChar: string;
    protected returnType: string;
    protected rightToLeft: boolean;

    protected constructor(priority: number, representingChar: string, returnType: string, rightToLeft: boolean) {
        this.precedence = priority;
        this.representingChar = representingChar;
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

    public getReturnType(): string {
        return this.returnType;
    }

    abstract apply(operands: Primitive[]): Primitive;
    abstract getOperandCount(): number;
    abstract isApplicableTo(types: string[]): boolean;
}

class BinaryOperator extends Operator {
    private operation: (a: Primitive, b: Primitive) => Primitive;
    private operandTypePairs: string[];

    public constructor(priority: number, representingChar: string, operandTypePairs: string[][], returnType: string, operation: (a: Primitive, b: Primitive) => Primitive, rightToLeft: boolean = false) {
        super(priority, representingChar, returnType, rightToLeft);
        this.operation = operation;
        this.operandTypePairs = operandTypePairs.map(pair => pair.sort().join(":"));
    }
    
    public override apply(operands: Primitive[]): Primitive {
        if(operands.length != 2) {
            throw new StatementEvaluationError(`BinaryOperator expected 2 operands but received ${operands.length}!`);
        }

        const a = operands[0]!;
        const b = operands[1]!;
        
        return this.operation(a, b);
    }

    public override getOperandCount(): number {
        return 2;
    }
    
    public isApplicableTo(types: string[]): boolean {
        return this.operandTypePairs.includes(types.sort().join(":"));
    }
}

class UnaryOperator extends Operator {
    private operation: (a: Primitive) => Primitive;
    private operandTypes: string[];

    public constructor(priority: number, representingChar: string, operandTypes: string[], returnType: string, operation: (a: Primitive) => Primitive) {
        super(priority, representingChar, returnType, true);
        this.operation = operation;
        this.operandTypes = operandTypes;
    }

    public override apply(operands: Primitive[]): Primitive {
        if(operands.length != 1) {
            throw new StatementEvaluationError(`Unary expected 1 operands but received [${operands.length}!]`);
        }

        const a = operands[0]!;
        return this.operation(a);
    }

    public override getOperandCount(): number {
        return 1;
    }

    public override isApplicableTo(types: string[]): boolean {
        return this.operandTypes.includes(types[0]!);
    }
}

const operandTokens: Set<string> = new Set();
const operatorsByOperandCount: Record<number, Record<string, Operator>> = {};

function register(op: Operator) {
    operandTokens.add(op.getRepresentingChar());
    if(!(op.getOperandCount() in operatorsByOperandCount)) {
        operatorsByOperandCount[op.getOperandCount()] = {};
    }
    operatorsByOperandCount[op.getOperandCount()]![op.getRepresentingChar()] = op;
}

// Numeric Operators
register(new BinaryOperator(4, "+", [["number", "number"]], "number", (a, b) => (a as number) + (b as number)));
register(new BinaryOperator(4, "-", [["number", "number"]], "number", (a, b) => (a as number) - (b as number)));
register(new BinaryOperator(5, "*", [["number", "number"]], "number", (a, b) => (a as number) * (b as number)));
register(new BinaryOperator(5, "/", [["number", "number"]], "number", (a, b) => (a as number) / (b as number)));
register(new BinaryOperator(5, "div", [["number", "number"]], "number", (a, b) => Math.floor((a as number) / (b as number))));
register(new BinaryOperator(5, "mod", [["number", "number"]], "number", (a, b) => (a as number) % (b as number)));
register(new BinaryOperator(6, "^", [["number", "number"]], "number", (a, b) => (a as number) ** (b as number), true));
register(new UnaryOperator(7, "-", ["number"], "number", a => -(a as number)));
register(new UnaryOperator(7, "sqrt", ["number"], "number", a => Math.sqrt((a as number))));
register(new UnaryOperator(7, "log", ["number"], "number", a => Math.log2((a as number))));
register(new UnaryOperator(7, "abs", ["number"], "number", a => Math.abs((a as number))));
register(new UnaryOperator(7, "len", ["string"], "number", a => (a as string).length));

// Logic Operators
register(new BinaryOperator(1, "and", [["boolean", "boolean"]], "boolean", (a, b) => (a as boolean) && (b as boolean)));
register(new BinaryOperator(0, "or", [["boolean", "boolean"]], "boolean", (a, b) => (a as boolean) || (b as boolean)));
register(new UnaryOperator(7, "!", ["boolean"], "boolean", a => !(a as boolean)));
register(new BinaryOperator(2, "=", getAllSortedPairs(["number", "string", "boolean"]), "boolean", (a, b) => a == b));
register(new BinaryOperator(2, "!=", getAllSortedPairs(["number", "string", "boolean"]), "boolean", (a, b) => a != b));
register(new BinaryOperator(3, "<", [["number", "number"], ["string", "string"]], "boolean", (a, b) => a < b));
register(new BinaryOperator(3, "<=", [["number", "number"], ["string", "string"]], "boolean", (a, b) => a <= b));
register(new BinaryOperator(3, ">", [["number", "number"], ["string", "string"]], "boolean", (a, b) => a > b));
register(new BinaryOperator(3, ">=", [["number", "number"], ["string", "string"]], "boolean", (a, b) => a >= b));

// String Operators
register(new BinaryOperator(4, "&", getAllSortedPairs(["number", "string", "boolean"]), "string", (a, b) => String(a) + String(b)));

export abstract class Operand {
    public abstract resolve(): Primitive;
    public abstract getType(): string;
    public abstract getRepresentation(): string;
}

class LiteralOperand extends Operand {
    value: Primitive;

    protected constructor(value: Primitive) {
        super();
        this.value = value;
    }

    public static parse(text: string): LiteralOperand {
        if(!isNaN(Number(text))) {
            return new LiteralOperand(Number(text));
        } else if (text == "true") {
            return new LiteralOperand(true);
        } else if (text == "false") {
            return new LiteralOperand(false);
        } else if (text.startsWith("\"") && text.endsWith("\"")) {
            return new LiteralOperand(text.substring(1, text.length-1))
        } else {
            throw new StatementParseError(`Invalid literal [${text}]!`);
        }
    }

    public override resolve(): Primitive {
        return this.value;
    }

    public override getType(): string {
        return typeof this.value;
    }

    public override getRepresentation() {
        return "";
    }
}

class VariableOperand extends Operand {
    private _key: string;
    private memory: Memory;

    constructor(key: string, memory: Memory) {
        super();
        this._key = key;
        this.memory = memory;
        if(!this.memory.hasVariable(key)) {
            throw new StatementParseError(`Invalid variable key [${key}]!`);
        }
    }

    public override resolve(): Primitive {
        return this.memory.getVariable(this.key);
    }

    public override getType(): string {
        return typeof this.memory.getVariable(this.key);
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
    protected evaluatableTokens: (Operand | Operator)[] = [];
    protected readableTokens: (Operand | Operator | Bracket)[] = [];

    abstract evaluate(): T;
    protected evaluateInternally(): Primitive {
        Statement.emitter.emit(Statement.evaluationStart, this.readableTokens);
        const operands: Primitive[] = [];
        for(const token of this.evaluatableTokens) {
            if(token instanceof Operand) {
                const resolvedOperand = token.resolve();
                operands.push(resolvedOperand);
            } else {
                const opCount = token.getOperandCount();
                const usedOperands = [];
                for(let i = 0; i < opCount; i++) {
                    usedOperands.push(operands.pop()!);
                }
                operands.push(token.apply(usedOperands));
            }
        }
        const value = operands.pop()!;
        Statement.emitter.emit(Statement.evaluationEnd, value);
        return value;
    }

    protected abstract assertReturnType(type: string): void;

    protected static parseOperand(text: string, memory: Memory): Operand {
        if(memory.hasVariable(text)) {
            return new VariableOperand(text, memory);
        }
        return LiteralOperand.parse(text);
    }

    protected static splitTokens(text: string): string[] {
        let currentToken = "";
        const tokens: string[] = [];
        type TokenParseState = "none" | "number" | "string" | "alphanumeric" | "specialcharacter";
        let tokenParseState: TokenParseState = "none";

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
            if(c == "\"" || tokenParseState == "string" as TokenParseState) {
                if(c == "\"" && tokenParseState == "string" as TokenParseState) {
                    currentToken += c;
                    flushCurrentToken();
                    tokenParseState = "none";
                } else {
                    handleState(c, "string");
                }
            } else if(c == " ") {
                tokenParseState = "none";
                flushCurrentToken();
            } else if (c == "(" || c == ")") {
                tokenParseState = "none";
                flushCurrentToken();
                tokens.push(c);
            } else if(isNumeric(c) && (tokenParseState != "alphanumeric" as TokenParseState || !isAlphanumeric(c))) {
                handleState(c, "number");
            } else if(isSpecialCharacter(c)) {
                if(operandTokens.has(currentToken) && !operandTokens.has(currentToken+c)) {
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

    protected static parseInto<T>(statement: Statement<T>, text: string, memory: Memory): void {
        if(text.length == 0) throw new StatementParseError("Cannot parse empty statement!");
        const tokens: string[] = this.splitTokens(text);
        const operators: (Operator | OpeningBracket)[] = [];
        const operands: OperandGroup[] = [];

        const partialParsedTokens: (string | Operand | Bracket)[] = tokens.map(token => {
            if(operandTokens.has(token)) {
                return token;
            } else if (token == "(" || token == ")") {
                return token;
            } else {
                return this.parseOperand(token, memory);
            }
        });

        class OperandGroup {
            tokens: (Operand | Operator)[];
            type: string;

            constructor(tokens: (Operand | Operator)[], type: string) {
                this.tokens = tokens;
                this.type = type;
            }
        }

        function fullyParseTokens(): (Operand | Operator | Bracket)[] {
            const parsedTokens: (Operand | Operator | Bracket)[] = [];
            for(let i = 0; i < tokens.length; i++) {

                const token = partialParsedTokens[i]!;
                if(token instanceof Operand || token == "(" || token == ")") {
                    parsedTokens.push(token);
                    continue;
                }
                if(i == partialParsedTokens.length - 1) {
                    throw new StatementParseError(`Statement ends with an operator! There are no postfix operators!`);
                }

                function decideOperandCount(): number {
                    const afterOperand = () => partialParsedTokens[i-1] instanceof Operand || partialParsedTokens[i-1] == ")";
                    const afterOperator = () => !(partialParsedTokens[i-1] instanceof Operand);
                    if((i == 0 || i == tokens.length-1) && partialParsedTokens[i+1] instanceof Operand) {
                        return 1;
                    } else if (afterOperand()) {
                        return 2;
                    } else if (afterOperator()) {
                        return 1;
                    } else {
                        throw new StatementParseError(`Cannot decide the operand count for given operator [${token}]`);
                    }
                }

                const operandCount = decideOperandCount();

                parsedTokens.push(operatorsByOperandCount[operandCount]![token]!);
            }
            return parsedTokens;
        }

        const parsedTokens: (Operand | Operator | Bracket)[] = fullyParseTokens();

        function arrangeIntoPostfix(): (Operand | Operator)[] {
            function flushOperatorsWhile(condition: () => boolean) {
                while(condition()) {
                    const lastOp = operators.pop() as Operator;
                    const postFix: (Operand | Operator)[] = []
                    const _operands = [];
                    for(let i = 0; i < lastOp.getOperandCount(); i++) {
                        _operands.push(operands.pop()!);
                    }
                    if(!lastOp.isApplicableTo(_operands.map(operand => operand.type))) {
                        throw new StatementParseError(`Operator type mismatch! [${lastOp.getRepresentingChar()}] is not applicable to [${_operands.map(operand => operand.type)}]!`);
                    }
                    postFix.push(..._operands.map(operand => operand.tokens).flat());
                    postFix.push(lastOp);
                    operands.push(new OperandGroup(postFix.flat(), lastOp.getReturnType()));
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
                        operands.push(new OperandGroup([token], token.getType()));
                    }
                }
            }

            if(bracketDepth != 0) {
                if(bracketDepth < 0) {
                    throw new StatementParseError("At least one closing bracket is missing its opening bracket!");
                } else {
                    throw new StatementParseError("At least one bracket is missing its closing bracket!");
                }
            }

            flushOperatorsWhile(() => operators.length > 0);

            statement.assertReturnType(operands[0]!.type);

            return operands[0]!.tokens!;
        }

        statement.evaluatableTokens.push(...arrangeIntoPostfix());
        statement.readableTokens.push(...parsedTokens);
    }
}

export class NumericStatement extends Statement<number> {
    public override evaluate(): number {
        return this.evaluateInternally() as number;
    }

    protected override assertReturnType(type: string): void {
        if(type != "number") {
            throw new StatementParseError(`Numeric statement expects to get a number as its result but instead received [${type}]!`);
        }
    }

    protected constructor() {
        super();
    }

    public static parse(text: string, memory: Memory): NumericStatement {
        const statement = new NumericStatement();
        Statement.parseInto<number>(statement, text, memory);

        return statement;
    }
}

export class StringStatement extends Statement<string> {
    public override evaluate(): string {
        return this.evaluateInternally() as string;
    }

    protected override assertReturnType(type: string): void {
        if(type != "string") {
            throw new StatementParseError(`String statement expects to get a string as its result but instead received [${type}]!`);
        }
    }

    protected constructor() {
        super();
    }

    public static parse(text: string, memory: Memory): StringStatement {
        const statement = new StringStatement();
        Statement.parseInto<string>(statement, text, memory);

        return statement;
    }
}

export class BooleanStatement extends Statement<boolean> {
    public override evaluate(): boolean {
        return this.evaluateInternally() as boolean;
    }

    protected override assertReturnType(type: string): void {
        if(type != "boolean") {
            throw new StatementParseError(`Boolean statement expects to get a boolean as its result but instead received [${type}]!`);
        }
    }

    protected constructor() {
        super();
    }

    public static parse(text: string, memory: Memory): BooleanStatement {
        const statement = new BooleanStatement();
        Statement.parseInto<boolean>(statement, text, memory);

        return statement;
    }
}

export class AnyStatement extends Statement<Primitive> {
    public override evaluate(): Primitive {
        return this.evaluateInternally();
    }

    protected constructor() {
        super();
    }

    protected override assertReturnType(type: string): void {
        return;
    }

    public static parse(text: string, memory: Memory): AnyStatement {
        const statement = new AnyStatement();
        Statement.parseInto<Primitive>(statement, text, memory);

        return statement;
    }
}