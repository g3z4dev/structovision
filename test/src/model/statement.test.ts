import {test, type IAssert} from "zora";
import {BooleanStatement, NumericStatement, StringStatement, StatementParseError, AnyStatement} from "@structovision/app/model/statement";
import {type Primitive} from "@structovision/app/model/util";
import { Memory } from "@structovision/app/model/memory";

const placeholderMemory: Memory = new Memory();

function testNumericStatement(assertion: IAssert, statement: string, result: number, memory: Memory = placeholderMemory) {
    assertion.equal(NumericStatement.parse(statement, memory).evaluate(), result, `${statement} should be ${result}`);
}

function testStringStatement(assertion: IAssert, statement: string, result: string, memory: Memory = placeholderMemory) {
    assertion.equal(StringStatement.parse(statement, memory).evaluate(), result, `${statement} should be ${result}`);
}

function testBooleanStatement(assertion: IAssert, statement: string, result: boolean, memory: Memory = placeholderMemory) {
    assertion.equal(BooleanStatement.parse(statement, memory).evaluate(), result, `${statement} should be ${result}`);
}

function testAnyStatement(assertion: IAssert, statement: string, result: Primitive, memory: Memory = placeholderMemory) {
    assertion.equal(AnyStatement.parse(statement, memory).evaluate(), result, `${statement} should be ${result}`);
}

test("statements with extra spaces should still be parsed correctly", (assertion) => {
    testNumericStatement(assertion, "  3    +  4           ", 7);
    testStringStatement(assertion, "  \"alma\"       &      \"fa\"         ", "almafa");
    testBooleanStatement(assertion, "  true    or                             false           ", true);
    testAnyStatement(assertion, "                   5          *            3                ", 15);
});

test("numeric statements with just one operator should work correctly", (assertion) => {
    testNumericStatement(assertion, "3+4", 7);
    testNumericStatement(assertion, "3+4+5", 12);
    testNumericStatement(assertion, "10-4", 6);
    testNumericStatement(assertion, "20-4-6", 10);
    testNumericStatement(assertion, "6*5", 30);
    testNumericStatement(assertion, "6*5*3", 90);
    testNumericStatement(assertion, "45/5", 9);
    testNumericStatement(assertion, "45/5/3", 3);
    testNumericStatement(assertion, "2^3", 8);
    testNumericStatement(assertion, "3^2^2", 81);
    testNumericStatement(assertion, "5div 3", 1);
    testNumericStatement(assertion, "11div 2div 3", 1);
    testNumericStatement(assertion, "5mod 3", 2);
    testNumericStatement(assertion, "1mod 7mod 2", 1);
    testNumericStatement(assertion, "sqrt 16", 4);
    testNumericStatement(assertion, "sqrt sqrt 16", 2);
    testNumericStatement(assertion, "log 256", 8);
    testNumericStatement(assertion, "log log 256", 3);
    testNumericStatement(assertion, "-5", -5);
    testNumericStatement(assertion, "len\"alma\"", 4);
    testNumericStatement(assertion, "3.3+4.5", 7.8);
});

test("numeric statements should respect precedence", (assertion) => {
    testNumericStatement(assertion, "3 + 4 - 5", 2);
    testNumericStatement(assertion, "3 * 4 / 2", 6);
    testNumericStatement(assertion, "21 + 4 * 5", 41);
    testNumericStatement(assertion, "29 - 4 / 5", 28.2);
    testNumericStatement(assertion, "29 - 2 * 2 * 15 / 3 + 1", 10);
    testNumericStatement(assertion, "2 ^ 2 ^ 3 - 5 * 4", 236);
    testNumericStatement(assertion, "2*log log 256", 6);
    testNumericStatement(assertion, "4+-5", -1);
    testNumericStatement(assertion, "4--5", 9);
});

test("numeric statements should respect brackets", (assertion) => {
    testNumericStatement(assertion, "3*(5-4)", 3);
    testNumericStatement(assertion, "sqrt(2*12*3*2)/(3*4)", 1);
    testNumericStatement(assertion, "((3+2)/(3-2)+(12-6)/(4-1)+(2+3)/(5/5))/((15-9)*(2^2)/(2*6))", 6);
    testNumericStatement(assertion, "(10-(9-(8-(7-(6-(5-(4-(3-(2-(1))))))))))", 5);
});

test("numeric statements should be to handle edge cases", (assertion) => {
    testNumericStatement(assertion, "4------------5", 9);
    testNumericStatement(assertion, "1+2+3+4+5+6+7+8+9+10+11+12+13+14+15+16+17+18+19+20", 210);
    testNumericStatement(assertion, "-1^3", -1);
    testNumericStatement(assertion, "2 ^ 2 ^ 2 ^ 2", 65536);
});

test("string statements with just one operator should work correctly", (assertion) => {
    testStringStatement(assertion, "\"alma\"&\"fa\"", "almafa");
    testStringStatement(assertion, "\"alma\"&\"fa\"&\" alatt\"", "almafa alatt");
    testStringStatement(assertion, "3&\" alma\"", "3 alma");
    testStringStatement(assertion, "3&\" alma \"&5", "3 alma 5");
    testStringStatement(assertion, "true&\" facts\"", "true facts");
    testStringStatement(assertion, "\"this statement is \"&false&\" but what if it's \"&true", "this statement is false but what if it's true");
});

test("boolean statements with just one operator should work correctly", (assertion) => {
    testBooleanStatement(assertion, "true and false", false);
    testBooleanStatement(assertion, "true and true and true", true);
    testBooleanStatement(assertion, "true or false", true);
    testBooleanStatement(assertion, "false or false or false", false);
    const equalPairs: Primitive[][] = [
        [4,4], 
        [4,5], 
        ["\"alma\"", "\"alma\""], 
        ["\"alma\"", "\"fa\""],
        [true, true],
        [true, false],
        [4, "\"hello\""],
        [false, "\"false\""],
        [true, 3]
    ];
    for(let pair of equalPairs) {
        const a = pair[0]!;
        const b = pair[1]!;
        testBooleanStatement(assertion, `${a} = ${b}`, a == b);
        testBooleanStatement(assertion, `${a} != ${b}`, a != b);
    }

    const comparePairs: Primitive[][] = [
        [4,4], 
        [4,5], 
        [6,3],
        ["\"alma\"", "\"alma\""], 
        ["\"alma\"", "\"fa\""],
        ["\"ik\"", "\"elte\""]
    ];
    for(let pair of comparePairs) {
        const a = pair[0]!;
        const b = pair[1]!;
        testBooleanStatement(assertion, `${a} < ${b}`, a < b);
        testBooleanStatement(assertion, `${a} <= ${b}`, a <= b);
        testBooleanStatement(assertion, `${a} > ${b}`, a > b);
        testBooleanStatement(assertion, `${a} >= ${b}`, a >= b);
    }
});

test("string statements with just one operator should work correctly", assertion => {
    testAnyStatement(assertion, "3+4", 7);
    testAnyStatement(assertion, "\"alma\"&\"fa\"", "almafa");
    testAnyStatement(assertion, "true and false", false);
});

test("complex statements with numeric, string and boolean components should work correctly", (assertion) => {
    testNumericStatement(assertion, "len(\"this is \"&(4=5-1))", 12);
    testNumericStatement(assertion, "sqrt(len(\"this is \"&(4=5-1)&\" no?\"))", 4);
    testNumericStatement(assertion, "len(\"alma\"&\"fa\")+-sqrt(sqrt(len(\"this is \"&(4=5-1)&\" no?\")))", 4);
    testStringStatement(assertion, "len(\"alma\"&\"fa\")*2&\" years later\"", "12 years later");
    testStringStatement(assertion, "len(\"this is \"&(4=5-1))&\" statements are \"&(3=len(\"alma\"))", "12 statements are false");
    testStringStatement(assertion, "len(\"\"&true)&\"=\"&sqrt(len(\"this is \"&(4=5-1)&\" no?\"))&\" is \"&(len(\"\"&true)=sqrt(len(\"this is \"&(4=5-1)&\" no?\")))", "4=4 is true");
    testBooleanStatement(assertion, "len(\"\"&true)=sqrt(len(\"this is \"&(4=5-1)&\" no?\"))", true);
    testBooleanStatement(assertion, "sqrt(len(\"almaalmaalmaalma\"))<(3.4+4.5)/2*16^(1/4)", true);
    testBooleanStatement(assertion, "\"alma\"&\"körte\"&\"narancs\">\"barack\"&sqrt(9)", false);
    testAnyStatement(assertion, "len(\"alma\"&\"fa\")+-sqrt(sqrt(len(\"this is \"&(4=5-1)&\" no?\")))", 4);
    testAnyStatement(assertion, "len(\"\"&true)&\"=\"&sqrt(len(\"this is \"&(4=5-1)&\" no?\"))&\" is \"&(len(\"\"&true)=sqrt(len(\"this is \"&(4=5-1)&\" no?\")))", "4=4 is true");
    testAnyStatement(assertion, "\"alma\"&\"körte\"&\"narancs\">\"barack\"&sqrt(9)", false);
});

test("numeric statements with variables should work as intended", assertion => {
    const mem = new Memory();
    mem.createVariable("a", 7);
    mem.createVariable("b", 5);
    testNumericStatement(assertion, "a+b", 12, mem);
});

test("string statements with variables should work as intended", assertion => {
    const mem = new Memory();
    mem.createVariable("a", "hello");
    mem.createVariable("b", "world");
    testStringStatement(assertion, "a&b", "helloworld", mem);
});

test("boolean statements with variables should work as intended", assertion => {
    const mem = new Memory();
    mem.createVariable("a", true);
    mem.createVariable("b", false);
    testBooleanStatement(assertion, "a or b", true, mem);
});

test("any statements with variables should work as intended", assertion => {
    const mem = new Memory();
    mem.createVariable("a", 1);
    mem.createVariable("b", "text");
    mem.createVariable("c", false);
    testAnyStatement(assertion, "a", 1, mem);
    testAnyStatement(assertion, "b", "text", mem);
    testAnyStatement(assertion, "c", false, mem);
});

test("statements with invalid tokens should throw an error", assertion => {
    assertion.throws(() => NumericStatement.parse("3+3,4", placeholderMemory).evaluate(), StatementParseError, "Statements should throw an error if given an invalid token");
    assertion.throws(() => BooleanStatement.parse("truee or false", placeholderMemory).evaluate(), StatementParseError, "Statements should throw an error if given a typo");
    assertion.throws(() => BooleanStatement.parse("true orfalse", placeholderMemory).evaluate(), StatementParseError, "Statements should throw an error if lacking spacing");
    assertion.throws(() => AnyStatement.parse("ikjjaslkjdklasljrljldjljksdf", placeholderMemory).evaluate(), StatementParseError, "Statements should throw an error if it makes no sense");
});

test("statements with result types should throw an error", assertion => {
    assertion.throws(() => NumericStatement.parse("\"hello\"", placeholderMemory).evaluate(), StatementParseError, "Numeric statement should throw an error if trying to parse a statement with a string result");
    assertion.throws(() => NumericStatement.parse("false", placeholderMemory).evaluate(), StatementParseError, "Numeric statement should throw an error if trying to parse a statement with a boolean result");
    assertion.throws(() => StringStatement.parse("1", placeholderMemory).evaluate(), StatementParseError, "String statement should throw an error if trying to parse a statement with a numeric result");
    assertion.throws(() => StringStatement.parse("true", placeholderMemory).evaluate(), StatementParseError, "String statement should throw an error if trying to parse a statement with a boolean result");
    assertion.throws(() => BooleanStatement.parse("1", placeholderMemory).evaluate(), StatementParseError, "Boolean statement should throw an error if trying to parse a statement with a numeric result");
    assertion.throws(() => BooleanStatement.parse("\"world\"", placeholderMemory).evaluate(), StatementParseError, "Boolean statement should throw an error if trying to parse a statement with a string result");
    assertion.throws(() => NumericStatement.parse("", placeholderMemory).evaluate(), StatementParseError, "Numeric statement should throw an error if trying to parse a statement with a boolean result");
    assertion.throws(() => StringStatement.parse("", placeholderMemory).evaluate(), StatementParseError, "String statement should throw an error if trying to parse a statement with a numeric result");
    assertion.throws(() => BooleanStatement.parse("", placeholderMemory).evaluate(), StatementParseError, "Boolean statement should throw an error if trying to parse a statement with a string result");
});