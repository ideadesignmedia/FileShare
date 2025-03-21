import "reflect-metadata";
import { DataSource } from "typeorm";
import { Session } from "./entities/Session";
import { User } from "./entities/User";

export const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USER || "youruser",
    password: process.env.DB_PASSWORD || "yourpassword",
    database: process.env.DB_NAME || "yourdb",
    logging: false,
    entities: [User, Session],
    migrations: ["src/database/migrations/*.ts"],
    subscribers: ["src/database/subscribers/*.ts"],
    synchronize: true/* process.env.NODE_ENV !== "production" */,
    extra: {
        max: 10,
        idleTimeoutMillis: 30000
    }
});

export default AppDataSource;