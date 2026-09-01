"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.logoutUser = exports.refreshUserToken = exports.loginUser = exports.registerUser = void 0;
const prisma_1 = require("../lib/prisma");
const password_1 = require("../utils/password");
const jwt_1 = require("../utils/jwt");
const registerUser = async (data) => {
    const existingUser = await prisma_1.prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
        throw { status: 409, message: 'Email already registered' };
    }
    const hashedPassword = await (0, password_1.hashPassword)(data.password);
    const user = await prisma_1.prisma.user.create({
        data: {
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            passwordHash: hashedPassword,
        },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            createdAt: true,
        }
    });
    return user;
};
exports.registerUser = registerUser;
const loginUser = async (data, ipAddress) => {
    const user = await prisma_1.prisma.user.findUnique({ where: { email: data.email } });
    let success = false;
    if (user && await (0, password_1.comparePassword)(data.password, user.passwordHash)) {
        success = true;
    }
    await prisma_1.prisma.loginAttempt.create({
        data: {
            email: data.email,
            ipAddress,
            success,
            userId: success && user ? user.id : null
        }
    });
    if (!success || !user) {
        throw { status: 401, message: 'Invalid credentials' }; // Generic message
    }
    await prisma_1.prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
    });
    const accessToken = (0, jwt_1.generateAccessToken)({
        id: user.id,
        email: user.email,
        role: user.role
    });
    const refreshToken = await (0, jwt_1.generateRefreshToken)(user.id);
    return {
        accessToken,
        refreshToken,
        user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
        }
    };
};
exports.loginUser = loginUser;
const refreshUserToken = async (data) => {
    const rfDB = await prisma_1.prisma.refreshToken.findUnique({
        where: { token: data.refreshToken },
        include: { user: true }
    });
    if (!rfDB || rfDB.revoked || rfDB.expiresAt < new Date()) {
        throw { status: 401, message: 'Invalid or expired refresh token' };
    }
    // Revoke old token
    await prisma_1.prisma.refreshToken.update({
        where: { id: rfDB.id },
        data: { revoked: true }
    });
    // Generate new payload pair
    const accessToken = (0, jwt_1.generateAccessToken)({
        id: rfDB.user.id,
        email: rfDB.user.email,
        role: rfDB.user.role
    });
    const newRefreshToken = await (0, jwt_1.generateRefreshToken)(rfDB.user.id);
    return { accessToken, refreshToken: newRefreshToken };
};
exports.refreshUserToken = refreshUserToken;
const logoutUser = async (refreshToken) => {
    try {
        await prisma_1.prisma.refreshToken.update({
            where: { token: refreshToken },
            data: { revoked: true }
        });
    }
    catch (e) {
        // Return success even if not found (idempotent)
    }
};
exports.logoutUser = logoutUser;
const getMe = async (userId) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            createdAt: true,
            lastLogin: true
        }
    });
    if (!user)
        throw { status: 404, message: 'User not found' };
    return user;
};
exports.getMe = getMe;
