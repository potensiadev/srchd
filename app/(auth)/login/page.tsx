"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Shield, Zap, Clock } from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/candidates";

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const supabase = createClient();

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${next}`,
      },
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Login Card */}
      <div className="p-8 rounded-2xl bg-white shadow-xl shadow-gray-200/50 border border-gray-100 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Login
          </h1>
          <p className="text-gray-500 text-m">
            오늘도 헤드헌터님을 돕겠습니다
          </p>
        </div>

        {error && (
          <div
            className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm"
            data-testid="login-error"
          >
            {error}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full h-12 text-sm font-medium border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all"
          size="lg"
          onClick={handleGoogleLogin}
          disabled={isLoading}
          data-testid="google-login-button"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 mr-3 animate-spin" />
          ) : (
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
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
          )}
          Google 계정으로 로그인
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-100"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-4 bg-white text-gray-400">안전한 로그인</span>
          </div>
        </div>

        {/* Trust Badges */}
        {/* <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center text-center p-3 rounded-lg bg-gray-50">
            <Shield className="w-4 h-4 text-primary mb-1.5" />
            <span className="text-xs text-gray-600">보안 인증</span>
          </div>
          <div className="flex flex-col items-center text-center p-3 rounded-lg bg-gray-50">
            <Zap className="w-4 h-4 text-primary mb-1.5" />
            <span className="text-xs text-gray-600">빠른 설정</span>
          </div>
          <div className="flex flex-col items-center text-center p-3 rounded-lg bg-gray-50">
            <Clock className="w-4 h-4 text-primary mb-1.5" />
            <span className="text-xs text-gray-600">24시간 접근</span>
          </div>
        </div> */}

        <p className="text-xs text-gray-400 text-center leading-relaxed">
          로그인 시{" "}
          <Link href="/terms" className="text-gray-500 hover:text-primary underline-offset-2 hover:underline">
            서비스 이용약관
          </Link>
          {" "}및{" "}
          <Link href="/privacy" className="text-gray-500 hover:text-primary underline-offset-2 hover:underline">
            개인정보처리방침
          </Link>
          에 동의합니다.
        </p>
      </div>

      {/* Footer */}
      <p className="text-center text-sm text-gray-500">
        처음이신가요?{" "}
        <Link href="/signup" className="text-primary font-medium hover:underline underline-offset-2">
          무료로 시작하기
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
