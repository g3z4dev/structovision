import {test, type IAssert} from "zora";
import ee2 from "eventemitter2"
import { NumericStatement, StringStatement } from "@structovision/app/model/statement";
import {Structogram, AssignmentBlock, PrintBlock, TrueFalseBranchingBlock, MultiBranchingBlock, CountingLoopBlock, FrontTestingLoopBlock, BackTestingLoopBlock} from "@structovision/app/model/structogram";

function createBasicStructogram(): [ee2.EventEmitter2, Structogram] {
    const emitter = new ee2.EventEmitter2();
    const structogram = new Structogram(emitter);
    return [emitter, structogram];
}

function runStructogram(structogram: Structogram) {
    structogram.preRun();
    structogram.runStep();
    while(structogram.isRunning()) {
        structogram.runStep();
    }
}

test("assignment blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();

    structogram.defineVariable("a", 0);

    const assignmentBlock = new AssignmentBlock(structogram);
    assignmentBlock.keyOption.setValue("a");
    assignmentBlock.statementOption.setStatement("3+4+5");
    structogram.setStartingBlock(assignmentBlock);
    
    runStructogram(structogram);

    assertion.eq(structogram.memory.getVariable("a"), 12, "a stuctrogram should be able to assign a value")
});

test("print blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();
    
    let printedText = "";

    emitter.addListener(Structogram.printEvent, text => printedText = text);

    structogram.defineVariable("text", "hello world");

    const printBlock = new PrintBlock(structogram);
    printBlock.statementOption.setStatement("text");
    structogram.setStartingBlock(printBlock);

    runStructogram(structogram);

    assertion.eq(printedText, "hello world", "The stuctrogram should able to print a value")
});

test("true-false branching blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();
    
    let printedText = "";

    emitter.addListener(Structogram.printEvent, text => printedText = text);

    structogram.defineVariable("a", true);
    const assignmentBlock = new AssignmentBlock(structogram);
    assignmentBlock.keyOption.setValue("a");
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

    structogram.setStartingBlock(assignmentBlock);

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

    structogram.defineVariable("v", 1);
    const assignmentBlock = new AssignmentBlock(structogram);
    assignmentBlock.keyOption.setValue("v");
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
    multiBranchingBlock.setBranch(0, firstBlock);
    multiBranchingBlock.setBranch(1, secondBlock);
    multiBranchingBlock.setBranch(2, thirdBlock);
    assignmentBlock.next = multiBranchingBlock;

    structogram.setStartingBlock(assignmentBlock);

    runStructogram(structogram);

    assertion.eq(printedText, "first", "the multi branching block should direct the control to the correct branch (1)");

    assignmentBlock.statementOption.setStatement("2");

    runStructogram(structogram);

    assertion.eq(printedText, "second", "the multi branching block should direct the control to the correct branch (2)");

    assignmentBlock.statementOption.setStatement("3");

    runStructogram(structogram);

    assertion.eq(printedText, "third", "the multi branching block should direct the control to the correct branch (3)");
});

test("counting loop blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();
    
    let printLog: string[] = [];

    emitter.addListener(Structogram.printEvent, text => printLog.push(text));

    const countingLoopBlock = new CountingLoopBlock(structogram);
    countingLoopBlock.variableKeyOption.setValue("i");
    countingLoopBlock.fromOption.setStatement("1");
    countingLoopBlock.toOption.setStatement("10");
    countingLoopBlock.stepOption.setStatement("1");
    const loopedBlock = new PrintBlock(structogram);
    loopedBlock.statementOption.setStatement("\"number \"&i");
    countingLoopBlock.firstBlock = loopedBlock;
    const finishedBlock = new PrintBlock(structogram);
    finishedBlock.statementOption.setStatement("\"finished\"");
    countingLoopBlock.next = finishedBlock;

    structogram.setStartingBlock(countingLoopBlock);

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

    structogram.defineVariable("i", "a");
    const frontTestingLoopBlock = new FrontTestingLoopBlock(structogram);
    frontTestingLoopBlock.conditionOption.setStatement("len(i) < 4");
    const loopedBlock = new PrintBlock(structogram);
    loopedBlock.statementOption.setStatement("i");
    frontTestingLoopBlock.firstBlock = loopedBlock;
    const loopedBlock2 = new AssignmentBlock(structogram);
    loopedBlock2.keyOption.setValue("i");
    loopedBlock2.statementOption.setStatement("i&\"a\"");
    loopedBlock.next = loopedBlock2;
    const finishedBlock = new PrintBlock(structogram);
    finishedBlock.statementOption.setStatement("\"finished\"");
    frontTestingLoopBlock.next = finishedBlock;

    structogram.setStartingBlock(frontTestingLoopBlock);

    runStructogram(structogram);

    assertion.eq(printLog, ["a", "aa", "aaa", "finished"], "the front testing loop block should direct the control as expected")
});

test("back testing loop blocks should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();
    
    let printLog: string[] = [];

    emitter.addListener(Structogram.printEvent, text => printLog.push(text));

    structogram.defineVariable("i", "a");
    const backTestingLoopBlock = new BackTestingLoopBlock(structogram);
    backTestingLoopBlock.conditionOption.setStatement("len(i) < 1 or len(i) > 2 and len(i) <= 3");
    const loopedBlock = new PrintBlock(structogram);
    loopedBlock.statementOption.setStatement("i");
    backTestingLoopBlock.firstBlock = loopedBlock;
    const loopedBlock2 = new AssignmentBlock(structogram);
    loopedBlock2.keyOption.setValue("i");
    loopedBlock2.statementOption.setStatement("i&\"aa\"");
    loopedBlock.next = loopedBlock2;
    const finishedBlock = new PrintBlock(structogram);
    finishedBlock.statementOption.setStatement("\"finished\"");
    backTestingLoopBlock.next = finishedBlock;

    structogram.setStartingBlock(backTestingLoopBlock);

    runStructogram(structogram);

    assertion.eq(printLog, ["a", "aaa", "finished"], "the back testing loop block should direct the control as expected")
});

test("a complex structogram should work as expected", assertion => {
    const [emitter, structogram] = createBasicStructogram();
    
    let printLog: string[] = [];

    emitter.addListener(Structogram.printEvent, text => printLog.push(text));

    structogram.defineVariable("a", 1);
    structogram.defineVariable("b", 1);
    structogram.defineVariable("c", 1);
    const countingLoopBlock = new CountingLoopBlock(structogram);
    countingLoopBlock.fromOption.setStatement("1");
    countingLoopBlock.toOption.setStatement("10");
    countingLoopBlock.stepOption.setStatement("1");
    countingLoopBlock.variableKeyOption.setValue("i");
    const assignmentBlock1 = new AssignmentBlock(structogram);
    assignmentBlock1.keyOption.setValue("c");
    assignmentBlock1.statementOption.setStatement("a+b");
    countingLoopBlock.firstBlock = assignmentBlock1;
    const assignmentBlock2 = new AssignmentBlock(structogram);
    assignmentBlock2.keyOption.setValue("a");
    assignmentBlock2.statementOption.setStatement("b");
    assignmentBlock1.next = assignmentBlock2;
    const assignmentBlock3 = new AssignmentBlock(structogram);
    assignmentBlock3.keyOption.setValue("b");
    assignmentBlock3.statementOption.setStatement("c");
    assignmentBlock2.next = assignmentBlock3;
    const frontTestingLoop = new FrontTestingLoopBlock(structogram);
    frontTestingLoop.conditionOption.setStatement("b mod 2 != 0");
    assignmentBlock3.next = frontTestingLoop;
    const assignmentBlock4 = new AssignmentBlock(structogram);
    assignmentBlock4.keyOption.setValue("c");
    assignmentBlock4.statementOption.setStatement("a+b");
    frontTestingLoop.firstBlock = assignmentBlock4;
    const assignmentBlock5 = new AssignmentBlock(structogram);
    assignmentBlock5.keyOption.setValue("a");
    assignmentBlock5.statementOption.setStatement("b");
    assignmentBlock4.next = assignmentBlock5;
    const assignmentBlock6 = new AssignmentBlock(structogram);
    assignmentBlock6.keyOption.setValue("b");
    assignmentBlock6.statementOption.setStatement("c");
    assignmentBlock5.next = assignmentBlock6;
    const printBlock = new PrintBlock(structogram);
    printBlock.statementOption.setStatement("b");
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
    multiBlock.setBranch(0, printBlock4);
    multiBlock.setBranch(1, printBlock5);
    multiBlock.setBranch(2, printBlock6);
    multiBlock.setBranch(3, printBlock7);
    const printBlock8 = new PrintBlock(structogram);
    printBlock8.statementOption.setStatement("\"it's done\"");
    multiBlock.next = printBlock8;

    structogram.setStartingBlock(countingLoopBlock);

    runStructogram(structogram);

    assertion.eq(printLog, ["2", "8", "34", "144", "610", "2584", "10946", "46368", "196418", "832040", "the last value is greater than 100000", "the last value is divisble by 11", "it's done"], "complex structogram should have the expected output");
});