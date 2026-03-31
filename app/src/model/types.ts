export type Primitive = number | boolean | string;

export interface ClassIdentifiable {
    getClassIdentifier(): string;
}

export interface Value {
    getType(): ValueType;
    equals(t: Value): boolean;
    asString(): string;
}

export interface Ordered<T> {
    greaterThan(other: T): boolean;
}
// Type definitions

export type _Value = Primitive | UtilityObject | UtilityArray | undefined;
type ValueTypeFunction = (typeParameter: ValueType[]) => ValueType;

export class ValueType {
    public baseIdentifier: string;
    public readonly orderable: boolean;

    constructor(identifier: string, orderable: boolean = false) {
        this.baseIdentifier = identifier;
        this.orderable = orderable;
    }

    public matches(type: ValueType) {
        return this.getIdentifier() == type.getIdentifier() || type.baseIdentifier == "undefined";
    }

    public getIdentifier() {
        return this.baseIdentifier;
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
    private selfReferentialFields: Set<string> = new Set();

    constructor(identifier: string, typeParameter: ValueType[], fields: FieldTypes, selfReferentialFields: string[]) {
        super(identifier);
        this.typeParameter = typeParameter;
        this.fields = {};
        for(const [field,type] of Object.entries(fields)) {
            this.fields[field] = type;
        }
        for(const name of selfReferentialFields) this.selfReferentialFields.add(name);
    }

    public getFieldType(field: string): ValueType | undefined {
        if(!(field in this.fields)) return undefined;
        return this.fields[field]!(this.typeParameter);
    }

    public getFieldTypes(): FieldTypes {
        return {...this.fields};
    }

    private fieldsMatching(type: ObjectType) {
        const fields1 = Object.entries(this.fields);
        const fields2 = Object.entries(type.fields);
        if(fields1.length != fields2.length) return false;
        for(const [key, type1] of fields1) {
            if(!(key in type.fields)) return false;
            const type2 = type.fields[key]!;
            // these two lines are needed to prevent infinite recursion
            if(this.selfReferentialFields.has(key) != type.selfReferentialFields.has(key)) return false;
            if(this.selfReferentialFields.has(key)) continue;
            if(!type1(this.typeParameter).matches(type2(type.typeParameter))) return false;
        }
        return true;
    }

    public override getIdentifier(): string {
        return `${this.baseIdentifier}<${this.typeParameter[0]!.getIdentifier()}>`
    }
}

export class ArrayType extends ValueType {
    public readonly elementType: ValueType;

    constructor(elementType: ValueType, orderable: boolean = false) {
        super("array", orderable);
        this.elementType = elementType;
    }

    public override getIdentifier(): string {
        return `${this.baseIdentifier}<${this.elementType.getIdentifier()}>`;
    }
}

export class StringType extends ArrayType {
    constructor() {
        super(charType, true);
        this.baseIdentifier = "string";
    }

    public override getIdentifier(): string {
        return "string";
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
}

export class AnyOrderableType extends ValueType {
    constructor() {
        super("any");
    }

    public override matches(type: ValueType): boolean {
        return type.getIdentifier() == "undefined" || type.orderable;
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
export const stringType = new StringType();

// Field definitions

type FieldTypes = Record<string, ValueTypeFunction>;
type FieldAccess = "get" | "set" | "getset";

export abstract class Field {
    public readonly name: string;
    public readonly access: FieldAccess;

    constructor(name: string, access: FieldAccess) {
        this.name = name;
        this.access = access;
    }
    
    /**
     * Adds the field type information to a given record.
     * @param parameterTypes the potential type parameters
     * @param fields the record to add the type information to
     */
    public abstract addTypeInformationTo(template: UtilityObjectTemplate, typeParameters: ValueType[], fields: FieldTypes): void;

    public isSettable(): boolean {
        return this.access == "set" || this.access == "getset";
    }

    public isGettable(): boolean {
        return this.access == "get" || this.access == "getset";
    }
}

export class SelfReferentialField extends Field {

    public addTypeInformationTo(template: UtilityObjectTemplate, typeParameters: ValueType[], fields: FieldTypes): void {
        fields[this.name] = () => template.getType(typeParameters);
    }
}

export class PredefinedField extends Field {
    public readonly type: ValueTypeFunction;

    constructor(name: string, access: FieldAccess, type: ValueTypeFunction) {
        super(name, access);
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
    addField(name: string, access: FieldAccess, type: ValueTypeFunction): UtilityObjectTemplateBuilder;
    addSelfReferentialField(name: string, access: FieldAccess): UtilityObjectTemplateBuilder;
    build(): UtilityObjectTemplate;
}

export class SimpleValue implements Value, Ordered<SimpleValue> {
    public value: Primitive | undefined;
    public readonly type: ValueType;

    private constructor(value: Primitive | undefined, type: ValueType) {
        this.value = value;
        this.type = type;
    }

    public getType(): ValueType {
        return this.type;
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
        const selfReferentialFields = this.fields.filter(f => f instanceof SelfReferentialField).map(f => f.name);
        for(const field of this.fields) {
            field.addTypeInformationTo(this, typeParameters, fieldTypes);
        }
        return new ObjectType(this.id, typeParameters, fieldTypes, selfReferentialFields);
    }

    public construct(args: Value[]) {
        return new UtilityObject(this.id, this.fields, args, this.getType(args.map(v => v.getType())));
    }

    public static Builder(id: string): UtilityObjectTemplateBuilder {
        return new class implements UtilityObjectTemplateBuilder {
            private readonly id: string;
            private readonly fields: Field[] = [];
            
            constructor(id: string) {
                this.id = "object-"+id;
            }

            public addField(name: string, access: FieldAccess, type: ValueTypeFunction): UtilityObjectTemplateBuilder {
                this.fields.push(new PredefinedField(name, access, type));
                return this;
            }

            public addSelfReferentialField(name: string, access: FieldAccess): UtilityObjectTemplateBuilder {
                this.fields.push(new SelfReferentialField(name, access));
                return this;
            }

            public build(): UtilityObjectTemplate {
                return new UtilityObjectTemplate(this.id, this.fields);
            }
        }(id);
    }
}

export class UtilityArray implements ClassIdentifiable, Value {
    protected elements: Value[];
    protected elementType: ValueType;
    public static readonly id = "object-array";

    constructor(values: Value[], elementType: ValueType) {
        UtilityArray.ensureValuesAreHomogenous(values)
        this.elements = [...values];
        this.elementType = elementType;
    }

    private static ensureValuesAreHomogenous(values: Value[]) {
        for(let i = 0; i < values.length; i++) {
            for(let j = i + 1; j < values.length; j++) {
                if(!values[i]!.getType().matches(values[j]!.getType())) throw new Error("Array cannot be heterogenous!");
            }
        }
    }

    public indexGet(idx: number): Value {
        return this.elements[idx]!;
    }

    public indexSet(idx: number, value: Value): void {
        this.elements[idx] = value;
    }

    public get length() {
        return this.elements.length;
    }

    public getType() {
        return new ArrayType(this.elementType);
    }

    public getClassIdentifier(): string {
        return UtilityArray.id;
    }

    public equals(t: Value): boolean {
        if(t instanceof UtilityArray) {
            return this.elements.length == t.elements.length && this.elements.every((e, i) => e.equals(t.elements[i]!));
        }
        return false;
    }

    public concat(other: UtilityArray): UtilityArray {
        // todo type check
        return new UtilityArray(this.elements.concat(other.elements), this.elementType);
    }

    public asString(): string {
        return "{" + this.elements.map(e => e.asString()).join() + "}"
    }
}

export class UtilityString extends UtilityArray implements Ordered<UtilityString> {
    constructor(values: Value[]) {
        super(values, charType);
        UtilityString.ensureValuesAreChar(values);
    }

    private static ensureValuesAreChar(values: Value[]) {
        for(const value of values) {
            if(!charType.matches(value.getType())) return new Error("Values of string must be chars!");
        }
    }
    
    public greaterThan(other: UtilityString): boolean {
        throw this.getString() > other.getString();
    }

    public getType(): ArrayType {
        return stringType;
    }

    public static create(text: string) {
        return new UtilityString([...text].map(t => SimpleValue.char(t)));
    }

    public getString() {
        return (this.elements as SimpleValue[]).map(e => e.value).join("");
    }

    public concat(other: UtilityString): UtilityString {
        // todo type check
        return new UtilityString(this.elements.concat(other.elements));
    }

    public getClassIdentifier(): string {
        return "string"
    }
}

export class UtilityObject implements ClassIdentifiable, Value {
    public readonly id: string;
    public fieldData: Record<string, Value> = {};
    public fieldAccessData: Record<string, FieldAccess> = {};
    private type: ValueType;

    constructor(id: string, fields: Field[], args: Value[], type: ValueType) {
        this.id = id;
        let fieldIdx = 0;
        for(const field of fields) {
            this.fieldAccessData[field.name] = field.access;
            if(fieldIdx < args.length) {
                this.fieldData[field.name] = args[fieldIdx]!;
            } else {
                this.fieldData[field.name] = SimpleValue.undefined();
            }
            fieldIdx += 1;
        }
        this.type = type;
    }

    public get(name: string): Value {
        if(!(name in this.fieldData)) throw new Error("Field does not exist!");
        return this.fieldData[name]!;
    }

    public set(name: string, value: Value) {
        if(!(name in this.fieldData)) throw new Error("Field does not exist!");
        if(!this.fieldData[name]!.getType().matches(value.getType())) throw new Error("Type mismatch!");
        this.fieldData[name] = value;
    }

    public getType(): ValueType {
        return this.type;
    }

    public getClassIdentifier(): string {
        return this.id;
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
}

export const SinglyLinkedListNodeTemplate = 
    UtilityObjectTemplate.Builder("singlylinkedlistnode")
        .addField("key", "getset", typeParams => typeParams[0]!)
        .addSelfReferentialField("next", "getset")
        .build();
        
export const DoublyLinkedListNodeTemplate = 
    UtilityObjectTemplate.Builder("doublylinkedlistnode")
        .addField("key", "getset", typeParams => typeParams[0]!)
        .addSelfReferentialField("next", "getset")
        .addSelfReferentialField("prev", "getset")
        .build();

export const BinaryTreeNodeTemplate = 
    UtilityObjectTemplate.Builder("binarytreenode")
        .addField("key", "getset", typeParams => typeParams[0]!)
        .addSelfReferentialField("parent", "getset")
        .addSelfReferentialField("left", "getset")
        .addSelfReferentialField("right", "getset")
        .build();

export const typeRegistry: Record<string, (v: ValueType) => ValueType> = {};

function registerType(type: ValueType, factory: (v: ValueType) => ValueType) {
    typeRegistry[type.baseIdentifier] = factory;
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