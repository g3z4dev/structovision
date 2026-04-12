import { ArrayType, BinaryTreeNodeTemplate, booleanType, charType, DoublyLinkedListNodeTemplate, numberType, SimpleValue, SinglyLinkedListNodeTemplate, stringType, undefinedType, ValueType, type Value } from "@structovision/app/model/types"
import {test, type IAssert} from "zora"
import { array, b, btn, c, jsonEqual, n, s1l, s2l, str } from "../testutil.ts";

test("type should match themselves but not other types", assertion => {
    const types = [
        numberType,
        charType,
        stringType,
        booleanType,
        new ArrayType(numberType),
        SinglyLinkedListNodeTemplate.getType([charType]),
        DoublyLinkedListNodeTemplate.getType([stringType]),
        BinaryTreeNodeTemplate.getType([booleanType]),
        SinglyLinkedListNodeTemplate.getType([new ArrayType(booleanType)])
    ]
    for(let i = 0; i < types.length; i++) {
        for(let j = i; j < types.length; j++) {
            const type1 = types[i]!;
            const type2 = types[j]!;
            if(i == j) {
                assertion.truthy(type1.matches(type1), `${type1.getIdentifier()} should match itself`); 
            } else {
                assertion.falsy(type1.matches(type2), `${type1.getIdentifier()} should not match ${type2.getIdentifier()}`); 
                assertion.falsy(type2.matches(type1), `${type2.getIdentifier()} should not match ${type1.getIdentifier()}`);
            }
        } 
    }
});

test("undefined type should match any type", assertion => {
    const types = [
        undefinedType,
        numberType,
        charType,
        stringType,
        booleanType,
        new ArrayType(numberType),
        SinglyLinkedListNodeTemplate.getType([charType]),
        DoublyLinkedListNodeTemplate.getType([stringType]),
        BinaryTreeNodeTemplate.getType([booleanType]),
        SinglyLinkedListNodeTemplate.getType([new ArrayType(booleanType)])
    ];
    for(let i = 0; i < types.length; i++) {
        const type = types[i]!;
        assertion.truthy(type.matches(undefinedType), `${type.getIdentifier()} should match undefined type`); 
        assertion.truthy(undefinedType.matches(type), `undefined type should match ${type.getIdentifier()}`); 
    }
});

test("values should have the correct type", assertion => {
    const valuesAndExpectedTypes: [Value, ValueType][] = [
        [n(12), numberType],
        [c("z"), charType],
        [str("almafa"), stringType],
        [b(true), booleanType],
        [array([n(1),n(2),n(3)]), new ArrayType(numberType)],
        [s1l(c("z")), SinglyLinkedListNodeTemplate.getType([charType])],
        [s2l(str("kerbin")), DoublyLinkedListNodeTemplate.getType([stringType])],
        [btn(b(false)), BinaryTreeNodeTemplate.getType([booleanType])],
        [btn(array([n(1),n(2),n(3)])), BinaryTreeNodeTemplate.getType([new ArrayType(numberType)])],
        [array([s1l(c("z"))]), new ArrayType(SinglyLinkedListNodeTemplate.getType([charType]))],
    ];
    for(const [value, type] of valuesAndExpectedTypes) {
        assertion.truthy(value.getType().matches(type), `${type.getIdentifier()} should match the type of the object it represents`); 
    }
});

test("arrays should be homogenous", assertion => {
    assertion.throws(() => array([n(1), c("a"), b(false)]), Error, `heterogenous arrays should throw an error`);
});

test("arrays objects should be unique", assertion => {
    const value = n(12);
    assertion.truthy(array([value]).indexGet(0).id != value.id, "values of an array should be different from the values given to it during construction");
    const arr = array([n(1)]);
    arr.indexSet(0, value);
    assertion.truthy(arr.indexGet(0).id != value.id, "values of an array should be different from the values given to its setter");
});

test("values should be shallow cloned", assertion => {
    const values: Value[] = [
        n(12),
        c("z"),
        str("almafa"),
        b(true),
        array([n(1),n(2),n(3)]),
        s1l(c("z")),
        s2l(str("kerbin")),
        btn(b(false)),
        btn(array([n(1),n(2),n(3)])),
        array([s1l(c("z"))]),
    ];
    for(const value of values) {
        const clone = value.clone();
        assertion.truthy(value.getType().matches(clone.getType()), `a clone of a ${value.getType().getIdentifier()} should be the same type of value`)
        assertion.truthy(value.id != clone.id, `a clone of a ${value.getType().getIdentifier()} should be a different instance`)
        jsonEqual(assertion, value, clone, `a clone of a ${value.getType().getIdentifier()} should be logically equal to the original`)
    }
});

test("values should be deep cloned", assertion => {
    const strVal = str("almafa");
    let clone = strVal.clone();
    let condition = true;
    for(let i = 0; i < strVal.length; i++) {
        condition = condition && (strVal.indexGet(i).id != clone.indexGet(i).id);
    }
    assertion.truthy(condition, "a clone of a string should deeply clone its elements");

    const arrayVal = array([n(1), n(2), n(3)]);
    clone = arrayVal.clone();
    condition = true;
    for(let i = 0; i < arrayVal.length; i++) {
        condition = condition && (arrayVal.indexGet(i).id != clone.indexGet(i).id);
    }
    assertion.truthy(condition, "a clone of an array should deeply clone its elements");

    const s1lVal = s1l(n(12));
    const s1lVal2 = s1l(n(12));
    s1lVal.set("next", s1lVal2);
    const s1lClone = s1lVal.clone();
    assertion.truthy(s1lVal.get("next").id != s1lClone.get("next").id && s1lVal.get("key").id != s1lClone.get("key").id, "a clone of a utilityobject should deeply clone its elements");
});

test("recursive utilityobjects should be cloneable", assertion => {
    const s1lVal = s1l(n(12));
    s1lVal.set("next", s1lVal);
    const s1lClone = s1lVal.clone();
    assertion.truthy(
        s1lVal.get("next").id != s1lClone.get("next").id && s1lVal.get("key").id != s1lClone.get("key").id && s1lClone.get("next").id == s1lClone.id, 
        "a clone of a recursive utilityobject should properly clone its elements");
});