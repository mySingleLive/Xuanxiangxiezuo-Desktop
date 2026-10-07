import type { NextAuthConfig } from "next-auth"

/**
 * 边缘安全的 Auth 配置（不依赖 Prisma / Node 模块），
 * 供 middleware 与完整 auth 实例共享。
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: "USER" | "ADMIN" }).role ?? "USER"
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = (token.role as "USER" | "ADMIN") ?? "USER"
      }
      return session
    },
  },
  providers: [], // 在 auth.ts 中注入（Credentials 依赖 Prisma，不能进 edge bundle）
} satisfies NextAuthConfig

export default authConfig
