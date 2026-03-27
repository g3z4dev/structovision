import {test, type IAssert} from "zora";
import {BooleanStatement, NumericStatement, CharStatement, StatementParseError, AnyStatement, StringStatement} from "@structovision/app/model/statement";
import { Memory } from "@structovision/app/model/memory";
import { BinaryTreeNodeTemplate, booleanType, charType, DoublyLinkedListNodeTemplate, numberType, SimpleValue, SinglyLinkedListNodeTemplate, UtilityArray, UtilityString, type Primitive, type Value } from "@structovision/app/model/types";
import { array, b, boolArray, btn, c, charArray, n, numArray, s1l, s2l, str, ud } from "../testutil.ts";

const placeholderMemory: Memory = new Memory();

function testNumericStatement(assertion: IAssert, statement: string, result: number, memory: Memory = placeholderMemory) {
    assertion.equal(NumericStatement.parse(statement, memory).evaluate(), result, `${statement} should be ${result}`);
}

function testCharStatement(assertion: IAssert, statement: string, result: string, memory: Memory = placeholderMemory) {
    assertion.equal(CharStatement.parse(statement, memory).evaluate(), result, `${statement} should be ${result}`);
}

function testStringStatement(assertion: IAssert, statement: string, result: string, memory: Memory = placeholderMemory) {
    assertion.equal(StringStatement.parse(statement, memory).evaluate(), result, `${statement} should be ${result}`);
}

function testBooleanStatement(assertion: IAssert, statement: string, result: boolean, memory: Memory = placeholderMemory) {
    assertion.equal(BooleanStatement.parse(statement, memory).evaluate(), result, `${statement} should be ${result}`);
}

function testAnyStatement(assertion: IAssert, statement: string, result: Value, memory: Memory = placeholderMemory) {
    assertion.equal(AnyStatement.parse(statement, memory).evaluate(), result, `${statement} should be ${result}`);
}

function testAnyStatementObject(assertion: IAssert, statement: string, result: Value, memory: Memory = placeholderMemory) {
    assertion.equal(JSON.stringify(AnyStatement.parse(statement, memory).evaluate()), JSON.stringify(result), `${statement} should be ${result}`);
}

test("statements with one literal should work correctly", (assertion) => {
    testNumericStatement(assertion, "3", 3);
    testCharStatement(assertion, "\'a\'", "a");
    testStringStatement(assertion, "\"almafa\"", "almafa");
    testBooleanStatement(assertion, "true", true);
    testAnyStatement(assertion, "10", n(10));
});

test("statements with extra spaces should still be parsed correctly", (assertion) => {
    testNumericStatement(assertion, "  3    +  4           ", 7);
    testStringStatement(assertion, "  \"alma\"       &      \"fa\"         ", "almafa");
    testBooleanStatement(assertion, "  true    or                             false           ", true);
    testAnyStatement(assertion, "                   5          *            3                ", n(15));
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
    testStringStatement(assertion, "str(3)&\" alma\"", "3 alma");
    testStringStatement(assertion, "str(3)&\" alma \"&str(5)", "3 alma 5");
    testStringStatement(assertion, "str(true)&\" facts\"", "true facts");
    testStringStatement(assertion, "\"this statement is \"&str(false)&\" but what if it's \"&str(true)", "this statement is false but what if it's true");
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

test("any statements with just one operator should work correctly", assertion => {
    testAnyStatement(assertion, "3+4", n(7));
    testAnyStatement(assertion, "\"alma\"&\"fa\"", str("almafa"));
    testAnyStatement(assertion, "true and false", b(false));
});

test("complex statements with numeric, string and boolean components should work correctly", (assertion) => {
    testNumericStatement(assertion, "len(\"this is \"&str(4=5-1))", 12);
    testNumericStatement(assertion, "sqrt(len(\"this is \"&str(4=5-1)&\" no?\"))", 4);
    testNumericStatement(assertion, "len(\"alma\"&\"fa\")+-sqrt(sqrt(len(\"this is \"&str(4=5-1)&\" no?\")))", 4);
    testStringStatement(assertion, "str(len(\"alma\"&\"fa\")*2)&\" years later\"", "12 years later");
    testStringStatement(assertion, "str(len(\"this is \"&str(4=5-1)))&\" statements are \"&str(3=len(\"alma\"))", "12 statements are false");
    testStringStatement(assertion, "str(len(\"\"&str(true)))&\"=\"&str(sqrt(len(\"this is \"&str(4=5-1)&\" no?\")))&\" is \"&str(len(\"\"&str(true))=sqrt(len(\"this is \"&str(4=5-1)&\" no?\")))", "4=4 is true");
    testBooleanStatement(assertion, "len(\"\"&str(true))=sqrt(len(\"this is \"&str(4=5-1)&\" no?\"))", true);
    testBooleanStatement(assertion, "sqrt(len(\"almaalmaalmaalma\"))<(3.4+4.5)/2*16^(1/4)", true);
    testBooleanStatement(assertion, "\"alma\"&\"körte\"&\"narancs\">\"barack\"&str(sqrt(9))", false);
    testAnyStatement(assertion, "len(\"alma\"&\"fa\")+-sqrt(sqrt(len(\"this is \"&str(4=5-1)&\" no?\")))", n(4));
    testAnyStatement(assertion, "len(\"\"&true)&\"=\"&sqrt(len(\"this is \"&str(4=5-1)&\" no?\"))&\" is \"&(len(\"\"&true)=sqrt(len(\"this is \"&str(4=5-1)&\" no?\")))", str("4=4 is true"));
    testAnyStatement(assertion, "\"alma\"&\"körte\"&\"narancs\">\"barack\"&str(sqrt(9))", b(false));
});

test("numeric statements with variables should work as intended", assertion => {
    const mem = new Memory();
    mem.createVariable("a", n(7));
    mem.createVariable("b", n(5));
    testNumericStatement(assertion, "a+b", 12, mem);
});

test("string statements with variables should work as intended", assertion => {
    const mem = new Memory();
    mem.createVariable("a", str("hello"));
    mem.createVariable("b", str("world"));
    testStringStatement(assertion, "a&b", "helloworld", mem);
});

test("boolean statements with variables should work as intended", assertion => {
    const mem = new Memory();
    mem.createVariable("a", b(true));
    mem.createVariable("b", b(false));
    testBooleanStatement(assertion, "a or b", true, mem);
});

test("any statements with variables should work as intended", assertion => {
    const mem = new Memory();
    mem.createVariable("a", n(1));
    mem.createVariable("b", str("text"));
    mem.createVariable("c", b(false));
    testAnyStatement(assertion, "a", n(1), mem);
    testAnyStatement(assertion, "b", str("text"), mem);
    testAnyStatement(assertion, "c", b(false), mem);
});

test("statements with invalid tokens should throw an error", assertion => {
    assertion.throws(() => NumericStatement.parse("3+3,4", placeholderMemory), StatementParseError, "Statements should throw an error if given an invalid token");
    assertion.throws(() => BooleanStatement.parse("truee or false", placeholderMemory), StatementParseError, "Statements should throw an error if given a typo");
    assertion.throws(() => BooleanStatement.parse("true orfalse", placeholderMemory), StatementParseError, "Statements should throw an error if lacking spacing");
    assertion.throws(() => BooleanStatement.parse("true false", placeholderMemory), StatementParseError, "Statements should throw an error if the result is ambigous");
    assertion.throws(() => AnyStatement.parse("ikjjaslkjdklasljrljldjljksdf", placeholderMemory), StatementParseError, "Statements should throw an error if it makes no sense");
});

test("statements with result types should throw an error", assertion => {
    const values = ["\"hello world\"", "'!'", "1", "false", "{1,2,3,4}", "s1l(4)"];
    const parsers = [
        StringStatement.parse,
        CharStatement.parse,
        NumericStatement.parse,
        BooleanStatement.parse
    ]
    const parsersNames = [
        "String statement",
        "Char statement",
        "Numeric statement",
        "Boolean statement"
    ]
    const valueNames = [
        "string value",
        "char value",
        "numeric value",
        "boolean value",
        "array value",
        "object value"
    ]

    for(let i = 0; i < parsers.length; i++) {
        for(let j = 0; j < values.length; j++) {
            if(i == j) continue;
            assertion.throws(() => parsers[i]!(values[j]!, placeholderMemory), StatementParseError, `${parsersNames[i]} should throw an error if the result is a(n) ${valueNames[j]}`);
        }
    }
});

test("statements should be able to define arrays", (assertion) => {
    testAnyStatement(assertion, "{1,2,3}", numArray([1, 2, 3]));
    testAnyStatement(assertion, "{'a','b','c'}", charArray(["a", "b", "c"]));
    testAnyStatement(assertion, "{true,false,false}", boolArray([true,false,false]));
});

test("statements should be able to define arrays of nested types", (assertion) => {
    testAnyStatementObject(assertion, "{s1l(3),s1l(5),s1l(10)}", array([s1l(n(3)),s1l(n(5)),s1l(n(10))]));
    testAnyStatementObject(assertion, "{s1l(s2l(3)),s1l(s2l(5)),s1l(s2l(10))}", array([s1l(s2l(n(3))),s1l(s2l(n(5))),s1l(s2l(n(10)))]));
    testAnyStatementObject(assertion, "{s1l({1,2,3}),s1l({4,5}),s1l({6})}", array([s1l(numArray([1,2,3])),s1l(numArray([4,5])),s1l(numArray([6]))]));
    testAnyStatementObject(assertion, "{{1},{2,3},{4,5,6}}", array([numArray([1]), numArray([2,3]), numArray([4,5,6])]));
    testAnyStatementObject(assertion, "{{{1},{2,3},{4,5,6}},{{7},{8,9},{10}}}", array([array([numArray([1]), numArray([2,3]), numArray([4,5,6])]),array([numArray([7]), numArray([8,9]), numArray([10])])]))
});

test("statements should not be able to define a heterogenous array", (assertion) => {
    assertion.throws(() => AnyStatement.parse('{1,"alma",false}', placeholderMemory), StatementParseError, "Any statement should throw an error if trying to parse an array with heterogenous elements");
});

test("statements should be able to define objects", (assertion) => {
    testAnyStatementObject(assertion, "s1l(3)", SinglyLinkedListNodeTemplate.construct([n(3)]));
    testAnyStatementObject(assertion, 's2l(\'a\')', DoublyLinkedListNodeTemplate.construct([c("a")]));
    testAnyStatementObject(assertion, "btn(false)", BinaryTreeNodeTemplate.construct([b(false)]));
});

test("statements should be able to access fields of objects", (assertion) => {
    testNumericStatement(assertion, "s1l(3).key", 3);
    testAnyStatement(assertion, "s1l(3).next", ud());
    testCharStatement(assertion, 's2l(\'a\').key', "a");
    testAnyStatement(assertion, 's2l(\'a\').prev', ud());
    testAnyStatement(assertion, 's2l(\'a\').next', ud());
    testBooleanStatement(assertion, "btn(false).key", false);
    testAnyStatement(assertion, "btn(false).parent", ud());
    testAnyStatement(assertion, "btn(false).left", ud());
    testAnyStatement(assertion, "btn(false).right", ud());
});

test("statements should be able to construct nested types", (assertion) => {
    testAnyStatementObject(assertion, "s1l(s1l(3))", s1l(s1l(n(3))));
    testAnyStatementObject(assertion, 's2l(s2l(\'a\'))', s2l(s2l(c("a"))));
    testAnyStatementObject(assertion, "btn(btn(false))", btn(btn(b(false))));
});

test("statements should not be able to access fields of objects that does not exist", (assertion) => {
    assertion.throws(() => AnyStatement.parse('s1l(3).alma', placeholderMemory), StatementParseError, "Any statement should throw an error if trying to access a field of an s1l that does not exist");
    assertion.throws(() => AnyStatement.parse("s2l('a').parent", placeholderMemory), StatementParseError, "Any statement should throw an error if trying to access a field of an s2l that does not exist");
    assertion.throws(() => AnyStatement.parse('btn(false).next', placeholderMemory), StatementParseError, "Any statement should throw an error if trying to access a field of an btn that does not exist");
});