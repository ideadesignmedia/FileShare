import "reflect-metadata";
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from "typeorm";
import { Session } from "./Session";

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', unique: true })
    username!: string;

    @Column({type: 'text'})
    password!: string;

    @OneToMany(() => Session, (session) => session.user)
    sessions!: Session[];
}