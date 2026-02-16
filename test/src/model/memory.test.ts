import {test} from "zora"
import { Memory } from "@structovision/app/model/memory";
import ee2 from "eventemitter2"

test("Memory should allow declaring, changing and getting values", assertion => {
    const mem = new Memory();
    mem.createVariable("a", 1);
    mem.createVariable("b", "hi");
    mem.createVariable("c", true);
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
    mem.createVariable("_a", 1);
    mem.createVariable("___a", 2);
    mem.createVariable("a1", 3);
    mem.createVariable("a_1", 3);
    mem.createVariable("Xxx_3p1c_v4r14bl3_xxX", 4);
    assertion.truthy(mem.hasVariable("_a"), "Memory should have a variable with a key starting with a underscores");
    assertion.truthy(mem.hasVariable("___a"), "Memory should have a variable with a key starting with multiple underscores");
    assertion.truthy(mem.getVariable("a1"), "Memory should have a variable with a key containing a number in it (not starting with it)");
    assertion.truthy(mem.getVariable("a_1"), "Memory should have a variable with a key containing a number and a underscores in it");
    assertion.truthy(mem.hasVariable("Xxx_3p1c_v4r14bl3_xxX"), "Memory should have a variable with a key containing multiple numbers and underscores in it");
});

test("Memory should not allow creating variables with keys that have already been created", assertion => {
    const mem = new Memory();
    mem.createVariable("a", 1);
    assertion.throws(() => mem.createVariable("a", 1), Error, "Creating another variable with key \"a\" throws an Error");
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
    assertion.throws(() => mem.createVariable("true", 2), Error, "Creating a variable with key \"true\" throws an Error");
    assertion.throws(() => mem.createVariable("false", "test"), Error, "Creating a variable with key \"false\" throws an Error");
    assertion.throws(() => mem.createVariable("123", false), Error, "Creating a variable with a key that is a number throws an Error");
    assertion.throws(() => mem.createVariable("123test", -3.2), Error, "Creating a variable starting with a number throws an Error");
    assertion.throws(() => mem.createVariable("", "this is empty keyed"), Error, "Creating a variable with an empty key throws an Error");
});

test("Memory should emit the expected events", assertion => {
    const emitter = new ee2.EventEmitter2();
    let variableAddedEventEmitted = false;
    let variableChangedEventEmitted = false;

    emitter.addListener(Memory.variableAddedEvent, () => {
        variableAddedEventEmitted = true;
    });
    emitter.addListener(Memory.variableChangedEvent, () => {
        variableChangedEventEmitted = true;
    });

    const mem = new Memory(emitter);

    assertion.falsy(variableAddedEventEmitted, "memory.variable.added event should not be fired during object creation");
    assertion.falsy(variableChangedEventEmitted, "memory.variable.changed event should not be fired during object creation");

    mem.createVariable("a", 1);

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