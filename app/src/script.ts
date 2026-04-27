import EventEmitter2 from "eventemitter2";
import { Structogram } from "./model/structogram";
import {ViewModel} from "./viewmodel/viewmodel"

const structogram = new Structogram(new EventEmitter2({"maxListeners": 100}));
const viewmodel = new ViewModel(structogram);
viewmodel.begin();
