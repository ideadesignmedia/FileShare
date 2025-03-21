import { AppDataSource } from "./database/data-source";
import { Session } from "./database/entities/Session";
import { User } from "./database/entities/User";
import crypto from 'crypto';
import bcrypt from 'bcrypt'

export class AuthService {
    static exists(username: string) {
        const userRepo = AppDataSource.getRepository(User);
        return userRepo.createQueryBuilder("user")
            .where("user.username = :username", { username })
            .getOne();
    }

    static getUser(id: number) {
        const userRepo = AppDataSource.getRepository(User);
        return userRepo.findOne({ where: { id } });
    }

    static async register(username: string, password: string) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const userRepo = AppDataSource.getRepository(User);
        const user = userRepo.create({ username, password: hashedPassword });
        return userRepo.save(user);
    }
    
    static async authenticate(username: string, password: string) {
        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo.findOne({ where: { username } });
    
        if (!user) return null;
    
        const passwordMatch = await bcrypt.compare(password, user.password);
        return passwordMatch ? user : null;
    }

    static async createSession(userId: number, deviceId: string, deviceName?: string) {
        const sessionRepo = AppDataSource.getRepository(Session);
        const userRepo = AppDataSource.getRepository(User);

        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) throw new Error("User not found");

        const existingSession = await sessionRepo.findOne({ where: { deviceId } });
        if (existingSession) {
            await sessionRepo.delete({ id: existingSession.id });
        }

        const session = sessionRepo.create({
            user, // Assign the full User entity
            deviceId,
            deviceName,
            token: crypto.randomBytes(32).toString('hex')
        });

        return sessionRepo.save(session);
    }

    static updateDeviceName(deviceId: string, deviceName: string) {
        return AppDataSource.getRepository(Session)
            .update({ deviceId }, { deviceName });
    }

    static async getSession(token: string, deviceId: string) {
        return AppDataSource.getRepository(Session)
            .findOne({
                where: { token, deviceId },
                relations: ["user"] // Ensure we fetch the user relation
            });
    }

    static async getSessions(userId: number) {
        return AppDataSource.getRepository(Session)
            .find({
                where: { user: { id: userId } },
                relations: ["user"] // Ensure the user is included
            });
    }

    static async deleteSession(sessionId: number) {
        return AppDataSource.getRepository(Session)
            .delete({ id: sessionId });
    }

    static async deleteAllSessions(userId: number) {
        return AppDataSource.getRepository(Session)
            .createQueryBuilder()
            .delete()
            .where("userId = :userId", { userId })
            .execute();
    }
}