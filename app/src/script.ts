import { AssignmentBlock, PrintBlock, TrueFalseBranchingBlock, CountingLoopBlock, FrontTestingLoopBlock, BackTestingLoopBlock, MultiBranchingBlock } from "./model/structogram";
import {ViewModel} from "./viewmodel/viewmodel"

const viewmodel = new ViewModel();

const structogram = viewmodel.currentStructogram;

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
countingLoopBlock.loopStart = assignmentBlock1;
const assignmentBlock2 = new AssignmentBlock(structogram);
assignmentBlock2.keyOption.setValue("a");
assignmentBlock2.statementOption.setStatement("b");
assignmentBlock1.next = assignmentBlock2;
const assignmentBlock3 = new AssignmentBlock(structogram);
assignmentBlock3.keyOption.setValue("b");
assignmentBlock3.statementOption.setStatement("c");
assignmentBlock2.next = assignmentBlock3;
const frontTestingLoop = new BackTestingLoopBlock(structogram);
frontTestingLoop.conditionOption.setStatement("b mod 2 != 0");
assignmentBlock3.next = frontTestingLoop;
const assignmentBlock4 = new AssignmentBlock(structogram);
assignmentBlock4.keyOption.setValue("c");
assignmentBlock4.statementOption.setStatement("a+b");
frontTestingLoop.loopStart = assignmentBlock4;
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

viewmodel.currentStructogram.setStartingBlock(countingLoopBlock);
