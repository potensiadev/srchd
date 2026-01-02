"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, UserCheck } from "lucide-react";

type ExistingUser = {
  exists: true;
  provider: "email" | "google";
  email: string;
} | null;

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [existingUser, setExistingUser] = useState<ExistingUser>(null);

  const supabase = createClient();

  // 이메일 중복 체크 및 가입 방법 확인 (API 호출)
  const checkExistingUser = async (emailToCheck: string): Promise<{
    exists: boolean;
    provider: string | null;
  }> => {
    try {
      const response = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToCheck }),
      });

      if (!response.ok) {
        console.error("Email check failed:", response.status);
        return { exists: false, provider: null };
      }

      const data = await response.json();
      return { exists: data.exists, provider: data.provider };
    } catch (error) {
      console.error("Email check error:", error);
      return { exists: false, provider: null };
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 비밀번호 확인
    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    setIsLoading(true);

    // 이메일 중복 체크 및 가입 방법 확인
    const result = await checkExistingUser(email);
    if (result.exists) {
      // 에러 대신 로그인 전환 UI 표시
      setExistingUser({
        exists: true,
        provider: result.provider as "email" | "google",
        email: email,
      });
      setIsLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        },
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/consent`,
      },
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    } else {
      router.push("/consent");
      router.refresh();
    }
  };

  // 기존 계정으로 로그인
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: existingUser?.email || email,
      password,
    });

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        setError("비밀번호가 올바르지 않습니다. 다시 확인해주세요.");
      } else {
        setError(error.message);
      }
      setIsLoading(false);
    } else {
      router.push("/candidates");
      router.refresh();
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/candidates`,
      },
    });
    if (error) setError(error.message);
  };

  const handleGoogleSignup = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/consent`,
      },
    });
    if (error) setError(error.message);
  };

  // 다른 이메일로 가입하기
  const handleReset = () => {
    setExistingUser(null);
    setEmail("");
    setPassword("");
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Logo */}
      <div className="text-center space-y-2">
        <AnimatePresence mode="wait">
          {existingUser ? (
            <motion.div
              key="welcome-back"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-12 h-12 mx-auto rounded-xl bg-green-500/20 flex items-center justify-center border border-green-500/30"
            >
              <UserCheck className="w-6 h-6 text-green-400" />
            </motion.div>
          ) : (
            <motion.div
              key="signup"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-12 h-12 mx-auto rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30"
            >
              <Sparkles className="w-6 h-6 text-primary" />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {existingUser ? (
            <motion.div
              key="welcome-text"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <h1 className="text-2xl font-bold text-white">반가워요!</h1>
              <p className="text-slate-400 text-sm">이미 회원이시네요</p>
            </motion.div>
          ) : (
            <motion.div
              key="signup-text"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <h1 className="text-2xl font-bold text-white">회원가입</h1>
              <p className="text-slate-400 text-sm">
                HR Screener에 오신 것을 환영합니다
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Form Area */}
      <div className="p-6 rounded-2xl bg-[#0F0F24]/60 backdrop-blur-md border border-white/5 space-y-4">
        <AnimatePresence mode="wait">
          {existingUser ? (
            // 로그인 전환 UI
            <motion.div
              key="login-mode"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {existingUser.provider === "google" ? (
                // Google 가입자용 UI
                <div className="space-y-4">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20"
                  >
                    <p className="text-blue-300 text-sm text-center">
                      <span className="font-medium">{existingUser.email}</span>
                      <br />
                      <span className="text-blue-400/80">
                        Google 계정으로 가입되어 있습니다
                      </span>
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <Button
                      type="button"
                      className="w-full bg-white hover:bg-gray-100 text-gray-900"
                      size="lg"
                      onClick={handleGoogleLogin}
                    >
                      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Google로 로그인하기
                    </Button>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-center"
                  >
                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-sm text-slate-400 hover:text-primary transition-colors"
                    >
                      다른 이메일로 가입하기
                    </button>
                  </motion.div>
                </div>
              ) : (
                // 이메일 가입자용 UI
                <form onSubmit={handleLogin} className="space-y-4">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="p-4 rounded-lg bg-green-500/10 border border-green-500/20"
                  >
                    <p className="text-green-300 text-sm text-center">
                      <span className="font-medium">{existingUser.email}</span>
                      <br />
                      <span className="text-green-400/80">
                        계정이 이미 등록되어 있습니다
                      </span>
                    </p>
                  </motion.div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
                    >
                      {error}
                    </motion.div>
                  )}

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="login-password">비밀번호</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="비밀번호를 입력하세요"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoFocus
                    />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      disabled={isLoading}
                    >
                      {isLoading && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      로그인하기
                    </Button>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    className="text-center space-y-2"
                  >
                    <Link
                      href="/login"
                      className="text-sm text-slate-400 hover:text-primary transition-colors block"
                    >
                      비밀번호를 잊으셨나요?
                    </Link>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-sm text-slate-400 hover:text-primary transition-colors"
                    >
                      다른 이메일로 가입하기
                    </button>
                  </motion.div>
                </form>
              )}
            </motion.div>
          ) : (
            // 기본 회원가입 폼
            <motion.form
              key="signup-mode"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onSubmit={handleEmailSignup}
              className="space-y-4"
            >
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="홍길동"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="8자 이상"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">비밀번호 확인</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="비밀번호를 다시 입력하세요"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <Button className="w-full" size="lg" disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                계속하기
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[#0F0F24] px-2 text-slate-500">또는</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                size="lg"
                onClick={handleGoogleSignup}
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google로 시작하기
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <AnimatePresence mode="wait">
        {!existingUser && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center text-sm text-slate-500"
          >
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="text-primary hover:underline">
              로그인
            </Link>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
