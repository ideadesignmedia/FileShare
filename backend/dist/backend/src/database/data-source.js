"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDataSource = void 0;
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const Session_1 = require("./entities/Session");
const User_1 = require("./entities/User");
exports.AppDataSource = new typeorm_1.DataSource({
    type: "postgres",
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USER || "youruser",
    password: process.env.DB_PASSWORD || "yourpassword",
    database: process.env.DB_NAME || "yourdb",
    logging: false,
    entities: [User_1.User, Session_1.Session],
    migrations: ["src/database/migrations/*.ts"],
    subscribers: ["src/database/subscribers/*.ts"],
    synchronize: true /* process.env.NODE_ENV !== "production" */,
    extra: {
        max: 10,
        idleTimeoutMillis: 30000
    }
});
exports.default = exports.AppDataSource;
