import EventEmitter2 from "eventemitter2";

export type Primitive = number | boolean | string;

export interface ClassIdentifiable {
    getClassIdentifier(): string;
}

export interface Value {
    get id(): string;
    get type(): ValueType;
    equals(t: Value): boolean;
    asString(): string;
    clone(): Value;
}

export interface Ordered<T> {
    greaterThan(other: T): boolean;
}
// Type definitions

export type _Value = Primitive | UtilityObject | UtilityArray | undefined;
type ValueTypeFunction = (typeParameter: ValueType[]) => ValueType;

export class ValueType {
    public readonly baseIdentifier: string;
    public readonly orderable: boolean;

    public get id() {
        return this.baseIdentifier;
    }

    constructor(identifier: string, orderable: boolean = false) {
        this.baseIdentifier = identifier;
        this.orderable = orderable;
    }

    public matches(type: ValueType) {
        return this.id == type.id || type.baseIdentifier == "undefined";
    }

    public hasFields() {
        return false;
    }

    public isUndefined() {
        return false;
    }

    public isDefined() {
        return !this.isUndefined();
    }
}

export class ObjectType extends ValueType {
    private readonly typeParameter: ValueType[];
    /**
     * The reason we use functions here instead of concrete types is to avoid infinite recursion.
     * If we use concrete types a linked object will resolve types forever!
     * This way we can have self-referencing types without these issues.
     */
    private readonly fields: FieldTypes;

    constructor(identifier: string, typeParameter: ValueType[], fields: FieldTypes) {
        super(identifier);
        this.typeParameter = typeParameter;
        this.fields = {};
        for(const [field,type] of Object.entries(fields)) {
            this.fields[field] = type;
        }
    }

    public getFieldType(field: string): ValueType {
        if(!(field in this.fields)) throw new Error(`Field [${field}] not present in object!`);
        return this.fields[field]!(this.typeParameter);
    }

    public getFieldTypes(): FieldTypes {
        return {...this.fields};
    }

    public hasField(field: string) {
        return field in this.fields;
    }

    public override hasFields(): boolean {
        return true;
    }

    public override get id(): string {
        return `${this.baseIdentifier}<${this.typeParameter[0]!.id}>`
    }
}

export class ArrayType extends ValueType {
    public readonly elementType: ValueType;

    constructor(elementType: ValueType) {
        super("array");
        this.elementType = elementType;
    }

    public override get id(): string {
        return `${this.baseIdentifier}<${this.elementType.id}>`;
    }
}

export class AnyType extends ValueType {
    constructor() {
        super("any");
    }

    public override matches(type: ValueType): boolean {
        return true;
    }
}

export class UndefinedType extends ValueType {
    constructor() {
        super("undefined");
    }

    public override matches(type: ValueType): boolean {
        return true;
    }

    public override isUndefined(): boolean {
        return true;
    }
}

/**
 * Represents a special type called Tokens, used for accessing fields of objects.
 * Unlike other objects it cannot be obtained as a result of operators, it can only exist in literal form.
 * Consequently, the type contains the value.
 */
export class TokenType extends ValueType {
    public readonly token: string;

    constructor(token: string) {
        super("token");
        this.token = token;
    }
}

export const numberType = new ValueType("number", true);
export const charType = new ValueType("char", true);
export const booleanType = new ValueType("boolean");
export const anyType = new AnyType();
export const undefinedType = new UndefinedType();
export const stringType = new ValueType("string", true);

// Field definitions

type FieldTypes = Record<string, ValueTypeFunction>;

export abstract class Field {
    public readonly name: string;

    constructor(name: string) {
        this.name = name;
    }
    
    /**
     * Adds the field type information to a given record.
     * @param parameterTypes the potential type parameters
     * @param fields the record to add the type information to
     */
    public abstract addTypeInformationTo(template: UtilityObjectTemplate, typeParameters: ValueType[], fields: FieldTypes): void;
}

export class SelfReferentialField extends Field {

    public addTypeInformationTo(template: UtilityObjectTemplate, typeParameters: ValueType[], fields: FieldTypes): void {
        fields[this.name] = () => template.getType(typeParameters);
    }
}

export class PredefinedField extends Field {
    public readonly type: ValueTypeFunction;

    constructor(name: string, type: ValueTypeFunction) {
        super(name);
        this.type = type;
    }

    public addTypeInformationTo(template: UtilityObjectTemplate, typeParameters: ValueType[], fields: FieldTypes): void {
        fields[this.name] = () => this.type(typeParameters);
    }
}

/**
 * The builder pattern in Typescript cannot be implemented in the usual way because inner classes are not fully supported.
 * Inner classes are static fields which are asssigned to an anonymous class. Anonymous classes defined like this
 * cannot have private fields. Consequently, we use an external interface to define its methods and then return an 
 * anonymous object implementing this interface using a static method of the class the builder is constructing. 
 * This way we can preserve encapsulation.
 */
export interface UtilityObjectTemplateBuilder {
    addField(name: string, type: ValueTypeFunction): UtilityObjectTemplateBuilder;
    addSelfReferentialField(name: string): UtilityObjectTemplateBuilder;
    build(): UtilityObjectTemplate;
}

export class SimpleValue implements Value, Ordered<SimpleValue> {
    protected static idSeq = 0;
    public readonly id: string = `simplevalue${SimpleValue.idSeq++}`;
    public value: Primitive | undefined;
    public readonly type: ValueType;

    private constructor(value: Primitive | undefined, type: ValueType) {
        this.value = value;
        this.type = type;
    }

    public static number(value: number) {
        return new SimpleValue(value, numberType);
    }

    public static char(value: string) {
        if(value.length != 1) throw new Error("Char must be a 1 long string!");
        return new SimpleValue(value, charType);
    }

    public static boolean(value: boolean) {
        return new SimpleValue(value, booleanType);
    }

    public static token(value: string) {
        return new SimpleValue(value, new TokenType(value));
    }

    public static undefined() {
        return new SimpleValue(undefined, undefinedType);
    }

    public greaterThan(other: SimpleValue): boolean {
        if(!other.type.matches(this.type)) throw new Error("Comparing different types is not allowed!");
        if(!this.type.orderable) throw new Error("Comparing unordered types is not allowed!");
        return this.value! > other.value!;
    }

    public equals(t: Value): boolean {
        if(t instanceof SimpleValue) {
            return this.value == t.value;
        }
        return false;
    }

    public asString(): string {
        return this.value?.toString() ?? "undefined";
    }

    public clone(): SimpleValue {
        return new SimpleValue(this.value, this.type);
    }
}

export class UtilityObjectTemplate {
    private readonly id: string;
    private fields: Field[];

    private constructor(id: string, fields: Field[]) {
        this.id = id;
        this.fields = fields;
    }

    public getType(typeParameters: ValueType[]): ObjectType {
        const fieldTypes: FieldTypes = {}; 
        for(const field of this.fields) {
            field.addTypeInformationTo(this, typeParameters, fieldTypes);
        }
        return new ObjectType(this.id, typeParameters, fieldTypes);
    }

    public construct(args: Value[]) {
        return new UtilityObject(this.fields, args, this.getType(args.map(v => v.type)));
    }

    public static Builder(id: string): UtilityObjectTemplateBuilder {
        return new class implements UtilityObjectTemplateBuilder {
            private readonly id: string;
            private readonly fields: Field[] = [];
            
            constructor(id: string) {
                this.id = id;
            }

            public addField(name: string, type: ValueTypeFunction): UtilityObjectTemplateBuilder {
                this.fields.push(new PredefinedField(name, type));
                return this;
            }

            public addSelfReferentialField(name: string): UtilityObjectTemplateBuilder {
                this.fields.push(new SelfReferentialField(name));
                return this;
            }

            public build(): UtilityObjectTemplate {
                return new UtilityObjectTemplate(this.id, this.fields);
            }
        }(id);
    }
}

export class UtilityArray implements Value {
    protected elements: Value[];
    protected elementType: ValueType;
    protected static idSeq = 0;
    public readonly id: string = `array${UtilityArray.idSeq++}`;
    public static readonly emitter = new EventEmitter2();
    /**
     * It fires when an element of the array is changed.
     * Its arguments are: array: UtilityArray, idx: number, value: Value
     */
    public static readonly elementChanged = "utilityarray.element.changed";

    /**
     * It fires when an element of the array is swapped.
     * Its arguments are: array: UtilityArray, idx1: number, idx2: number
     */
    public static readonly elementSwapped = "utilityarray.element.swapped";

    constructor(values: Value[], elementType: ValueType) {
        UtilityArray.ensureValuesAreHomogenous(values)
        this.elements = [...values.map(value => value.clone())];
        this.elementType = elementType;
    }

    private static ensureValuesAreHomogenous(values: Value[]) {
        for(let i = 0; i < values.length; i++) {
            for(let j = i + 1; j < values.length; j++) {
                if(!values[i]!.type.matches(values[j]!.type)) throw new Error("Array cannot be heterogenous!");
            }
        }
    }

    public indexGet(idx: number): Value {
        return this.elements[idx] ?? SimpleValue.undefined();
    }

    public indexSet(idx: number, value: Value): void {
        if(idx > this.elements.length) return;
        /**
         * We must ensure we are cloning the value! This way we can avoid recursive arrays.
         * The values of an array must be unique.
         */
        this.elements[idx] = value.clone();
        UtilityArray.emitter.emit(UtilityArray.elementChanged, this, idx, this.elements[idx]);
    }

    public indexSwap(idx1: number, idx2: number): void {
        if(idx1 > this.elements.length || idx2 > this.elements.length) return;
        const val1 = this.elements[idx1]!;
        this.elements[idx1] = this.elements[idx2]!;
        this.elements[idx2] = val1;
        UtilityArray.emitter.emit(UtilityArray.elementSwapped, this, idx1, idx2);
    }

    public get length() {
        return this.elements.length;
    }

    public get type(): ValueType {
        return new ArrayType(this.elementType);
    }

    public equals(t: Value): boolean {
        if(t instanceof UtilityArray) {
            return this.elements.length == t.elements.length && this.elements.every((e, i) => e.equals(t.elements[i]!));
        }
        return false;
    }

    public concat(other: UtilityArray): UtilityArray {
        if(!this.elementType.matches(other.elementType)) throw new Error("Cannot concatenate two arrays of different element types!");
        return new UtilityArray(this.elements.concat(other.elements), this.elementType);
    }

    public asString(): string {
        return "{" + this.elements.map(e => e.asString()).join() + "}"
    }

    public clone(): UtilityArray {
        return new UtilityArray(this.elements.map(e => e.clone()), this.elementType);
    }
}

export class UtilityString extends UtilityArray implements Ordered<UtilityString> {
    constructor(values: Value[]) {
        super(values, charType);
        UtilityString.ensureValuesAreChar(values);
    }

    private static ensureValuesAreChar(values: Value[]) {
        for(const value of values) {
            if(!charType.matches(value.type)) return new Error("Values of string must be chars!");
        }
    }
    
    public greaterThan(other: UtilityString): boolean {
        return this.getString() > other.getString();
    }

    public override get type(): ValueType {
        return stringType;
    }

    public static create(text: string) {
        return new UtilityString([...text].map(t => SimpleValue.char(t)));
    }

    public getString() {
        return (this.elements as SimpleValue[]).map(e => e.value).join("");
    }

    public concat(other: UtilityString): UtilityString {
        return new UtilityString(this.elements.concat(other.elements));
    }

    public clone(): UtilityArray {
        return new UtilityString(this.elements.map(e => e.clone()));
    }
}

export class UtilityObject implements Value {
    protected static idSeq = 0;
    public readonly id: string = `object${UtilityObject.idSeq++}`;
    public fieldData: Record<string, Value> = {};
    /**
     * We store the data used for construction so that we can replicate the object.
     */
    private readonly fields;
    private readonly args;
    public readonly type: ObjectType;
    public static readonly emitter = new EventEmitter2();

    /**
     * It fires when the field of an object changes.
     * Its arguments are: object: UtilityObject, name: string, value: Value
     */
    public static readonly fieldChanged = "utilityobject.field.changed";

    constructor(fields: Field[], args: Value[], type: ObjectType) {
        let fieldIdx = 0;
        for(const field of fields) {
            if(fieldIdx < args.length) {
                this.fieldData[field.name] = args[fieldIdx]!;
            } else {
                this.fieldData[field.name] = SimpleValue.undefined();
            }
            fieldIdx += 1;
        }
        this.fields = fields;
        this.args = args;
        this.type = type;
    }

    public get(name: string): Value {
        if(!(name in this.fieldData)) throw new Error("Field does not exist!");
        return this.fieldData[name]!;
    }

    public set(name: string, value: Value) {
        if(!(name in this.fieldData)) throw new Error("Field does not exist!");
        if(!this.type.getFieldType(name).matches(value.type)) throw new Error("Type mismatch!");
        this.fieldData[name] = value;
        UtilityObject.emitter.emit(UtilityObject.fieldChanged, this, name, value);
    }

    public equals(t: Value): boolean {
        if(t instanceof UtilityObject) {
            return this.fieldData.length == t.fieldData.length && Object.keys(this.fieldData).every((key) => key in t.fieldData && this.fieldData[key]!.equals(t.fieldData[key]!));
        }
        return false;
    }

    public asString(): string {
        return this.id;
    }

    public clone(): UtilityObject {
        const object = new UtilityObject(this.fields, this.args, this.type);
        for(const [name, value] of Object.entries(this.fieldData)) {
            if(value.id == this.id) {
                object.set(name, object);
            } else {
                object.set(name, value.clone());
            }
        }
        return object;
    }
}

export const SinglyLinkedListNodeTemplate = 
    UtilityObjectTemplate.Builder("s1l")
        .addField("key", typeParams => typeParams[0]!)
        .addSelfReferentialField("next")
        .build();
        
export const DoublyLinkedListNodeTemplate = 
    UtilityObjectTemplate.Builder("s2l")
        .addField("key", typeParams => typeParams[0]!)
        .addSelfReferentialField("next")
        .addSelfReferentialField("prev")
        .build();

export const BinaryTreeNodeTemplate = 
    UtilityObjectTemplate.Builder("btn")
        .addField("key", typeParams => typeParams[0]!)
        .addSelfReferentialField("parent")
        .addSelfReferentialField("left")
        .addSelfReferentialField("right")
        .build();

export const typeRegistry: Record<string, (v: ValueType) => ValueType> = {};

function registerType(type: ValueType, factory: (v: ValueType) => ValueType, aliases: string[] = []) {
    typeRegistry[type.baseIdentifier] = factory;
    for(const alias of aliases) {
        typeRegistry[alias] = factory;
    }
}

registerType(numberType, v => numberType);
registerType(charType, v => charType);
registerType(booleanType, v => booleanType);
registerType(new ArrayType(numberType), v => new ArrayType(v));
registerType(stringType, v => stringType);
registerType(SinglyLinkedListNodeTemplate.getType([numberType]), v => SinglyLinkedListNodeTemplate.getType([v]));
registerType(DoublyLinkedListNodeTemplate.getType([numberType]), v => DoublyLinkedListNodeTemplate.getType([v]));
registerType(BinaryTreeNodeTemplate.getType([numberType]), v => BinaryTreeNodeTemplate.getType([v]));

function splitTypeTokens(typeIdentifier: string) {
    return typeIdentifier.split("<").map(t => t.split(">")[0]!);
}

export class TypeParseError extends Error {
    constructor(m: string) {
        super(m);

        Object.setPrototypeOf(this, TypeParseError.prototype);
    }
}

export function parseType(typeIdentifier: string): ValueType {
    const typeTokens = splitTypeTokens(typeIdentifier);
    if(typeTokens.some(t => !(t in typeRegistry))) throw new TypeParseError("Invalid type identifier!");
    const types = typeTokens.map(t => typeRegistry[t]).reverse();
    if(types.length == 0) return undefinedType;
    let lastType = types[0]!(undefinedType);
    for(let i = 1; i < types.length; i++) {
        lastType = types[i]!(lastType);
    }
    return lastType;
}