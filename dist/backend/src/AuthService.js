"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const data_source_1 = require("./database/data-source");
const Session_1 = require("./database/entities/Session");
const User_1 = require("./database/entities/User");
const crypto_1 = __importDefault(require("crypto"));
const bcrypt_1 = __importDefault(require("bcrypt"));
class AuthService {
    static exists(username) {
        const userRepo = data_source_1.AppDataSource.getRepository(User_1.User);
        return userRepo.createQueryBuilder("user")
            .where("user.username = :username", { username })
            .getOne();
    }
    static getUser(id) {
        const userRepo = data_source_1.AppDataSource.getRepository(User_1.User);
        return userRepo.findOne({ where: { id } });
    }
    static async register(username, password) {
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        const userRepo = data_source_1.AppDataSource.getRepository(User_1.User);
        const user = userRepo.create({ username, password: hashedPassword });
        return userRepo.save(user);
    }
    static async authenticate(username, password) {
        const userRepo = data_source_1.AppDataSource.getRepository(User_1.User);
        const user = await userRepo.findOne({ where: { username } });
        if (!user)
            return null;
        const passwordMatch = await bcrypt_1.default.compare(password, user.password);
        return passwordMatch ? user : null;
    }
    static async createSession(userId, deviceId, deviceName) {
        const sessionRepo = data_source_1.AppDataSource.getRepository(Session_1.Session);
        const userRepo = data_source_1.AppDataSource.getRepository(User_1.User);
        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user)
            throw new Error("User not found");
        const existingSession = await sessionRepo.findOne({ where: { deviceId } });
        if (existingSession) {
            await sessionRepo.delete({ id: existingSession.id });
        }
        const session = sessionRepo.create({
            user,
            deviceId,
            deviceName,
            token: crypto_1.default.randomBytes(32).toString('hex')
        });
        return sessionRepo.save(session);
    }
    static updateDeviceName(deviceId, deviceName) {
        return data_source_1.AppDataSource.getRepository(Session_1.Session)
            .update({ deviceId }, { deviceName });
    }
    static async getSession(token, deviceId) {
        return data_source_1.AppDataSource.getRepository(Session_1.Session)
            .findOne({
            where: { token, deviceId },
            relations: ["user"] // Ensure we fetch the user relation
        });
    }
    static async getSessions(userId) {
        return data_source_1.AppDataSource.getRepository(Session_1.Session)
            .find({
            where: { user: { id: userId } },
            relations: ["user"] // Ensure the user is included
        });
    }
    static async deleteSession(sessionId) {
        return data_source_1.AppDataSource.getRepository(Session_1.Session)
            .delete({ id: sessionId });
    }
    static async deleteAllSessions(userId) {
        return data_source_1.AppDataSource.getRepository(Session_1.Session)
            .createQueryBuilder()
            .delete()
            .where("userId = :userId", { userId })
            .execute();
    }
}
exports.AuthService = AuthService;
