import {test} from "zora";
import ee2 from "eventemitter2"
import {Structogram, AssignmentBlock, PrintBlock, TrueFalseBranchingBlock, MultiBranchingBlock, CountingLoopBlock, FrontTestingLoopBlock, BackTestingLoopBlock, ControlBlock} from "@structovision/app/model/structogram";
import { cartesian, jsonEqual, n, str } from "../testutil.ts";
import { ArrayType, booleanType, numberType, SimpleValue, SinglyLinkedListNodeTemplate, stringType, UtilityObject } from "@structovision/app/model/types";

function createBasicStructogram(): [ee2.EventEmitter2, Structogram] {
    const emitter = new ee2.EventEmitter2();
    const structogram = new Structogram(emitter);
    return [emitter, structogram];
}

function runStructogram(structogram: Structogram, input: Record<string, string> = {}) {
    console.log(structogram.preRun(input))
    structogram.runStep();
    while(structogram.running) {
        structogram.runStep();
    }
}

test("input data declaration should create entry in memory", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareInputData("a", numberType);

    structogram.preRun({"a": "12"});

    assertion.truthy(structogram.memory.hasVariable("a"), "the memory should have a variable with key [a] defined");
    jsonEqual(assertion, structogram.memory.getVariable("a"), n(12), "the memory variable [a] should have a value of 12");
    assertion.truthy(structogram.memory.isConstant("a"), "the variable associated with input data should be constant");

});

test("auxilary data declaration should create entry in memory", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareAuxData("a", numberType);

    structogram.preRun();

    assertion.truthy(structogram.memory.hasVariable("a"), "the memory should have a variable with key [a] defined");
});

test("output data declaration should create entry in memory", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareOutputData("a", numberType);

    structogram.preRun();

    assertion.truthy(structogram.memory.hasVariable("a"), "the memory should have a variable with key [a] defined");
});

test("assignment blocks should work as expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareAuxData("a", numberType);

    const assignmentBlock = new AssignmentBlock(structogram);
    assignmentBlock.keyOption.key = "a";
    assignmentBlock.statementOption.statement = "3+4+5";
    structogram.startingBlock = assignmentBlock;

    runStructogram(structogram);

    jsonEqual(assertion, structogram.memory.getVariable("a"), SimpleValue.number(12), "a stuctrogram should be able to assign a value")
});

test("control blocks should work as expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareInputData("text", stringType);

    const controlBlock = new ControlBlock(structogram);
    controlBlock.statementOption.statement = "swap(text, 1, 8)";
    structogram.startingBlock = controlBlock;

    runStructogram(structogram, {"text": "\"körtés pite\""});

    jsonEqual(assertion, structogram.memory.getVariable("text"), str("pörtés kite"), "a stuctrogram should be able to handle control blocks")
});

test("print blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();

    let printedText = "";

    emitter.addListener(Structogram.printEvent, text => printedText = text);

    structogram.declareInputData("text", stringType);

    const printBlock = new PrintBlock(structogram);
    printBlock.statementOption.statement = "text";
    structogram.startingBlock = printBlock;

    runStructogram(structogram, {"text": "\"hello world\""});

    assertion.eq(printedText, "hello world", "a stuctrogram should able to print a value")
});

test("true-false branching blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();

    let printedText = "";

    emitter.addListener(Structogram.printEvent, text => printedText = text);

    structogram.declareAuxData("a", booleanType);
    const assignmentBlock = new AssignmentBlock(structogram);
    assignmentBlock.keyOption.key = "a";
    assignmentBlock.statementOption.statement = "true";
    const truefalseBlock = new TrueFalseBranchingBlock(structogram);
    truefalseBlock.conditionOption.statement = "a";
    const trueBlock = new PrintBlock(structogram);
    trueBlock.statementOption.statement = "\"it was true\"";
    const falseBlock = new PrintBlock(structogram);
    falseBlock.statementOption.statement = "\"it was false\"";
    truefalseBlock.trueBranch = trueBlock;
    truefalseBlock.falseBranch = falseBlock;
    assignmentBlock.next = truefalseBlock;

    structogram.startingBlock = assignmentBlock;

    runStructogram(structogram);

    assertion.eq(printedText, "it was true", "the true-false branching block should direct the control to the true branch");

    assignmentBlock.statementOption.statement = "false";

    runStructogram(structogram);

    assertion.eq(printedText, "it was false", "the true-false branching block should direct the control to the false branch");
});

test("multi branching blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();

    let printedText = "";

    emitter.addListener(Structogram.printEvent, text => printedText = text);

    structogram.declareAuxData("v", numberType);
    const assignmentBlock = new AssignmentBlock(structogram);
    assignmentBlock.keyOption.key = "v";
    assignmentBlock.statementOption.statement = "1";
    const multiBranchingBlock = new MultiBranchingBlock(structogram);
    multiBranchingBlock.conditionListOption.statements = [
        "v = 1",
        "v = 2",
        "v = 3"
    ];
    const firstBlock = new PrintBlock(structogram);
    firstBlock.statementOption.statement = "\"first\"";
    const secondBlock = new PrintBlock(structogram);
    secondBlock.statementOption.statement = "\"second\"";
    const thirdBlock = new PrintBlock(structogram);
    thirdBlock.statementOption.statement = "\"third\"";
    const fourthBlock = new PrintBlock(structogram);
    fourthBlock.statementOption.statement = "\"fourth\"";
    multiBranchingBlock.setSubBlock("branch0", firstBlock);
    multiBranchingBlock.setSubBlock("branch1", secondBlock);
    multiBranchingBlock.setSubBlock("branch2", thirdBlock);
    multiBranchingBlock.setSubBlock("else", fourthBlock);
    assignmentBlock.next = multiBranchingBlock;

    structogram.startingBlock = assignmentBlock;

    runStructogram(structogram);

    assertion.eq(printedText, "first", "the multi branching block should direct the control to the correct branch (1)");

    assignmentBlock.statementOption.statement = "2";

    runStructogram(structogram);

    assertion.eq(printedText, "second", "the multi branching block should direct the control to the correct branch (2)");

    assignmentBlock.statementOption.statement = "3";

    runStructogram(structogram);

    assertion.eq(printedText, "third", "the multi branching block should direct the control to the correct branch (3)");

    assignmentBlock.statementOption.statement = "4";

    runStructogram(structogram);

    assertion.eq(printedText, "fourth", "the multi branching block should direct the control to the correct branch (4)");
});

test("counting loop blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();

    let printLog: string[] = [];

    emitter.addListener(Structogram.printEvent, text => printLog.push(text));

    structogram.declareAuxData("i", numberType);

    const countingLoopBlock = new CountingLoopBlock(structogram);
    countingLoopBlock.variableKeyOption.key = "i";
    countingLoopBlock.fromOption.statement = "1";
    countingLoopBlock.toOption.statement = "10";
    countingLoopBlock.stepOption.statement = "1";
    const loopedBlock = new PrintBlock(structogram);
    loopedBlock.statementOption.statement = "\"number \"&str(i)";
    countingLoopBlock.loopStart = loopedBlock;
    const finishedBlock = new PrintBlock(structogram);
    finishedBlock.statementOption.statement = "\"finished\"";
    countingLoopBlock.next = finishedBlock;

    structogram.startingBlock = countingLoopBlock;

    runStructogram(structogram);

    const expected = [];
    for(let i = 1; i <= 10; i++) {
        expected.push("number " + i);
    }
    expected.push("finished");

    assertion.eq(printLog, expected, "the counting loop block should direct the control as expected")
});

test("front testing loop blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();

    let printLog: string[] = [];

    emitter.addListener(Structogram.printEvent, text => printLog.push(text));

    structogram.declareAuxData("i", stringType);
    const assignmentBlock = new AssignmentBlock(structogram);
    assignmentBlock.keyOption.key = "i";
    assignmentBlock.statementOption.statement = "\"a\"";
    const frontTestingLoopBlock = new FrontTestingLoopBlock(structogram);
    frontTestingLoopBlock.conditionOption.statement = "len(i) < 4";
    assignmentBlock.next = frontTestingLoopBlock;
    const loopedBlock = new PrintBlock(structogram);
    loopedBlock.statementOption.statement = "i";
    frontTestingLoopBlock.loopStart = loopedBlock;
    const loopedBlock2 = new AssignmentBlock(structogram);
    loopedBlock2.keyOption.key = "i";
    loopedBlock2.statementOption.statement = "i&\"a\"";
    loopedBlock.next = loopedBlock2;
    const finishedBlock = new PrintBlock(structogram);
    finishedBlock.statementOption.statement = "\"finished\"";
    frontTestingLoopBlock.next = finishedBlock;

    structogram.startingBlock = assignmentBlock;

    runStructogram(structogram);

    assertion.eq(printLog, ["a", "aa", "aaa", "finished"], "the front testing loop block should direct the control as expected")
});

test("back testing loop blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();

    let printLog: string[] = [];

    emitter.addListener(Structogram.printEvent, text => printLog.push(text));

    structogram.declareAuxData("i", stringType);
    const assignmentBlock = new AssignmentBlock(structogram);
    assignmentBlock.keyOption.key = "i";
    assignmentBlock.statementOption.statement = "\"a\"";
    const backTestingLoopBlock = new BackTestingLoopBlock(structogram);
    backTestingLoopBlock.conditionOption.statement = "len(i) < 1 or len(i) > 2 and len(i) <= 3";
    assignmentBlock.next = backTestingLoopBlock;
    const loopedBlock = new PrintBlock(structogram);
    loopedBlock.statementOption.statement = "i";
    backTestingLoopBlock.loopStart = loopedBlock;
    const loopedBlock2 = new AssignmentBlock(structogram);
    loopedBlock2.keyOption.key = "i";
    loopedBlock2.statementOption.statement = "i&\"aa\"";
    loopedBlock.next = loopedBlock2;
    const finishedBlock = new PrintBlock(structogram);
    finishedBlock.statementOption.statement = "\"finished\"";
    backTestingLoopBlock.next = finishedBlock;

    structogram.startingBlock = assignmentBlock;

    runStructogram(structogram);

    assertion.eq(printLog, ["a", "aaa", "finished"], "the back testing loop block should direct the control as expected")
});

test("a complex structogram should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();

    let printLog: string[] = [];

    emitter.addListener(Structogram.printEvent, text => printLog.push(text));

    structogram.declareAuxData("a", numberType);
    structogram.declareAuxData("b", numberType);
    structogram.declareAuxData("c", numberType);
    structogram.declareAuxData("i", numberType);
    const assignmentBlocka = new AssignmentBlock(structogram);
    assignmentBlocka.keyOption.key = "a";
    assignmentBlocka.statementOption.statement = "1";
    const assignmentBlockb = new AssignmentBlock(structogram);
    assignmentBlockb.keyOption.key = "b";
    assignmentBlockb.statementOption.statement = "1";
    assignmentBlocka.next = assignmentBlockb;
    const assignmentBlockc = new AssignmentBlock(structogram);
    assignmentBlockc.keyOption.key = "c";
    assignmentBlockc.statementOption.statement = "2";
    assignmentBlockb.next = assignmentBlockc
    const countingLoopBlock = new CountingLoopBlock(structogram);
    countingLoopBlock.fromOption.statement = "1";
    countingLoopBlock.toOption.statement = "10";
    countingLoopBlock.stepOption.statement = "1";
    countingLoopBlock.variableKeyOption.key = "i";
    assignmentBlockc.next = countingLoopBlock;
    const assignmentBlock1 = new AssignmentBlock(structogram);
    assignmentBlock1.keyOption.key = "c";
    assignmentBlock1.statementOption.statement = "a+b";
    countingLoopBlock.loopStart = assignmentBlock1;
    const assignmentBlock2 = new AssignmentBlock(structogram);
    assignmentBlock2.keyOption.key = "a";
    assignmentBlock2.statementOption.statement = "b";
    assignmentBlock1.next = assignmentBlock2;
    const assignmentBlock3 = new AssignmentBlock(structogram);
    assignmentBlock3.keyOption.key = "b";
    assignmentBlock3.statementOption.statement = "c";
    assignmentBlock2.next = assignmentBlock3;
    const frontTestingLoop = new FrontTestingLoopBlock(structogram);
    frontTestingLoop.conditionOption.statement = "b mod 2 != 0";
    assignmentBlock3.next = frontTestingLoop;
    const assignmentBlock4 = new AssignmentBlock(structogram);
    assignmentBlock4.keyOption.key = "c";
    assignmentBlock4.statementOption.statement = "a+b";
    frontTestingLoop.loopStart = assignmentBlock4;
    const assignmentBlock5 = new AssignmentBlock(structogram);
    assignmentBlock5.keyOption.key = "a";
    assignmentBlock5.statementOption.statement = "b";
    assignmentBlock4.next = assignmentBlock5;
    const assignmentBlock6 = new AssignmentBlock(structogram);
    assignmentBlock6.keyOption.key = "b";
    assignmentBlock6.statementOption.statement = "c";
    assignmentBlock5.next = assignmentBlock6;
    const printBlock = new PrintBlock(structogram);
    printBlock.statementOption.statement = "str(b)";
    frontTestingLoop.next = printBlock;
    const truefalseBlock = new TrueFalseBranchingBlock(structogram);
    truefalseBlock.conditionOption.statement = "c > 100000";
    countingLoopBlock.next = truefalseBlock;
    const printBlock2 = new PrintBlock(structogram);
    printBlock2.statementOption.statement = "\"the last value is greater than 100000\"";
    const printBlock3 = new PrintBlock(structogram);
    printBlock3.statementOption.statement = "\"the last value is less than 100000\"";
    truefalseBlock.trueBranch = printBlock2;
    truefalseBlock.falseBranch = printBlock3;
    const multiBlock = new MultiBranchingBlock(structogram);
    multiBlock.conditionListOption.statements = [
        "c mod 3 = 0",
        "c mod 7 = 0",
        "c mod 11 = 0",
        "true"
    ];
    truefalseBlock.next = multiBlock;
    const printBlock4 = new PrintBlock(structogram);
    printBlock4.statementOption.statement = "\"the last value is divisble by 3\"";
    const printBlock5 = new PrintBlock(structogram);
    printBlock5.statementOption.statement = "\"the last value is divisble by 7\"";
    const printBlock6 = new PrintBlock(structogram);
    printBlock6.statementOption.statement = "\"the last value is divisble by 11\"";
    const printBlock7 = new PrintBlock(structogram);
    printBlock7.statementOption.statement = "\"the last value is not divisble by 3, 7 or 11\"";
    multiBlock.setSubBlock("branch0", printBlock4);
    multiBlock.setSubBlock("branch1", printBlock5);
    multiBlock.setSubBlock("branch2", printBlock6);
    multiBlock.setSubBlock("branch3", printBlock7);
    const printBlock8 = new PrintBlock(structogram);
    printBlock8.statementOption.statement = "\"it's done\"";
    multiBlock.next = printBlock8;

    structogram.startingBlock = assignmentBlocka;

    runStructogram(structogram);

    assertion.eq(printLog, ["2", "8", "34", "144", "610", "2584", "10946", "46368", "196418", "832040", "the last value is greater than 100000", "the last value is divisble by 11", "it's done"], "complex structogram should have the expected output");
});

test("assignment block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new AssignmentBlock(structogram);
    block.keyOption.key = "a";
    block.statementOption.statement = "\"hello\"";
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "assignment block should raise an issue on the assignment of an undeclared variable");

    structogram.declareAuxData("a", numberType);

    assertion.truthy(structogram.preRun().length > 0, "assignment block should raise an issue on the violation of type restrictions");

    block.statementOption.statement = "an invalid statement";

    assertion.truthy(structogram.preRun().length > 0, "assignment block should raise an issue if its statement is invalid");

    structogram.clearData();
    structogram.declareInputData("a", numberType);
    block.statementOption.statement = "1";

    assertion.truthy(structogram.preRun({"a": "1"}).length > 0, "assignment block should raise an issue on the assignment of a constant variable");
});

test("print block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new ControlBlock(structogram);
    block.statementOption.statement = "an invalid statement";
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "control block should raise an issue if its statement is invalid");
});

test("print block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new PrintBlock(structogram);
    block.statementOption.statement = "an invalid statement";
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "print block should raise an issue if its statement is invalid");
});

test("truefalsebranching block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new TrueFalseBranchingBlock(structogram);
    block.conditionOption.statement = "";
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "truefalsebranching block should raise an issue if its condition is an invalid statement");

    block.conditionOption.statement = "5";

    assertion.truthy(structogram.preRun().length > 0, "truefalsebranching block should raise an issue if its condition is not returning a boolean");
});

test("multibranching block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new MultiBranchingBlock(structogram);
    block.conditionListOption.statements = [
        "3 < 4",
        "3 > 4",
        "invalid statement"
    ];
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "multibranching block should raise an issue if at least one of its conditions is an invalid statement");

    block.conditionListOption.statements = [
        "3 < 4",
        "3 > 4",
        "5"
    ];

    assertion.truthy(structogram.preRun().length > 0, "multibranching block should raise an issue if at least one of its conditions is not returning a boolean");
});



test("counting loop block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new CountingLoopBlock(structogram);
    block.variableKeyOption.key = "i"
    block.fromOption.statement = "1";
    block.toOption.statement = "10";
    block.stepOption.statement = "1";
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue on the usage of an undeclared variable");

    structogram.declareInputData("i", numberType)

    assertion.truthy(structogram.preRun({"i": "1"}).length > 0, "countingloop block should raise an issue on the usage of a constant variable");

    structogram.clearData();
    structogram.declareAuxData("i", stringType);

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue on the violation of type restrictions");

    structogram.clearData();
    structogram.declareAuxData("i", numberType);
    block.fromOption.statement = "invalid statement";

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue if its from statement is invalid");

    block.fromOption.statement = "true";

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue if its from statement is not a number");

    block.fromOption.statement = "1";
    block.toOption.statement = "invalid statement";

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue if its to statement is invalid");

    block.toOption.statement = "\"e\"";

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue if its to statement is not a number");

    block.toOption.statement = "10";
    block.stepOption.statement = "invalid statement";

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue if its step statement is invalid");

    block.stepOption.statement = "\"alma\"";

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue if its step statement is not a number");
});

test("fronttestingloop block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new FrontTestingLoopBlock(structogram);
    block.conditionOption.statement = "";
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "fronttestingloop block should raise an issue if its condition is an invalid statement");

    block.conditionOption.statement = "5";

    assertion.truthy(structogram.preRun().length > 0, "fronttestingloop block should raise an issue if its condition is not returning a boolean");
});

test("backtestingloop block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new BackTestingLoopBlock(structogram);
    block.conditionOption.statement = "";
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "backtestingloop block should raise an issue if its condition is an invalid statement");

    block.conditionOption.statement = "5";

    assertion.truthy(structogram.preRun().length > 0, "backtestingloop block should raise an issue if its condition is not returning a boolean");
});

test("duplicate data key in specification should result in an issue being raised", assertion => {
    const [_, structogram] = createBasicStructogram();

    const definitions: [string, () => void][] = [
        ["input", () => structogram.declareInputData("a", numberType)],
        ["auxiliary", () => structogram.declareAuxData("a", stringType)],
        ["output", () => structogram.declareOutputData("a", booleanType)]
    ];

    for(const [def1, def2] of cartesian(definitions, definitions)) {
        structogram.clearData();
        def1[1]();
        def2[1]();

        if(def1[0] == def2[0]) continue;

        const inputs: Record<string, string> = {};
        if(def1[0] == "input" || def2[0] == "input") inputs["a"] = "3";

        assertion.truthy(structogram.preRun(inputs).length > 0, `duplicate data keys in ${def1[0]} and ${def2[0]} should raise an issue`);
    }
});

test("invalid input should result in an issue being raised", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareInputData("a", numberType);

    assertion.truthy(structogram.preRun({"a": "true"}).length > 0, `input being the wrong type should raise an issue`);
    assertion.truthy(structogram.preRun({"a": "1", "b": "3"}).length > 0, `too many inputs should raise an issue`);
    assertion.truthy(structogram.preRun({}).length > 0, `missing input should raise an issue`);
    assertion.truthy(structogram.preRun({"a": "invalid"}).length > 0, `invalid input should raise an issue`);
});

test("assignment blocks should work as expected with fields", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareAuxData("a", SinglyLinkedListNodeTemplate.getType([numberType]));

    const assignmentBlock1 = new AssignmentBlock(structogram);
    assignmentBlock1.keyOption.key = "a";
    assignmentBlock1.statementOption.statement = "s1l(3)";
    structogram.startingBlock = assignmentBlock1;
    const assignmentBlock2 = new AssignmentBlock(structogram);
    assignmentBlock2.keyOption.key = "a.next";
    assignmentBlock2.statementOption.statement = "s1l(4)";
    assignmentBlock1.next = assignmentBlock2;

    runStructogram(structogram);

    jsonEqual(assertion, (structogram.memory.getVariable("a") as UtilityObject).get("next"), SinglyLinkedListNodeTemplate.construct([SimpleValue.number(4)]), "a stuctrogram should be able to assign a field's value")
});

test("assignment blocks should work as expected with indicies", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareInputData("a", new ArrayType(numberType));
    structogram.startingIndex = 10;

    const assignmentBlock = new AssignmentBlock(structogram);
    assignmentBlock.keyOption.key = "a[10]";
    assignmentBlock.statementOption.statement = "3+4+5";
    structogram.startingBlock = assignmentBlock;

    runStructogram(structogram, {"a": "{1,2,3}"});

    jsonEqual(assertion, structogram.memory.getVariable("a").indexGet(0), SimpleValue.number(12), "a stuctrogram should be able to assign a value to an element of an array")
});

test("assignment blocks should work as expected with indicies and object fields", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareInputData("a", new ArrayType(SinglyLinkedListNodeTemplate.getType([numberType])));
    structogram.startingIndex = 10;

    const assignmentBlock = new AssignmentBlock(structogram);
    assignmentBlock.keyOption.key = "a[10].key";
    assignmentBlock.statementOption.statement = "3+4+5";
    structogram.startingBlock = assignmentBlock;

    runStructogram(structogram, {"a": "{s1l(1),s1l(2),s1l(3)}"});

    jsonEqual(assertion, structogram.memory.getVariable("a").indexGet(0).get("key"), SimpleValue.number(12), "a stuctrogram should be able to assign a value to an objects field who is part of an array");

    structogram.clearData();
    structogram.declareInputData("a", SinglyLinkedListNodeTemplate.getType([new ArrayType(numberType)]));
    assignmentBlock.keyOption.key = "a.key[10]";

    runStructogram(structogram, {"a": "s1l({1,2,3})"});

    jsonEqual(assertion, structogram.memory.getVariable("a").get("key").indexGet(0), SimpleValue.number(12), "a stuctrogram should be able to assign a value to an element of an array who is a part of an object");
});