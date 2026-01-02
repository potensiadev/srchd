/**
 * OpenAI Embedding Service
 * text-embedding-3-small 모델 사용 (1536 차원)
 */

import OpenAI from "openai";

// OpenAI 클라이언트 (Lazy initialization - 빌드 시 에러 방지)
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

// 임베딩 모델
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSION = 1536;

/**
 * 텍스트를 임베딩 벡터로 변환
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAIClient();

  // 텍스트 전처리: 줄바꿈 정리, 길이 제한
  const cleanText = text
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000); // 토큰 제한 고려

  if (!cleanText) {
    throw new Error("Empty text provided for embedding");
  }

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: cleanText,
      dimensions: EMBEDDING_DIMENSION,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error("Invalid embedding response");
    }

    return embedding;
  } catch (error) {
    console.error("Embedding generation error:", error);
    throw error;
  }
}

/**
 * 여러 텍스트를 배치로 임베딩 생성
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const openai = getOpenAIClient();

  // 텍스트 전처리
  const cleanTexts = texts.map((text) =>
    text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000)
  );

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: cleanTexts,
      dimensions: EMBEDDING_DIMENSION,
    });

    return response.data.map((item: { embedding: number[] }) => item.embedding);
  } catch (error) {
    console.error("Batch embedding generation error:", error);
    throw error;
  }
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSION };
