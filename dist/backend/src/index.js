"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("@ideadesignmedia/config.js");
const create_db_1 = __importDefault(require("./database/create-db"));
const data_source_1 = require("./database/data-source");
const external_server_1 = require("./external-server");
const internal_server_1 = require("./internal-server");
create_db_1.default.then(() => data_source_1.AppDataSource.initialize()).then(() => {
    (0, external_server_1.connectToServer)();
    (0, internal_server_1.startServer)();
}).catch((error) => {
    console.error("Database Connection Error:", error);
    process.exit(1);
});
