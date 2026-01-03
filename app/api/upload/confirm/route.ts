/**
 * POST /api/upload/confirm
 * 클라이언트가 Storage에 직접 업로드 완료 후 Worker 파이프라인 트리거
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Worker URL
const WORKER_URL = process.env.WORKER_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // 인증 확인
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            );
        }

        // 요청 바디 파싱
        const { jobId, candidateId, storagePath, fileName, userId, plan } = await request.json();

        if (!jobId || !storagePath) {
            return NextResponse.json(
                { success: false, error: "Missing required fields" },
                { status: 400 }
            );
        }

        // Worker 파이프라인 호출 (await로 실제 요청이 완료되었는지 확인)
        const workerPayload = {
            file_url: storagePath,
            file_name: fileName,
            user_id: userId,
            job_id: jobId,
            candidate_id: candidateId,
            mode: plan === "enterprise" ? "phase_2" : "phase_1",
        };

        console.log("[Upload Confirm] Calling Worker pipeline:", {
            url: `${WORKER_URL}/pipeline`,
            payload: workerPayload,
        });

        try {
            const workerRes = await fetch(`${WORKER_URL}/pipeline`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(workerPayload),
            });

            console.log("[Upload Confirm] Worker response status:", workerRes.status);

            if (!workerRes.ok) {
                const errorText = await workerRes.text();
                console.error("[Upload Confirm] Worker error:", errorText);
            }
        } catch (workerError) {
            console.error("[Upload Confirm] Worker pipeline request failed:", workerError);
            // Worker 실패해도 사용자에게는 성공 반환 (비동기 처리)
        }

        return NextResponse.json({
            success: true,
            jobId,
            message: "파일이 업로드되었습니다. 백그라운드에서 분석 중입니다.",
        });
    } catch (error) {
        console.error("Confirm error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
