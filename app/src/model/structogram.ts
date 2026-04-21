import EventEmitter2 from "eventemitter2";
import {Memory, VariableCreationError} from "./memory";
import {AnyStatement, BooleanStatement, NumericStatement, Statement, StatementParseError, StringStatement, IndexResolver} from "./statement";
import { numberType, SimpleValue, parseType, undefinedType, UtilityArray, type ClassIdentifiable, type Value, type ValueType, ObjectType, UtilityObject, ArrayType } from "./types";


export interface Identifiable {
    get id(): string;
}

export class StructogramIssue {
    public readonly id: string;
    public readonly issueID: string;

    /**
     * @param _message Unused parameter used for documentation purposes
     */
    constructor(id: string, _message: string, issueID: string) {
        this.id = id;
        this.issueID = issueID;
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
     * Its arguments are: key: string, type: ValueType
     */
    public static readonly inputSpecificationEvent = "structogram.specification.input";

    /**
     * Emitted when an auxiliary is specified.
     * Its arguments are: key: string, type: ValueType
     */
    public static readonly auxSpecificationEvent = "structogram.specification.aux";

    /**
     * Emitted when an output is specified.
     * Its arguments are: key: string, type: ValueType
     */
    public static readonly outputSpecificationEvent = "structogram.specification.output";
    
    /**
     * Emitted when the specification is cleared.
     */
    public static readonly specificationClearEvent = "structogram.specification.clear";
    
    /**
     * Emitted when the issues change.
     * Its argument are: lastIssues: StructogramIssues[], currentIssues: StructogramIssues[]
     */
    public static readonly issuesChangedEvent = "structogram.issues.changes";

    public readonly memory: Memory;
    public readonly emitter: EventEmitter2;
    private _startingBlock: StructogramBlock | undefined;
    private _currentBlock: StructogramBlock | undefined;
    private readonly idMap: Record<string, StructogramBlock> = {};
    private _running = false;
    private bracketBlockStack: BracketBlock[] = [];
    private ready = false;
    private _inData: Record<string, ValueType> = {};
    private _auxData: Record<string, ValueType> = {};
    private _outData: Record<string, ValueType> = {};
    private currentIssues: StructogramIssue[] = [];
    private _indexResolver = new IndexResolver(0);

    public get inputData() {
        return Object.entries(this._inData);
    }

    public get auxData() {
        return Object.entries(this._auxData);
    }

    public get outputData() {
        return Object.entries(this._outData);
    }

    public get issues() {
        return [...this.currentIssues];
    }

    public set startingIndex(index: number) {
        this._indexResolver = new IndexResolver(index);
    }

    public get startingIndex(): number {
        return this._indexResolver.startIndex;
    }

    public get indexResolver() {
        return this._indexResolver;
    }

    public get running() {
        return this._running;
    }

    private set running(value: boolean) {
        this._running = value;
    }

    private set issues(issues: StructogramIssue[]) {
        const lastIssues = this.issues;
        this.currentIssues = issues;
        const currentIssues = this.issues;
        this.emitter.emit(Structogram.issuesChangedEvent, lastIssues, currentIssues);
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

    public declareInputData(key: string, type: ValueType) {
        this._inData[key] = type;
        this.emitter.emit(Structogram.inputSpecificationEvent, key, type);
    }

    public declareAuxData(key: string, type: ValueType) {
        this._auxData[key] = type;
        this.emitter.emit(Structogram.auxSpecificationEvent, key, type);
    }

    public declareOutputData(key: string, type: ValueType) {
        this._outData[key] = type;
        this.emitter.emit(Structogram.outputSpecificationEvent, key, type);
    }

    public get currentBlock() {
        return this._currentBlock;
    }

    private set currentBlock(currentBlock: StructogramBlock | undefined) {
        this._currentBlock = currentBlock;
    }

    private createVariables(input: Record<string, string>): StructogramIssue[] {
        const issues = [];
        if(Object.entries(input).length != this.inputData.length) {
            return [new StructogramIssue("specification", "Missing inputs!", "error_specification_input_missing")]
        }
        const usedKeys = new Set<string>();
        for(let i = 0; i < this.inputData.length; i++) {
            const [key, type] = this.inputData[i]!;
            if(usedKeys.has(key)) {
                return [new StructogramIssue("specification", "Duplicate key in data specification is not allowed!", "error_specification_duplicate")]
            }
            usedKeys.add(key);
            try {
                const statement = AnyStatement.parse(input[key]!, this.memory, this.indexResolver);
                if(!type.matches(statement.returnType)) {
                    issues.push(new StructogramIssue("specification", "Wrong type returned by statement given to input data!", "error_specification_input_type"));
                } else {
                    this.memory.createVariable(key, type, true);
                    this.memory.setVariable(key, statement.evaluate());
                }
            } catch (error) {
                if(error instanceof StatementParseError) {
                    issues.push(new StructogramIssue("specification", error.message, error.translationKey));
                } else if(error instanceof VariableCreationError) {
                    issues.push(new StructogramIssue("specification", error.message, error.translationKey));
                }
            }
        }
        for(const [key, type] of Object.entries(this._auxData)) {
            if(usedKeys.has(key)) {
                return [new StructogramIssue("specification", "Duplicate key in data specification is not allowed!", "error_specification_duplicate")]
            }
            usedKeys.add(key);
            try {
                this.memory.createVariable(key, type);
            } catch (error) {
                if(error instanceof VariableCreationError) {
                    issues.push(new StructogramIssue("specification", error.message, error.translationKey));
                }
            }
        }
        for(const [key, type] of Object.entries(this._outData)) {
            if(usedKeys.has(key)) {
                return [new StructogramIssue("specification", "Duplicate key in data specification is not allowed!", "error_specification_duplicate")]
            }
            usedKeys.add(key);
            try {
                this.memory.createVariable(key, type);
            } catch (error) {
                if(error instanceof VariableCreationError) {
                    issues.push(new StructogramIssue("specification", error.message, error.translationKey));
                }
            }
        }
        return issues;
    }

    public preRun(input: Record<string, string> = {}): StructogramIssue[] {
        this.memory.clear();
        const issues = this.createVariables(input);
        issues.push(...Object.values(this.idMap).map(block => block.parseAndCheckForIssues()).flat());
        if(issues.length == 0) {
            this.ready = true;
        }
        this.issues = issues;
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
        const results = [] as [string, Value][];
        for(const [key, _] of this.outputData) {
            results.push([key, this.memory.getVariable(key)]);
        }
        return results;
    }

    public addBlock(block: StructogramBlock, supressEvent: boolean = false) {
        if(this.running) throw new Error("Cannot add block while structogram is running!");
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
        if(this.running) throw new Error("Cannot remove block while structogram is running!");
        delete this.idMap[block.id];
        for(const [_key, subBlock] of block.getOrderedSubBlocks()) {
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

    /**
     * @returns every block without a parent
     */
    public getIndependentRootBlocks(): StructogramBlock[] {
        return Object.values(this.idMap).filter(b => !b.parent && this.startingBlock != b && !b.superBlock);
    }

    public clearBlocks() {
        for(const block of this.getIndependentRootBlocks()) {
            this.removeBlock(block);
        }
    }

    public set startingBlock(block: StructogramBlock | undefined) {
        if(this.running) throw new Error("Cannot change starting block while structogram is running!");
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
                return {"key": data[0], "type": data[1].id}
            }),
            "auxiliary": this.auxData.map(data => {
                return {"key": data[0], "type": data[1].id}
            }),
            "output": this.outputData.map(data => {
                return {"key": data[0], "type": data[1].id}
            }),
            "startingBlock": this.startingBlock?.getData(),
            "startingIndex": this.startingIndex
        }   
    }

    public loadData(data: any) {
        this.reset();
        const input = data["input"];
        const aux = data["auxiliary"];
        const output = data["output"];
        
        

        function loadWith(entries: any, loader:(a: string, type: ValueType) => void) {
            for(const entry of entries) loader(entry["key"], parseType(entry["type"]));
        }

        loadWith(input, (key, type) => this.declareInputData(key, type));
        loadWith(aux, (key, type) => this.declareAuxData(key, type));
        loadWith(output, (key, type) => this.declareOutputData(key, type));
        if("startingBlock" in data) this.startingBlock = StructogramBlock.BlockDataFactory.constructFromData(data["startingBlock"], this);
        if("startingIndex" in data) this.startingIndex = data["startingIndex"];
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
        return NumericStatement.parse(statement, this.memory, this.indexResolver);
    }

    public createStringStatement(statement: string) {
        return StringStatement.parse(statement, this.memory, this.indexResolver);
    }

    public createBooleanStatement(statement: string) {
        return BooleanStatement.parse(statement, this.memory, this.indexResolver);
    }

    public createAnyStatement(statement: string) {
        return AnyStatement.parse(statement, this.memory, this.indexResolver);
    }
}

export abstract class BlockOption implements ClassIdentifiable {
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

    public abstract get classIdentifier(): string;
    public abstract getRawValues(): string[];
    public abstract setRawValues(data: string[]): void;
}

export class BooleanStatementListOption extends BlockOption {
    private statements: string[] = [];

    public constructor(structogram: Structogram, name: string, description: string) {
        super(structogram, name, description);
    }

    public override get classIdentifier(): string {
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

    public get classIdentifier(): string {
        return "numericstatementoption";
    }
}

export class StringStatementOption extends StatementOption<string> {
    public tryResolveStatement(): StringStatement {
        return this.structogram.createStringStatement(this.statement);
    }

    public get classIdentifier(): string {
        return "stringstatementoption";
    }
}

export class BooleanStatementOption extends StatementOption<boolean> {
    public tryResolveStatement(): BooleanStatement {
        return this.structogram.createBooleanStatement(this.statement);
    }

    public get classIdentifier(): string {
        return "booleanstatementoption";
    }
}

export class AnyStatementOption extends StatementOption<Value> {
    public tryResolveStatement(): AnyStatement {
        return this.structogram.createAnyStatement(this.statement);
    }

    public get classIdentifier(): string {
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

    public override get classIdentifier(): string {
        return "keyoption";
    }
    
}

export abstract class StructogramBlock implements ClassIdentifiable, Identifiable {
    protected static idSeq = 0;
    public readonly id: string = `block${StructogramBlock.idSeq++}`;
    protected _associatedStructogram: Structogram;
    private _parent: StructogramBlock | undefined;
    protected _superBlock: StructogramBlock | undefined;
    protected _subBlockKey: string | undefined;
    protected abstract subBlocks: Record<string, StructogramBlock | undefined>;
    private _next: StructogramBlock | undefined;
    public readonly emitter = new EventEmitter2();
    /**
     * It fires when the children or subblocks of a structogramblock changes.
     * Its arguments are: block: StructogramBlock
     */
    public static readonly childrenChanged = "structogramblock.childrenChanged";

    /**
     * It fires when the active step of the block changes.
     * Its arguments are: step: string
     */
    public static readonly activeStepChanged = "structogramblock.activeStepChanged";
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

    public getOrderedSubBlocks(): [string,StructogramBlock | undefined][] {
        return Object.entries(this.subBlocks);
    }

    public getSubBlocks(): Record<string, StructogramBlock |undefined> {
        return {...this.subBlocks};
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
    public abstract get options(): BlockOption[];
    public abstract get classIdentifier(): string;
    public abstract parseAndCheckForIssues(): StructogramIssue[];

    public getData(): any {
        return {
            "type": this.classIdentifier,
            "next": this.next?.getData(),
            "subBlocks": Object.entries(this.subBlocks).map(entry => {
                return {"key": entry[0], "block": entry[1]?.getData()};
            }),
            "options": this.options.map(option => {
                return {"name": option.name, "value": option.getRawValues()};
            })
        };
    }

    public static BlockDataFactory = class {
        public static readonly typeToFactory: Record<string, (s: Structogram) => StructogramBlock> = {
            "assignmentblock": (s) => new AssignmentBlock(s),
            "controlblock": (s) => new ControlBlock(s),
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
            for(const option of block.options) {
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

function isNumeric(text: string) {
    return [...text].every(c => "0" <= c && c <= "9");
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
        const keyTokens = this.key!.split(new RegExp("\\.|\\[|\\]")).filter(s => s.length > 0);
        if(keyTokens.length == 1) {
            this._associatedStructogram.memory.setVariable(this.key!, this.statement!.evaluate());
        } else {
            let object = this._associatedStructogram.memory.getVariable(keyTokens[0]!);
            for(let i = 1; i < keyTokens.length-1; i++) {
                const token = keyTokens[i];
                if(object instanceof UtilityArray) {
                    object = object.indexGet(this.associatedStructogram.indexResolver.resolve(Number(token)));
                } else {
                    object = (object as UtilityObject).get(keyTokens[i]!);
                }
            }
            if(object instanceof UtilityArray) {
                object.indexSet(this.associatedStructogram.indexResolver.resolve(Number(keyTokens.at(-1)!)), this.statement!.evaluate());
            } else {
                (object as UtilityObject).set(keyTokens.at(-1)!, this.statement!.evaluate());
            }
        }
        return this.next;
    }

    public override get classIdentifier(): string {
        return "assignmentblock";
    }

    public override get options(): BlockOption[] {
        return [this.keyOption, this.statementOption];
    }

    public override parseAndCheckForIssues(): StructogramIssue[] {
        this.key = this.keyOption.getKey();
        const keyTokens = this.key.split(new RegExp("\\.|\\[|\\]")).filter(s => s.length > 0);
        let memoryKey = keyTokens[0]!;
        const issues = [];
        const memory = this._associatedStructogram.memory;

        function verifyFieldsExist() {
            let type = memory.getType(memoryKey);
            if(keyTokens.length <= 1) return true;
            for(let i = 1; i < keyTokens.length; i++) {
                const token = keyTokens[i]!;
                if(isNumeric(token)) {
                    if(!(type instanceof ArrayType)) return false;
                    type = type.elementType;
                } else {
                    if(!(type instanceof ObjectType)) return false;
                    if(!type.hasField(keyTokens[i]!)) return false;
                    type = type.getFieldType(keyTokens[i]!);
                }
            }
            return true;
        }

        function getObjectOrFieldType() {
            let type = memory.getType(memoryKey);
            if(keyTokens.length <= 1) return type;
            for(let i = 1; i < keyTokens.length; i++) {
                const token = keyTokens[i]!;
                if(isNumeric(token) && type instanceof ArrayType) {
                    type = type.elementType;
                } else {
                    type = (type as ObjectType).getFieldType(keyTokens[i]!);
                }
            }
            return type;
        }

        try {
            this.statement = this.statementOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                issues.push(new StructogramIssue(this.id, error.message, error.translationKey));
            } else {
                alert("Fatal parse error!");
            }
        }
        if(!memory.hasVariable(memoryKey)) {
            issues.push(new StructogramIssue(this.id, `Variable with key [${memoryKey}] is not defined!`, "error_undefined_variable"));
        } else if(!verifyFieldsExist()) {
            issues.push(new StructogramIssue(this.id, `[${this.key}] does not exist!`, "erro_no_field"));
        } else if(!getObjectOrFieldType().matches(this.statement?.returnType ?? undefinedType)) {
            issues.push(new StructogramIssue(this.id, `Block violates the type restrictions of the variable with key [${this.key}]!`, "error_type"));
        } else if(keyTokens.length == 1 && this._associatedStructogram.memory.isConstant(this.key)) {
            issues.push(new StructogramIssue(this.id, `Block tries to assign [${this.key}] which is a constant variable!`, "error_constant"));
        }
        return issues;
    }
}

export class ControlBlock extends SequenceBlock {
    private statement: AnyStatement | undefined;
    public readonly statementOption = new AnyStatementOption(this._associatedStructogram, "value", "the value to print");

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public override run(): StructogramBlock | undefined {
        this.activeStep = "main";
        this.statement?.evaluate();
        return this.next;
    }

    public override get classIdentifier(): string {
        return "controlblock";
    }

    public override get options(): BlockOption[] {
        return [this.statementOption];
    }

    public override parseAndCheckForIssues(): StructogramIssue[] {
        try {
            this.statement = this.statementOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                return [new StructogramIssue(this.id, error.message, error.translationKey)];
            } else {
                alert("Fatal parse error!");
            }
        }

        return [];
    }
}

export class PrintBlock extends SequenceBlock {
    private statement: StringStatement | undefined;
    public readonly statementOption = new StringStatementOption(this._associatedStructogram, "value", "the value to print");

    constructor(structogram: Structogram) {
        super(structogram);
    }

    public override run(): StructogramBlock | undefined {
        this.activeStep = "main";
        this._associatedStructogram.print(this.statement?.evaluate() ?? "null");
        return this.next;
    }

    public override get classIdentifier(): string {
        return "printblock";
    }

    public override get options(): BlockOption[] {
        return [this.statementOption];
    }

    public override parseAndCheckForIssues(): StructogramIssue[] {
        try {
            this.statement = this.statementOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                return [new StructogramIssue(this.id, error.message, error.translationKey)];
            } else {
                alert("Fatal parse error!");
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
    private state: TrueFalseBranchingBlockStates = "ready";
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

    public override get classIdentifier() {
        return "truefalsebranchingblock";
    }

    public override get options(): BlockOption[] {
        return [this.conditionOption];
    }

    public override parseAndCheckForIssues(): StructogramIssue[] {
        try {
            this.condition = this.conditionOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                return [new StructogramIssue(this.id, error.message, error.translationKey)];
            }
        }

        this.activeStep = "";
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
    protected subBlocks: Record<string, StructogramBlock | undefined> = {
        "else": undefined
    };
    protected branchIndex = 0;
    public readonly conditionListOption = new BooleanStatementListOption(this._associatedStructogram, "conditions", "the list of conditions the branches have");

    private fillOutBranches() {
        const statements = this.conditionListOption.getStatements();
        const statementCount = statements.length;
        for(let i = 0; i < statementCount; i++) {
            if(!("branch"+i in this.subBlocks)) {
                this.subBlocks["branch"+i] = undefined;
                this.emitter.emit(StructogramBlock.childrenChanged, this);
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
                    this.emitter.emit(StructogramBlock.childrenChanged, this);
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
        this.fillOutBranches();
    }

    public override run(): StructogramBlock | undefined {
        if(this.foundBranch) {
            this.finished = true;
            return this.next;
        }
        if(this.branchIndex in this.branches) {
            this.activeStep = `branch${this.branchIndex}`;
            if(this.branches[this.branchIndex]!.evaluate()) {
                this.foundBranch = true;
                return this.getOrderedSubBlocks()[this.branchIndex]![1];
            } else {
                this.branchIndex++;
                return this;
            }
        }
        this.activeStep = "else";
        this.foundBranch = true;
        return this.subBlocks["else"]!;
    }

    // alphabethically ordering subblocks by key will make sure that the else subblock is at the end
    public getOrderedSubBlocks(): [string, StructogramBlock | undefined][] {
        return super.getOrderedSubBlocks().sort((e1, e2) => e1[0]!.localeCompare(e2[0]!));
    }

    public override get classIdentifier() {
        return "multibranchingblock";
    }

    public override get options(): BlockOption[] {
        return [this.conditionListOption];
    }

    public override parseAndCheckForIssues(): StructogramIssue[] {
        try {
            this.branches = this.conditionListOption.tryResolveStatements();
        } catch (error) {
            if(error instanceof StatementParseError) {
                return [new StructogramIssue(this.id, error.message, error.translationKey)];
            }
        }

        this.branchIndex = 0;
        this.foundBranch = false;
        this.finished = false;
        this.activeStep = ""

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

    public parseAndCheckForIssues(): StructogramIssue[] {
        this.finished = false;
        return [];
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
            this._associatedStructogram.memory.setVariable(this.variableKey!, SimpleValue.number(this.from?.evaluate() ?? 0));
            return this;
        } else if(!this.checkedCondition) {
            const lastStep = this.activeStep;
            this.activeStep = "condition";
            this.checkedCondition = (this._associatedStructogram.memory.getVariable(this.variableKey!) as SimpleValue).value as number < (this.to?.evaluate() ?? 0);
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
            this._associatedStructogram.memory.changeVariable(this.variableKey!, v => SimpleValue.number((v as SimpleValue).value as number + (this.step?.evaluate() ?? 0)));
            return this.loopStart;
        }
        this.finished = true;
        this.started = false;
        return this.next;
    }

    public override get options(): BlockOption[] {
        return [this.variableKeyOption, this.fromOption, this.toOption, this.stepOption];
    }

    public override get classIdentifier(): string {
        return "countingloopblock";
    }

    public override parseAndCheckForIssues(): StructogramIssue[] {
        super.parseAndCheckForIssues();
        this.started = false;
        this.checkedCondition = false;
        this.activeStep = "";

        const issues = [];
        try {
            this.from = this.fromOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                issues.push(new StructogramIssue(this.id, error.message, error.translationKey));
            }
        }
        try {
            this.to = this.toOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                issues.push(new StructogramIssue(this.id, error.message, error.translationKey));
            }
        }
        try {
            this.step = this.stepOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                issues.push(new StructogramIssue(this.id, error.message, error.translationKey));
            }
        }
        
        this.variableKey = this.variableKeyOption.getKey();
        if(!this._associatedStructogram.memory.hasVariable(this.variableKey)) {
            issues.push(new StructogramIssue(this.id,`Variable with key [${this.variableKey}] is not defined!`, "error_undefined_variable"))
        } else if(!this._associatedStructogram.memory.getType(this.variableKey).matches(numberType)) {
            issues.push(new StructogramIssue(this.id, `Block violates the type restrictions of the variable with key [${this.variableKey}]!`, "error_type"));
        } else if (this._associatedStructogram.memory.isConstant(this.variableKey)) {
            issues.push(new StructogramIssue(this.id, `Block tries to assign [${this.variableKey}] which is a constant variable!`, "error_constant"));
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

    public override get options(): BlockOption[] {
        return [this.conditionOption];
    }

    public override parseAndCheckForIssues(): StructogramIssue[] {
        super.parseAndCheckForIssues();

        try {
            this.condition = this.conditionOption.tryResolveStatement();
        } catch (error) {
            if(error instanceof StatementParseError) {
                return [new StructogramIssue(this.id, error.message, error.translationKey)];
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

    public override get classIdentifier(): string {
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

    public override get classIdentifier(): string {
        return "backtestingloopblock";
    }
}