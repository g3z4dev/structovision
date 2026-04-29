import { BinaryTreeNodeTemplate, booleanType, charType, DoublyLinkedListNodeTemplate, numberType, SimpleValue, SinglyLinkedListNodeTemplate, undefinedType, UtilityArray, UtilityString, type Value } from "@structovision/app/model/types";
import type { IAssert } from "zora";

export function cartesian<T, J>(ar1: T[], ar2: J[]): [T, J][] {
    return ar1.flatMap(a => ar2.map(b => [a, b] as [T, J]));
}

export function str(text: string) {
    const values = [...text].map(SimpleValue.char);
    return new UtilityString(values);
}

export function numArray(numbers: number[]) {
    const values = numbers.map(SimpleValue.number);
    return new UtilityArray(values, numberType);
}

export function boolArray(bools: boolean[]) {
    const values = bools.map(SimpleValue.boolean);
    return new UtilityArray(values, booleanType);
}

export function charArray(chars: string[]) {
    const values = chars.map(SimpleValue.char);
    return new UtilityArray(values, charType);
}

export function array(values: Value[]) {
    return new UtilityArray(values, values[0]?.type ?? undefinedType);
}

export function s1l(value: Value) {
    return SinglyLinkedListNodeTemplate.construct([value]);
}

export function s2l(value: Value) {
    return DoublyLinkedListNodeTemplate.construct([value]);
}

export function btn(value: Value) {
    return BinaryTreeNodeTemplate.construct([value]);
}

export function n(n: number) {
    return SimpleValue.number(n);
}

export function c(c: string) {
    return SimpleValue.char(c);
}

export function b(b: boolean) {
    return SimpleValue.boolean(b);
}

export function ud() {
    return SimpleValue.undefined();
}

// we need to scrub the uniqueness of objects to compare them by json
function scrubID(jsonText: string) {
    return jsonText.replaceAll(/\"id\":\"[a-zA-Z0-9]+\"/g, "\"id\":\"\"");
}

export function jsonEqual(assertion: IAssert, a: any, b: any, text: string, filter?: (k: string, v: any) => any) {
    assertion.equal(scrubID(JSON.stringify(a, filter)), scrubID(JSON.stringify(b, filter)), text);
}