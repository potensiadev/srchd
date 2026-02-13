"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Shield, Zap, Lock } from "lucide-react";

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const supabase = createClient();

  const handleGoogleSignup = async () => {
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent("/consent")}`,
      },
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Logo */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">회원가입</h1>
        <p className="text-gray-800 text-base mb-4">
          헤드헌터님의 시간을 아껴드릴게요
        </p>
      </div>

      {/* Signup Card */}
      <div className="p-8 rounded-3xl bg-white shadow-2xl shadow-black/5 border border-gray-100 space-y-6">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Benefits */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-green-600" />
            </div>
            <span>Google 계정으로 안전하게 가입</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-blue-600" />
            </div>
            <span>5초만에 빠른 회원가입 완료</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Lock className="w-4 h-4 text-purple-600" />
            </div>
            <span>별도 비밀번호 설정 불필요</span>
          </div>
        </div>

        <div className="pt-2">
          <Button
            type="button"
            className="w-full h-12 text-base font-medium"
            size="lg"
            onClick={handleGoogleSignup}
            disabled={isLoading}
            data-testid="google-signup-button"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path
                  fill="white"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="white"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="white"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="white"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            Google로 시작하기
          </Button>
        </div>

        <p className="text-xs text-gray-400 text-center">
          가입 시{" "}
          <Link href="/terms" className="underline hover:text-gray-600">
            서비스 이용약관
          </Link>
          {" "}및{" "}
          <Link href="/privacy" className="underline hover:text-gray-600">
            개인정보처리방침
          </Link>
          에 동의하게 됩니다.
        </p>
      </div>

      {/* Footer */}
      <p className="text-center text-sm text-gray-500">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="text-primary font-semibold hover:underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
