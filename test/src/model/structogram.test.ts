import {test} from "zora";
import ee2 from "eventemitter2"
import {Structogram, AssignmentBlock, PrintBlock, TrueFalseBranchingBlock, MultiBranchingBlock, CountingLoopBlock, FrontTestingLoopBlock, BackTestingLoopBlock, ControlBlock} from "@structovision/app/model/structogram";
import { cartesian, jsonEqual, n, str } from "../testutil.ts";
import { booleanType, numberType, SimpleValue, SinglyLinkedListNodeTemplate, stringType, UtilityObject } from "@structovision/app/model/types";

function createBasicStructogram(): [ee2.EventEmitter2, Structogram] {
    const emitter = new ee2.EventEmitter2();
    const structogram = new Structogram(emitter);
    return [emitter, structogram];
}

function runStructogram(structogram: Structogram, input: string[] = []) {
    console.log(structogram.preRun(input))
    structogram.runStep();
    while(structogram.running) {
        structogram.runStep();
    }
}

test("input data declaration should create entry in memory", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareInputData("a", numberType);
    
    structogram.preRun(["12"]);

    assertion.truthy(structogram.memory.hasVariable("a"), "the memory should have a variable with key [a] defined");
    jsonEqual(assertion, structogram.memory.getVariable("a"), n(12), "the memory variable [a] should have a value of 12");
    assertion.truthy(structogram.memory.isConstant("a"), "the variable associated with input data should be constant");

});

test("auxilary data declaration should create entry in memory", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareAuxData("a", numberType);
    
    structogram.preRun([]);

    assertion.truthy(structogram.memory.hasVariable("a"), "the memory should have a variable with key [a] defined");
});

test("output data declaration should create entry in memory", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareOutputData("a", numberType);
    
    structogram.preRun([]);

    assertion.truthy(structogram.memory.hasVariable("a"), "the memory should have a variable with key [a] defined");
});

test("assignment blocks should work as expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareAuxData("a", numberType);

    const assignmentBlock = new AssignmentBlock(structogram);
    assignmentBlock.keyOption.setKey("a");
    assignmentBlock.statementOption.setStatement("3+4+5");
    structogram.startingBlock = assignmentBlock;
    
    runStructogram(structogram);

    jsonEqual(assertion, structogram.memory.getVariable("a"), SimpleValue.number(12), "a stuctrogram should be able to assign a value")
});

test("control blocks should work as expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareInputData("text", stringType);

    const controlBlock = new ControlBlock(structogram);
    controlBlock.statementOption.setStatement("swap(text, 0, 7)");
    structogram.startingBlock = controlBlock;

    runStructogram(structogram, ["\"körtés pite\""]);

    jsonEqual(assertion, structogram.memory.getVariable("text"), str("pörtés kite"), "a stuctrogram should be able to handle control blocks")
});

test("print blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();
    
    let printedText = "";

    emitter.addListener(Structogram.printEvent, text => printedText = text);

    structogram.declareInputData("text", stringType);

    const printBlock = new PrintBlock(structogram);
    printBlock.statementOption.setStatement("text");
    structogram.startingBlock = printBlock;

    runStructogram(structogram, ["\"hello world\""]);

    assertion.eq(printedText, "hello world", "a stuctrogram should able to print a value")
});

test("true-false branching blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();
    
    let printedText = "";

    emitter.addListener(Structogram.printEvent, text => printedText = text);

    structogram.declareAuxData("a", booleanType);
    const assignmentBlock = new AssignmentBlock(structogram);
    assignmentBlock.keyOption.setKey("a");
    assignmentBlock.statementOption.setStatement("true");
    const truefalseBlock = new TrueFalseBranchingBlock(structogram);
    truefalseBlock.conditionOption.setStatement("a");
    const trueBlock = new PrintBlock(structogram);
    trueBlock.statementOption.setStatement("\"it was true\"");
    const falseBlock = new PrintBlock(structogram);
    falseBlock.statementOption.setStatement("\"it was false\"");
    truefalseBlock.trueBranch = trueBlock;
    truefalseBlock.falseBranch = falseBlock;
    assignmentBlock.next = truefalseBlock;

    structogram.startingBlock = assignmentBlock;

    runStructogram(structogram);

    assertion.eq(printedText, "it was true", "the true-false branching block should direct the control to the true branch");
    
    assignmentBlock.statementOption.setStatement("false");

    runStructogram(structogram);

    assertion.eq(printedText, "it was false", "the true-false branching block should direct the control to the false branch");
});

test("multi branching blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();
    
    let printedText = "";

    emitter.addListener(Structogram.printEvent, text => printedText = text);

    structogram.declareAuxData("v", numberType);
    const assignmentBlock = new AssignmentBlock(structogram);
    assignmentBlock.keyOption.setKey("v");
    assignmentBlock.statementOption.setStatement("1");
    const multiBranchingBlock = new MultiBranchingBlock(structogram);
    multiBranchingBlock.conditionListOption.setStatements([
        "v = 1",
        "v = 2",
        "v = 3"
    ]);
    const firstBlock = new PrintBlock(structogram);
    firstBlock.statementOption.setStatement("\"first\"");
    const secondBlock = new PrintBlock(structogram);
    secondBlock.statementOption.setStatement("\"second\"");
    const thirdBlock = new PrintBlock(structogram);
    thirdBlock.statementOption.setStatement("\"third\"");
    const fourthBlock = new PrintBlock(structogram);
    fourthBlock.statementOption.setStatement("\"fourth\"");
    multiBranchingBlock.setSubBlock("branch0", firstBlock);
    multiBranchingBlock.setSubBlock("branch1", secondBlock);
    multiBranchingBlock.setSubBlock("branch2", thirdBlock);
    multiBranchingBlock.setSubBlock("else", fourthBlock);
    assignmentBlock.next = multiBranchingBlock;

    structogram.startingBlock = assignmentBlock;

    runStructogram(structogram);

    assertion.eq(printedText, "first", "the multi branching block should direct the control to the correct branch (1)");

    assignmentBlock.statementOption.setStatement("2");

    runStructogram(structogram);

    assertion.eq(printedText, "second", "the multi branching block should direct the control to the correct branch (2)");

    assignmentBlock.statementOption.setStatement("3");

    runStructogram(structogram);

    assertion.eq(printedText, "third", "the multi branching block should direct the control to the correct branch (3)");

    assignmentBlock.statementOption.setStatement("4");

    runStructogram(structogram);

    assertion.eq(printedText, "fourth", "the multi branching block should direct the control to the correct branch (4)");
});

test("counting loop blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();
    
    let printLog: string[] = [];

    emitter.addListener(Structogram.printEvent, text => printLog.push(text));

    structogram.declareAuxData("i", numberType);

    const countingLoopBlock = new CountingLoopBlock(structogram);
    countingLoopBlock.variableKeyOption.setKey("i");
    countingLoopBlock.fromOption.setStatement("1");
    countingLoopBlock.toOption.setStatement("10");
    countingLoopBlock.stepOption.setStatement("1");
    const loopedBlock = new PrintBlock(structogram);
    loopedBlock.statementOption.setStatement("\"number \"&str(i)");
    countingLoopBlock.loopStart = loopedBlock;
    const finishedBlock = new PrintBlock(structogram);
    finishedBlock.statementOption.setStatement("\"finished\"");
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
    assignmentBlock.keyOption.setKey("i");
    assignmentBlock.statementOption.setStatement("\"a\"")
    const frontTestingLoopBlock = new FrontTestingLoopBlock(structogram);
    frontTestingLoopBlock.conditionOption.setStatement("len(i) < 4");
    assignmentBlock.next = frontTestingLoopBlock;
    const loopedBlock = new PrintBlock(structogram);
    loopedBlock.statementOption.setStatement("i");
    frontTestingLoopBlock.loopStart = loopedBlock;
    const loopedBlock2 = new AssignmentBlock(structogram);
    loopedBlock2.keyOption.setKey("i");
    loopedBlock2.statementOption.setStatement("i&\"a\"");
    loopedBlock.next = loopedBlock2;
    const finishedBlock = new PrintBlock(structogram);
    finishedBlock.statementOption.setStatement("\"finished\"");
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
    assignmentBlock.keyOption.setKey("i");
    assignmentBlock.statementOption.setStatement("\"a\"")
    const backTestingLoopBlock = new BackTestingLoopBlock(structogram);
    backTestingLoopBlock.conditionOption.setStatement("len(i) < 1 or len(i) > 2 and len(i) <= 3");
    assignmentBlock.next = backTestingLoopBlock;
    const loopedBlock = new PrintBlock(structogram);
    loopedBlock.statementOption.setStatement("i");
    backTestingLoopBlock.loopStart = loopedBlock;
    const loopedBlock2 = new AssignmentBlock(structogram);
    loopedBlock2.keyOption.setKey("i");
    loopedBlock2.statementOption.setStatement("i&\"aa\"");
    loopedBlock.next = loopedBlock2;
    const finishedBlock = new PrintBlock(structogram);
    finishedBlock.statementOption.setStatement("\"finished\"");
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
    assignmentBlocka.keyOption.setKey("a");
    assignmentBlocka.statementOption.setStatement("1")
    const assignmentBlockb = new AssignmentBlock(structogram);
    assignmentBlockb.keyOption.setKey("b");
    assignmentBlockb.statementOption.setStatement("1")
    assignmentBlocka.next = assignmentBlockb;
    const assignmentBlockc = new AssignmentBlock(structogram);
    assignmentBlockc.keyOption.setKey("c");
    assignmentBlockc.statementOption.setStatement("2")
    assignmentBlockb.next = assignmentBlockc
    const countingLoopBlock = new CountingLoopBlock(structogram);
    countingLoopBlock.fromOption.setStatement("1");
    countingLoopBlock.toOption.setStatement("10");
    countingLoopBlock.stepOption.setStatement("1");
    countingLoopBlock.variableKeyOption.setKey("i");
    assignmentBlockc.next = countingLoopBlock;
    const assignmentBlock1 = new AssignmentBlock(structogram);
    assignmentBlock1.keyOption.setKey("c");
    assignmentBlock1.statementOption.setStatement("a+b");
    countingLoopBlock.loopStart = assignmentBlock1;
    const assignmentBlock2 = new AssignmentBlock(structogram);
    assignmentBlock2.keyOption.setKey("a");
    assignmentBlock2.statementOption.setStatement("b");
    assignmentBlock1.next = assignmentBlock2;
    const assignmentBlock3 = new AssignmentBlock(structogram);
    assignmentBlock3.keyOption.setKey("b");
    assignmentBlock3.statementOption.setStatement("c");
    assignmentBlock2.next = assignmentBlock3;
    const frontTestingLoop = new FrontTestingLoopBlock(structogram);
    frontTestingLoop.conditionOption.setStatement("b mod 2 != 0");
    assignmentBlock3.next = frontTestingLoop;
    const assignmentBlock4 = new AssignmentBlock(structogram);
    assignmentBlock4.keyOption.setKey("c");
    assignmentBlock4.statementOption.setStatement("a+b");
    frontTestingLoop.loopStart = assignmentBlock4;
    const assignmentBlock5 = new AssignmentBlock(structogram);
    assignmentBlock5.keyOption.setKey("a");
    assignmentBlock5.statementOption.setStatement("b");
    assignmentBlock4.next = assignmentBlock5;
    const assignmentBlock6 = new AssignmentBlock(structogram);
    assignmentBlock6.keyOption.setKey("b");
    assignmentBlock6.statementOption.setStatement("c");
    assignmentBlock5.next = assignmentBlock6;
    const printBlock = new PrintBlock(structogram);
    printBlock.statementOption.setStatement("str(b)");
    frontTestingLoop.next = printBlock;
    const truefalseBlock = new TrueFalseBranchingBlock(structogram);
    truefalseBlock.conditionOption.setStatement("c > 100000");
    countingLoopBlock.next = truefalseBlock;
    const printBlock2 = new PrintBlock(structogram);
    printBlock2.statementOption.setStatement("\"the last value is greater than 100000\"");
    const printBlock3 = new PrintBlock(structogram);
    printBlock3.statementOption.setStatement("\"the last value is less than 100000\"");
    truefalseBlock.trueBranch = printBlock2;
    truefalseBlock.falseBranch = printBlock3;
    const multiBlock = new MultiBranchingBlock(structogram);
    multiBlock.conditionListOption.setStatements([
        "c mod 3 = 0",
        "c mod 7 = 0",
        "c mod 11 = 0",
        "true"
    ]);
    truefalseBlock.next = multiBlock;
    const printBlock4 = new PrintBlock(structogram);
    printBlock4.statementOption.setStatement("\"the last value is divisble by 3\"");
    const printBlock5 = new PrintBlock(structogram);
    printBlock5.statementOption.setStatement("\"the last value is divisble by 7\"");
    const printBlock6 = new PrintBlock(structogram);
    printBlock6.statementOption.setStatement("\"the last value is divisble by 11\"");
    const printBlock7 = new PrintBlock(structogram);
    printBlock7.statementOption.setStatement("\"the last value is not divisble by 3, 7 or 11\"");
    multiBlock.setSubBlock("branch0", printBlock4);
    multiBlock.setSubBlock("branch1", printBlock5);
    multiBlock.setSubBlock("branch2", printBlock6);
    multiBlock.setSubBlock("branch3", printBlock7);
    const printBlock8 = new PrintBlock(structogram);
    printBlock8.statementOption.setStatement("\"it's done\"");
    multiBlock.next = printBlock8;

    structogram.startingBlock = assignmentBlocka;

    runStructogram(structogram);

    assertion.eq(printLog, ["2", "8", "34", "144", "610", "2584", "10946", "46368", "196418", "832040", "the last value is greater than 100000", "the last value is divisble by 11", "it's done"], "complex structogram should have the expected output");
});

test("assignment block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new AssignmentBlock(structogram);
    block.keyOption.setKey("a");
    block.statementOption.setStatement("\"hello\"");
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "assignment block should raise an issue on the assignment of an undeclared variable");
    
    structogram.declareAuxData("a", numberType);

    assertion.truthy(structogram.preRun().length > 0, "assignment block should raise an issue on the violation of type restrictions");

    block.statementOption.setStatement("an invalid statement");

    assertion.truthy(structogram.preRun().length > 0, "assignment block should raise an issue if its statement is invalid");

    structogram.clearData();
    structogram.declareInputData("a", numberType);
    block.statementOption.setStatement("1");

    assertion.truthy(structogram.preRun(["1"]).length > 0, "assignment block should raise an issue on the assignment of a constant variable");
});

test("print block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new ControlBlock(structogram);
    block.statementOption.setStatement("an invalid statement");
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "control block should raise an issue if its statement is invalid");
});

test("print block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new PrintBlock(structogram);
    block.statementOption.setStatement("an invalid statement");
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "print block should raise an issue if its statement is invalid");
});

test("truefalsebranching block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new TrueFalseBranchingBlock(structogram);
    block.conditionOption.setStatement("");
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "truefalsebranching block should raise an issue if its condition is an invalid statement");

    block.conditionOption.setStatement("5");

    assertion.truthy(structogram.preRun().length > 0, "truefalsebranching block should raise an issue if its condition is not returning a boolean");
});

test("multibranching block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new MultiBranchingBlock(structogram);
    block.conditionListOption.setStatements([
        "3 < 4",
        "3 > 4",
        "invalid statement"
    ])
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "multibranching block should raise an issue if at least one of its conditions is an invalid statement");
    
    block.conditionListOption.setStatements([
        "3 < 4",
        "3 > 4",
        "5"
    ])

    assertion.truthy(structogram.preRun().length > 0, "multibranching block should raise an issue if at least one of its conditions is not returning a boolean");
});



test("countingloop block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new CountingLoopBlock(structogram);
    block.variableKeyOption.setKey("i")
    block.fromOption.setStatement("1");
    block.toOption.setStatement("10");
    block.stepOption.setStatement("1");
    structogram.startingBlock = block;
    
    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue on the usage of an undeclared variable");

    structogram.declareInputData("i", numberType)

    assertion.truthy(structogram.preRun(["1"]).length > 0, "countingloop block should raise an issue on the usage of a constant variable");
    
    structogram.clearData();
    structogram.declareAuxData("i", stringType);

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue on the violation of type restrictions");

    structogram.clearData();
    structogram.declareAuxData("i", numberType);
    block.fromOption.setStatement("invalid statement");

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue if its from statement is invalid");

    block.fromOption.setStatement("true");

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue if its from statement is not a number");

    block.fromOption.setStatement("1");
    block.toOption.setStatement("invalid statement");

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue if its to statement is invalid");

    block.toOption.setStatement("\"e\"");

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue if its to statement is not a number");

    block.toOption.setStatement("10");
    block.stepOption.setStatement("invalid statement");

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue if its step statement is invalid");

    block.stepOption.setStatement("\"alma\"");

    assertion.truthy(structogram.preRun().length > 0, "countingloop block should raise an issue if its step statement is not a number");
});

test("fronttestingloop block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new FrontTestingLoopBlock(structogram);
    block.conditionOption.setStatement("");
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "fronttestingloop block should raise an issue if its condition is an invalid statement");

    block.conditionOption.setStatement("5");

    assertion.truthy(structogram.preRun().length > 0, "fronttestingloop block should raise an issue if its condition is not returning a boolean");
});

test("backtestingloop block should raise issues when expected", assertion => {
    const [_, structogram] = createBasicStructogram();

    const block = new BackTestingLoopBlock(structogram);
    block.conditionOption.setStatement("");
    structogram.startingBlock = block;

    assertion.truthy(structogram.preRun().length > 0, "backtestingloop block should raise an issue if its condition is an invalid statement");

    block.conditionOption.setStatement("5");

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

        const inputs = [];
        if(def1[0] == "input" || def2[0] == "input") inputs.push("3");

        assertion.truthy(structogram.preRun(inputs).length > 0, `duplicate data keys in ${def1[0]} and ${def2[0]} should raise an issue`);
    }
});

test("invalid input should result in an issue being raised", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareInputData("a", numberType);

    assertion.truthy(structogram.preRun(["true"]).length > 0, `input being the wrong type should raise an issue`);
    assertion.truthy(structogram.preRun(["1","3"]).length > 0, `too many inputs should raise an issue`);
    assertion.truthy(structogram.preRun([]).length > 0, `missing input should raise an issue`);
    assertion.truthy(structogram.preRun(["invalid"]).length > 0, `invalid input should raise an issue`);
});

test("assignment blocks should work as expected with fields", assertion => {
    const [_, structogram] = createBasicStructogram();

    structogram.declareAuxData("a", SinglyLinkedListNodeTemplate.getType([numberType]));

    const assignmentBlock1 = new AssignmentBlock(structogram);
    assignmentBlock1.keyOption.setKey("a");
    assignmentBlock1.statementOption.setStatement("s1l(3)");
    structogram.startingBlock = assignmentBlock1;
    const assignmentBlock2 = new AssignmentBlock(structogram);
    assignmentBlock2.keyOption.setKey("a.next");
    assignmentBlock2.statementOption.setStatement("s1l(4)");
    assignmentBlock1.next = assignmentBlock2;
    
    runStructogram(structogram);

    jsonEqual(assertion, (structogram.memory.getVariable("a") as UtilityObject).get("next"), SinglyLinkedListNodeTemplate.construct([SimpleValue.number(4)]), "a stuctrogram should be able to assign a field's value")
});