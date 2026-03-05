import {test} from "zora"
import { Memory, type VariableType } from "@structovision/app/model/memory";
import { cartesian } from "../testutil.ts";

test("Memory should allow declaring, changing and getting values", assertion => {
    const mem = new Memory();
    mem.createVariable("a", "number", 1);
    mem.createVariable("b", "string", "hi");
    mem.createVariable("c", "boolean", true);
    assertion.truthy(mem.hasVariable("a"), "Memory should have a variable with key \"a\"");
    assertion.truthy(mem.hasVariable("b"), "Memory should have a variable with key \"b\"");
    assertion.truthy(mem.hasVariable("c"), "Memory should have a variable with key \"c\"");
    assertion.equal(mem.getVariable("a"), 1, "Variable \"a\" should have the value of 1");
    assertion.equal(mem.getVariable("b"), "hi", "Variable \"a\" should have the value of \"hi\"");
    assertion.equal(mem.getVariable("c"), true, "Variable \"a\" should have the value of true");
    mem.setVariable("a", 3);
    mem.setVariable("b", "hello");
    mem.setVariable("c", false);
    assertion.truthy(mem.hasVariable("a"), "Memory should still have a variable with key \"a\" after changing it");
    assertion.truthy(mem.hasVariable("b"), "Memory should still have a variable with key \"b\" after changing it");
    assertion.truthy(mem.hasVariable("c"), "Memory should still have a variable with key \"c\" after changing it");
    assertion.equal(mem.getVariable("a"), 3, "Variable \"a\" should have the value of 3 after changing it");
    assertion.equal(mem.getVariable("b"), "hello", "Variable \"b\" should have the value of \"hello\" after changing it");
    assertion.equal(mem.getVariable("c"), false, "Variable \"c\" should have the value of false after changing it");
});

test("Memory should allow declaring variables with special names", assertion => {
    const mem = new Memory();
    mem.createVariable("_a", "number", 1);
    mem.createVariable("___a", "number", 2);
    mem.createVariable("a1", "number", 3);
    mem.createVariable("a_1", "number", 3);
    mem.createVariable("Xxx_3p1c_v4r14bl3_xxX", "number", 4);
    assertion.truthy(mem.hasVariable("_a"), "Memory should have a variable with a key starting with a underscores");
    assertion.truthy(mem.hasVariable("___a"), "Memory should have a variable with a key starting with multiple underscores");
    assertion.truthy(mem.getVariable("a1"), "Memory should have a variable with a key containing a number in it (not starting with it)");
    assertion.truthy(mem.getVariable("a_1"), "Memory should have a variable with a key containing a number and a underscores in it");
    assertion.truthy(mem.hasVariable("Xxx_3p1c_v4r14bl3_xxX"), "Memory should have a variable with a key containing multiple numbers and underscores in it");
});

test("Memory should not allow creating variables with keys that have already been created", assertion => {
    const mem = new Memory();
    mem.createVariable("a", "number", 1);
    assertion.throws(() => mem.createVariable("a", "number", 1), Error, "Creating another variable with key \"a\" throws an Error");
});

test("Memory should not allow getting variables that do not exist", assertion => {
    const mem = new Memory();
    assertion.throws(() => mem.getVariable("a"), Error, "Getting an undefined variable with key \"a\" throws an Error");
});

test("Memory should not allow changing variables that do not exist", assertion => {
    const mem = new Memory();
    assertion.throws(() => mem.setVariable("a", 2), Error, "Changing an undefined variable with key \"a\" throws an Error");
});

test("Memory should not allow creating variables with illegal keys", assertion => {
    const mem = new Memory();
    assertion.throws(() => mem.createVariable("true", "number", 2), Error, "Creating a variable with key \"true\" throws an Error");
    assertion.throws(() => mem.createVariable("false", "string", "test"), Error, "Creating a variable with key \"false\" throws an Error");
    assertion.throws(() => mem.createVariable("123", "boolean", false), Error, "Creating a variable with a key that is a number throws an Error");
    assertion.throws(() => mem.createVariable("123test", "number", -3.2), Error, "Creating a variable starting with a number throws an Error");
    assertion.throws(() => mem.createVariable("", "string", "this is empty keyed"), Error, "Creating a variable with an empty key throws an Error");
});

test("Memory should emit the expected events", assertion => {
    let variableAddedEventEmitted = false;
    let variableChangedEventEmitted = false;

    const mem = new Memory();

    mem.emitter.addListener(Memory.variableAddedEvent, () => {
        variableAddedEventEmitted = true;
    });
    mem.emitter.addListener(Memory.variableChangedEvent, () => {
        variableChangedEventEmitted = true;
    });

    assertion.falsy(variableAddedEventEmitted, "memory.variable.added event should not be fired during object creation");
    assertion.falsy(variableChangedEventEmitted, "memory.variable.changed event should not be fired during object creation");

    mem.createVariable("a", "number", 1);

    assertion.truthy(variableAddedEventEmitted, "memory.variable.added event should be fired during variable creation");
    assertion.falsy(variableChangedEventEmitted, "memory.variable.changed event should not be fired during variable creation");

    variableAddedEventEmitted = false;

    mem.setVariable("a", 2);

    assertion.falsy(variableAddedEventEmitted, "memory.variable.added event should not be fired during variable changing");
    assertion.truthy(variableChangedEventEmitted, "memory.variable.changed event should be fired during variable changing");

    variableChangedEventEmitted = false;

    mem.getVariable("a");

    assertion.falsy(variableAddedEventEmitted, "memory.variable.added event should not be fired during getting a variable");
    assertion.falsy(variableChangedEventEmitted, "memory.variable.changed event should not be fired during getting a variable");
});

test("Memory should be 'strongly-typed' and should not allow a variable to change types", assertion => {
    const mem = new Memory();
    const types: VariableType[] = ["number", "string", "boolean"]
    const typeToValue = {
        "number": 1,
        "string": "alma",
        "boolean": true
    }
    for(const [type1, type2] of cartesian(types, types).filter(([t1, t2]) => t1 != t2)) {
        mem.clear();
        mem.createVariable("a", type1);
        assertion.throws(() => mem.setVariable("a", typeToValue[type2]), Error, `setting a variable of type ${type1} to a value of type ${type2} should throw an error`);
    }
});

test("Memory should not allow changing constant variables", assertion => {
    const mem = new Memory();
    mem.createVariable("a", "number", 1, true);
    assertion.throws(() => mem.setVariable("a", 4), Error, "setting a constant variable should throw an error");
});