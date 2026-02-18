import { Memory } from "./model/memory.ts";
import {BooleanStatement, NumericStatement, StringStatement} from "./model/statement.ts"
import {AssignmentBlock, PrintBlock, Structogram} from "./model/structogram.ts";
import EventEmitter2 from "eventemitter2";

const emitter = new EventEmitter2();
const structogram = new Structogram(emitter);
