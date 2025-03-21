import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from "typeorm";
import { User } from "./User";

@Entity()
export class Session {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => User, (user) => user.sessions, { onDelete: "CASCADE" })
    user!: User;

    @Column({ unique: true })
    token!: string;

    @Column()
    deviceId!: string;

    @Column({ nullable: true })
    deviceName?: string;

    @CreateDateColumn()
    createdAt!: Date;
}