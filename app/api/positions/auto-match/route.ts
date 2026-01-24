/**
 * POST /api/positions/auto-match
 * JD 업로드 → 즉시 매칭 (P1-A: JD Auto-Match)
 *
 * 헤드헌터 인터뷰 기반:
 * "JD 받고 오늘 안에 3-5명 제출이 가능해야"
 * "TTR(Time To Recommend) 단축이 경쟁력"
 *
 * 기존 흐름: JD 업로드 → Position 생성 → 수동 매칭 새로고침 → 결과 확인 (4단계)
 * 개선 흐름: JD 업로드 → 즉시 상위 후보자 + Position 자동 생성 (1단계)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/openai/embedding";
import { withRateLimit } from "@/lib/rate-limit";
import OpenAI from "openai";
import { pdfToPng } from "pdf-to-png-converter";
import {
  type Position,
  type PositionCandidate,
  toPosition,
} from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OpenAI 클라이언트
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// 지원 파일 형식
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".doc"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface ExtractedPosition {
  title: string;
  clientCompany: string;
  department: string;
  description: string;
  responsibilities: string | null;
  qualifications: string | null;
  preferredQualifications: string | null;
  benefits: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  minExpYears: number;
  maxExpYears: number | null;
  requiredEducationLevel: string;
  preferredMajors: string[];
  locationCity: string;
  jobType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  deadline: string | null;
}

interface AutoMatchResponse {
  position: Position;
  matches: PositionCandidate[];
  matchCount: number;
  meta: {
    fileName: string;
    textLength: number;
    usedOcr: boolean;
    processingTimeMs: number;
  };
}

/**
 * 파일에서 텍스트 추출
 */
async function extractTextFromFile(
  buffer: Buffer,
  extension: string
): Promise<string> {
  try {
    if (extension === ".pdf") {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const uint8Array = new Uint8Array(buffer);
      const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
      const pdf = await loadingTask.promise;

      const textParts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        textParts.push(pageText);
      }

      return textParts.join("\n\n");
    } else if (extension === ".docx" || extension === ".doc") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value || "";
    }
    throw new Error("지원하지 않는 파일 형식입니다.");
  } catch (error) {
    console.error("Text extraction error:", error);
    throw error;
  }
}

/**
 * GPT-4로 JD에서 구조화된 정보 추출
 */
async function extractPositionFromText(
  text: string
): Promise<ExtractedPosition> {
  const openai = getOpenAIClient();

  const systemPrompt = `You are a professional HR/recruitment specialist. Extract job position information from the provided job description (JD) text.

Return a JSON object with the following structure:
{
  "title": "직책/포지션명",
  "clientCompany": "채용 회사명",
  "department": "부서명",
  "description": "직무 설명 요약 (3-7줄)",
  "responsibilities": "주요업무 섹션 원문 (bullet point 유지, 없으면 null)",
  "qualifications": "자격요건 섹션 원문 (없으면 null)",
  "preferredQualifications": "우대사항 섹션 원문 (없으면 null)",
  "benefits": "복리후생 섹션 원문 (없으면 null)",
  "requiredSkills": ["필수 스킬", "최대 10개"],
  "preferredSkills": ["우대 스킬", "최대 5개"],
  "minExpYears": 최소 경력 (숫자),
  "maxExpYears": 최대 경력 (숫자 또는 null),
  "requiredEducationLevel": "학력 요건 (bachelor/master/doctorate 등)",
  "preferredMajors": ["우대 전공"],
  "locationCity": "근무지",
  "jobType": "full-time/contract/freelance/internship 또는 빈 문자열",
  "salaryMin": 최소 연봉 만원 단위 (숫자 또는 null),
  "salaryMax": 최대 연봉 만원 단위 (숫자 또는 null),
  "deadline": "YYYY-MM-DD 형식 또는 null"
}

Important:
- Extract skills EXACTLY as written - preserve Korean or English
- Use empty string for missing strings, empty array for missing arrays, null for optional numbers`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `다음 JD에서 포지션 정보를 추출해주세요:\n\n${text.slice(0, 15000)}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("GPT 응답을 받지 못했습니다.");
  }

  const parsed = JSON.parse(content) as ExtractedPosition;

  return {
    title: parsed.title || "",
    clientCompany: parsed.clientCompany || "",
    department: parsed.department || "",
    description: parsed.description || "",
    responsibilities: parsed.responsibilities || null,
    qualifications: parsed.qualifications || null,
    preferredQualifications: parsed.preferredQualifications || null,
    benefits: parsed.benefits || null,
    requiredSkills: Array.isArray(parsed.requiredSkills)
      ? parsed.requiredSkills.slice(0, 20)
      : [],
    preferredSkills: Array.isArray(parsed.preferredSkills)
      ? parsed.preferredSkills.slice(0, 10)
      : [],
    minExpYears: typeof parsed.minExpYears === "number" ? parsed.minExpYears : 0,
    maxExpYears:
      typeof parsed.maxExpYears === "number" ? parsed.maxExpYears : null,
    requiredEducationLevel: parsed.requiredEducationLevel || "",
    preferredMajors: Array.isArray(parsed.preferredMajors)
      ? parsed.preferredMajors
      : [],
    locationCity: parsed.locationCity || "",
    jobType: parsed.jobType || "",
    salaryMin: typeof parsed.salaryMin === "number" ? parsed.salaryMin : null,
    salaryMax: typeof parsed.salaryMax === "number" ? parsed.salaryMax : null,
    deadline: parsed.deadline || null,
  };
}

/**
 * PDF를 이미지로 변환
 */
async function convertPdfToImages(buffer: Buffer): Promise<string[]> {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
  const pngPages = await pdfToPng(arrayBuffer, {
    disableFontFace: true,
    useSystemFonts: true,
    viewportScale: 2.0,
    pagesToProcess: [1, 2, 3, 4, 5],
  });

  const base64Images: string[] = [];
  for (const page of pngPages) {
    if (page.content) {
      const base64 = page.content.toString("base64");
      base64Images.push(`data:image/png;base64,${base64}`);
    }
  }

  return base64Images;
}

/**
 * GPT-4 Vision으로 이미지에서 JD 정보 추출
 */
async function extractPositionFromImages(
  imageUrls: string[]
): Promise<ExtractedPosition> {
  const openai = getOpenAIClient();

  const systemPrompt = `You are a professional HR/recruitment specialist with OCR capabilities.
Analyze the job description (JD) images and extract position information.
Return JSON with: title, clientCompany, department, description, responsibilities, qualifications, preferredQualifications, benefits, requiredSkills, preferredSkills, minExpYears, maxExpYears, requiredEducationLevel, preferredMajors, locationCity, jobType, salaryMin, salaryMax, deadline.
Extract skills exactly as written - preserve Korean or English.`;

  const imageContents: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
    imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    }));

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "다음 JD 이미지들에서 포지션 정보를 추출해주세요:",
          },
          ...imageContents,
        ],
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("GPT Vision 응답을 받지 못했습니다.");
  }

  const parsed = JSON.parse(content) as ExtractedPosition;

  return {
    title: parsed.title || "",
    clientCompany: parsed.clientCompany || "",
    department: parsed.department || "",
    description: parsed.description || "",
    responsibilities: parsed.responsibilities || null,
    qualifications: parsed.qualifications || null,
    preferredQualifications: parsed.preferredQualifications || null,
    benefits: parsed.benefits || null,
    requiredSkills: Array.isArray(parsed.requiredSkills)
      ? parsed.requiredSkills.slice(0, 20)
      : [],
    preferredSkills: Array.isArray(parsed.preferredSkills)
      ? parsed.preferredSkills.slice(0, 10)
      : [],
    minExpYears: typeof parsed.minExpYears === "number" ? parsed.minExpYears : 0,
    maxExpYears:
      typeof parsed.maxExpYears === "number" ? parsed.maxExpYears : null,
    requiredEducationLevel: parsed.requiredEducationLevel || "",
    preferredMajors: Array.isArray(parsed.preferredMajors)
      ? parsed.preferredMajors
      : [],
    locationCity: parsed.locationCity || "",
    jobType: parsed.jobType || "",
    salaryMin: typeof parsed.salaryMin === "number" ? parsed.salaryMin : null,
    salaryMax: typeof parsed.salaryMax === "number" ? parsed.salaryMax : null,
    deadline: parsed.deadline || null,
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Rate limiting
    const rateLimitResponse = await withRateLimit(request, "default");
    if (rateLimitResponse) return rateLimitResponse;

    const supabase = await createClient();

    // 인증 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    // FormData 파싱
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const matchLimit = parseInt(formData.get("matchLimit")?.toString() || "20");
    const minScore = parseFloat(formData.get("minScore")?.toString() || "0.3");

    if (!file) {
      return NextResponse.json(
        { success: false, error: "파일이 제공되지 않았습니다." },
        { status: 400 }
      );
    }

    // 파일 검증
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "파일 크기가 5MB를 초과합니다." },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const extension = "." + fileName.split(".").pop();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return NextResponse.json(
        { success: false, error: "PDF, DOCX, DOC 파일만 지원됩니다." },
        { status: 400 }
      );
    }

    // 파일 버퍼 읽기
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Step 1: JD 추출
    let extractedText = "";
    let usedOcr = false;
    let extractedPosition: ExtractedPosition;

    try {
      extractedText = await extractTextFromFile(buffer, extension);
    } catch (error) {
      console.error("Text extraction failed:", error);
    }

    const trimmedTextLength = extractedText.trim().length;

    if (trimmedTextLength >= 100) {
      extractedPosition = await extractPositionFromText(extractedText);
    } else if (extension === ".pdf") {
      usedOcr = true;
      const imageUrls = await convertPdfToImages(buffer);
      if (imageUrls.length === 0) {
        return NextResponse.json(
          { success: false, error: "PDF를 이미지로 변환하는데 실패했습니다." },
          { status: 400 }
        );
      }
      extractedPosition = await extractPositionFromImages(imageUrls);
    } else {
      return NextResponse.json(
        { success: false, error: "파일에서 텍스트를 추출할 수 없습니다." },
        { status: 400 }
      );
    }

    // 필수 필드 검증
    if (!extractedPosition.title || extractedPosition.requiredSkills.length === 0) {
      // 기본값 설정
      if (!extractedPosition.title) {
        extractedPosition.title = file.name.replace(/\.[^/.]+$/, ""); // 파일명을 제목으로
      }
      if (extractedPosition.requiredSkills.length === 0) {
        extractedPosition.requiredSkills = ["미지정"];
      }
    }

    // Step 2: Position 생성 + 임베딩
    let embedding: number[] | null = null;
    try {
      const embeddingText = [
        extractedPosition.title,
        extractedPosition.responsibilities,
        extractedPosition.qualifications,
        `필수 스킬: ${extractedPosition.requiredSkills.join(", ")}`,
        extractedPosition.preferredSkills?.length
          ? `우대 스킬: ${extractedPosition.preferredSkills.join(", ")}`
          : "",
        extractedPosition.description,
      ]
        .filter(Boolean)
        .join("\n");

      embedding = await generateEmbedding(embeddingText);
    } catch (embeddingError) {
      console.warn("Position embedding generation failed:", embeddingError);
    }

    const toNullIfEmpty = (val: string | undefined | null): string | null =>
      val && val.trim() ? val.trim() : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: position, error: insertError } = await (supabase as any)
      .from("positions")
      .insert({
        user_id: user.id,
        title: extractedPosition.title,
        client_company: toNullIfEmpty(extractedPosition.clientCompany),
        department: toNullIfEmpty(extractedPosition.department),
        description: toNullIfEmpty(extractedPosition.description),
        responsibilities: toNullIfEmpty(extractedPosition.responsibilities),
        qualifications: toNullIfEmpty(extractedPosition.qualifications),
        preferred_qualifications: toNullIfEmpty(extractedPosition.preferredQualifications),
        benefits: toNullIfEmpty(extractedPosition.benefits),
        required_skills: extractedPosition.requiredSkills,
        preferred_skills: extractedPosition.preferredSkills,
        min_exp_years: extractedPosition.minExpYears,
        max_exp_years: extractedPosition.maxExpYears,
        required_education_level: toNullIfEmpty(extractedPosition.requiredEducationLevel),
        preferred_majors: extractedPosition.preferredMajors,
        location_city: toNullIfEmpty(extractedPosition.locationCity),
        job_type: extractedPosition.jobType || null,
        salary_min: extractedPosition.salaryMin,
        salary_max: extractedPosition.salaryMax,
        priority: "normal",
        deadline: toNullIfEmpty(extractedPosition.deadline),
        embedding,
        status: "open",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Position insert error:", insertError);
      return NextResponse.json(
        { success: false, error: `포지션 생성 실패: ${insertError.message}` },
        { status: 500 }
      );
    }

    // Step 3: 즉시 매칭 실행 (동기)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matchCount, error: matchError } = await (supabase as any).rpc(
      "save_position_matches",
      {
        p_position_id: position.id,
        p_user_id: user.id,
        p_limit: Math.min(matchLimit, 100),
        p_min_score: minScore,
      }
    );

    if (matchError) {
      console.error("Matching error:", matchError);
      // 매칭 실패해도 Position은 반환
    }

    // Step 4: 매칭 결과 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matches, error: fetchMatchesError } = await (supabase as any)
      .from("position_candidates")
      .select(
        `
        *,
        candidates!inner (
          id,
          name,
          last_position,
          last_company,
          exp_years,
          skills,
          photo_url
        )
      `
      )
      .eq("position_id", position.id)
      .order("overall_score", { ascending: false })
      .limit(matchLimit);

    if (fetchMatchesError) {
      console.error("Fetch matches error:", fetchMatchesError);
    }

    // 결과 변환
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: PositionCandidate[] = (matches || []).map((row: any) => {
      const candidate = row.candidates as Record<string, unknown>;
      return {
        id: row.id as string,
        positionId: row.position_id as string,
        candidateId: row.candidate_id as string,
        overallScore: Math.round(((row.overall_score as number) || 0) * 100),
        skillScore: Math.round(((row.skill_score as number) || 0) * 100),
        experienceScore: Math.round(((row.experience_score as number) || 0) * 100),
        educationScore: Math.round(((row.education_score as number) || 0) * 100),
        semanticScore: Math.round(((row.semantic_score as number) || 0) * 100),
        matchedSkills: (row.matched_skills as string[]) || [],
        missingSkills: (row.missing_skills as string[]) || [],
        matchExplanation: row.match_explanation as PositionCandidate["matchExplanation"],
        stage: (row.stage as PositionCandidate["stage"]) || "matched",
        rejectionReason: row.rejection_reason as string | undefined,
        notes: row.notes as string | undefined,
        matchedAt: row.matched_at as string,
        stageUpdatedAt: row.stage_updated_at as string,
        candidate: {
          id: candidate.id as string,
          name: candidate.name as string,
          lastPosition: candidate.last_position as string | undefined,
          lastCompany: candidate.last_company as string | undefined,
          expYears: (candidate.exp_years as number) || 0,
          skills: (candidate.skills as string[]) || [],
          photoUrl: candidate.photo_url as string | undefined,
        },
      };
    });

    const processingTimeMs = Date.now() - startTime;

    const response: AutoMatchResponse = {
      position: toPosition(position as Record<string, unknown>),
      matches: results,
      matchCount: matchCount || results.length,
      meta: {
        fileName: file.name,
        textLength: trimmedTextLength,
        usedOcr,
        processingTimeMs,
      },
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Auto-match error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "서버 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
