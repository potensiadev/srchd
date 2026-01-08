"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import DeepSpaceBackground from "./DeepSpaceBackground";

// Three.js 배경은 동적 임포트 (SSR 비활성화)
const ThreeJSBackground = dynamic(() => import("./ThreeJSBackground"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#0a0a1f] via-[#050510] to-[#0a0a1f]" />
  ),
});

/**
 * 디바이스가 3D 그래픽을 처리할 수 있는지 확인
 */
function canHandle3D(): boolean {
  if (typeof window === "undefined") return false;

  // WebGL 지원 확인
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return false;

    // 하드웨어 성능 힌트 확인
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      // 저사양 GPU 감지 (Intel HD Graphics 등 기본 내장 GPU)
      const isLowEnd = /Intel|Mesa|SwiftShader|llvmpipe/i.test(renderer);
      if (isLowEnd) return false;
    }

    // 모바일 디바이스는 CSS 배경 사용 (배터리 절약)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    if (isMobile) return false;

    // 디바이스 메모리가 4GB 이하면 CSS 배경 사용
    if ("deviceMemory" in navigator) {
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      if (memory && memory < 4) return false;
    }

    // 배터리 절약 모드 감지
    if ("connection" in navigator) {
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
      if (connection?.saveData) return false;
    }

    return true;
  } catch {
    return false;
  }
}

interface AdaptiveBackgroundProps {
  /**
   * 강제로 특정 배경 타입 사용
   * - "auto": 자동 감지 (기본값)
   * - "3d": Three.js 배경 강제 사용
   * - "css": CSS 배경 강제 사용
   */
  mode?: "auto" | "3d" | "css";
}

export default function AdaptiveBackground({ mode = "auto" }: AdaptiveBackgroundProps) {
  const [use3D, setUse3D] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);

    if (mode === "3d") {
      setUse3D(true);
    } else if (mode === "css") {
      setUse3D(false);
    } else {
      // auto 모드: 성능에 따라 자동 선택
      setUse3D(canHandle3D());
    }
  }, [mode]);

  // SSR에서는 기본 그라데이션
  if (!isClient) {
    return (
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#0a0a1f] via-[#050510] to-[#0a0a1f]" />
    );
  }

  // 3D 또는 CSS 배경 선택
  if (use3D) {
    return <ThreeJSBackground />;
  }

  return <DeepSpaceBackground />;
}
