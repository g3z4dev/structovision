import {test} from "zora"
import {sum} from "@structogramvisualizer/app"

test("this is a test", (assertion) => {
    assertion.equal(sum(3, 4), 7, "3 + 4 is 7");
})