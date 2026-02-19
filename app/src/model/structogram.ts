import EventEmitter2 from "eventemitter2";
import {Memory, VariableCreationError} from "./memory";
import {AnyStatement, BooleanStatement, NumericStatement, Statement, StringStatement, StatementParseError} from "./statement";
import {type Primitive} from "./util";

interface TypeIdentifiable {
    getTypeIdentifier(): string;
}

export class StructogramIssues {
    private _id: string;
    private _message: string;

    constructor(id: string, message: string) {
        this._id = id;
        this._message = message;
    }

    public get id() {
        return this._id;
    }

    public get message() {
        return this._message;
    }
}

export class Structogram {
    public static readonly printEvent = "structogram.print";
    public readonly memory: Memory;
    public readonly emitter: EventEmitter2;
    private startingBlock: StructogramBlock | undefined;
    private currentBlock: StructogramBlock | undefined;
    private readonly idMap: Record<string, StructogramBlock> = {};
    private running = false;
    private bracketBlockStack: BracketBlock[] = [];
    private ready = false;
    private variables: Record<string, Primitive> = {};

    constructor(emitter: EventEmitter2) {
        this.memory = new Memory(emitter);
        this.emitter = emitter;
    }

    public defineVariable(key: string, value: Primitive) {
        this.variables[key] = value;
    }

    private createVariables() {
        for(const [key, value] of Object.entries(this.variables)) {
            this.memory.createVariable(key, value);
        }
    }

    public preRun(): StructogramIssues[] {
        this.memory.clear();
        this.createVariables();
        const issues = Object.values(this.idMap).map(block => block.parseAndCheckForIssues()).flat();
        if(issues.length == 0) {
            this.ready = true;
        }
        return issues;
    }

    public runStep() {
        if(!this.ready) {
            throw new Error("Cannot run before doing the preRun and addressing its issues!");
        }

        if(this.currentBlock) {
            this.running = true;
            const lastBlock = this.currentBlock;
            this.currentBlock = this.currentBlock.run();
            if(lastBlock instanceof BracketBlock) {
                if(!(lastBlock as BracketBlock).isFinished()) {
                    this.bracketBlockStack.push(lastBlock);
                }
            }
        } else if(this.bracketBlockStack.length > 0) {
            this.currentBlock = this.bracketBlockStack.pop();
        } else {
            this.running = false;
            this.ready = false;
            this.currentBlock = this.startingBlock;
        }
    }

    public isRunning() {
        return this.running;
    }

    public addBlock(block: StructogramBlock) {
        if(this.isRunning()) throw new Error();
        this.idMap[block.id] = block;
    }

    public setStartingBlock(block: StructogramBlock) {
        if(this.isRunning()) throw new Error();
        this.startingBlock = block;
        this.currentBlock = block;
    }

    public print(text: string) {
        this.emitter.emit(Structogram.printEvent, text);
    }

    public createNumericStatement(statement: string) {
        return NumericStatement.parse(statement, this.memory);
    }

    public createStringStatement(statement: string) {
        return StringStatement.parse(statement, this.memory);
    }

    public createBooleanStatement(statement: string) {
        return BooleanStatement.parse(statement, this.memory);
    }

    public createAnyStatement(statement: string) {
        return AnyStatement.parse(statement, this.memory);
    }
}

export abstract class BlockOption implements TypeIdentifiable {
    protected readonly structogram: Structogram;
    public readonly name: string;
    public readonly description: string;
    public readonly emitter: EventEmitter2 = new EventEmitter2();
    public static readonly optionChangedEvent = "blockoption.optionchanged";

    constructor(structogram: Structogram, name: string, description: string) {
        this.structogram = structogram;
        this.name = name;
        this.description = description;
    }

    public abstract getTypeIdentifier(): string;
}

export class BooleanStatementListOption extends BlockOption {
    private statements: string[] = [];

    public constructor(structogram: Structogram, name: string, description: string) {
        super(structogram, name, description);
    }

    public override getTypeIdentifier(): string {
        return "booleanstatementlistoption";
    }

    public setStatements(statements: string[]) {
        this.statements = [...statements];
        this.emitter.emit(BlockOption.optionChangedEvent);
    }

    public getStatements() {
        return [...this.statements];
    }

    public tryResolveStatements(): (BooleanStatement)[] {
        return this.statements.map(s => this.structogram.createBooleanStatement(s));
    }

    public getConditionCount() {
        return this.statements.length;
    }
}

export abstract class StatementOption<T extends Primitive> extends BlockOption {
    protected statement: string = "";
    
    public setStatement(statement: string) {
        this.statement = statement;
        this.emitter.emit(BlockOption.optionChangedEvent);
    }

    public getStatement() {
        return this.statement;
    }

    public tryResolveStatement(): Statement<T> {
        throw new Error("Not implemented. Use one of the subclasses!");
    }
}

export class NumericStatementOption extends StatementOption<number> {
    public tryResolveStatement(): NumericStatement {
        return this.structogram.createNumericStatement(this.statement);
    }

    public getTypeIdentifier(): string {
        return "numericstatementoption";
    }
}

export class StringStatementOption extends StatementOption<string> {
    public tryResolveStatement(): StringStatement {
        return this.structogram.createStringStatement(this.statement);
    }

    public getTypeIdentifier(): string {
        return "stringstatementoption";
    }
}

export class BooleanStatementOption extends StatementOption<boolean> {
    public tryResolveStatement(): BooleanStatement {
        return this.structogram.createBooleanStatement(this.statement);
    }

    public getTypeIdentifier(): string {
        return "booleanstatementoption";
    }
}

export class AnyStatementOption extends StatementOption<Primitive> {
    public tryResolveStatement(): AnyStatement {
        return this.structogram.createAnyStatement(this.statement);
    }

    public getTypeIdentifier(): string {
        return "anystatementoption";
    }
}

export class KeyOption extends BlockOption {
    private value: string = "";

    public getValue() {
        return this.value;
    }

    public setValue(value: string) {
        this.value = value;
        this.emitter.emit(BlockOption.optionChangedEvent);
    }

    public override getTypeIdentifier(): string {
        return "keyoption";
    }
}

export abstract class StructogramBlock implements TypeIdentifiable {
    protected static idSeq = 0;
    public readonly id: string = `block${StructogramBlock.idSeq++}`;
    protected owner: Structogram;

    constructor(owner: Structogram) {
        this.owner = owner;
        owner.addBlock(this);
    }

    public abstract run(): StructogramBlock | undefined;
    public abstract getChildren(): (StructogramBlock | undefined)[];
    public abstract getOptions(): BlockOption[];
    public abstract getTypeIdentifier(): string;
    public abstract parseAndCheckForIssues(): StructogramIssues[];
}

export abstract class SequenceBlock extends StructogramBlock {
    public next: StructogramBlock | undefined;

    protected constructor(structogram: Structogram) {
        super(structogram);
    }

    public override getChildren(): (StructogramBlock | undefined)[] {
        return [this.next];
    }
}

export class AssignmentBlock extends SequenceBlock {
    private key: string | undefined;
    private statement: AnyStatement | undefined;
    public readonly keyOption = new KeyOption(this.owner, "key", "the key we assign the value to");
    public readonly statementOption = new AnyStatementOption(this.owner, "value", "the value to assign to the variable");

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public override run(): StructogramBlock | undefined {
        this.owner.memory.setVariable(this.key!, this.statement?.evaluate() ?? 0);
        return this.next;
    }

    public override getTypeIdentifier(): string {
        return "assignmentblock";
    }

    public override getOptions(): BlockOption[] {
        return [this.statementOption];
    }

    public override parseAndCheckForIssues(): StructogramIssues[] {
        this.key = this.keyOption.getValue();
        const issues = [];
        if(!this.owner.memory.hasVariable(this.key)) {
            issues.push(new StructogramIssues(this.id,`Variable with key [${this.key}] is not defined!`))
        }
        try {
            this.statement = this.statementOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                issues.push(new StructogramIssues(this.id, error.message));
            }
        }

        return issues;
    }
}

export class PrintBlock extends SequenceBlock {
    private statement: AnyStatement | undefined;
    public readonly statementOption = new AnyStatementOption(this.owner, "value", "the value to print");

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public override run(): StructogramBlock | undefined {
        this.owner.print(this.statement?.evaluate()?.toString() ?? "null");
        return this.next;
    }

    public override getTypeIdentifier(): string {
        return "printblock";
    }

    public override getOptions(): BlockOption[] {
        return [this.statementOption];
    }

    public override parseAndCheckForIssues(): StructogramIssues[] {
        try {
            this.statement = this.statementOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                return [new StructogramIssues(this.id, error.message)];
            }
        }

        return [];
    }
}

export abstract class BracketBlock extends StructogramBlock {
    abstract isFinished(): boolean;
}

export class TrueFalseBranchingBlock extends BracketBlock {
    private condition: BooleanStatement | undefined ;
    public trueBranch: StructogramBlock | undefined;
    public falseBranch: StructogramBlock | undefined;
    public next: StructogramBlock | undefined;
    public hasRun: boolean = false;
    public finished: boolean = false;
    public readonly conditionOption = new BooleanStatementOption(this.owner, "value", "the value to print");

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public override run(): StructogramBlock | undefined {
        if(this.hasRun) {
            this.finished = true;
            return this.next;
        }
        this.hasRun = true;
        if(this.condition?.evaluate()) {
            return this.trueBranch;
        }
        return this.falseBranch;
    }

    public override getChildren(): (StructogramBlock | undefined)[] {
        return [this.trueBranch, this.falseBranch];
    }

    public override getTypeIdentifier() {
        return "truefalsebranchingblock";
    }

    public override getOptions(): BlockOption[] {
        return [this.conditionOption];
    }

    public override parseAndCheckForIssues(): StructogramIssues[] {
        try {
            this.condition = this.conditionOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                return [new StructogramIssues(this.id, error.message)];
            }
        }

        this.hasRun = false;
        this.finished = false;

        return [];
    }

    public isFinished(): boolean {
        return this.finished;
    }
}

export class MultiBranchingBlock extends BracketBlock {
    private branches: BooleanStatement[] = [];
    private blocks: (StructogramBlock | undefined)[] = [];
    public next: StructogramBlock | undefined;
    public hasRun: boolean = false;
    public finished: boolean = false;
    public readonly conditionListOption = new BooleanStatementListOption(this.owner, "conditions", "the list of conditions the branches have");

    constructor(structogram: Structogram) {
        super(structogram);
        this.conditionListOption.emitter.addListener(BlockOption.optionChangedEvent, () => {
            this.blocks = Array.from(Array(this.conditionListOption.getConditionCount()).keys()).map(idx => idx in this.blocks ? this.blocks[idx] : undefined);
        })
    }

    public override run(): StructogramBlock | undefined {
        if(this.hasRun) {
            this.finished = true;
            return this.next;
        }
        this.hasRun = true;
        for(let i = 0; i < this.branches.length; i++) {
            if(this.branches[i]?.evaluate()) {
                return this.blocks[i];
            }
        }
        return undefined;
    }

    public override getChildren(): (StructogramBlock | undefined)[] {
        return this.blocks;
    }

    public override getTypeIdentifier() {
        return "multibranchingblock";
    }

    public override getOptions(): BlockOption[] {
        return [this.conditionListOption];
    }

    public setBranch(index: number, block: StructogramBlock) {
        // todo checks
        this.blocks[index] = block;
    }

    public override parseAndCheckForIssues(): StructogramIssues[] {
        try {
            this.branches = this.conditionListOption.tryResolveStatements();
        } catch (error) {
            if(error instanceof StatementParseError) {
                return [new StructogramIssues(this.id, error.message)];
            }
        }

        this.hasRun = false;
        this.finished = false;

        return [];
    }

    public override isFinished(): boolean {
        return this.finished;
    }
}

export abstract class LoopBlock extends BracketBlock {
    public firstBlock: StructogramBlock | undefined;
    public next: StructogramBlock | undefined;
    protected finished = false;

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public override getChildren(): (StructogramBlock | undefined)[] {
        return [this.next, this.firstBlock];
    }

    public isFinished() {
        return this.finished;
    }
}

export class CountingLoopBlock extends LoopBlock {
    private from: NumericStatement | undefined;
    private to: NumericStatement | undefined;
    private step: NumericStatement | undefined;
    private variableKey: string | undefined;
    private started: boolean = false;
    public readonly variableKeyOption: KeyOption = new KeyOption(this.owner, "variable key", "the key of the variable the loop will use to iterate with");
    public readonly fromOption: NumericStatementOption = new NumericStatementOption(this.owner, "from", "the number the calculation is starting from");
    public readonly toOption: NumericStatementOption = new NumericStatementOption(this.owner, "to", "the number the calculation is ending at");
    public readonly stepOption: NumericStatementOption = new NumericStatementOption(this.owner, "step", "the number the calculation is stepping with");

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public override run(): StructogramBlock | undefined {
        if(!this.started) {
            this.started = true;
            this.finished = false;
            this.owner.memory.setVariable(this.variableKey!, this.from?.evaluate() ?? 0);
            return this.firstBlock;
        } else if(this.owner.memory.getVariable(this.variableKey!) as number < (this.to?.evaluate() ?? 0)) {
            this.owner.memory.changeVariable(this.variableKey!, v => v as number + (this.step?.evaluate() ?? 0));
            return this.firstBlock;
        }
        this.finished = true;
        this.started = false;
        return this.next;
    }

    public override getOptions(): BlockOption[] {
        return [this.fromOption, this.toOption, this.stepOption];
    }

    public override getTypeIdentifier(): string {
        return "countingloopblock";
    }

    public override parseAndCheckForIssues(): StructogramIssues[] {
        const issues = [];
        try {
            this.from = this.fromOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                issues.push(new StructogramIssues(this.id, error.message));
            }
        }
        try {
            this.to = this.toOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                issues.push(new StructogramIssues(this.id, error.message));
            }
        }
        try {
            this.step = this.stepOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                issues.push(new StructogramIssues(this.id, error.message));
            }
        }
        this.variableKey = this.variableKeyOption.getValue();
        if(!this.owner.memory.hasVariable(this.variableKey)) {
            try {
                this.owner.memory.createVariable(this.variableKey, 0);
            } catch(error) {
                if(error instanceof VariableCreationError) {
                    issues.push(new StructogramIssues(this.id, error.message));
                }
            }
        }

        return [];
    }
}

export abstract class ConditionalLoopBlock extends LoopBlock {
    protected condition: BooleanStatement | undefined;
    public readonly conditionOption = new BooleanStatementOption(this.owner, "condition", "the condition of the loop");

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public override getOptions(): BlockOption[] {
        return [this.conditionOption];
    }

    public override parseAndCheckForIssues(): StructogramIssues[] {
        try {
            this.condition = this.conditionOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                return [new StructogramIssues(this.id, error.message)];
            }
        }

        return [];
    }
}

export class FrontTestingLoopBlock extends ConditionalLoopBlock {

    public override run(): StructogramBlock | undefined {
        if(this.condition?.evaluate()) {
            this.finished = false;
            return this.firstBlock;
        }
        this.finished = true;
        return this.next;
    }

    public override getTypeIdentifier(): string {
        return "fronttestingloopblock";
    }
}

export class BackTestingLoopBlock extends ConditionalLoopBlock {
    private started: boolean = false;

    public override run(): StructogramBlock | undefined {
        if(!this.started) {
            this.finished = false;
            this.started = true;
            return this.firstBlock;
        }
        if(this.condition?.evaluate()) {
            return this.firstBlock;
        }
        this.started = false;
        this.finished = true;
        return this.next;
    }

    public override getTypeIdentifier(): string {
        return "backtestingloopblock";
    }
}