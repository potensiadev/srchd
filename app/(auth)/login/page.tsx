"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const supabase = createClient();

  // 사용자 가입 방법 확인
  const checkUserSignupProvider = async (emailToCheck: string): Promise<{
    exists: boolean;
    provider: string | null;
    maskedEmail: string | null;
  }> => {
    const { data: user } = await supabase
      .from("users")
      .select("email, signup_provider")
      .eq("email", emailToCheck)
      .maybeSingle();

    if (!user) {
      return { exists: false, provider: null, maskedEmail: null };
    }

    // 이메일 마스킹: test@example.com -> te**@example.com
    const [localPart, domain] = user.email.split("@");
    const maskedLocal = localPart.length > 2
      ? localPart.slice(0, 2) + "***"
      : localPart + "***";
    const maskedEmail = `${maskedLocal}@${domain}`;

    return {
      exists: true,
      provider: user.signup_provider || "email",
      maskedEmail,
    };
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // 사용자 존재 여부 및 가입 방법 확인
    const userInfo = await checkUserSignupProvider(email);

    if (!userInfo.exists) {
      setError("등록되지 않은 이메일입니다. 회원가입을 진행해주세요.");
      setIsLoading(false);
      return;
    }

    // Google로 가입한 사용자가 이메일 로그인 시도
    if (userInfo.provider === "google") {
      setError(`이 계정은 Google로 가입되었습니다. 아래 'Google로 계속하기' 버튼을 사용해주세요.`);
      setIsLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
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
      router.push(next);
      router.refresh();
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${next}`,
      },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="space-y-6">
      {/* Logo */}
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-white">HR Screener</h1>
        <p className="text-slate-400 text-sm">
          헤드헌터 전용 후보자 관리 플랫폼
        </p>
      </div>

      {/* Login Form */}
      <form
        onSubmit={handleEmailLogin}
        className="p-6 rounded-2xl bg-[#0F0F24]/60 backdrop-blur-md border border-white/5 space-y-4"
      >
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

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
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <Button className="w-full" size="lg" disabled={isLoading}>
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          로그인
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
          onClick={handleGoogleLogin}
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
          Google로 계속하기
        </Button>
      </form>

      {/* Footer */}
      <p className="text-center text-sm text-slate-500">
        계정이 없으신가요?{" "}
        <Link href="/signup" className="text-primary hover:underline">
          회원가입
        </Link>
      </p>
    </div>
  );
}

function LoginLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}
