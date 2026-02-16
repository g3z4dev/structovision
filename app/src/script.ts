import { Memory } from "./model/memory.ts";
import {BooleanStatement, NumericStatement, StringStatement} from "./model/statement.ts"
import EventEmitter2 from "eventemitter2";

const placeholderMemory: Memory = new Memory(new EventEmitter2());
NumericStatement.parse("3+4", placeholderMemory).evaluate();