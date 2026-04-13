import {test, type IAssert} from "zora"
import { array, b, btn, c, cartesian, jsonEqual, n, s1l, s2l, str } from "../testutil.ts";
import { Memory } from "@structovision/app/model/memory";
import { ArrayType, BinaryTreeNodeTemplate, booleanType, charType, DoublyLinkedListNodeTemplate, numberType, SinglyLinkedListNodeTemplate, stringType, ValueType, type Value } from "@structovision/app/model/types";

test("Memory should allow declaring, changing and getting values of all types", assertion => {
    const mem = new Memory();
    const cases: [string, ValueType, Value, Value][] = [
        ["a", numberType, n(1), n(3)],
        ["b", charType, c("a"), c("b")],
        ["c", stringType, str("hello"), str("world")],
        ["d", booleanType, b(true), b(false)],
        ["e", new ArrayType(numberType), array([n(1),n(2),n(3)]), array([n(4),n(5),n(6)])],
        ["f", SinglyLinkedListNodeTemplate.getType([charType]), s1l(c("d")), s1l(c("g"))],
        ["g", DoublyLinkedListNodeTemplate.getType([SinglyLinkedListNodeTemplate.getType([numberType])]), s2l(s1l(n(1))), s2l(s1l(n(2)))],
        ["h", BinaryTreeNodeTemplate.getType([new ArrayType(numberType)]), btn(array([n(1),n(2),n(3)])), btn(array([n(4),n(5),n(6)]))]
    ]
    for(const c of cases) {
        const key = c[0]!;
        const type = c[1]!;
        const v1 = c[2]!;
        const v2 = c[3]!;
        mem.createVariable(key, type);
        assertion.truthy(mem.hasVariable(key), `memory should have a variable with key [${key}]`);
        jsonEqual(assertion, mem.getType(key), type, `variable [${key}] should have its expected type`);
        mem.setVariable(key, v1);
        jsonEqual(assertion, mem.getVariable(key), v1, `variable [${key}] should have its expected value`);
        mem.setVariable(key, v2);
        jsonEqual(assertion, mem.getVariable(key), v2, `variable [${key}] should have its new expected value`);
    }
});

test("Memory should allow declaring variables with special names", assertion => {
    const mem = new Memory();
    mem.createVariable("_a", numberType);
    mem.createVariable("___a", numberType);
    mem.createVariable("a1", numberType);
    mem.createVariable("a_1", numberType);
    mem.createVariable("Xxx_3p1c_v4r14bl3_xxX", numberType);
    assertion.truthy(mem.hasVariable("_a"), "memory should have a variable with a key starting with a underscores");
    assertion.truthy(mem.hasVariable("___a"), "memory should have a variable with a key starting with multiple underscores");
    assertion.truthy(mem.getVariable("a1"), "memory should have a variable with a key containing a number in it (not starting with it)");
    assertion.truthy(mem.getVariable("a_1"), "memory should have a variable with a key containing a number and a underscores in it");
    assertion.truthy(mem.hasVariable("Xxx_3p1c_v4r14bl3_xxX"), "memory should have a variable with a key containing multiple numbers and underscores in it");
});

test("Memory should not allow creating variables with keys that have already been created", assertion => {
    const mem = new Memory();
    mem.createVariable("a", numberType);
    assertion.throws(() => mem.createVariable("a", numberType), Error, "creating another variable with key \"a\" throws an Error");
});

test("Memory should not allow getting variables that do not exist", assertion => {
    const mem = new Memory();
    assertion.throws(() => mem.getVariable("a"), Error, "getting an undefined variable with key \"a\" throws an Error");
});

test("Memory should not allow changing variables that do not exist", assertion => {
    const mem = new Memory();
    assertion.throws(() => mem.setVariable("a", n(2)), Error, "changing an undefined variable with key \"a\" throws an Error");
});

test("Memory should not allow creating variables with illegal keys", assertion => {
    const mem = new Memory();
    assertion.throws(() => mem.createVariable("true", numberType), Error, "creating a variable with key \"true\" throws an Error");
    assertion.throws(() => mem.createVariable("false", stringType), Error, "creating a variable with key \"false\" throws an Error");
    assertion.throws(() => mem.createVariable("undefined", stringType), Error, "creating a variable with key \"undefined\" throws an Error");
    assertion.throws(() => mem.createVariable("\"key\"", stringType), Error, "creating a variable with characters that are not numbers, underscore or in the english alphabet throws an Error");
    assertion.throws(() => mem.createVariable("123", booleanType), Error, "creating a variable with a key that is a number throws an Error");
    assertion.throws(() => mem.createVariable("123test", numberType), Error, "creating a variable starting with a number throws an Error");
    assertion.throws(() => mem.createVariable("", stringType), Error, "creating a variable with an empty key throws an Error");
});

test("Memory should emit the expected events", assertion => {
    let variableAddedEventEmitted = false;
    let variableChangedEventEmitted = false;
    let variableAccessedEventEmitted = false;

    const mem = new Memory();

    mem.emitter.addListener(Memory.variableDeclaredEvent, () => {
        variableAddedEventEmitted = true;
    });
    mem.emitter.addListener(Memory.variableChangedEvent, () => {
        variableChangedEventEmitted = true;
    });
    mem.emitter.addListener(Memory.variableAccessedEvent, () => {
        variableAccessedEventEmitted = true;
    });

    assertion.falsy(variableAddedEventEmitted, "memory.variable.added event should not be fired during object creation");
    assertion.falsy(variableChangedEventEmitted, "memory.variable.changed event should not be fired during object creation");
    assertion.falsy(variableAccessedEventEmitted, "memory.variable.accessed event should not be fired during object creation");

    mem.createVariable("a", numberType);

    assertion.truthy(variableAddedEventEmitted, "memory.variable.added event should be fired during variable creation");
    assertion.falsy(variableChangedEventEmitted, "memory.variable.changed event should not be fired during variable creation");
    assertion.falsy(variableAccessedEventEmitted, "memory.variable.accessed event should not be fired during variable creation");

    variableAddedEventEmitted = false;

    mem.setVariable("a", n(1));

    assertion.falsy(variableAddedEventEmitted, "memory.variable.added event should not be fired during variable changing");
    assertion.truthy(variableChangedEventEmitted, "memory.variable.changed event should be fired during variable changing");
    assertion.falsy(variableAccessedEventEmitted, "memory.variable.accessed event should not be fired during variable changing");

    variableChangedEventEmitted = false;

    mem.getVariable("a");

    assertion.falsy(variableAddedEventEmitted, "memory.variable.added event should not be fired during getting a variable");
    assertion.falsy(variableChangedEventEmitted, "memory.variable.changed event should not be fired during getting a variable");
    assertion.truthy(variableAccessedEventEmitted, "memory.variable.accessed event should be fired during getting a variable");
});

test("Memory should be 'strongly-typed' and should not allow a variable to change types", assertion => {
    const mem = new Memory();
    const types: ValueType[] = [numberType, stringType, booleanType]
    const values: Value[] = [n(3), str("hello"), b(true)]

    for(const [type, value] of cartesian(types, values).filter(([t, v]) => !v.type.matches(t))) {
        mem.clear();
        mem.createVariable("a", type);
        assertion.throws(() => mem.setVariable("a", value), Error, `setting a variable of type ${type.id} to a value of type ${value.type.id} should throw an error`);
    }
});

test("Memory should not allow changing constant variables", assertion => {
    const mem = new Memory();
    mem.createVariable("a", numberType, true);
    mem.setVariable("a", n(1));
    assertion.throws(() => mem.setVariable("a", n(4)), Error, "setting a constant variable should throw an error");
});

test("Memory should be able to provide a snapshot of its entries", assertion => {
    const mem = new Memory();
    mem.createVariable("a", numberType);
    mem.createVariable("b", stringType, true);
    mem.createVariable("c", booleanType);
    mem.setVariable("a", n(1));
    mem.setVariable("b", str("hi"));
    mem.setVariable("c", b(true));
    const entries = mem.getEntries();
    const expected = [
        ["a", numberType, n(1), false],
        ["b", stringType, str("hi"), true],
        ["c", booleanType, b(true), false]
    ];
    assertion.eq(entries.length, expected.length, "memory should return with the expected number of entries")
    for(let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        const exp = expected[i]!;
        assertion.eq(entry.key, exp[0]!, `a returned entry with key [${exp[0]!}] should have the expected key`);
        assertion.eq(entry.type, exp[1]!, `a returned entry with key [${exp[0]!}] should have the expected type`);
        jsonEqual(assertion, entry.value, exp[2]!, `a returned entry with key [${exp[0]!}] should have the expected value`);
        assertion.eq(entry.constant, exp[3]!, `a returned entry with key [${exp[0]!}] should have the expected modifiability`)
    }
});

test("Memory should be able to provide a snapshot of its entries of a certain base type", assertion => {
    const mem = new Memory();
    mem.createVariable("a", numberType);
    mem.createVariable("b", stringType);
    mem.createVariable("c", booleanType, true);
    mem.createVariable("d", new ArrayType(numberType), true);
    mem.createVariable("e", new ArrayType(stringType));
    mem.createVariable("f", new ArrayType(booleanType), true);
    mem.setVariable("a", n(1));
    mem.setVariable("b", str("hi"));
    mem.setVariable("c", b(true));
    mem.setVariable("d", array([n(1), n(1)]));
    mem.setVariable("e", array([str("almafa"), str("körtefa")]));
    mem.setVariable("f", array([b(false)]));
    const entries = mem.getAllValuesWithBaseIdentifier("array");
    const expected = [
        ["d", new ArrayType(numberType), array([n(1), n(1)]), true],
        ["e", new ArrayType(stringType), array([str("almafa"), str("körtefa")]), false],
        ["f", new ArrayType(booleanType), array([b(false)]), true]
    ];
    assertion.eq(entries.length, expected.length, "memory should return with the expected number of entries")
    for(let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        const exp = expected[i]!;
        assertion.eq(entry.key, exp[0]!, `a returned entry with key [${exp[0]!}] should have the expected key`);
        jsonEqual(assertion, entry.type, exp[1]!, `a returned entry with key [${exp[0]!}] should have the expected type`);
        jsonEqual(assertion, entry.value, exp[2]!, `a returned entry with key [${exp[0]!}] should have the expected value`);
        assertion.eq(entry.constant, exp[3]!, `a returned entry with key [${exp[0]!}] should have the expected modifiability`)
    }
});