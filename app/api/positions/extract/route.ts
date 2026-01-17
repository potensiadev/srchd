/**
 * POST /api/positions/extract
 * JD 파일에서 포지션 정보 추출
 * - 텍스트 기반 PDF/DOCX: 텍스트 추출 후 GPT-4로 분석
 * - 이미지 기반 PDF/DOCX: GPT-4 Vision으로 OCR + 분석
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withRateLimit } from "@/lib/rate-limit";
import OpenAI from "openai";
import { pdfToPng } from "pdf-to-png-converter";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const execPromise = promisify(exec);

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

/**
 * 파일에서 텍스트 추출
 */
async function extractTextFromFile(buffer: Buffer, extension: string): Promise<string> {
  console.log(`Extracting text from ${extension} file, buffer size: ${buffer.length}`);

  try {
    if (extension === ".pdf") {
      // Use pdfjs-dist for better Next.js compatibility
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

      // Load PDF document
      const uint8Array = new Uint8Array(buffer);
      const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
      const pdf = await loadingTask.promise;

      console.log(`PDF loaded, pages: ${pdf.numPages}`);

      // Extract text from all pages
      const textParts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        textParts.push(pageText);
      }

      const fullText = textParts.join("\n\n");
      console.log(`PDF parsed, text length: ${fullText.length}`);

      // 텍스트가 거의 없으면 이미지 기반 PDF일 가능성 안내
      if (fullText.trim().length < 50 && pdf.numPages > 0) {
        console.log("Warning: Very little text extracted, might be image-based PDF");
      }

      return fullText;
    } else if (extension === ".docx" || extension === ".doc") {
      // Use require for mammoth
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      console.log("Calling mammoth.extractRawText...");

      try {
        const result = await mammoth.extractRawText({ buffer });
        console.log(`DOCX parsed, text length: ${result.value?.length || 0}`);
        return result.value || "";
      } catch (mammothError) {
        console.error("Mammoth error:", mammothError);
        if (extension === ".doc") {
          throw new Error("DOC 형식은 제한적으로 지원됩니다. DOCX 또는 PDF로 변환 후 다시 시도해주세요.");
        }
        throw new Error("파일에서 텍스트를 추출할 수 없습니다.");
      }
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
async function extractPositionFromText(text: string): Promise<ExtractedPosition> {
  const openai = getOpenAIClient();

  const systemPrompt = `You are a professional HR/recruitment specialist. Extract job position information from the provided job description (JD) text.

Return a JSON object with the following structure:
{
  "title": "직책/포지션명 (예: 시니어 백엔드 개발자)",
  "clientCompany": "채용 회사명 (없으면 빈 문자열)",
  "department": "부서명 (없으면 빈 문자열)",
  "description": "직무 설명 요약 (최소 3줄, 최대 7줄). 담당 업무, 주요 역할, 프로젝트 내용 등 핵심 정보를 포함하여 상세하게 작성",
  "responsibilities": "주요업무/담당업무 섹션 원문 (bullet point 형식 유지, 없으면 null)",
  "qualifications": "자격요건/필수요건 섹션 원문 (bullet point 형식 유지, 없으면 null)",
  "preferredQualifications": "우대사항/우대요건 섹션 원문 (bullet point 형식 유지, 없으면 null)",
  "benefits": "복리후생/혜택 섹션 원문 (없으면 null)",
  "requiredSkills": ["필수 스킬 배열", "최대 10개"],
  "preferredSkills": ["우대 스킬 배열", "최대 5개"],
  "minExpYears": 최소 경력 년수 (숫자, 신입이면 0),
  "maxExpYears": 최대 경력 년수 (숫자 또는 null),
  "requiredEducationLevel": "학력 요건 (bachelor/master/doctorate/high_school/associate 또는 빈 문자열). 대졸=bachelor, 초대졸/전문학사=associate, 고졸=high_school",
  "preferredMajors": ["우대 전공 배열"],
  "locationCity": "근무지 (예: 서울 강남)",
  "jobType": "고용 형태 (full-time/contract/freelance/internship). 명시되지 않으면 빈 문자열",
  "salaryMin": 최소 연봉 만원 단위 (숫자 또는 null),
  "salaryMax": 최대 연봉 만원 단위 (숫자 또는 null),
  "deadline": "지원/채용 마감일 (YYYY-MM-DD 형식, 또는 null)"
}

Important:
- description은 JD의 핵심 내용을 담아 최소 3줄 이상 작성. 담당 업무, 역할, 책임, 프로젝트 범위 등을 포함
- responsibilities: "주요업무", "담당업무", "수행업무", "Role", "Responsibilities", "Job Description", "업무 내용" 등의 섹션을 찾아 원문 그대로 추출. bullet point, 번호 매기기 등 원문 형식 보존
- qualifications: "자격요건", "필수요건", "지원자격", "Requirements", "필수 사항", "필요 역량", "자격 조건" 등의 섹션을 찾아 원문 그대로 추출. 각 JD마다 형식이 다를 수 있으므로 유연하게 인식
- preferredQualifications: "우대사항", "우대요건", "Preferred", "우대 사항", "우대 조건", "Plus", "Nice to have" 등의 섹션을 찾아 원문 그대로 추출
- benefits: "복리후생", "혜택", "Benefits", "처우", "근무환경", "지원사항" 등의 섹션이 있으면 원문 그대로 추출, 없으면 null (요약하지 말고 있는 그대로)
- Extract skills as specific technologies/tools (e.g., "Python", "React", "AWS" not "프로그래밍 능력")
- If information is not found, use empty string for strings, empty array for arrays, null for optional numbers
- Education level: 대졸/학사=bachelor, 석사=master, 박사=doctorate, 초대졸/전문학사=associate, 고졸=high_school
- Job type must be one of: full-time, contract, freelance, internship, or empty string if not specified
- For salary, convert to 만원 (10,000 KRW) unit. e.g., 5000만원 → 5000, 50,000,000원 → 5000
- For deadline: 지원기간이 "시작일 ~ 종료일" 형태면 종료일을 마감일로 사용. "제출 기한", "마감일", "접수 마감" 등의 날짜를 찾아 YYYY-MM-DD 형식으로 변환. 예: "2026.01.18" → "2026-01-18", "2026년 1월 18일" → "2026-01-18"
- Parse Korean/English JD equally well
- DO NOT hardcode section names - look for semantic meaning and various expressions`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `다음 JD에서 포지션 정보를 추출해주세요:\n\n${text.slice(0, 15000)}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("GPT 응답을 받지 못했습니다.");
  }

  try {
    const parsed = JSON.parse(content) as ExtractedPosition;

    // 기본값 설정
    return {
      title: parsed.title || "",
      clientCompany: parsed.clientCompany || "",
      department: parsed.department || "",
      description: parsed.description || "",
      responsibilities: parsed.responsibilities || null,
      qualifications: parsed.qualifications || null,
      preferredQualifications: parsed.preferredQualifications || null,
      benefits: parsed.benefits || null,
      requiredSkills: Array.isArray(parsed.requiredSkills) ? parsed.requiredSkills.slice(0, 20) : [],
      preferredSkills: Array.isArray(parsed.preferredSkills) ? parsed.preferredSkills.slice(0, 10) : [],
      minExpYears: typeof parsed.minExpYears === "number" ? parsed.minExpYears : 0,
      maxExpYears: typeof parsed.maxExpYears === "number" ? parsed.maxExpYears : null,
      requiredEducationLevel: parsed.requiredEducationLevel || "",
      preferredMajors: Array.isArray(parsed.preferredMajors) ? parsed.preferredMajors : [],
      locationCity: parsed.locationCity || "",
      jobType: parsed.jobType || "",
      salaryMin: typeof parsed.salaryMin === "number" ? parsed.salaryMin : null,
      salaryMax: typeof parsed.salaryMax === "number" ? parsed.salaryMax : null,
      deadline: parsed.deadline || null,
    };
  } catch {
    console.error("Failed to parse GPT response:", content);
    throw new Error("JD 분석 결과를 파싱하는데 실패했습니다.");
  }
}

/**
 * PDF를 이미지로 변환
 */
async function convertPdfToImages(buffer: Buffer): Promise<string[]> {
  console.log("Converting PDF to images...");

  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const pngPages = await pdfToPng(arrayBuffer, {
    disableFontFace: true,
    useSystemFonts: true,
    viewportScale: 2.0, // 고해상도로 변환
    pagesToProcess: [1, 2, 3, 4, 5], // 최대 5페이지만 처리
  });

  const base64Images: string[] = [];
  for (const page of pngPages) {
    if (page.content) {
      const base64 = page.content.toString("base64");
      base64Images.push(`data:image/png;base64,${base64}`);
    }
  }

  console.log(`Converted ${base64Images.length} pages to images`);
  return base64Images;
}

/**
 * DOCX를 이미지로 변환 (LibreOffice 사용)
 */
async function convertDocxToImages(buffer: Buffer): Promise<string[]> {
  const tempDir = os.tmpdir();
  const timestamp = Date.now();
  const inputPath = path.join(tempDir, `docx_${timestamp}.docx`);
  let pdfPath: string | null = null;

  try {
    // DOCX 파일을 임시 디렉토리에 저장
    fs.writeFileSync(inputPath, buffer);
    console.log(`DOCX saved to: ${inputPath}`);

    // LibreOffice로 PDF 변환 시도 (Windows/Mac: soffice, Linux: libreoffice)
    const commands = [
      `soffice --headless --convert-to pdf --outdir "${tempDir}" "${inputPath}"`,
      `libreoffice --headless --convert-to pdf --outdir "${tempDir}" "${inputPath}"`,
      `"C:\\Program Files\\LibreOffice\\program\\soffice.exe" --headless --convert-to pdf --outdir "${tempDir}" "${inputPath}"`,
    ];

    for (const cmd of commands) {
      try {
        console.log(`Trying command: ${cmd}`);
        await execPromise(cmd, { timeout: 60000 });

        // PDF 파일 경로 확인
        const expectedPdfPath = path.join(tempDir, `docx_${timestamp}.pdf`);
        if (fs.existsSync(expectedPdfPath)) {
          pdfPath = expectedPdfPath;
          console.log(`PDF created at: ${pdfPath}`);
          break;
        }
      } catch (cmdError) {
        console.log(`Command failed: ${cmd}`, cmdError);
        continue;
      }
    }

    if (!pdfPath) {
      console.log("LibreOffice not available or conversion failed");
      return [];
    }

    // PDF를 이미지로 변환
    const pdfBuffer = fs.readFileSync(pdfPath);
    const images = await convertPdfToImages(pdfBuffer);

    return images;
  } catch (error) {
    console.error("DOCX to images conversion failed:", error);
    return [];
  } finally {
    // 임시 파일 정리
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    } catch (cleanupError) {
      console.warn("Temp file cleanup failed:", cleanupError);
    }
  }
}

/**
 * GPT-4 Vision으로 이미지에서 JD 정보 추출 (OCR + 분석)
 */
async function extractPositionFromImages(imageUrls: string[]): Promise<ExtractedPosition> {
  const openai = getOpenAIClient();

  const systemPrompt = `You are a professional HR/recruitment specialist with OCR capabilities.
Analyze the job description (JD) images and extract position information.

Return a JSON object with the following structure:
{
  "title": "직책/포지션명 (예: 시니어 백엔드 개발자)",
  "clientCompany": "채용 회사명 (없으면 빈 문자열)",
  "department": "부서명 (없으면 빈 문자열)",
  "description": "직무 설명 요약 (최소 3줄, 최대 7줄). 담당 업무, 주요 역할, 프로젝트 내용 등 핵심 정보를 포함하여 상세하게 작성",
  "responsibilities": "주요업무/담당업무 섹션 원문 (bullet point 형식 유지, 없으면 null)",
  "qualifications": "자격요건/필수요건 섹션 원문 (bullet point 형식 유지, 없으면 null)",
  "preferredQualifications": "우대사항/우대요건 섹션 원문 (bullet point 형식 유지, 없으면 null)",
  "benefits": "복리후생/혜택 섹션 원문 (없으면 null)",
  "requiredSkills": ["필수 스킬 배열", "최대 10개"],
  "preferredSkills": ["우대 스킬 배열", "최대 5개"],
  "minExpYears": 최소 경력 년수 (숫자, 신입이면 0),
  "maxExpYears": 최대 경력 년수 (숫자 또는 null),
  "requiredEducationLevel": "학력 요건 (bachelor/master/doctorate/high_school/associate 또는 빈 문자열). 대졸=bachelor, 초대졸/전문학사=associate, 고졸=high_school",
  "preferredMajors": ["우대 전공 배열"],
  "locationCity": "근무지 (예: 서울 강남)",
  "jobType": "고용 형태 (full-time/contract/freelance/internship). 명시되지 않으면 빈 문자열",
  "salaryMin": 최소 연봉 만원 단위 (숫자 또는 null),
  "salaryMax": 최대 연봉 만원 단위 (숫자 또는 null),
  "deadline": "지원/채용 마감일 (YYYY-MM-DD 형식, 또는 null)"
}

Important:
- First read and extract all text from the images carefully
- description은 JD의 핵심 내용을 담아 최소 3줄 이상 작성. 담당 업무, 역할, 책임, 프로젝트 범위 등을 포함
- responsibilities: "주요업무", "담당업무", "수행업무", "Role", "Responsibilities", "Job Description", "업무 내용" 등의 섹션을 찾아 원문 그대로 추출. bullet point, 번호 매기기 등 원문 형식 보존
- qualifications: "자격요건", "필수요건", "지원자격", "Requirements", "필수 사항", "필요 역량", "자격 조건" 등의 섹션을 찾아 원문 그대로 추출. 각 JD마다 형식이 다를 수 있으므로 유연하게 인식
- preferredQualifications: "우대사항", "우대요건", "Preferred", "우대 사항", "우대 조건", "Plus", "Nice to have" 등의 섹션을 찾아 원문 그대로 추출
- benefits: "복리후생", "혜택", "Benefits", "처우", "근무환경", "지원사항" 등의 섹션이 있으면 원문 그대로 추출, 없으면 null (요약하지 말고 있는 그대로)
- Extract skills as specific technologies/tools (e.g., "Python", "React", "AWS")
- If information is not found, use empty string for strings, empty array for arrays, null for optional numbers
- Education level: 대졸/학사=bachelor, 석사=master, 박사=doctorate, 초대졸/전문학사=associate, 고졸=high_school
- Job type must be one of: full-time, contract, freelance, internship, or empty string if not specified
- For salary, convert to 만원 (10,000 KRW) unit
- For deadline: 지원기간이 "시작일 ~ 종료일" 형태면 종료일을 마감일로 사용. "제출 기한", "마감일", "접수 마감" 등의 날짜를 찾아 YYYY-MM-DD 형식으로 변환. 예: "2026.01.18" → "2026-01-18", "2026년 1월 18일" → "2026-01-18"
- Parse Korean/English JD equally well
- DO NOT hardcode section names - look for semantic meaning and various expressions`;

  // 이미지들을 content array로 구성
  const imageContents: OpenAI.Chat.Completions.ChatCompletionContentPart[] = imageUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  }));

  console.log(`Sending ${imageUrls.length} images to GPT-4 Vision...`);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "다음 JD 이미지들에서 포지션 정보를 추출해주세요:" },
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

  try {
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
      requiredSkills: Array.isArray(parsed.requiredSkills) ? parsed.requiredSkills.slice(0, 20) : [],
      preferredSkills: Array.isArray(parsed.preferredSkills) ? parsed.preferredSkills.slice(0, 10) : [],
      minExpYears: typeof parsed.minExpYears === "number" ? parsed.minExpYears : 0,
      maxExpYears: typeof parsed.maxExpYears === "number" ? parsed.maxExpYears : null,
      requiredEducationLevel: parsed.requiredEducationLevel || "",
      preferredMajors: Array.isArray(parsed.preferredMajors) ? parsed.preferredMajors : [],
      locationCity: parsed.locationCity || "",
      jobType: parsed.jobType || "",
      salaryMin: typeof parsed.salaryMin === "number" ? parsed.salaryMin : null,
      salaryMax: typeof parsed.salaryMax === "number" ? parsed.salaryMax : null,
      deadline: parsed.deadline || null,
    };
  } catch {
    console.error("Failed to parse GPT Vision response:", content);
    throw new Error("JD 이미지 분석 결과를 파싱하는데 실패했습니다.");
  }
}

export async function POST(request: NextRequest) {
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

    if (!file) {
      return NextResponse.json(
        { success: false, error: "파일이 제공되지 않았습니다." },
        { status: 400 }
      );
    }

    // 파일 크기 검증
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "파일 크기가 5MB를 초과합니다." },
        { status: 400 }
      );
    }

    // 확장자 검증
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

    // 텍스트 추출 시도
    let extractedText: string = "";
    let textExtractionFailed = false;

    try {
      extractedText = await extractTextFromFile(buffer, extension);
    } catch (error) {
      console.error("Text extraction failed:", error);
      textExtractionFailed = true;
    }

    const trimmedTextLength = extractedText.trim().length;
    console.log(`Extracted text length: ${trimmedTextLength}`);

    // 텍스트가 충분히 추출되었으면 텍스트 기반 분석
    // 텍스트가 적거나 없으면 Vision OCR 시도 (PDF만 지원)
    let extractedPosition: ExtractedPosition;
    let usedOcr = false;

    if (trimmedTextLength >= 100) {
      // 텍스트가 충분함 - GPT 텍스트 분석
      console.log(`Extracted text preview: "${extractedText.slice(0, 200)}..."`);

      try {
        extractedPosition = await extractPositionFromText(extractedText);
      } catch (error) {
        console.error("Position extraction error:", error);
        return NextResponse.json(
          {
            success: false,
            error: error instanceof Error ? error.message : "JD 분석에 실패했습니다.",
          },
          { status: 500 }
        );
      }
    } else if (extension === ".pdf") {
      // 텍스트가 부족하고 PDF인 경우 - Vision OCR 시도
      console.log("Text extraction insufficient, trying Vision OCR...");
      usedOcr = true;

      try {
        const imageUrls = await convertPdfToImages(buffer);
        if (imageUrls.length === 0) {
          return NextResponse.json(
            { success: false, error: "PDF를 이미지로 변환하는데 실패했습니다." },
            { status: 400 }
          );
        }

        extractedPosition = await extractPositionFromImages(imageUrls);
      } catch (error) {
        console.error("Vision OCR error:", error);
        return NextResponse.json(
          {
            success: false,
            error: error instanceof Error ? error.message : "이미지 기반 JD 분석에 실패했습니다.",
          },
          { status: 500 }
        );
      }
    } else {
      // DOCX인데 텍스트가 부족한 경우 - Vision OCR 시도
      console.log("DOCX text extraction insufficient, trying Vision OCR...");
      usedOcr = true;

      try {
        const imageUrls = await convertDocxToImages(buffer);

        if (imageUrls.length === 0) {
          // LibreOffice가 없거나 변환 실패 시
          // 텍스트가 조금이라도 있으면 그걸로 시도
          if (trimmedTextLength > 0) {
            console.log("DOCX to image conversion failed, falling back to text analysis...");
            usedOcr = false;
            extractedPosition = await extractPositionFromText(extractedText);
          } else {
            return NextResponse.json(
              {
                success: false,
                error: "DOCX 파일을 분석할 수 없습니다. LibreOffice가 설치되어 있지 않거나 파일 형식이 올바르지 않습니다."
              },
              { status: 400 }
            );
          }
        } else {
          extractedPosition = await extractPositionFromImages(imageUrls);
        }
      } catch (error) {
        console.error("DOCX Vision OCR error:", error);
        return NextResponse.json(
          {
            success: false,
            error: error instanceof Error ? error.message : "DOCX 이미지 기반 분석에 실패했습니다.",
          },
          { status: 500 }
        );
      }
    }

    // 추출 성공
    return NextResponse.json({
      success: true,
      data: extractedPosition,
      meta: {
        fileName: file.name,
        textLength: trimmedTextLength,
        usedOcr,
      },
    });
  } catch (error) {
    console.error("JD extraction error:", error);
    return NextResponse.json(
      { success: false, error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
