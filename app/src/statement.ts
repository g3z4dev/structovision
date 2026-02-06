type Primitive = number | boolean | string;

class OperandParseError extends Error {
    constructor(m: string) {
        super(m);

        Object.setPrototypeOf(this, OperandParseError.prototype);
    }
}

class OperatorApplicationError extends Error {
    constructor(m: string) {
        super(m);

        Object.setPrototypeOf(this, OperatorApplicationError.prototype);
    }
}


class StatementEvalError extends Error {
    constructor(m: string) {
        super(m);

        Object.setPrototypeOf(this, OperatorApplicationError.prototype);
    }
}

abstract class Operator {
    priority: number;
    representingChar: string;

    protected constructor(priority: number, representingChar: string) {
        this.priority = priority;
        this.representingChar = representingChar;
    }

    public getPriority(): number {
        return this.priority;
    }
    
    public getRepresentingChar(): string {
        return this.representingChar;
    }
    abstract apply(operands: Primitive[]): Primitive;
    abstract getOperandCount(): number;
}

class BinaryOperator extends Operator {
    operation: (a: Primitive, b: Primitive) => Primitive;

    public constructor(priority: number, representingChar: string, operation: (a: Primitive, b: Primitive) => Primitive) {
        super(priority, representingChar);
        this.operation = operation;
    }
    
    public apply(operands: Primitive[]): Primitive {
        if(operands.length != 2) {
            throw new OperatorApplicationError(`BinaryOperator expected 2 operands but got ${operands.length}!`);
        }
        return this.operation(!operands[0], !operands[1]);
    }

    public getOperandCount(): number {
        throw new Error("Method not implemented.");
    }
}

const registeredOperators: Record<string, Operator> = {}

function register(op: Operator) {
    registeredOperators[op.getRepresentingChar()] = op;
}

register(new BinaryOperator(0, "+", (a, b) => {
    if(typeof a == "number" && typeof b == "number") {
        return a + b;
    }
    throw new OperatorApplicationError("The operator + expects two numbers!");
}));

interface Operand {
    resolve(): Primitive;
}

class LiteralOperand implements Operand {
    value: Primitive;

    protected constructor(value: Primitive) {
        this.value = value;
    }

    public static parse(text: string): LiteralOperand {
        if(!Number.isNaN(text)) {
            return new LiteralOperand(Number(text));
        } else if (text == "true") {
            return new LiteralOperand(true);
        } else if (text == "false") {
            return new LiteralOperand(false);
        } else if (text.startsWith("\"") && text.endsWith("\"")) {
            // TODO proper open-closing " checking
            return new LiteralOperand(text.substring(1, text.length-1))
        } else {
            throw new OperandParseError("Invalid literal!");
        }
    }

    public resolve(): Primitive {
        return this.value;
    }
}

abstract class Statement<T> {
    tokens: (Operand | Operator)[] = [];

    abstract evaluate(): T;
    protected evaluateInternally(): Primitive {
        const operands: Primitive[] = [];
        for(const token of this.tokens) {
            if("resolve" in token) {
                operands.push(token.resolve());
            } else {
                const opCount = token.getOperandCount();
                if(operands.length < opCount) {
                    throw new Error("Statement failed to evaluate! Invalid operand count!");
                }
                const usedOperands = [];
                for(let i = 0; i < opCount; i++) {
                    usedOperands.push(operands.pop()!);
                }
                operands.push(token.apply(usedOperands));
            }
        }
        if(operands.length != 1) {
            throw new Error("Statement failed to evaluate! Invalid postfix format!");
        }
        return operands.pop()!;
    }
    private parseOperand(text: string): Operand {
        return LiteralOperand.parse(text);
    }
}

class NumericStatement extends Statement<number> {
    evaluate(): number {
        const result = this.evaluateInternally();
        if(typeof(result) == "number") {
            return result;
        }
        throw new Error("Statement is wrong!");
    }

    protected constructor() {
        super();
    }

    public static parse(text: string): NumericStatement {
        const tokens: string[] = text.split(" ");
        const operators: Operator[] = [];
        const operands: Operand[] = [];
        const statement = new NumericStatement();
        for(let token of tokens) {
            token = token.trim()
            if(token in registeredOperators) {
                const operator = registeredOperators[token]!;
                if(operators.length > 0 && operator.getPriority() < operators[-1]!.getPriority()) {
                    const lastOp = operators[-1]!;
                    for(let i = 0; i < lastOp.getOperandCount(); i++) {
                        statement.tokens.push(operands.pop()!);
                    }
                    statement.tokens.push(lastOp);
                }
                operators.push(registeredOperators[token]!);
            }
        }
    }
}

