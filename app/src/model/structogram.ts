import EventEmitter2 from "eventemitter2";
import {Memory, type VariableType} from "./memory";
import {AnyStatement, BooleanStatement, NumericStatement, Statement, CharStatement, StatementParseError} from "./statement";


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
    /**
     * Emitted when something prints on the structogram. 
     * Has a string argument which is the message printed.
     */
    public static readonly printEvent = "structogram.print";

    /**
     * Emitted when the structogram structure is changed.
     */
    public static readonly changedEvent = "structogram.changed";

    /**
     * Emitted when an input is specified.
     * Has 2 string arguments. The first one is the name and the second one is the type.
     */
    public static readonly inputSpecificationEvent = "structogram.specification.input";

    /**
     * Emitted when an auxiliary is specified.
     * Has 2 string arguments. The first one is the name and the second one is the type.
     */
    public static readonly auxSpecificationEvent = "structogram.specification.aux";

    /**
     * Emitted when an output is specified.
     * Has 2 string arguments. The first one is the name and the second one is the type.
     */
    public static readonly outputSpecificationEvent = "structogram.specification.output";
    
    /**
     * Emitted when the specification is cleared.
     */
    public static readonly specificationClearEvent = "structogram.specification.clear";

    public readonly memory: Memory;
    public readonly emitter: EventEmitter2;
    private _startingBlock: StructogramBlock | undefined;
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
        this.emitter.emit(Structogram.specificationClearEvent);
    }

    public defineInputData(key: string, type: VariableType) {
        this._inData[key] = type;
        this.emitter.emit(Structogram.inputSpecificationEvent, key, type);
    }

    public defineAuxData(key: string, type: VariableType) {
        this._auxData[key] = type;
        this.emitter.emit(Structogram.auxSpecificationEvent, key, type);
    }

    public defineOutputData(key: string, type: VariableType) {
        this._outData[key] = type;
        this.emitter.emit(Structogram.outputSpecificationEvent, key, type);
    }

    public get currentBlock() {
        return this._currentBlock;
    }

    private set currentBlock(currentBlock: StructogramBlock | undefined) {
        this._currentBlock = currentBlock;
    }

    private createVariables(input: string[]): StructogramIssues[] {
        const issues = [];
        if(input.length != this.inputData.length) {
            return [new StructogramIssues("specification", "Missing inputs!")]
        }
        const usedKeys = new Set<string>();
        for(let i = 0; i < input.length; i++) {
            const [key, type] = this.inputData[i]!;
            if(usedKeys.has(key)) {
                return [new StructogramIssues("specification", "Duplicate key in data specification is not allowed!")]
            }
            usedKeys.add(key);
            try {
                const statement = AnyStatement.parse(input[i]!, this.memory);
                if(statement.getReturnType() != type) {
                    issues.push(new StructogramIssues("specification", "Wrong type returned by statement given to input data!"));
                } else {
                    this.memory.createVariable(key, type, statement.evaluate(), true);
                }
            } catch (error) {
                if(error instanceof StatementParseError) {
                    issues.push(new StructogramIssues("specification", error.message));
                }
            }
        }
        for(const [key, type] of Object.entries(this._auxData)) {
            if(usedKeys.has(key)) {
                return [new StructogramIssues("specification", "Duplicate key in data specification is not allowed!")]
            }
            usedKeys.add(key);
            this.memory.createVariable(key, type);
        }
        for(const [key, type] of Object.entries(this._outData)) {
            if(usedKeys.has(key)) {
                return [new StructogramIssues("specification", "Duplicate key in data specification is not allowed!")]
            }
            usedKeys.add(key);
            this.memory.createVariable(key, type);
        }
        return issues;
    }

    public preRun(input: string[] = []): StructogramIssues[] {
        this.memory.clear();
        const issues = this.createVariables(input);
        issues.push(...Object.values(this.idMap).map(block => block.parseAndCheckForIssues()).flat());
        if(issues.length == 0) {
            this.ready = true;
        }
        return issues;
    }

    public runStep(): void {
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
            if(!this.currentBlock) return this.runStep();
        } else if(this.bracketBlockStack.length > 0) {
            this.currentBlock = this.bracketBlockStack.pop();
            if((this.currentBlock as BracketBlock).skipToNext()) {
                this.runStep();
            }
        } else {
            this.restart();
        }
    }

    public getResults() {
        const results = [] as [string, MemoryType][];
        for(const [key, _] of this.outputData) {
            results.push([key, this.memory.getVariable(key)]);
        }
        return results;
    }

    public isRunning() {
        return this.running;
    }

    public addBlock(block: StructogramBlock, supressEvent: boolean = false) {
        if(this.isRunning()) throw new Error("Cannot add block while structogram is running!");
        this.idMap[block.id] = block;
        let child = block.next;
        while(child) {
            this.addBlock(child, true);
            child = child.next;
        }
        if(!supressEvent) this.emitter.emit(Structogram.changedEvent, block);
        block.emitter.addListener(StructogramBlock.childrenChanged, () => {
            this.emitter.emit(Structogram.changedEvent, block);
        });
    }

    public removeBlock(block: StructogramBlock, supressEvent: boolean = false) {
        if(this.isRunning()) throw new Error("Cannot remove block while structogram is running!");
        delete this.idMap[block.id];
        for(const subBlock of Object.values(block.getSubBlocks())) {
            if(subBlock) {
                this.removeBlock(subBlock, true);
            }
        }
        let child = block.next;
        while(child) {
            this.removeBlock(child, true);
            child = child.next;
        }
        if(!supressEvent) this.emitter.emit(Structogram.changedEvent, block);
        block.emitter.removeAllListeners(StructogramBlock.childrenChanged);
    }

    public getIndependentRootBlocks(): StructogramBlock[] {
        return Object.values(this.idMap).filter(b => !b.parent && this.startingBlock != b && !b.superBlock);
    }

    public clearBlocks() {
        for(const block of this.getIndependentRootBlocks()) {
            this.removeBlock(block);
        }
    }

    public set startingBlock(block: StructogramBlock | undefined) {
        if(this.isRunning()) throw new Error("Cannot change starting block while structogram is running!");
        if(block?.superBlock) {
            throw new Error("Cannot set subblock as starting block!");
        }
        if(block?.parent) {
            throw new Error("Cannot set child block as starting block!");
        }
        this._startingBlock = block;
        this.currentBlock = block;
        this.emitter.emit(Structogram.changedEvent, block);
    }

    public get startingBlock() {
        return this._startingBlock;
    }

    public getData() {
        return {
            "input": this.inputData.map(data => {
                return {"key": data[0], "type": data[1]}
            }),
            "auxiliary": this.auxData.map(data => {
                return {"key": data[0], "type": data[1]}
            }),
            "output": this.outputData.map(data => {
                return {"key": data[0], "type": data[1]}
            }),
            "startingBlock": this.startingBlock?.getData()
        }   
    }

    public loadData(data: any) {
        this.reset();
        const input = data["input"];
        const aux = data["auxiliary"];
        const output = data["output"];
        
        function loadWith(entries: any, loader:(a: string, type: VariableType) => void) {
            for(const entry of entries) loader(entry["key"], entry["type"]);
        }

        loadWith(input, (key, type) => this.defineInputData(key, type));
        loadWith(aux, (key, type) => this.defineAuxData(key, type));
        loadWith(output, (key, type) => this.defineOutputData(key, type));
        if("startingBlock" in data) this.startingBlock = StructogramBlock.BlockDataFactory.constructFromData(data["startingBlock"], this);
    }

    public restart() {
        this.running = false;
        this.ready = false;
        this.bracketBlockStack = [];
        this.currentBlock = this.startingBlock;
    }

    public reset() {
        this.restart();
        this.clearData();
        this.startingBlock = undefined;
        this.clearBlocks();
    }

    public print(text: string) {
        this.emitter.emit(Structogram.printEvent, text);
    }

    public createNumericStatement(statement: string) {
        return NumericStatement.parse(statement, this.memory);
    }

    public createStringStatement(statement: string) {
        return CharStatement.parse(statement, this.memory);
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
    public abstract getRawValues(): string[];
    public abstract setRawValues(data: string[]): void;
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

    public override getRawValues() {
        return [...this.statements];
    }

    public override setRawValues(data: string[]): void {
        this.statements = data;
        this.emitter.emit(BlockOption.optionChangedEvent);
    }
}

export abstract class StatementOption<T> extends BlockOption {
    protected statement: string = "";
    
    public setStatement(statement: string) {
        this.statement = statement;
        this.emitter.emit(BlockOption.optionChangedEvent);
    }

    public getStatement() {
        return this.statement;
    }

    public abstract tryResolveStatement(): Statement<T>;

    public override getRawValues(): string[] {
        return [this.statement];
    }

    public setRawValues(data: string[]): void {
        this.statement = data[0]!;
        this.emitter.emit(BlockOption.optionChangedEvent);
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
    public tryResolveStatement(): CharStatement {
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

export class AnyStatementOption extends StatementOption<MemoryType> {
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

    public override getRawValues(): string[] {
        return [this.value];
    }

    public setKey(value: string) {
        this.value = value;
        this.emitter.emit(BlockOption.optionChangedEvent);
    }

    public override setRawValues(data: string[]): void {
        this.value = data[0]!;
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
    protected _associatedStructogram: Structogram;
    private _parent: StructogramBlock | undefined;
    protected _superBlock: StructogramBlock | undefined;
    protected _subBlockKey: string | undefined;
    protected abstract subBlocks: Record<string, StructogramBlock | undefined>;
    private _next: StructogramBlock | undefined;
    public readonly emitter = new EventEmitter2();
    protected _activeStep: string = "ready";

    public get associatedStructogram() {
        return this._associatedStructogram;
    }
    
    public get activeStep() {
        return this._activeStep;
    }

    protected set activeStep(step: string) {
        this._activeStep = step;
        this.emitter.emit(StructogramBlock.activeStepChanged, step);
    }

    constructor(owner: Structogram) {
        this._associatedStructogram = owner;
        owner.addBlock(this);
    }

    public get next() {
        return this._next;
    }

    public set next(next: StructogramBlock | undefined) {
        if(this._next) {
            this._next.parent = undefined;
        }
        this._next = next;
        if(this._next) {
            this._next.parent = this;
        }
        this.emitter.emit(StructogramBlock.childrenChanged, this);
    }

    public get parent() {
        return this._parent;
    }

    protected set parent(parent: StructogramBlock | undefined) {
        this._parent = parent;
    }

    public getID() {
        return this.id;
    }

    public get superBlock() {
        return this._superBlock;
    }

    protected set superBlock(block: StructogramBlock | undefined) {
        this._superBlock = block;
    }

    public get subBlockKey() {
        return this._subBlockKey;
    }

    protected set subBlockKey(key: string | undefined) {
        this._subBlockKey = key;
    }

    public getSubBlocks(): Record<string,StructogramBlock | undefined> {
        return this.subBlocks;
    }

    public setSubBlock(key: string, block: StructogramBlock | undefined) {
        if(block) {
            if(block.parent) {
                throw new Error("Child block cannot become a subblock!");
            }
            if(this._associatedStructogram.startingBlock == block || block._associatedStructogram.startingBlock == block) {
                throw new Error("Starting block cannot become a subblock!");
            }
        }
        if(this.subBlocks[key]) {
            this.subBlocks[key].superBlock = undefined;
            this.subBlocks[key].subBlockKey = undefined;
        }
        this.subBlocks[key] = block;
        if(block) {
            block.superBlock = this;
            block.subBlockKey = key;
        }
        this.emitter.emit(StructogramBlock.childrenChanged, this);
    }

    public getSubBlock(key: string) {
        return this.subBlocks[key];
    }

    public abstract run(): StructogramBlock | undefined;
    public abstract getOptions(): BlockOption[];
    public abstract getTypeIdentifier(): string;
    public abstract parseAndCheckForIssues(): StructogramIssues[];

    public getData(): any {
        return {
            "type": this.getTypeIdentifier(),
            "next": this.next?.getData(),
            "subBlocks": Object.entries(this.subBlocks).map(entry => {
                return {"key": entry[0], "block": entry[1]?.getData()};
            }),
            "options": this.getOptions().map(option => {
                return {"name": option.name, "value": option.getRawValues()};
            })
        };
    }

    public static BlockDataFactory = class {
        public static readonly typeToFactory: Record<string, (s: Structogram) => StructogramBlock> = {
            "assignmentblock": (s) => new AssignmentBlock(s),
            "printblock": (s) => new PrintBlock(s),
            "truefalsebranchingblock": (s) => new TrueFalseBranchingBlock(s),
            "multibranchingblock": (s) => new MultiBranchingBlock(s),
            "countingloopblock": (s) => new CountingLoopBlock(s),
            "fronttestingloopblock": (s) => new FrontTestingLoopBlock(s),
            "backtestingloopblock": (s) => new BackTestingLoopBlock(s),
        }

        public static constructFromData(data: any, structogram: Structogram): StructogramBlock {
            const block = this.typeToFactory[data["type"]]!(structogram);
            const optionsData = data["options"];
            for(const option of block.getOptions()) {
                for(const optionData of optionsData) {
                    if(option.name == optionData["name"]) {
                        option.setRawValues(optionData["value"]);
                        break;
                    }
                }
            }
            const nextData = data["next"];
            if(nextData) {
                block.next = this.constructFromData(nextData, structogram);
            }
            const subBlocksData = data["subBlocks"];
            for(const subBlockData of subBlocksData) {
                let subBlock = undefined;
                if(subBlockData["block"]) {
                    subBlock = this.constructFromData(subBlockData["block"], structogram);
                }
                block.setSubBlock(subBlockData["key"], subBlock);
            }
            return block;
        }
    }
}

export abstract class SequenceBlock extends StructogramBlock {

    protected subBlocks: Record<string, StructogramBlock | undefined> = {};

    protected constructor(structogram: Structogram) {
        super(structogram);
    }
}

export class AssignmentBlock extends SequenceBlock {
    private key: string | undefined;
    private statement: AnyStatement | undefined;
    public readonly keyOption = new KeyOption(this._associatedStructogram, "key", "the key we assign the value to");
    public readonly statementOption = new AnyStatementOption(this._associatedStructogram, "value", "the value to assign to the variable");

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public override run(): StructogramBlock | undefined {
        this.activeStep = "main";
        this._associatedStructogram.memory.setVariable(this.key!, this.statement?.evaluate() ?? 0);
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
        try {
            this.statement = this.statementOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                issues.push(new StructogramIssues(this.id, error.message));
            }
        }
        if(!this._associatedStructogram.memory.hasVariable(this.key)) {
            issues.push(new StructogramIssues(this.id, `Variable with key [${this.key}] is not defined!`));
        } else if(this._associatedStructogram.memory.getType(this.key) != this.statement?.getReturnType()) {
            issues.push(new StructogramIssues(this.id, `Block violates the type restrictions of the variable with key [${this.key}]!`));
        } else if(this._associatedStructogram.memory.isConstant(this.key)) {
            issues.push(new StructogramIssues(this.id, `Block tries to assign [${this.key}] which is a constant variable!`));
        }
        return issues;
    }
}

export class PrintBlock extends SequenceBlock {
    private statement: AnyStatement | undefined;
    public readonly statementOption = new AnyStatementOption(this._associatedStructogram, "value", "the value to print");

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public override run(): StructogramBlock | undefined {
        this.activeStep = "main";
        this._associatedStructogram.print(this.statement?.evaluate()?.toString() ?? "null");
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
    public readonly conditionOption = new BooleanStatementOption(this._associatedStructogram, "condition", "the condition");

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
    private foundBranch: boolean = false;
    private finished: boolean = false;
    protected subBlocks: Record<string, StructogramBlock | undefined> = {};
    protected branchIndex = 0;
    public readonly conditionListOption = new BooleanStatementListOption(this._associatedStructogram, "conditions", "the list of conditions the branches have");

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
    public readonly variableKeyOption: KeyOption = new KeyOption(this._associatedStructogram, "key", "the key of the variable the loop will use to iterate with");
    public readonly fromOption: NumericStatementOption = new NumericStatementOption(this._associatedStructogram, "from", "the number the calculation is starting from");
    public readonly toOption: NumericStatementOption = new NumericStatementOption(this._associatedStructogram, "to", "the number the calculation is ending at");
    public readonly stepOption: NumericStatementOption = new NumericStatementOption(this._associatedStructogram, "step", "the number the calculation is stepping with");

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public override run(): StructogramBlock | undefined {
        if(!this.started) {
            this.started = true;
            this.finished = false;
            this.activeStep = "init";
            this._associatedStructogram.memory.setVariable(this.variableKey!, this.from?.evaluate() ?? 0);
            return this;
        } else if(!this.checkedCondition) {
            const lastStep = this.activeStep;
            this.activeStep = "condition";
            this.checkedCondition = this._associatedStructogram.memory.getVariable(this.variableKey!) as number < (this.to?.evaluate() ?? 0);
            if(this.checkedCondition) {
                if(lastStep == "init") {
                    this.checkedCondition = false;
                    return this.loopStart;
                }
                return this;
            }
        } else {
            this.activeStep = "increment";
            this.checkedCondition = false;
            this._associatedStructogram.memory.changeVariable(this.variableKey!, v => v as number + (this.step?.evaluate() ?? 0));
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
        if(!this._associatedStructogram.memory.hasVariable(this.variableKey)) {
            issues.push(new StructogramIssues(this.id,`Variable with key [${this.variableKey}] is not defined!`))
        } else if(this._associatedStructogram.memory.getType(this.variableKey) != "number") {
            issues.push(new StructogramIssues(this.id, `Block violates the type restrictions of the variable with key [${this.variableKey}]!`));
        } else if (this._associatedStructogram.memory.isConstant(this.variableKey)) {
            issues.push(new StructogramIssues(this.id, `Block tries to assign [${this.variableKey}] which is a constant variable!`));
        }

        return issues;
    }
}

export abstract class ConditionalLoopBlock extends LoopBlock {
    protected condition: BooleanStatement | undefined;
    public readonly conditionOption = new BooleanStatementOption(this._associatedStructogram, "condition", "the condition of the loop");

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