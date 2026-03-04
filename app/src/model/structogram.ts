import EventEmitter2 from "eventemitter2";
import {Memory, VariableCreationError, type VariableType} from "./memory";
import {AnyStatement, BooleanStatement, NumericStatement, Statement, StringStatement, StatementParseError} from "./statement";
import {type Primitive} from "./util";

export interface TypeIdentifiable {
    getTypeIdentifier(): string;
}

export interface Identifiable {
    getID(): string;
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
    public static readonly changedEvent = "structogram.changed";
    public static readonly dataEvent = "structogram.data";
    public static readonly inputDataEvent = "structogram.data.input";
    public static readonly auxDataEvent = "structogram.data.aux";
    public static readonly outputDataEvent = "structogram.data.output";
    public static readonly dataClearEvent = "structogram.data.clear";
    public readonly memory: Memory;
    public readonly emitter: EventEmitter2;
    public startingBlock: StructogramBlock | undefined;
    private _currentBlock: StructogramBlock | undefined;
    private readonly idMap: Record<string, StructogramBlock> = {};
    private running = false;
    private bracketBlockStack: BracketBlock[] = [];
    private ready = false;
    private _inData: Record<string, VariableType> = {};
    private _auxData: Record<string, VariableType> = {};
    private _outData: Record<string, VariableType> = {};

    public get inputData() {
        return Object.entries(this._inData);
    }

    public get auxData() {
        return Object.entries(this._auxData);
    }

    public get outputData() {
        return Object.entries(this._outData);
    }

    constructor(emitter: EventEmitter2) {
        this.memory = new Memory();
        this.emitter = emitter;
    }

    public clearData() {
        this._inData = {};
        this._auxData = {};
        this._outData = {};
        this.emitter.emit(Structogram.dataClearEvent);
    }

    public defineInputData(key: string, type: VariableType) {
        this._inData[key] = type;
        this.emitter.emit(Structogram.inputDataEvent, key, type);
    }

    public defineAuxData(key: string, type: VariableType) {
        this._auxData[key] = type;
        this.emitter.emit(Structogram.auxDataEvent, key, type);
    }

    public defineOutputData(key: string, type: VariableType) {
        this._outData[key] = type;
        this.emitter.emit(Structogram.outputDataEvent, key, type);
    }

    public get currentBlock() {
        return this._currentBlock;
    }

    private set currentBlock(currentBlock: StructogramBlock | undefined) {
        this._currentBlock = currentBlock;
    }

    private createVariables(input: string[]) {
        if(input.length != this.inputData.length) {
            throw new Error("Missing inputs!");
        }
        for(let i = 0; i < input.length; i++) {
            const [key, type] = this.inputData[i]!;
            this.memory.createVariable(key, type, AnyStatement.parse(input[i]!, this.memory).evaluate());
        }
        for(const [key, type] of Object.entries(this._auxData)) {
            this.memory.createVariable(key, type);
        }
    }

    public preRun(input: string[]): StructogramIssues[] {
        this.memory.clear();
        this.createVariables(input);
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
            if(lastBlock instanceof BracketBlock && this.currentBlock != lastBlock) {
                if(!(lastBlock as BracketBlock).isFinished()) {
                    this.bracketBlockStack.push(lastBlock);
                }
            }
            if(!this.currentBlock) this.runStep();
        } else if(this.bracketBlockStack.length > 0) {
            this.currentBlock = this.bracketBlockStack.pop();
            if((this.currentBlock as BracketBlock).skipToNext()) {
                this.runStep();
            }
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
        this.emitter.emit(Structogram.changedEvent, block);
        block.emitter.addListener(StructogramBlock.childrenChanged, () => {
            this.emitter.emit(Structogram.changedEvent, block);
        });
    }

    public setStartingBlock(block: StructogramBlock | undefined) {
        if(this.isRunning()) throw new Error();
        this.startingBlock = block;
        this.currentBlock = block;
        if(block) block.isActive = true;
        this.emitter.emit(Structogram.changedEvent, block);
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
    public readonly emitter: EventEmitter2 = new EventEmitter2({"maxListeners": 100});
    public static readonly optionChangedEvent = "blockoption.optionchanged";

    constructor(structogram: Structogram, name: string, description: string) {
        this.structogram = structogram;
        this.name = name;
        this.description = description;
    }

    public abstract getTypeIdentifier(): string;
    public abstract getValue(): string[];
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

    public override getValue() {
        return [...this.statements];
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

    public abstract tryResolveStatement(): Statement<T>;

    public override getValue(): string[] {
        return [this.statement];
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

    public getKey() {
        return this.value;
    }

    public override getValue(): string[] {
        return [this.value];
    }

    public setValue(value: string) {
        this.value = value;
        this.emitter.emit(BlockOption.optionChangedEvent);
    }

    public override getTypeIdentifier(): string {
        return "keyoption";
    }
}

export abstract class StructogramBlock implements TypeIdentifiable, Identifiable {
    public static readonly childrenChanged = "structogramblock.childrenChanged";
    public static readonly activeStepChanged = "structogramblock.activeStepChanged";
    protected static idSeq = 0;
    public readonly id: string = `block${StructogramBlock.idSeq++}`;
    protected owner: Structogram;
    public parent: StructogramBlock | undefined;
    protected abstract subBlocks: Record<string, StructogramBlock | undefined>;
    private _next: StructogramBlock | undefined;
    public readonly emitter = new EventEmitter2();
    protected _activeStep: string = "ready";
    public _isActive: boolean = false;

    public get isActive() {
        return this._isActive;
    }

    public set isActive(isActive: boolean) {
        this._isActive = isActive;
        if(this._next) {
            this._next.isActive = isActive;
        }
    }

    public get activeStep() {
        return this._activeStep;
    }

    protected set activeStep(step: string) {
        this._activeStep = step;
        this.emitter.emit(StructogramBlock.activeStepChanged, step);
    }

    constructor(owner: Structogram) {
        this.owner = owner;
        owner.addBlock(this);
    }

    public get next() {
        return this._next;
    }

    public set next(next: StructogramBlock | undefined) {
        if(this._next && this.isActive) {
            this._next.isActive = false;
        }
        this._next = next;
        if(this._next) {
            this._next.isActive = this.isActive;
        }
        this.emitter.emit(StructogramBlock.childrenChanged, this);
    }

    public getID() {
        return this.id;
    }

    public getSubBlocks(): Record<string,StructogramBlock | undefined> {
        return this.subBlocks;
    }

    public setSubBlock(key: string, block: StructogramBlock | undefined) {
        this.subBlocks[key] = block;
        this.emitter.emit(StructogramBlock.childrenChanged, this);
    }

    public getSubBlock(key: string) {
        return this.subBlocks[key];
    }

    public abstract run(): StructogramBlock | undefined;
    public abstract getOptions(): BlockOption[];
    public abstract getTypeIdentifier(): string;
    public abstract parseAndCheckForIssues(): StructogramIssues[];
}

export abstract class SequenceBlock extends StructogramBlock {

    protected constructor(structogram: Structogram) {
        super(structogram);
    }
}

export class AssignmentBlock extends SequenceBlock {
    private key: string | undefined;
    private statement: AnyStatement | undefined;
    protected subBlocks: Record<string, StructogramBlock | undefined> = {};
    public readonly keyOption = new KeyOption(this.owner, "key", "the key we assign the value to");
    public readonly statementOption = new AnyStatementOption(this.owner, "value", "the value to assign to the variable");

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public override run(): StructogramBlock | undefined {
        this.activeStep = "main";
        this.owner.memory.setVariable(this.key!, this.statement?.evaluate() ?? 0);
        return this.next;
    }

    public override getTypeIdentifier(): string {
        return "assignmentblock";
    }

    public override getOptions(): BlockOption[] {
        return [this.keyOption, this.statementOption];
    }

    public override parseAndCheckForIssues(): StructogramIssues[] {
        this.key = this.keyOption.getKey();
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
    protected subBlocks: Record<string, StructogramBlock | undefined> = {};
    public readonly statementOption = new AnyStatementOption(this.owner, "value", "the value to print");

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public override run(): StructogramBlock | undefined {
        this.activeStep = "main";
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
    abstract skipToNext(): boolean;
}

type TrueFalseBranchingBlockStates = "ready" | "hasRun" | "finished" 

export class TrueFalseBranchingBlock extends BracketBlock {
    private condition: BooleanStatement | undefined ;
    protected subBlocks: Record<string, StructogramBlock | undefined> = {
        "true": undefined,
        "false": undefined
    };
    public state: TrueFalseBranchingBlockStates = "ready";
    public readonly conditionOption = new BooleanStatementOption(this.owner, "condition", "the condition");

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public override run(): StructogramBlock | undefined {
        this.activeStep = "main";
        if(this.state == "hasRun") {
            this.state = "finished"
            return this.next;
        }
        this.state = "hasRun";
        if(this.condition?.evaluate()) {
            return this.trueBranch;
        }
        return this.falseBranch;
    }

    public override skipToNext(): boolean {
        return true;
    }

    public get trueBranch() {
        return this.subBlocks["true"];
    }

    public set trueBranch(block: StructogramBlock | undefined) {
        this.subBlocks["true"] = block;
    }

    public get falseBranch() {
        return this.subBlocks["false"];
    }

    public set falseBranch(block: StructogramBlock | undefined) {
        this.subBlocks["false"] = block;
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

        this.state = "ready";

        return [];
    }

    public isFinished(): boolean {
        return this.state == "finished";
    }
}

export class MultiBranchingBlock extends BracketBlock {
    private branches: BooleanStatement[] = [];
    public foundBranch: boolean = false;
    public finished: boolean = false;
    protected subBlocks: Record<string, StructogramBlock | undefined> = {};
    protected branchIndex = 0;
    public readonly conditionListOption = new BooleanStatementListOption(this.owner, "conditions", "the list of conditions the branches have");

    private fillOutBranches() {
        const statements = this.conditionListOption.getStatements();
        const statementCount = statements.length;
        for(let i = 0; i < statementCount; i++) {
            if(!("branch"+i in this.subBlocks)) {
                this.subBlocks["branch"+i] = undefined;
                this.emitter.emit(StructogramBlock.childrenChanged);
            }
        }
    }

    private trimBranches() {
        const statementCount = this.conditionListOption.getStatements().length;
        const branchCount = Object.values(this.subBlocks).length;
        if(branchCount > statementCount) {
            for(let i = statementCount; i < branchCount; i++) {
                if("branch"+i in this.subBlocks) {
                    delete this.subBlocks["branch"+i];
                    this.emitter.emit(StructogramBlock.childrenChanged);
                }
            }
        }
    }

    constructor(structogram: Structogram) {
        super(structogram);
        this.conditionListOption.emitter.on(BlockOption.optionChangedEvent, () => {
            this.fillOutBranches();
            this.trimBranches();
        });
    }

    // TODO else branch
    public override run(): StructogramBlock | undefined {
        if(this.foundBranch) {
            this.finished = true;
            return this.next;
        }
        if(this.branchIndex in this.branches) {
            this.activeStep = `branch${this.branchIndex}`;
            if(this.branches[this.branchIndex]!.evaluate()) {
                this.foundBranch = true;
                return Object.values(this.subBlocks)[this.branchIndex];
            } else {
                this.branchIndex++;
                return this;
            }
        }
        return undefined;
    }

    public override getTypeIdentifier() {
        return "multibranchingblock";
    }

    public override getOptions(): BlockOption[] {
        return [this.conditionListOption];
    }

    public setBranch(index: number, block: StructogramBlock) {
        // todo checks
        this.subBlocks["branch"+index] = block;
    }

    public override parseAndCheckForIssues(): StructogramIssues[] {
        try {
            this.branches = this.conditionListOption.tryResolveStatements();
        } catch (error) {
            if(error instanceof StatementParseError) {
                return [new StructogramIssues(this.id, error.message)];
            }
        }

        this.branchIndex = 0;
        this.foundBranch = false;
        this.finished = false;

        return [];
    }

    public override isFinished(): boolean {
        return this.finished;
    }

    public override skipToNext(): boolean {
        return this.foundBranch;
    }
}

export abstract class LoopBlock extends BracketBlock {
    protected subBlocks: Record<string, StructogramBlock | undefined> = {
        "loopStart": undefined
    };
    protected finished = false;

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public get loopStart() {
        return this.subBlocks["loopStart"];
    }

    public set loopStart(block: StructogramBlock | undefined) {
        this.subBlocks["loopStart"] = block;
    }

    public isFinished() {
        return this.finished;
    }

    public override skipToNext(): boolean {
        return false;
    }
}

export class CountingLoopBlock extends LoopBlock {
    private from: NumericStatement | undefined;
    private to: NumericStatement | undefined;
    private step: NumericStatement | undefined;
    private variableKey: string | undefined;
    private started: boolean = false;
    private checkedCondition = false;
    public readonly variableKeyOption: KeyOption = new KeyOption(this.owner, "key", "the key of the variable the loop will use to iterate with");
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
            this.activeStep = "init";
            this.owner.memory.setVariable(this.variableKey!, this.from?.evaluate() ?? 0);
            return this.loopStart;
        } else if(!this.checkedCondition) {
            this.activeStep = "condition";
            this.checkedCondition = this.owner.memory.getVariable(this.variableKey!) as number < (this.to?.evaluate() ?? 0);
            if(this.checkedCondition) {
                return this;
            }
        } else {
            this.activeStep = "increment";
            this.checkedCondition = false;
            this.owner.memory.changeVariable(this.variableKey!, v => v as number + (this.step?.evaluate() ?? 0));
            return this.loopStart;
        }
        this.finished = true;
        this.started = false;
        return this.next;
    }

    public override getOptions(): BlockOption[] {
        return [this.variableKeyOption, this.fromOption, this.toOption, this.stepOption];
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
        this.variableKey = this.variableKeyOption.getKey();
        if(!this.owner.memory.hasVariable(this.variableKey)) {
            issues.push(new StructogramIssues(this.id,`Variable with key [${this.variableKey}] is not defined!`))
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
        this.activeStep = "main";
        if(this.condition?.evaluate()) {
            this.finished = false;
            return this.loopStart;
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
        this.activeStep = "main";
        if(!this.started) {
            this.finished = false;
            this.started = true;
            return this.loopStart;
        }
        if(this.condition?.evaluate()) {
            return this.loopStart;
        }
        this.started = false;
        this.finished = true;
        return this.next;
    }

    public override getTypeIdentifier(): string {
        return "backtestingloopblock";
    }
}