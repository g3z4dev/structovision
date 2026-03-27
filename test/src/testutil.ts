import { BinaryTreeNodeTemplate, booleanType, charType, DoublyLinkedListNodeTemplate, numberType, SimpleValue, SinglyLinkedListNodeTemplate, UtilityArray, UtilityString, type Value } from "@structovision/app/model/types";

export function cartesian<T>(ar1: T[], ar2: T[]): [T, T][] {
    return ar1.flatMap(a => ar2.map(b => [a, b] as [T, T]));
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
    return new UtilityArray(values, values[0]!.getType());
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