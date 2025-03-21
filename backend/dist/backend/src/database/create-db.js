"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DBCreationPromise = void 0;
const postgres_1 = require("./postgres");
const { query, end } = (0, postgres_1.getQueryFunction)();
async function createDB() {
    try {
    }
    catch (e) {
        console.error(e);
        //process.exit(1)
    }
    finally {
        end();
    }
}
exports.DBCreationPromise = createDB();
exports.default = exports.DBCreationPromise;
