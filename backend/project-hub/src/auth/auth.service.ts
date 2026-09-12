import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor (private prisma: PrismaService, private jwtService: JwtService) {}

    async register (email:string, password:string) {
        const user = await this.prisma.user.findUnique({
            where: {
                email
            }
        });

        if (user) throw new ConflictException('Email already in use');

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUser = await this.prisma.user.create({
                data: {
                    email,
                    password: hashedPassword
                }
            }
        );

        const payload = {userId: newUser.id};
        const token = this.jwtService.sign(payload);
        
        return {access_token: token};
    }

    async login (email:string, password:string) {
        const user = await this.prisma.user.findUnique({
            where: {
                email
            }
        });

        if (!user || !user.password) throw new UnauthorizedException('Invalid credentials'); 
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) throw new UnauthorizedException('Invalid credentials');

        const payload = {userId: user.id};
        const token = this.jwtService.sign(payload);
        
        return {access_token: token};
    }
}
