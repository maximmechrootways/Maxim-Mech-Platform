"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.logoutUser = exports.refreshUserToken = exports.setupProfile = exports.loginWithInviteCode = exports.loginUser = void 0;
const prisma_1 = require("../lib/prisma");
const password_1 = require("../utils/password");
const jwt_1 = require("../utils/jwt");
const inviteService_1 = require("./inviteService");
/**
 * Narrow selects for auth so login/refresh work before optional DB migrations add new User columns.
 * (Bare findUnique loads every scalar; missing columns break Prisma at runtime.)
 */
const loginUserSelect = {
    id: true,
    email: true,
    passwordHash: true,
    firstName: true,
    lastName: true,
    role: true,
    hasCompletedSetup: true,
    uiPreferences: true,
};
const inviteLoginUserSelect = {
    ...loginUserSelect,
    isActive: true,
};
const refreshUserSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    hasCompletedSetup: true,
    uiPreferences: true,
};
/**
 * Login with email + password (normal login).
 */
const loginUser = async (data, ipAddress) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: { email: data.email },
        select: loginUserSelect,
    });
    let success = false;
    if (user && user.passwordHash && await (0, password_1.comparePassword)(data.password, user.passwordHash)) {
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
        throw { status: 401, message: 'Invalid credentials' };
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
            role: user.role,
            hasCompletedSetup: user.hasCompletedSetup,
            uiPreferences: user.uiPreferences ?? {},
        }
    };
};
exports.loginUser = loginUser;
/**
 * Login with email + one-time invite code (first-time login).
 */
const loginWithInviteCode = async (email, code, ipAddress) => {
    // Validate the invite code is tied to this email
    const invite = await (0, inviteService_1.validateInviteCode)(code, email);
    // Find the user by email
    const user = await prisma_1.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: inviteLoginUserSelect,
    });
    if (!user) {
        throw { status: 401, message: 'No account found for this email. Ask HR to create your account.' };
    }
    if (!user.isActive) {
        throw { status: 401, message: 'Account is deactivated. Contact HR.' };
    }
    // Redeem the code (one-time use)
    await (0, inviteService_1.redeemInviteCode)(code, user.id);
    // Log the attempt
    await prisma_1.prisma.loginAttempt.create({
        data: { email, ipAddress, success: true, userId: user.id }
    });
    // Update last login
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
            role: user.role,
            hasCompletedSetup: user.hasCompletedSetup,
            uiPreferences: user.uiPreferences ?? {},
        }
    };
};
exports.loginWithInviteCode = loginWithInviteCode;
/**
 * Setup profile: set password on first login.
 */
const setupProfile = async (userId, password, displayName) => {
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user)
        throw { status: 404, message: 'User not found' };
    const hashedPassword = await (0, password_1.hashPassword)(password);
    const updates = {
        passwordHash: hashedPassword,
        hasCompletedSetup: true,
    };
    if (displayName) {
        const parts = displayName.trim().split(/\s+/);
        updates.firstName = parts[0];
        if (parts.length > 1)
            updates.lastName = parts.slice(1).join(' ');
    }
    await prisma_1.prisma.user.update({ where: { id: userId }, data: updates });
    return { success: true };
};
exports.setupProfile = setupProfile;
const refreshUserToken = async (refreshToken) => {
    const rfDB = await prisma_1.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: { select: refreshUserSelect } },
    });
    if (!rfDB || rfDB.revoked || rfDB.expiresAt < new Date()) {
        throw { status: 401, message: 'Invalid or expired refresh token' };
    }
    await prisma_1.prisma.refreshToken.update({
        where: { id: rfDB.id },
        data: { revoked: true }
    });
    const accessToken = (0, jwt_1.generateAccessToken)({
        id: rfDB.user.id,
        email: rfDB.user.email,
        role: rfDB.user.role
    });
    const newRefreshToken = await (0, jwt_1.generateRefreshToken)(rfDB.user.id);
    const user = {
        id: rfDB.user.id,
        email: rfDB.user.email,
        firstName: rfDB.user.firstName,
        lastName: rfDB.user.lastName,
        role: rfDB.user.role,
        hasCompletedSetup: rfDB.user.hasCompletedSetup ?? true,
        uiPreferences: rfDB.user.uiPreferences ?? {},
    };
    return { accessToken, refreshToken: newRefreshToken, user };
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
            hasCompletedSetup: true,
            uiPreferences: true,
            createdAt: true,
            lastLogin: true
        }
    });
    if (!user)
        throw { status: 404, message: 'User not found' };
    return user;
};
exports.getMe = getMe;
