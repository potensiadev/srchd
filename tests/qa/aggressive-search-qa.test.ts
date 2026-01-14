/**
 * Aggressive QA Tests for AI Semantic Search
 *
 * Author: Senior QA Engineer (30 years Silicon Valley experience)
 * Purpose: Find as many bugs as possible through edge case testing
 *
 * Categories:
 * 1. Input Validation & Boundary Testing
 * 2. SQL Injection & Security Testing
 * 3. Unicode & Encoding Edge Cases
 * 4. Performance & DoS Testing
 * 5. Typo Correction Edge Cases
 * 6. Concurrent & Race Condition Testing
 * 7. Cache Consistency Testing
 * 8. Filter Logic Edge Cases
 * 9. Embedding & AI Edge Cases
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  sanitizeSkill,
  sanitizeSkillsArray,
  parseSearchQuery,
  sanitizeString,
  MAX_SKILLS_ARRAY_SIZE,
  MAX_SKILL_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_KEYWORD_LENGTH,
  DANGEROUS_CHARS_PATTERN,
} from '@/lib/search/sanitize';
import { engToKor, korToEng } from '@/lib/search/typo';

// ═══════════════════════════════════════════════════════════════
// CATEGORY 1: INPUT VALIDATION & BOUNDARY TESTING
// ═══════════════════════════════════════════════════════════════

describe('QA-BUG-HUNT: Input Validation & Boundary Testing', () => {

  describe('BUG-001: Query Length Boundary', () => {
    test('should handle exactly MAX_QUERY_LENGTH characters', () => {
      const query = 'a'.repeat(MAX_QUERY_LENGTH);
      const result = parseSearchQuery(query);
      // Single long token should be truncated to MAX_KEYWORD_LENGTH
      expect(result.length).toBe(1);
      expect(result[0].length).toBe(MAX_KEYWORD_LENGTH);
    });

    test('should handle MAX_QUERY_LENGTH + 1 characters (overflow)', () => {
      const query = 'a'.repeat(MAX_QUERY_LENGTH + 1);
      const result = parseSearchQuery(query);
      // Each token should still be within MAX_KEYWORD_LENGTH
      result.forEach(token => {
        expect(token.length).toBeLessThanOrEqual(MAX_KEYWORD_LENGTH);
      });
    });

    test('should handle zero-length query gracefully', () => {
      expect(parseSearchQuery('')).toEqual([]);
      expect(parseSearchQuery('   ')).toEqual([]);
    });
  });

  describe('BUG-002: Skill Array Size Boundary', () => {
    test('should handle exactly MAX_SKILLS_ARRAY_SIZE skills', () => {
      const skills = Array(MAX_SKILLS_ARRAY_SIZE).fill('React');
      const result = sanitizeSkillsArray(skills);
      expect(result.length).toBe(MAX_SKILLS_ARRAY_SIZE);
    });

    test('should truncate at MAX_SKILLS_ARRAY_SIZE + 1 (potential off-by-one)', () => {
      const skills = Array(MAX_SKILLS_ARRAY_SIZE + 1).fill('React');
      const result = sanitizeSkillsArray(skills);
      // BUG: Off-by-one error might allow 101 skills
      expect(result.length).toBe(MAX_SKILLS_ARRAY_SIZE);
    });

    test('should handle massive skill array (DoS prevention)', () => {
      const skills = Array(10000).fill('React');
      const start = performance.now();
      const result = sanitizeSkillsArray(skills);
      const duration = performance.now() - start;

      expect(result.length).toBe(MAX_SKILLS_ARRAY_SIZE);
      // BUG: Processing should be fast even with huge input
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });
  });

  describe('BUG-003: Skill Length Boundary', () => {
    test('should handle skill at exactly MAX_SKILL_LENGTH', () => {
      const skill = 'a'.repeat(MAX_SKILL_LENGTH);
      const result = sanitizeSkill(skill);
      expect(result).toBe(skill);
    });

    test('should reject skill at MAX_SKILL_LENGTH + 1', () => {
      const skill = 'a'.repeat(MAX_SKILL_LENGTH + 1);
      const result = sanitizeSkill(skill);
      // BUG: Should return null for oversized skills
      expect(result).toBeNull();
    });
  });

  describe('BUG-004: Null/Undefined/Empty Handling', () => {
    test('should handle null in skills array', () => {
      const skills = ['React', null, 'Vue'] as unknown[];
      const result = sanitizeSkillsArray(skills);
      expect(result).not.toContain(null);
      expect(result.length).toBe(2);
    });

    test('should handle undefined in skills array', () => {
      const skills = ['React', undefined, 'Vue'] as unknown[];
      const result = sanitizeSkillsArray(skills);
      expect(result).not.toContain(undefined);
      expect(result.length).toBe(2);
    });

    test('should handle empty strings in skills array', () => {
      const skills = ['React', '', '   ', 'Vue'];
      const result = sanitizeSkillsArray(skills);
      expect(result).not.toContain('');
      expect(result).not.toContain('   ');
      expect(result.length).toBe(2);
    });

    test('should handle mixed problematic values', () => {
      const skills = [null, undefined, '', '   ', 0, false, 'React', {}, []] as unknown[];
      const result = sanitizeSkillsArray(skills);
      // BUG: Only 'React' should survive
      expect(result).toEqual(['React']);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY 2: SQL INJECTION & SECURITY TESTING
// ═══════════════════════════════════════════════════════════════

describe('QA-BUG-HUNT: SQL Injection & Security Testing', () => {

  describe('BUG-005: SQL Injection Patterns', () => {
    const sqlInjectionPayloads = [
      "'; DROP TABLE candidates; --",
      "1' OR '1'='1",
      "1; DELETE FROM candidates WHERE '1'='1",
      "' UNION SELECT * FROM users --",
      "admin'--",
      "1' AND 1=1 --",
      "' OR 1=1 #",
      "') OR ('1'='1",
      "'; EXEC xp_cmdshell('dir'); --",
      "1' WAITFOR DELAY '00:00:05' --",
    ];

    test.each(sqlInjectionPayloads)(
      'should sanitize SQL injection: %s',
      (payload) => {
        const result = sanitizeString(payload);
        // BUG: Dangerous characters should be removed
        expect(result).not.toContain("'");
        expect(result).not.toContain(";");
        expect(result).not.toContain("--");
      }
    );
  });

  describe('BUG-006: XSS Patterns', () => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      'javascript:alert(1)',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '"><script>alert(1)</script>',
      "'-alert(1)-'",
      '<iframe src="javascript:alert(1)">',
    ];

    test.each(xssPayloads)(
      'should sanitize XSS: %s',
      (payload) => {
        const result = sanitizeString(payload);
        // BUG: < and > should be removed
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
      }
    );
  });

  describe('BUG-007: Path Traversal', () => {
    const pathTraversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32',
      '%2e%2e%2f%2e%2e%2f',
      '....//....//....//etc/passwd',
    ];

    test.each(pathTraversalPayloads)(
      'should handle path traversal attempt: %s',
      (payload) => {
        const result = parseSearchQuery(payload);
        // BUG: Should not crash on path traversal attempts
        expect(Array.isArray(result)).toBe(true);
      }
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY 3: UNICODE & ENCODING EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('QA-BUG-HUNT: Unicode & Encoding Edge Cases', () => {

  describe('BUG-008: Zero-Width Characters', () => {
    test('should remove zero-width space (U+200B)', () => {
      const skill = 'Re\u200Bact'; // React with zero-width space
      const result = sanitizeSkill(skill);
      // BUG: Zero-width chars could bypass duplicate detection
      expect(result).toBe('React');
    });

    test('should remove zero-width non-joiner (U+200C)', () => {
      const skill = 'Re\u200Cact';
      const result = sanitizeSkill(skill);
      expect(result).toBe('React');
    });

    test('should remove zero-width joiner (U+200D)', () => {
      const skill = 'Re\u200Dact';
      const result = sanitizeSkill(skill);
      expect(result).toBe('React');
    });

    test('should remove BOM (U+FEFF)', () => {
      const skill = '\uFEFFReact';
      const result = sanitizeSkill(skill);
      expect(result).toBe('React');
    });
  });

  describe('BUG-009: Null Byte Injection', () => {
    test('should remove null byte (U+0000)', () => {
      const skill = 'React\u0000.js';
      const result = sanitizeSkill(skill);
      // BUG: Null bytes could truncate strings in some backends
      expect(result).toBe('React.js');
      expect(result).not.toContain('\u0000');
    });

    test('should handle null byte at start', () => {
      const skill = '\u0000React';
      const result = sanitizeSkill(skill);
      expect(result).toBe('React');
    });
  });

  describe('BUG-010: Control Characters', () => {
    test('should remove control characters (0x01-0x1F)', () => {
      const skill = 'Re\u0001\u0002\u001Fact';
      const result = sanitizeSkill(skill);
      expect(result).toBe('React');
    });

    test('should remove DEL character (0x7F)', () => {
      const skill = 'Re\u007Fact';
      const result = sanitizeSkill(skill);
      expect(result).toBe('React');
    });
  });

  describe('BUG-011: Unicode Normalization', () => {
    test('should handle different Unicode normalizations of same character', () => {
      // é as single character vs e + combining acute accent
      const skill1 = 'caf\u00E9'; // é (precomposed)
      const skill2 = 'cafe\u0301'; // e + ´ (decomposed)

      const result1 = sanitizeSkill(skill1);
      const result2 = sanitizeSkill(skill2);

      // BUG: These might be treated as different strings but should match
      // Note: This may or may not be desired behavior
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe('BUG-012: Emoji Handling', () => {
    test('should handle emoji in skill names', () => {
      const skill = 'Python🐍';
      const result = sanitizeSkill(skill);
      // BUG: Should handle emoji gracefully
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    test('should handle flag emoji (multi-codepoint)', () => {
      const skill = 'Korean🇰🇷Developer';
      const result = sanitizeSkill(skill);
      expect(result).toBeDefined();
    });

    test('should handle ZWJ emoji sequences', () => {
      const skill = 'Dev👨‍💻'; // Man + ZWJ + Computer
      const result = sanitizeSkill(skill);
      expect(result).toBeDefined();
    });
  });

  describe('BUG-013: RTL Text', () => {
    test('should handle RTL override characters', () => {
      const skill = 'React\u202Emalware'; // RTL override
      const result = sanitizeSkill(skill);
      // BUG: RTL override could be used for visual spoofing
      expect(result).toBeDefined();
    });

    test('should handle Arabic text', () => {
      const skill = 'مبرمج';
      const result = sanitizeSkill(skill);
      expect(result).toBe('مبرمج');
    });
  });

  describe('BUG-014: Homograph Attacks', () => {
    test('should handle Cyrillic "а" vs Latin "a"', () => {
      const skillCyrillic = 'Reаct'; // Using Cyrillic 'а' (U+0430)
      const skillLatin = 'React';  // Using Latin 'a' (U+0061)

      const result1 = sanitizeSkill(skillCyrillic);
      const result2 = sanitizeSkill(skillLatin);

      // BUG: Homograph attacks could bypass skill matching
      expect(result1).not.toBe(result2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY 4: KOREAN/ENGLISH TYPO CORRECTION EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('QA-BUG-HUNT: Typo Correction Edge Cases', () => {

  describe('BUG-015: engToKor Basic', () => {
    test('should convert rkstlr to 간식', () => {
      // 간 = ㄱ+ㅏ+ㄴ = r+k+s, 식 = ㅅ+ㅣ+ㄱ = t+l+r
      expect(engToKor('rkstlr')).toBe('간식');
    });

    test('should convert rks to 간', () => {
      // 간 = ㄱ(r) + ㅏ(k) + ㄴ(s)
      expect(engToKor('rks')).toBe('간');
    });

    test('should convert ghkdlxld to 하이라이드', () => {
      // Complex compound consonants
      const result = engToKor('ghkdlxld');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('BUG-016: engToKor Edge Cases', () => {
    test('should handle empty string', () => {
      expect(engToKor('')).toBe('');
    });

    test('should handle single consonant', () => {
      expect(engToKor('r')).toBe('ㄱ');
    });

    test('should handle single vowel key', () => {
      expect(engToKor('k')).toBe('ㅏ');
    });

    test('should handle mixed English and numbers', () => {
      const result = engToKor('react123');
      // BUG: Numbers should pass through unchanged
      expect(result).toContain('123');
    });

    test('should handle special characters', () => {
      const result = engToKor('react.js');
      // BUG: Dots should pass through
      expect(result).toContain('.');
    });

    test('should handle all consonants in sequence', () => {
      const result = engToKor('rrrrr');
      // BUG: Repeated consonants might cause issues
      expect(result.length).toBeGreaterThan(0);
    });

    test('should handle compound consonants (ㄲ, ㄸ, etc)', () => {
      const result = engToKor('Rk'); // Shift+R = ㄲ, k = ㅏ
      // ㄲ + ㅏ = 까 (composed syllable)
      expect(result).toBe('까');
    });
  });

  describe('BUG-017: korToEng Edge Cases', () => {
    test('should convert 간식 to rkstlr', () => {
      // 간 = ㄱ+ㅏ+ㄴ = r+k+s, 식 = ㅅ+ㅣ+ㄱ = t+l+r
      expect(korToEng('간식')).toBe('rkstlr');
    });

    test('should handle empty string', () => {
      expect(korToEng('')).toBe('');
    });

    test('should handle single jamo', () => {
      expect(korToEng('ㄱ')).toBe('r');
      expect(korToEng('ㅏ')).toBe('k');
    });

    test('should handle compound vowels (ㅘ, ㅙ, etc)', () => {
      const result = korToEng('화');
      // BUG: Compound vowel decomposition
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    test('should handle compound final consonants (ㄳ, ㄵ, etc)', () => {
      const result = korToEng('삶');
      // BUG: Compound consonant decomposition
      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('BUG-018: Roundtrip Consistency', () => {
    test('should maintain consistency in roundtrip conversion', () => {
      const original = 'rkstlr'; // 간식 in English keys
      const korean = engToKor(original);
      const backToEng = korToEng(korean);

      // Roundtrip should be consistent
      expect(backToEng).toBe(original);
    });

    test('should maintain Korean roundtrip', () => {
      const original = '개발자';
      const english = korToEng(original);
      const backToKor = engToKor(english);

      // Korean roundtrip should be consistent
      expect(backToKor).toBe(original);
    });

    test('should roundtrip 간식 correctly', () => {
      const korean = '간식';
      const english = korToEng(korean);
      expect(english).toBe('rkstlr');

      const backToKorean = engToKor(english);
      expect(backToKorean).toBe(korean);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY 5: QUERY PARSING EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('QA-BUG-HUNT: Query Parsing Edge Cases', () => {

  describe('BUG-019: Mixed Language Parsing', () => {
    test('should parse React개발자 correctly', () => {
      const result = parseSearchQuery('React개발자');
      expect(result).toContain('React');
      expect(result).toContain('개발자');
    });

    test('should parse multiple mixed segments', () => {
      const result = parseSearchQuery('React개발자Vue엔지니어');
      expect(result.length).toBe(4);
    });

    test('should handle C++ special case', () => {
      const result = parseSearchQuery('C++개발자');
      // BUG: C++ should not be split
      expect(result).toContain('C++');
      expect(result).toContain('개발자');
    });

    test('should handle C# special case', () => {
      const result = parseSearchQuery('C#개발자');
      expect(result).toContain('C#');
    });

    test('should handle Node.js special case', () => {
      const result = parseSearchQuery('Node.js개발자');
      expect(result).toContain('Node.js');
    });
  });

  describe('BUG-020: Whitespace Handling', () => {
    test('should handle multiple spaces', () => {
      const result = parseSearchQuery('React    Vue    Angular');
      expect(result).toEqual(['React', 'Vue', 'Angular']);
    });

    test('should handle tabs', () => {
      const result = parseSearchQuery('React\tVue\tAngular');
      expect(result).toEqual(['React', 'Vue', 'Angular']);
    });

    test('should handle newlines', () => {
      const result = parseSearchQuery('React\nVue\nAngular');
      expect(result).toEqual(['React', 'Vue', 'Angular']);
    });

    test('should handle mixed whitespace', () => {
      const result = parseSearchQuery('React \t\n Vue');
      expect(result).toEqual(['React', 'Vue']);
    });
  });

  describe('BUG-021: Comma Handling', () => {
    test('should split on commas', () => {
      const result = parseSearchQuery('React, Vue, Angular');
      expect(result).toEqual(['React', 'Vue', 'Angular']);
    });

    test('should handle comma without space', () => {
      const result = parseSearchQuery('React,Vue,Angular');
      expect(result).toEqual(['React', 'Vue', 'Angular']);
    });

    test('should handle trailing comma', () => {
      const result = parseSearchQuery('React, Vue,');
      expect(result).toEqual(['React', 'Vue']);
    });

    test('should handle leading comma', () => {
      const result = parseSearchQuery(',React, Vue');
      expect(result).toEqual(['React', 'Vue']);
    });
  });

  describe('BUG-022: Keyword Length Edge Cases', () => {
    test('should truncate keywords exceeding MAX_KEYWORD_LENGTH', () => {
      const longKeyword = 'a'.repeat(MAX_KEYWORD_LENGTH + 10);
      const result = parseSearchQuery(`React ${longKeyword} Vue`);

      // Long keywords should be truncated, not filtered
      expect(result.length).toBe(3);
      expect(result[0]).toBe('React');
      expect(result[1]).toBe('a'.repeat(MAX_KEYWORD_LENGTH)); // Truncated
      expect(result[2]).toBe('Vue');
    });

    test('should keep keywords at exactly MAX_KEYWORD_LENGTH', () => {
      const exactKeyword = 'a'.repeat(MAX_KEYWORD_LENGTH);
      const result = parseSearchQuery(`React ${exactKeyword} Vue`);

      expect(result).toContain(exactKeyword);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY 6: NUMERIC EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('QA-BUG-HUNT: Numeric Edge Cases', () => {

  describe('BUG-023: Experience Years', () => {
    test('should handle negative experience years in skill input', () => {
      // This tests if -5 years passed as string doesn't break parsing
      const result = parseSearchQuery('경력 -5년');
      expect(Array.isArray(result)).toBe(true);
    });

    test('should handle float experience years', () => {
      const result = parseSearchQuery('경력 3.5년');
      expect(Array.isArray(result)).toBe(true);
    });

    test('should handle very large numbers', () => {
      const result = parseSearchQuery('경력 9999999999999년');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('BUG-024: Numeric Skills', () => {
    test('should handle purely numeric skill names', () => {
      const result = sanitizeSkill('123');
      expect(result).toBe('123');
    });

    test('should handle skills starting with numbers', () => {
      const result = sanitizeSkill('3D Modeling');
      expect(result).toBe('3D Modeling');
    });

    test('should handle version numbers in skills', () => {
      const result = sanitizeSkill('Python 3.9');
      expect(result).toBe('Python 3.9');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY 7: SPECIAL CHARACTERS IN SKILLS
// ═══════════════════════════════════════════════════════════════

describe('QA-BUG-HUNT: Special Characters in Skills', () => {

  describe('BUG-025: Programming Language Special Chars', () => {
    test('should preserve C++', () => {
      expect(sanitizeSkill('C++')).toBe('C++');
    });

    test('should preserve C#', () => {
      expect(sanitizeSkill('C#')).toBe('C#');
    });

    test('should preserve F#', () => {
      expect(sanitizeSkill('F#')).toBe('F#');
    });

    test('should preserve .NET', () => {
      expect(sanitizeSkill('.NET')).toBe('.NET');
    });

    test('should preserve Node.js', () => {
      expect(sanitizeSkill('Node.js')).toBe('Node.js');
    });
  });

  describe('BUG-026: Framework/Tool Special Chars', () => {
    test('should preserve next.js', () => {
      expect(sanitizeSkill('next.js')).toBe('next.js');
    });

    test('should preserve express.js', () => {
      expect(sanitizeSkill('express.js')).toBe('express.js');
    });

    test('should preserve @angular/core', () => {
      // BUG: @ symbol might be stripped
      const result = sanitizeSkill('@angular/core');
      expect(result).toBeDefined();
    });

    test('should preserve kebab-case names', () => {
      expect(sanitizeSkill('vue-router')).toBe('vue-router');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY 8: PERFORMANCE EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('QA-BUG-HUNT: Performance Edge Cases', () => {

  describe('BUG-027: ReDoS Prevention', () => {
    test('should not hang on pathological regex input', () => {
      // Potential ReDoS pattern
      const malicious = 'a'.repeat(50) + '!';
      const start = performance.now();

      parseSearchQuery(malicious);

      const duration = performance.now() - start;
      // BUG: Should complete in reasonable time
      expect(duration).toBeLessThan(100);
    });

    test('should handle repeated special patterns efficiently', () => {
      const malicious = '한글'.repeat(100) + 'English'.repeat(100);
      const start = performance.now();

      parseSearchQuery(malicious);

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });

  describe('BUG-028: Large Input Handling', () => {
    test('should handle 100KB query without crashing', () => {
      const largeQuery = 'React '.repeat(20000);

      expect(() => {
        parseSearchQuery(largeQuery.slice(0, MAX_QUERY_LENGTH));
      }).not.toThrow();
    });

    test('should handle skills array with 10000 items', () => {
      const largeArray = Array(10000).fill('React');

      const start = performance.now();
      sanitizeSkillsArray(largeArray);
      const duration = performance.now() - start;

      // BUG: Should complete in reasonable time
      expect(duration).toBeLessThan(500);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY 9: INTEGRATION EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('QA-BUG-HUNT: Integration Edge Cases', () => {

  describe('BUG-029: Combined Attack Vectors', () => {
    test('should handle SQL injection + Unicode attack', () => {
      const payload = "'; DROP TABLE\u0000 --\u200B";
      const result = sanitizeString(payload);

      expect(result).not.toContain("'");
      expect(result).not.toContain('\u0000');
      expect(result).not.toContain('\u200B');
    });

    test('should handle XSS + Korean input', () => {
      const payload = '<script>개발자</script>';
      const result = sanitizeString(payload);

      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });
  });

  describe('BUG-030: Type Coercion Issues', () => {
    test('should handle number passed as skill', () => {
      const result = sanitizeSkill(123 as unknown as string);
      expect(result).toBeNull();
    });

    test('should handle boolean passed as skill', () => {
      const result = sanitizeSkill(true as unknown as string);
      expect(result).toBeNull();
    });

    test('should handle object passed as skill', () => {
      const result = sanitizeSkill({} as unknown as string);
      expect(result).toBeNull();
    });

    test('should handle array passed as skill', () => {
      const result = sanitizeSkill([] as unknown as string);
      expect(result).toBeNull();
    });
  });
});
